// Lightweight runtime validators for incoming webhook payloads.
// Dependency-free (no zod) so it works in every edge function without extra
// imports. All validators return { ok: true, value } | { ok: false, error }.

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/** Constant-time string compare (mitigates timing attacks on secret/signature checks). */
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/** Coerce to a finite, non-negative number; otherwise returns null. */
export function toFinitePositive(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** Coerce to a finite, strictly-positive number; otherwise returns null. */
export function toStrictPositive(value: unknown): number | null {
  const n = toFinitePositive(value);
  if (n === null || n <= 0) return null;
  return n;
}

/** Normalize a currency code: uppercase, trim, must be 3-10 chars of [A-Z0-9]. */
export function normalizeCurrency(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,10}$/.test(trimmed)) return null;
  return trimmed;
}

// ─────────── NowPayments ───────────
export type NpDepositPayload = {
  payment_id: string;
  payment_status: string;
  order_id: string;
  price_amount: number;
  price_currency: string;
  pay_currency: string;
  outcome_currency: string;
  actually_paid: number;
  outcome_amount: number;
  raw: Record<string, unknown>;
};

export function validateNowPaymentsPayload(
  payload: unknown,
): ValidationResult<NpDepositPayload> {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Payload must be a JSON object" };
  }
  const p = payload as Record<string, unknown>;

  const paymentId = p.payment_id;
  if (paymentId === undefined || paymentId === null || String(paymentId).length === 0) {
    return { ok: false, error: "Missing payment_id" };
  }

  const paymentStatus = typeof p.payment_status === "string" ? p.payment_status.trim() : "";
  if (!paymentStatus) {
    return { ok: false, error: "Missing payment_status" };
  }

  const orderId = typeof p.order_id === "string" ? p.order_id.trim() : "";
  if (!orderId) {
    return { ok: false, error: "Missing order_id" };
  }

  const priceAmount = toStrictPositive(p.price_amount);
  if (priceAmount === null) {
    return { ok: false, error: "price_amount must be a positive number" };
  }

  // Allow actually_paid / outcome_amount to be 0 (e.g. waiting / failed states).
  const actuallyPaid = toFinitePositive(p.actually_paid) ?? 0;
  const outcomeAmount = toFinitePositive(p.outcome_amount) ?? 0;

  // Currencies are required for any successful state, but we accept missing values
  // here and let the handler's classifier decide (some IPN events legitimately
  // omit them, e.g. status=waiting). We just guarantee they're strings if present.
  const payCurrency = normalizeCurrency(p.pay_currency) ?? "";
  const outcomeCurrency = normalizeCurrency(p.outcome_currency) ?? payCurrency;
  const priceCurrency = normalizeCurrency(p.price_currency) ?? "USD";

  return {
    ok: true,
    value: {
      payment_id: String(paymentId),
      payment_status: paymentStatus.toLowerCase(),
      order_id: orderId,
      price_amount: priceAmount,
      price_currency: priceCurrency,
      pay_currency: payCurrency,
      outcome_currency: outcomeCurrency,
      actually_paid: actuallyPaid,
      outcome_amount: outcomeAmount,
      raw: p,
    },
  };
}

// ─────────── Payaza ───────────
export type PayazaPayload = {
  reference: string;
  status: string;
  amount: number | null;
  currency: string | null;
  raw: Record<string, unknown>;
};

