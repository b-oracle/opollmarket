import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto as stdCrypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function encodePayazaAuth(secretKey: string): string {
  return `Payaza ${btoa(secretKey)}`;
}

// ─── PalmPay signature helpers ───
function generateNonceStr(len = 32): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) result += chars[arr[i] % chars.length];
  return result;
}

async function palmPaySign(body: Record<string, unknown>, privateKeyPem: string): Promise<string> {
  // Step 1: Sort params by ASCII key order, build key=value string
  const keys = Object.keys(body).filter(k => body[k] !== null && body[k] !== undefined && body[k] !== "").sort();
  const strA = keys.map(k => `${k}=${body[k]}`).join("&");

  // Step 2: MD5(strA) → uppercase hex
  const encoder = new TextEncoder();
  const md5Buffer = await stdCrypto.subtle.digest("MD5", encoder.encode(strA));
  const md5Hex = Array.from(new Uint8Array(md5Buffer)).map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();

  // Step 3: SHA1WithRSA sign the md5Hex with private key
  const pemBody = privateKeyPem
    .replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----/g, "")
    .replace(/-----END (?:RSA )?PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const binaryDer = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-1" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(md5Hex));
  return encodeBase64(new Uint8Array(signature));
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

    // ─── Attempt 1: Payaza name enquiry ───
    const payazaSecretKey = Deno.env.get("PAYAZA_SECRET_KEY");
    if (payazaSecretKey) {
      accountName = await tryPayazaNameEnquiry(bank_code, account_number, payazaSecretKey);
    }

    // ─── Attempt 2: PalmPay name enquiry (fallback) ───
    if (!accountName) {
      const palmPayAppId = Deno.env.get("PALMPAY_APP_ID");
      const palmPayPrivateKey = Deno.env.get("PALMPAY_PRIVATE_KEY");
      if (palmPayAppId && palmPayPrivateKey) {
        accountName = await tryPalmPayNameEnquiry(bank_code, account_number, palmPayAppId, palmPayPrivateKey);
      }
    }

    // If name enquiry succeeded, return the name
    if (accountName) {
      return new Response(
        JSON.stringify({ account_name: accountName }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Graceful degradation: all providers failed — allow manual confirmation
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
async function tryPayazaNameEnquiry(bankCode: string, accountNumber: string, secretKey: string): Promise<string> {
  const payazaAuthorization = encodePayazaAuth(secretKey);
  const proxyUrl = Deno.env.get("QUOTAGUARD_URL");

  const endpoints = [
    "https://api.payaza.africa/live/merchant-payout/account/name_enquiry/",
    "https://api.payaza.africa/live/merchant-payout/name_enquiry/",
    "https://api.payaza.africa/live/merchant-payout/name-enquiry/",
    "https://api.payaza.africa/live/merchant-payout/resolve_account/",
  ];

  const payload = { account_number: accountNumber, bank_code: bankCode, currency: "NGN" };
  const fetchOpts = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": payazaAuthorization,
      "Accept": "application/json",
    },
    body: JSON.stringify(payload),
  };

  for (const url of endpoints) {
    try {
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
          console.log(`Payaza ${attempt.label} ${url} → ${res.status}: ${text.substring(0, 200)}`);
          if (attempt.opts.client) try { attempt.opts.client.close(); } catch {}
          if (text.includes("<html") || text.includes("<!DOCTYPE")) continue;
          if (res.ok) {
            try {
              const data = JSON.parse(text);
              const responseData = data?.data || data?.response_content || data;
              const name = responseData?.account_name || responseData?.accountName || responseData?.name || "";
              if (name) return name;
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

// ─── PalmPay name enquiry ───
async function tryPalmPayNameEnquiry(bankCode: string, accountNumber: string, appId: string, privateKey: string): Promise<string> {
  try {
    const body: Record<string, unknown> = {
      requestTime: Date.now(),
      version: "V1.1",
      nonceStr: generateNonceStr(),
      bankCode: bankCode,
      bankAccNo: accountNumber,
    };

    const signature = await palmPaySign(body, privateKey);
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
    console.log(`PalmPay name enquiry response: ${res.status} ${text.substring(0, 300)}`);

    if (res.ok) {
      const data = JSON.parse(text);
      if (data?.respCode === "00000000" && data?.data?.status === "Success") {
        return data.data.accountName || "";
      }
    }
  } catch (err) {
    console.error("PalmPay name enquiry error:", err);
  }
  return "";
}
