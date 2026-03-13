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
    if (!secretKey) {
      return new Response(
        JSON.stringify({ error: "Payment service not configured" }),
        { status: 500, headers: corsHeaders }
      );
    }

    const payazaAuthorization = encodePayazaAuth(secretKey);
    const proxyUrl = Deno.env.get("QUOTAGUARD_URL");

    const payload = {
      account_number: account_number,
      bank_code: bank_code,
    };

    const nameEnquiryUrl = "https://api.payaza.africa/live/merchant-payout/name_enquiry/";
    let payazaResponse: Response | null = null;

    // Try proxy first
    if (proxyUrl) {
      try {
        const httpClient = Deno.createHttpClient({ proxy: { url: proxyUrl } });
        payazaResponse = await fetch(nameEnquiryUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": payazaAuthorization,
            "Accept": "application/json",
          },
          body: JSON.stringify(payload),
          // @ts-ignore
          client: httpClient,
        });
        httpClient.close();
        const preview = await payazaResponse.clone().text();
        if (preview.includes("<html") || preview.includes("<!DOCTYPE")) {
          payazaResponse = null;
        }
      } catch (err) {
        console.error("Proxy name enquiry failed:", err);
      }
    }

    // Fallback: direct
    if (!payazaResponse) {
      payazaResponse = await fetch(nameEnquiryUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": payazaAuthorization,
          "Accept": "application/json",
        },
        body: JSON.stringify(payload),
      });
    }

    if (!payazaResponse) {
      return new Response(
        JSON.stringify({ error: "Could not reach payment service" }),
        { status: 503, headers: corsHeaders }
      );
    }

    const responseText = await payazaResponse.text();
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
