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

    // Find followers with auto_copy enabled for this trader
    const copyField = trade_type === "quick_trade" ? "copy_quick_trades" : "copy_predictions";

    const { data: copiers, error: copierErr } = await supabase
      .from("copy_settings")
      .select("user_id, max_amount")
      .eq("target_user_id", trader_user_id)
      .eq("auto_copy", true)
      .eq(copyField, true);

    if (copierErr || !copiers || copiers.length === 0) {
      return new Response(JSON.stringify({ copied: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let copiedCount = 0;

    for (const copier of copiers) {
      try {
        // Check copier balance
        const { data: bal } = await supabase
          .from("balances")
          .select("amount")
          .eq("user_id", copier.user_id)
          .eq("currency", "USDT")
          .single();

        const balance = Number(bal?.amount || 0);
        const maxAmount = Number(copier.max_amount || 10);
        const copyAmount = Math.min(amount, maxAmount);

        if (balance < copyAmount || copyAmount <= 0) {
          // Notify insufficient balance
          await supabase.from("notifications").insert({
            user_id: copier.user_id,
            title: "Copy Trade Failed 💸",
            message: `Insufficient balance to copy trade ($${copyAmount.toFixed(2)} needed).`,
            type: "info",
            market_id: market_id || null,
          });
          continue;
        }

        if (trade_type === "prediction" && market_id && side) {
          // Copy prediction via place-bet function
          const copyShares = (copyAmount / amount) * shares;
          const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/place-bet`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              "x-copy-user-id": copier.user_id,
            },
            body: JSON.stringify({
              marketId: market_id,
              optionId: option_id || null,
              side,
              amount: copyAmount,
              price,
              shares: Math.max(0.01, Number(copyShares.toFixed(2))),
            }),
          });

          // Fallback: place bet directly if place-bet doesn't support service-role user override
          if (!res.ok) {
            // Direct placement
            const { data: commData } = await supabase
              .from("commission_settings")
              .select("admin_fee_percent, creator_fee_percent")
              .limit(1)
              .single();

            const adminFee = copyAmount * (Number(commData?.admin_fee_percent ?? 2) / 100);
            const creatorFee = copyAmount * (Number(commData?.creator_fee_percent ?? 3) / 100);
            const totalDeduct = copyAmount;
            const copySharesFinal = Math.max(0.01, Number(((copyAmount - adminFee - creatorFee) / (price / 100)).toFixed(2)));

            // Deduct balance
            await supabase
              .from("balances")
              .update({ amount: balance - totalDeduct, updated_at: new Date().toISOString() })
              .eq("user_id", copier.user_id)
              .eq("currency", "USDT");

            // Create position
            await supabase.from("positions").insert({
              user_id: copier.user_id,
              market_id,
              option_id: option_id || null,
              side,
              shares: copySharesFinal,
              avg_price: price / 100,
            });

            // Create transaction
            await supabase.from("transactions").insert({
              user_id: copier.user_id,
              type: "buy",
              amount: totalDeduct,
              market_id,
              option_id: option_id || null,
              side,
              shares: copySharesFinal,
              price: price / 100,
              status: "confirmed",
            });
          }

          // Get trader name for notification
          const { data: traderProfile } = await supabase
            .from("profiles")
            .select("display_name")
            .eq("id", trader_user_id)
            .single();
          const traderName = traderProfile?.display_name || "A trader";

          await supabase.from("notifications").insert({
            user_id: copier.user_id,
            title: "Trade Copied! 📋",
            message: `Copied ${traderName}'s prediction: $${copyAmount.toFixed(2)} on ${side.toUpperCase()}`,
            type: "info",
            market_id,
          });

          copiedCount++;
        }

        if (trade_type === "quick_trade" && side) {
          // For quick trades, notify followers about the trade
          const { data: traderProfile } = await supabase
            .from("profiles")
            .select("display_name")
            .eq("id", trader_user_id)
            .single();
          const traderName = traderProfile?.display_name || "A trader";

          await supabase.from("notifications").insert({
            user_id: copier.user_id,
            title: `${traderName} placed a Quick Trade 🚀`,
            message: `${traderName} bet $${copyAmount.toFixed(2)} on ${side.toUpperCase()} in Quick Trade.`,
            type: "info",
          });

          copiedCount++;
        }
      } catch (err) {
        console.error(`Copy trade failed for user ${copier.user_id}:`, err);
      }
    }

    return new Response(JSON.stringify({ copied: copiedCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("copy-trade error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: corsHeaders,
    });
  }
});
