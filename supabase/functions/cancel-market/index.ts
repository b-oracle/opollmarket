import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
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

    // Atomically lock market row, validate status, and set to cancelled
    const { data: cancelResult } = await adminClient.rpc("cancel_market_atomic", {
      _market_id: market_id,
    });

    if (!cancelResult?.success) {
      return new Response(JSON.stringify({ error: cancelResult?.error || "Cannot cancel market" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Refund open positions (idempotent: sold/closed positions are skipped) ---
    const { data: openPositions } = await adminClient
      .from("positions")
      .select("id, user_id, option_id, side, shares, avg_price")
      .eq("market_id", market_id)
      .gt("shares", 0);

    let totalRefunded = 0;
    let usersRefunded = 0;
    const refundedUsers = new Set<string>();

    for (const pos of openPositions || []) {
      const refundAmount = Math.round(Number(pos.shares) * Number(pos.avg_price) * 100) / 100;
      if (refundAmount <= 0) continue;

      await adminClient.rpc("adjust_balance", { _user_id: pos.user_id, _delta: refundAmount, _bonus_delta: 0, _insurance_delta: 0 });

      await adminClient.from("transactions").insert({
        user_id: pos.user_id,
        market_id: market_id,
        option_id: pos.option_id,
        type: "refund",
        amount: refundAmount,
        side: pos.side,
        shares: pos.shares,
        price: pos.avg_price,
        status: "confirmed",
      });

      // Close the position so a re-run cannot refund it twice
      await adminClient
        .from("positions")
        .update({ shares: 0, updated_at: new Date().toISOString() })
        .eq("id", pos.id);

      totalRefunded += refundAmount;
      if (!refundedUsers.has(pos.user_id)) {
        refundedUsers.add(pos.user_id);
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

    // --- Debit platform pool for fees already credited at trade time ---
    // The platform pool was credited totalFees for each buy transaction.
    // Pending commissions are voided (never disbursed), but the fee itself
    // is still in the platform pool. We must debit it back.
    if (totalRefunded > 0) {
      // Sum all platform commission amounts for this market by looking at buy transactions
      // and calculating the fee that was charged
      const { data: commSettings } = await adminClient
        .from("commission_settings")
        .select("prediction_fee_percent")
        .limit(1)
        .single();

      const feePercent = Number(commSettings?.prediction_fee_percent ?? 10) / 100;

      // Reverse only the fee proportional to what we actually refunded
      const totalFeesCollected = Math.round(totalRefunded * feePercent * 100) / 100;


      if (totalFeesCollected > 0) {
        await adminClient.rpc("adjust_platform_pool", { _delta: -totalFeesCollected });
        console.log("cancel-market: Reversed platform pool fees:", totalFeesCollected);
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
        await adminClient.rpc("adjust_balance", { _user_id: feeTx.user_id, _delta: feeTx.amount, _bonus_delta: 0, _insurance_delta: 0 });

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
    // Check for actual liquidity payment transaction (don't rely solely on liquidity_verified flag)
    const { data: liqTx } = market.initial_liquidity > 0
      ? await adminClient
          .from("transactions")
          .select("id")
          .eq("market_id", market_id)
          .eq("side", "initial_liquidity")
          .eq("status", "confirmed")
          .limit(1)
      : { data: null };
    const liquidityWasPaid = market.initial_liquidity > 0 && (market.liquidity_verified || (liqTx && liqTx.length > 0));
    if (liquidityWasPaid) {
      const creatorUserId = market.creator_wallet;
      await adminClient.rpc("adjust_balance", { _user_id: creatorUserId, _delta: market.initial_liquidity, _bonus_delta: 0, _insurance_delta: 0 });

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

    // Market status already set to 'cancelled' atomically by cancel_market_atomic RPC

    return new Response(
      JSON.stringify({
        success: true,
        users_refunded: usersRefunded,
        total_refunded: totalRefunded,
        commissions_voided: totalCommissionsVoided,
        creation_fee_refunded: creationFeeRefunded,
        creation_fee_forfeited: creationFeeForfeited,
        liquidity_refunded: liquidityRefunded,
        moderation_reject: isModerationReject,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("cancel-market error:", err, (err as any)?.stack);
    return new Response(JSON.stringify({ error: (getErrorMessage(err)) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
