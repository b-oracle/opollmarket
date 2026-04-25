// Shared deposit-cap validator for ALL admin-initiated credit flows.
//
// Single source of truth for "how much may an admin credit for a given
// transaction" so confirm-deposit-admin, admin-credit-deposit, future
// reconciliation tools, and tests all agree on the rule and the error text.
//
// Rule:
//   • wrong_asset*  → cap = gross_amount_usd (true on-chain value received)
//   • everything else → cap = net_amount_usd (post-fee), falling back to
//                        gross_amount_usd, falling back to invoice amount
//   • A $0.01 tolerance absorbs sub-cent rounding so admins can confirm the
//     exact net without sub-cent failures.

export const CAP_TOLERANCE = 0.01;

export type DepositTxInput = {
  status?: string | null;
  amount?: number | string | null;          // invoice / requested
  gross_amount_usd?: number | string | null; // received on-chain (gross)
  net_amount_usd?: number | string | null;   // received after fees
};

export type CapLabel =
  | "received gross amount"
  | "received net amount"
  | "invoice amount";

export type CapResult = {
  maxCredit: number;
  capLabel: CapLabel;
  isWrongAsset: boolean;
  gross: number;
  net: number;
  invoice: number;
};

function toFiniteNumber(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) && (n as number) > 0 ? (n as number) : 0;
}

/** Compute the maximum amount an admin may credit for this transaction. */
export function computeDepositCap(tx: DepositTxInput): CapResult {
  const status = (tx.status ?? "").toString();
  const isWrongAsset = status.startsWith("wrong_asset");
  const gross = toFiniteNumber(tx.gross_amount_usd);
  const net = toFiniteNumber(tx.net_amount_usd);
  const invoice = toFiniteNumber(tx.amount);

  let maxCredit: number;
  let capLabel: CapLabel;

  if (isWrongAsset) {
    // Wrong-asset deposits: only the on-chain gross is credit-worthy.
    maxCredit = gross > 0 ? gross : invoice;
    capLabel = "received gross amount";
  } else if (net > 0) {
    maxCredit = net;
    capLabel = "received net amount";
  } else if (gross > 0) {
    maxCredit = gross;
    capLabel = "received gross amount";
  } else {
    maxCredit = invoice;
    capLabel = "invoice amount";
  }

  return { maxCredit, capLabel, isWrongAsset, gross, net, invoice };
}

export type CapValidation =
  | { ok: true; creditAmount: number; cap: CapResult }
  | { ok: false; status: 400; error: string; cap: CapResult };

/**
 * Validate a requested credit against the computed cap. Returns the exact
 * error message admin flows should surface (kept identical across callers
 * for consistent UX and audit logs).
 */
export function validateDepositCap(
  tx: DepositTxInput,
  requested: number,
): CapValidation {
  const cap = computeDepositCap(tx);
  const amount = Number(requested);

  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      ok: false,
      status: 400,
      error: "Amount must be a positive finite number",
      cap,
    };
  }

  if (amount > cap.maxCredit + CAP_TOLERANCE) {
    return {
      ok: false,
      status: 400,
      error:
        `Amount $${amount.toFixed(2)} exceeds ${cap.capLabel} ` +
        `$${cap.maxCredit.toFixed(2)}`,
      cap,
    };
  }

  // Clamp to the cap so sub-cent overshoots within tolerance never overcredit.
  const creditAmount = Math.min(amount, cap.maxCredit);
  return { ok: true, creditAmount, cap };
}
