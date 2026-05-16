// Shared helper for calling the audited adjust_balance_logged RPC.
// Always use this (instead of raw `adjust_balance`) when crediting or debiting
// user balances from edge functions, so that:
//   • every change carries a correlation_id traceable across logs
//   • every change is row-logged in `balance_ledger` (via trigger)
//   • every failure raises a `system_alerts` row of severity=error
//
// Returns { success, correlation_id, error? }.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type BalanceAdjustResult = {
  success: boolean;
  correlation_id: string;
  error?: string;
  sqlstate?: string;
};

export type BalanceAdjustArgs = {
  userId: string;
  delta?: number;          // main USDT
  bonusDelta?: number;
  insuranceDelta?: number;
  source: string;          // e.g. "payaza-webhook", "resolve-market"
  reason?: string;         // human-readable purpose
  correlationId?: string;  // pass an upstream id (webhook ref, request id) to chain logs
  actorId?: string | null; // admin/user id triggering the change, if applicable
};

export async function adjustBalanceLogged(
  client: SupabaseClient,
  args: BalanceAdjustArgs,
): Promise<BalanceAdjustResult> {
  const { data, error } = await client.rpc("adjust_balance_logged", {
    _user_id: args.userId,
    _delta: args.delta ?? 0,
    _bonus_delta: args.bonusDelta ?? 0,
    _insurance_delta: args.insuranceDelta ?? 0,
    _correlation_id: args.correlationId ?? null,
    _source: args.source,
    _reason: args.reason ?? null,
    _actor_id: args.actorId ?? null,
  });

  if (error) {
    // RPC-level failure (network/permission). The DB-side wrapper already logs
    // application errors itself; this branch covers transport failures only.
    console.error(`[balanceLogger:${args.source}] RPC error:`, error);
    return {
      success: false,
      correlation_id: args.correlationId ?? "rpc-error",
      error: error.message,
    };
  }

  const result = (data ?? {}) as BalanceAdjustResult;
  if (!result.success) {
    console.error(
      `[balanceLogger:${args.source}] adjust failed corr=${result.correlation_id}: ${result.error}`,
    );
  }
  return result;
}
