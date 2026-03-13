import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto as stdCrypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function encodePayazaAuth(secretKey: string): string {
  const encoded = btoa(secretKey);
  return `Payaza ${encoded}`;
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
  const keys = Object.keys(body).filter(k => body[k] !== null && body[k] !== undefined && body[k] !== "").sort();
  const strA = keys.map(k => `${k}=${body[k]}`).join("&");

  const encoder = new TextEncoder();
  const md5Buffer = await stdCrypto.subtle.digest("MD5", encoder.encode(strA));
  const md5Hex = Array.from(new Uint8Array(md5Buffer)).map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();

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

    const userId = user.id;
    const { amount, bank_code, account_number, account_name } = await req.json();

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ─── Server-side security verification check ───
    const { data: secSettings } = await adminClient
      .from("user_security_settings")
      .select("pin_enabled, totp_enabled, require_pin_withdrawal, require_totp_withdrawal, last_verified_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (secSettings) {
      const needsVerification =
        (secSettings.pin_enabled && secSettings.require_pin_withdrawal) ||
        (secSettings.totp_enabled && secSettings.require_totp_withdrawal);

      if (needsVerification) {
        const lastVerified = secSettings.last_verified_at ? new Date(secSettings.last_verified_at).getTime() : 0;
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        if (lastVerified < fiveMinutesAgo) {
          return new Response(
            JSON.stringify({ error: "Security verification required. Please verify your identity before withdrawing." }),
            { status: 403, headers: corsHeaders }
          );
        }
      }
    }

    // ─── Fetch settings ───
    const { data: settings } = await adminClient
      .from("commission_settings")
      .select("min_withdrawal_amount, withdrawal_cooldown_minutes, withdrawal_multiplier, withdrawal_limit_enabled, withdrawal_fee_percent, naira_payout_markdown, fallback_naira_rate, payout_provider")
      .limit(1)
      .single();

    const minWithdrawal = settings?.min_withdrawal_amount ?? 5;
    const withdrawalFeePercent = Math.max(0, Math.min(100, Number(settings?.withdrawal_fee_percent) || 0));
    const payoutMarkdown = Number(settings?.naira_payout_markdown) || 0;
    const fallbackRate = Number(settings?.fallback_naira_rate) || 1500;
    const preferredProvider = (settings as any)?.payout_provider === "palmpay" ? "palmpay" : "payaza";

    if (!amount || amount < minWithdrawal || amount > 50000) {
      return new Response(
        JSON.stringify({ error: `Amount must be between $${minWithdrawal} and $50,000` }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (!bank_code || !account_number || account_number.length < 10 || !account_name) {
      return new Response(
        JSON.stringify({ error: "Valid bank details (bank code, account number, account name) required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // ─── Deposit requirement check ───
    const { count: depositCount } = await adminClient
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("type", "deposit")
      .eq("status", "confirmed");

    if (!depositCount || depositCount === 0) {
      return new Response(
        JSON.stringify({ error: "You must make at least one deposit before withdrawing" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // ─── Withdrawal cap ───
    const withdrawalLimitEnabled = settings?.withdrawal_limit_enabled !== false;
    if (withdrawalLimitEnabled) {
      const { data: depositSum } = await adminClient
        .from("transactions")
        .select("amount")
        .eq("user_id", userId)
        .eq("type", "deposit")
        .eq("status", "confirmed");
      const totalDeposits = (depositSum || []).reduce((sum: number, r: any) => sum + Number(r.amount), 0);

      const { data: withdrawnSum } = await adminClient
        .from("transactions")
        .select("amount")
        .eq("user_id", userId)
        .eq("type", "withdrawal")
        .eq("status", "confirmed");
      const totalWithdrawn = (withdrawnSum || []).reduce((sum: number, r: any) => sum + Number(r.amount), 0);

      const withdrawalMultiplier = Math.max(1, Number(settings?.withdrawal_multiplier) || 2);
      const maxEligible = Math.max(0, (withdrawalMultiplier * totalDeposits) - totalWithdrawn);

      if (amount > maxEligible) {
        return new Response(
          JSON.stringify({ error: `Withdrawal exceeds your eligible limit. You can withdraw up to $${maxEligible.toFixed(2)} more.` }),
          { status: 400, headers: corsHeaders }
        );
      }
    }

    // ─── Cooldown ───
    const cooldownMinutes = settings?.withdrawal_cooldown_minutes ?? 5;
    const cooldownCutoff = new Date(Date.now() - cooldownMinutes * 60 * 1000).toISOString();
    const { data: recentWithdrawals } = await adminClient
      .from("withdrawal_requests")
      .select("id, created_at")
      .eq("user_id", userId)
      .gte("created_at", cooldownCutoff)
      .limit(1);

    if (recentWithdrawals && recentWithdrawals.length > 0) {
      const lastTime = new Date(recentWithdrawals[0].created_at);
      const waitUntil = new Date(lastTime.getTime() + cooldownMinutes * 60 * 1000);
      const minsLeft = Math.ceil((waitUntil.getTime() - Date.now()) / 60000);
      return new Response(
        JSON.stringify({ error: `Please wait ${minsLeft} minute${minsLeft !== 1 ? "s" : ""} before requesting another withdrawal` }),
        { status: 429, headers: corsHeaders }
      );
    }

    // ─── Balance check ───
    const { data: balance } = await adminClient
      .from("balances")
      .select("amount")
      .eq("user_id", userId)
      .eq("currency", "USDT")
      .single();

    const currentBalance = Number(balance?.amount || 0);
    if (currentBalance < amount) {
      return new Response(
        JSON.stringify({ error: "Insufficient balance" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // ─── Calculate NGN payout amount ───
    let liveRate = fallbackRate;
    try {
      const rateRes = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/get-naira-rate`,
        { headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}` } }
      );
      if (rateRes.ok) {
        const rateData = await rateRes.json();
        liveRate = rateData.live_rate || fallbackRate;
      }
    } catch {
      console.warn("Rate fetch failed, using fallback rate");
    }

    // Apply markdown (reduce rate for payouts)
    const payoutRate = Math.round(liveRate * (1 - payoutMarkdown / 100) * 100) / 100;
    const feeAmount = withdrawalFeePercent > 0 ? (amount * withdrawalFeePercent) / 100 : 0;
    const netAmount = amount - feeAmount;
    const ngnPayout = Math.floor(netAmount * payoutRate);

    console.log(`[Payout] USD ${amount} - fee ${feeAmount} = net ${netAmount} × ₦${payoutRate} = ₦${ngnPayout}`);

    // ─── Deduct balance immediately ───
    await adminClient
      .from("balances")
      .update({ amount: currentBalance - amount, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("currency", "USDT");

    const transactionReference = `wd_${userId}_${Date.now()}`;

    // ─── Create withdrawal records ───
    await adminClient.from("withdrawal_requests").insert({
      user_id: userId,
      amount,
      wallet_address: `${bank_code}:${account_number}:${account_name}`,
      crypto_currency: "NGN",
      status: "pending",
    });

    await adminClient.from("transactions").insert({
      user_id: userId,
      type: "withdrawal",
      amount,
      status: "pending",
      payment_provider: "payaza",
      nowpayments_payment_id: transactionReference,
    });

    // ─── Attempt payouts: Payaza first, then PalmPay fallback ───
    let payoutSuccess = false;
    let payoutProvider = "";

    // ─── Attempt 1: Payaza payout ───
    const payazaSecretKey = Deno.env.get("PAYAZA_SECRET_KEY");
    if (payazaSecretKey) {
      payoutSuccess = await tryPayazaPayout({
        secretKey: payazaSecretKey,
        transactionReference,
        ngnPayout,
        accountNumber: account_number,
        bankCode: bank_code,
        accountName: account_name,
        netAmount,
      });
      if (payoutSuccess) payoutProvider = "payaza";
    }

    // ─── Attempt 2: PalmPay payout (fallback) ───
    if (!payoutSuccess) {
      const palmPayAppId = Deno.env.get("PALMPAY_APP_ID");
      const palmPayPrivateKey = Deno.env.get("PALMPAY_PRIVATE_KEY");
      if (palmPayAppId && palmPayPrivateKey) {
        payoutSuccess = await tryPalmPayPayout({
          appId: palmPayAppId,
          privateKey: palmPayPrivateKey,
          transactionReference,
          ngnPayout,
          accountNumber: account_number,
          bankCode: bank_code,
          accountName: account_name,
          netAmount,
        });
        if (payoutSuccess) payoutProvider = "palmpay";
      }
    }

    // ─── Mark as completed if payout succeeded ───
    if (payoutSuccess) {
      await adminClient
        .from("withdrawal_requests")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("crypto_currency", "NGN")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1);

      await adminClient
        .from("transactions")
        .update({ status: "confirmed", payment_provider: payoutProvider })
        .eq("nowpayments_payment_id", transactionReference)
        .eq("type", "withdrawal");
    }

    const feeNote = feeAmount > 0 ? ` (Fee: $${feeAmount.toFixed(2)}, Net: $${netAmount.toFixed(2)})` : "";

    if (payoutSuccess) {
      await adminClient.from("notifications").insert({
        user_id: userId,
        title: "Withdrawal Sent! 🎉",
        message: `₦${ngnPayout.toLocaleString()} has been sent to your bank account (${account_number}).${feeNote}`,
        type: "withdrawal",
      });

      return new Response(
        JSON.stringify({
          success: true,
          ngn_amount: ngnPayout,
          payout_rate: payoutRate,
          message: `₦${ngnPayout.toLocaleString()} sent to ${account_number}`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fallback: pending for manual admin processing
    await adminClient.from("notifications").insert({
      user_id: userId,
      title: "Withdrawal Pending",
      message: `Your withdrawal of $${Number(amount).toFixed(2)}${feeNote} (₦${ngnPayout.toLocaleString()}) is being processed.`,
      type: "withdrawal",
    });

    return new Response(
      JSON.stringify({
        success: true,
        pending: true,
        ngn_amount: ngnPayout,
        payout_rate: payoutRate,
        message: "Withdrawal submitted for processing",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("request-payaza-withdrawal error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});

// ─── Payaza payout attempt ───
interface PayazaPayoutParams {
  secretKey: string;
  transactionReference: string;
  ngnPayout: number;
  accountNumber: string;
  bankCode: string;
  accountName: string;
  netAmount: number;
}

async function tryPayazaPayout(params: PayazaPayoutParams): Promise<boolean> {
  const { secretKey, transactionReference, ngnPayout, accountNumber, bankCode, accountName, netAmount } = params;

  try {
    const payazaAuthorization = encodePayazaAuth(secretKey);
    const proxyUrl = Deno.env.get("QUOTAGUARD_URL");

    const payoutPayload = {
      transaction_type: "nuban",
      transaction_reference: transactionReference,
      amount: ngnPayout,
      currency: "NGN",
      account_number: accountNumber,
      bank_code: bankCode,
      account_name: accountName,
      narration: `OPOLL withdrawal $${netAmount.toFixed(2)}`,
      sender_name: "OPOLL",
    };

    const payazaUrl = "https://api.payaza.africa/live/merchant-payout/initiate_payout/";
    let payazaResponse: Response | null = null;

    // Try with proxy first
    if (proxyUrl) {
      try {
        const httpClient = Deno.createHttpClient({ proxy: { url: proxyUrl } });
        payazaResponse = await fetch(payazaUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": payazaAuthorization,
            "Accept": "application/json",
          },
          body: JSON.stringify(payoutPayload),
          // @ts-ignore
          client: httpClient,
        });
        httpClient.close();
        const preview = await payazaResponse.clone().text();
        if (preview.includes("<html") || preview.includes("<!DOCTYPE")) {
          payazaResponse = null;
        }
      } catch (err) {
        console.error("Payaza proxy payout failed:", err);
      }
    }

    // Fallback: direct
    if (!payazaResponse) {
      payazaResponse = await fetch(payazaUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": payazaAuthorization,
          "Accept": "application/json",
        },
        body: JSON.stringify(payoutPayload),
      });
    }

    if (payazaResponse) {
      const payazaText = await payazaResponse.text();
      console.log("Payaza payout response:", payazaResponse.status, payazaText.substring(0, 500));

      if (payazaResponse.ok) {
        try {
          JSON.parse(payazaText); // Verify it's valid JSON
          return true;
        } catch {
          console.error("Failed to parse Payaza payout response");
        }
      }
    }
  } catch (err) {
    console.error("Payaza payout error:", err);
  }
  return false;
}

// ─── PalmPay payout attempt ───
interface PalmPayPayoutParams {
  appId: string;
  privateKey: string;
  transactionReference: string;
  ngnPayout: number;
  accountNumber: string;
  bankCode: string;
  accountName: string;
  netAmount: number;
}

async function tryPalmPayPayout(params: PalmPayPayoutParams): Promise<boolean> {
  const { appId, privateKey, transactionReference, ngnPayout, accountNumber, bankCode, accountName, netAmount } = params;

  try {
    // PalmPay amounts are in smallest unit (kobo), ngnPayout is already in NGN
    const amountInKobo = ngnPayout * 100;

    const notifyUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/payaza-webhook`;

    const body: Record<string, unknown> = {
      requestTime: Date.now(),
      version: "V1.1",
      nonceStr: generateNonceStr(),
      orderId: transactionReference.substring(0, 32), // PalmPay max 32 chars
      payeeName: accountName,
      payeeBankCode: bankCode,
      payeeBankAccNo: accountNumber,
      amount: amountInKobo,
      currency: "NGN",
      notifyUrl: notifyUrl,
      remark: `OPOLL withdrawal $${netAmount.toFixed(2)}`,
    };

    const signature = await palmPaySign(body, privateKey);
    const url = `${PALMPAY_BASE_URL}/api/v2/merchant/payment/payout`;

    console.log(`PalmPay payout → ${url}, amount: ₦${ngnPayout} (${amountInKobo} kobo)`);

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
    console.log(`PalmPay payout response: ${res.status} ${text.substring(0, 500)}`);

    if (res.ok) {
      try {
        const data = JSON.parse(text);
        // orderStatus 2 = success, 1 = processing (treat as success since PalmPay will callback)
        if (data?.respCode === "00000000" && (data?.data?.orderStatus === 2 || data?.data?.orderStatus === 1)) {
          console.log(`PalmPay payout success: orderNo=${data.data.orderNo}, orderId=${data.data.orderId}`);
          return true;
        }
        console.warn(`PalmPay payout not successful: respCode=${data?.respCode}, orderStatus=${data?.data?.orderStatus}`);
      } catch {
        console.error("Failed to parse PalmPay payout response");
      }
    }
  } catch (err) {
    console.error("PalmPay payout error:", err);
  }
  return false;
}
