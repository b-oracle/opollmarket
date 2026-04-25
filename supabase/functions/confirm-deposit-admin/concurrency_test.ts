// Integration test: simulates concurrent confirm-deposit-admin requests against
// an in-memory mock of the admin Supabase client and verifies two invariants:
//
//   1. IDEMPOTENCY — only ONE concurrent request may successfully credit a given
//      transaction. All others must be rejected with "Already confirmed".
//   2. CAP ENFORCEMENT — no successful request may credit more than the
//      transaction's max-allowed amount (gross_amount_usd, falling back to the
//      original invoice amount). Over-cap requests must be rejected with NO
//      side effect on the user's balance.
//
// The test re-implements the handler's decision logic against a mock DB that
// uses a Promise-based mutex on the transactions row to model SELECT ... FOR
// UPDATE semantics in Postgres. This lets us assert what the production code
// SHOULD enforce when backed by an atomic claim. If you remove the mutex you
// will see the TOCTOU race the current handler has — that's intentional: it
// pins the contract the database layer must honour.
//
// Run:
//   deno test supabase/functions/confirm-deposit-admin/concurrency_test.ts \
//     --allow-net --allow-env

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validateDepositCap } from "../_shared/depositCap.ts";

// ---------- Mock DB ----------

type Tx = {
  id: string;
  user_id: string;
  status: "pending" | "partial" | "wrong_asset" | "confirmed";
  amount: number;
  gross_amount_usd: number | null;
  net_amount_usd: number | null;
};

type Balance = { user_id: string; amount: number };

class MockDb {
  txs = new Map<string, Tx>();
  balances = new Map<string, Balance>();
  // Per-row mutex modelling SELECT ... FOR UPDATE.
  private locks = new Map<string, Promise<void>>();
  // Telemetry
  creditCalls = 0;
  totalCredited = 0;

  seedTx(tx: Tx) { this.txs.set(tx.id, { ...tx }); }
  seedBalance(b: Balance) { this.balances.set(b.user_id, { ...b }); }

  async withRowLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    while (this.locks.has(key)) {
      await this.locks.get(key);
    }
    let release!: () => void;
    const p = new Promise<void>((res) => { release = res; });
    this.locks.set(key, p);
    try {
      return await fn();
    } finally {
      this.locks.delete(key);
      release();
    }
  }

  async creditBalance(userId: string, delta: number) {
    this.creditCalls++;
    this.totalCredited += delta;
    const b = this.balances.get(userId);
    if (!b) this.balances.set(userId, { user_id: userId, amount: delta });
    else b.amount += delta;
  }

  getBalance(userId: string) { return this.balances.get(userId)?.amount ?? 0; }
  getTx(id: string) { return this.txs.get(id); }
}

// ---------- Handler under test (mirrors confirm-deposit-admin guard) ----------

type Result = { ok: true; credited: number } | { ok: false; status: number; error: string };

async function confirmDeposit(
  db: MockDb,
  args: { transaction_id: string; user_id: string; amount: number },
): Promise<Result> {
  // Atomic claim: lock the row, re-read status, decide, mutate, release.
  // This is what the production handler MUST do (e.g. via a SECURITY DEFINER
  // RPC that does SELECT ... FOR UPDATE + UPDATE in one transaction).
  return await db.withRowLock(args.transaction_id, async () => {
    const tx = db.getTx(args.transaction_id);
    if (!tx || tx.user_id !== args.user_id) {
      return { ok: false, status: 404, error: "Transaction not found" };
    }
    if (tx.status === "confirmed") {
      return { ok: false, status: 400, error: "Already confirmed" };
    }
    const gross = Number(tx.gross_amount_usd) || 0;
    const original = Number(tx.amount);
    const maxCredit = gross > 0 ? gross : original;
    if (Number(args.amount) > maxCredit) {
      return {
        ok: false,
        status: 400,
        error: `Amount $${args.amount.toFixed(2)} exceeds received amount $${maxCredit.toFixed(2)}`,
      };
    }
    const credit = Number(args.amount);
    if (credit > 0) await db.creditBalance(args.user_id, credit);
    tx.status = "confirmed";
    tx.amount = credit;
    tx.net_amount_usd = credit;
    return { ok: true, credited: credit };
  });
}

// ---------- Tests ----------

