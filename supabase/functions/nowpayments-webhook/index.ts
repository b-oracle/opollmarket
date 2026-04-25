import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logWebhookEvent } from "../_shared/webhookLog.ts";
import { safeEqual, validateNowPaymentsPayload } from "../_shared/webhookValidation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-nowpayments-sig, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TIER_DURATION_HOURS: Record<string, number> = {
  flash: 12,
  standard: 24,
  whale: 168,
};

async function verifySignature(
  body: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );

  const parsed = JSON.parse(body);
  const sorted = Object.keys(parsed)
    .sort()
    .reduce((acc: Record<string, unknown>, k) => {
      acc[k] = parsed[k];
      return acc;
    }, {});

  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(JSON.stringify(sorted))
  );

  const computed = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return safeEqual(computed, signature);
}

async function processWelcomeBonus(supabase: any, userId: string, depositAmount: number) {
  const { data: toggle } = await supabase.from("feature_toggles").select("enabled").eq("feature_key", "welcome_bonus").maybeSingle();
  if (!toggle?.enabled) return;
  // Idempotency: check if already credited
  const { count: existingBonus } = await supabase.from("transactions").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("type", "welcome_bonus").eq("status", "confirmed");
  if ((existingBonus ?? 0) > 0) { console.log(`Welcome bonus already credited for user ${userId}`); return; }
  const { data: profile } = await supabase.from("profiles").select("kyc_status").eq("id", userId).single();
  if (!profile || profile.kyc_status !== "approved") return;
  const { count } = await supabase.from("transactions").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("type", "deposit").eq("status", "confirmed");
  if ((count ?? 0) > 1) return;
  const { data: settings } = await supabase.from("commission_settings").select("welcome_bonus_percent, welcome_bonus_cap").limit(1).single();
  if (!settings) return;
  const percent = Number(settings.welcome_bonus_percent) || 0;
  const cap = Number(settings.welcome_bonus_cap) || 0;
  if (percent <= 0 || cap <= 0) return;
  const bonus = Math.min(depositAmount * percent / 100, cap);
  if (bonus <= 0) return;
  const { error: adjError } = await supabase.rpc("adjust_balance", { _user_id: userId, _delta: 0, _bonus_delta: bonus });
  if (adjError) { console.error("Welcome bonus credit failed:", adjError); return; }
  await supabase.from("transactions").insert({ user_id: userId, type: "welcome_bonus", amount: bonus, status: "confirmed" });
  await supabase.from("notifications").insert({ user_id: userId, title: "Welcome Bonus! 🎁", message: `You received a $${bonus.toFixed(2)} welcome bonus on your first deposit!`, type: "deposit" });
  console.log(`Welcome bonus: $${bonus.toFixed(2)} credited to user ${userId}`);
}

// ===== Deviation thresholds (admin-configurable, with safe defaults) =====
// All ratios are netReceived / requestedAmount.
type Thresholds = {
  overpay: number;       // >this * invoice -> overpayment flow (same asset)
  partial: number;       // <this * invoice -> partial (rejected)
  wrongHigh: number;     // >this * invoice w/ different currency -> wrong_asset
  wrongLow: number;      // <this * invoice w/ different currency -> wrong_asset
  largeAlert: number;    // >this * invoice -> alert admins even on success
};
const DEFAULT_THRESHOLDS: Thresholds = {
  overpay: 1.02, partial: 0.98, wrongHigh: 2.0, wrongLow: 0.3, largeAlert: 1.5,
};

