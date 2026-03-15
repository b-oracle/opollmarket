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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { trader_user_id, market_id, option_id, side, amount, price, shares, trade_type } = await req.json();

    if (!trader_user_id || !trade_type) {
      return new Response(JSON.stringify({ error: "Missing params" }), {
        status: 400, headers: corsHeaders,
      });
    }

    const copyField = trade_type === "quick_trade" ? "copy_quick_trades" : "copy_predictions";

    // Get ALL copiers who have the relevant copy field enabled (both auto and manual)
    const { data: copiers, error: copierErr } = await supabase
      .from("copy_settings")
      .select("user_id, max_amount, auto_copy")
      .eq("target_user_id", trader_user_id)
      .eq(copyField, true);

    if (copierErr || !copiers || copiers.length === 0) {
      return new Response(JSON.stringify({ copied: 0, queued: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get trader name + market title
    const { data: traderProfile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", trader_user_id)
      .single();
    const traderName = traderProfile?.display_name || "A trader";

    let marketTitle = "";
    if (market_id) {
      const { data: market } = await supabase
        .from("markets")
        .select("title")
        .eq("id", market_id)
        .single();
      marketTitle = market?.title || "";
    }

    // Get commission settings for auto-copy execution
    const { data: commData } = await supabase
      .from("commission_settings")
      .select("admin_fee_percent, creator_fee_percent, creator_fee_blue_percent, creator_fee_gold_percent, referrer_commission_percent, bc400_pool_percent, copy_trade_commission_percent")
      .limit(1)
      .single();

    let copiedCount = 0;
    let queuedCount = 0;

    for (const copier of copiers) {
      try {
        const maxAmount = Number(copier.max_amount || 10);
        const copyAmount = Math.min(amount, maxAmount);
        if (copyAmount <= 0) continue;

        const copyShares = shares ? (copyAmount / amount) * shares : null;
        const tradeDesc = trade_type === "quick_trade"
          ? `$${copyAmount.toFixed(2)} on ${(side || "").toUpperCase()} in Quick Trade`
          : `$${copyAmount.toFixed(2)} on ${(side || "").toUpperCase()}${marketTitle ? ` — "${marketTitle}"` : ""}`;

        if (copier.auto_copy) {
          // ── AUTO-COPY: Execute immediately ──
          const { data: bal } = await supabase
            .from("balances")
            .select("amount")
            .eq("user_id", copier.user_id)
            .eq("currency", "USDT")
            .single();

          const balance = Number(bal?.amount || 0);

          if (balance < copyAmount) {
            await supabase.from("notifications").insert({
              user_id: copier.user_id,
              title: "Copy Trade Failed 💸",
              message: `Insufficient balance to auto-copy trade ($${copyAmount.toFixed(2)} needed).`,
              type: "info",
              market_id: market_id || null,
            });
            continue;
          }

          if (trade_type === "prediction" && market_id && side) {
            const adminFeeRate = Number(commData?.admin_fee_percent ?? 2) / 100;
            const referrerRate = Number(commData?.referrer_commission_percent ?? 0) / 100;
            const bc400Rate = Number((commData as any)?.bc400_pool_percent ?? 0) / 100;
            // Creator fee would need a lookup but for copy trades we use the base (unverified) rate
            const creatorRate = Number(commData?.creator_fee_percent ?? 3) / 100;
            const totalFeeRate = adminFeeRate + creatorRate + referrerRate + bc400Rate;
            const totalFee = copyAmount * totalFeeRate;
            const tradePrice = price || 50;
            const finalShares = copyShares || Math.max(0.01, Number(((copyAmount - totalFee) / (tradePrice / 100)).toFixed(2)));

            // Deduct balance
            await supabase
              .from("balances")
              .update({ amount: balance - copyAmount, updated_at: new Date().toISOString() })
              .eq("user_id", copier.user_id)
              .eq("currency", "USDT");

            // Create position
            await supabase.from("positions").insert({
              user_id: copier.user_id,
              market_id,
              option_id: option_id || null,
              side,
              shares: finalShares,
              avg_price: tradePrice / 100,
            });

            await supabase.from("transactions").insert({
              user_id: copier.user_id,
              type: "buy",
              amount: copyAmount,
              market_id,
              option_id: option_id || null,
              side,
              shares: finalShares,
              price: tradePrice / 100,
              status: "confirmed",
              is_copy_trade: true,
            });

            // Record copy trade earning entry
            const copyTradeCommissionPercent = Number(commData?.copy_trade_commission_percent ?? 10);
            await supabase.from("copy_trade_earnings").insert({
              trader_user_id,
              copier_user_id: copier.user_id,
              market_id,
              trade_type,
              copier_profit: 0,
              commission_percent: copyTradeCommissionPercent,
              commission_amount: 0,
            });
          }

          // Notify (confirmation, not approval needed)
          await supabase.from("notifications").insert({
            user_id: copier.user_id,
            title: "Trade Auto-Copied! 📋",
            message: `${traderName}'s trade was auto-copied: ${tradeDesc}`,
            type: "info",
            market_id: market_id || null,
          });

          copiedCount++;
        } else {
          // ── MANUAL: Queue for approval ──
          await supabase.from("pending_copy_trades").insert({
            user_id: copier.user_id,
            trader_user_id,
            trade_type,
            market_id: market_id || null,
            option_id: option_id || null,
            side: side || null,
            amount: copyAmount,
            price: price || null,
            shares: copyShares ? Math.max(0.01, Number(copyShares.toFixed(2))) : null,
            status: "pending",
          });

          await supabase.from("notifications").insert({
            user_id: copier.user_id,
            title: "Copy Trade Pending ⏳",
            message: `${traderName} placed a trade: ${tradeDesc}. Approve within 2 min or it expires.`,
            type: "copy_trade",
            market_id: market_id || null,
          });

          queuedCount++;
        }
      } catch (err) {
        console.error(`Copy trade failed for user ${copier.user_id}:`, err);
      }
    }

    return new Response(JSON.stringify({ copied: copiedCount, queued: queuedCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("copy-trade error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: corsHeaders,
    });
  }
});
