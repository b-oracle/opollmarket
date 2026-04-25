import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

    // Authentication: only allow service-role or admin callers
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      if (token !== serviceKey) {
        const userClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } }
        );
        const { data: { user }, error: userErr } = await userClient.auth.getUser();
        if (userErr || !user) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
        const { data: isSuperAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "super_admin" });
        if (!isAdmin && !isSuperAdmin) {
          return new Response(JSON.stringify({ error: "Admin access required" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    } else {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { market_id } = await req.json();

    if (!market_id) {
      return new Response(JSON.stringify({ error: "market_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get current market prices
    const { data: market, error: mktErr } = await supabase
      .from("markets")
      .select("id, yes_price, no_price, volume, participants, market_type")
      .eq("id", market_id)
      .eq("status", "active")
      .single();

    if (mktErr || !market) {
      return new Response(
        JSON.stringify({ error: "Market not found or inactive" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch prediction fee percent (same as place-bet)
    const { data: commData } = await supabase
      .from("commission_settings")
      .select("prediction_fee_percent")
      .limit(1)
      .single();
    const predictionFeePercent = Number(commData?.prediction_fee_percent ?? 10) / 100;

    // Get pending limit orders for this market
    const { data: pendingOrders } = await supabase
      .from("limit_orders")
      .select("*")
      .eq("market_id", market_id)
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (!pendingOrders || pendingOrders.length === 0) {
      return new Response(JSON.stringify({ filled: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let filledCount = 0;
    const isMulti = market.market_type === "multi" || market.market_type === "range";

    for (const order of pendingOrders) {
      // Re-fetch live market prices after each fill to avoid stale price matching
      const { data: liveMarket } = await supabase
        .from("markets")
        .select("yes_price, no_price")
        .eq("id", market_id)
        .eq("status", "active")
        .single();

      if (!liveMarket) break; // Market no longer active

      const currentPrice =
        order.side === "yes"
          ? Number(liveMarket.yes_price)
          : Number(liveMarket.no_price);

      // Fill condition: current price <= limit price (buying at or below target)
      if (currentPrice > order.limit_price) continue;

      // Calculate fee and net amount (matching place-bet logic)
      const orderAmount = Number(order.amount);
      const totalFee = orderAmount * predictionFeePercent;
      const netAmount = orderAmount - totalFee;
      const actualShares = netAmount / order.limit_price;

      // 1. Create position with fee-adjusted shares
      await supabase.from("positions").insert({
        user_id: order.user_id,
        market_id: order.market_id,
        option_id: order.option_id || null,
        side: order.side,
        shares: actualShares,
        avg_price: order.limit_price,
      });

      // 2. Insert transaction
      await supabase.from("transactions").insert({
        user_id: order.user_id,
        type: "buy",
        amount: orderAmount,
        market_id: order.market_id,
        option_id: order.option_id || null,
        side: order.side,
        shares: actualShares,
        price: order.limit_price,
        status: "confirmed",
      });

      // 3. Credit fee to platform pool (same as place-bet)
      if (totalFee > 0) {
        await supabase.rpc("adjust_platform_pool", { _delta: totalFee });
      }

      // 4. Atomic market volume + price update via RPC
      await supabase.rpc("buy_update_market_prices", {
        _market_id: market_id,
        _side: order.side,
        _pool_amount: netAmount,
        _bet_amount: orderAmount,
        _is_multi: isMulti,
      });

      // 5. Mark order as filled
      await supabase
        .from("limit_orders")
        .update({ status: "filled", updated_at: new Date().toISOString() })
        .eq("id", order.id);

      // 6. Notify user
      await supabase.from("notifications").insert({
        user_id: order.user_id,
        title: "Limit Order Filled! ✅",
        message: `Your ${order.side.toUpperCase()} limit order at ${Math.round(order.limit_price * 100)}¢ for $${orderAmount.toFixed(2)} has been filled.`,
        type: "info",
        market_id: order.market_id,
      });

      filledCount++;
    }

    return new Response(JSON.stringify({ filled: filledCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err instanceof Error ? err.message : String(err)) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
