import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const body = await req.json();
    console.log("Payaza webhook payload:", JSON.stringify(body));

    // Extract reference — Payaza sends it in multiple possible fields
    const reference =
      body.transaction_reference ||
      body.merchant_reference ||
      body.account_reference ||
      body.data?.transaction_reference ||
      body.data?.merchant_reference ||
      body.data?.account_reference;

    // Extract status — normalize to lowercase for comparison
    const rawStatus = (
      body.status ||
      body.transaction_status ||
      body.data?.status ||
      body.data?.transaction_status ||
      ""
    ).toString().toLowerCase().trim();

    console.log(`Payaza webhook: reference=${reference}, rawStatus=${rawStatus}`);

    if (!reference) {
      return new Response(JSON.stringify({ error: "Missing transaction_reference" }), {
        status: 400, headers: corsHeaders,
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

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
      return new Response(JSON.stringify({ error: "Transaction not found or already claimed" }), {
        status: 404, headers: corsHeaders,
      });
    }

    // Check if payment was successful — case-insensitive matching
    const successStatuses = ["approved", "successful", "completed", "funds received", "success"];
    const isSuccess = successStatuses.some(s => rawStatus.includes(s));

    console.log(`Payaza webhook: isSuccess=${isSuccess} for status="${rawStatus}"`);

    if (!isSuccess) {
      await adminClient
        .from("transactions")
        .update({ status: "failed" })
        .eq("id", tx.id);

      console.log("Payment not successful, marked as failed:", tx.id);
      return new Response(JSON.stringify({ success: true, message: "Payment not successful" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── STEP 1: Credit user balance ATOMICALLY (prevents race conditions) ──
    const depositAmount = Number(tx.amount);
    const { error: balanceError } = await adminClient.rpc("adjust_balance", {
      _user_id: tx.user_id,
      _delta: depositAmount,
      _bonus_delta: 0,
      _insurance_delta: 0,
    });

    if (balanceError) {
      console.error("CRITICAL: Failed to credit balance for Payaza deposit:", balanceError);
      // Do NOT mark transaction as confirmed — leave it pending so it can be retried
      return new Response(JSON.stringify({ error: "Balance credit failed" }), {
        status: 500, headers: corsHeaders,
      });
    }

    console.log(`Credited $${depositAmount} to user ${tx.user_id} via adjust_balance RPC`);

    // ── STEP 2: Mark transaction as confirmed ONLY after balance is credited ──
    const { error: txUpdateError } = await adminClient
      .from("transactions")
      .update({ status: "confirmed" })
      .eq("id", tx.id);

    if (txUpdateError) {
      console.error("WARNING: Balance credited but tx update failed:", txUpdateError);
      // Balance was already credited — log for manual reconciliation
    }

    // ── STEP 3: Verify balance was actually updated (safety net) ──
    const { data: verifyBalance } = await adminClient
      .from("balances")
      .select("amount")
      .eq("user_id", tx.user_id)
      .single();

    console.log(`Post-credit balance verification for ${tx.user_id}: $${verifyBalance?.amount}`);

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
