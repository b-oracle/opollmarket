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

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: corsHeaders,
      });
    }

    const userId = claimsData.claims.sub;
    const { amount } = await req.json();

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

    // Fetch admin-configured fallback rate
    let configuredFallback = 1500;
    try {
      const { data: settings } = await adminClient
        .from("commission_settings")
        .select("fallback_naira_rate")
        .limit(1)
        .single();
      if (settings?.fallback_naira_rate) {
        configuredFallback = Number(settings.fallback_naira_rate);
      }
    } catch { /* use default */ }

    // Fetch live USD→NGN rate with admin markup
    let ngnAmount = Math.ceil(amount * configuredFallback);
    let effectiveRate: number | null = configuredFallback;
    try {
      const rateRes = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/get-naira-rate`,
        { headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}` } }
      );
      if (rateRes.ok) {
        const rateData = await rateRes.json();
        effectiveRate = rateData.effective_rate;
        ngnAmount = Math.ceil(amount * effectiveRate!);
        console.log(`[Flutterwave] USD ${amount} → NGN ${ngnAmount} (rate: ${effectiveRate})`);
      }
    } catch (e) {
      console.warn(`[Flutterwave] Rate fetch failed, using fallback ${configuredFallback}:`, e);
    }

    const flutterwaveKey = Deno.env.get("FLUTTERWAVE_SECRET_KEY");
    if (!flutterwaveKey) {
      return new Response(
        JSON.stringify({ error: "Flutterwave not configured" }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Get user email
    const { data: { user } } = await supabase.auth.getUser();
    const email = user?.email || "customer@opoll.com";

    const txRef = `flw_dep_${userId}_${Date.now()}`;

    // Insert pending deposit transaction
    await adminClient.from("transactions").insert({
      user_id: userId,
      type: "deposit",
      amount: amount,
      status: "pending",
      payment_provider: "flutterwave",
      nowpayments_payment_id: txRef,
    });

    // Call Flutterwave charge via bank_transfer to generate virtual account
    const chargeRes = await fetch("https://api.flutterwave.com/v3/charges?type=bank_transfer", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${flutterwaveKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tx_ref: txRef,
        amount: ngnAmount,
        currency: "NGN",
        email: email,
        narration: `Deposit $${amount} USD to OPollmarket`,
        is_permanent: false,
      }),
    });

    const chargeData = await chargeRes.json();
    console.log(`Flutterwave charge → ${chargeRes.status}:`, JSON.stringify(chargeData).substring(0, 500));

    if (chargeData.status !== "success" || !chargeData.meta?.authorization) {
      console.error("Flutterwave charge failed:", chargeData.message);
      return new Response(
        JSON.stringify({ error: chargeData.message || "Failed to generate bank transfer details" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const auth = chargeData.meta.authorization;
    // auth contains: transfer_reference, transfer_account, transfer_bank, transfer_amount, account_expiration, mode

    return new Response(
      JSON.stringify({
        mode: "direct_api",
        provider: "flutterwave",
        transaction_reference: txRef,
        flw_ref: chargeData.data?.flw_ref || null,
        bank_name: auth.transfer_bank || "Bank",
        account_number: auth.transfer_account || "",
        account_name: auth.transfer_note || "Flutterwave / OPollmarket",
        amount_ngn: auth.transfer_amount || ngnAmount,
        amount_usd: amount,
        exchange_rate: effectiveRate,
        currency: "NGN",
        expires_at: auth.account_expiration || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("create-flutterwave-deposit error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
