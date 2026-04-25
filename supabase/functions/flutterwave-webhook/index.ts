import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logWebhookEvent } from "../_shared/webhookLog.ts";
import {
  safeEqual,
  validateFlutterwavePayload,
  validateFlutterwaveCharge,
  validateFlutterwaveTransfer,
} from "../_shared/webhookValidation.ts";
import { errorResponse } from "../_shared/errors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function processWelcomeBonus(supabase: any, userId: string, depositAmount: number) {
  // 1. Check feature toggle
  const { data: toggle } = await supabase
    .from("feature_toggles")
    .select("enabled")
    .eq("feature_key", "welcome_bonus")
    .maybeSingle();
  if (!toggle?.enabled) return;

  // 2. Idempotency: check if welcome_bonus already credited
  const { count: existingBonus } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("type", "welcome_bonus")
    .eq("status", "confirmed");
  if ((existingBonus ?? 0) > 0) {
    console.log(`Welcome bonus already credited for user ${userId}`);
    return;
  }

  // 3. Check KYC status
  const { data: profile } = await supabase
    .from("profiles")
    .select("kyc_status")
    .eq("id", userId)
    .single();
  if (!profile || profile.kyc_status !== "approved") return;

  // 4. Check if first deposit (no other confirmed deposits)
  const { count } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("type", "deposit")
    .eq("status", "confirmed");
  if ((count ?? 0) > 1) return; // >1 because current deposit is already confirmed

  // 5. Get settings
  const { data: settings } = await supabase
    .from("commission_settings")
    .select("welcome_bonus_percent, welcome_bonus_cap")
    .limit(1)
    .single();
  if (!settings) return;
  const percent = Number(settings.welcome_bonus_percent) || 0;
  const cap = Number(settings.welcome_bonus_cap) || 0;
  if (percent <= 0 || cap <= 0) return;

  // 6. Calculate and credit
  const bonus = Math.min(depositAmount * percent / 100, cap);
  if (bonus <= 0) return;

  const { error: adjError } = await supabase.rpc("adjust_balance", {
    _user_id: userId,
    _delta: 0,
    _bonus_delta: bonus,
  });
  if (adjError) {
    console.error("Welcome bonus credit failed:", adjError);
    return;
  }

  // 7. Log transaction & notify
  await supabase.from("transactions").insert({
    user_id: userId,
    type: "welcome_bonus",
    amount: bonus,
    status: "confirmed",
  });

  await supabase.from("notifications").insert({
    user_id: userId,
    title: "Welcome Bonus! 🎁",
    message: `You received a $${bonus.toFixed(2)} welcome bonus on your first deposit!`,
    type: "deposit",
  });

  console.log(`Welcome bonus: $${bonus.toFixed(2)} credited to user ${userId}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Signature verification (constant-time) BEFORE parsing body ──
    const secretHash = Deno.env.get("FLUTTERWAVE_WEBHOOK_HASH");
    if (!secretHash) {
      console.error("FLUTTERWAVE_WEBHOOK_HASH not configured — rejecting webhook");
      return new Response(JSON.stringify({ error: "Webhook not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const signature = req.headers.get("verif-hash");
    if (!safeEqual(signature, secretHash)) {
      console.warn("Flutterwave webhook: invalid signature");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Parse + validate body ──
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log("Flutterwave webhook received:", JSON.stringify(raw).substring(0, 1000));

    const parsed = validateFlutterwavePayload(raw);
    if (!parsed.ok) {
      console.warn("Flutterwave webhook validation failed:", parsed.error);
      return new Response(JSON.stringify({ error: parsed.error }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { event, data } = parsed.value;

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ─── Handle deposit (charge) completion ───
    if (event === "charge.completed" && data.status === "successful") {
      const chargeCheck = validateFlutterwaveCharge(data);
      if (!chargeCheck.ok) {
        console.warn("Invalid Flutterwave charge payload:", chargeCheck.error);
        await logWebhookEvent(adminClient, {
          provider: "flutterwave",
          event_type: "validation_failed",
          status: "warning",
          message: chargeCheck.error,
          payload: parsed.value.raw,
        });
        return new Response(JSON.stringify({ error: chargeCheck.error }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { tx_ref: txRef, currency, amount: reportedAmount } = chargeCheck.value;

      // Strict currency check — Flutterwave deposits are NGN-only in this integration
      if (currency !== "NGN") {
        console.warn(`Flutterwave webhook: unexpected currency ${currency} for ${txRef}`);
        await logWebhookEvent(adminClient, {
          provider: "flutterwave",
          event_type: "wrong_currency",
          status: "warning",
          reference: txRef,
          message: `Expected NGN, got ${currency}`,
          payload: parsed.value.raw,
        });
        return new Response(JSON.stringify({ error: "Unsupported currency" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if already processed (idempotency) — scope to provider
      const { data: alreadyDone } = await adminClient
        .from("transactions")
        .select("id")
        .eq("nowpayments_payment_id", txRef)
        .eq("payment_provider", "flutterwave")
        .eq("type", "deposit")
        .in("status", ["confirmed", "processing"])
        .maybeSingle();

      if (alreadyDone) {
        console.log(`Deposit ${txRef} already confirmed/claimed`);
        return new Response(JSON.stringify({ status: "already_confirmed" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Atomically claim the transaction (prevents concurrent webhook replays)
      const { data: claimedRows } = await adminClient.rpc("claim_webhook_deposit", {
        _payment_id: txRef,
        _provider: "flutterwave",
      });
      const txn = claimedRows?.[0] || null;

      if (!txn) {
        console.warn(`No claimable deposit for tx_ref: ${txRef}`);
        return new Response(JSON.stringify({ status: "not_found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── STEP 1: Credit user balance FIRST (atomic RPC) ──
      const { error: balanceError } = await adminClient.rpc("adjust_balance", {
        _user_id: txn.user_id,
        _delta: txn.amount,
        _bonus_delta: 0,
        _insurance_delta: 0,
      });

      if (balanceError) {
        console.error("CRITICAL: Failed to credit balance for Flutterwave deposit:", balanceError);
        await logWebhookEvent(adminClient, {
          provider: "flutterwave",
          event_type: "credit_failed",
          status: "error",
          reference: txRef,
          transaction_id: txn.id,
          user_id: txn.user_id,
          requested_amount: Number(txn.amount),
          error: balanceError,
        });
        return new Response(JSON.stringify({ status: "balance_credit_failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`Credited $${txn.amount} to user ${txn.user_id} via adjust_balance RPC`);

      await logWebhookEvent(adminClient, {
        provider: "flutterwave",
        event_type: "credited",
        status: "success",
        reference: txRef,
        transaction_id: txn.id,
        user_id: txn.user_id,
        requested_amount: Number(txn.amount),
        credited_amount: Number(txn.amount),
      });

      // ── STEP 2: Mark transaction as confirmed ONLY after balance credit succeeds ──
      const { error: txUpdateError } = await adminClient
        .from("transactions")
        .update({ status: "confirmed" })
        .eq("id", txn.id);

      if (txUpdateError) {
        console.error("WARNING: Balance credited but tx update failed:", txUpdateError);
      }

      // ── STEP 3: Verify balance (safety net logging) ──
      const { data: verifyBalance } = await adminClient
        .from("balances")
        .select("amount")
        .eq("user_id", txn.user_id)
        .single();

      console.log(`Post-credit balance verification for ${txn.user_id}: $${verifyBalance?.amount}`);

      // Settle any debts
      try {
        const { data: debtResult } = await adminClient.rpc("settle_user_debts", { _user_id: txn.user_id });
        if (debtResult && Number(debtResult.amount) > 0) {
          console.log(`Settled $${debtResult.amount} in debts for user ${txn.user_id}`);
        }
      } catch (debtErr) {
        console.error("Failed to settle debts:", debtErr);
      }

      // Notify user
      await adminClient.from("notifications").insert({
        user_id: txn.user_id,
        title: "Deposit Confirmed! 🎉",
        message: `Your deposit of $${Number(txn.amount).toFixed(2)} has been confirmed.`,
        type: "deposit",
      });

      // Welcome bonus check
      try {
        await processWelcomeBonus(adminClient, txn.user_id, Number(txn.amount));
      } catch (wbErr) {
        console.error("Welcome bonus error:", wbErr);
      }

      console.log(`Flutterwave deposit confirmed: ${txRef}, $${txn.amount} for user ${txn.user_id}`);

      return new Response(JSON.stringify({ status: "confirmed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Handle transfer (withdrawal) completion ───
    if (event === "transfer.completed" && data.status === "SUCCESSFUL") {
      const xferCheck = validateFlutterwaveTransfer(data);
      if (!xferCheck.ok) {
        console.warn("Invalid Flutterwave transfer payload:", xferCheck.error);
        return new Response(JSON.stringify({ error: xferCheck.error }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { reference } = xferCheck.value;

      // Update transaction to confirmed
      await adminClient
        .from("transactions")
        .update({ status: "confirmed" })
        .eq("nowpayments_payment_id", reference)
        .eq("type", "withdrawal");

      // Update withdrawal request
      const { data: txn } = await adminClient
        .from("transactions")
        .select("user_id")
        .eq("nowpayments_payment_id", reference)
        .eq("type", "withdrawal")
        .single();

      if (txn) {
        await adminClient
          .from("withdrawal_requests")
          .update({ status: "completed", updated_at: new Date().toISOString() })
          .eq("user_id", txn.user_id)
          .eq("crypto_currency", "NGN")
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1);
      }

      console.log(`Flutterwave transfer confirmed: ${reference}`);
      return new Response(JSON.stringify({ status: "confirmed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Handle transfer failure ───
    if (event === "transfer.failed" || (event === "transfer.completed" && data.status === "FAILED")) {
      const xferCheck = validateFlutterwaveTransfer(data);
      if (!xferCheck.ok) {
        return new Response(JSON.stringify({ error: xferCheck.error }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { reference } = xferCheck.value;

      // Refund user balance
      const { data: txn } = await adminClient
        .from("transactions")
        .select("user_id, amount, status")
        .eq("nowpayments_payment_id", reference)
        .eq("type", "withdrawal")
        .in("status", ["pending", "processing"])
        .single();

      if (txn) {
        await adminClient.rpc("adjust_balance", {
          _user_id: txn.user_id,
          _delta: txn.amount,
          _bonus_delta: 0,
          _insurance_delta: 0,
        });

        await adminClient
          .from("transactions")
          .update({ status: "failed" })
          .eq("nowpayments_payment_id", reference)
          .eq("type", "withdrawal");

        await adminClient
          .from("withdrawal_requests")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .eq("user_id", txn.user_id)
          .eq("crypto_currency", "NGN")
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1);

        await adminClient.from("notifications").insert({
          user_id: txn.user_id,
          title: "Withdrawal Failed",
          message: `Your withdrawal of $${Number(txn.amount).toFixed(2)} failed. The amount has been refunded to your balance.`,
          type: "withdrawal",
        });

        console.log(`Flutterwave transfer failed, refunded: ${reference}`);
      }

      return new Response(JSON.stringify({ status: "failed_refunded" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Unhandled Flutterwave webhook event: ${event}`);
    return new Response(JSON.stringify({ status: "unhandled" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("flutterwave-webhook error:", err);
    try {
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      await logWebhookEvent(adminClient, {
        provider: "flutterwave",
        event_type: "error",
        status: "error",
        error: err,
      });
    } catch { /* swallow */ }
    return errorResponse(err, 500, corsHeaders);
  }
});
