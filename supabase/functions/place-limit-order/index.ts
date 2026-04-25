import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getErrorMessage } from "../_shared/errors.ts";

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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    const { marketId, optionId, side, amount, limitPrice, shares } = await req.json();

    if (!marketId || !side || !amount || !limitPrice || !shares) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (amount <= 0 || limitPrice <= 0 || limitPrice > 1 || shares <= 0) {
      return new Response(JSON.stringify({ error: "Invalid order parameters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify market is active
    const { data: market } = await admin
      .from("markets")
      .select("id, status")
      .eq("id", marketId)
      .eq("status", "active")
      .single();

    if (!market) {
      return new Response(JSON.stringify({ error: "Market not found or inactive" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Atomically debit balance
    const { data: bal } = await admin
      .from("balances")
      .select("amount, bonus_balance")
      .eq("user_id", userId)
      .eq("currency", "USDT")
      .maybeSingle();

    const mainBal = Number(bal?.amount || 0);
    const bonusBal = Number(bal?.bonus_balance || 0);
    const totalAvailable = mainBal + bonusBal;

    if (totalAvailable < amount) {
      return new Response(JSON.stringify({ error: "Insufficient balance" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Bonus first, then main
    const bonusDeduct = Math.min(bonusBal, amount);
    const mainDeduct = amount - bonusDeduct;

    const { data: debitResult } = await admin.rpc("debit_balance_atomic", {
      _user_id: userId,
      _main_deduct: mainDeduct,
      _bonus_deduct: bonusDeduct,
    });

    if (!debitResult?.success) {
      return new Response(JSON.stringify({ error: debitResult?.error || "Failed to escrow balance" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert limit order
    const { data: order, error: orderError } = await admin.from("limit_orders").insert({
      user_id: userId,
      market_id: marketId,
      option_id: optionId || null,
      side,
      order_type: "limit",
      limit_price: limitPrice,
      amount,
      shares,
      status: "pending",
    }).select("id").single();

    if (orderError) {
      // Refund on failure
      await admin.rpc("adjust_balance", {
        _user_id: userId,
        _delta: mainDeduct,
        _bonus_delta: bonusDeduct,
      });
      return new Response(JSON.stringify({ error: "Failed to create order" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, order_id: order.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (getErrorMessage(err)) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
