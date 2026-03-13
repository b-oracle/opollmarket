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

    // Find the pending transaction
    const { data: tx, error: txError } = await adminClient
      .from("transactions")
      .select("id, user_id, amount, status")
      .eq("nowpayments_payment_id", reference)
      .eq("payment_provider", "payaza")
      .eq("type", "deposit")
      .maybeSingle();

    if (txError || !tx) {
      console.error("Transaction not found for reference:", reference, txError);
      return new Response(JSON.stringify({ error: "Transaction not found" }), {
        status: 404, headers: corsHeaders,
      });
    }

    // Already confirmed — idempotent
    if (tx.status === "confirmed") {
      console.log("Transaction already confirmed:", tx.id);
      return new Response(JSON.stringify({ success: true, message: "Already confirmed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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

    // Credit user balance
    const depositAmount = Number(tx.amount);

    // Get current balance and add deposit
    const { data: currentBal } = await adminClient
      .from("balances")
      .select("amount")
      .eq("user_id", tx.user_id)
      .single();

    if (currentBal) {
      await adminClient
        .from("balances")
        .update({
          amount: Number(currentBal.amount) + depositAmount,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", tx.user_id);

      console.log(`Credited $${depositAmount} to user ${tx.user_id}. New balance: ${Number(currentBal.amount) + depositAmount}`);
    } else {
      console.error("Balance record not found for user:", tx.user_id);
    }

    // Mark transaction as confirmed
    await adminClient
      .from("transactions")
      .update({ status: "confirmed" })
      .eq("id", tx.id);

    // Settle any debts
    await adminClient.rpc("settle_user_debts", { _user_id: tx.user_id });

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
