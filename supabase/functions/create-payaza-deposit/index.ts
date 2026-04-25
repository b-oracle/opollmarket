import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildPayazaWebhookUrl, encodePayazaAuth } from "../_shared/payaza.ts";

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

    // Fetch live USD→NGN rate with admin markup.
    // Always start from a guaranteed-numeric fallback so ngnAmount can never be NaN/null.
    const safeFallback = Number.isFinite(configuredFallback) && configuredFallback > 0
      ? configuredFallback
      : 1500;
    let effectiveRate: number = safeFallback;
    let ngnAmount = Math.ceil(amount * safeFallback);
    try {
      const rateRes = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/get-naira-rate`,
        {
          headers: {
            Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
          },
        }
      );
      if (rateRes.ok) {
        const rateData = await rateRes.json();
        const fetchedRate = Number(rateData?.effective_rate);
        if (Number.isFinite(fetchedRate) && fetchedRate > 0) {
          effectiveRate = fetchedRate;
          ngnAmount = Math.ceil(amount * effectiveRate);
          console.log(`[Payaza] USD ${amount} → NGN ${ngnAmount} (rate: ${effectiveRate})`);
        } else {
          console.warn(`[Payaza] Rate service returned invalid effective_rate (${rateData?.effective_rate}), using fallback ${safeFallback}`);
        }
      } else {
        console.warn(`[Payaza] Rate service returned ${rateRes.status}, using fallback rate ${safeFallback}`);
      }
    } catch (e) {
      console.warn(`[Payaza] Rate fetch failed, using fallback rate ${safeFallback}:`, e);
    }

    // Final guard: ensure ngnAmount and effectiveRate are valid positive numbers before proceeding.
    if (!Number.isFinite(effectiveRate) || effectiveRate <= 0) {
      effectiveRate = safeFallback;
    }
    if (!Number.isFinite(ngnAmount) || ngnAmount <= 0) {
      ngnAmount = Math.ceil(amount * effectiveRate);
    }

    const secretKey = Deno.env.get("PAYAZA_SECRET_KEY");

    if (!secretKey) {
      return new Response(
        JSON.stringify({ error: "Fiat payment service not configured (missing secret key)" }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Get user email & profile
    const { data: { user } } = await supabase.auth.getUser();
    const email = user?.email || "customer@opoll.com";
    const firstName = email.split("@")[0];

    const transactionReference = `payaza_${userId}_${Date.now()}`;

    // Insert pending deposit transaction
    await adminClient.from("transactions").insert({
      user_id: userId,
      type: "deposit",
      amount: amount,
      status: "pending",
      payment_provider: "payaza",
      nowpayments_payment_id: transactionReference,
    });

    // ─── PAYAZA DYNAMIC VIRTUAL ACCOUNT API ───
    // Base URL: https://api.payaza.africa
    // Endpoint: POST /live/merchant-collection/merchant/virtual_account/generate_virtual_account/
    // Auth: Payaza <base64(secret_key)>

    const payazaBaseUrl = "https://api.payaza.africa";
    const virtualAccountEndpoint = "/live/merchant-collection/merchant/virtual_account/generate_virtual_account/";
    const fullUrl = `${payazaBaseUrl}${virtualAccountEndpoint}`;

    const webhookToken = Deno.env.get("PAYAZA_WEBHOOK_TOKEN");
    const webhookUrl = buildPayazaWebhookUrl(
      Deno.env.get("SUPABASE_URL")!,
      webhookToken,
    );

    const virtualAccountPayload = {
      account_name: firstName,
      account_type: "Dynamic",
      bank_code: "1067", // 78 FINANCE COMPANY LIMITED
      account_reference: transactionReference,
      customer_first_name: firstName,
      customer_last_name: "User",
      customer_email: email,
      customer_phone_number: "08000000000",
      transaction_amount: ngnAmount,
      has_amount_validation: true,
      transaction_description: `Deposit $${amount} USD (₦${ngnAmount} NGN)`,
      expires_in_minutes: 60,
      callback_url: webhookUrl,
      webhook_url: webhookUrl,
    };

    const payazaAuthorization = encodePayazaAuth(secretKey);
    const proxyUrl = Deno.env.get("QUOTAGUARD_URL");

    let payazaResponse: Response | null = null;
    let lastError = "";

    // Try with proxy first (Payaza requires whitelisted IPs)
    if (proxyUrl) {
      try {
        console.log(`Trying Payaza via proxy: ${fullUrl}`);
        const httpClient = Deno.createHttpClient({ proxy: { url: proxyUrl } });
        payazaResponse = await fetch(fullUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": payazaAuthorization,
            "Accept": "application/json",
          },
          body: JSON.stringify(virtualAccountPayload),
          // @ts-ignore - Deno-specific option
          client: httpClient,
        });
        httpClient.close();
        const preview = await payazaResponse.clone().text();
        console.log(`Proxy response: status=${payazaResponse.status}, body=${preview.substring(0, 500)}`);
        // Check if response is valid JSON
        if (preview.includes("<html") || preview.includes("<!DOCTYPE")) {
          console.log("Proxy returned HTML instead of JSON, will try direct...");
          payazaResponse = null;
        }
      } catch (err) {
        lastError = String(err);
        console.error(`Proxy fetch failed:`, lastError);
      }
    }

    // Fallback: try direct connection
    if (!payazaResponse) {
      try {
        console.log(`Trying Payaza direct: ${fullUrl}`);
        payazaResponse = await fetch(fullUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": payazaAuthorization,
            "Accept": "application/json",
          },
          body: JSON.stringify(virtualAccountPayload),
        });
        const preview = await payazaResponse.clone().text();
        console.log(`Direct response: status=${payazaResponse.status}, body=${preview.substring(0, 500)}`);
        if (preview.includes("<html") || preview.includes("<!DOCTYPE")) {
          console.log("Direct returned HTML instead of JSON");
          payazaResponse = null;
        }
      } catch (err) {
        lastError = String(err);
        console.error(`Direct fetch failed:`, lastError);
      }
    }

    if (!payazaResponse) {
      console.error("All Payaza connection attempts failed. Last error:", lastError);
      return new Response(
        JSON.stringify({ error: "Payment service temporarily unavailable. Please try again later." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payazaText = await payazaResponse.text();
    console.log("Payaza final response status:", payazaResponse.status, "body:", payazaText.substring(0, 500));

    let payazaData: any;
    try {
      payazaData = JSON.parse(payazaText);
    } catch {
      console.error("Payaza returned non-JSON:", payazaText.substring(0, 300));
      return new Response(
        JSON.stringify({ error: "Payment service returned an invalid response. Please try again." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!payazaResponse.ok) {
      console.error("Payaza API error:", payazaData);
      return new Response(
        JSON.stringify({ error: payazaData?.message || payazaData?.error || "Failed to initiate payment. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract virtual account details from the response
    // Response could have data at top level or nested under data/response_content
    const responseData = payazaData?.data || payazaData?.response_content || payazaData;
    const bankName = responseData?.bank_name || responseData?.virtual_account_bank || responseData?.bank || "Transfer Bank";
    const accountNumber = responseData?.account_number || responseData?.virtual_account_number || "";
    const accountName = responseData?.account_name || responseData?.virtual_account_name || "Opoll";
    const expiresAt = responseData?.expires_at || responseData?.expiry_datetime || null;

    return new Response(
      JSON.stringify({
        mode: "direct_api",
        transaction_reference: transactionReference,
        bank_name: bankName,
        account_number: accountNumber,
        account_name: accountName,
        amount_ngn: ngnAmount,
        amount_usd: amount,
        exchange_rate: effectiveRate,
        currency: "NGN",
        expires_at: expiresAt,
        email,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("create-payaza-deposit error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
