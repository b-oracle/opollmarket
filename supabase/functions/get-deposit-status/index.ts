import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: corsHeaders,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: corsHeaders,
      });
    }

    const userId = userData.user.id;
    const { payment_id } = await req.json();

    if (!payment_id) {
      return new Response(JSON.stringify({ error: "payment_id required" }), {
        status: 400, headers: corsHeaders,
      });
    }

    // Verify transaction belongs to this user
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: tx } = await adminClient
      .from("transactions")
      .select("id, created_at, status, amount, payment_provider")
      .eq("user_id", userId)
      .eq("nowpayments_payment_id", String(payment_id))
      .eq("type", "deposit")
      .maybeSingle();

    if (!tx) {
      return new Response(JSON.stringify({ error: "Transaction not found" }), {
        status: 404, headers: corsHeaders,
      });
    }

    // ─── Payaza / Flutterwave deposits: return DB status directly (no external API to poll) ───
    if (tx.payment_provider === "payaza" || tx.payment_provider === "flutterwave") {
      return new Response(
        JSON.stringify({
          payment_status: tx.status === "confirmed" ? "finished" : tx.status === "failed" ? "failed" : "waiting",
          pay_amount: tx.amount,
          amount_usd: tx.amount,
          pay_currency: "NGN",
          created_at: tx.created_at,
          provider: tx.payment_provider,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── NOWPayments deposits: fetch from their API ───
    const apiKey = Deno.env.get("NOWPAYMENTS_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Payment service not configured" }), {
        status: 500, headers: corsHeaders,
      });
    }

    const npRes = await fetch(`https://api.nowpayments.io/v1/payment/${payment_id}`, {
      headers: { "x-api-key": apiKey },
    });

    if (!npRes.ok) {
      const errText = await npRes.text();
      console.error("NOWPayments status error:", errText);
      return new Response(JSON.stringify({ error: "Failed to fetch payment status" }), {
        status: 500, headers: corsHeaders,
      });
    }

    const payment = await npRes.json();

    return new Response(
      JSON.stringify({
        pay_address: payment.pay_address,
        pay_amount: payment.pay_amount,
        pay_currency: payment.pay_currency,
        expiration_estimate_date: payment.expiration_estimate_date,
        payment_status: payment.payment_status,
        created_at: tx.created_at,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("get-deposit-status error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
