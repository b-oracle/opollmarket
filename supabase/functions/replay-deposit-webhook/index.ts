import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Super-admin only: replay a missed/stuck deposit webhook.
 *
 * Behaviour:
 *  - If the transaction is already `confirmed` → no-op, returns `already_confirmed`.
 *  - If `pending` / `expired` / `partial` / `wrong_asset` → atomically transitions
 *    to `confirmed`, credits the user the requested amount (default = tx.amount),
 *    inserts a notification + audit log.
 *  - Idempotent: the atomic UPDATE only matches non-confirmed rows, so concurrent
 *    replays cannot double-credit.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Super-admin gate
    const { data: isSuper } = await admin.rpc("has_role", {
      _user_id: user.id, _role: "super_admin",
    });
    if (!isSuper) {
      return new Response(JSON.stringify({ error: "Forbidden: super_admin required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { transaction_id, payment_id, amount: amountOverride } = body as {
      transaction_id?: string;
      payment_id?: string;
      amount?: number;
    };

    if (!transaction_id && !payment_id) {
      return new Response(JSON.stringify({ error: "transaction_id or payment_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up the transaction
    let q = admin
      .from("transactions")
      .select("id, user_id, amount, status, payment_provider, nowpayments_payment_id, type")
      .eq("type", "deposit");
    if (transaction_id) q = q.eq("id", transaction_id);
    else if (payment_id) q = q.eq("nowpayments_payment_id", payment_id);

    const { data: tx, error: txErr } = await q.maybeSingle();
    if (txErr || !tx) {
      return new Response(JSON.stringify({ error: "Transaction not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (tx.status === "confirmed") {
      return new Response(JSON.stringify({
        success: true,
        already_confirmed: true,
        message: "Already credited — no action taken",
        transaction_id: tx.id,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const creditAmount = Number(amountOverride) > 0 ? Number(amountOverride) : Number(tx.amount);
    if (!(creditAmount > 0)) {
      return new Response(JSON.stringify({ error: "Invalid credit amount" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Atomic guard: only flip non-confirmed rows. Concurrent replays will not match.
    const { data: claimed, error: claimErr } = await admin
      .from("transactions")
      .update({
        status: "confirmed",
        net_amount_usd: creditAmount,
        gross_amount_usd: creditAmount,
      })
      .eq("id", tx.id)
      .neq("status", "confirmed")
      .select("id, user_id, amount")
      .maybeSingle();

    if (claimErr) {
      console.error("replay-deposit-webhook: claim failed:", claimErr);
      return new Response(JSON.stringify({ error: "Failed to claim transaction" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!claimed) {
      // Lost the race — someone else just confirmed it.
      return new Response(JSON.stringify({
        success: true,
        already_confirmed: true,
        message: "Concurrent confirmation detected — no double credit",
        transaction_id: tx.id,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Credit the balance
    const { error: balErr } = await admin.rpc("adjust_balance", {
      _user_id: tx.user_id,
      _delta: creditAmount,
      _bonus_delta: 0,
      _insurance_delta: 0,
    });
    if (balErr) {
      console.error("CRITICAL: claimed tx but failed to credit balance:", balErr, claimed);
      return new Response(JSON.stringify({
        error: "Balance credit failed AFTER tx flipped to confirmed — manual intervention required",
        transaction_id: tx.id,
      }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Notify user
    await admin.from("notifications").insert({
      user_id: tx.user_id,
      title: "Deposit Confirmed ✅",
      message: `Your deposit of $${creditAmount.toFixed(2)} has been manually confirmed.`,
      type: "deposit",
    });

    // Audit log
    await admin.from("audit_logs").insert({
      actor_id: user.id,
      action: "manual_deposit_replay",
      target_type: "transaction",
      target_id: tx.id,
      details: {
        amount: creditAmount,
        previous_status: tx.status,
        payment_provider: tx.payment_provider,
        payment_id: tx.nowpayments_payment_id,
        reason: "super_admin webhook replay",
      },
    });

    // Settle outstanding debts (best-effort)
    try {
      await admin.rpc("settle_user_debts", { _user_id: tx.user_id });
    } catch (e) {
      console.warn("settle_user_debts failed:", e);
    }

    return new Response(JSON.stringify({
      success: true,
      transaction_id: tx.id,
      credited: creditAmount,
      previous_status: tx.status,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("replay-deposit-webhook error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