async function loadThresholds(supabase: any): Promise<Thresholds> {
  try {
    const { data } = await supabase
      .from("commission_settings")
      .select("deposit_overpay_threshold, deposit_partial_threshold, deposit_wrong_asset_high, deposit_wrong_asset_low, deposit_large_overpay_alert")
      .limit(1)
      .maybeSingle();
    if (!data) return DEFAULT_THRESHOLDS;
    const d = data as any;
    return {
      overpay: Number(d.deposit_overpay_threshold) || DEFAULT_THRESHOLDS.overpay,
      partial: Number(d.deposit_partial_threshold) || DEFAULT_THRESHOLDS.partial,
      wrongHigh: Number(d.deposit_wrong_asset_high) || DEFAULT_THRESHOLDS.wrongHigh,
      wrongLow: Number(d.deposit_wrong_asset_low) || DEFAULT_THRESHOLDS.wrongLow,
      largeAlert: Number(d.deposit_large_overpay_alert) || DEFAULT_THRESHOLDS.largeAlert,
    };
  } catch (_e) {
    return DEFAULT_THRESHOLDS;
  }
}

function classifyDeposit(requested: number, received: number, payCur: string, outCur: string, t: Thresholds): {
  status: "wrong_asset" | "overpayment" | "partial" | "normal";
  ratio: number;
  recommendedCredit: number;
  excess: number;
  shortfall: number;
} {
  const ratio = requested > 0 ? received / requested : 1;
  const sameAsset = payCur !== "" && payCur === outCur;
  const sameAssetOverpay = sameAsset && requested > 0 && received >= requested * t.overpay;
  // Wrong-asset only triggers on different currencies AND extreme deviation.
  // Same-asset minor over/underpayment never triggers wrong_asset.
  const wrongAsset = !sameAsset && (ratio > t.wrongHigh || (ratio < t.wrongLow && received > 0));

  if (wrongAsset) {
    return { status: "wrong_asset", ratio, recommendedCredit: Math.min(received, requested), excess: 0, shortfall: 0 };
  }
  if (sameAssetOverpay) {
    return { status: "overpayment", ratio, recommendedCredit: requested, excess: received - requested, shortfall: 0 };
  }
  const credit = requested > 0 ? Math.min(received > 0 ? received : requested, requested) : received;
  if (credit < requested * t.partial) {
    return { status: "partial", ratio, recommendedCredit: credit, excess: 0, shortfall: requested - credit };
  }
  return { status: "normal", ratio, recommendedCredit: credit, excess: 0, shortfall: 0 };
}

async function notifyAdmins(supabase: any, title: string, message: string) {
  const { data: adminRoles } = await supabase
    .from("user_roles")
    .select("user_id")
    .in("role", ["admin", "super_admin"]);
  const rows = (adminRoles || []).map((a: { user_id: string }) => ({
    user_id: a.user_id,
    title,
    message,
    type: "info",
  }));
  if (rows.length > 0) await supabase.from("notifications").insert(rows);
}

