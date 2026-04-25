import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  return computed === signature;
}

async function processWelcomeBonus(supabase: ReturnType<typeof createClient>, userId: string, depositAmount: number) {
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

async function handleDeposit(supabase: ReturnType<typeof createClient>, payload: Record<string, unknown>, orderId: string) {
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
  // outcome_amount = NP's reported net received — but can be wildly wrong
  // (e.g. "Wrong Asset Confirmed" can return inflated/deflated values).
  const requestedAmount = Number(price_amount) || matchedTx?.amount || 0;
  const netReceived = Number(outcome_amount) || Number(actually_paid) || 0;

  // WRONG ASSET DETECTION: if outcome_amount diverges wildly from price_amount,
  // NP likely confirmed a wrong asset. Do NOT auto-credit — flag for manual review.
  const divergenceRatio = requestedAmount > 0 ? netReceived / requestedAmount : 1;
  if (divergenceRatio > 2 || (divergenceRatio < 0.3 && netReceived > 0)) {
    console.warn(`WRONG ASSET DETECTED: outcome=$${netReceived} vs requested=$${requestedAmount} (ratio ${divergenceRatio.toFixed(2)}) for payment ${paymentIdStr}. Skipping auto-credit.`);

    // Mark the transaction as needing manual review instead of crediting
    if (matchedTx) {
      await supabase
        .from("transactions")
        .update({ status: "wrong_asset", nowpayments_payment_id: paymentIdStr })
        .eq("id", matchedTx.id);
    } else {
      await supabase.from("transactions").insert({
        user_id: userId,
        type: "deposit",
        amount: requestedAmount,
        status: "wrong_asset",
        nowpayments_payment_id: paymentIdStr,
      });
    }

    // Notify admins
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "super_admin"]);
    for (const admin of adminRoles || []) {
      await supabase.from("notifications").insert({
        user_id: admin.user_id,
        title: "⚠️ Wrong Asset Deposit Detected",
        message: `User ${userId.slice(0, 8)}… sent wrong asset for payment ${paymentIdStr}. Requested $${requestedAmount}, NP reported $${netReceived.toFixed(2)}. Manual review required.`,
        type: "info",
      });
    }

    // Notify user
    await supabase.from("notifications").insert({
      user_id: userId,
      title: "Deposit Issue ⚠️",
      message: `Your $${requestedAmount.toFixed(2)} deposit was flagged because the wrong cryptocurrency was sent. Please contact support for assistance.`,
      type: "deposit",
    });

    return; // Do NOT credit
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
        .update({ status: "partial", nowpayments_payment_id: paymentIdStr, amount: Number(creditAmount) })
        .eq("id", matchedTx.id);
    } else {
      await supabase.from("transactions").insert({
        user_id: userId,
        type: "deposit",
        amount: Number(creditAmount),
        status: "partial",
        nowpayments_payment_id: paymentIdStr,
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

    // Notify admins
    const { data: adminRoles2 } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "super_admin"]);
    for (const admin of adminRoles2 || []) {
      await supabase.from("notifications").insert({
        user_id: admin.user_id,
        title: "⚠️ Partial Deposit Flagged",
        message: `User ${userId.slice(0, 8)}… sent $${Number(creditAmount).toFixed(2)} of $${Number(requestedAmount).toFixed(2)} (payment ${paymentIdStr}). Not credited — needs manual review.`,
        type: "info",
      });
    }

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
    throw new Error(`Balance adjustment failed: ${balanceError.message}`);
  }

  // 4. Update the transaction record
  if (matchedTx) {
    const { error: txUpdateError } = await supabase
      .from("transactions")
      .update({
        status: finalStatus,
        nowpayments_payment_id: paymentIdStr,
        amount: Number(creditAmount),
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

async function handleBoost(supabase: ReturnType<typeof createClient>, payload: Record<string, unknown>, orderId: string) {
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

  // Idempotency: check if already activated
  const { data: existingBoost } = await supabase
    .from("market_boosts")
    .select("id, status, ends_at")
    .eq("nowpayments_payment_id", paymentIdStr)
    .maybeSingle();

  if (existingBoost?.status === "active") {
    console.log("Boost already active:", paymentIdStr);
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

  // If extending, new ends_at = existing ends_at + new duration
  // The pending record already has the correct extended ends_at from create-boost-payment,
  // but use it as stored in the record (which was pre-calculated at creation time).
  // For the activating record, use the ends_at that was set during creation.
  const pendingEndsAt = existingBoost?.ends_at;
  const endsAt = pendingEndsAt
    ? new Date(pendingEndsAt)
    : activeBoost
      ? new Date(new Date(activeBoost.ends_at).getTime() + durationHours * 60 * 60 * 1000)
      : new Date(now.getTime() + durationHours * 60 * 60 * 1000);

  if (existingBoost) {
    await supabase
      .from("market_boosts")
      .update({
        status: "active",
        starts_at: now.toISOString(),
        ends_at: endsAt.toISOString(),
        tx_hash: String(txHash),
      })
      .eq("id", existingBoost.id);
  } else {
    // Fallback: find by pending/expired + market_id
    const { data: pendingBoost } = await supabase
      .from("market_boosts")
      .select("id, ends_at")
      .eq("market_id", marketId)
      .in("status", ["pending", "expired"])
      .eq("payer_wallet", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingBoost) {
      const fallbackEndsAt = pendingBoost.ends_at
        ? new Date(pendingBoost.ends_at)
        : endsAt;

      await supabase
        .from("market_boosts")
        .update({
          status: "active",
          starts_at: now.toISOString(),
          ends_at: fallbackEndsAt.toISOString(),
          nowpayments_payment_id: paymentIdStr,
          tx_hash: String(txHash),
        })
        .eq("id", pendingBoost.id);
    }
  }

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

async function handleBroadcast(supabase: ReturnType<typeof createClient>, payload: Record<string, unknown>, orderId: string) {
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

    const payload = JSON.parse(body);
    console.log("IPN payload:", JSON.stringify(payload));

    const { payment_status, order_id } = payload;

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
    return new Response("OK", { status: 200, headers: corsHeaders });
  }
});