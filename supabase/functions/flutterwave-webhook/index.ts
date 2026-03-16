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
    console.log("Flutterwave webhook received:", JSON.stringify(body).substring(0, 1000));

    // Flutterwave sends: { event: "charge.completed", data: { ... } }
    // or for transfers: { event: "transfer.completed", data: { ... } }
    const event = body.event;
    const data = body.data;

    if (!event || !data) {
      return new Response(JSON.stringify({ status: "ignored" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify webhook by checking the secret hash header
    const secretHash = Deno.env.get("FLUTTERWAVE_WEBHOOK_HASH");
    if (secretHash) {
      const signature = req.headers.get("verif-hash");
      if (signature !== secretHash) {
        console.warn("Flutterwave webhook: invalid signature");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ─── Handle deposit (charge) completion ───
    if (event === "charge.completed" && data.status === "successful") {
      const txRef = data.tx_ref;
      if (!txRef) {
        console.warn("No tx_ref in charge webhook");
        return new Response(JSON.stringify({ status: "no_tx_ref" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find the pending transaction
      const { data: txn, error: txnError } = await adminClient
        .from("transactions")
        .select("id, user_id, amount, status")
        .eq("nowpayments_payment_id", txRef)
        .eq("type", "deposit")
        .single();

      if (txnError || !txn) {
        console.warn(`No matching deposit for tx_ref: ${txRef}`);
        return new Response(JSON.stringify({ status: "not_found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (txn.status === "confirmed") {
        console.log(`Deposit ${txRef} already confirmed`);
        return new Response(JSON.stringify({ status: "already_confirmed" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Confirm the deposit
      await adminClient
        .from("transactions")
        .update({ status: "confirmed" })
        .eq("id", txn.id);

      // Credit user balance
      await adminClient.rpc("adjust_balance", {
        _user_id: txn.user_id,
        _delta: txn.amount,
        _bonus_delta: 0,
        _insurance_delta: 0,
      });

      // Settle any debts
      await adminClient.rpc("settle_user_debts", { _user_id: txn.user_id });

      // Notify user
      await adminClient.from("notifications").insert({
        user_id: txn.user_id,
        title: "Deposit Confirmed! 🎉",
        message: `Your deposit of $${Number(txn.amount).toFixed(2)} has been confirmed.`,
        type: "deposit",
      });

      console.log(`Flutterwave deposit confirmed: ${txRef}, $${txn.amount} for user ${txn.user_id}`);

      return new Response(JSON.stringify({ status: "confirmed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Handle transfer (withdrawal) completion ───
    if (event === "transfer.completed" && data.status === "SUCCESSFUL") {
      const reference = data.reference;
      if (!reference) {
        console.warn("No reference in transfer webhook");
        return new Response(JSON.stringify({ status: "no_reference" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

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
      const reference = data.reference;
      if (!reference) {
        return new Response(JSON.stringify({ status: "no_reference" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Refund user balance
      const { data: txn } = await adminClient
        .from("transactions")
        .select("user_id, amount")
        .eq("nowpayments_payment_id", reference)
        .eq("type", "withdrawal")
        .eq("status", "pending")
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
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
