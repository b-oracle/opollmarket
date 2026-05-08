// Integration tests for replay-deposit-webhook.
// We mock the Supabase admin client and the NOWPayments fetch to verify
// crediting rules across all deviation classes, plus replay idempotency.

import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { replayDeposit } from "./replayDeposit.ts";

type Tx = {
  id: string; user_id: string; amount: number; status: string;
  payment_provider: string | null; nowpayments_payment_id: string | null;
  type: string;
  gross_amount_usd?: number | null; net_amount_usd?: number | null;
};

type Inserted = { table: string; row: Record<string, unknown> };

function makeFakeAdmin(initial: { txs: Tx[] }) {
  const state = {
    txs: structuredClone(initial.txs),
    inserts: [] as Inserted[],
    updates: [] as { table: string; patch: Record<string, unknown>; matched: Tx[] }[],
    rpcCalls: [] as { fn: string; args: Record<string, unknown> }[],
  };

  function fromTransactions() {
    const filters: Array<(t: Tx) => boolean> = [];
    let updatePatch: Record<string, unknown> | null = null;
    let returningSelect = false;

    const flushUpdate = () => {
      const matched = state.txs.filter((t) => filters.every((f) => f(t)));
      if (updatePatch) {
        for (const m of matched) Object.assign(m, updatePatch);
        state.updates.push({ table: "transactions", patch: updatePatch, matched: structuredClone(matched) });
        updatePatch = null;
      }
      return matched;
    };

    const builder: any = {
      select(_cols: string) { if (updatePatch) returningSelect = true; return builder; },
      eq(col: keyof Tx, val: unknown) { filters.push((t) => (t as any)[col] === val); return builder; },
      neq(col: keyof Tx, val: unknown) { filters.push((t) => (t as any)[col] !== val); return builder; },
      limit(_n: number) { return builder; },
      async maybeSingle() {
        const matched = flushUpdate();
        if (returningSelect) {
          return { data: matched[0] ? { id: matched[0].id, user_id: matched[0].user_id } : null, error: null };
        }
        if (updatePatch === null && state.updates.at(-1)?.patch === undefined) {
          // pure select
        }
        return { data: matched[0] ?? null, error: null };
      },
      update(patch: Record<string, unknown>) { updatePatch = patch; return builder; },
      insert(row: Record<string, unknown>) { state.inserts.push({ table: "transactions", row }); return { data: null, error: null }; },
      // Thenable: awaiting the builder (without .maybeSingle()) executes pending update
      then(onFulfilled: (v: any) => void, onRejected?: (e: any) => void) {
        try {
          flushUpdate();
          onFulfilled({ data: null, error: null });
        } catch (e) { onRejected?.(e); }
      },
    };
    return builder;
  }

  const admin: any = {
    from(table: string) {
      if (table === "transactions") return fromTransactions();
      // Generic recorder for other tables (audit_logs, notifications, commission_settings)
      const builder: any = {
        select() { return builder; },
        limit() { return builder; },
        async maybeSingle() {
          if (table === "commission_settings") return { data: null, error: null };
          return { data: null, error: null };
        },
        eq() { return builder; },
        neq() { return builder; },
        insert(row: Record<string, unknown>) { state.inserts.push({ table, row }); return { data: null, error: null }; },
        update(_patch: Record<string, unknown>) { return builder; },
      };
      return builder;
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      state.rpcCalls.push({ fn, args });
      return { data: null, error: null };
    },
  };

  return { admin, state };
}

