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

// Proper ASN.1 DER length encoding
function encodeDerLength(length: number): Uint8Array {
  if (length < 0x80) {
    return new Uint8Array([length]);
  } else if (length < 0x100) {
    return new Uint8Array([0x81, length]);
  } else if (length < 0x10000) {
    return new Uint8Array([0x82, (length >> 8) & 0xff, length & 0xff]);
  } else {
    return new Uint8Array([0x83, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff]);
  }
}

// Proper PKCS#1 → PKCS#8 wrapper with correct ASN.1 DER encoding
function wrapPkcs1ToPkcs8(pkcs1Der: Uint8Array): Uint8Array {
  // AlgorithmIdentifier for RSA: SEQUENCE { OID rsaEncryption, NULL }
  const algorithmIdentifier = new Uint8Array([
    0x30, 0x0d,
    0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
    0x05, 0x00,
  ]);

  // Version INTEGER 0
  const version = new Uint8Array([0x02, 0x01, 0x00]);

  // OCTET STRING wrapping the PKCS#1 key
  const octetStringTag = new Uint8Array([0x04]);
  const octetStringLen = encodeDerLength(pkcs1Der.length);

  // Total inner content length
  const innerLen = version.length + algorithmIdentifier.length + octetStringTag.length + octetStringLen.length + pkcs1Der.length;

  // Outer SEQUENCE
  const sequenceTag = new Uint8Array([0x30]);
  const sequenceLen = encodeDerLength(innerLen);

  // Assemble
  const result = new Uint8Array(sequenceTag.length + sequenceLen.length + innerLen);
  let offset = 0;
  result.set(sequenceTag, offset); offset += sequenceTag.length;
  result.set(sequenceLen, offset); offset += sequenceLen.length;
  result.set(version, offset); offset += version.length;
  result.set(algorithmIdentifier, offset); offset += algorithmIdentifier.length;
  result.set(octetStringTag, offset); offset += octetStringTag.length;
  result.set(octetStringLen, offset); offset += octetStringLen.length;
  result.set(pkcs1Der, offset);

  return result;
}

async function palmPaySign(body: Record<string, unknown>, privateKeyPem: string): Promise<string> {
  const keys = Object.keys(body).filter(k => body[k] !== null && body[k] !== undefined && body[k] !== "").sort();
  const strA = keys.map(k => `${k}=${body[k]}`).join("&");

  const encoder = new TextEncoder();
  const md5Buffer = await stdCrypto.subtle.digest("MD5", encoder.encode(strA));
  const md5Hex = Array.from(new Uint8Array(md5Buffer)).map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();

  const isPkcs1 = privateKeyPem.includes("BEGIN RSA PRIVATE KEY");
  const pemBody = privateKeyPem
    .replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----/g, "")
    .replace(/-----END (?:RSA )?PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const rawDer = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

  // Try importing the key - attempt PKCS#8 first, then wrap PKCS#1 if needed
  let key: CryptoKey;
  try {
    // Try direct PKCS#8 import first (handles both PKCS#8 keys and correctly-formatted ones)
    key = await crypto.subtle.importKey(
      "pkcs8",
      rawDer.buffer,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-1" },
      false,
      ["sign"]
    );
    console.log("PalmPay key imported as PKCS#8 directly");
  } catch (e1) {
    console.log("Direct PKCS#8 import failed, trying PKCS#1 wrapping:", String(e1).substring(0, 100));
    try {
      // Wrap PKCS#1 to PKCS#8 and retry
      const pkcs8Der = wrapPkcs1ToPkcs8(rawDer);
      key = await crypto.subtle.importKey(
        "pkcs8",
        pkcs8Der.buffer,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-1" },
        false,
        ["sign"]
      );
      console.log("PalmPay key imported after PKCS#1→PKCS#8 wrapping");
    } catch (e2) {
      console.error("Both PKCS#8 and PKCS#1 wrapping failed:", String(e2));
      throw new Error("Failed to import PalmPay private key. Please verify the key format.");
    }
  }

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
    const payazaMerchantKey = Deno.env.get("PAYAZA_MERCHANT_KEY");
    const palmPayAppId = Deno.env.get("PALMPAY_APP_ID");
    const palmPayPrivateKey = Deno.env.get("PALMPAY_PRIVATE_KEY");

    // ─── Try preferred provider first ───
    if (preferredProvider === "palmpay" && palmPayAppId && palmPayPrivateKey) {
      accountName = await tryPalmPayNameEnquiry(bank_code, account_number, palmPayAppId, palmPayPrivateKey);
    } else if (payazaSecretKey || payazaMerchantKey) {
      accountName = await tryPayazaNameEnquiry(bank_code, account_number, payazaSecretKey, payazaMerchantKey);
    }

    // ─── Fallback to the other provider ───
    if (!accountName) {
      if (preferredProvider === "palmpay" && (payazaSecretKey || payazaMerchantKey)) {
        accountName = await tryPayazaNameEnquiry(bank_code, account_number, payazaSecretKey, payazaMerchantKey);
      } else if (preferredProvider === "payaza" && palmPayAppId && palmPayPrivateKey) {
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
async function tryPayazaNameEnquiry(bankCode: string, accountNumber: string, secretKey?: string, merchantKey?: string): Promise<string> {
  const proxyUrl = Deno.env.get("QUOTAGUARD_URL");

  // Try multiple auth methods: secret key auth AND merchant key auth
  const authHeaders: Array<{ label: string; value: string }> = [];
  if (secretKey) {
    authHeaders.push({ label: "SecretKey", value: `Payaza ${btoa(secretKey)}` });
  }
  if (merchantKey) {
    // Some Payaza payout endpoints use merchant key directly
    authHeaders.push({ label: "MerchantKey", value: `Payaza ${btoa(merchantKey)}` });
  }
  if (secretKey) {
    // Also try raw API key format (some endpoints accept this)
    authHeaders.push({ label: "APIKey", value: secretKey });
  }

  const endpoints = [
    "https://api.payaza.africa/live/merchant-payout/account/name_enquiry/",
    "https://api.payaza.africa/live/merchant-payout/name_enquiry/",
    "https://api.payaza.africa/live/merchant-payout/name-enquiry/",
    "https://api.payaza.africa/live/merchant-payout/resolve_account/",
  ];

  const payload = { account_number: accountNumber, bank_code: bankCode, currency: "NGN" };

  for (const authConfig of authHeaders) {
    for (const url of endpoints) {
      const fetchOpts: RequestInit = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authConfig.value,
          "Accept": "application/json",
        },
        body: JSON.stringify(payload),
      };

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
            console.log(`Payaza[${authConfig.label}] ${attempt.label} ${url} → ${res.status}: ${text.substring(0, 200)}`);
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
            // If we get a non-403 response, the auth is correct but endpoint might be wrong
            // If 403, try next auth method
            if (res.status === 403) break; // This auth method doesn't work for this endpoint pattern
          } catch (err) {
            console.warn(`Payaza[${authConfig.label}] ${attempt.label} ${url} error:`, String(err));
            if (attempt.opts.client) try { attempt.opts.client.close(); } catch {}
          }
        }
      } catch (err) {
        console.warn(`Payaza endpoint ${url} error:`, String(err));
      }
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
      if (data?.respCode === "00000000" && (data?.data?.status === "Success" || data?.data?.Status === "Success")) {
        return data.data.accountName || "";
      }
    }
  } catch (err) {
    console.error("PalmPay name enquiry error:", err);
  }
  return "";
}
