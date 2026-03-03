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
        status: 401,
        headers: corsHeaders,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const userId = claimsData.claims.sub;
    const { amount } = await req.json();

    if (!amount || amount < 1 || amount > 50000) {
      return new Response(
        JSON.stringify({ error: "Amount must be between 1 and 50000" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const apiKey = Deno.env.get("NOWPAYMENTS_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Payment service not configured" }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Create NOWPayments invoice
    const npResponse = await fetch(
      "https://api.nowpayments.io/v1/invoice",
      {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          price_amount: amount,
          price_currency: "usd",
          order_id: `deposit_${userId}_${Date.now()}`,
          order_description: `Deposit $${amount} USDT to OPOLL`,
          ipn_callback_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/nowpayments-webhook`,
          success_url: `${req.headers.get("origin") || "https://opollmarket.lovable.app"}/portfolio`,
          cancel_url: `${req.headers.get("origin") || "https://opollmarket.lovable.app"}/portfolio`,
        }),
      }
    );

    if (!npResponse.ok) {
      const errText = await npResponse.text();
      console.error("NOWPayments error:", errText);
      return new Response(
        JSON.stringify({ error: "Failed to create payment invoice" }),
        { status: 500, headers: corsHeaders }
      );
    }

    const invoice = await npResponse.json();

    // Insert pending deposit transaction using service role
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await adminClient.from("transactions").insert({
      user_id: userId,
      type: "deposit",
      amount: amount,
      status: "pending",
      nowpayments_payment_id: String(invoice.id),
    });

    return new Response(
      JSON.stringify({
        invoice_url: invoice.invoice_url,
        invoice_id: invoice.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("create-deposit error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
