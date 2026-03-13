import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function encodePayazaAuth(secretKey: string): string {
  return `Payaza ${btoa(secretKey)}`;
}

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

    const { bank_code, account_number } = await req.json();

    if (!bank_code || !account_number || account_number.length < 10) {
      return new Response(
        JSON.stringify({ error: "Valid bank code and 10-digit account number required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const secretKey = Deno.env.get("PAYAZA_SECRET_KEY");
    const merchantKey = Deno.env.get("PAYAZA_MERCHANT_KEY");
    if (!secretKey) {
      return new Response(
        JSON.stringify({ error: "Payment service not configured" }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Try both auth formats - Payaza uses different auth for different endpoints
    const payazaAuthorization = encodePayazaAuth(secretKey);
    const proxyUrl = Deno.env.get("QUOTAGUARD_URL");


    // Try multiple endpoint, payload, and auth patterns (Payaza docs are inconsistent per product)
    const endpoints = [
      "https://api.payaza.africa/live/merchant-payout/name_enquiry/",
      "https://api.payaza.africa/live/merchant-payout/name-enquiry/",
      "https://api.payaza.africa/live/merchant-payout/account/name-enquiry/",
      "https://api.payaza.africa/live/merchant-payout/resolve_account/",
      "https://api.payaza.africa/live/merchant-collection/name-enquiry/",
    ];

    const authHeaders = Array.from(new Set([
      payazaAuthorization,
      `Bearer ${secretKey}`,
      `Payaza key=${secretKey}`,
      `Payaza secret_key=${secretKey}`,
      ...(merchantKey
        ? [
            `Payaza ${btoa(merchantKey)}`,
            `Bearer ${merchantKey}`,
            `Payaza key=${merchantKey}`,
            `Payaza merchant_key=${merchantKey}`,
          ]
        : []),
    ]));

    const payloadVariants = [
      { account_number: account_number, bank_code: bank_code },
      { accountNumber: account_number, bankCode: bank_code },
      { account_number: account_number, bank_code: bank_code, currency: "NGN" },
    ];

    let payazaResponse: Response | null = null;
    let payazaResponseText = "";
    let lastError = "";
    let lastNonAuthFailure: { status: number; body: string } | null = null;

    const isAuthFormatError = (status: number, body: string) => {
      const authErr = /authorization header|invalid key=value pair|missing equal-sign|invalid authorization|unauthorized/i;
      return [400, 401, 403].includes(status) && authErr.test(body);
    };

    // Try each endpoint + payload + auth combination until success
    outer:
    for (const url of endpoints) {
      for (const payloadBody of payloadVariants) {
        for (const auth of authHeaders) {
          const fetchOpts = {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": auth,
              "Accept": "application/json",
            },
            body: JSON.stringify(payloadBody),
          };

          const tryFetch = async (label: string, opts: any) => {
            const res = await fetch(url, opts);
            const preview = await res.clone().text();
            console.log(`${label} ${url} auth=${auth.substring(0, 20)}... payload=${JSON.stringify(payloadBody)} → ${res.status}: ${preview.substring(0, 250)}`);
            if (preview.includes("<html") || preview.includes("<!DOCTYPE")) return null;
            return { res, preview };
          };

          // Try proxy first
          if (proxyUrl) {
            try {
              const httpClient = Deno.createHttpClient({ proxy: { url: proxyUrl } });
              const result = await tryFetch("Proxy", { ...fetchOpts, /* @ts-ignore */ client: httpClient });
              httpClient.close();

              if (result) {
                const { res, preview } = result;
                if (res.ok) {
                  payazaResponse = res;
                  payazaResponseText = preview;
                  break outer;
                }
                if (!isAuthFormatError(res.status, preview)) {
                  lastNonAuthFailure = { status: res.status, body: preview };
                }
              }
            } catch (err) {
              lastError = String(err);
            }
          }

          // Direct fallback
          try {
            const result = await tryFetch("Direct", fetchOpts);
            if (result) {
              const { res, preview } = result;
              if (res.ok) {
                payazaResponse = res;
                payazaResponseText = preview;
                break outer;
              }
              if (!isAuthFormatError(res.status, preview)) {
                lastNonAuthFailure = { status: res.status, body: preview };
              }
            }
          } catch (err) {
            lastError = String(err);
          }
        }
      }
    }

    if (!payazaResponse) {
      if (lastNonAuthFailure) {
        return new Response(
          JSON.stringify({ error: "Account verification failed", details: lastNonAuthFailure.body?.slice(0, 240) }),
          { status: 400, headers: corsHeaders }
        );
      }

      console.error("All Payaza name enquiry attempts failed. Last error:", lastError);
      return new Response(
        JSON.stringify({ error: "Could not verify account name right now. Please confirm account name manually and continue." }),
        { status: 503, headers: corsHeaders }
      );
    }

    const responseText = payazaResponseText || await payazaResponse.text();
    console.log("Payaza name enquiry response:", payazaResponse.status, responseText.substring(0, 500));

    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid response from payment service" }),
        { status: 502, headers: corsHeaders }
      );
    }

    if (!payazaResponse.ok) {
      return new Response(
        JSON.stringify({ error: data?.message || "Account verification failed" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const responseData = data?.data || data?.response_content || data;
    const accountName = responseData?.account_name || responseData?.accountName || responseData?.name || "";

    if (!accountName) {
      return new Response(
        JSON.stringify({ error: "Could not resolve account name" }),
        { status: 404, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({ account_name: accountName }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("verify-bank-account error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