Deno.test("idempotency: 10 concurrent confirms credit the user exactly once", async () => {
  const db = new MockDb();
  db.seedTx({
    id: "tx-1", user_id: "u-1", status: "pending",
    amount: 100, gross_amount_usd: 100, net_amount_usd: null,
  });
  db.seedBalance({ user_id: "u-1", amount: 0 });

  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      confirmDeposit(db, { transaction_id: "tx-1", user_id: "u-1", amount: 100 })
    ),
  );

  const successes = results.filter((r) => r.ok);
  const rejects = results.filter((r) => !r.ok) as Extract<Result, { ok: false }>[];

  assertEquals(successes.length, 1, "exactly one request should succeed");
  assertEquals(rejects.length, 9, "the remaining nine should be rejected");
  assert(rejects.every((r) => r.error === "Already confirmed"));
  assertEquals(db.getBalance("u-1"), 100, "user credited exactly once");
  assertEquals(db.creditCalls, 1, "balance RPC invoked exactly once");
  assertEquals(db.totalCredited, 100);
});

Deno.test("cap enforcement: over-cap concurrent requests never credit", async () => {
  const db = new MockDb();
  db.seedTx({
    id: "tx-2", user_id: "u-2", status: "pending",
    amount: 50, gross_amount_usd: 50, net_amount_usd: null,
  });
  db.seedBalance({ user_id: "u-2", amount: 0 });

  // 5 over-cap attempts ($500 each, cap is $50). All must fail with NO credit.
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      confirmDeposit(db, { transaction_id: "tx-2", user_id: "u-2", amount: 500 })
    ),
  );

  assert(results.every((r) => !r.ok), "all over-cap requests must reject");
  assertEquals(db.getBalance("u-2"), 0, "no credit applied");
  assertEquals(db.creditCalls, 0, "balance RPC must not be invoked");
  assertEquals(db.getTx("tx-2")?.status, "pending", "tx remains pending");
});

Deno.test("cap + idempotency mix: at most one in-cap success, no over-cap leaks", async () => {
  const db = new MockDb();
  db.seedTx({
    id: "tx-3", user_id: "u-3", status: "pending",
    amount: 100, gross_amount_usd: 100, net_amount_usd: null,
  });
  db.seedBalance({ user_id: "u-3", amount: 0 });

  // Mix: 3 valid $100 confirms + 7 over-cap $1000 confirms, all racing.
  const calls = [
    ...Array.from({ length: 3 }, () =>
      confirmDeposit(db, { transaction_id: "tx-3", user_id: "u-3", amount: 100 })
    ),
    ...Array.from({ length: 7 }, () =>
      confirmDeposit(db, { transaction_id: "tx-3", user_id: "u-3", amount: 1000 })
    ),
  ];
  // Shuffle to avoid ordering bias.
  for (let i = calls.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [calls[i], calls[j]] = [calls[j], calls[i]];
  }

  const results = await Promise.all(calls);
  const successes = results.filter((r) => r.ok) as Extract<Result, { ok: true }>[];

  assert(successes.length <= 1, "at most one credit may land");
  // The single landed credit (if any) MUST be in-cap.
  if (successes.length === 1) {
    assertEquals(successes[0].credited, 100);
    assertEquals(db.getBalance("u-3"), 100);
  } else {
    assertEquals(db.getBalance("u-3"), 0);
  }
  assert(db.totalCredited <= 100, "never credit more than the cap");
});

Deno.test("wrong_asset: cap respects gross_amount_usd, not invoice", async () => {
  const db = new MockDb();
  // Invoice was $200, but only $35 of value was actually received on-chain.
  db.seedTx({
    id: "tx-4", user_id: "u-4", status: "wrong_asset",
    amount: 200, gross_amount_usd: 35, net_amount_usd: null,
  });
  db.seedBalance({ user_id: "u-4", amount: 0 });

  // Concurrent: one tries the invoice amount ($200, must fail), one tries gross ($35, must succeed).
  const [overCap, atCap] = await Promise.all([
    confirmDeposit(db, { transaction_id: "tx-4", user_id: "u-4", amount: 200 }),
    confirmDeposit(db, { transaction_id: "tx-4", user_id: "u-4", amount: 35 }),
  ]);

  // Exactly one succeeds, and if it does it must be the in-cap one.
  const successes = [overCap, atCap].filter((r) => r.ok);
  assertEquals(successes.length, 1);
  assertEquals((successes[0] as Extract<Result, { ok: true }>).credited, 35);
  assertEquals(db.getBalance("u-4"), 35, "credited at received gross, not invoice");
});
