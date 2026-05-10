// Pure, testable core of the replay-deposit-webhook function.
//
// Accepts an injected supabase admin client and fetch implementation so the
// flow can be exercised in unit/integration tests without hitting the real
// database or NOWPayments API.

export type Thresholds = {
  overpay: number; partial: number; wrongHigh: number; wrongLow: number; largeAlert: number;
};
export const DEFAULT_THRESHOLDS: Thresholds = {
  overpay: 1.02, partial: 0.98, wrongHigh: 2.0, wrongLow: 0.3, largeAlert: 1.5,
};

const PAID_STATUSES = new Set(["finished", "confirmed", "sending", "partially_paid"]);

export type ReplayInput = {
  actorId: string;
  transactionId?: string;
  paymentId?: string;
  /** Super-admin manual credit (used when Payaza API is unreachable / IP not whitelisted). */
  manualOverride?: boolean;
  /** Payaza transaction reference the admin pasted from the Payaza dashboard. */
  manualReference?: string;
  /** Optional admin note describing why the manual credit was needed. */
  manualNote?: string;
};

export type ReplayDeps = {
  fetchImpl: typeof fetch;
  npApiKey: string | undefined;
  payazaSecretKey?: string | undefined;
  payazaTenantId?: string | undefined;
};

export type ReplayResult =
  | { status: number; body: Record<string, unknown> };

// Minimal duck-typed interfaces of what we use from supabase-js
// deno-lint-ignore no-explicit-any
type SupabaseAdmin = any;
type FetchFn = typeof fetch;

