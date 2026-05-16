import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logWebhookEvent } from "../_shared/webhookLog.ts";
import { safeEqual, validatePayazaPayload } from "../_shared/webhookValidation.ts";
import { errorResponse } from "../_shared/errors.ts";
import { sendNotificationEmail } from "../_shared/notificationEmail.ts";

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
    // ── Webhook secret verification (REQUIRED — hard-fail if unset) ──
    const webhookSecret = Deno.env.get("PAYAZA_WEBHOOK_SECRET");
    if (!webhookSecret) {
      console.error("PAYAZA_WEBHOOK_SECRET not configured — rejecting webhook");
      return new Response(JSON.stringify({ error: "Webhook not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const incomingToken =
      req.headers.get("x-payaza-webhook-token") ||
      req.headers.get("payaza-webhook-token") ||
      req.headers.get("x-webhook-token") ||
      new URL(req.url).searchParams.get("token");

    // Constant-time compare to mitigate timing attacks
    if (!safeEqual(incomingToken, webhookSecret)) {
      console.error("Payaza webhook: invalid or missing webhook token");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log all incoming headers (names only) for debugging
    const headerNames = [...req.headers.keys()];
    console.log("Payaza webhook headers:", headerNames.join(", "));

    const rawBody = await req.text();
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      console.error("Payaza webhook: non-JSON body:", rawBody.substring(0, 500));
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Payaza webhook payload:", JSON.stringify(body).substring(0, 1000));

    // Strict shape validation (required reference + status; optional amount/currency)
    const parsed = validatePayazaPayload(body);
    if (!parsed.ok) {
      console.error("Payaza webhook validation failed:", parsed.error);
      return new Response(JSON.stringify({ error: parsed.error }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { reference, status: rawStatus, amount: reportedAmount, currency: reportedCurrency } = parsed.value;

    console.log(`Payaza webhook: reference=${reference}, rawStatus=${rawStatus}, reportedAmount=${reportedAmount}, currency=${reportedCurrency}`);

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await logWebhookEvent(adminClient, {
      provider: "payaza",
      event_type: "received",
      reference: reference,
      message: `rawStatus=${rawStatus}`,
      payload: body,
    });

    // ─── Outermost idempotency guard: ledger-based dedupe by (provider, event_key) ───
    // event_key = reference + normalized status. A re-delivery of the same
    // (reference, status) tuple short-circuits before any credit logic runs.
    {
      const eventKey = `${reference}:${String(rawStatus).toLowerCase()}`;
      const { data: ledgerOk } = await adminClient.rpc("record_webhook_event", {
        _provider: "payaza",
        _event_key: eventKey,
        _payload: body as Record<string, unknown>,
      });
      if (ledgerOk === false) {
        console.log(`Duplicate Payaza webhook event ignored: ${eventKey}`);
        return new Response(JSON.stringify({ success: true, message: "Duplicate ignored" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── SECURITY: Verify this reference belongs to a real pending Payaza deposit ──
    // Only references starting with "payaza_" or "promo_" that were created by our
    // create-payaza-deposit / create-promotion-payaza functions will match.
    // This prevents arbitrary crediting since the reference must already exist
    // in the database with payment_provider = 'payaza'.

    // Check if already processed (idempotency)
    const { data: alreadyDone } = await adminClient
      .from("transactions")
      .select("id")
      .eq("nowpayments_payment_id", reference)
      .eq("payment_provider", "payaza")
      .eq("type", "deposit")
      .in("status", ["confirmed", "processing"])
      .maybeSingle();

    if (alreadyDone) {
      console.log("Transaction already confirmed/claimed:", alreadyDone.id);
      return new Response(JSON.stringify({ success: true, message: "Already confirmed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Atomically claim the transaction (prevents concurrent webhook replays)
    const { data: claimedRows } = await adminClient.rpc("claim_webhook_deposit", {
      _payment_id: reference,
      _provider: "payaza",
    });
    const tx = claimedRows?.[0] || null;

    if (!tx) {
      console.error("No claimable transaction for reference:", reference);
      await logWebhookEvent(adminClient, {
        provider: "payaza",
        event_type: "not_found",
        status: "warning",
        reference,
        message: "No claimable transaction for reference",
      });
      return new Response(JSON.stringify({ error: "Transaction not found or already claimed" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await logWebhookEvent(adminClient, {
      provider: "payaza",
      event_type: "claimed",
      reference,
      transaction_id: tx.id,
      user_id: tx.user_id,
      requested_amount: Number(tx.amount),
      message: `claimed for processing (rawStatus=${rawStatus})`,
    });

    // Tokenize status and match whole words only so "partially successful",
    // "partial success", "failed (formerly successful)" etc. cannot pass.
    const normStatus = String(rawStatus).toLowerCase().trim();
    const statusTokens = new Set(normStatus.split(/[^a-z0-9]+/).filter(Boolean));
    const failureTokens = ["failed", "declined", "rejected", "reversed", "cancelled", "canceled", "partial", "partially", "pending", "refunded", "chargeback"];
    const successTokens = ["approved", "successful", "completed", "success"];
    const hasFailureToken = failureTokens.some(t => statusTokens.has(t));
    const hasSuccessToken = successTokens.some(t => statusTokens.has(t)) || normStatus === "funds received";
    const isSuccess = hasSuccessToken && !hasFailureToken;

    console.log(`Payaza webhook: isSuccess=${isSuccess} for status="${rawStatus}"`);

    if (!isSuccess) {
      await adminClient
        .from("transactions")
        .update({ status: "failed" })
        .eq("id", tx.id);

      await logWebhookEvent(adminClient, {
        provider: "payaza",
        event_type: "failed",
        status: "warning",
        reference,
        transaction_id: tx.id,
        user_id: tx.user_id,
        requested_amount: Number(tx.amount),
        message: `Payment not successful (rawStatus=${rawStatus})`,
      });

      console.log("Payment not successful, marked as failed:", tx.id);
      return new Response(JSON.stringify({ success: true, message: "Payment not successful" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Currency sanity: Payaza payouts are NGN-denominated. If the provider
    // reports any other currency on a "success" event, flag rather than credit.
    if (reportedCurrency && reportedCurrency !== "NGN") {
      await adminClient
        .from("transactions")
        .update({ status: "wrong_asset" })
        .eq("id", tx.id);
      await logWebhookEvent(adminClient, {
        provider: "payaza",
        event_type: "wrong_currency",
        status: "warning",
        reference,
        transaction_id: tx.id,
        user_id: tx.user_id,
        requested_amount: Number(tx.amount),
        message: `Expected NGN, got ${reportedCurrency} (reportedAmount=${reportedAmount ?? "n/a"})`,
      });
      return new Response(JSON.stringify({ error: "Unsupported currency" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Reported-amount validation (mirrors nowpayments-webhook classifyDeposit) ──
    // Payaza pays in NGN. We stored the expected NGN amount in payment_metadata.amount_ngn.
    // Verify the provider-reported NGN amount matches before crediting USD.
    const { data: txMeta } = await adminClient
      .from("transactions")
      .select("expected_amount_ngn")
      .eq("id", tx.id)
      .maybeSingle();
    const expectedNgn = Number((txMeta as any)?.expected_amount_ngn);
    const reportedNgn = reportedAmount != null ? Number(reportedAmount) : NaN;

    // Load admin-configurable deviation thresholds (same table nowpayments uses).
    const DEFAULT_PARTIAL = 0.98;
    const DEFAULT_OVERPAY = 1.02;
    const DEFAULT_LARGE_ALERT = 1.5;
    let partialThreshold = DEFAULT_PARTIAL;
    let overpayThreshold = DEFAULT_OVERPAY;
    let largeAlertThreshold = DEFAULT_LARGE_ALERT;
    try {
      const { data: settings } = await adminClient
        .from("commission_settings")
        .select("deposit_partial_threshold, deposit_overpay_threshold, deposit_large_overpay_alert")
        .limit(1)
        .maybeSingle();
      if (settings) {
        partialThreshold = Number((settings as any).deposit_partial_threshold) || DEFAULT_PARTIAL;
        overpayThreshold = Number((settings as any).deposit_overpay_threshold) || DEFAULT_OVERPAY;
        largeAlertThreshold = Number((settings as any).deposit_large_overpay_alert) || DEFAULT_LARGE_ALERT;
      }
    } catch (_e) { /* fall back to defaults */ }

    if (Number.isFinite(expectedNgn) && expectedNgn > 0 && Number.isFinite(reportedNgn) && reportedNgn > 0) {
      const ratio = reportedNgn / expectedNgn;

      // Underpayment → reject; do NOT credit the requested USD.
      if (ratio < partialThreshold) {
        await adminClient
          .from("transactions")
          .update({ status: "partial" })
          .eq("id", tx.id);
        await logWebhookEvent(adminClient, {
          provider: "payaza",
          event_type: "partial_payment",
          status: "warning",
          reference,
          transaction_id: tx.id,
          user_id: tx.user_id,
          requested_amount: Number(tx.amount),
          message: `Underpayment: expectedNgn=${expectedNgn}, reportedNgn=${reportedNgn}, ratio=${ratio.toFixed(3)}`,
        });
        await adminClient.from("notifications").insert({
          user_id: tx.user_id,
          title: "Deposit Under Review ⚠️",
          message: `Your $${Number(tx.amount).toFixed(2)} deposit appears to be underpaid. Please contact support.`,
          type: "deposit",
        });
        return new Response(JSON.stringify({ success: true, message: "Partial payment held for review" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Excessive overpayment → block auto-credit, require manual review.
      if (ratio > largeAlertThreshold) {
        await adminClient
          .from("transactions")
          .update({ status: "wrong_asset" })
          .eq("id", tx.id);
        await logWebhookEvent(adminClient, {
          provider: "payaza",
          event_type: "excessive_overpayment",
          status: "error",
          reference,
          transaction_id: tx.id,
          user_id: tx.user_id,
          requested_amount: Number(tx.amount),
          message: `Excessive overpayment: expectedNgn=${expectedNgn}, reportedNgn=${reportedNgn}, ratio=${ratio.toFixed(3)}`,
        });
        return new Response(JSON.stringify({ success: true, message: "Held for manual review" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Within [partial..overpay] band, or modest overpay (<largeAlert): proceed with
      // requested USD only (no bonus credit for surplus NGN — fiat surplus is refundable off-rail).
      if (ratio > overpayThreshold) {
        console.warn(`Payaza overpayment within tolerance: expectedNgn=${expectedNgn}, reportedNgn=${reportedNgn}, ratio=${ratio.toFixed(3)}`);
      }
    } else {
      // Missing reportedAmount or expectedNgn: log but do not block (legacy/edge cases).
      // Status check already passed; alert admins so they can audit.
      console.warn(`Payaza: cannot validate reportedAmount (expectedNgn=${expectedNgn}, reportedAmount=${reportedAmount}) — crediting requested USD`);
      await logWebhookEvent(adminClient, {
        provider: "payaza",
        event_type: "amount_unverified",
        status: "warning",
        reference,
        transaction_id: tx.id,
        user_id: tx.user_id,
        requested_amount: Number(tx.amount),
        message: `Missing/invalid amount fields (expectedNgn=${expectedNgn}, reportedAmount=${reportedAmount})`,
      });
    }

    // ── STEP 1: Credit user balance ATOMICALLY (audited via balanceLogger) ──
    const depositAmount = Number(tx.amount);
    const creditResult = await adjustBalanceLogged(adminClient, {
      userId: tx.user_id,
      delta: depositAmount,
      source: "payaza-webhook",
      reason: `Payaza deposit credit ref=${reference}`,
      correlationId: `payaza:${reference}`,
    });
    const balanceError = creditResult.success ? null : { message: creditResult.error };

    if (balanceError) {
      console.error("CRITICAL: Failed to credit balance for Payaza deposit:", balanceError);
      await logWebhookEvent(adminClient, {
        provider: "payaza",
        event_type: "credit_failed",
        status: "error",
        reference,
        transaction_id: tx.id,
        user_id: tx.user_id,
        requested_amount: Number(tx.amount),
        error: balanceError,
      });
      return new Response(JSON.stringify({ error: "Balance credit failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Credited $${depositAmount} to user ${tx.user_id}`);

    await logWebhookEvent(adminClient, {
      provider: "payaza",
      event_type: "credited",
      status: "success",
      reference,
      transaction_id: tx.id,
      user_id: tx.user_id,
      requested_amount: Number(tx.amount),
      credited_amount: depositAmount,
    });

    // ── STEP 2: Mark transaction as confirmed ──
    const { error: txUpdateError } = await adminClient
      .from("transactions")
      .update({ status: "confirmed" })
      .eq("id", tx.id);

    if (txUpdateError) {
      console.error("WARNING: Balance credited but tx update failed:", txUpdateError);
    }

    // ── STEP 3: Verify balance ──
    const { data: verifyBalance } = await adminClient
      .from("balances")
      .select("amount")
      .eq("user_id", tx.user_id)
      .single();

    console.log(`Post-credit balance for ${tx.user_id}: $${verifyBalance?.amount}`);

    // Settle any debts
    try {
      const { data: debtResult } = await adminClient.rpc("settle_user_debts", { _user_id: tx.user_id });
      if (debtResult && Number(debtResult.amount) > 0) {
        console.log(`Settled $${debtResult.amount} in debts for user ${tx.user_id}`);
        await adminClient.from("notifications").insert({
          user_id: tx.user_id,
          title: "Outstanding Balance Settled 📋",
          message: `$${Number(debtResult.amount).toFixed(2)} was deducted to cover outstanding fees.`,
          type: "info",
        });
      }
    } catch (debtErr) {
      console.error("Failed to settle debts:", debtErr);
    }

    // Notify user
    await adminClient.from("notifications").insert({
      user_id: tx.user_id,
      title: "Deposit Confirmed! 🎉",
      message: `Your deposit of $${depositAmount.toFixed(2)} has been credited to your balance.`,
      type: "deposit",
    });

    await sendNotificationEmail({
      admin: adminClient as any,
      userId: tx.user_id,
      templateName: "deposit-completed",
      prefKey: "email_deposit_completed",
      idempotencyKey: `deposit-payaza-${reference}`,
      templateData: { amount: depositAmount, method: "Payaza" },
    });

    // Handle promotion activations if this is a promotion deposit
    try {
      const { data: promoTx } = await adminClient
        .from("transactions")
        .select("side, market_id")
        .eq("id", tx.id)
        .single();

      if (promoTx?.side?.startsWith("promotion_")) {
        const promoRef = reference;
        // Activate pending boosts
        await adminClient
          .from("market_boosts")
          .update({ status: "active", starts_at: new Date().toISOString() })
          .eq("nowpayments_payment_id", promoRef)
          .eq("status", "pending");

        // Activate pending broadcasts
        await adminClient
          .from("market_broadcasts")
          .update({ status: "confirmed" })
          .eq("nowpayments_payment_id", promoRef)
          .eq("status", "pending");

        console.log("Activated promotion items for:", promoRef);
      }
    } catch (promoErr) {
      console.error("Promotion activation error:", promoErr);
    }

    console.log("Payaza deposit confirmed successfully:", tx.id);
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("payaza-webhook error:", err);
    try {
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      await logWebhookEvent(adminClient, {
        provider: "payaza",
        event_type: "error",
        status: "error",
        error: err,
      });
    } catch { /* swallow */ }
    return errorResponse(err, 500, corsHeaders);
  }
});
