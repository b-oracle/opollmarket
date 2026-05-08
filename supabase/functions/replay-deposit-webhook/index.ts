import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Super-admin only: replay a missed/stuck NOWPayments deposit webhook.
 *
 * IMPORTANT — this endpoint does NOT blindly credit the user. It:
 *   1. Looks up the local transaction.
 *   2. Calls NOWPayments' API (`GET /v1/payment/{payment_id}`) to fetch the
 *      REAL on-chain payment status and the amount actually received.
 *   3. Refuses to credit if the payment is not in a paid state on NOWPayments
 *      (e.g. waiting/expired/failed).
 *   4. Runs the same deviation classification used by the live webhook
 *      (wrong_asset / partial / overpayment / normal). Only `normal` and
 *      bounded `overpayment` are auto-credited; everything else is flagged
 *      for admin review with no balance change.
 *   5. Idempotent: only flips non-confirmed rows. Concurrent replays cannot
 *      double-credit.
 *
 * For arbitrary manual credits (off-chain reconciliation), use
 * `admin-credit-deposit` instead.
 */

type Thresholds = {
  overpay: number; partial: number; wrongHigh: number; wrongLow: number; largeAlert: number;
};
const DEFAULT_THRESHOLDS: Thresholds = {
  overpay: 1.02, partial: 0.98, wrongHigh: 2.0, wrongLow: 0.3, largeAlert: 1.5,
};

async function loadThresholds(admin: any): Promise<Thresholds> {
  try {
    const { data } = await admin.from("commission_settings")
      .select("deposit_overpay_threshold, deposit_partial_threshold, deposit_wrong_asset_high, deposit_wrong_asset_low, deposit_large_overpay_alert")
      .limit(1).maybeSingle();
    if (!data) return DEFAULT_THRESHOLDS;
    return {
      overpay: Number(data.deposit_overpay_threshold) || DEFAULT_THRESHOLDS.overpay,
      partial: Number(data.deposit_partial_threshold) || DEFAULT_THRESHOLDS.partial,
      wrongHigh: Number(data.deposit_wrong_asset_high) || DEFAULT_THRESHOLDS.wrongHigh,
      wrongLow: Number(data.deposit_wrong_asset_low) || DEFAULT_THRESHOLDS.wrongLow,
      largeAlert: Number(data.deposit_large_overpay_alert) || DEFAULT_THRESHOLDS.largeAlert,
    };
  } catch { return DEFAULT_THRESHOLDS; }
}

function classify(requested: number, received: number, payCur: string, outCur: string, t: Thresholds) {
  const ratio = requested > 0 ? received / requested : 1;
  const sameAsset = payCur !== "" && payCur === outCur;
  const sameOver = sameAsset && requested > 0 && received >= requested * t.overpay;
  const wrongAsset = !sameAsset && (ratio > t.wrongHigh || (ratio < t.wrongLow && received > 0));
  if (wrongAsset) return { kind: "wrong_asset" as const, ratio };
  if (sameOver) return { kind: "overpayment" as const, ratio, excess: received - requested };
  const credit = requested > 0 ? Math.min(received > 0 ? received : requested, requested) : received;
  if (credit < requested * t.partial) return { kind: "partial" as const, ratio, credit, shortfall: requested - credit };
  return { kind: "normal" as const, ratio, credit };
}