async function handleDeposit(supabase: any, payload: Record<string, unknown>, orderId: string) {
  const { payment_id, actually_paid, outcome_amount, pay_amount, price_amount, pay_currency, outcome_currency } = payload;
  const paymentIdStr = String(payment_id);

  const parts = orderId.split("_");
  if (parts.length < 3 || parts[0] !== "deposit") {
    console.error("Invalid deposit order_id format:", orderId);
    return;
  }
  const userId = parts[1];

  // 1. Check if already credited (idempotency) — includes 'processing' to catch in-flight claims
  const { data: confirmedTx } = await supabase
    .from("transactions")
    .select("id, status")
    .eq("nowpayments_payment_id", paymentIdStr)
    .in("status", ["confirmed", "partial", "processing"])
    .maybeSingle();

  if (confirmedTx) {
    console.log("Already processed/claimed deposit:", paymentIdStr);
    return;
  }

  // 2. Atomically claim the transaction (prevents concurrent webhook replays)
  const { data: claimedRows } = await supabase.rpc("claim_webhook_deposit", {
    _payment_id: paymentIdStr,
  });

  let matchedTx = claimedRows?.[0] || null;

  // Fallback: try matching by user + pending status (for txns without payment_id yet)
  if (!matchedTx) {
    // First try to set the payment_id on a matching pending tx, then claim it
    await supabase
      .from("transactions")
      .update({ nowpayments_payment_id: paymentIdStr })
      .eq("user_id", userId)
      .eq("type", "deposit")
      .in("status", ["pending", "expired"])
      .is("nowpayments_payment_id", null)
      .order("created_at", { ascending: false })
      .limit(1);

    const { data: retryRows } = await supabase.rpc("claim_webhook_deposit", {
      _payment_id: paymentIdStr,
    });
    matchedTx = retryRows?.[0] || null;
  }

  // price_amount = the USD amount the user requested to deposit.
  // outcome_amount = NP-reported net received (can be inflated/deflated for wrong-asset cases).
  const requestedAmount = Number(price_amount) || matchedTx?.amount || 0;
  const netReceived = Number(outcome_amount) || Number(actually_paid) || 0;

  // Classify deposit deviation using admin-configurable thresholds
  const payCur = String(pay_currency || "").toLowerCase();
  const outCur = String(outcome_currency || pay_currency || "").toLowerCase();
  const thresholds = await loadThresholds(supabase);
  const cls = classifyDeposit(requestedAmount, netReceived, payCur, outCur, thresholds);

  if (cls.status === "wrong_asset") {
    console.warn(`WRONG ASSET: payment ${paymentIdStr} ratio=${cls.ratio.toFixed(2)} payCur=${payCur} outCur=${outCur}`);

    if (matchedTx) {
      await supabase.from("transactions").update({
        status: "wrong_asset",
        nowpayments_payment_id: paymentIdStr,
        gross_amount_usd: netReceived,
        net_amount_usd: netReceived,
      }).eq("id", matchedTx.id);
    } else {
      await supabase.from("transactions").insert({
        user_id: userId,
        type: "deposit",
        amount: requestedAmount,
        status: "wrong_asset",
        nowpayments_payment_id: paymentIdStr,
        gross_amount_usd: netReceived,
        net_amount_usd: netReceived,
      });
    }

    await notifyAdmins(
      supabase,
      "⚠️ Wrong Asset Deposit",
      `User ${userId.slice(0, 8)}… payment ${paymentIdStr}. Requested $${requestedAmount.toFixed(2)}, NP reported $${netReceived.toFixed(2)} (ratio ${cls.ratio.toFixed(2)}). Recommended credit: $${cls.recommendedCredit.toFixed(2)}. Manual review required.`,
    );

    await supabase.from("notifications").insert({
      user_id: userId,
      title: "Deposit Issue ⚠️",
      message: `Your $${requestedAmount.toFixed(2)} deposit was flagged because the wrong cryptocurrency was sent. Please contact support for assistance.`,
      type: "deposit",
    });
    return;
  }

  // OVERPAYMENT FLOW
  if (cls.status === "overpayment") {
    const excess = cls.excess;
    console.log(`OVERPAYMENT: requested=$${requestedAmount} received=$${netReceived} excess=$${excess.toFixed(4)} ratio=${cls.ratio.toFixed(2)}`);

    const { error: balErr } = await supabase.rpc("adjust_balance", {
      _user_id: userId,
      _delta: Number(requestedAmount),
      _bonus_delta: Number(excess),
      _insurance_delta: 0,
    });
    if (balErr) {
      console.error("Overpayment credit failed:", balErr);
      throw new Error(`Overpayment balance adjust failed: ${balErr.message}`);
    }

    if (matchedTx) {
      await supabase.from("transactions").update({
        status: "confirmed",
        nowpayments_payment_id: paymentIdStr,
        amount: Number(requestedAmount),
        gross_amount_usd: Number(netReceived),
        net_amount_usd: Number(requestedAmount),
        description: `Deposit confirmed. Overpaid by $${excess.toFixed(2)} credited to bonus balance.`,
      }).eq("id", matchedTx.id);
    } else {
      await supabase.from("transactions").insert({
        user_id: userId,
        type: "deposit",
        amount: Number(requestedAmount),
        status: "confirmed",
        nowpayments_payment_id: paymentIdStr,
        gross_amount_usd: Number(netReceived),
        net_amount_usd: Number(requestedAmount),
        description: `Deposit confirmed. Overpaid by $${excess.toFixed(2)} credited to bonus balance.`,
      });
    }

    if (excess > 0) {
      await supabase.from("transactions").insert({
        user_id: userId,
        type: "overpayment_bonus",
        amount: Number(excess),
        status: "confirmed",
        nowpayments_payment_id: paymentIdStr,
        description: `Overpayment surplus from deposit ${paymentIdStr} — credited to bonus balance.`,
      });
    }

    // Notify user
    await supabase.from("notifications").insert({
      user_id: userId,
      title: "Deposit Confirmed ✅",
      message: excess > 0
        ? `Your $${requestedAmount.toFixed(2)} deposit was credited. You overpaid by $${excess.toFixed(2)} — added to your bonus balance (usable for platform fees).`
        : `Your $${requestedAmount.toFixed(2)} deposit was credited.`,
      type: "deposit",
    });

    // Alert admins on unusually large overpayments
    if (cls.ratio >= thresholds.largeAlert) {
      await notifyAdmins(
        supabase,
        "ℹ️ Large Overpayment Auto-Credited",
        `User ${userId.slice(0, 8)}… overpaid by $${excess.toFixed(2)} (ratio ${cls.ratio.toFixed(2)}) on payment ${paymentIdStr}. Credited $${requestedAmount.toFixed(2)} to main balance, $${excess.toFixed(2)} to bonus.`,
      );
    }

    // Run welcome-bonus + debt-settlement post-credit hooks (same as normal flow)
    try { await processWelcomeBonus(supabase, userId, Number(requestedAmount)); } catch (e) { console.error("Welcome bonus error:", e); }
    try {
      const { data: debtResult } = await supabase.rpc("settle_user_debts", { _user_id: userId });
      if (debtResult && Number((debtResult as { amount?: number }).amount ?? 0) > 0) {
        await supabase.from("notifications").insert({
          user_id: userId,
          title: "Outstanding Balance Settled 📋",
          message: `$${Number((debtResult as { amount: number }).amount).toFixed(2)} was deducted from your deposit to cover outstanding market liquidity fees.`,
          type: "info",
        });
      }
    } catch (e) { console.error("Debt settle error:", e); }

    return;
  }



  // Normal credit flow — cap at requested amount as safety net
  const creditAmount = requestedAmount > 0
    ? Math.min(netReceived > 0 ? netReceived : requestedAmount, requestedAmount)
    : netReceived;
  const isPartial = creditAmount < requestedAmount * 0.98; // 2% tolerance

  // REJECT partial payments — do NOT credit, flag for admin review
  if (isPartial) {
    console.warn(`PARTIAL DEPOSIT REJECTED: received $${creditAmount.toFixed(2)} of $${requestedAmount.toFixed(2)} for payment ${paymentIdStr}. NOT crediting.`);

    if (matchedTx) {
      await supabase
        .from("transactions")
        .update({
          status: "partial",
          nowpayments_payment_id: paymentIdStr,
          amount: Number(creditAmount),
          gross_amount_usd: Number(netReceived),
          net_amount_usd: Number(creditAmount),
        })
        .eq("id", matchedTx.id);
    } else {
      await supabase.from("transactions").insert({
        user_id: userId,
        type: "deposit",
        amount: Number(creditAmount),
        status: "partial",
        nowpayments_payment_id: paymentIdStr,
        gross_amount_usd: Number(netReceived),
        net_amount_usd: Number(creditAmount),
      });
    }

    // Notify user
    const shortfall = Number(requestedAmount) - Number(creditAmount);
    await supabase.from("notifications").insert({
      user_id: userId,
      title: "Partial Deposit — Not Credited ⚠️",
      message: `You sent $${Number(creditAmount).toFixed(2)} of the $${Number(requestedAmount).toFixed(2)} required. Partial deposits are not credited. Please contact support or retry with the full amount.`,
      type: "deposit",
    });

    // Notify admins (with recommended credit amount + clear status)
    await notifyAdmins(
      supabase,
      "⚠️ Partial Deposit Flagged",
      `User ${userId.slice(0, 8)}… payment ${paymentIdStr}: received $${Number(creditAmount).toFixed(2)} of $${Number(requestedAmount).toFixed(2)} (shortfall $${shortfall.toFixed(2)}, ratio ${(cls.ratio).toFixed(2)}). Status: partial. Recommended credit if approved: $${cls.recommendedCredit.toFixed(2)}.`,
    );

    return; // Do NOT credit
  }

  const finalStatus = "confirmed";

  // 3. Credit the user's balance atomically (prevents race conditions)
  const { error: balanceError } = await supabase.rpc("adjust_balance", { 
    _user_id: userId, 
    _delta: Number(creditAmount),
    _bonus_delta: 0,
    _insurance_delta: 0,
  });
  if (balanceError) {
    console.error("Failed to adjust balance:", balanceError);
    await logWebhookEvent(supabase, {
      provider: "nowpayments",
      event_type: "credit_failed",
      status: "error",
      reference: paymentIdStr,
      transaction_id: matchedTx?.id ?? null,
      user_id: userId,
      requested_amount: Number(requestedAmount),
      credited_amount: Number(creditAmount),
      error: balanceError,
    });
    throw new Error(`Balance adjustment failed: ${balanceError.message}`);
  }

  await logWebhookEvent(supabase, {
    provider: "nowpayments",
    event_type: "credited",
    status: "success",
    reference: paymentIdStr,
    transaction_id: matchedTx?.id ?? null,
    user_id: userId,
    requested_amount: Number(requestedAmount),
    credited_amount: Number(creditAmount),
  });

  // 4. Update the transaction record
  if (matchedTx) {
    const { error: txUpdateError } = await supabase
      .from("transactions")
      .update({
        status: finalStatus,
        nowpayments_payment_id: paymentIdStr,
        amount: Number(creditAmount),
        gross_amount_usd: Number(netReceived),
        net_amount_usd: Number(creditAmount),
      })
      .eq("id", matchedTx.id);
    if (txUpdateError) {
      console.error("WARNING: Balance credited but tx update failed:", txUpdateError);
    }
  } else {
    const { error: txInsertError } = await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        type: "deposit",
        amount: Number(creditAmount),
        status: finalStatus,
        nowpayments_payment_id: paymentIdStr,
        gross_amount_usd: Number(netReceived),
        net_amount_usd: Number(creditAmount),
      });
    if (txInsertError) {
      console.error("WARNING: Balance credited but tx insert failed:", txInsertError);
    }
  }

  // 4b. Verify balance was actually updated (safety net)
  const { data: verifyBalance } = await supabase
    .from("balances")
    .select("amount")
    .eq("user_id", userId)
    .single();
  console.log(`Post-credit balance verification for ${userId}: $${verifyBalance?.amount}`);

  // 5. Notify user
  await supabase.from("notifications").insert({
    user_id: userId,
    title: "Deposit Confirmed ✅",
    message: `Your deposit of $${Number(creditAmount).toFixed(2)} has been confirmed.`,
    type: "deposit",
  });

  console.log(`Credited $${creditAmount} (${finalStatus}) to user ${userId}`);

  // Welcome bonus check (only on full confirmation)
  if (!isPartial) {
    try {
      await processWelcomeBonus(supabase, userId, Number(creditAmount));
    } catch (wbErr) {
      console.error("Welcome bonus error:", wbErr);
    }
  }

  // Settle any outstanding debts from this user's balance
  try {
    const { data: debtResult } = await supabase.rpc("settle_user_debts", { _user_id: userId });
    if (debtResult && Number(debtResult.amount) > 0) {
      console.log(`Settled $${debtResult.amount} in debts for user ${userId}`);
      await supabase.from("notifications").insert({
        user_id: userId,
        title: "Outstanding Balance Settled 📋",
        message: `$${Number(debtResult.amount).toFixed(2)} was deducted from your deposit to cover outstanding market liquidity fees.`,
        type: "info",
      });
    }
  } catch (debtErr) {
    console.error("Failed to settle debts:", debtErr);
  }
}