export async function loadThresholds(admin: SupabaseAdmin): Promise<Thresholds> {
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

export function classify(
  requested: number, received: number, payCur: string, outCur: string, t: Thresholds,
): { kind: "wrong_asset"; ratio: number }
  | { kind: "overpayment"; ratio: number; excess: number }
  | { kind: "partial"; ratio: number; credit: number; shortfall: number }
  | { kind: "normal"; ratio: number; credit: number } {
  const ratio = requested > 0 ? received / requested : 1;
  const sameAsset = payCur !== "" && payCur === outCur;
  const sameOver = sameAsset && requested > 0 && received >= requested * t.overpay;
  const wrongAsset = !sameAsset && (ratio > t.wrongHigh || (ratio < t.wrongLow && received > 0));
  if (wrongAsset) return { kind: "wrong_asset", ratio };
  if (sameOver) return { kind: "overpayment", ratio, excess: received - requested };
  const credit = requested > 0 ? Math.min(received > 0 ? received : requested, requested) : received;
  if (credit < requested * t.partial) return { kind: "partial", ratio, credit, shortfall: requested - credit };
  return { kind: "normal", ratio, credit };
}

export async function replayDeposit(
  admin: SupabaseAdmin,
  fetchImpl: FetchFn,
  npApiKey: string | undefined,
  input: ReplayInput,
  deps: { payazaSecretKey?: string; payazaTenantId?: string } = {},
): Promise<ReplayResult> {
  const { actorId, transactionId, paymentId, manualOverride, manualReference, manualNote } = input;
  if (!transactionId && !paymentId) {
    return { status: 200, body: { success: false, code: "BAD_REQUEST", error: "transaction_id or payment_id required" } };
  }

  // Look up the transaction
  let q = admin.from("transactions")
    .select("id, user_id, amount, status, payment_provider, nowpayments_payment_id, type")
    .eq("type", "deposit");
  if (transactionId) q = q.eq("id", transactionId);
  else if (paymentId) q = q.eq("nowpayments_payment_id", paymentId);
  const { data: tx, error: txErr } = await q.maybeSingle();
  if (txErr || !tx) return { status: 200, body: { success: false, code: "NOT_FOUND", error: "Transaction not found" } };

  if (tx.status === "confirmed") {
    return { status: 200, body: { success: true, already_confirmed: true, message: "Already credited", transaction_id: tx.id } };
  }

  const provider = tx.payment_provider || "nowpayments";

  // Super-admin manual credit path: only for Payaza, only when admin pastes a reference.
  if (manualOverride) {
    if (provider !== "payaza") {
      return { status: 200, body: { success: false, code: "BAD_REQUEST", error: "Manual override is only supported for Payaza deposits." } };
    }
    return await creditPayazaManual(admin, actorId, tx, manualReference, manualNote);
  }

  if (provider === "payaza") {
    return await replayPayaza(admin, fetchImpl, deps, actorId, tx);
  }
  if (provider !== "nowpayments") {
    return { status: 200, body: { success: false, code: "UNSUPPORTED_PROVIDER", error: `Replay not supported for ${provider} deposits. Use admin-credit-deposit for manual credits.` } };
  }

  const npId = tx.nowpayments_payment_id || paymentId;
  if (!npId) return { status: 200, body: { success: false, code: "MISSING_PAYMENT_ID", error: "Transaction has no NOWPayments payment_id to verify" } };

  if (!npApiKey) return { status: 500, body: { error: "NOWPAYMENTS_API_KEY not configured" } };

  const npRes = await fetchImpl(`https://api.nowpayments.io/v1/payment/${encodeURIComponent(String(npId))}`, {
    headers: { "x-api-key": npApiKey },
  });
  if (!npRes.ok) {
    const txt = await npRes.text();
    return { status: 200, body: { success: false, code: "PROVIDER_LOOKUP_FAILED", error: `NOWPayments lookup failed (${npRes.status}): ${txt.substring(0, 300)}` } };
  }
  const np = await npRes.json();

  const paymentStatus = String(np.payment_status ?? "").toLowerCase();
  if (!PAID_STATUSES.has(paymentStatus)) {
    return { status: 200, body: {
      success: false,
      code: "NOT_PAID",
      error: `Deposit not eligible — NOWPayments reports status "${paymentStatus || "unknown"}". Only paid/finished deposits can be replayed.`,
      payment_status: paymentStatus,
      provider_response: { payment_id: np.payment_id, actually_paid: np.actually_paid, pay_currency: np.pay_currency },
    } };
  }

  const requestedAmount = Number(np.price_amount) || Number(tx.amount) || 0;
  const netReceived = Number(np.outcome_amount) || Number(np.actually_paid) || 0;
  if (!(netReceived > 0)) {
    return { status: 200, body: { success: false, code: "ZERO_RECEIVED", error: "Provider reports zero received amount — nothing to credit", provider_response: np } };
  }

  const payCur = String(np.pay_currency ?? "").toLowerCase();
  const outCur = String(np.outcome_currency ?? np.pay_currency ?? "").toLowerCase();
  const thresholds = await loadThresholds(admin);
  const cls = classify(requestedAmount, netReceived, payCur, outCur, thresholds);

  if (cls.kind === "wrong_asset" || cls.kind === "partial") {
    await admin.from("transactions").update({
      status: cls.kind, gross_amount_usd: netReceived, net_amount_usd: netReceived,
    }).eq("id", tx.id).neq("status", "confirmed");

    await admin.from("audit_logs").insert({
      actor_id: actorId, action: "manual_deposit_replay_blocked",
      target_type: "transaction", target_id: tx.id,
      details: {
        reason: cls.kind, ratio: cls.ratio,
        requested: requestedAmount, received: netReceived,
        pay_currency: payCur, outcome_currency: outCur,
        provider_status: paymentStatus,
      },
    });
    return { status: 200, body: {
      success: false, blocked: true, reason: cls.kind,
      message: cls.kind === "wrong_asset"
        ? "Wrong asset / extreme deviation — flagged for manual review, not credited."
        : `Partial deposit (received $${netReceived.toFixed(2)} of $${requestedAmount.toFixed(2)}) — flagged for manual review, not credited.`,
      ratio: cls.ratio, requested: requestedAmount, received: netReceived,
    } };
  }

  let creditMain = 0; let creditBonus = 0; let excess = 0;
  if (cls.kind === "overpayment") {
    const overpayCap = Math.min(requestedAmount * 5, 5000);
    if (cls.excess > overpayCap) {
      await admin.from("transactions").update({
        status: "wrong_asset", gross_amount_usd: netReceived, net_amount_usd: netReceived,
      }).eq("id", tx.id).neq("status", "confirmed");
      return { status: 200, body: {
        success: false, blocked: true, reason: "excessive_overpayment",
        message: `Overpayment of $${cls.excess.toFixed(2)} exceeds safety cap $${overpayCap.toFixed(2)} — flagged for manual review.`,
      } };
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
    console.error("[replay-deposit] NOWPayments claim failed", { txId: tx.id, error: claimErr });
    return { status: 500, body: { error: "Failed to claim transaction", details: claimErr.message, code: (claimErr as any).code } };
  }
  if (!claimed) {
    return { status: 200, body: { success: true, already_confirmed: true, message: "Concurrent confirmation detected — no double credit", transaction_id: tx.id } };
  }

  const { error: balErr } = await admin.rpc("adjust_balance", {
    _user_id: tx.user_id, _delta: creditMain, _bonus_delta: creditBonus, _insurance_delta: 0,
  });
  if (balErr) {
    return { status: 500, body: { error: "Balance credit failed AFTER tx flipped — manual intervention required", transaction_id: tx.id } };
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
    actor_id: actorId, action: "manual_deposit_replay",
    target_type: "transaction", target_id: tx.id,
    details: {
      previous_status: tx.status, classification: cls.kind, ratio: cls.ratio,
      requested: requestedAmount, received: netReceived,
      credited_main: creditMain, credited_bonus: creditBonus,
      provider_status: paymentStatus, payment_id: npId,
    },
  });

  try { await admin.rpc("settle_user_debts", { _user_id: tx.user_id }); } catch { /* best-effort */ }

  return { status: 200, body: {
    success: true, transaction_id: tx.id,
    classification: cls.kind, ratio: cls.ratio,
    requested: requestedAmount, received: netReceived,
    credited_main: creditMain, credited_bonus: creditBonus,
    previous_status: tx.status,
  } };
}

// ============================================================================
// Payaza (NGN fiat) replay
// ============================================================================
//
// Verifies the deposit against Payaza's merchant transaction lookup endpoint.
// Only credits when the provider confirms a successful NGN payment for the
// matching reference. Otherwise the transaction is flagged for admin review
// with no balance change.

const PAYAZA_SUCCESS_KEYWORDS = [
  "approved", "successful", "completed", "funds received", "success",
  "escrow_success", "nip_success",
];

function payazaIsSuccess(np: Record<string, unknown>): boolean {
  const candidates = [
    np.transaction_status, np.transactionStatus,
    np.status, np.response_status, np.responseStatus,
    np.response_message, np.responseMessage,
    (np as any)?.data?.transactionStatus, (np as any)?.data?.transaction_status,
    (np as any)?.data?.status,
  ].filter((v) => typeof v === "string").map((v) => String(v).toLowerCase());
  return candidates.some((s) => PAYAZA_SUCCESS_KEYWORDS.some((kw) => s.includes(kw)));
}

function payazaCurrency(np: Record<string, unknown>): string {
  const cands = [
    np.currency, (np as any)?.currency?.code,
    (np as any)?.data?.currency, (np as any)?.data?.currency?.code,
  ].filter((v) => typeof v === "string");
  return cands.length ? String(cands[0]).toUpperCase() : "";
}

function payazaAuthCandidates(secretKey: string): string[] {
  const key = secretKey.trim();
  const candidates: string[] = [];
  const add = (value: string) => {
    if (value && !candidates.includes(value)) candidates.push(value);
  };

  // Some Payaza accounts store the already-issued token, while others store
  // the raw secret that must be base64-encoded. Try both without logging either.
  if (/^Payaza\s+/i.test(key)) {
    add(key);
  } else {
    add(`Payaza ${key}`);
    try {
      const encoded = btoa(key);
      if (encoded !== key) add(`Payaza ${encoded}`);
    } catch { /* btoa unavailable only in non-edge unit runs */ }
  }

  return candidates;
}

const PAYAZA_LOOKUP_MAX_ATTEMPTS = 3;
const PAYAZA_LOOKUP_RETRY_BASE_MS = 600;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function replayPayaza(
  admin: SupabaseAdmin,
  fetchImpl: FetchFn,
  deps: { payazaSecretKey?: string; payazaTenantId?: string },
  actorId: string,
  tx: { id: string; user_id: string; amount: number; status: string; nowpayments_payment_id: string | null },
): Promise<ReplayResult> {
  const reference = tx.nowpayments_payment_id;
  if (!reference) {
    return { status: 200, body: { success: false, code: "MISSING_REFERENCE", error: "Transaction has no Payaza reference to verify" } };
  }
  if (!deps.payazaSecretKey) {
    return { status: 500, body: { error: "PAYAZA_SECRET_KEY not configured" } };
  }

  const url = `https://api.payaza.africa/payaza-account/api/v1/mainaccounts/merchant/transaction/${encodeURIComponent(reference)}`;
  const baseHeaders: Record<string, string> = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "X-TenantID": (deps.payazaTenantId || "live").trim(),
  };

  // Payaza requires whitelisted IPs — try the QuotaGuard proxy first, then
  // fall back to a direct connection (for tests and local runs). Also try both
  // accepted Authorization token formats because Payaza tenants differ on
  // whether the configured secret is already encoded.
  const proxyUrl = (globalThis as any).Deno?.env?.get?.("QUOTAGUARD_URL");
  let lastErr = "";
  let text = "";

  const transports = proxyUrl
    ? [{ label: "proxy", proxy: true }, { label: "direct", proxy: false }]
    : [{ label: "direct", proxy: false }];

  for (const authorization of payazaAuthCandidates(deps.payazaSecretKey)) {
    for (const transport of transports) {
      for (let attempt = 1; attempt <= PAYAZA_LOOKUP_MAX_ATTEMPTS; attempt++) {
        let httpClient: { close?: () => void } | null = null;
        try {
          const init: RequestInit & { client?: unknown } = {
            headers: { ...baseHeaders, Authorization: authorization },
          };
          if (transport.proxy) {
            // @ts-ignore - Deno-only API
            httpClient = (globalThis as any).Deno?.createHttpClient?.({ proxy: { url: proxyUrl } });
            init.client = httpClient;
          }

          const res = await fetchImpl(url, init);
          text = await res.text();
          if (res.ok) {
            lastErr = "";
            break;
          }

          lastErr = `Payaza lookup failed via ${transport.label} (${res.status}): ${text.substring(0, 300)}`;
          if (res.status < 500 || attempt === PAYAZA_LOOKUP_MAX_ATTEMPTS) break;

          console.warn(`Payaza ${transport.label} lookup attempt ${attempt} failed with ${res.status}; retrying`);
          await wait(PAYAZA_LOOKUP_RETRY_BASE_MS * attempt);
        } catch (err) {
          lastErr = `Payaza ${transport.label} lookup unreachable: ${String(err).substring(0, 300)}`;
          console.error(`${lastErr} (attempt ${attempt}/${PAYAZA_LOOKUP_MAX_ATTEMPTS})`);
          if (attempt === PAYAZA_LOOKUP_MAX_ATTEMPTS) break;
          await wait(PAYAZA_LOOKUP_RETRY_BASE_MS * attempt);
        } finally {
          try { httpClient?.close?.(); } catch { /* noop */ }
        }
      }
      if (!lastErr) break;
    }
    if (!lastErr) break;
  }

  if (lastErr) {
    // Auth/permission errors mean the Payaza secret is missing, expired, or
    // the caller IP isn't whitelisted. Surface this as a soft failure (200)
    // so the admin UI can show a clear message instead of blank-screening
    // on a 502.
    if (/\((401|403)\)/.test(lastErr)) {
      console.error("Payaza auth failure during replay:", lastErr);
      return {
        status: 200,
        body: {
          success: false,
          code: "PAYAZA_AUTH",
          error: "Payaza rejected the lookup (401/403). Verify PAYAZA_SECRET_KEY and that the function IP is whitelisted in your Payaza dashboard.",
          details: lastErr,
        },
      };
    }
    return { status: 200, body: { success: false, code: "PAYAZA_LOOKUP_FAILED", error: lastErr } };
  }
  let np: Record<string, unknown>;
  try { np = JSON.parse(text); } catch {
    return { status: 200, body: { success: false, code: "PAYAZA_NON_JSON", error: "Payaza returned non-JSON response" } };
  }

  if (!payazaIsSuccess(np)) {
    return { status: 200, body: {
      success: false,
      code: "PAYAZA_NOT_SUCCESS",
      error: "Deposit not eligible — Payaza reports payment is not successful",
      provider_response: np,
    } };
  }

  const currency = payazaCurrency(np);
  if (currency && currency !== "NGN") {
    await admin.from("transactions").update({
      status: "wrong_asset",
    }).eq("id", tx.id).neq("status", "confirmed");
    await admin.from("audit_logs").insert({
      actor_id: actorId, action: "manual_deposit_replay_blocked",
      target_type: "transaction", target_id: tx.id,
      details: { reason: "wrong_currency", expected: "NGN", got: currency, reference, provider: "payaza" },
    });
    return { status: 200, body: {
      success: false, blocked: true, reason: "wrong_currency",
      message: `Expected NGN, Payaza reports ${currency}. Flagged for manual review.`,
    } };
  }

  // Payaza uses has_amount_validation: true at create time, so a "success"
  // event implies the full requested NGN amount was paid. Credit the original
  // USD amount stored on the transaction.
  const creditAmount = Number(tx.amount);
  if (!(creditAmount > 0)) {
    return { status: 200, body: { success: false, code: "BAD_AMOUNT", error: "Transaction has no positive amount to credit" } };
  }

  // Atomic claim
  const { data: claimed, error: claimErr } = await admin.from("transactions")
    .update({
      status: "confirmed",
      payment_provider: "payaza",
      nowpayments_payment_id: reference,
    })
    .eq("id", tx.id).neq("status", "confirmed")
    .select("id, user_id").maybeSingle();

  if (claimErr) {
    console.error("[replay-deposit] Payaza claim failed", { txId: tx.id, error: claimErr });
    return { status: 500, body: { error: "Failed to claim transaction", details: claimErr.message, code: (claimErr as any).code } };
  }
  if (!claimed) {
    return { status: 200, body: { success: true, already_confirmed: true, message: "Concurrent confirmation detected — no double credit", transaction_id: tx.id } };
  }

  const { error: balErr } = await admin.rpc("adjust_balance", {
    _user_id: tx.user_id, _delta: creditAmount, _bonus_delta: 0, _insurance_delta: 0,
  });
  if (balErr) {
    return { status: 500, body: { error: "Balance credit failed AFTER tx flipped — manual intervention required", transaction_id: tx.id } };
  }

  await admin.from("notifications").insert({
    user_id: tx.user_id,
    title: "Deposit Confirmed ✅",
    message: `Your deposit of $${creditAmount.toFixed(2)} has been confirmed.`,
    type: "deposit",
  });

  await admin.from("audit_logs").insert({
    actor_id: actorId, action: "manual_deposit_replay",
    target_type: "transaction", target_id: tx.id,
    details: {
      provider: "payaza", previous_status: tx.status,
      credited_main: creditAmount, reference,
    },
  });

  try { await admin.rpc("settle_user_debts", { _user_id: tx.user_id }); } catch { /* best-effort */ }

  return { status: 200, body: {
    success: true, transaction_id: tx.id, provider: "payaza",
    credited_main: creditAmount, credited_bonus: 0,
    previous_status: tx.status,
  } };
}

