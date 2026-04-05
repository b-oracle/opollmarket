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

    // Authenticate the user
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

    const { pending_trade_id, action } = await req.json();

    if (!pending_trade_id || !["accept", "reject"].includes(action)) {
      return new Response(JSON.stringify({ error: "Missing pending_trade_id or invalid action" }), {
        status: 400, headers: corsHeaders,
      });
    }

    // Get the pending trade
    const { data: trade, error: tradeErr } = await supabase
      .from("pending_copy_trades")
      .select("*")
      .eq("id", pending_trade_id)
      .eq("user_id", user.id)
      .single();

    if (tradeErr || !trade) {
      return new Response(JSON.stringify({ error: "Pending trade not found" }), {
        status: 404, headers: corsHeaders,
      });
    }

    if (trade.status !== "pending") {
      return new Response(JSON.stringify({ error: "Trade already processed", status: trade.status }), {
        status: 400, headers: corsHeaders,
      });
    }

    // Check if expired
    if (new Date(trade.expires_at) < new Date()) {
      await supabase
        .from("pending_copy_trades")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", pending_trade_id);

      return new Response(JSON.stringify({ error: "Trade has expired" }), {
        status: 400, headers: corsHeaders,
      });
    }

    if (action === "reject") {
      await supabase
        .from("pending_copy_trades")
        .update({ status: "rejected", updated_at: new Date().toISOString() })
        .eq("id", pending_trade_id);

      return new Response(JSON.stringify({ success: true, status: "rejected" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // action === "accept" — execute the trade with atomic balance deduction
    if (trade.trade_type === "prediction" && trade.market_id && trade.side) {
      // Verify market is still active before executing
      const { data: marketCheck } = await supabase
        .from("markets")
        .select("status")
        .eq("id", trade.market_id)
        .single();

      if (!marketCheck || marketCheck.status !== "active") {
        await supabase
          .from("pending_copy_trades")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .eq("id", pending_trade_id);

        return new Response(JSON.stringify({ error: "Market is no longer active" }), {
          status: 400, headers: corsHeaders,
        });
      }

      const { data: commData } = await supabase
        .from("commission_settings")
        .select("prediction_fee_percent, copy_trade_commission_percent")
        .limit(1)
        .single();

      const predictionFeePercent = Number(commData?.prediction_fee_percent ?? 10) / 100;
      const totalFee = trade.amount * predictionFeePercent;
      const copyTradeCommissionPercent = Number(commData?.copy_trade_commission_percent ?? 10);

      // Fetch live market price instead of trusting stored/client value
      const { data: liveMarket } = await supabase
        .from("markets")
        .select("yes_price, no_price, market_type")
        .eq("id", trade.market_id)
        .single();
      const isMulti = liveMarket?.market_type === "multi" || liveMarket?.market_type === "range";
      const tradePrice = liveMarket
        ? Math.round(Number(trade.side === "yes" ? liveMarket.yes_price : liveMarket.no_price) * 100)
        : trade.price;
      if (!tradePrice || tradePrice <= 0) {
        await supabase
          .from("pending_copy_trades")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .eq("id", pending_trade_id);
        return new Response(JSON.stringify({ error: "Could not determine market price" }), {
          status: 400, headers: corsHeaders,
        });
      }

      const finalShares = trade.shares || Math.max(0.01, Number(((trade.amount - totalFee) / (tradePrice / 100)).toFixed(2)));

      // Atomic debit — prevents race conditions
      const { data: debitResult } = await supabase.rpc("debit_balance_atomic", {
        _user_id: user.id,
        _main_deduct: trade.amount,
        _bonus_deduct: 0,
      });

      if (!debitResult?.success) {
        await supabase
          .from("pending_copy_trades")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .eq("id", pending_trade_id);

        const balance = debitResult?.available || 0;
        await supabase.from("notifications").insert({
          user_id: user.id,
          title: "Copy Trade Failed 💸",
          message: `Insufficient balance ($${trade.amount.toFixed(2)} needed, $${Number(balance).toFixed(2)} available).`,
          type: "info",
        });

        return new Response(JSON.stringify({ error: "Insufficient balance" }), {
          status: 400, headers: corsHeaders,
        });
      }

      // Credit prediction fee to platform pool
      if (totalFee > 0) {
        await supabase.rpc("adjust_platform_pool", { _delta: totalFee });
      }

      // Create position
      await supabase.from("positions").insert({
        user_id: user.id,
        market_id: trade.market_id,
        option_id: trade.option_id || null,
        side: trade.side,
        shares: finalShares,
        avg_price: tradePrice / 100,
      });

      await supabase.from("transactions").insert({
        user_id: user.id,
        type: "buy",
        amount: trade.amount,
        market_id: trade.market_id,
        option_id: trade.option_id || null,
        side: trade.side,
        shares: finalShares,
        price: tradePrice / 100,
        status: "confirmed",
        is_copy_trade: true,
      });

      // Update AMM prices atomically so copied capital is reflected
      const poolAmount = trade.amount - totalFee;
      await supabase.rpc("buy_update_market_prices", {
        _market_id: trade.market_id,
        _side: trade.side,
        _pool_amount: poolAmount,
        _bet_amount: trade.amount,
        _is_multi: isMulti,
      });

      // Record the copy trade earning entry
      await supabase.from("copy_trade_earnings").insert({
        trader_user_id: trade.trader_user_id,
        copier_user_id: user.id,
        pending_trade_id: trade.id,
        market_id: trade.market_id,
        trade_type: trade.trade_type,
        copier_profit: 0,
        commission_percent: copyTradeCommissionPercent,
        commission_amount: 0,
      });
    }

    // Mark as accepted
    await supabase
      .from("pending_copy_trades")
      .update({ status: "accepted", updated_at: new Date().toISOString() })
      .eq("id", pending_trade_id);

    // Get trader name
    const { data: traderProfile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", trade.trader_user_id)
      .single();

    await supabase.from("notifications").insert({
      user_id: user.id,
      title: "Trade Copied! 📋",
      message: `Copied ${traderProfile?.display_name || "trader"}'s trade: $${trade.amount.toFixed(2)} on ${(trade.side || "").toUpperCase()}`,
      type: "info",
      market_id: trade.market_id || null,
    });

    // Notify the trader
    const { data: copierProfile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();

    await supabase.from("notifications").insert({
      user_id: trade.trader_user_id,
      title: "Your Trade Was Copied! 🔄",
      message: `${copierProfile?.display_name || "Someone"} copied your trade: $${trade.amount.toFixed(2)} on ${(trade.side || "").toUpperCase()}. You'll earn commission if they profit.`,
      type: "info",
      market_id: trade.market_id || null,
    });

    return new Response(JSON.stringify({ success: true, status: "accepted" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("approve-copy-trade error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: corsHeaders,
    });
  }
});
