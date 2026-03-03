import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-nowpayments-sig",
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

  // NOWPayments: sort keys, then HMAC-SHA512
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
      return new Response("Invalid signature", {
        status: 403,
        headers: corsHeaders,
      });
    }

    const payload = JSON.parse(body);
    console.log("IPN payload:", JSON.stringify(payload));

    const {
      payment_status,
      order_id,
      payment_id,
      actually_paid,
      pay_currency,
      outcome_amount,
    } = payload;

    // Only process finished/confirmed payments
    if (
      payment_status !== "finished" &&
      payment_status !== "confirmed"
    ) {
      console.log(`Ignoring status: ${payment_status}`);
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Extract user_id from order_id (format: deposit_{userId}_{timestamp})
    const parts = (order_id || "").split("_");
    if (parts.length < 3 || parts[0] !== "deposit") {
      console.error("Invalid order_id format:", order_id);
      return new Response("OK", { status: 200, headers: corsHeaders });
    }
    const userId = parts[1];

    // Idempotency: check if already processed
    const { data: existingTx } = await supabase
      .from("transactions")
      .select("id, status")
      .eq("nowpayments_payment_id", String(payment_id))
      .single();

    if (existingTx?.status === "confirmed") {
      console.log("Already processed payment:", payment_id);
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // Get the pending transaction to find the original USD amount
    const { data: pendingTx } = await supabase
      .from("transactions")
      .select("id, amount")
      .eq("user_id", userId)
      .eq("type", "deposit")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const creditAmount = pendingTx?.amount || outcome_amount || actually_paid;

    // Credit user balance
    const { data: balance } = await supabase
      .from("balances")
      .select("amount")
      .eq("user_id", userId)
      .eq("currency", "USDT")
      .single();

    if (balance) {
      await supabase
        .from("balances")
        .update({
          amount: Number(balance.amount) + Number(creditAmount),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("currency", "USDT");
    }

    // Update transaction status
    if (existingTx) {
      await supabase
        .from("transactions")
        .update({
          status: "confirmed",
          nowpayments_payment_id: String(payment_id),
        })
        .eq("id", existingTx.id);
    } else if (pendingTx) {
      await supabase
        .from("transactions")
        .update({
          status: "confirmed",
          nowpayments_payment_id: String(payment_id),
        })
        .eq("id", pendingTx.id);
    }

    // Send notification
    await supabase.from("notifications").insert({
      user_id: userId,
      title: "Deposit Confirmed",
      message: `Your deposit of $${Number(creditAmount).toFixed(2)} has been confirmed.`,
      type: "deposit",
    });

    console.log(`Credited $${creditAmount} to user ${userId}`);
    return new Response("OK", { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response("OK", { status: 200, headers: corsHeaders });
  }
});
