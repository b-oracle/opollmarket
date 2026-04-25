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
    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    const { data: isSuperAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "super_admin" });
    if (!isAdmin && !isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const THRESHOLD = 1.0; // Only flag discrepancies > $1

    // Fetch all balances
    const { data: balances, error: balErr } = await supabase
      .from("balances")
      .select("user_id, amount")
      .eq("currency", "USDT");

    if (balErr) throw balErr;

    const balanceMap = new Map<string, number>();
    for (const b of balances || []) {
      balanceMap.set(b.user_id, Number(b.amount));
    }

    const userIds = Array.from(balanceMap.keys());
    if (userIds.length === 0) {
      return new Response(JSON.stringify({ message: "No users found", discrepancies: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Batch-fetch all confirmed transactions in chunks to avoid 1000-row limit
    const allTx: Array<{ user_id: string; type: string; amount: number }> = [];
    const chunkSize = 500;
    for (let i = 0; i < userIds.length; i += chunkSize) {
      const chunk = userIds.slice(i, i + chunkSize);
      let from = 0;
      const batchSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("transactions")
          .select("user_id, type, amount")
          .in("user_id", chunk)
          .eq("status", "confirmed")
          .range(from, from + batchSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allTx.push(...data.map((t: any) => ({ user_id: t.user_id, type: t.type, amount: Number(t.amount) })));
        if (data.length < batchSize) break;
        from += batchSize;
      }
    }

    // Batch-fetch all quick_bets (won/lost)
    const allQb: Array<{ user_id: string; status: string; amount: number; payout: number }> = [];
    for (let i = 0; i < userIds.length; i += chunkSize) {
      const chunk = userIds.slice(i, i + chunkSize);
      let from = 0;
      const batchSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("quick_bets")
          .select("user_id, status, amount, payout")
          .in("user_id", chunk)
          .in("status", ["won", "lost"])
          .range(from, from + batchSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allQb.push(...data.map((q: any) => ({
          user_id: q.user_id, status: q.status,
          amount: Number(q.amount), payout: Number(q.payout || 0),
        })));
        if (data.length < batchSize) break;
        from += batchSize;
      }
    }

    // Calculate expected balance per user from transactions
    const expectedMap = new Map<string, number>();

    // Credits: deposit, payout, refund, commission, qt_one_sided_bonus, referral_reward
    // Debits: withdrawal, buy, sell, initial_liquidity
    const creditTypes = new Set(["deposit", "payout", "refund", "commission", "qt_one_sided_bonus", "referral_reward"]);
    const debitTypes = new Set(["withdrawal", "buy", "sell", "initial_liquidity"]);

    for (const tx of allTx) {
      const prev = expectedMap.get(tx.user_id) || 0;
      if (creditTypes.has(tx.type)) {
        expectedMap.set(tx.user_id, prev + tx.amount);
      } else if (debitTypes.has(tx.type)) {
        expectedMap.set(tx.user_id, prev - tx.amount);
      }
    }

    // Quick bets PnL: won = payout - amount, lost = -amount
    for (const qb of allQb) {
      const prev = expectedMap.get(qb.user_id) || 0;
      if (qb.status === "won") {
        expectedMap.set(qb.user_id, prev + (qb.payout - qb.amount));
      } else if (qb.status === "lost") {
        expectedMap.set(qb.user_id, prev - qb.amount);
      }
    }

    // Compare expected vs actual
    const discrepancies: Array<{
      user_id: string;
      actual_balance: number;
      expected_balance: number;
      difference: number;
    }> = [];

    for (const [userId, actualBalance] of balanceMap) {
      const expected = expectedMap.get(userId) || 0;
      const diff = Math.round((actualBalance - expected) * 100) / 100;
      if (Math.abs(diff) > THRESHOLD) {
        discrepancies.push({
          user_id: userId,
          actual_balance: Math.round(actualBalance * 100) / 100,
          expected_balance: Math.round(expected * 100) / 100,
          difference: diff,
        });
      }
    }

    // Sort by absolute difference descending
    discrepancies.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));

    // Compare with last audit to avoid duplicate notifications
    const { data: lastAudit } = await supabase
      .from("audit_logs")
      .select("details")
      .eq("action", "balance_reconciliation_alert")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastUserIds = new Set(
      ((lastAudit?.details as any)?.top_discrepancies || []).map((d: any) => d.user_id)
    );
    const lastCount = (lastAudit?.details as any)?.total_discrepancies || 0;

    // Check if anything actually changed
    const currentUserIds = new Set(discrepancies.slice(0, 5).map((d) => d.user_id));
    const hasNewUsers = [...currentUserIds].some((id) => !lastUserIds.has(id));
    const countChanged = discrepancies.length !== lastCount;
    const shouldNotify = hasNewUsers || countChanged || !lastAudit;

    if (discrepancies.length > 0) {
      // Always log to audit
      const { data: adminRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "super_admin"]);

      const adminIds = [...new Set((adminRoles || []).map((r: any) => r.user_id))];

      const topIssues = discrepancies.slice(0, 5);

      await supabase.from("audit_logs").insert({
        actor_id: adminIds[0] || "00000000-0000-0000-0000-000000000000",
        action: "balance_reconciliation_alert",
        target_type: "system",
        details: {
          total_discrepancies: discrepancies.length,
          top_discrepancies: topIssues,
          threshold: THRESHOLD,
          ran_at: new Date().toISOString(),
        },
      });

      // Only send notifications if discrepancies changed
      console.log(`Reconciliation: ${discrepancies.length} discrepancies found (logged to audit)`);

    } else {
      console.log("Reconciliation: no discrepancies found");
    }

    return new Response(JSON.stringify({
      message: discrepancies.length > 0
        ? `Found ${discrepancies.length} discrepancies`
        : "All balances match",
      threshold: THRESHOLD,
      discrepancies_count: discrepancies.length,
      discrepancies: discrepancies.slice(0, 50),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("balance-reconciliation error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