function makeFetch(npResponse: Record<string, unknown>, opts: { ok?: boolean; status?: number } = {}) {
  const calls: string[] = [];
  const fn: typeof fetch = async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(JSON.stringify(npResponse), {
      status: opts.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { fn, calls };
}

const baseTx = (overrides: Partial<Tx> = {}): Tx => ({
  id: "tx-1", user_id: "user-1", amount: 100, status: "pending",
  payment_provider: "nowpayments", nowpayments_payment_id: "np-123", type: "deposit",
  ...overrides,
});

Deno.test("normal deposit — credits exactly what was received", async () => {
  const { admin, state } = makeFakeAdmin({ txs: [baseTx()] });
  const { fn: fetchImpl } = makeFetch({
    payment_status: "finished",
    price_amount: 100, outcome_amount: 100, actually_paid: 100,
    pay_currency: "usdtbsc", outcome_currency: "usdtbsc",
  });

  const r = await replayDeposit(admin, fetchImpl, "fake-key", { actorId: "admin-1", transactionId: "tx-1" });
  assertEquals(r.status, 200);
  assertEquals(r.body.success, true);
  assertEquals(r.body.classification, "normal");
  assertEquals(r.body.credited_main, 100);
  assertEquals(r.body.credited_bonus, 0);

  const adjust = state.rpcCalls.find((c) => c.fn === "adjust_balance");
  assertExists(adjust);
  assertEquals(adjust!.args._delta, 100);
  assertEquals(adjust!.args._bonus_delta, 0);
});

Deno.test("partial deposit — never credits, flags for review", async () => {
  const { admin, state } = makeFakeAdmin({ txs: [baseTx({ amount: 100 })] });
  const { fn: fetchImpl } = makeFetch({
    payment_status: "partially_paid",
    price_amount: 100, outcome_amount: 40, actually_paid: 40,
    pay_currency: "usdtbsc", outcome_currency: "usdtbsc",
  });

  const r = await replayDeposit(admin, fetchImpl, "k", { actorId: "admin-1", transactionId: "tx-1" });
  assertEquals(r.status, 200);
  assertEquals(r.body.blocked, true);
  assertEquals(r.body.reason, "partial");

  // No balance adjustment was made
  assertEquals(state.rpcCalls.find((c) => c.fn === "adjust_balance"), undefined);
  // Tx flipped to "partial", not "confirmed"
  assertEquals(state.txs[0].status, "partial");
});

Deno.test("wrong-asset deposit — never credits, flags for review", async () => {
  const { admin, state } = makeFakeAdmin({ txs: [baseTx({ amount: 100 })] });
  // Different currency, ratio 5x → wrong_asset
  const { fn: fetchImpl } = makeFetch({
    payment_status: "finished",
    price_amount: 100, outcome_amount: 500, actually_paid: 0.005,
    pay_currency: "btc", outcome_currency: "usd",
  });

  const r = await replayDeposit(admin, fetchImpl, "k", { actorId: "admin-1", transactionId: "tx-1" });
  assertEquals(r.body.blocked, true);
  assertEquals(r.body.reason, "wrong_asset");
  assertEquals(state.rpcCalls.find((c) => c.fn === "adjust_balance"), undefined);
  assertEquals(state.txs[0].status, "wrong_asset");
});

Deno.test("overpayment — credits invoice to main, surplus to bonus", async () => {
  const { admin, state } = makeFakeAdmin({ txs: [baseTx({ amount: 100 })] });
  const { fn: fetchImpl } = makeFetch({
    payment_status: "finished",
    price_amount: 100, outcome_amount: 110, actually_paid: 110,
    pay_currency: "usdtbsc", outcome_currency: "usdtbsc",
  });

  const r = await replayDeposit(admin, fetchImpl, "k", { actorId: "admin-1", transactionId: "tx-1" });
  assertEquals(r.body.success, true);
  assertEquals(r.body.classification, "overpayment");
  assertEquals(r.body.credited_main, 100);
  assertEquals(r.body.credited_bonus, 10);

  const adjust = state.rpcCalls.find((c) => c.fn === "adjust_balance");
  assertEquals(adjust!.args._delta, 100);
  assertEquals(adjust!.args._bonus_delta, 10);
});

Deno.test("excessive overpayment — exceeds safety cap, blocked", async () => {
  const { admin, state } = makeFakeAdmin({ txs: [baseTx({ amount: 50 })] });
  // requested 50, cap = min(50*5, 5000) = 250 surplus. Send 50 + 300 surplus.
  const { fn: fetchImpl } = makeFetch({
    payment_status: "finished",
    price_amount: 50, outcome_amount: 350, actually_paid: 350,
    pay_currency: "usdtbsc", outcome_currency: "usdtbsc",
  });
  const r = await replayDeposit(admin, fetchImpl, "k", { actorId: "admin-1", transactionId: "tx-1" });
  assertEquals(r.body.blocked, true);
  assertEquals(r.body.reason, "excessive_overpayment");
  assertEquals(state.rpcCalls.find((c) => c.fn === "adjust_balance"), undefined);
});

Deno.test("provider says NOT paid — refuses to credit", async () => {
  const { admin, state } = makeFakeAdmin({ txs: [baseTx()] });
  const { fn: fetchImpl } = makeFetch({
    payment_status: "waiting",
    price_amount: 100, outcome_amount: 0, actually_paid: 0,
    pay_currency: "usdtbsc", outcome_currency: "usdtbsc",
  });
  const r = await replayDeposit(admin, fetchImpl, "k", { actorId: "admin-1", transactionId: "tx-1" });
  assertEquals(r.status, 409);
  assertEquals(state.rpcCalls.find((c) => c.fn === "adjust_balance"), undefined);
});

Deno.test("idempotency — already-confirmed tx returns no-op, no second credit", async () => {
  const { admin, state } = makeFakeAdmin({ txs: [baseTx({ status: "confirmed" })] });
  const { fn: fetchImpl, calls } = makeFetch({ payment_status: "finished" });

  const r = await replayDeposit(admin, fetchImpl, "k", { actorId: "admin-1", transactionId: "tx-1" });
  assertEquals(r.body.already_confirmed, true);
  // Never even called NOWPayments
  assertEquals(calls.length, 0);
  // No balance adjustment
  assertEquals(state.rpcCalls.find((c) => c.fn === "adjust_balance"), undefined);
});

Deno.test("idempotency — concurrent replay (tx confirmed mid-flight) does not double-credit", async () => {
  // Simulate the race: between the initial lookup and the atomic claim UPDATE,
  // another worker confirmed the tx. Our .neq("status", "confirmed") guard
  // means the UPDATE matches zero rows and we return already_confirmed.
  const tx = baseTx();
  const { admin, state } = makeFakeAdmin({ txs: [tx] });

  // Patch the admin so that as soon as anyone calls .from("transactions").update(),
  // we flip the status to confirmed BEFORE the matcher runs.
  const realFrom = admin.from.bind(admin);
  let lookupDone = false;
  admin.from = (table: string) => {
    const b = realFrom(table);
    if (table !== "transactions") return b;
    const origUpdate = b.update.bind(b);
    b.update = (patch: Record<string, unknown>) => {
      // First .update() call is the claim — race-confirm just before it lands
      if (lookupDone && state.txs[0].status !== "confirmed") {
        state.txs[0].status = "confirmed";
      }
      return origUpdate(patch);
    };
    const origMaybeSingle = b.maybeSingle.bind(b);
    b.maybeSingle = async () => {
      const r = await origMaybeSingle();
      lookupDone = true;
      return r;
    };
    return b;
  };

  const { fn: fetchImpl } = makeFetch({
    payment_status: "finished",
    price_amount: 100, outcome_amount: 100, actually_paid: 100,
    pay_currency: "usdtbsc", outcome_currency: "usdtbsc",
  });

  const r = await replayDeposit(admin, fetchImpl, "k", { actorId: "admin-1", transactionId: "tx-1" });
  assertEquals(r.body.already_confirmed, true);
  assertEquals(state.rpcCalls.find((c) => c.fn === "adjust_balance"), undefined);
});

Deno.test("rejects non-nowpayments providers", async () => {
  const { admin } = makeFakeAdmin({ txs: [baseTx({ payment_provider: "payaza" })] });
  const { fn: fetchImpl, calls } = makeFetch({});
  const r = await replayDeposit(admin, fetchImpl, "k", { actorId: "admin-1", transactionId: "tx-1" });
  assertEquals(r.status, 400);
  assertEquals(calls.length, 0);
});

Deno.test("missing transaction returns 404", async () => {
  const { admin } = makeFakeAdmin({ txs: [] });
  const { fn: fetchImpl } = makeFetch({});
  const r = await replayDeposit(admin, fetchImpl, "k", { actorId: "admin-1", transactionId: "missing" });
  assertEquals(r.status, 404);
});
