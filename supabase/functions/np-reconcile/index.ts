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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check admin role
    const { data: isAdmin } = await adminClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
    const { data: isSuperAdmin } = await adminClient.rpc("has_role", { _user_id: user.id, _role: "super_admin" });
    if (!isAdmin && !isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const npApiKey = Deno.env.get("NOWPAYMENTS_API_KEY");
    if (!npApiKey) {
      return new Response(JSON.stringify({ error: "NOWPAYMENTS_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { action } = body; // "audit" or "apply"

    // Get all confirmed/partial deposits with NP payment IDs
    const { data: deposits, error: depError } = await adminClient
      .from("transactions")
      .select("id, user_id, amount, status, nowpayments_payment_id, created_at")
      .eq("type", "deposit")
      .in("status", ["confirmed", "partial"])
      .not("nowpayments_payment_id", "is", null)
      .order("created_at");

    if (depError || !deposits) {
      return new Response(JSON.stringify({ error: "Failed to fetch deposits" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch each payment from NP API
    const results: Array<{
      tx_id: string;
      user_id: string;
      payment_id: string;
      db_credited: number;
      np_outcome_amount: number | null;
      np_actually_paid: number | null;
      np_pay_amount: number | null;
      np_pay_currency: string | null;
      np_price_amount: number | null;
      np_status: string | null;
      excess: number;
      error?: string;
    }> = [];

    for (const dep of deposits) {
      try {
        const npRes = await fetch(`https://api.nowpayments.io/v1/payment/${dep.nowpayments_payment_id}`, {
          headers: { "x-api-key": npApiKey },
        });

        if (!npRes.ok) {
          results.push({
            tx_id: dep.id,
            user_id: dep.user_id,
            payment_id: dep.nowpayments_payment_id!,
            db_credited: Number(dep.amount),
            np_outcome_amount: null,
            np_actually_paid: null,
            np_pay_amount: null,
            np_pay_currency: null,
            np_price_amount: null,
            np_status: null,
            excess: 0,
            error: `NP API returned ${npRes.status}`,
          });
          continue;
        }

        const npData = await npRes.json();
        const outcomeAmount = npData.outcome_amount ? Number(npData.outcome_amount) : null;
        const actuallyPaid = npData.actually_paid ? Number(npData.actually_paid) : null;
        const payAmount = npData.pay_amount ? Number(npData.pay_amount) : null;
        const priceAmount = npData.price_amount ? Number(npData.price_amount) : null;
        const payCurrency = npData.pay_currency || null;

        // The actual USD value NP received (outcome_amount is the real USD value after conversion)
        // Compare what we credited vs what NP says outcome_amount is
        const actualValue = outcomeAmount ?? 0;
        const excess = Number(dep.amount) - actualValue;

        results.push({
          tx_id: dep.id,
          user_id: dep.user_id,
          payment_id: dep.nowpayments_payment_id!,
          db_credited: Number(dep.amount),
          np_outcome_amount: outcomeAmount,
          np_actually_paid: actuallyPaid,
          np_pay_amount: payAmount,
          np_pay_currency: payCurrency,
          np_price_amount: priceAmount,
          np_status: npData.payment_status || null,
          excess: Math.round(excess * 100) / 100,
        });

        // Small delay to avoid NP rate limiting
        await new Promise((r) => setTimeout(r, 200));
      } catch (err) {
        results.push({
          tx_id: dep.id,
          user_id: dep.user_id,
          payment_id: dep.nowpayments_payment_id!,
          db_credited: Number(dep.amount),
          np_outcome_amount: null,
          np_actually_paid: null,
          np_pay_amount: null,
          np_pay_currency: null,
          np_price_amount: null,
          np_status: null,
          excess: 0,
          error: String(err),
        });
      }
    }

    const totalExcess = results.reduce((sum, r) => sum + r.excess, 0);
    const totalCredited = results.reduce((sum, r) => sum + r.db_credited, 0);
    const totalNpOutcome = results.reduce((sum, r) => sum + (r.np_outcome_amount ?? 0), 0);

    // If action is "apply", deduct excess from each affected user
    if (action === "apply") {
      const userExcessMap = new Map<string, number>();
      for (const r of results) {
        if (r.excess > 0.005) {
          userExcessMap.set(r.user_id, (userExcessMap.get(r.user_id) || 0) + r.excess);
        }
      }

      const adjustments: Array<{ user_id: string; deducted: number; new_balance: number }> = [];

      for (const [userId, totalDeduct] of userExcessMap) {
        const { data: balance } = await adminClient
          .from("balances")
          .select("amount")
          .eq("user_id", userId)
          .eq("currency", "USDT")
          .single();

        if (!balance) continue;

        const newBalance = Number(balance.amount) - totalDeduct;

        await adminClient
          .from("balances")
          .update({ amount: newBalance, updated_at: new Date().toISOString() })
          .eq("user_id", userId)
          .eq("currency", "USDT");

        // Also update the transaction amounts to reflect correct values
        for (const r of results) {
          if (r.user_id === userId && r.excess > 0.005 && r.np_outcome_amount !== null) {
            await adminClient
              .from("transactions")
              .update({ amount: r.np_outcome_amount })
              .eq("id", r.tx_id);
          }
        }

        // Notify user
        await adminClient.from("notifications").insert({
          user_id: userId,
          title: "Balance Adjustment 📊",
          message: `A fee correction of -$${totalDeduct.toFixed(2)} has been applied to your balance for payment processing fees.`,
          type: "info",
        });

        // Audit log
        await adminClient.from("audit_logs").insert({
          actor_id: user.id,
          action: "np_fee_correction",
          target_type: "balance",
          target_id: userId,
          details: { deducted: totalDeduct, new_balance: newBalance, previous_balance: Number(balance.amount) },
        });

        adjustments.push({ user_id: userId, deducted: totalDeduct, new_balance: Math.round(newBalance * 100) / 100 });
      }

      return new Response(JSON.stringify({
        action: "applied",
        adjustments,
        total_deducted: adjustments.reduce((s, a) => s + a.deducted, 0),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default: return audit data
    return new Response(JSON.stringify({
      action: "audit",
      results,
      summary: {
        total_deposits: results.length,
        total_credited: Math.round(totalCredited * 100) / 100,
        total_np_outcome: Math.round(totalNpOutcome * 100) / 100,
        total_excess: Math.round(totalExcess * 100) / 100,
        affected_deposits: results.filter((r) => r.excess > 0.005).length,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("np-reconcile error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