// ============================================================================
// Manual Payaza credit (used when Payaza API is unreachable / IP not whitelisted)
// ============================================================================
//
// Super admin pastes the Payaza transaction reference they verified manually
// in the Payaza dashboard. We:
//  1. Reject if the reference is empty or has been used before (UNIQUE index
//     on payaza_manual_credit_refs.reference is the hard guarantee).
//  2. Atomically flip the deposit row from non-confirmed to confirmed.
//  3. Credit the user's main balance with the original USD amount.
//  4. Insert audit log + notification.
//
// No Payaza API call is made. The reference + admin id form the audit trail.

async function creditPayazaManual(
  admin: SupabaseAdmin,
  actorId: string,
  tx: { id: string; user_id: string; amount: number; status: string; nowpayments_payment_id: string | null },
  reference: string | undefined,
  note: string | undefined,
): Promise<ReplayResult> {
  const ref = (reference || "").trim();
  if (!ref) {
    return { status: 200, body: { success: false, code: "BAD_REFERENCE", error: "Payaza reference is required for manual credit." } };
  }
  if (ref.length < 4 || ref.length > 200) {
    return { status: 200, body: { success: false, code: "BAD_REFERENCE", error: "Payaza reference looks invalid." } };
  }

  // The reference the admin pastes MUST match the transaction's own payment ID.
  // This prevents admins from crediting arbitrary deposits with random references.
  if (ref !== tx.nowpayments_payment_id) {
    return { status: 200, body: { success: false, code: "BAD_REFERENCE", error: "The reference you entered does not match this transaction's payment ID." } };
  }

  const creditAmount = Number(tx.amount);
  if (!(creditAmount > 0)) {
    return { status: 200, body: { success: false, code: "BAD_AMOUNT", error: "Transaction has no positive amount to credit" } };
  }

  // Hard block on reference reuse — rely on UNIQUE index for the race.
  const { error: refErr } = await admin.from("payaza_manual_credit_refs").insert({
    reference: ref,
    transaction_id: tx.id,
    user_id: tx.user_id,
    amount: creditAmount,
    credited_by: actorId,
    note: note || null,
  });
  if (refErr) {
    const code = (refErr as any).code;
    const msg = String((refErr as any).message || "");
    if (code === "23505" || /duplicate|unique/i.test(msg)) {
      return { status: 409, body: {
        success: false,
        code: "DUPLICATE_REFERENCE",
        error: `Payaza reference "${ref}" has already been used to credit a deposit. Refusing to credit again.`,
      } };
    }
    return { status: 500, body: { error: "Failed to record manual credit reference", details: msg } };
  }

  // Atomic claim — if another path already confirmed this tx, do not double credit.
  const { data: claimed, error: claimErr } = await admin.from("transactions")
    .update({
      status: "confirmed",
      payment_provider: "payaza",
      nowpayments_payment_id: tx.nowpayments_payment_id || ref,
    })
    .eq("id", tx.id).neq("status", "confirmed")
    .select("id, user_id").maybeSingle();

  if (claimErr) {
    return { status: 500, body: { error: "Failed to claim transaction", details: claimErr.message } };
  }
  if (!claimed) {
    // Tx already confirmed elsewhere — keep the ref row as audit but do not credit.
    return { status: 200, body: {
      success: true, already_confirmed: true,
      message: "Transaction was already confirmed — reference recorded for audit, no balance change.",
      transaction_id: tx.id,
    } };
  }

  const { error: balErr } = await admin.rpc("adjust_balance", {
    _user_id: tx.user_id, _delta: creditAmount, _bonus_delta: 0, _insurance_delta: 0,
  });
  if (balErr) {
    return { status: 500, body: { error: "Balance credit failed AFTER tx flipped — manual intervention required", transaction_id: tx.id } };
  }

  await admin.from("notifications").insert({
    user_id: tx.user_id,
    title: "Deposit Confirmed ✅",
    message: `Your deposit of $${creditAmount.toFixed(2)} has been confirmed.`,
    type: "deposit",
  });

  await admin.from("audit_logs").insert({
    actor_id: actorId, action: "manual_deposit_payaza_override",
    target_type: "transaction", target_id: tx.id,
    details: {
      provider: "payaza", previous_status: tx.status,
      credited_main: creditAmount, reference: ref,
      note: note || null,
      reason: "Payaza API unreachable / IP not whitelisted — credited from admin-supplied reference.",
    },
  });

  try { await admin.rpc("settle_user_debts", { _user_id: tx.user_id }); } catch { /* best-effort */ }

  return { status: 200, body: {
    success: true, transaction_id: tx.id, provider: "payaza",
    credited_main: creditAmount, manual_override: true, reference: ref,
    previous_status: tx.status,
  } };
}
