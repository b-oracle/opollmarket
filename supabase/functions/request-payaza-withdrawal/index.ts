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
      .select("min_withdrawal_amount, withdrawal_cooldown_minutes, withdrawal_multiplier, withdrawal_limit_enabled, withdrawal_fee_percent, naira_payout_markdown, fallback_naira_rate, fallback_payout_naira_rate")
      .limit(1)
      .single();

    const minWithdrawal = settings?.min_withdrawal_amount ?? 5;
    const withdrawalFeePercent = Math.max(0, Math.min(100, Number(settings?.withdrawal_fee_percent) || 0));
    const payoutMarkdown = Number(settings?.naira_payout_markdown) || 0;
    const fallbackRate = Number((settings as any)?.fallback_payout_naira_rate) || Number(settings?.fallback_naira_rate) || 1500;

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

    // ─── Attempt Payaza payout ───
    let payoutSuccess = false;

    const payazaSecretKey = Deno.env.get("PAYAZA_SECRET_KEY");
    const payazaMerchantKey = Deno.env.get("PAYAZA_MERCHANT_KEY");

    if (payazaSecretKey) {
      payoutSuccess = await tryPayazaPayout({
        secretKey: payazaSecretKey,
        merchantKey: payazaMerchantKey || "",
        transactionReference,
        ngnPayout,
        accountNumber: account_number,
        bankCode: bank_code,
        accountName: account_name,
        netAmount,
      });
    }

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
        .update({ status: "confirmed", payment_provider: "payaza" })
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

// ─── Payaza payout attempt (correct payload format per official payaza_lib SDK) ───
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
  const { secretKey, merchantKey, transactionReference, ngnPayout, accountNumber, bankCode, accountName, netAmount } = params;

  try {
    const proxyUrl = Deno.env.get("QUOTAGUARD_URL");
    const transactionPin = Deno.env.get("PAYAZA_TRANSACTION_PIN");

    // Correct Payaza payout payload structure (matches official payaza_lib npm package)
    // account_reference = merchant's own account reference (PAYAZA_MERCHANT_KEY), NOT the recipient's bank account
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

    console.log("[Payaza] Payout payload:", JSON.stringify(payoutPayload).substring(0, 500));

    const payazaUrl = "https://api.payaza.africa/live/payout-receptor/payout";

    // Per official payaza_lib SDK: base64-encode the secret key, use "Payaza <encoded>" header
    // Also requires X-TenantID: live
    const encodedSecret = encodePayazaKey(secretKey);
    const encodedMerchant = merchantKey ? encodePayazaKey(merchantKey) : null;

    // Only use the secret key for auth (merchant key is an account reference, not an API key)
    const authVariants: string[] = [];
    authVariants.push(`Payaza ${encodedSecret}`);

    for (const authValue of authVariants) {
      const authLabel = authValue.substring(0, 30) + "...";
      let payazaResponse: Response | null = null;

      const fetchHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        "Authorization": authValue,
        "Accept": "application/json",
        "X-TenantID": "live",
      };

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
            console.warn(`Payaza proxy returned HTML page (${authLabel})`);
            payazaResponse = null;
          }
        } catch (err) {
          console.warn(`Payaza proxy payout failed (${authLabel}):`, err);
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
      console.log(`Payaza payout [${authLabel}] → ${payazaResponse.status}: ${payazaText.substring(0, 500)}`);

      if (payazaResponse.ok) {
        try {
          const result = JSON.parse(payazaText);
          // Check for success indicators in the response
          const isSuccess = result?.status === 201 || result?.status === 200 || 
                           result?.type === "success" || 
                           result?.response_code === "00" ||
                           result?.message?.toLowerCase()?.includes("success");
          
          if (isSuccess) {
            console.log(`Payaza payout SUCCESS with auth: ${authLabel}`);
            return true;
          }
          console.warn(`Payaza payout response OK but not clearly successful:`, JSON.stringify(result).substring(0, 300));
          // Still treat 2xx as success if parseable
          return true;
        } catch {
          console.error("Failed to parse Payaza payout response");
        }
      }

      // If we get a non-auth error (not 401/403), stop trying other auth variants
      if (payazaResponse.status !== 401 && payazaResponse.status !== 403) {
        console.warn(`Payaza payout returned ${payazaResponse.status}, stopping auth rotation`);
        break;
      }
    }
  } catch (err) {
    console.error("Payaza payout error:", err);
  }
  return false;
}
