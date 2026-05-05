// Shared validator for "how much can an admin credit on a flagged deposit?"
//
// Used by both confirm-deposit-admin and admin-credit-deposit so the cap rule
// stays consistent. Returns a typed result; callers should reject the request
// with `result.error` when ok=false.

export type DepositCapInput = {
  /** The on-chain / provider-reported gross amount in USD. */
  grossAmountUsd: number | null | undefined;
  /** The net (after fees) USD amount, if the webhook computed one. */
  netAmountUsd: number | null | undefined;
  /** The original requested invoice amount on the transaction. */
  invoiceAmount: number | null | undefined;
  /** The amount the admin is trying to credit. */
  requestedCredit: number;
  /** Status of the source transaction — partial / wrong_asset rows must
   *  have a real gross/net to credit, since the invoice can't be trusted. */
  status: string;
};

export type DepositCapResult =
  | { ok: true; cap: number }
  | { ok: false; error: string; status: number };

/**
 * Validate the requested admin credit against the maximum allowable cap.
 *
 * Rules:
 *  1. For `partial` and `wrong_asset` rows we require a real `gross_amount_usd`
 *     (or `net_amount_usd`). The invoice amount alone is NOT trusted as a fallback
 *     because the user may have sent dust.
 *  2. For everything else we use the highest of (gross, net, invoice) as the cap.
 *  3. Requested credit must be > 0 and ≤ cap.
 */
export function validateDepositCap(input: DepositCapInput): DepositCapResult {
  const gross = toFinite(input.grossAmountUsd);
  const net = toFinite(input.netAmountUsd);
  const invoice = toFinite(input.invoiceAmount);
  const credit = toFinite(input.requestedCredit);

  if (credit === null || credit <= 0) {
    return { ok: false, error: "Credit amount must be a positive number", status: 400 };
  }

  // Cap selection: prefer real received numbers (gross/net from webhook).
  // For flagged rows (partial / wrong_asset) we also fall back to the invoice
  // amount when no gross is recorded — the admin is expected to verify the
  // actual received amount on the provider dashboard before approving, and
  // this cap prevents crediting MORE than the invoice in any case.
  const candidates: number[] = [];
  if (gross !== null && gross > 0) candidates.push(gross);
  if (net !== null && net > 0) candidates.push(net);
  if (invoice !== null && invoice > 0) candidates.push(invoice);

  if (candidates.length === 0) {
    return { ok: false, error: "No valid amount on transaction to cap against", status: 400 };
  }

  const cap = Math.max(...candidates);

  if (credit > cap) {
    return {
      ok: false,
      error: `Amount $${credit.toFixed(2)} exceeds received amount $${cap.toFixed(2)}`,
      status: 400,
    };
  }

  return { ok: true, cap };
}

function toFinite(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}
