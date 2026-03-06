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

    for (const order of pendingOrders) {
      const currentPrice =
        order.side === "yes"
          ? Number(market.yes_price)
          : Number(market.no_price);

      // Fill condition: current price <= limit price (buying at or below target)
      if (currentPrice > order.limit_price) continue;

      // 1. Create position
      await supabase.from("positions").insert({
        user_id: order.user_id,
        market_id: order.market_id,
        option_id: order.option_id || null,
        side: order.side,
        shares: order.shares,
        avg_price: order.limit_price,
      });

      // 2. Insert transaction
      await supabase.from("transactions").insert({
        user_id: order.user_id,
        type: "buy",
        amount: order.amount,
        market_id: order.market_id,
        option_id: order.option_id || null,
        side: order.side,
        shares: order.shares,
        price: order.limit_price,
        status: "confirmed",
      });

      // 3. Update market volume
      await supabase
        .from("markets")
        .update({
          volume: Number(market.volume) + Number(order.amount),
          participants: market.participants + 1,
        })
        .eq("id", market_id);

      // 4. Mark order as filled
      await supabase
        .from("limit_orders")
        .update({ status: "filled", updated_at: new Date().toISOString() })
        .eq("id", order.id);

      // 5. Notify user
      await supabase.from("notifications").insert({
        user_id: order.user_id,
        title: "Limit Order Filled! ✅",
        message: `Your ${order.side.toUpperCase()} limit order at ${Math.round(order.limit_price * 100)}¢ for $${Number(order.amount).toFixed(2)} has been filled.`,
        type: "info",
        market_id: order.market_id,
      });

      filledCount++;
    }

    return new Response(JSON.stringify({ filled: filledCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
