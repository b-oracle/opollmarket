import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createSign } from "node:crypto";
import { createHash } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── PalmPay signature helpers ───
function generateNonceStr(len = 32): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) result += chars[arr[i] % chars.length];
  return result;
}

/** Normalize a PEM key that may have literal \n or \\n instead of real newlines */
function normalizePem(pem: string): string {
  // Replace literal \n (from env var) with actual newlines
  let normalized = pem.replace(/\\n/g, "\n").replace(/\\r/g, "");
  // Ensure proper PEM structure with newlines around headers
  normalized = normalized.replace(/(-----BEGIN [A-Z ]+-----)/g, "$1\n");
  normalized = normalized.replace(/(-----END [A-Z ]+-----)/g, "\n$1");
  // Remove any double newlines
  normalized = normalized.replace(/\n{3,}/g, "\n\n");
  return normalized.trim();
}

/**
 * PalmPay signing using node:crypto which handles PEM format natively.
 * Steps: sort params → MD5 hash → uppercase hex → SHA1WithRSA sign → base64
 */
function palmPaySign(body: Record<string, unknown>, privateKeyPem: string): string {
  const keys = Object.keys(body)
    .filter(k => body[k] !== null && body[k] !== undefined && body[k] !== "")
    .sort();
  const strA = keys.map(k => `${k}=${body[k]}`).join("&");

  // MD5 hash of the sorted params string
  const md5Hex = createHash("md5").update(strA).digest("hex").toUpperCase();

  // Normalize the PEM key (handle literal \n from env vars)
  const normalizedKey = normalizePem(privateKeyPem);

  // Sign with SHA1WithRSA using node:crypto (handles PKCS#1 and PKCS#8 PEM automatically)
  const signer = createSign("SHA1");
  signer.update(md5Hex);
  const signature = signer.sign(normalizedKey, "base64");

  return signature;
}

const PALMPAY_BASE_URL = "https://open-gw-prod.palmpay-inc.com";

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

    // ─── Always use Payaza for name enquiry ───
    if (payazaSecretKey || payazaMerchantKey) {
      accountName = await tryPayazaNameEnquiry(bank_code, account_number, payazaSecretKey ?? "", payazaMerchantKey ?? "");
    }

    if (accountName) {
      return new Response(
        JSON.stringify({ account_name: accountName }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.warn("All name enquiry providers failed. Falling back to manual confirmation.");
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
      headers: { Authorization: `Payaza ${encodedSecret}` },
    });
    authVariants.push({
      label: "bearer-secret",
      headers: { Authorization: `Bearer ${secretKey}` },
    });
  }

  if (merchantKey) {
    const encodedMerchant = btoa(merchantKey);
    authVariants.push({
      label: "payaza-merchant",
      headers: { Authorization: `Payaza ${encodedMerchant}` },
    });
    authVariants.push({
      label: "bearer-merchant",
      headers: { Authorization: `Bearer ${merchantKey}` },
    });
    authVariants.push({
      label: "x-api-key-merchant",
      headers: { "x-api-key": merchantKey },
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

// ─── PalmPay name enquiry (using node:crypto for reliable RSA signing) ───
async function tryPalmPayNameEnquiry(bankCode: string, accountNumber: string, appId: string, privateKey: string): Promise<string> {
  try {
    const body: Record<string, unknown> = {
      requestTime: Date.now(),
      version: "V1.1",
      nonceStr: generateNonceStr(),
      bankCode: bankCode,
      bankAccNo: accountNumber,
    };

    console.log("PalmPay: signing with node:crypto...");
    const signature = palmPaySign(body, privateKey);
    console.log("PalmPay: signature generated successfully");

    const url = `${PALMPAY_BASE_URL}/api/v2/payment/merchant/payout/queryBankAccount`;

    console.log(`PalmPay name enquiry → ${url}`);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": `Bearer ${appId}`,
        "Signature": signature,
        "CountryCode": "NG",
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    console.log(`PalmPay name enquiry response: ${res.status} ${text.substring(0, 400)}`);

    if (res.ok) {
      const data = JSON.parse(text);
      if (data?.respCode === "00000000" && (data?.data?.status === "Success" || data?.data?.Status === "Success")) {
        return data.data.accountName || "";
      }
      // Some responses have different success codes
      if (data?.data?.accountName && data?.respCode?.startsWith("0000")) {
        return data.data.accountName;
      }
    }
  } catch (err) {
    console.error("PalmPay name enquiry error:", err);
  }
  return "";
}
