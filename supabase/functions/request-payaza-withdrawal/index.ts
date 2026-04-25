import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Base64-encode the key (matching official payaza_lib SDK encrypt()) */
function encodePayazaKey(key: string): string {
  return btoa(key);
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

    const userId = user.id;
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
                     req.headers.get("x-real-ip") || "unknown";
    const clientUa = req.headers.get("user-agent") || "unknown";
    console.log(`[NGN Withdrawal] user=${userId} ip=${clientIp} ua=${clientUa}`);

    const { amount, bank_code, account_number, account_name, idempotency_key } = await req.json();

    // Idempotency key — relies on the unique index on withdrawal_requests.idempotency_key
    // for race protection (see insert below).
    const withdrawalIdempotencyKey =
      idempotency_key || `${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ─── Block check: reject if user is blocked ───
    const { data: profile } = await adminClient
      .from("profiles")
      .select("is_blocked, kyc_status")
      .eq("id", userId)
      .maybeSingle();

    if (profile?.is_blocked) {
      return new Response(
        JSON.stringify({ error: "Your account has been suspended. Contact support." }),
        { status: 403, headers: corsHeaders }
      );
    }

    // ─── KYC gate: require verification before withdrawals ───
    const kycStatus = profile?.kyc_status || "none";
    if (kycStatus === "none" || kycStatus === "pending" || kycStatus === "rejected") {
      return new Response(
        JSON.stringify({ error: "Identity verification required before withdrawals. Complete KYC in your profile settings." }),
        { status: 403, headers: corsHeaders }
      );
    }

    // Fetch admin-configured daily limits
    const { data: commSettings } = await adminClient
      .from("commission_settings")
      .select("kyc_tier1_daily_limit, kyc_tier2_daily_limit, max_daily_withdrawals")
      .limit(1)
      .single();
    const kycDailyLimit = kycStatus === "tier2"
      ? (commSettings?.kyc_tier2_daily_limit ?? 50000)
      : (commSettings?.kyc_tier1_daily_limit ?? 500);
    const maxDailyWithdrawals = commSettings?.max_daily_withdrawals ?? 5;

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentWithdrawals } = await adminClient
      .from("transactions")
      .select("amount")
      .eq("user_id", userId)
      .eq("type", "withdrawal")
      .in("status", ["confirmed", "pending"])
      .gte("created_at", twentyFourHoursAgo);
    const dailyTotal = (recentWithdrawals || []).reduce((s, r) => s + Number(r.amount), 0);
    if (dailyTotal + amount > kycDailyLimit) {
      return new Response(
        JSON.stringify({ error: `Daily withdrawal limit for your KYC tier is $${kycDailyLimit}. You've used $${dailyTotal.toFixed(2)} today.` }),
        { status: 403, headers: corsHeaders }
      );
    }

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
      .select("min_withdrawal_amount, withdrawal_cooldown_minutes, withdrawal_multiplier, withdrawal_limit_enabled, withdrawal_fee_percent, naira_payout_markdown, fallback_naira_rate, fallback_payout_naira_rate, payout_provider")
      .limit(1)
      .single();

    const minWithdrawal = settings?.min_withdrawal_amount ?? 5;
    const withdrawalFeePercent = Math.max(0, Math.min(100, Number(settings?.withdrawal_fee_percent) || 0));
    const payoutMarkdown = Number(settings?.naira_payout_markdown) || 0;
    const fallbackRate = Number((settings as any)?.fallback_payout_naira_rate) || Number(settings?.fallback_naira_rate) || 1500;

    // Use dynamic max from settings
    const { data: depositLimitsData } = await adminClient
      .from("commission_settings")
      .select("deposit_max_amount")
      .limit(1)
      .single();
    const maxWithdrawal = Number(depositLimitsData?.deposit_max_amount) || 50000;

    if (!amount || amount < minWithdrawal || amount > maxWithdrawal) {
      return new Response(
        JSON.stringify({ error: `Amount must be between $${minWithdrawal} and $${maxWithdrawal.toLocaleString()}` }),
        { status: 400, headers: corsHeaders }
      );
    }

    const normalizedBankCode = String(bank_code ?? "").replace(/\s+/g, "").trim();
    const normalizedAccountNumber = String(account_number ?? "").replace(/\D/g, "");

    if (!normalizedBankCode || normalizedAccountNumber.length !== 10 || !account_name) {
      return new Response(
        JSON.stringify({ error: "Valid bank details (bank code, account number, account name) required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const payazaBankCode =
      Object.entries(PAYAZA_TO_FW_MAP).find(([, fwCode]) => fwCode === normalizedBankCode)?.[0] ||
      normalizedBankCode;

    if (payazaBankCode !== normalizedBankCode) {
      console.log(`Mapped incoming bank code ${normalizedBankCode} -> ${payazaBankCode} for Payaza payout`);
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
    const { data: cooldownWithdrawals } = await adminClient
      .from("withdrawal_requests")
      .select("id, created_at")
      .eq("user_id", userId)
      .gte("created_at", cooldownCutoff)
      .limit(1);

    if (cooldownWithdrawals && cooldownWithdrawals.length > 0) {
      const lastTime = new Date(cooldownWithdrawals[0].created_at);
      const waitUntil = new Date(lastTime.getTime() + cooldownMinutes * 60 * 1000);
      const minsLeft = Math.ceil((waitUntil.getTime() - Date.now()) / 60000);
      return new Response(
        JSON.stringify({ error: `Please wait ${minsLeft} minute${minsLeft !== 1 ? "s" : ""} before requesting another withdrawal` }),
        { status: 429, headers: corsHeaders }
      );
    }

    // ─── Daily withdrawal cap: max 5 withdrawals per 24h ───
    const dailyCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: dailyCount } = await adminClient
      .from("withdrawal_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", dailyCutoff);

    if ((dailyCount ?? 0) >= maxDailyWithdrawals) {
      return new Response(
        JSON.stringify({ error: `You have reached the maximum of ${maxDailyWithdrawals} withdrawals per 24 hours. Please try again later.` }),
        { status: 429, headers: corsHeaders }
      );
    }

    // ─── Anomaly detection: alert admins on suspicious patterns ───
    const { data: dailyWithdrawals } = await adminClient
      .from("withdrawal_requests")
      .select("amount")
      .eq("user_id", userId)
      .gte("created_at", dailyCutoff);

    const dailyWithdrawalTotal = (dailyWithdrawals || []).reduce((sum: number, r: any) => sum + Number(r.amount), 0) + amount;
    const ANOMALY_THRESHOLD = 1000; // $1000 in 24h triggers alert

    if (dailyWithdrawalTotal >= ANOMALY_THRESHOLD) {
      const { data: adminUsers } = await adminClient
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "super_admin"])
        .limit(10);

      if (adminUsers && adminUsers.length > 0) {
        const alertNotifications = adminUsers.map((admin: any) => ({
          user_id: admin.user_id,
          title: "⚠️ Withdrawal Anomaly Detected",
          message: `User ${userId.slice(0, 8)}… has withdrawn $${dailyWithdrawalTotal.toFixed(2)} in 24h (current request: $${amount}). IP: ${clientIp}`,
          type: "system",
        }));
        await adminClient.from("notifications").insert(alertNotifications);
        console.warn(`[ANOMALY] user=${userId} daily_total=$${dailyWithdrawalTotal} ip=${clientIp}`);
      }
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

    const payoutRate = Math.round(liveRate * (1 - payoutMarkdown / 100) * 100) / 100;
    const feeAmount = withdrawalFeePercent > 0 ? (amount * withdrawalFeePercent) / 100 : 0;
    const netAmount = amount - feeAmount;
    const ngnPayout = Math.floor(netAmount * payoutRate);

    console.log(`[NGN Payout] USD ${amount} - fee ${feeAmount} = net ${netAmount} × ₦${payoutRate} = ₦${ngnPayout}`);

    // ─── Idempotent withdrawal_requests insert ───
    // Insert FIRST. Unique index on idempotency_key gives us atomic dedup —
    // concurrent retries with the same key collide here and only one proceeds.
    const { data: wdRow, error: wdInsertErr } = await adminClient
      .from("withdrawal_requests")
      .insert({
        user_id: userId,
        amount,
        wallet_address: `${payazaBankCode}:${normalizedAccountNumber}:${account_name}`,
        crypto_currency: "NGN",
        status: "pending",
        ip_address: clientIp,
        user_agent: clientUa,
        idempotency_key: withdrawalIdempotencyKey,
      })
      .select("id")
      .single();

    if (wdInsertErr || !wdRow?.id) {
      const isDup = (wdInsertErr as { code?: string } | null)?.code === "23505";
      return new Response(
        JSON.stringify({ error: isDup ? "Duplicate withdrawal request" : "Could not record withdrawal" }),
        { status: isDup ? 409 : 500, headers: corsHeaders }
      );
    }
    const withdrawalRequestId = wdRow.id as string;

    // ─── Atomic balance debit ───
    const { data: debitResult } = await adminClient.rpc("debit_balance_atomic", {
      _user_id: userId,
      _main_deduct: amount,
      _bonus_deduct: 0,
    });

    if (!debitResult?.success) {
      // Roll back the withdrawal_requests row so the idempotency_key can be retried.
      await adminClient.from("withdrawal_requests").delete().eq("id", withdrawalRequestId);
      return new Response(
        JSON.stringify({ error: debitResult?.error || "Insufficient balance" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const transactionReference = `wd_${userId}_${Date.now()}`;

    await adminClient.from("transactions").insert({
      user_id: userId,
      type: "withdrawal",
      amount,
      status: "pending",
      payment_provider: "payaza",
      nowpayments_payment_id: transactionReference,
      withdrawal_request_id: withdrawalRequestId,
    });

    // ─── Determine provider order based on admin settings ───
    const configuredPrimary = (settings as any)?.payout_provider || "payaza";
    const providers: Array<{ name: string; attempt: () => Promise<boolean> }> = [];

    // Payaza attempt
    const payazaAttempt = async (): Promise<boolean> => {
      const payazaSecretKey = Deno.env.get("PAYAZA_SECRET_KEY");
      if (!payazaSecretKey) return false;
      return tryPayazaPayout({
        secretKey: payazaSecretKey,
        merchantKey: Deno.env.get("PAYAZA_MERCHANT_KEY") || "",
        transactionReference,
        ngnPayout,
        accountNumber: normalizedAccountNumber,
        bankCode: payazaBankCode,
        accountName: account_name,
        netAmount,
      });
    };

    // Flutterwave attempt
    const flutterwaveAttempt = async (): Promise<boolean> => {
      const flutterwaveKey = Deno.env.get("FLUTTERWAVE_SECRET_KEY");
      if (!flutterwaveKey) return false;
      return tryFlutterwavePayout({
        secretKey: flutterwaveKey,
        transactionReference,
        ngnPayout,
        accountNumber: normalizedAccountNumber,
        bankCode: payazaBankCode,
        netAmount,
      });
    };

    // Order providers: configured primary first, then fallback
    if (configuredPrimary === "flutterwave") {
      providers.push({ name: "flutterwave", attempt: flutterwaveAttempt });
      providers.push({ name: "payaza", attempt: payazaAttempt });
    } else {
      providers.push({ name: "payaza", attempt: payazaAttempt });
      providers.push({ name: "flutterwave", attempt: flutterwaveAttempt });
    }

    // ─── Try providers in order ───
    let payoutSuccess = false;
    let successProvider = "";

    for (const provider of providers) {
      try {
        console.log(`Attempting ${provider.name} payout...`);
        const result = await provider.attempt();
        if (result) {
          payoutSuccess = true;
          successProvider = provider.name;
          console.log(`${provider.name} payout SUCCESS`);
          break;
        }
        console.warn(`${provider.name} payout failed, trying next...`);
      } catch (err) {
        console.error(`${provider.name} payout error:`, err);
      }
    }

    // ─── Update records based on result ───
    if (payoutSuccess) {
      await adminClient
        .from("withdrawal_requests")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", withdrawalRequestId);

      await adminClient
        .from("transactions")
        .update({ status: "confirmed", payment_provider: successProvider })
        .eq("withdrawal_request_id", withdrawalRequestId);

      // Credit fee to platform pool ONLY now that payout succeeded
      if (feeAmount > 0) {
        await adminClient.rpc("adjust_platform_pool", { _delta: feeAmount });
      }
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

    // Both providers failed — leave as pending for manual processing
    console.warn("All payout providers failed, withdrawal left as pending for manual processing");

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
  merchantKey: string;
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
    const proxyUrl = Deno.env.get("QUOTAGUARD_URL");
    const transactionPin = Deno.env.get("PAYAZA_TRANSACTION_PIN");
    const merchantAccountRef = Deno.env.get("PAYAZA_MERCHANT_KEY") || "";

    const payoutPayload: Record<string, unknown> = {
      transaction_type: "nuban",
      service_payload: {
        payout_amount: ngnPayout,
        transaction_pin: transactionPin ? Number(transactionPin) : undefined,
        account_reference: merchantAccountRef ? Number(merchantAccountRef) : undefined,
        currency: "NGN",
        payout_beneficiaries: [
          {
            credit_amount: ngnPayout,
            account_number: accountNumber,
            account_name: accountName,
            bank_code: bankCode,
            narration: `OPOLL withdrawal $${netAmount.toFixed(2)}`,
            transaction_reference: transactionReference,
            sender: {
              sender_name: "OPOLL",
              sender_id: "",
              sender_phone_number: "",
              sender_address: "",
            },
          },
        ],
      },
    };

    const payazaUrl = "https://api.payaza.africa/live/payout-receptor/payout";
    const encodedSecret = encodePayazaKey(secretKey);
    const fetchHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Payaza ${encodedSecret}`,
      "Accept": "application/json",
      "X-TenantID": "live",
    };

    let payazaResponse: Response | null = null;

    // Try with proxy first (for IP whitelisting)
    if (proxyUrl) {
      try {
        const httpClient = Deno.createHttpClient({ proxy: { url: proxyUrl } });
        payazaResponse = await fetch(payazaUrl, {
          method: "POST",
          headers: fetchHeaders,
          body: JSON.stringify(payoutPayload),
          // @ts-ignore
          client: httpClient,
        });
        httpClient.close();
        const preview = await payazaResponse.clone().text();
        if (preview.includes("<html") || preview.includes("<!DOCTYPE")) {
          console.warn("Payaza proxy returned HTML page");
          payazaResponse = null;
        }
      } catch (err) {
        console.warn("Payaza proxy payout failed:", err);
      }
    }

    // Direct fallback
    if (!payazaResponse) {
      payazaResponse = await fetch(payazaUrl, {
        method: "POST",
        headers: fetchHeaders,
        body: JSON.stringify(payoutPayload),
      });
    }

    const payazaText = await payazaResponse.text();
    console.log(`Payaza payout → ${payazaResponse.status}: ${payazaText.substring(0, 500)}`);

    if (payazaResponse.ok) {
      try {
        const result = JSON.parse(payazaText);
        const isSuccess = result?.status === 201 || result?.status === 200 ||
                          result?.type === "success" ||
                          result?.response_code === "00" ||
                          result?.message?.toLowerCase()?.includes("success");
        if (isSuccess) return true;
        // Treat any 2xx as success
        return true;
      } catch {
        console.error("Failed to parse Payaza payout response");
      }
    }
  } catch (err) {
    console.error("Payaza payout error:", err);
  }
  return false;
}

/**
 * Mapping from Payaza/NIP 6-digit codes to Flutterwave 3-digit CBN codes.
 * Used when falling back to Flutterwave for payout.
 */
const PAYAZA_TO_FW_MAP: Record<string, string> = {
  "000014": "044", // Access Bank
  "000005": "063", // Access (Diamond)
  "000009": "023", // Citibank
  "000010": "050", // Ecobank
  "000007": "070", // Fidelity Bank
  "000016": "011", // First Bank
  "000003": "214", // FCMB
  "000013": "058", // GTBank
  "000020": "030", // Heritage Bank
  "000006": "301", // Jaiz Bank
  "000002": "082", // Keystone Bank
  "000008": "076", // Polaris Bank
  "000023": "101", // Providus Bank
  "000012": "221", // Stanbic IBTC
  "000021": "068", // Standard Chartered
  "000001": "232", // Sterling Bank
  "000004": "033", // UBA
  "000018": "032", // Union Bank
  "000011": "215", // Unity Bank
  "000017": "035", // Wema Bank
  "000015": "057", // Zenith Bank
  "100004": "999992", // OPay
  "090267": "50211", // Kuda
  "100033": "999991", // PalmPay
  "090405": "50515", // Moniepoint
};

// ─── Flutterwave payout attempt (fallback) ───
interface FlutterwavePayoutParams {
  secretKey: string;
  transactionReference: string;
  ngnPayout: number;
  accountNumber: string;
  bankCode: string;
  netAmount: number;
}

async function tryFlutterwavePayout(params: FlutterwavePayoutParams): Promise<boolean> {
  const { secretKey, transactionReference, ngnPayout, accountNumber, bankCode, netAmount } = params;

  try {
    // Map Payaza code to Flutterwave code if needed
    const fwBankCode = PAYAZA_TO_FW_MAP[bankCode] || bankCode;

    const transferRes = await fetch("https://api.flutterwave.com/v3/transfers", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        account_bank: fwBankCode,
        account_number: accountNumber,
        amount: ngnPayout,
        narration: `OPOLL withdrawal $${netAmount.toFixed(2)}`,
        currency: "NGN",
        reference: transactionReference,
        callback_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/flutterwave-webhook`,
        debit_currency: "NGN",
      }),
    });

    const transferData = await transferRes.json();
    console.log(`Flutterwave transfer (code=${fwBankCode}) → ${transferRes.status}:`, JSON.stringify(transferData).substring(0, 500));

    if (transferData.status === "success") {
      return true;
    }
    console.warn("Flutterwave transfer failed:", transferData.message);
  } catch (err) {
    console.error("Flutterwave transfer error:", err);
  }
  return false;
}