const PAID_STATUSES = new Set(["finished", "confirmed", "sending", "partially_paid"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: isSuper } = await admin.rpc("has_role", { _user_id: user.id, _role: "super_admin" });
    if (!isSuper) return json({ error: "Forbidden: super_admin required" }, 403);

    const body = await req.json().catch(() => ({}));
    const { transaction_id, payment_id } = body as { transaction_id?: string; payment_id?: string };
    if (!transaction_id && !payment_id) return json({ error: "transaction_id or payment_id required" }, 400);

    // Look up the transaction
    let q = admin.from("transactions")
      .select("id, user_id, amount, status, payment_provider, nowpayments_payment_id, type")
      .eq("type", "deposit");
    if (transaction_id) q = q.eq("id", transaction_id);
    else if (payment_id) q = q.eq("nowpayments_payment_id", payment_id);
    const { data: tx, error: txErr } = await q.maybeSingle();
    if (txErr || !tx) return json({ error: "Transaction not found" }, 404);

    if (tx.status === "confirmed") {
      return json({ success: true, already_confirmed: true, message: "Already credited", transaction_id: tx.id });
    }
    if (tx.payment_provider && tx.payment_provider !== "nowpayments") {
      return json({ error: `Replay only supported for nowpayments deposits (got ${tx.payment_provider}). Use admin-credit-deposit for manual credits.` }, 400);
    }
    const npId = tx.nowpayments_payment_id || payment_id;
    if (!npId) return json({ error: "Transaction has no NOWPayments payment_id to verify" }, 400);

    // Fetch REAL payment status from NOWPayments
    const apiKey = Deno.env.get("NOWPAYMENTS_API_KEY");
    if (!apiKey) return json({ error: "NOWPAYMENTS_API_KEY not configured" }, 500);

    const npRes = await fetch(`https://api.nowpayments.io/v1/payment/${encodeURIComponent(String(npId))}`, {
      headers: { "x-api-key": apiKey },
    });
    if (!npRes.ok) {
      const txt = await npRes.text();
      console.error("NOWPayments lookup failed:", npRes.status, txt);
      return json({ error: `NOWPayments lookup failed (${npRes.status}): ${txt}` }, 502);
    }
    const np = await npRes.json();

    const paymentStatus = String(np.payment_status ?? "").toLowerCase();
    if (!PAID_STATUSES.has(paymentStatus)) {
      return json({
        error: "Deposit not eligible — provider reports payment is not paid",
        payment_status: paymentStatus,
        provider_response: { payment_id: np.payment_id, actually_paid: np.actually_paid, pay_currency: np.pay_currency },
      }, 409);
    }

    const requestedAmount = Number(np.price_amount) || Number(tx.amount) || 0;
    const netReceived = Number(np.outcome_amount) || Number(np.actually_paid) || 0;
    if (!(netReceived > 0)) {
      return json({ error: "Provider reports zero received amount — nothing to credit", provider_response: np }, 409);
    }

    const payCur = String(np.pay_currency ?? "").toLowerCase();
    const outCur = String(np.outcome_currency ?? np.pay_currency ?? "").toLowerCase();
    const thresholds = await loadThresholds(admin);
    const cls = classify(requestedAmount, netReceived, payCur, outCur, thresholds);

    // Refuse to auto-credit anything other than normal / bounded overpayment
    if (cls.kind === "wrong_asset" || cls.kind === "partial") {
      // Flag the transaction for admin review, but DO NOT credit
      await admin.from("transactions").update({
        status: cls.kind,
        gross_amount_usd: netReceived,
        net_amount_usd: netReceived,
      }).eq("id", tx.id).neq("status", "confirmed");

      await admin.from("audit_logs").insert({
        actor_id: user.id, action: "manual_deposit_replay_blocked",
        target_type: "transaction", target_id: tx.id,
        details: {
          reason: cls.kind, ratio: cls.ratio,
          requested: requestedAmount, received: netReceived,
          pay_currency: payCur, outcome_currency: outCur,
          provider_status: paymentStatus,
        },
      });
      return json({
        success: false, blocked: true, reason: cls.kind,
        message: cls.kind === "wrong_asset"
          ? "Wrong asset / extreme deviation — flagged for manual review, not credited."
          : `Partial deposit (received $${netReceived.toFixed(2)} of $${requestedAmount.toFixed(2)}) — flagged for manual review, not credited.`,
        ratio: cls.ratio, requested: requestedAmount, received: netReceived,
      }, 200);
    }

    let creditMain = 0; let creditBonus = 0; let excess = 0;
    if (cls.kind === "overpayment") {
      const overpayCap = Math.min(requestedAmount * 5, 5000);
      if (cls.excess > overpayCap) {
        await admin.from("transactions").update({
          status: "wrong_asset",
          gross_amount_usd: netReceived, net_amount_usd: netReceived,
        }).eq("id", tx.id).neq("status", "confirmed");
        return json({
          success: false, blocked: true, reason: "excessive_overpayment",
          message: `Overpayment of $${cls.excess.toFixed(2)} exceeds safety cap $${overpayCap.toFixed(2)} — flagged for manual review.`,
        }, 200);
      }
      creditMain = requestedAmount;
      creditBonus = cls.excess;
      excess = cls.excess;
    } else {
      creditMain = cls.credit;
    }

    // Atomic claim — only flips non-confirmed rows
    const { data: claimed, error: claimErr } = await admin.from("transactions")
      .update({
        status: "confirmed",
        nowpayments_payment_id: String(npId),
        payment_provider: "nowpayments",
        amount: creditMain,
        gross_amount_usd: netReceived,
        net_amount_usd: creditMain,
      })
      .eq("id", tx.id).neq("status", "confirmed")
      .select("id, user_id").maybeSingle();

    if (claimErr) {
      console.error("replay-deposit-webhook claim failed:", claimErr);
      return json({ error: "Failed to claim transaction" }, 500);
    }
    if (!claimed) {
      return json({ success: true, already_confirmed: true, message: "Concurrent confirmation detected — no double credit", transaction_id: tx.id });
    }

    const { error: balErr } = await admin.rpc("adjust_balance", {
      _user_id: tx.user_id, _delta: creditMain, _bonus_delta: creditBonus, _insurance_delta: 0,
    });
    if (balErr) {
      console.error("CRITICAL: claimed but balance credit failed:", balErr, claimed);
      return json({ error: "Balance credit failed AFTER tx flipped — manual intervention required", transaction_id: tx.id }, 500);
    }

    if (excess > 0) {
      await admin.from("transactions").insert({
        user_id: tx.user_id, type: "overpayment_bonus", amount: excess, status: "confirmed",
        nowpayments_payment_id: String(npId),
        description: `Overpayment surplus from deposit ${npId} — credited to bonus balance (replay).`,
      });
    }

    await admin.from("notifications").insert({
      user_id: tx.user_id,
      title: "Deposit Confirmed ✅",
      message: excess > 0
        ? `Your $${creditMain.toFixed(2)} deposit was credited. Overpaid $${excess.toFixed(2)} added to bonus balance.`
        : `Your deposit of $${creditMain.toFixed(2)} has been confirmed.`,
      type: "deposit",
    });

    await admin.from("audit_logs").insert({
      actor_id: user.id, action: "manual_deposit_replay",
      target_type: "transaction", target_id: tx.id,
      details: {
        previous_status: tx.status, classification: cls.kind, ratio: cls.ratio,
        requested: requestedAmount, received: netReceived,
        credited_main: creditMain, credited_bonus: creditBonus,
        provider_status: paymentStatus, payment_id: npId,
      },
    });

    try { await admin.rpc("settle_user_debts", { _user_id: tx.user_id }); } catch (e) { console.warn("settle_user_debts failed:", e); }

    return json({
      success: true, transaction_id: tx.id,
      classification: cls.kind, ratio: cls.ratio,
      requested: requestedAmount, received: netReceived,
      credited_main: creditMain, credited_bonus: creditBonus,
      previous_status: tx.status,
    });
  } catch (err) {
    console.error("replay-deposit-webhook error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
