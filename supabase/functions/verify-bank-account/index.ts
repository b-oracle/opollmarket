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
    const { bank_code, account_number } = await req.json();

    const normalizedBankCode = String(bank_code ?? "").trim();
    const normalizedAccountNumber = String(account_number ?? "").replace(/\D/g, "");

    if (!normalizedBankCode || normalizedAccountNumber.length !== 10) {
      return new Response(
        JSON.stringify({ error: "Valid bank code and 10-digit account number required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let accountName = "";

    const payazaSecretKey = Deno.env.get("PAYAZA_SECRET_KEY");
    const payazaMerchantKey = Deno.env.get("PAYAZA_MERCHANT_KEY");

    if (payazaSecretKey || payazaMerchantKey) {
      accountName = await tryPayazaNameEnquiry(normalizedBankCode, normalizedAccountNumber, payazaSecretKey ?? "", payazaMerchantKey ?? "");
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
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

  // Try both raw and normalized bank-code variants because Payaza often expects 6-digit bank codes
  const bankCodeCandidates = getBankCodeCandidates(bankCode);

  // Try multiple endpoints
  const endpoints = [
    "https://api.payaza.africa/live/payaza-account/api/v1/mainaccounts/merchant/provider/enquiry",
    "https://router.payaza.africa/api/request/secure-merchant-resolve-account-details",
  ];

  // Auth header variants (some merchant configs accept secret key auth, others merchant key auth)
  if (!secretKey) return "";
  const authVariants: Array<{ label: string; value: string }> = [
    { label: "secret", value: `Payaza ${btoa(secretKey)}` },
  ];
  if (merchantKey) {
    authVariants.push({ label: "merchant", value: `Payaza ${btoa(merchantKey)}` });
  }

  for (const authVariant of authVariants) {
    for (const normalizedBankCode of bankCodeCandidates) {
      // Multiple payload formats — Payaza API has changed formats over time
      const payloadVariants = [
        // Format 1: receiver_ prefixed (newer SDK format)
        {
          label: "receiver-format",
          body: {
            receiver_account_number: accountNumber,
            receiver_bank_code: normalizedBankCode,
            currency: "NGN",
          },
        },
        // Format 2: flat format (original)
        {
          label: "flat-format",
          body: {
            account_number: accountNumber,
            bank_code: normalizedBankCode,
            currency: "NGN",
          },
        },
        // Format 3: service_payload wrapper (Payaza checkout SDK format)
        {
          label: "service-payload-format",
          body: {
            service_type: "Account_enquiry",
            service_payload: {
              request_application: "Payaza",
              application_module: "USER_MODULE",
              application_version: "1.0.0",
              request_class: "MerchantNameEnquiry",
              account_number: accountNumber,
              bank_code: normalizedBankCode,
              currency: "NGN",
            },
          },
        },
      ];

      for (const endpoint of endpoints) {
        for (const variant of payloadVariants) {
          const fetchOpts: RequestInit = {
            method: "POST",
            headers: {
              Authorization: authVariant.value,
              "X-TenantID": "live",
              "Content-Type": "application/json",
              "Accept": "application/json",
            },
            body: JSON.stringify(variant.body),
          };

          // Try proxy first if available, then direct
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
              console.log(`Payaza ${attempt.label} auth:${authVariant.label} ${variant.label} bank:${normalizedBankCode} ${endpoint.split("/").pop()} → ${res.status}: ${text.substring(0, 400)}`);
              if (attempt.opts.client) {
                try { attempt.opts.client.close(); } catch {}
              }

              if (text.includes("<html") || text.includes("<!DOCTYPE")) continue;
              if (res.status >= 500) continue; // Server error, try next variant

              try {
                const data = JSON.parse(text);
                const name = extractAccountName(data);

                if ((res.ok || res.status === 200 || res.status === 201) && typeof name === "string" && name.trim().length > 1) {
                  console.log(`Payaza name resolved: "${name.trim()}" via ${variant.label} with bank code ${normalizedBankCode} (${authVariant.label} auth)`);
                  return name.trim();
                }
              } catch {
                continue;
              }
            } catch (err) {
              console.warn(`Payaza ${attempt.label} ${variant.label} error:`, String(err));
              if (attempt.opts.client) {
                try { attempt.opts.client.close(); } catch {}
              }
            }
          }
        }
      }
    }
  }

  return "";
}

function getBankCodeCandidates(bankCode: string): string[] {
  const digits = String(bankCode ?? "").replace(/\D/g, "");
  if (!digits) return [];

  const candidates = new Set<string>();
  candidates.add(digits);

  // Legacy 3-digit CBN codes often need 6-digit format for gateway name enquiry
  if (digits.length < 6) candidates.add(digits.padStart(6, "0"));
  if (digits.length > 6) candidates.add(digits.slice(-6));

  return [...candidates];
}

// Extract account name from various Payaza response shapes
function extractAccountName(data: any): string {
  if (!data) return "";

  // Direct fields
  if (data.account_name) return data.account_name;
  if (data.accountName) return data.accountName;
  if (data.beneficiary_name) return data.beneficiary_name;
  if (data.beneficiaryName) return data.beneficiaryName;
  if (data.name) return data.name;

  // Nested in response_content
  const rc = data.response_content || data.data || data.service_response?.response_content;
  if (rc) {
    return rc.account_name || rc.accountName || rc.beneficiary_name || rc.beneficiaryName || rc.beneficiaryAccountName || rc.name || "";
  }

  // Nested in service_response
  const sr = data.service_response;
  if (sr) {
    return sr.account_name || sr.accountName || sr.beneficiary_name || sr.beneficiaryName || "";
  }

  return "";
}
