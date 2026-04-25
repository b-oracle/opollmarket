import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logWebhookEvent } from "../_shared/webhookLog.ts";

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
    // ── Webhook secret verification ──
    const webhookSecret = Deno.env.get("PAYAZA_WEBHOOK_SECRET");
    if (webhookSecret) {
      const incomingToken =
        req.headers.get("x-payaza-webhook-token") ||
        req.headers.get("payaza-webhook-token") ||
        req.headers.get("x-webhook-token") ||
        new URL(req.url).searchParams.get("token");

      if (incomingToken !== webhookSecret) {
        console.error("Payaza webhook: invalid or missing webhook token");
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Log all incoming headers (names only) for debugging
    const headerNames = [...req.headers.keys()];
    console.log("Payaza webhook headers:", headerNames.join(", "));

    const rawBody = await req.text();
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      console.error("Payaza webhook: non-JSON body:", rawBody.substring(0, 500));
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Payaza webhook payload:", JSON.stringify(body).substring(0, 1000));

    // Extract reference — Payaza sends it in multiple possible fields
    const reference =
      body.transaction_reference ||
      body.merchant_reference ||
      body.account_reference ||
      body.data?.transaction_reference ||
      body.data?.merchant_reference ||
      body.data?.account_reference ||
      body.response_content?.transaction_reference ||
      body.response_content?.merchant_reference ||
      body.response_content?.account_reference;

    // Extract status — normalize to lowercase
    const rawStatus = (
      body.status ||
      body.transaction_status ||
      body.data?.status ||
      body.data?.transaction_status ||
      body.response_content?.status ||
      body.response_content?.transaction_status ||
      ""
    ).toString().toLowerCase().trim();

    console.log(`Payaza webhook: reference=${reference}, rawStatus=${rawStatus}`);

    if (!reference) {
      console.error("Payaza webhook: no reference found in payload");
      return new Response(JSON.stringify({ error: "Missing transaction_reference" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // Check if payment was successful
    const successStatuses = ["approved", "successful", "completed", "funds received", "success"];
    const isSuccess = successStatuses.some(s => rawStatus.includes(s));

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

    // ── STEP 1: Credit user balance ATOMICALLY ──
    const depositAmount = Number(tx.amount);
    const { error: balanceError } = await adminClient.rpc("adjust_balance", {
      _user_id: tx.user_id,
      _delta: depositAmount,
      _bonus_delta: 0,
      _insurance_delta: 0,
    });

    if (balanceError) {
      console.error("CRITICAL: Failed to credit balance for Payaza deposit:", balanceError);
      return new Response(JSON.stringify({ error: "Balance credit failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Credited $${depositAmount} to user ${tx.user_id}`);

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
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