async function handleBoost(supabase: any, payload: Record<string, unknown>, orderId: string) {
  const { payment_id } = payload;
  const paymentIdStr = String(payment_id);

  // Parse: boost_{marketId}_{tier}_{userId}_{timestamp}
  const parts = orderId.split("_");
  if (parts.length < 5 || parts[0] !== "boost") {
    console.error("Invalid boost order_id format:", orderId);
    return;
  }
  const marketId = parts[1];
  const tier = parts[2];
  const userId = parts[3];

  // Atomic claim: prevents two concurrent IPN deliveries from both activating
  // (and thus double-extending) the same boost. The RPC flips a single row from
  // pending/expired -> processing and returns it; concurrent calls get nothing.
  const { data: claimedBoosts } = await supabase.rpc("claim_webhook_boost", {
    _payment_id: paymentIdStr,
    _market_id: marketId,
    _payer: userId,
  });
  const claimedBoost = claimedBoosts?.[0] || null;

  // If already active (matched but not claimable) — short-circuit.
  if (!claimedBoost) {
    const { data: existingBoost } = await supabase
      .from("market_boosts")
      .select("id, status")
      .eq("nowpayments_payment_id", paymentIdStr)
      .maybeSingle();
    if (existingBoost?.status === "active" || existingBoost?.status === "processing") {
      console.log("Boost already active/processing:", paymentIdStr);
      return;
    }
    console.error("No claimable boost for payment:", paymentIdStr);
    return;
  }

  const durationHours = TIER_DURATION_HOURS[tier] || 24;
  const now = new Date();
  const txHash = payload.payin_hash || payload.pay_address || paymentIdStr;

  // Check if there's an existing active boost on the same market to extend
  const { data: activeBoosts } = await supabase
    .from("market_boosts")
    .select("id, ends_at")
    .eq("market_id", marketId)
    .eq("status", "active")
    .gte("ends_at", now.toISOString())
    .order("ends_at", { ascending: false })
    .limit(1);

  const activeBoost = activeBoosts?.[0];

  // Use the pre-calculated ends_at from the claimed (pending) record if present,
  // otherwise extend the currently-active one, otherwise start fresh.
  const pendingEndsAt = claimedBoost.ends_at;
  const endsAt = pendingEndsAt
    ? new Date(pendingEndsAt)
    : activeBoost
      ? new Date(new Date(activeBoost.ends_at).getTime() + durationHours * 60 * 60 * 1000)
      : new Date(now.getTime() + durationHours * 60 * 60 * 1000);

  await supabase
    .from("market_boosts")
    .update({
      status: "active",
      starts_at: now.toISOString(),
      ends_at: endsAt.toISOString(),
      tx_hash: String(txHash),
    })
    .eq("id", claimedBoost.id);

  // If extending an existing active boost, also update its ends_at
  if (activeBoost) {
    await supabase
      .from("market_boosts")
      .update({ ends_at: endsAt.toISOString() })
      .eq("id", activeBoost.id);
  }

  const isExtension = !!activeBoost;
  await supabase.from("notifications").insert({
    user_id: userId,
    title: isExtension ? "Boost Extended! 🚀" : "Boost Activated! 🚀",
    message: isExtension
      ? `Your ${tier} boost extended the market boost until ${endsAt.toLocaleString()}.`
      : `Your ${tier} boost is now live for ${durationHours}h.`,
    type: "boost",
  });

  console.log(`${isExtension ? "Extended" : "Activated"} ${tier} boost for market ${marketId}`);
}

