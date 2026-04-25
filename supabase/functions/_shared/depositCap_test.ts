// Unit tests for the shared deposit-cap validator.
//
// Run:
//   deno test supabase/functions/_shared/depositCap_test.ts
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeDepositCap, validateDepositCap, CAP_TOLERANCE } from "./depositCap.ts";

Deno.test("computeDepositCap: pending uses net first", () => {
  const r = computeDepositCap({
    status: "pending", amount: 100, gross_amount_usd: 98, net_amount_usd: 95,
  });
  assertEquals(r.maxCredit, 95);
  assertEquals(r.capLabel, "received net amount");
  assertEquals(r.isWrongAsset, false);
});

Deno.test("computeDepositCap: partial falls back to gross when net missing", () => {
  const r = computeDepositCap({
    status: "partial", amount: 100, gross_amount_usd: 80, net_amount_usd: null,
  });
  assertEquals(r.maxCredit, 80);
  assertEquals(r.capLabel, "received gross amount");
});

Deno.test("computeDepositCap: falls back to invoice when no on-chain values", () => {
  const r = computeDepositCap({ status: "pending", amount: 50 });
  assertEquals(r.maxCredit, 50);
  assertEquals(r.capLabel, "invoice amount");
});

Deno.test("computeDepositCap: wrong_asset always uses gross (never net)", () => {
  const r = computeDepositCap({
    status: "wrong_asset_high", amount: 200, gross_amount_usd: 35, net_amount_usd: 30,
  });
  assertEquals(r.maxCredit, 35);
  assertEquals(r.capLabel, "received gross amount");
  assertEquals(r.isWrongAsset, true);
});

Deno.test("validateDepositCap: rejects negative, zero, NaN, Infinity", () => {
  const tx = { status: "pending", amount: 100, net_amount_usd: 95 };
  for (const bad of [0, -1, NaN, Infinity, -Infinity]) {
    const r = validateDepositCap(tx, bad);
    assert(!r.ok, `expected reject for ${bad}`);
  }
});

Deno.test("validateDepositCap: over-cap message names the cap source", () => {
  const r = validateDepositCap(
    { status: "wrong_asset", amount: 200, gross_amount_usd: 35 },
    100,
  );
  assert(!r.ok);
  assertStringIncludes(r.error, "received gross amount");
  assertStringIncludes(r.error, "$35.00");
  assertStringIncludes(r.error, "$100.00");
});

Deno.test("validateDepositCap: $0.01 tolerance accepts sub-cent overshoot and clamps", () => {
  const r = validateDepositCap(
    { status: "pending", amount: 100, net_amount_usd: 95 },
    95 + CAP_TOLERANCE / 2,
  );
  assert(r.ok);
  assertEquals(r.creditAmount, 95, "must clamp to cap, never overcredit");
});

Deno.test("validateDepositCap: just over tolerance rejects", () => {
  const r = validateDepositCap(
    { status: "pending", amount: 100, net_amount_usd: 95 },
    95 + CAP_TOLERANCE + 0.001,
  );
  assert(!r.ok);
});

Deno.test("validateDepositCap: exact cap succeeds", () => {
  const r = validateDepositCap(
    { status: "partial", amount: 100, gross_amount_usd: 80 },
    80,
  );
  assert(r.ok);
  assertEquals(r.creditAmount, 80);
});

Deno.test("computeDepositCap: handles string numerics from PG", () => {
  const r = computeDepositCap({
    status: "pending", amount: "100", gross_amount_usd: "98.5", net_amount_usd: "95.25",
  });
  assertEquals(r.maxCredit, 95.25);
  assertEquals(r.gross, 98.5);
});
