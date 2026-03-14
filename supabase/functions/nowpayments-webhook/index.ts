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

async function handleDeposit(supabase: ReturnType<typeof createClient>, payload: Record<string, unknown>, orderId: string) {
  const { payment_id, actually_paid, outcome_amount, pay_amount, price_amount } = payload;
  const paymentIdStr = String(payment_id);

  const parts = orderId.split("_");
  if (parts.length < 3 || parts[0] !== "deposit") {
    console.error("Invalid deposit order_id format:", orderId);
    return;
  }
  const userId = parts[1];

  // 1. Check if already credited (idempotency)
  const { data: confirmedTx } = await supabase
    .from("transactions")
    .select("id, status")
    .eq("nowpayments_payment_id", paymentIdStr)
    .in("status", ["confirmed", "partial"])
    .maybeSingle();

  if (confirmedTx) {
    console.log("Already processed deposit:", paymentIdStr);
    return;
  }

  // 2. Find the matching transaction
  const { data: matchByPaymentId } = await supabase
    .from("transactions")
    .select("id, amount, status")
    .eq("nowpayments_payment_id", paymentIdStr)
    .in("status", ["pending", "expired"])
    .limit(1)
    .maybeSingle();

  const { data: matchByUserPending } = !matchByPaymentId
    ? await supabase
        .from("transactions")
        .select("id, amount, status")
        .eq("user_id", userId)
        .eq("type", "deposit")
        .in("status", ["pending", "expired"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const matchedTx = matchByPaymentId || matchByUserPending;

  // Use outcome_amount (net received after NP fees) as the credit amount.
  // price_amount is the gross requested amount — crediting it causes over-crediting
  // by the NP fee amount on every deposit.
  const requestedAmount = Number(price_amount) || matchedTx?.amount || 0;
  const netReceived = Number(outcome_amount) || Number(actually_paid) || 0;
  
  // Credit the net amount actually received, not the gross requested
  const creditAmount = netReceived > 0 ? netReceived : requestedAmount;
  const isPartial = creditAmount < requestedAmount * 0.98; // 2% tolerance
  const finalStatus = isPartial ? "partial" : "confirmed";

  // 3. Credit the user's balance with whatever was actually received
  const { data: balance } = await supabase
    .from("balances")
    .select("amount")
    .eq("user_id", userId)
    .eq("currency", "USDT")
    .single();

  if (balance) {
    const { error: balanceError } = await supabase
      .from("balances")
      .update({
        amount: Number(balance.amount) + Number(creditAmount),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("currency", "USDT");

    if (balanceError) {
      console.error("Failed to update balance:", balanceError);
      return;
    }
  } else {
    console.error("No balance record found for user:", userId);
    return;
  }

  // 4. Update the transaction record
  if (matchedTx) {
    await supabase
      .from("transactions")
      .update({
        status: finalStatus,
        nowpayments_payment_id: paymentIdStr,
        amount: Number(creditAmount), // Update to actual credited amount
      })
      .eq("id", matchedTx.id);
  } else {
    await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        type: "deposit",
        amount: Number(creditAmount),
        status: finalStatus,
        nowpayments_payment_id: paymentIdStr,
      });
  }

  // 5. Notify user
  const shortfall = Number(requestedAmount) - Number(creditAmount);
  if (isPartial) {
    await supabase.from("notifications").insert({
      user_id: userId,
      title: "Partial Deposit Received ⚠️",
      message: `$${Number(creditAmount).toFixed(2)} of your $${Number(requestedAmount).toFixed(2)} deposit has been credited. You can top up the remaining $${shortfall.toFixed(2)}.`,
      type: "deposit",
    });
  } else {
    await supabase.from("notifications").insert({
      user_id: userId,
      title: "Deposit Confirmed ✅",
      message: `Your deposit of $${Number(creditAmount).toFixed(2)} has been confirmed.`,
      type: "deposit",
    });
  }

  console.log(`Credited $${creditAmount} (${finalStatus}) to user ${userId}`);

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
    .select("id, status")
    .eq("nowpayments_payment_id", paymentIdStr)
    .maybeSingle();

  if (existingBoost?.status === "active") {
    console.log("Boost already active:", paymentIdStr);
    return;
  }

  const durationHours = TIER_DURATION_HOURS[tier] || 24;
  const now = new Date();
  const endsAt = new Date(now.getTime() + durationHours * 60 * 60 * 1000);

  if (existingBoost) {
    await supabase
      .from("market_boosts")
      .update({
        status: "active",
        starts_at: now.toISOString(),
        ends_at: endsAt.toISOString(),
      })
      .eq("id", existingBoost.id);
  } else {
    // Fallback: find by pending/expired + market_id
    const { data: pendingBoost } = await supabase
      .from("market_boosts")
      .select("id")
      .eq("market_id", marketId)
      .in("status", ["pending", "expired"])
      .eq("payer_wallet", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingBoost) {
      await supabase
        .from("market_boosts")
        .update({
          status: "active",
          starts_at: now.toISOString(),
          ends_at: endsAt.toISOString(),
          nowpayments_payment_id: paymentIdStr,
        })
        .eq("id", pendingBoost.id);
    }
  }

  await supabase.from("notifications").insert({
    user_id: userId,
    title: "Boost Activated! 🚀",
    message: `Your ${tier} boost is now live for ${durationHours}h.`,
    type: "boost",
  });

  console.log(`Activated ${tier} boost for market ${marketId}`);
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

    // Accept "finished", "confirmed", and "sending" statuses for crediting
    if (payment_status !== "finished" && payment_status !== "confirmed" && payment_status !== "partially_paid") {
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