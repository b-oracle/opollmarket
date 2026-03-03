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
    const { amount, wallet_address, crypto_currency } = await req.json();

    if (!amount || amount < 1 || amount > 50000) {
      return new Response(
        JSON.stringify({ error: "Amount must be between 1 and 50000" }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (!wallet_address || wallet_address.trim().length < 10) {
      return new Response(
        JSON.stringify({ error: "Valid wallet address required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check user has made at least one deposit
    const { count: depositCount } = await adminClient
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("type", "deposit")
      .eq("status", "confirmed");

    if (!depositCount || depositCount === 0) {
      return new Response(
        JSON.stringify({
          error: "You must make at least one deposit before withdrawing",
        }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Check balance (only main balance, not bonus)
    const { data: balance } = await adminClient
      .from("balances")
      .select("amount")
      .eq("user_id", userId)
      .eq("currency", "USDT")
      .single();

    const currentBalance = Number(balance?.amount || 0);
    if (currentBalance < amount) {
      return new Response(
        JSON.stringify({ error: "Insufficient balance" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Deduct balance
    await adminClient
      .from("balances")
      .update({
        amount: currentBalance - amount,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("currency", "USDT");

    // Create withdrawal request
    await adminClient.from("withdrawal_requests").insert({
      user_id: userId,
      amount,
      wallet_address: wallet_address.trim(),
      crypto_currency: crypto_currency || "usdtbsc",
      status: "pending",
    });

    // Insert withdrawal transaction
    await adminClient.from("transactions").insert({
      user_id: userId,
      type: "withdrawal",
      amount,
      status: "pending",
    });

    // Notify user
    await adminClient.from("notifications").insert({
      user_id: userId,
      title: "Withdrawal Requested",
      message: `Your withdrawal of $${Number(amount).toFixed(2)} is pending admin review.`,
      type: "withdrawal",
    });

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("request-withdrawal error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
