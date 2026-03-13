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

    const { bank_code, account_number } = await req.json();

    if (!bank_code || !account_number || account_number.length < 10) {
      return new Response(
        JSON.stringify({ error: "Valid bank code and 10-digit account number required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    let accountName = "";

    const payazaSecretKey = Deno.env.get("PAYAZA_SECRET_KEY");
    const payazaMerchantKey = Deno.env.get("PAYAZA_MERCHANT_KEY");

    if (payazaSecretKey || payazaMerchantKey) {
      accountName = await tryPayazaNameEnquiry(bank_code, account_number, payazaSecretKey ?? "", payazaMerchantKey ?? "");
    }

    if (accountName) {
      return new Response(
        JSON.stringify({ account_name: accountName }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.warn("Name enquiry failed. Falling back to manual confirmation.");
    return new Response(
      JSON.stringify({
        account_name: "",
        manual_confirm: true,
        message: "We couldn't auto-verify the account name. Please confirm it manually before proceeding.",
      }),
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

// ─── Payaza name enquiry ───
async function tryPayazaNameEnquiry(
  bankCode: string,
  accountNumber: string,
  secretKey: string,
  merchantKey = "",
): Promise<string> {
  const proxyUrl = Deno.env.get("QUOTAGUARD_URL");

  const endpoints = [
    "https://api.payaza.africa/live/merchant-collection/merchant/bank/name-enquiry",
    "https://api.payaza.africa/live/zap/merchant/bank/name-enquiry",
  ];

  const payload = {
    account_number: accountNumber,
    bank_code: bankCode,
    currency: "NGN",
  };

  const authVariants: Array<{ label: string; headers: Record<string, string> }> = [];

  if (secretKey) {
    const encodedSecret = btoa(secretKey);
    authVariants.push({
      label: "payaza-secret",
      headers: { Authorization: `Payaza ${encodedSecret}`, "X-TenantID": "live" },
    });
  }

  if (merchantKey) {
    const encodedMerchant = btoa(merchantKey);
    authVariants.push({
      label: "payaza-merchant",
      headers: { Authorization: `Payaza ${encodedMerchant}`, "X-TenantID": "live" },
    });
  }

  for (const endpoint of endpoints) {
    for (const auth of authVariants) {
      const fetchOpts: RequestInit = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          ...auth.headers,
        },
        body: JSON.stringify(payload),
      };

      const attempts: Array<{ label: string; opts: RequestInit & { client?: Deno.HttpClient } }> = [];
      if (proxyUrl) {
        const httpClient = Deno.createHttpClient({ proxy: { url: proxyUrl } });
        attempts.push({ label: "Proxy", opts: { ...fetchOpts, client: httpClient } });
      }
      attempts.push({ label: "Direct", opts: fetchOpts });

      for (const attempt of attempts) {
        try {
          const res = await fetch(endpoint, attempt.opts);
          const text = await res.text();
          console.log(`Payaza ${attempt.label} ${auth.label} ${endpoint} → ${res.status}: ${text.substring(0, 300)}`);
          if (attempt.opts.client) {
            try { attempt.opts.client.close(); } catch {}
          }

          if (text.includes("<html") || text.includes("<!DOCTYPE")) continue;

          try {
            const data = JSON.parse(text);
            const responseData = data?.response_content || data?.data || data?.service_response?.response_content || data;
            const name =
              responseData?.account_name ||
              responseData?.accountName ||
              responseData?.beneficiary_name ||
              responseData?.beneficiaryName ||
              responseData?.beneficiaryAccountName ||
              responseData?.name ||
              "";

            if ((res.ok || res.status === 200 || res.status === 201) && typeof name === "string" && name.trim().length > 1) {
              return name.trim();
            }
          } catch {
            continue;
          }
        } catch (err) {
          console.warn(`Payaza ${attempt.label} ${auth.label} ${endpoint} error:`, String(err));
          if (attempt.opts.client) {
            try { attempt.opts.client.close(); } catch {}
          }
        }
      }
    }
  }

  return "";
}
