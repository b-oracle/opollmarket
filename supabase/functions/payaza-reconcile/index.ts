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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Auth
    const token = authHeader.replace("Bearer ", "");
    let userId: string | null = null;
    try {
      const { data: cd } = await (userClient.auth as any).getClaims(token);
      if (cd?.claims?.sub) userId = cd.claims.sub;
    } catch {}
    if (!userId) {
      const { data: { user }, error } = await userClient.auth.getUser();
      if (error || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
      userId = user.id;
    }

    const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: isAdmin } = await adminClient.rpc("has_role", { _user_id: userId, _role: "admin" });
    const { data: isSuperAdmin } = await adminClient.rpc("has_role", { _user_id: userId, _role: "super_admin" });
    if (!isAdmin && !isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    const body = await req.json().catch(() => ({}));
    const { action } = body; // "audit" or "fix_unconfirmed"

    // ─── Fetch all Payaza deposits ───
    const { data: payazaDeposits } = await adminClient
      .from("transactions")
      .select("id, user_id, amount, status, nowpayments_payment_id, payment_provider, created_at")
      .eq("type", "deposit")
      .eq("payment_provider", "payaza")
      .order("created_at");

    // ─── Fetch all Payaza withdrawals ───
    const { data: payazaWithdrawals } = await adminClient
      .from("transactions")
      .select("id, user_id, amount, status, nowpayments_payment_id, payment_provider, created_at")
      .eq("type", "withdrawal")
      .eq("payment_provider", "payaza")
      .order("created_at");

    // ─── Fetch all withdrawal requests with NGN crypto_currency ───
    const { data: withdrawalRequests } = await adminClient
      .from("withdrawal_requests")
      .select("id, user_id, amount, status, wallet_address, crypto_currency, created_at, updated_at")
      .eq("crypto_currency", "NGN")
      .order("created_at");

    const deposits = payazaDeposits || [];
    const withdrawals = payazaWithdrawals || [];
    const wdRequests = withdrawalRequests || [];

    // ─── Deposit breakdown ───
    const confirmedDeposits = deposits.filter(d => d.status === "confirmed");
    const pendingDeposits = deposits.filter(d => d.status === "pending");
    const expiredDeposits = deposits.filter(d => d.status === "expired");
    const failedDeposits = deposits.filter(d => d.status === "failed");
    const partialDeposits = deposits.filter(d => d.status === "partial");

    const totalConfirmedDepositsUSD = confirmedDeposits.reduce((s, d) => s + Number(d.amount), 0);
    const totalPendingDepositsUSD = pendingDeposits.reduce((s, d) => s + Number(d.amount), 0);
    const totalPartialDepositsUSD = partialDeposits.reduce((s, d) => s + Number(d.amount), 0);

    // ─── Withdrawal breakdown ───
    const confirmedWithdrawals = withdrawals.filter(w => w.status === "confirmed");
    const pendingWithdrawals = withdrawals.filter(w => w.status === "pending");

    const totalConfirmedWithdrawalsUSD = confirmedWithdrawals.reduce((s, w) => s + Number(w.amount), 0);
    const totalPendingWithdrawalsUSD = pendingWithdrawals.reduce((s, w) => s + Number(w.amount), 0);

    // ─── Withdrawal requests breakdown ───
    const completedWdRequests = wdRequests.filter(w => w.status === "completed");
    const pendingWdRequests = wdRequests.filter(w => w.status === "pending");
    const rejectedWdRequests = wdRequests.filter(w => w.status === "rejected");

    // ─── Cross-reference: withdrawal requests vs transactions ───
    // Find withdrawal requests that are "completed" but have no matching confirmed transaction
    const wdRequestMismatches: Array<{
      request_id: string;
      user_id: string;
      amount: number;
      request_status: string;
      wallet_address: string;
      created_at: string;
      issue: string;
    }> = [];

    for (const wr of wdRequests) {
      if (wr.status === "completed") {
        // Check if there's a matching confirmed withdrawal transaction
        const hasMatch = withdrawals.some(w =>
          w.user_id === wr.user_id &&
          w.status === "confirmed" &&
          Math.abs(Number(w.amount) - Number(wr.amount)) < 0.01
        );
        if (!hasMatch) {
          wdRequestMismatches.push({
            request_id: wr.id,
            user_id: wr.user_id,
            amount: Number(wr.amount),
            request_status: wr.status,
            wallet_address: wr.wallet_address,
            created_at: wr.created_at,
            issue: "Completed request but no matching confirmed transaction",
          });
        }
      }
      if (wr.status === "pending") {
        // Check if there's a matching pending withdrawal transaction
        const hasMatch = withdrawals.some(w =>
          w.user_id === wr.user_id &&
          w.status === "pending" &&
          Math.abs(Number(w.amount) - Number(wr.amount)) < 0.01
        );
        if (!hasMatch) {
          wdRequestMismatches.push({
            request_id: wr.id,
            user_id: wr.user_id,
            amount: Number(wr.amount),
            request_status: wr.status,
            wallet_address: wr.wallet_address,
            created_at: wr.created_at,
            issue: "Pending request but no matching transaction",
          });
        }
      }
    }

    // ─── Balance check: fetch all user balances who have fiat transactions ───
    const userIds = [...new Set([
      ...deposits.map(d => d.user_id),
      ...withdrawals.map(w => w.user_id),
    ])];

    const { data: balances } = await adminClient
      .from("balances")
      .select("user_id, amount")
      .in("user_id", userIds.length > 0 ? userIds : ["__none__"])
      .eq("currency", "USDT");

    const balanceMap = new Map<string, number>();
    for (const b of (balances || [])) {
      balanceMap.set(b.user_id, Number(b.amount));
    }

    // Per-user fiat flow analysis
    const userFlows: Array<{
      user_id: string;
      fiat_deposits_confirmed: number;
      fiat_deposits_count: number;
      fiat_withdrawals_confirmed: number;
      fiat_withdrawals_count: number;
      net_fiat_flow: number;
      current_balance: number;
    }> = [];

    const userFlowMap = new Map<string, {
      dep_confirmed: number;
      dep_count: number;
      wd_confirmed: number;
      wd_count: number;
    }>();

    for (const d of confirmedDeposits) {
      const existing = userFlowMap.get(d.user_id) || { dep_confirmed: 0, dep_count: 0, wd_confirmed: 0, wd_count: 0 };
      existing.dep_confirmed += Number(d.amount);
      existing.dep_count++;
      userFlowMap.set(d.user_id, existing);
    }

    for (const w of confirmedWithdrawals) {
      const existing = userFlowMap.get(w.user_id) || { dep_confirmed: 0, dep_count: 0, wd_confirmed: 0, wd_count: 0 };
      existing.wd_confirmed += Number(w.amount);
      existing.wd_count++;
      userFlowMap.set(w.user_id, existing);
    }

    for (const [uid, flow] of userFlowMap) {
      userFlows.push({
        user_id: uid,
        fiat_deposits_confirmed: Math.round(flow.dep_confirmed * 100) / 100,
        fiat_deposits_count: flow.dep_count,
        fiat_withdrawals_confirmed: Math.round(flow.wd_confirmed * 100) / 100,
        fiat_withdrawals_count: flow.wd_count,
        net_fiat_flow: Math.round((flow.dep_confirmed - flow.wd_confirmed) * 100) / 100,
        current_balance: balanceMap.get(uid) ?? 0,
      });
    }

    // Sort by net flow descending
    userFlows.sort((a, b) => b.net_fiat_flow - a.net_fiat_flow);

    // ─── Stale pending deposits (> 2 hours old) ───
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const stalePending = pendingDeposits.filter(d => d.created_at < twoHoursAgo);

    // ─── Deposits without reference IDs ───
    const noRefDeposits = confirmedDeposits.filter(d => !d.nowpayments_payment_id);

    const summary = {
      total_fiat_transactions: deposits.length + withdrawals.length,
      // Deposits
      total_deposits: deposits.length,
      confirmed_deposits: confirmedDeposits.length,
      pending_deposits: pendingDeposits.length,
      expired_deposits: expiredDeposits.length,
      failed_deposits: failedDeposits.length,
      partial_deposits: partialDeposits.length,
      total_confirmed_deposits_usd: Math.round(totalConfirmedDepositsUSD * 100) / 100,
      total_pending_deposits_usd: Math.round(totalPendingDepositsUSD * 100) / 100,
      total_partial_deposits_usd: Math.round(totalPartialDepositsUSD * 100) / 100,
      // Withdrawals
      total_withdrawals: withdrawals.length,
      confirmed_withdrawals: confirmedWithdrawals.length,
      pending_withdrawals: pendingWithdrawals.length,
      total_confirmed_withdrawals_usd: Math.round(totalConfirmedWithdrawalsUSD * 100) / 100,
      total_pending_withdrawals_usd: Math.round(totalPendingWithdrawalsUSD * 100) / 100,
      // Withdrawal requests
      total_wd_requests: wdRequests.length,
      completed_wd_requests: completedWdRequests.length,
      pending_wd_requests: pendingWdRequests.length,
      rejected_wd_requests: rejectedWdRequests.length,
      // Anomalies
      wd_request_mismatches: wdRequestMismatches.length,
      stale_pending_count: stalePending.length,
      no_ref_confirmed_count: noRefDeposits.length,
      // Net flow
      net_fiat_flow: Math.round((totalConfirmedDepositsUSD - totalConfirmedWithdrawalsUSD) * 100) / 100,
      unique_fiat_users: userIds.length,
    };

    // ─── Handle fix_unconfirmed: expire stale pending deposits ───
    if (action === "fix_unconfirmed") {
      const fixedIds: string[] = [];
      for (const dep of stalePending) {
        await adminClient
          .from("transactions")
          .update({ status: "expired" })
          .eq("id", dep.id);
        fixedIds.push(dep.id);
      }

      // Also log
      if (fixedIds.length > 0) {
        await adminClient.from("audit_logs").insert({
          actor_id: userId!,
          action: "payaza_expire_stale_deposits",
          target_type: "transaction",
          details: { expired_count: fixedIds.length, tx_ids: fixedIds.slice(0, 20) },
        });
      }

      return new Response(JSON.stringify({
        action: "fix_unconfirmed",
        expired_count: fixedIds.length,
        message: fixedIds.length > 0
          ? `Expired ${fixedIds.length} stale pending deposits`
          : "No stale pending deposits found",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      summary,
      user_flows: userFlows.slice(0, 50),
      anomalies: {
        wd_request_mismatches: wdRequestMismatches,
        stale_pending: stalePending.map(d => ({
          tx_id: d.id,
          user_id: d.user_id,
          amount: Number(d.amount),
          reference: d.nowpayments_payment_id,
          created_at: d.created_at,
        })),
        no_ref_confirmed: noRefDeposits.map(d => ({
          tx_id: d.id,
          user_id: d.user_id,
          amount: Number(d.amount),
          created_at: d.created_at,
        })),
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("payaza-reconcile error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: corsHeaders,
    });
  }
});
