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

    if (market.status === "resolved") {
      return new Response(JSON.stringify({ error: "Cannot cancel a resolved market. Payouts have already been distributed." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prevent re-cancellation
    const { count: existingRefunds } = await adminClient
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("market_id", market_id)
      .in("type", ["refund", "payout"]);

    if (existingRefunds && existingRefunds > 0) {
      return new Response(JSON.stringify({ error: `Market already has ${existingRefunds} payout/refund transactions. Cannot cancel to avoid duplicate refunds.` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Refund buy transactions (atomic) ---
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
      await adminClient.rpc("adjust_balance", { _user_id: tx.user_id, _delta: refundAmount });

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

    // --- Void pending commissions (no clawback needed) ---
    const { data: pendingComms } = await adminClient
      .from("pending_commissions")
      .select("id, user_id, amount, type")
      .eq("market_id", market_id)
      .eq("status", "pending");

    let totalCommissionsVoided = 0;
    for (const pc of pendingComms || []) {
      await adminClient
        .from("pending_commissions")
        .update({ status: "cancelled" })
        .eq("id", pc.id);

      totalCommissionsVoided += pc.amount;

      // Notify the user their pending commission is cancelled
      if (pc.type !== "bc400") {
        await adminClient.from("notifications").insert({
          user_id: pc.user_id,
          title: "Pending Commission Cancelled ❌",
          message: `Your pending $${pc.amount.toFixed(2)} ${pc.type} commission for "${market.title}" will not be credited as the market was cancelled.`,
          type: "info",
          market_id: market_id,
        });
      }
    }

    if (totalCommissionsVoided > 0) {
      console.log("cancel-market: Voided pending commissions:", totalCommissionsVoided);
    }

    // --- Handle creation fee ---
    let creationFeeRefunded = 0;
    let creationFeeForfeited = 0;
    const { data: feeTxns } = await adminClient
      .from("transactions")
      .select("*")
      .eq("market_id", market_id)
      .eq("side", "market_creation_fee")
      .eq("status", "confirmed");

    if (isModerationReject) {
      for (const feeTx of feeTxns || []) {
        creationFeeForfeited += feeTx.amount;
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
      for (const feeTx of feeTxns || []) {
        await adminClient.rpc("adjust_balance", { _user_id: feeTx.user_id, _delta: feeTx.amount });

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

    // --- Return initial liquidity to creator (only if actually paid) ---
    let liquidityRefunded = 0;
    if (market.initial_liquidity > 0 && market.liquidity_verified) {
      const creatorUserId = market.creator_wallet;
      await adminClient.rpc("adjust_balance", { _user_id: creatorUserId, _delta: market.initial_liquidity });

      await adminClient.from("transactions").insert({
        user_id: creatorUserId,
        market_id: market_id,
        type: "refund",
        amount: market.initial_liquidity,
        side: "liquidity_return",
        status: "confirmed",
      });

      liquidityRefunded = market.initial_liquidity;
      if (!refundedUsers.has(creatorUserId)) {
        refundedUsers.add(creatorUserId);
        usersRefunded++;
      }
      console.log("cancel-market: Returned initial liquidity to creator:", liquidityRefunded);
    }

    // Notify the creator
    if (feeTxns && feeTxns.length > 0) {
      const creatorUserId = feeTxns[0].user_id;

      if (isModerationReject) {
        const liqNote = liquidityRefunded > 0 ? ` Initial liquidity of $${liquidityRefunded.toFixed(2)} has been refunded.` : "";
        await adminClient.from("notifications").insert({
          user_id: creatorUserId,
          title: "Market Rejected — Content Violation ⛔",
          message: `Your market "${market.title}" was rejected for violating content guidelines. Your $${creationFeeForfeited.toFixed(2)} creation fee has been forfeited.${liqNote}`,
          type: "moderation",
          market_id: market_id,
        });
      } else {
        const feeNote = creationFeeRefunded > 0 ? `Your $${creationFeeRefunded.toFixed(2)} creation fee has been refunded. ` : "";
        const liqNote = liquidityRefunded > 0 ? `Initial liquidity of $${liquidityRefunded.toFixed(2)} has been returned.` : "";
        await adminClient.from("notifications").insert({
          user_id: creatorUserId,
          title: "Market Cancelled — Refunded 💰",
          message: `Your market "${market.title}" was cancelled by the System-Mod Engine. ${feeNote}${liqNote}`,
          type: "refund",
          market_id: market_id,
        });
      }
    } else if (liquidityRefunded > 0) {
      await adminClient.from("notifications").insert({
        user_id: market.creator_wallet,
        title: "Market Cancelled — Liquidity Returned 💰",
        message: `Your market "${market.title}" was cancelled. Initial liquidity of $${liquidityRefunded.toFixed(2)} has been returned to your balance.`,
        type: "refund",
        market_id: market_id,
      });
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
        commissions_clawed_back: totalCommissionsClawed,
        creation_fee_refunded: creationFeeRefunded,
        creation_fee_forfeited: creationFeeForfeited,
        liquidity_refunded: liquidityRefunded,
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
