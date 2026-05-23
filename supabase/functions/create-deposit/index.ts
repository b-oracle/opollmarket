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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: corsHeaders,
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
        status: 401, headers: corsHeaders,
      });
    }

    const userId = user.id;
    const { amount, pay_currency } = await req.json();

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch dynamic limits
    const { data: limitsData } = await adminClient
      .from("commission_settings")
      .select("deposit_min_amount, deposit_max_amount")
      .limit(1)
      .single();
    const depositMin = Number(limitsData?.deposit_min_amount) || 1;
    const depositMax = Number(limitsData?.deposit_max_amount) || 50000;

    if (!amount || amount < depositMin || amount > depositMax) {
      return new Response(
        JSON.stringify({ error: `Amount must be between $${depositMin} and $${depositMax.toLocaleString()}` }),
        { status: 400, headers: corsHeaders }
      );
    }

    // --- Spam & block checks ---

    // Check if user is blocked
    const { data: profile } = await adminClient
      .from("profiles")
      .select("is_blocked")
      .eq("id", userId)
      .single();

    if (profile?.is_blocked) {
      return new Response(
        JSON.stringify({ error: "Your account has been restricted. Please contact support." }),
        { status: 403, headers: corsHeaders }
      );
    }

    // Check pending deposit spam (3+ pending = blocked until they expire/complete)
    const { count: pendingCount } = await adminClient
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("type", "deposit")
      .eq("status", "pending");

    if ((pendingCount ?? 0) >= 3) {
      return new Response(
        JSON.stringify({ error: "You have 3 pending deposits. Please wait for them to expire or be processed before creating new ones." }),
        { status: 429, headers: corsHeaders }
      );
    }

    const apiKey = Deno.env.get("NOWPAYMENTS_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Payment service not configured" }),
        { status: 500, headers: corsHeaders }
      );
    }

    const orderId = `deposit_${userId}_${Date.now()}`;

    // Use Create Payment API (returns pay_address for in-app display)
    const npResponse = await fetch("https://api.nowpayments.io/v1/payment", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        price_amount: amount,
        price_currency: "usd",
        pay_currency: pay_currency || "usdtbsc",
        order_id: orderId,
        order_description: `Deposit $${amount} to OPollmarket`,
        ipn_callback_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/nowpayments-webhook`,
      }),
    });

    if (!npResponse.ok) {
      const errText = await npResponse.text();
      console.error("NOWPayments error:", errText);
      return new Response(
        JSON.stringify({ error: "Failed to create payment" }),
        { status: 500, headers: corsHeaders }
      );
    }

    const payment = await npResponse.json();

    // Insert pending deposit transaction (adminClient already created above)

    await adminClient.from("transactions").insert({
      user_id: userId,
      type: "deposit",
      amount: amount,
      status: "pending",
      nowpayments_payment_id: String(payment.payment_id),
    });

    return new Response(
      JSON.stringify({
        payment_id: payment.payment_id,
        pay_address: payment.pay_address,
        pay_amount: payment.pay_amount,
        pay_currency: payment.pay_currency,
        expiration_estimate_date: payment.expiration_estimate_date,
        payment_status: payment.payment_status,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("create-deposit error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
