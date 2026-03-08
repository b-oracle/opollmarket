import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

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
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is admin
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: isAdmin } = await adminClient.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    const { data: isSuperAdmin } = await adminClient.rpc("has_role", {
      _user_id: user.id,
      _role: "super_admin",
    });
    if (!isAdmin && !isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { market_id, reason } = await req.json();
    if (!market_id) {
      return new Response(JSON.stringify({ error: "market_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isModerationReject = reason === "moderation";

    // Fetch market
    const { data: market, error: marketErr } = await adminClient
      .from("markets")
      .select("*")
      .eq("id", market_id)
      .single();

    if (marketErr || !market) {
      return new Response(JSON.stringify({ error: "Market not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (market.status === "cancelled") {
      return new Response(JSON.stringify({ error: "Market already cancelled" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find all buy transactions for this market and refund them
    const { data: transactions } = await adminClient
      .from("transactions")
      .select("*")
      .eq("market_id", market_id)
      .eq("type", "buy")
      .eq("status", "confirmed");

    let totalRefunded = 0;
    let usersRefunded = 0;
    const refundedUsers = new Set<string>();

    for (const tx of transactions || []) {
      const refundAmount = tx.amount;

      const { data: balance } = await adminClient
        .from("balances")
        .select("amount")
        .eq("user_id", tx.user_id)
        .single();

      if (balance) {
        await adminClient
          .from("balances")
          .update({
            amount: Number(balance.amount) + refundAmount,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", tx.user_id);
      }

      await adminClient.from("transactions").insert({
        user_id: tx.user_id,
        market_id: market_id,
        option_id: tx.option_id,
        type: "refund",
        amount: refundAmount,
        side: tx.side,
        shares: tx.shares,
        price: tx.price,
        status: "confirmed",
      });

      totalRefunded += refundAmount;
      if (!refundedUsers.has(tx.user_id)) {
        refundedUsers.add(tx.user_id);
        usersRefunded++;
      }
    }

    // Handle creation fee based on reason
    let creationFeeRefunded = 0;
    let creationFeeForfeited = 0;
    const { data: feeTxns } = await adminClient
      .from("transactions")
      .select("*")
      .eq("market_id", market_id)
      .eq("side", "market_creation_fee")
      .eq("status", "confirmed");

    if (isModerationReject) {
      // Moderation rejection: FORFEIT the creation fee (no refund)
      for (const feeTx of feeTxns || []) {
        creationFeeForfeited += feeTx.amount;

        // Record forfeiture transaction for audit trail
        await adminClient.from("transactions").insert({
          user_id: feeTx.user_id,
          market_id: market_id,
          type: "fee_forfeiture",
          amount: feeTx.amount,
          side: "creation_fee_forfeited",
          status: "confirmed",
        });
      }
    } else {
      // Normal cancellation: refund the creation fee
      for (const feeTx of feeTxns || []) {
        const { data: feeBalance } = await adminClient
          .from("balances")
          .select("amount")
          .eq("user_id", feeTx.user_id)
          .single();

        if (feeBalance) {
          await adminClient
            .from("balances")
            .update({
              amount: Number(feeBalance.amount) + feeTx.amount,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", feeTx.user_id);
        }

        await adminClient.from("transactions").insert({
          user_id: feeTx.user_id,
          market_id: market_id,
          type: "refund",
          amount: feeTx.amount,
          side: "creation_fee_refund",
          status: "confirmed",
        });

        creationFeeRefunded += feeTx.amount;
        if (!refundedUsers.has(feeTx.user_id)) {
          refundedUsers.add(feeTx.user_id);
          usersRefunded++;
        }
      }
    }

    // Notify the creator
    if (feeTxns && feeTxns.length > 0) {
      const creatorUserId = feeTxns[0].user_id;

      if (isModerationReject) {
        await adminClient.from("notifications").insert({
          user_id: creatorUserId,
          title: "Market Rejected — Content Violation ⛔",
          message: `Your market "${market.title}" was rejected for violating content guidelines. Your $${creationFeeForfeited} creation fee has been forfeited. Initial liquidity has been refunded to your balance.`,
          type: "moderation",
          market_id: market_id,
        });
      } else if (creationFeeRefunded > 0) {
        await adminClient.from("notifications").insert({
          user_id: creatorUserId,
          title: "Market Cancelled — Fee Refunded 💰",
          message: `Your market "${market.title}" was cancelled by the System-Mod Engine. Your $${creationFeeRefunded} creation fee has been refunded to your balance.`,
          type: "refund",
          market_id: market_id,
        });
      }
    }

    // Update market status
    await adminClient
      .from("markets")
      .update({ status: "cancelled" })
      .eq("id", market_id);

    return new Response(
      JSON.stringify({
        success: true,
        users_refunded: usersRefunded,
        total_refunded: totalRefunded,
        creation_fee_refunded: creationFeeRefunded,
        creation_fee_forfeited: creationFeeForfeited,
        moderation_reject: isModerationReject,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
