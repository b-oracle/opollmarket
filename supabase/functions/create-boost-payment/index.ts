import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_TIER_CONFIG: Record<string, { durationHours: number; price: number; rank: number }> = {
  flash: { durationHours: 12, price: 20, rank: 1 },
  standard: { durationHours: 24, price: 50, rank: 2 },
  whale: { durationHours: 168, price: 150, rank: 3 },
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
    const { market_id, tier } = await req.json();

    const tierConfig = TIER_CONFIG[tier];
    if (!tierConfig) {
      return new Response(JSON.stringify({ error: "Invalid tier" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!market_id) {
      return new Response(JSON.stringify({ error: "market_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check for existing active boost on this market
    const now = new Date();
    const { data: existingBoosts } = await adminClient
      .from("market_boosts")
      .select("id, tier, ends_at")
      .eq("market_id", market_id)
      .eq("status", "active")
      .gte("ends_at", now.toISOString())
      .order("ends_at", { ascending: false })
      .limit(1);

    const existingBoost = existingBoosts?.[0];

    if (existingBoost) {
      const existingRank = TIER_CONFIG[existingBoost.tier]?.rank || 0;
      const newRank = tierConfig.rank;

      // Block lower-tier purchases on an already-boosted market
      if (newRank < existingRank) {
        return new Response(JSON.stringify({
          error: `This market already has an active ${existingBoost.tier} boost. You can only extend with the same or a higher tier.`,
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const apiKey = Deno.env.get("NOWPAYMENTS_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Payment service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        order_description: `Boost market ${market_id} - ${tier}${existingBoost ? " (extend)" : ""}`,
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

    // Calculate ends_at: if extending, add duration to existing ends_at; otherwise from now
    const baseTime = existingBoost
      ? new Date(existingBoost.ends_at)
      : new Date();
    const endsAt = new Date(baseTime.getTime() + tierConfig.durationHours * 60 * 60 * 1000);

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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        extending: !!existingBoost,
        existing_tier: existingBoost?.tier || null,
        existing_ends_at: existingBoost?.ends_at || null,
        new_ends_at: endsAt.toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("create-boost-payment error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
