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

    // ── Authentication: verify caller is the trader ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: corsHeaders,
      });
    }
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: corsHeaders,
      });
    }

    const { trader_user_id, market_id, option_id, side, amount, price, shares, trade_type } = await req.json();

    if (!trader_user_id || !trade_type) {
      return new Response(JSON.stringify({ error: "Missing params" }), {
        status: 400, headers: corsHeaders,
      });
    }

    // Verify the caller IS the trader (prevent spoofing)
    if (user.id !== trader_user_id) {
      return new Response(JSON.stringify({ error: "Forbidden: caller must be the trader" }), {
        status: 403, headers: corsHeaders,
      });
    }

    const copyField = trade_type === "quick_trade" ? "copy_quick_trades" : "copy_predictions";

    // Get ALL copiers who have the relevant copy field enabled
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

    // Get commission settings
    const { data: commData } = await supabase
      .from("commission_settings")
      .select("prediction_fee_percent, copy_trade_commission_percent")
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
          // ── AUTO-COPY: Execute immediately with atomic balance deduction ──
          if (trade_type === "prediction" && market_id && side) {
            // Verify market is still active before copying
            const { data: marketCheck } = await supabase
              .from("markets")
              .select("status")
              .eq("id", market_id)
              .single();

            if (!marketCheck || marketCheck.status !== "active") {
              console.warn(`Skipping copy for ${copier.user_id}: market ${market_id} is ${marketCheck?.status}`);
              continue;
            }

            // Atomic debit — prevents race conditions
            const { data: debitResult } = await supabase.rpc("debit_balance_atomic", {
              _user_id: copier.user_id,
              _main_deduct: copyAmount,
              _bonus_deduct: 0,
            });

            if (!debitResult?.success) {
              await supabase.from("notifications").insert({
                user_id: copier.user_id,
                title: "Copy Trade Failed 💸",
                message: `Insufficient balance to auto-copy trade ($${copyAmount.toFixed(2)} needed).`,
                type: "info",
                market_id: market_id || null,
              });
              continue;
            }

            const predictionFeePercent = Number(commData?.prediction_fee_percent ?? 10) / 100;
            const totalFee = copyAmount * predictionFeePercent;
            const tradePrice = price || 50;
            const finalShares = copyShares || Math.max(0.01, Number(((copyAmount - totalFee) / (tradePrice / 100)).toFixed(2)));

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

          // Notify copier
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

    // Notify trader once
    if (copiedCount + queuedCount > 0) {
      await supabase.from("notifications").insert({
        user_id: trader_user_id,
        title: `Trade Copied by ${copiedCount + queuedCount} user${copiedCount + queuedCount > 1 ? "s" : ""} 🔄`,
        message: `${copiedCount} auto-copied, ${queuedCount} pending approval.`,
        type: "info",
        market_id: market_id || null,
      });
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
