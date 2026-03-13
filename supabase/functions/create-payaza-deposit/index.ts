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

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: corsHeaders,
      });
    }

    const userId = claimsData.claims.sub;
    const { amount } = await req.json();

    if (!amount || amount < 1 || amount > 50000) {
      return new Response(
        JSON.stringify({ error: "Amount must be between 1 and 50,000" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const merchantKey = Deno.env.get("PAYAZA_MERCHANT_KEY");
    if (!merchantKey) {
      return new Response(
        JSON.stringify({ error: "Fiat payment service not configured" }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Get user email for Payaza
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    const email = user?.email || "customer@opoll.com";

    const transactionReference = `payaza_${userId}_${Date.now()}`;

    // Insert pending deposit transaction
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await adminClient.from("transactions").insert({
      user_id: userId,
      type: "deposit",
      amount: amount,
      status: "pending",
      payment_provider: "payaza",
      nowpayments_payment_id: transactionReference, // reuse column for reference
    });

    return new Response(
      JSON.stringify({
        transaction_reference: transactionReference,
        merchant_key: merchantKey,
        email,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("create-payaza-deposit error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
