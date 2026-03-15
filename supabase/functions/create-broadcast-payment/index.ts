import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

let BROADCAST_PRICE = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;
    const { market_id } = await req.json();

    if (!market_id) {
      return new Response(JSON.stringify({ error: "market_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("NOWPAYMENTS_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Payment service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Load dynamic pricing
    try {
      const { data: cs } = await adminClient
        .from("commission_settings")
        .select("broadcast_price")
        .limit(1)
        .single();
      if (cs?.broadcast_price != null) BROADCAST_PRICE = Number(cs.broadcast_price);
    } catch { /* use default */ }

    const orderId = `broadcast_${market_id}_alert_${userId}_${Date.now()}`;

    const npResponse = await fetch("https://api.nowpayments.io/v1/payment", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        price_amount: BROADCAST_PRICE,
        price_currency: "usd",
        pay_currency: "usdtbsc",
        order_id: orderId,
        order_description: `Broadcast market ${market_id} - alert`,
        ipn_callback_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/nowpayments-webhook`,
      }),
    });

    if (!npResponse.ok) {
      const errText = await npResponse.text();
      console.error("NOWPayments error:", errText);
      return new Response(JSON.stringify({ error: "Failed to create payment" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payment = await npResponse.json();

    // Insert broadcast record

    const { data: broadcast, error: insertError } = await adminClient
      .from("market_broadcasts")
      .insert({
        market_id,
        user_id: userId,
        tier: "alert",
        amount: BROADCAST_PRICE,
        status: "pending",
        nowpayments_payment_id: String(payment.payment_id),
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Insert broadcast error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to create broadcast record" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        broadcast_id: broadcast.id,
        payment_id: payment.payment_id,
        pay_address: payment.pay_address,
        pay_amount: payment.pay_amount,
        pay_currency: payment.pay_currency,
        expiration_estimate_date: payment.expiration_estimate_date,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("create-broadcast-payment error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
