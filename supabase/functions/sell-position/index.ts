import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: corsHeaders,
      });
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: corsHeaders,
      });
    }

    const userId = user.id;
    const { positionId } = await req.json();

    if (!positionId) {
      return new Response(JSON.stringify({ error: "Missing positionId" }), {
        status: 400, headers: corsHeaders,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 2. Fetch position and verify ownership
    const { data: position, error: posError } = await supabase
      .from("positions")
      .select("id, user_id, market_id, option_id, side, shares, avg_price")
      .eq("id", positionId)
      .single();

    if (posError || !position) {
      return new Response(JSON.stringify({ error: "Position not found" }), {
        status: 404, headers: corsHeaders,
      });
    }

    if (position.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Not your position" }), {
        status: 403, headers: corsHeaders,
      });
    }

    if (Number(position.shares) <= 0) {
      return new Response(JSON.stringify({ error: "Position already closed" }), {
        status: 400, headers: corsHeaders,
      });
    }

    // 3. Fetch market
    const { data: market, error: mktError } = await supabase
      .from("markets")
      .select("id, status, yes_price, no_price, volume, liquidity, market_type, end_date")
      .eq("id", position.market_id)
      .single();

    if (mktError || !market) {
      return new Response(JSON.stringify({ error: "Market not found" }), {
        status: 404, headers: corsHeaders,
      });
    }

    if (market.status !== "active") {
      return new Response(JSON.stringify({ error: "Market is not active" }), {
        status: 400, headers: corsHeaders,
      });
    }

    // Lock selling within the final hour before market close
    const SELL_LOCK_MS = 60 * 60 * 1000;
    if (market.end_date) {
      const msToEnd = new Date(market.end_date).getTime() - Date.now();
      if (msToEnd > 0 && msToEnd <= SELL_LOCK_MS) {
        return new Response(
          JSON.stringify({ error: "Selling is locked within the final hour before market close. Hold until resolution." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }


    const isMulti = market.market_type === "multi" || market.market_type === "range";

    // 4. Determine current price
    let currentPrice: number;
    if (isMulti && position.option_id) {
      const { data: opt } = await supabase
        .from("market_options")
        .select("price")
        .eq("id", position.option_id)
        .single();
      currentPrice = Number(opt?.price ?? position.avg_price);
    } else {
      currentPrice = position.side === "yes"
        ? Number(market.yes_price)
        : Number(market.no_price);
    }

    const shares = Number(position.shares);
    const grossProceeds = shares * currentPrice;

    // 5. Fetch exit fee
    const { data: commData } = await supabase
      .from("commission_settings")
      .select("exit_fee_percent")
      .limit(1)
      .single();

    const exitFeePercent = Number(commData?.exit_fee_percent ?? 5) / 100;
    const exitFee = Math.round(grossProceeds * exitFeePercent * 100) / 100;
    const netProceeds = Math.round((grossProceeds - exitFee) * 100) / 100;

    // Guard: prevent selling for zero or negative proceeds
    if (netProceeds <= 0) {
      return new Response(JSON.stringify({ error: "Position value too low to sell after fees" }), {
        status: 400, headers: corsHeaders,
      });
    }

    // 6. Zero out position shares — verify it actually took effect
    const { data: updatedRows, error: updatePosError } = await supabase
      .from("positions")
      .update({ shares: 0, updated_at: new Date().toISOString() })
      .eq("id", positionId)
      .eq("user_id", userId)
      .gt("shares", 0)
      .select("id, shares");

    if (updatePosError) {
      console.error("Position update error:", updatePosError);
      return new Response(JSON.stringify({ error: "Failed to close position" }), {
        status: 500, headers: corsHeaders,
      });
    }

    // Verify the update actually modified the row
    if (!updatedRows || updatedRows.length === 0) {
      console.error("Position update matched 0 rows — possible race condition", { positionId, userId });
      return new Response(JSON.stringify({ error: "Position already closed or update failed" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Double-check shares are actually 0
    const { data: verifyPos } = await supabase
      .from("positions")
      .select("shares")
      .eq("id", positionId)
      .single();

    if (verifyPos && Number(verifyPos.shares) !== 0) {
      console.error("Position shares not zeroed after update!", { positionId, shares: verifyPos.shares });
      return new Response(JSON.stringify({ error: "Position close verification failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 7. Credit user balance (net proceeds to main)
    const { error: balanceError } = await supabase.rpc("adjust_balance", {
      _user_id: userId,
      _delta: netProceeds,
      _bonus_delta: 0,
    });

    if (balanceError) {
      console.error("CRITICAL: adjust_balance failed after position close:", balanceError, { userId, netProceeds, positionId });
    }

    // 8. Credit exit fee to platform pool
    if (exitFee > 0) {
      await supabase.rpc("adjust_platform_pool", { _delta: exitFee });
    }

    // 9. Update market volume & liquidity
    // 9. Atomic market volume, liquidity & AMM price update (prevents race conditions)
    const { data: priceResult } = await supabase.rpc("sell_update_market_prices", {
      _market_id: market.id,
      _side: position.side,
      _gross_proceeds: grossProceeds,
      _net_proceeds: netProceeds,
      _is_multi: isMulti,
    });

    const newYesPrice = priceResult?.yes_price;
    const newNoPrice = priceResult?.no_price;

    // Multi/range: rebalance option prices
    if (isMulti && position.option_id) {
      const { data: allOptions } = await supabase
        .from("market_options")
        .select("id, price")
        .eq("market_id", market.id);

      if (allOptions && allOptions.length > 0) {
        const totalLiq = Number(market.volume) + Number(market.liquidity) + 100;
        const impact = Math.min(grossProceeds / totalLiq, 0.15);
        const selectedOpt = allOptions.find((o: any) => o.id === position.option_id);

        if (selectedOpt) {
          const newSelectedPrice = Math.max(0.01, Number(selectedOpt.price) - impact);

          await supabase.from("market_options")
            .update({ price: Math.round(newSelectedPrice * 100) / 100 })
            .eq("id", position.option_id);

          const othersTotal = allOptions
            .filter((o: any) => o.id !== position.option_id)
            .reduce((sum: number, o: any) => sum + Number(o.price), 0);

          if (othersTotal > 0) {
            const remaining = Math.max(0.01, 1 - newSelectedPrice);
            const scaleFactor = remaining / othersTotal;
            for (const opt of allOptions.filter((o: any) => o.id !== position.option_id)) {
              const newPrice = Math.max(0.01, Math.round(Number(opt.price) * scaleFactor * 100) / 100);
              await supabase.from("market_options").update({ price: newPrice }).eq("id", opt.id);
            }
          }
        }
      }
    }

    // 11. Insert sell transaction
    await supabase.from("transactions").insert({
      user_id: userId,
      market_id: market.id,
      type: "sell",
      side: position.side,
      amount: netProceeds,
      price: currentPrice,
      shares: shares,
      status: "confirmed",
      option_id: position.option_id || null,
    });

    // 12. Trigger limit order matching after price change
    try {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/match-limit-orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ market_id: market.id }),
      });
    } catch {
      // Non-critical — don't block the sell response
    }

    return new Response(
      JSON.stringify({
        success: true,
        netProceeds,
        exitFee,
        grossProceeds,
        newYesPrice: newYesPrice,
        newNoPrice: newNoPrice,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("sell-position error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
