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

    // ─── Fetch preferred payout provider from settings ───
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: settings } = await adminClient
      .from("commission_settings")
      .select("payout_provider")
      .limit(1)
      .single();
    const preferredProvider = (settings as any)?.payout_provider === "palmpay" ? "palmpay" : "payaza";

    const payazaSecretKey = Deno.env.get("PAYAZA_SECRET_KEY");
    const palmPayAppId = Deno.env.get("PALMPAY_APP_ID");
    const palmPayPrivateKey = Deno.env.get("PALMPAY_PRIVATE_KEY");

    // ─── Try preferred provider first ───
    if (preferredProvider === "palmpay" && palmPayAppId && palmPayPrivateKey) {
      accountName = await tryPalmPayNameEnquiry(bank_code, account_number, palmPayAppId, palmPayPrivateKey);
    } else if (payazaSecretKey) {
      accountName = await tryPayazaNameEnquiry(bank_code, account_number, payazaSecretKey);
    }

    // ─── Fallback to the other provider ───
    if (!accountName) {
      if (preferredProvider === "palmpay" && payazaSecretKey) {
        accountName = await tryPayazaNameEnquiry(bank_code, account_number, payazaSecretKey);
      } else if (preferredProvider === "payaza" && palmPayAppId && palmPayPrivateKey) {
        accountName = await tryPalmPayNameEnquiry(bank_code, account_number, palmPayAppId, palmPayPrivateKey);
      }
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
// Uses the Payaza checkout/collection API for name enquiry (payout endpoints are AWS-protected)
async function tryPayazaNameEnquiry(bankCode: string, accountNumber: string, secretKey: string): Promise<string> {
  const proxyUrl = Deno.env.get("QUOTAGUARD_URL");

  // The Payaza collection/checkout API accepts Payaza auth; payout endpoints use AWS SigV4
  const endpoints = [
    "https://router-live.78financials.com/api/request/merchant/nameEnquiry",
    "https://api.payaza.africa/live/zap/merchant/bank/name-enquiry",
  ];

  const payloads = [
    // 78financials router format
    {
      service_payload: {
        request_application: "Payaza",
        application_module: "USER_MODULE",
        application_version: "1.0.0",
        request_class: "MerchantNameEnquiry",
        "payment_channel": "bank",
        "payment_type": "nuban",
        account_number: accountNumber,
        bank_code: bankCode,
      },
    },
    // Direct format
    {
      account_number: accountNumber,
      bank_code: bankCode,
      currency: "NGN",
    },
  ];

  for (let i = 0; i < endpoints.length; i++) {
    const url = endpoints[i];
    const payload = payloads[i] || payloads[payloads.length - 1];

    try {
      const fetchOpts: RequestInit = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Payaza ${btoa(secretKey)}`,
          "Accept": "application/json",
        },
        body: JSON.stringify(payload),
      };

      // Try proxy first, then direct
      const attempts: Array<{ label: string; opts: any }> = [];
      if (proxyUrl) {
        const httpClient = Deno.createHttpClient({ proxy: { url: proxyUrl } });
        attempts.push({ label: "Proxy", opts: { ...fetchOpts, client: httpClient } });
      }
      attempts.push({ label: "Direct", opts: fetchOpts });

      for (const attempt of attempts) {
        try {
          const res = await fetch(url, attempt.opts);
          const text = await res.text();
          console.log(`Payaza ${attempt.label} ${url} → ${res.status}: ${text.substring(0, 300)}`);
          if (attempt.opts.client) try { attempt.opts.client.close(); } catch {}

          if (text.includes("<html") || text.includes("<!DOCTYPE")) continue;

          if (res.ok || res.status === 200 || res.status === 201) {
            try {
              const data = JSON.parse(text);
              // Handle nested response structures
              const responseData = data?.response_content || data?.data || data?.service_response?.response_content || data;
              const name =
                responseData?.account_name ||
                responseData?.accountName ||
                responseData?.name ||
                responseData?.beneficiary_name ||
                responseData?.beneficiaryName ||
                "";
              if (name && name.length > 1) return name;
            } catch { continue; }
          }
        } catch (err) {
          console.warn(`Payaza ${attempt.label} ${url} error:`, String(err));
          if (attempt.opts.client) try { attempt.opts.client.close(); } catch {}
        }
      }
    } catch (err) {
      console.warn(`Payaza endpoint ${url} error:`, String(err));
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
