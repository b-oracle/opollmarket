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

    if (!amount || amount < 1 || amount > 50000) {
      return new Response(
        JSON.stringify({ error: "Amount must be between 1 and 50,000" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const merchantKey = Deno.env.get("PAYAZA_MERCHANT_KEY");
    const secretKey = Deno.env.get("PAYAZA_SECRET_KEY");

    if (!secretKey) {
      return new Response(
        JSON.stringify({ error: "Fiat payment service not configured (missing secret key)" }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Get user email
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    const email = user?.email || "customer@opoll.com";

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

    // ─── CHECKOUT SDK MODE ───
    // ─── DIRECT API MODE (always) ───
    const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/payaza-webhook`;

    const collectionPayload = {
      service_type: "Account",
      service_payload: {
        request_application: "Payaza",
        application_module: "USER_MODULE",
        application_version: "1.0.0",
        request_class: "PayazaCheckout",
        request_type: "PayazaCheckout",
        payaza_account_number: merchantKey || "",
        transaction_reference: transactionReference,
        amount: amount,
        currency: "NGN",
        callback_url: webhookUrl,
        customer: {
          email: email,
          first_name: email.split("@")[0],
          last_name: "User",
        },
      },
    };

    const payazaAuthorization = `Payaza ${secretKey}`;
    const proxyUrl = Deno.env.get("QUOTAGUARD_URL");

    // Try multiple known Payaza API endpoints
    const payazaEndpoints = [
      "https://router-live.78financials.com/api/v1/collection/",
      "https://router.payaza.africa/api/v1/collection/",
    ];

    let payazaResponse: Response | null = null;
    let lastError: string = "";

    for (const endpoint of payazaEndpoints) {
      // Try direct first (no proxy)
      try {
        console.log(`Trying Payaza direct: ${endpoint}`);
        payazaResponse = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": payazaAuthorization,
          },
          body: JSON.stringify(collectionPayload),
        });
        const preview = await payazaResponse.clone().text();
        console.log(`Direct response ${endpoint}: status=${payazaResponse.status}, body=${preview.substring(0, 200)}`);
        // If we got a JSON response (even an error), use it
        if (payazaResponse.headers.get("content-type")?.includes("json") || !preview.includes("<html")) {
          break;
        }
        console.log("Direct returned HTML, trying next option...");
        payazaResponse = null;
      } catch (err) {
        lastError = String(err);
        console.error(`Direct fetch to ${endpoint} failed:`, lastError);
      }

      // Try with proxy
      if (proxyUrl) {
        try {
          console.log(`Trying Payaza via proxy: ${endpoint}`);
          const httpClient = Deno.createHttpClient({ proxy: { url: proxyUrl } });
          payazaResponse = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": payazaAuthorization,
            },
            body: JSON.stringify(collectionPayload),
            // @ts-ignore - Deno-specific option
            client: httpClient,
          });
          httpClient.close();
          const preview = await payazaResponse.clone().text();
          console.log(`Proxy response ${endpoint}: status=${payazaResponse.status}, body=${preview.substring(0, 200)}`);
          if (payazaResponse.headers.get("content-type")?.includes("json") || !preview.includes("<html")) {
            break;
          }
          console.log("Proxy returned HTML, trying next option...");
          payazaResponse = null;
        } catch (err) {
          lastError = String(err);
          console.error(`Proxy fetch to ${endpoint} failed:`, lastError);
        }
      }
    }

    if (!payazaResponse) {
      console.error("All Payaza endpoints failed. Last error:", lastError);
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
        JSON.stringify({ error: payazaData?.message || "Failed to initiate payment. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract virtual account details from the response
    const responseData = payazaData?.data || payazaData?.response_content || payazaData;
    const bankName = responseData?.bank_name || responseData?.virtual_account_bank || "Transfer Bank";
    const accountNumber = responseData?.account_number || responseData?.virtual_account_number || "";
    const accountName = responseData?.account_name || responseData?.virtual_account_name || "Opoll";
    const paymentUrl = responseData?.payment_url || responseData?.checkout_url || null;
    const expiresAt = responseData?.expires_at || responseData?.expiry_datetime || null;

    return new Response(
      JSON.stringify({
        mode: "direct_api",
        transaction_reference: transactionReference,
        bank_name: bankName,
        account_number: accountNumber,
        account_name: accountName,
        amount: amount,
        currency: "NGN",
        payment_url: paymentUrl,
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