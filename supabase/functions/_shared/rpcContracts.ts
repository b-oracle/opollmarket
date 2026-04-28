// Typed RPC contract layer.
//
// Goal: prevent the "never" / silent-payload drift problem we get when
// calling supabase.rpc() / .from().insert() with loose objects. Each
// contract here defines:
//   1. A zod schema for the args (runtime validation)
//   2. A return-type alias (compile-time inference at call sites)
//
// Use the `callRpc` / `insertRow` helpers below from edge functions
// instead of raw `supabase.rpc(...)` so the args are validated and
// the response is consistently shaped.
//
// This file has NO side effects. It is safe to import from any edge
// function. It depends only on zod and the supabase-js types.

import { z } from "https://esm.sh/zod@3.23.8";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─────────────────────────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────────────────────────

const uuid = z.string().uuid("must be a valid uuid");
const positive = z.number().finite().positive();
const nonNegative = z.number().finite().nonnegative();
const money = z.number().finite(); // can be negative (deltas)

// ─────────────────────────────────────────────────────────────────
// RPC contracts
// ─────────────────────────────────────────────────────────────────

export const RpcContracts = {
  adjust_balance: {
    args: z.object({
      _user_id: uuid,
      _delta: money,
      _bonus_delta: money.default(0),
      _insurance_delta: money.default(0),
    }),
    // adjust_balance returns void
    result: z.void().or(z.null()).or(z.unknown()),
  },

  debit_balance_atomic: {
    args: z.object({
      _user_id: uuid,
      _main_deduct: nonNegative,
      _bonus_deduct: nonNegative,
    }),
    result: z
      .object({
        success: z.boolean(),
        error: z.string().optional(),
      })
      .passthrough(),
  },

  settle_user_debts: {
    args: z.object({ _user_id: uuid }),
    result: z
      .object({
        amount: z.union([z.number(), z.string()]).optional(),
      })
      .passthrough()
      .nullable(),
  },

  has_role: {
    args: z.object({
      _user_id: uuid,
      _role: z.enum(["admin", "super_admin", "support", "moderator", "user", "business"]),
    }),
    result: z.boolean(),
  },
} as const;

export type RpcName = keyof typeof RpcContracts;
export type RpcArgs<N extends RpcName> = z.input<(typeof RpcContracts)[N]["args"]>;
export type RpcResult<N extends RpcName> = z.infer<(typeof RpcContracts)[N]["result"]>;

// ─────────────────────────────────────────────────────────────────
// Table insert contracts (only the high-risk financial / audit ones)
// ─────────────────────────────────────────────────────────────────

export const TransactionInsert = z.object({
  user_id: uuid,
  type: z.enum([
    "deposit",
    "withdrawal",
    "buy",
    "sell",
    "payout",
    "refund",
    "welcome_bonus",
    "gift_sent",
    "gift_received",
    "bet",
    "commission",
    "fee",
  ]),
  amount: money,
  status: z.enum(["pending", "processing", "confirmed", "failed", "expired", "cancelled"]),
  market_id: uuid.optional().nullable(),
  side: z.string().max(64).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  payment_provider: z.string().max(64).optional().nullable(),
  nowpayments_payment_id: z.string().max(128).optional().nullable(),
});

export const NotificationInsert = z.object({
  user_id: uuid,
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(1000),
  type: z.string().min(1).max(50),
  market_id: uuid.optional().nullable(),
  actor_id: uuid.optional().nullable(),
});

export const AuditLogInsert = z.object({
  actor_id: uuid,
  action: z.string().min(1).max(100),
  target_type: z.string().min(1).max(50),
  target_id: z.string().max(128).optional().nullable(),
  details: z.record(z.unknown()).optional().nullable(),
});

export const TableInserts = {
  transactions: TransactionInsert,
  notifications: NotificationInsert,
  audit_logs: AuditLogInsert,
} as const;

export type TableName = keyof typeof TableInserts;
export type TableInsertPayload<T extends TableName> = z.input<(typeof TableInserts)[T]>;

// ─────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────

export class RpcContractError extends Error {
  constructor(
    public readonly contract: string,
    public readonly issues: z.ZodIssue[],
    public readonly stage: "args" | "result" | "insert",
  ) {
    super(
      `[${contract}] ${stage} validation failed: ${issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ")}`,
    );
    this.name = "RpcContractError";
  }
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Validated wrapper around `supabase.rpc()`. Throws RpcContractError on
 * arg/result mismatch instead of silently letting Postgres receive
 * malformed json or letting the caller treat the result as `never`.
 */
export async function callRpc<N extends RpcName>(
  supabase: SupabaseClient,
  name: N,
  args: RpcArgs<N>,
): Promise<{ data: RpcResult<N> | null; error: { message: string } | null }> {
  const contract = RpcContracts[name];

  const parsedArgs = contract.args.safeParse(args);
  if (!parsedArgs.success) {
    throw new RpcContractError(name, parsedArgs.error.issues, "args");
  }

  // deno-lint-ignore no-explicit-any
  const { data, error } = await (supabase.rpc as any)(name, parsedArgs.data);
  if (error) {
    return { data: null, error: { message: error.message } };
  }

  // Result validation is non-throwing — we still surface the data even
  // if the shape is unexpected, but log a warning so drift is visible.
  const parsedResult = contract.result.safeParse(data);
  if (!parsedResult.success) {
    console.warn(
      `[rpcContracts] ${name} returned unexpected shape:`,
      parsedResult.error.issues,
    );
    return { data: data as RpcResult<N>, error: null };
  }
  return { data: parsedResult.data as RpcResult<N>, error: null };
}

/**
 * Validated wrapper around `supabase.from(table).insert(payload)`.
 * Validates the payload shape before hitting the database.
 */
export function buildInsert<T extends TableName>(
  table: T,
  payload: TableInsertPayload<T>,
): z.output<(typeof TableInserts)[T]> {
  const schema = TableInserts[table];
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new RpcContractError(table, parsed.error.issues, "insert");
  }
  return parsed.data as z.output<(typeof TableInserts)[T]>;
}