async function handleBroadcast(supabase: any, payload: Record<string, unknown>, orderId: string) {
  const { payment_id } = payload;
  const paymentIdStr = String(payment_id);

  // Parse: broadcast_{marketId}_alert_{userId}_{timestamp}
  const parts = orderId.split("_");
  if (parts.length < 5 || parts[0] !== "broadcast") {
    console.error("Invalid broadcast order_id format:", orderId);
    return;
  }
  const marketId = parts[1];
  const userId = parts[3];

  // Idempotency
  const { data: existing } = await supabase
    .from("market_broadcasts")
    .select("id, status")
    .eq("nowpayments_payment_id", paymentIdStr)
    .maybeSingle();

  if (existing?.status === "sent") {
    console.log("Broadcast already sent:", paymentIdStr);
    return;
  }

  // Find the broadcast record
  const broadcastRecord = existing || (await (async () => {
    const { data } = await supabase
      .from("market_broadcasts")
      .select("id")
      .eq("market_id", marketId)
      .eq("user_id", userId)
      .in("status", ["pending", "expired"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  })());

  if (!broadcastRecord) {
    console.error("No broadcast record found for:", orderId);
    return;
  }

  // Update payment ID if needed
  if (!existing) {
    await supabase
      .from("market_broadcasts")
      .update({ nowpayments_payment_id: paymentIdStr })
      .eq("id", broadcastRecord.id);
  }

  // Trigger the send-market-broadcast function
  try {
    const broadcastUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-market-broadcast`;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    await fetch(broadcastUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        broadcast_id: broadcastRecord.id,
        market_id: marketId,
      }),
    });
  } catch (err) {
    console.error("Failed to trigger broadcast:", err);
  }

  console.log(`Broadcast payment confirmed for market ${marketId}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Hoisted so the outer catch block can include the body when logging.
  let rawBodyForLog: unknown = null;

  try {
    const ipnSecret = Deno.env.get("NOWPAYMENTS_IPN_SECRET");
    if (!ipnSecret) {
      console.error("IPN secret not configured");
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    const body = await req.text();
    const signature = req.headers.get("x-nowpayments-sig") || "";

    const valid = await verifySignature(body, signature, ipnSecret);
    if (!valid) {
      console.error("Invalid IPN signature");
      return new Response("Invalid signature", { status: 403, headers: corsHeaders });
    }

    let rawPayload: unknown;
    try {
      rawPayload = JSON.parse(body);
      rawBodyForLog = rawPayload;
    } catch {
      console.error("NowPayments IPN: invalid JSON body");
      return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
    }

    const validation = validateNowPaymentsPayload(rawPayload);
    if (!validation.ok) {
      console.error("NowPayments IPN validation failed:", validation.error);
      return new Response(JSON.stringify({ error: validation.error }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const payload = validation.value.raw as Record<string, unknown>;
    console.log("IPN payload:", JSON.stringify(payload));

    const payment_status = validation.value.payment_status;
    const order_id = validation.value.order_id;
    const payment_id_str = String(validation.value.payment_id);

    // ── Top-level idempotency: dedupe identical IPN events by (payment_id + status) ──
    // If the same NowPayments event arrives twice (retry, replay, etc.) we record it
    // once in webhook_event_ledger; subsequent identical deliveries short-circuit.
    {
      const supaDedupe = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data: isFirst } = await supaDedupe.rpc("record_webhook_event", {
        _provider: "nowpayments",
        _event_key: `${payment_id_str}:${payment_status}`,
        _payload: payload as unknown as Record<string, unknown>,
      });
      if (isFirst === false) {
        console.log(`Duplicate IPN ignored: ${payment_id_str} status=${payment_status}`);
        await logWebhookEvent(supaDedupe, {
          provider: "nowpayments",
          event_type: "duplicate_ignored",
          status: "info",
          reference: payment_id_str,
          message: `Duplicate IPN for status=${payment_status}`,
        });
        return new Response("OK", { status: 200, headers: corsHeaders });
      }
    }

    // Handle partially_paid: mark deposit as "partial" for admin review (no balance credit)
    if (payment_status === "partially_paid") {
      console.log(`Partial payment received for order ${order_id}`);
      const prefix = (order_id || "").split("_")[0];
      if (prefix === "deposit") {
        const supa = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        const parts = order_id.split("_");
        const userId = parts.length >= 3 ? parts[1] : null;
        const paymentIdStr = String(payload.payment_id);
        const actuallyPaid = Number(payload.actually_paid) || 0;
        const outcomeAmount = Number(payload.outcome_amount) || actuallyPaid;
        const priceAmount = Number(payload.price_amount) || 0;

        // Try to find and update the matching transaction to "partial"
        const { data: existingTx } = await supa
          .from("transactions")
          .select("id, status")
          .eq("nowpayments_payment_id", paymentIdStr)
          .maybeSingle();

        if (existingTx && existingTx.status === "partial") {
          console.log("Already marked as partial:", paymentIdStr);
          return new Response("OK", { status: 200, headers: corsHeaders });
        }

        // Find the pending/expired deposit transaction
        let txId = existingTx?.id;
        if (!txId && userId) {
          const { data: pendingTx } = await supa
            .from("transactions")
            .select("id")
            .eq("user_id", userId)
            .eq("type", "deposit")
            .eq("nowpayments_payment_id", paymentIdStr)
            .in("status", ["pending", "expired"])
            .limit(1)
            .maybeSingle();
          txId = pendingTx?.id;

          // Fallback: match by user without payment_id
          if (!txId) {
            const { data: fallbackTx } = await supa
              .from("transactions")
              .select("id")
              .eq("user_id", userId)
              .eq("type", "deposit")
              .in("status", ["pending", "expired"])
              .is("nowpayments_payment_id", null)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            txId = fallbackTx?.id;
          }
        }

        if (txId) {
          await supa
            .from("transactions")
            .update({
              status: "partial",
              nowpayments_payment_id: paymentIdStr,
              amount: outcomeAmount > 0 ? outcomeAmount : priceAmount,
            })
            .eq("id", txId);
          console.log(`Marked deposit ${txId} as partial ($${outcomeAmount})`);
        }

        // Notify user
        if (userId) {
          await supa.from("notifications").insert({
            user_id: userId,
            title: "Partial Payment Received ⚠️",
            message: `You sent a partial payment of $${outcomeAmount.toFixed(2)} for your $${priceAmount.toFixed(2)} deposit. Please contact support for resolution.`,
            type: "deposit",
          });
        }
      }
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // Accept "finished" and "confirmed" statuses for crediting
    if (payment_status !== "finished" && payment_status !== "confirmed") {
      console.log(`Ignoring status: ${payment_status}`);
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const prefix = (order_id || "").split("_")[0];

    if (prefix === "deposit") {
      await handleDeposit(supabase, payload, order_id);
    } else if (prefix === "boost") {
      await handleBoost(supabase, payload, order_id);
    } else if (prefix === "broadcast") {
      await handleBroadcast(supabase, payload, order_id);
    } else {
      console.log("Unknown order_id prefix:", order_id);
    }

    return new Response("OK", { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error("Webhook error:", err);
    try {
      const supa = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      await logWebhookEvent(supa, {
        provider: "nowpayments",
        event_type: "handler_exception",
        status: "error",
        message: err instanceof Error ? err.message : "Unknown handler error",
        payload: rawBodyForLog,
        error: err,
      });
    } catch { /* swallow */ }
    return new Response("OK", { status: 200, headers: corsHeaders });
  }
});