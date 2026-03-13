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

    // Payaza sends transaction_reference and status in the webhook
    const reference = body.transaction_reference || body.data?.transaction_reference;
    const status = body.status || body.data?.status;

    if (!reference) {
      return new Response(JSON.stringify({ error: "Missing transaction_reference" }), {
        status: 400, headers: corsHeaders,
      });
    }

    // Verify webhook secret if available
    const secretKey = Deno.env.get("PAYAZA_SECRET_KEY");
    // Payaza may send a signature header for verification
    const signature = req.headers.get("x-payaza-signature") || req.headers.get("payaza-signature");
    // For now we verify by checking the transaction exists in our DB

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
      console.error("Transaction not found for reference:", reference);
      return new Response(JSON.stringify({ error: "Transaction not found" }), {
        status: 404, headers: corsHeaders,
      });
    }

    // Already confirmed — idempotent
    if (tx.status === "confirmed") {
      return new Response(JSON.stringify({ success: true, message: "Already confirmed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if payment was successful
    const isSuccess = status === "Approved" || status === "approved" || status === "successful" || status === "completed";

    if (!isSuccess) {
      // Update to failed
      await adminClient
        .from("transactions")
        .update({ status: "failed" })
        .eq("id", tx.id);

      return new Response(JSON.stringify({ success: true, message: "Payment not successful" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Credit user balance
    const depositAmount = Number(tx.amount);

    const { data: bal } = await adminClient
      .from("balances")
      .select("id")
      .eq("user_id", tx.user_id)
      .maybeSingle();

    if (bal) {
      await adminClient.rpc("settle_user_debts", { _user_id: tx.user_id });

      await adminClient
        .from("balances")
        .update({ amount: adminClient.rpc ? undefined : 0 })
        .eq("user_id", tx.user_id);

      // Use raw SQL-style increment via RPC or direct update
      const { data: currentBal } = await adminClient
        .from("balances")
        .select("amount")
        .eq("user_id", tx.user_id)
        .single();

      if (currentBal) {
        await adminClient
          .from("balances")
          .update({ amount: Number(currentBal.amount) + depositAmount, updated_at: new Date().toISOString() })
          .eq("user_id", tx.user_id);
      }
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
      message: `Your ₦ deposit of $${depositAmount.toFixed(2)} has been credited to your balance.`,
      type: "deposit",
    });

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
