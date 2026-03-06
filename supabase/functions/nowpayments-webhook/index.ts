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
  const { payment_id, actually_paid, outcome_amount } = payload;
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
    .select("id")
    .eq("nowpayments_payment_id", paymentIdStr)
    .eq("status", "confirmed")
    .maybeSingle();

  if (confirmedTx) {
    console.log("Already processed deposit:", paymentIdStr);
    return;
  }

  // 2. Find the matching transaction — first by payment_id (any status), then by user pending
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

  // Use the original requested amount if we found a matching tx, otherwise use what was actually paid
  const creditAmount = matchedTx?.amount || outcome_amount || actually_paid;

  // 3. Credit the user's balance
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

  // 4. Update the transaction record to confirmed
  if (matchedTx) {
    await supabase
      .from("transactions")
      .update({ status: "confirmed", nowpayments_payment_id: paymentIdStr })
      .eq("id", matchedTx.id);
  } else {
    // No matching transaction at all — create a confirmed one (safety net)
    await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        type: "deposit",
        amount: Number(creditAmount),
        status: "confirmed",
        nowpayments_payment_id: paymentIdStr,
      });
  }

  // 5. Notify user
  await supabase.from("notifications").insert({
    user_id: userId,
    title: "Deposit Confirmed ✅",
    message: `Your deposit of $${Number(creditAmount).toFixed(2)} has been confirmed.`,
    type: "deposit",
  });

  console.log(`Credited $${creditAmount} to user ${userId}`);
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
    } else {
      console.log("Unknown order_id prefix:", order_id);
    }

    return new Response("OK", { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response("OK", { status: 200, headers: corsHeaders });
  }
});