export function validatePayazaPayload(payload: unknown): ValidationResult<PayazaPayload> {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Payload must be a JSON object" };
  }
  const p = payload as Record<string, unknown>;
  const data = (p.data && typeof p.data === "object" ? p.data : {}) as Record<string, unknown>;
  const responseContent =
    (p.response_content && typeof p.response_content === "object"
      ? p.response_content
      : {}) as Record<string, unknown>;

  const reference =
    (typeof p.transaction_reference === "string" && p.transaction_reference) ||
    (typeof p.merchant_reference === "string" && p.merchant_reference) ||
    (typeof p.account_reference === "string" && p.account_reference) ||
    (typeof data.transaction_reference === "string" && data.transaction_reference) ||
    (typeof data.merchant_reference === "string" && data.merchant_reference) ||
    (typeof data.account_reference === "string" && data.account_reference) ||
    (typeof responseContent.transaction_reference === "string" && responseContent.transaction_reference) ||
    (typeof responseContent.merchant_reference === "string" && responseContent.merchant_reference) ||
    (typeof responseContent.account_reference === "string" && responseContent.account_reference) ||
    "";

  if (!reference) {
    return { ok: false, error: "Missing transaction reference" };
  }

  const rawStatus = (
    (typeof p.status === "string" && p.status) ||
    (typeof p.transaction_status === "string" && p.transaction_status) ||
    (typeof data.status === "string" && data.status) ||
    (typeof data.transaction_status === "string" && data.transaction_status) ||
    (typeof responseContent.status === "string" && responseContent.status) ||
    (typeof responseContent.transaction_status === "string" && responseContent.transaction_status) ||
    ""
  )
    .toString()
    .toLowerCase()
    .trim();

  if (!rawStatus) {
    return { ok: false, error: "Missing status" };
  }

  const amountCandidate =
    p.amount ?? data.amount ?? responseContent.amount ??
    p.transaction_amount ?? data.transaction_amount;
  const amount = toFinitePositive(amountCandidate);

  const currencyCandidate =
    p.currency ?? data.currency ?? responseContent.currency ??
    p.transaction_currency ?? data.transaction_currency;
  const currency = normalizeCurrency(currencyCandidate);

  return {
    ok: true,
    value: { reference: String(reference), status: rawStatus, amount, currency, raw: p },
  };
}

// ─────────── Flutterwave ───────────
export type FlutterwavePayload = {
  event: string;
  data: Record<string, unknown>;
  raw: Record<string, unknown>;
};

export function validateFlutterwavePayload(
  payload: unknown,
): ValidationResult<FlutterwavePayload> {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Payload must be a JSON object" };
  }
  const p = payload as Record<string, unknown>;
  const event = typeof p.event === "string" ? p.event.trim() : "";
  if (!event) return { ok: false, error: "Missing event" };
  const data = p.data && typeof p.data === "object" ? (p.data as Record<string, unknown>) : null;
  if (!data) return { ok: false, error: "Missing data object" };
  return { ok: true, value: { event, data, raw: p } };
}

/** Validate a Flutterwave charge.completed (deposit) event. */
export function validateFlutterwaveCharge(data: Record<string, unknown>): ValidationResult<{
  tx_ref: string;
  status: string;
  amount: number;
  currency: string;
}> {
  const txRef = typeof data.tx_ref === "string" ? data.tx_ref.trim() : "";
  if (!txRef) return { ok: false, error: "Missing tx_ref" };

  const status = typeof data.status === "string" ? data.status.trim() : "";
  if (!status) return { ok: false, error: "Missing status" };

  const amount = toStrictPositive(data.amount);
  if (amount === null) return { ok: false, error: "amount must be a positive number" };

  const currency = normalizeCurrency(data.currency);
  if (!currency) return { ok: false, error: "Invalid or missing currency" };

  return { ok: true, value: { tx_ref: txRef, status, amount, currency } };
}

/** Validate a Flutterwave transfer event (success or failure). */
export function validateFlutterwaveTransfer(data: Record<string, unknown>): ValidationResult<{
  reference: string;
  status: string;
}> {
  const reference = typeof data.reference === "string" ? data.reference.trim() : "";
  if (!reference) return { ok: false, error: "Missing reference" };
  const status = typeof data.status === "string" ? data.status.trim() : "";
  if (!status) return { ok: false, error: "Missing status" };
  return { ok: true, value: { reference, status } };
}
