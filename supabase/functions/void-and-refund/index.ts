// Emergency "Void & Refund" — super-admin override that:
//   1. Reverses any payouts already credited from a prior resolution (clawback).
//   2. Refunds every confirmed buy at face value (stake back to user).
//   3. Refunds the market creation fee and returns initial liquidity.
//   4. Voids pending commissions and reverses platform-pool fee credits.
//   5. Resets the market to status='cancelled' with resolution_blocked=true.
//   6. Writes an audit_logs entry capturing actor, reason, and dollar totals.
//
// Unlike cancel-market, this function works on RESOLVED markets too — it is the
// only path to undo a bad resolution. Requires super_admin role.

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

    // Only super_admin can use the emergency override.
    const { data: isSuperAdmin } = await adminClient.rpc("has_role", {
      _user_id: user.id,
      _role: "super_admin",
    });
    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Super admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const market_id: string | undefined = body?.market_id;
    const reason: string = String(body?.reason || "").trim();

    if (!market_id) {
      return new Response(JSON.stringify({ error: "market_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (reason.length < 10) {
      return new Response(
        JSON.stringify({ error: "A reason of at least 10 characters is required for audit purposes" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    const previousStatus: string = market.status;
    const previousResolvedSide: string | null = market.resolved_side;
    const previousWinningOptionId: string | null = market.winning_option_id;

    // ── 1. Clawback prior payouts (only meaningful if market was resolved) ──
    let totalClawedBack = 0;
    let usersClawedBack = 0;
    const clawedSet = new Set<string>();
    const { data: payoutTxs } = await adminClient
      .from("transactions")
      .select("id, user_id, amount")
      .eq("market_id", market_id)
      .eq("type", "payout")
      .eq("status", "confirmed");

    for (const tx of payoutTxs || []) {
      const amt = Number(tx.amount || 0);
      if (amt <= 0) continue;
      // Debit the user (allow negative balance — admin override).
      await adminClient.rpc("adjust_balance", {
        _user_id: tx.user_id,
        _delta: -amt,
        _bonus_delta: 0,
        _insurance_delta: 0,
      });
      await adminClient.from("transactions").insert({
        user_id: tx.user_id,
        market_id: market_id,
        type: "clawback",
        amount: amt,
        side: "payout_reversal",
        status: "confirmed",
      });
      // Mark the original payout reversed so it can't be double-clawed.
      await adminClient.from("transactions").update({ status: "reversed" }).eq("id", tx.id);
      totalClawedBack += amt;
      if (!clawedSet.has(tx.user_id)) {
        clawedSet.add(tx.user_id);
        usersClawedBack++;
      }
    }

    // ── 2. Refund every confirmed buy at face value ──
    const { data: buys } = await adminClient
      .from("transactions")
      .select("id, user_id, option_id, amount, side, shares, price")
      .eq("market_id", market_id)
      .eq("type", "buy")
      .eq("status", "confirmed");

    let totalRefunded = 0;
    let usersRefunded = 0;
    const refundedSet = new Set<string>();
    for (const tx of buys || []) {
      const amt = Number(tx.amount || 0);
      if (amt <= 0) continue;
      await adminClient.rpc("adjust_balance", {
        _user_id: tx.user_id,
        _delta: amt,
        _bonus_delta: 0,
        _insurance_delta: 0,
      });
      await adminClient.from("transactions").insert({
        user_id: tx.user_id,
        market_id: market_id,
        option_id: tx.option_id,
        type: "refund",
        amount: amt,
        side: tx.side,
        shares: tx.shares,
        price: tx.price,
        status: "confirmed",
      });
      totalRefunded += amt;
      if (!refundedSet.has(tx.user_id)) {
        refundedSet.add(tx.user_id);
        usersRefunded++;
      }
    }

    // ── 3. Void pending commissions ──
    const { data: pendingComms } = await adminClient
      .from("pending_commissions")
      .select("id, user_id, amount, type")
      .eq("market_id", market_id)
      .eq("status", "pending");
    let totalCommissionsVoided = 0;
    for (const pc of pendingComms || []) {
      await adminClient.from("pending_commissions").update({ status: "cancelled" }).eq("id", pc.id);
      totalCommissionsVoided += Number(pc.amount || 0);
    }

    // ── 4. Reverse platform-pool fees credited at trade time ──
    if (totalRefunded > 0) {
      const { data: commSettings } = await adminClient
        .from("commission_settings")
        .select("prediction_fee_percent")
        .limit(1)
        .single();
      const feePercent = Number(commSettings?.prediction_fee_percent ?? 10) / 100;
      const totalFeesCollected = (buys || []).reduce(
        (s: number, t: any) => s + Number(t.amount || 0) * feePercent,
        0
      );
      if (totalFeesCollected > 0) {
        await adminClient.rpc("adjust_platform_pool", { _delta: -totalFeesCollected });
      }
    }

    // ── 5. Refund creation fee ──
    let creationFeeRefunded = 0;
    const { data: feeTxns } = await adminClient
      .from("transactions")
      .select("id, user_id, amount")
      .eq("market_id", market_id)
      .eq("side", "market_creation_fee")
      .eq("status", "confirmed");
    for (const ft of feeTxns || []) {
      const amt = Number(ft.amount || 0);
      await adminClient.rpc("adjust_balance", {
        _user_id: ft.user_id,
        _delta: amt,
        _bonus_delta: 0,
        _insurance_delta: 0,
      });
      await adminClient.from("transactions").insert({
        user_id: ft.user_id,
        market_id: market_id,
        type: "refund",
        amount: amt,
        side: "creation_fee_refund",
        status: "confirmed",
      });
      creationFeeRefunded += amt;
    }

    // ── 6. Return initial liquidity ──
    let liquidityRefunded = 0;
    if (Number(market.initial_liquidity || 0) > 0) {
      const { data: liqTx } = await adminClient
        .from("transactions")
        .select("id")
        .eq("market_id", market_id)
        .eq("side", "initial_liquidity")
        .eq("status", "confirmed")
        .limit(1);
      if (market.liquidity_verified || (liqTx && liqTx.length > 0)) {
        const amt = Number(market.initial_liquidity);
        await adminClient.rpc("adjust_balance", {
          _user_id: market.creator_wallet,
          _delta: amt,
          _bonus_delta: 0,
          _insurance_delta: 0,
        });
        await adminClient.from("transactions").insert({
          user_id: market.creator_wallet,
          market_id: market_id,
          type: "refund",
          amount: amt,
          side: "liquidity_return",
          status: "confirmed",
        });
        liquidityRefunded = amt;
      }
    }

    // ── 7. Reset market state ──
    await adminClient
      .from("markets")
      .update({
        status: "cancelled",
        resolved_side: null,
        winning_option_id: null,
        resolution_blocked: true,
        resolution_block_reason: `VOIDED by super_admin: ${reason}`,
        resolution_blocked_at: new Date().toISOString(),
      })
      .eq("id", market_id);

    // Reset option prices for multi/range
    if (market.market_type === "multi" || market.market_type === "range") {
      await adminClient.from("market_options").update({ price: 0.5 }).eq("market_id", market_id);
    }

    // ── 8. Notify all affected users ──
    const allAffected = new Set<string>([...refundedSet, ...clawedSet]);
    if (allAffected.size > 0) {
      const notifs = Array.from(allAffected).map((uid) => ({
        user_id: uid,
        title: "Market Voided & Refunded ⚖️",
        message: `"${market.title}" was voided by an administrator. Your stake has been refunded in full. Reason: ${reason}`,
        type: "refund" as const,
        market_id: market_id,
      }));
      // Insert in chunks to stay under request limits.
      for (let i = 0; i < notifs.length; i += 200) {
        await adminClient.from("notifications").insert(notifs.slice(i, i + 200));
      }
    }

    // ── 9. Audit log ──
    await adminClient.from("audit_logs").insert({
      actor_id: user.id,
      action: "market_voided_and_refunded",
      target_id: market_id,
      target_type: "market",
      details: {
        title: market.title,
        reason,
        previous_status: previousStatus,
        previous_resolved_side: previousResolvedSide,
        previous_winning_option_id: previousWinningOptionId,
        users_refunded: usersRefunded,
        total_refunded: totalRefunded,
        users_clawed_back: usersClawedBack,
        total_clawed_back: totalClawedBack,
        commissions_voided: totalCommissionsVoided,
        creation_fee_refunded: creationFeeRefunded,
        liquidity_refunded: liquidityRefunded,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        users_refunded: usersRefunded,
        total_refunded: totalRefunded,
        users_clawed_back: usersClawedBack,
        total_clawed_back: totalClawedBack,
        commissions_voided: totalCommissionsVoided,
        creation_fee_refunded: creationFeeRefunded,
        liquidity_refunded: liquidityRefunded,
        previous_status: previousStatus,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("void-and-refund error:", err);
    return new Response(JSON.stringify({ error: getErrorMessage(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
