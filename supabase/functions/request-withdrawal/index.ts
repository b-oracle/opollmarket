import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { TOTP, Secret } from "https://esm.sh/otpauth@9.3.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function getNowPaymentsJwt(maxRetries = 3): Promise<string> {
  const email = Deno.env.get("NOWPAYMENTS_EMAIL");
  const password = Deno.env.get("NOWPAYMENTS_PASSWORD");
  if (!email || !password) throw new Error("NOWPayments credentials not configured");

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch("https://api.nowpayments.io/v1/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (res.status >= 500 || res.status === 429) {
        const errText = await res.text();
        lastError = new Error(`NOWPayments auth failed (${res.status}): ${errText}`);
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
          console.warn(`Auth attempt ${attempt} failed (${res.status}), retrying in ${delay}ms...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw lastError;
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`NOWPayments auth failed (${res.status}): ${errText}`);
      }

      const { token } = await res.json();
      if (!token) throw new Error("NOWPayments auth returned no token");
      return token;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries && !lastError.message.includes("auth failed (4")) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
        console.warn(`Auth attempt ${attempt} error: ${lastError.message}, retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError || new Error("NOWPayments auth failed after retries");
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
    console.log(`[Withdrawal] user=${userId} ip=${clientIp} ua=${clientUa}`);

    const { amount, wallet_address, crypto_currency, idempotency_key } = await req.json();

    // Idempotency key — generate one if client didn't supply. We rely on the
    // unique index on withdrawal_requests.idempotency_key for the actual race
    // protection (see insert below); this pre-check is a fast-path UX hint.
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

    // Block withdrawal if user has a held creation fee escrow
    const { count: heldEscrowCount } = await adminClient
      .from("creation_fee_escrows")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "held");

    if (heldEscrowCount && heldEscrowCount > 0) {
      return new Response(
        JSON.stringify({ error: "You have a pending market creation fee in escrow. Complete your market first before withdrawing." }),
        { status: 403, headers: corsHeaders }
      );
    }

    // Server-side security verification check
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

    // Fetch min withdrawal from settings
    const { data: settings } = await adminClient
      .from("commission_settings")
      .select("min_withdrawal_amount, withdrawal_cooldown_minutes, withdrawal_multiplier, withdrawal_limit_enabled, withdrawal_fee_percent")
      .limit(1)
      .single();

    const minWithdrawal = settings?.min_withdrawal_amount ?? 5;
    const withdrawalFeePercent = Math.max(0, Math.min(100, Number(settings?.withdrawal_fee_percent) || 0));

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

    if (!wallet_address || wallet_address.trim().length < 10) {
      return new Response(
        JSON.stringify({ error: "Valid wallet address required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const apiKey = Deno.env.get("NOWPAYMENTS_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Payment service not configured" }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Check user has made at least one confirmed deposit
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

    // Withdrawal cap (configurable — can be toggled off by admin)
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
          JSON.stringify({
            error: `Withdrawal exceeds your eligible limit. You can withdraw up to $${maxEligible.toFixed(2)} more. Deposit additional funds to increase your limit.`,
          }),
          { status: 400, headers: corsHeaders }
        );
      }
    }

    // Cooldown: prevent rapid repeated withdrawals (configurable)
    const cooldownMinutes = settings?.withdrawal_cooldown_minutes ?? 5;
    const cooldownCutoff = new Date(Date.now() - cooldownMinutes * 60 * 1000).toISOString();
    const { data: recentWithdrawalsCooldown } = await adminClient
      .from("withdrawal_requests")
      .select("id, created_at")
      .eq("user_id", userId)
      .gte("created_at", cooldownCutoff)
      .limit(1);

    if (recentWithdrawalsCooldown && recentWithdrawalsCooldown.length > 0) {
      const lastTime = new Date(recentWithdrawalsCooldown[0].created_at);
      const waitUntil = new Date(lastTime.getTime() + cooldownMinutes * 60 * 1000);
      const secsLeft = Math.ceil((waitUntil.getTime() - Date.now()) / 1000);
      const minsLeft = Math.ceil(secsLeft / 60);
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

    const dailyTotalAnomaly = (dailyWithdrawals || []).reduce((sum: number, r: any) => sum + Number(r.amount), 0) + amount;
    const ANOMALY_THRESHOLD = 1000; // $1000 in 24h triggers alert

    if (dailyTotalAnomaly >= ANOMALY_THRESHOLD) {
      // Fire-and-forget admin alert
      const { data: adminUsers } = await adminClient
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "super_admin"])
        .limit(10);

      if (adminUsers && adminUsers.length > 0) {
        const alertNotifications = adminUsers.map((admin: any) => ({
          user_id: admin.user_id,
          title: "⚠️ Withdrawal Anomaly Detected",
          message: `User ${userId.slice(0, 8)}… has withdrawn $${dailyTotalAnomaly.toFixed(2)} in 24h (current request: $${amount}). IP: ${clientIp}`,
          type: "system",
        }));
        await adminClient.from("notifications").insert(alertNotifications);
        console.warn(`[ANOMALY] user=${userId} daily_total=$${dailyTotalAnomaly} ip=${clientIp}`);
      }
    }

    // Atomic balance debit with row lock (main balance only, not bonus)
    const { data: debitResult } = await adminClient.rpc("debit_balance_atomic", {
      _user_id: userId,
      _main_deduct: amount,
      _bonus_deduct: 0,
    });

    if (!debitResult?.success) {
      return new Response(
        JSON.stringify({ error: "Insufficient balance" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const payCurrency = crypto_currency || "usdtbsc";

    // Calculate fee and net payout
    const feeAmount = withdrawalFeePercent > 0 ? (amount * withdrawalFeePercent) / 100 : 0;
    const netAmount = amount - feeAmount;

    // Credit withdrawal fee to platform pool as tracked revenue
    if (feeAmount > 0) {
      await adminClient.rpc("adjust_platform_pool", { _delta: feeAmount });
    }

    // JWT-based payout flow
    let payoutSuccess = false;
    let payoutId = null;
    let payoutError = null;
    let payoutTxHash: string | null = null;

    try {
      // Step 1: Authenticate with NOWPayments to get JWT
      const jwtToken = await getNowPaymentsJwt();

      // Step 2: Get estimated crypto amount (based on net amount after fee)
      const estimateRes = await fetch(
        `https://api.nowpayments.io/v1/estimate?amount=${netAmount}&currency_from=usd&currency_to=${payCurrency}`,
        { headers: { "x-api-key": apiKey } }
      );

      if (!estimateRes.ok) {
        throw new Error("Failed to get payout estimate");
      }

      const estimate = await estimateRes.json();
      const cryptoAmount = estimate.estimated_amount;

      // Step 3: Create payout using JWT token (with retry)
      const maxPayoutRetries = 3;
      for (let attempt = 1; attempt <= maxPayoutRetries; attempt++) {
        try {
          const payoutRes = await fetch("https://api.nowpayments.io/v1/payout", {
            method: "POST",
            headers: {
              "x-api-key": apiKey,
              "Authorization": `Bearer ${jwtToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              withdrawals: [
                {
                  address: wallet_address.trim(),
                  currency: payCurrency,
                  amount: cryptoAmount,
                  ipn_callback_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/nowpayments-webhook`,
                },
              ],
            }),
          });

          if (payoutRes.ok) {
            const payoutData = await payoutRes.json();
            const batchId = payoutData.id;
            payoutId = payoutData.withdrawals?.[0]?.id || batchId;

            // Step 4: Verify payout with 2FA (TOTP)
            const totpSecret = Deno.env.get("NOWPAYMENTS_2FA_SECRET");
            if (totpSecret) {
              try {
                let secret: any;
                try {
                  secret = Secret.fromBase32(totpSecret.replace(/\s/g, "").toUpperCase());
                } catch {
                  try { secret = Secret.fromHex(totpSecret.replace(/\s/g, "")); } catch { secret = Secret.fromUTF8(totpSecret); }
                }
                const totp = new TOTP({
                  issuer: "NOWPayments",
                  label: "payout",
                  algorithm: "SHA1",
                  digits: 6,
                  period: 30,
                  secret,
                });
                const verificationCode = totp.generate();

                const verifyRes = await fetch(
                  `https://api.nowpayments.io/v1/payout/${batchId}/verify`,
                  {
                    method: "POST",
                    headers: {
                      "x-api-key": apiKey,
                      "Authorization": `Bearer ${jwtToken}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ verification_code: verificationCode }),
                  }
                );

                if (!verifyRes.ok) {
                  const verifyErr = await verifyRes.text();
                  console.error("Payout verification failed:", verifyErr);
                  payoutSuccess = false;
                  payoutError = `Payout created but verification failed: ${verifyErr}`;
                  break;
                }

                console.log("Payout verified successfully for batch:", batchId);

                // Step 5: Poll for tx hash (up to 60s)
                for (let poll = 0; poll < 12; poll++) {
                  await new Promise((r) => setTimeout(r, 5000));
                  try {
                    const pollRes = await fetch(`https://api.nowpayments.io/v1/payout/${batchId}`, {
                      headers: {
                        "x-api-key": apiKey,
                        "Authorization": `Bearer ${jwtToken}`,
                      },
                    });
                    if (pollRes.ok) {
                      const pollData = await pollRes.json();
                      const w = pollData.withdrawals?.[0];
                      if (w?.hash) {
                        payoutTxHash = w.hash;
                        console.log("Got tx hash:", payoutTxHash);
                        break;
                      }
                      if (w?.status === "FINISHED" || w?.status === "FAILED") break;
                    }
                  } catch (pollErr) {
                    console.warn("Poll error:", pollErr);
                  }
                }
              } catch (verifyErr) {
                console.error("TOTP verification error:", verifyErr);
                payoutSuccess = false;
                payoutError = `Payout created but TOTP verification error: ${String(verifyErr)}`;
                break;
              }
            } else {
              console.warn("NOWPAYMENTS_2FA_SECRET not set — payout created but not verified");
            }

            payoutSuccess = true;
            break;
          }

          const errText = await payoutRes.text();
          payoutError = errText;

          if (payoutRes.status === 403) {
            console.warn("Payout blocked by IP restriction (403)");
          }

          if ((payoutRes.status >= 500 || payoutRes.status === 429) && attempt < maxPayoutRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
            console.warn(`Payout attempt ${attempt} failed (${payoutRes.status}), retrying in ${delay}ms...`);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }

          console.error("Payout API error:", errText);
          break;
        } catch (err) {
          payoutError = String(err);
          if (attempt < maxPayoutRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
            console.warn(`Payout attempt ${attempt} error: ${payoutError}, retrying in ${delay}ms...`);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          console.error("Payout request failed:", err);
          break;
        }
      }
    } catch (payErr) {
      console.error("Payout flow error:", payErr);
      payoutError = String(payErr);
    }

    if (!payoutSuccess) {
      // Fallback: create a pending withdrawal for manual admin processing
      // Balance stays deducted — admin will approve/reject via process-withdrawal
      console.warn("Payout failed, falling back to manual processing. Error:", payoutError);

      await adminClient.from("withdrawal_requests").insert({
        user_id: userId,
        amount,
        wallet_address: wallet_address.trim(),
        crypto_currency: payCurrency,
        status: "pending",
        ip_address: clientIp,
        user_agent: clientUa,
        idempotency_key: withdrawalIdempotencyKey,
      });

      await adminClient.from("transactions").insert({
        user_id: userId,
        type: "withdrawal",
        amount,
        status: "pending",
      });

      const feeNote = feeAmount > 0 ? ` (Fee: $${feeAmount.toFixed(2)}, Net: $${netAmount.toFixed(2)})` : "";
      await adminClient.from("notifications").insert({
        user_id: userId,
        title: "Withdrawal Pending",
        message: `Your withdrawal of $${Number(amount).toFixed(2)}${feeNote} is being processed and will be completed shortly.`,
        type: "withdrawal",
      });

      return new Response(
        JSON.stringify({ success: true, pending: true, message: "Withdrawal submitted for processing" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Record withdrawal request as completed
    await adminClient.from("withdrawal_requests").insert({
      user_id: userId,
      amount,
      wallet_address: wallet_address.trim(),
      crypto_currency: payCurrency,
      status: "completed",
      nowpayments_id: payoutId ? String(payoutId) : null,
      tx_hash: payoutTxHash,
      ip_address: clientIp,
      user_agent: clientUa,
      idempotency_key: withdrawalIdempotencyKey,
    });

    // Insert confirmed withdrawal transaction
    await adminClient.from("transactions").insert({
      user_id: userId,
      type: "withdrawal",
      amount,
      status: "confirmed",
      nowpayments_payment_id: payoutId ? String(payoutId) : null,
      tx_hash: payoutTxHash,
    });

    // If tx hash wasn't available yet, schedule a background fetch
    if (!payoutTxHash && payoutId) {
      // Fire-and-forget: call verify-np-payout after a delay to backfill the hash
      (async () => {
        try {
          // Wait 60s for NOWPayments to finalize the transaction
          await new Promise((r) => setTimeout(r, 60_000));
          await adminClient.functions.invoke("verify-np-payout", {
            body: { batch_id: String(payoutId), action: "update_hash" },
          });
          console.log("Background hash update triggered for payout:", payoutId);
        } catch (e) {
          console.warn("Background hash update failed:", e);
        }
      })();
    }

    // Notify user
    const feeNote = feeAmount > 0 ? ` (Fee: $${feeAmount.toFixed(2)}, Net: $${netAmount.toFixed(2)})` : "";
    await adminClient.from("notifications").insert({
      user_id: userId,
      title: "Withdrawal Sent",
      message: `Your withdrawal of $${Number(amount).toFixed(2)}${feeNote} has been sent to ${wallet_address.trim().slice(0, 8)}...`,
      type: "withdrawal",
    });

    return new Response(
      JSON.stringify({ success: true, payout_id: payoutId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("request-withdrawal error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
