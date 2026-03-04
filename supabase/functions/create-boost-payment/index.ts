import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TIER_CONFIG: Record<string, { durationHours: number; price: number }> = {
  flash: { durationHours: 12, price: 20 },
  standard: { durationHours: 24, price: 50 },
  whale: { durationHours: 168, price: 150 },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const userId = user.id;
    const { market_id, tier } = await req.json();

    const tierConfig = TIER_CONFIG[tier];
    if (!tierConfig) {
      return new Response(JSON.stringify({ error: "Invalid tier" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    if (!market_id) {
      return new Response(JSON.stringify({ error: "market_id required" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const apiKey = Deno.env.get("NOWPAYMENTS_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Payment service not configured" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const orderId = `boost_${market_id}_${tier}_${userId}_${Date.now()}`;

    const npResponse = await fetch("https://api.nowpayments.io/v1/payment", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        price_amount: tierConfig.price,
        price_currency: "usd",
        pay_currency: "usdtbsc",
        order_id: orderId,
        order_description: `Boost market ${market_id} - ${tier}`,
        ipn_callback_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/nowpayments-webhook`,
      }),
    });

    if (!npResponse.ok) {
      const errText = await npResponse.text();
      console.error("NOWPayments error:", errText);
      return new Response(JSON.stringify({ error: "Failed to create payment" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const payment = await npResponse.json();

    // Insert pending boost using service role (bypasses RLS)
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const endsAt = new Date();
    endsAt.setHours(endsAt.getHours() + tierConfig.durationHours);

    const { data: boost, error: insertError } = await adminClient
      .from("market_boosts")
      .insert({
        market_id,
        tier,
        amount: tierConfig.price,
        payer_wallet: userId,
        ends_at: endsAt.toISOString(),
        status: "pending",
        nowpayments_payment_id: String(payment.payment_id),
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Insert boost error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to create boost record" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    return new Response(
      JSON.stringify({
        boost_id: boost.id,
        payment_id: payment.payment_id,
        pay_address: payment.pay_address,
        pay_amount: payment.pay_amount,
        pay_currency: payment.pay_currency,
        expiration_estimate_date: payment.expiration_estimate_date,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("create-boost-payment error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
