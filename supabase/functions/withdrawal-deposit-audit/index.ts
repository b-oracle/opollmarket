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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch all confirmed deposits (exclude partial)
    const deposits = new Map<string, number>();
    let from = 0;
    const batchSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from("transactions")
        .select("user_id, amount")
        .eq("type", "deposit")
        .eq("status", "confirmed")
        .range(from, from + batchSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const d of data) {
        deposits.set(d.user_id, (deposits.get(d.user_id) || 0) + Number(d.amount));
      }
      if (data.length < batchSize) break;
      from += batchSize;
    }

    // Fetch all confirmed withdrawals
    const withdrawals = new Map<string, number>();
    from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("transactions")
        .select("user_id, amount")
        .eq("type", "withdrawal")
        .eq("status", "confirmed")
        .range(from, from + batchSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const w of data) {
        withdrawals.set(w.user_id, (withdrawals.get(w.user_id) || 0) + Number(w.amount));
      }
      if (data.length < batchSize) break;
      from += batchSize;
    }

    // Find users whose withdrawals exceed confirmed deposits
    const flagged: Array<{
      user_id: string;
      total_deposits: number;
      total_withdrawals: number;
      excess: number;
    }> = [];

    for (const [userId, totalWithdrawals] of withdrawals) {
      const totalDeposits = deposits.get(userId) || 0;
      if (totalWithdrawals > totalDeposits) {
        flagged.push({
          user_id: userId,
          total_deposits: Math.round(totalDeposits * 100) / 100,
          total_withdrawals: Math.round(totalWithdrawals * 100) / 100,
          excess: Math.round((totalWithdrawals - totalDeposits) * 100) / 100,
        });
      }
    }

    flagged.sort((a, b) => b.excess - a.excess);

    // Log to audit
    if (flagged.length > 0) {
      const { data: adminRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "super_admin"])
        .limit(1);

      await supabase.from("audit_logs").insert({
        actor_id: adminRoles?.[0]?.user_id || "00000000-0000-0000-0000-000000000000",
        action: "withdrawal_deposit_audit",
        target_type: "system",
        details: {
          flagged_count: flagged.length,
          top_flagged: flagged.slice(0, 10),
          ran_at: new Date().toISOString(),
        },
      });
    }

    return new Response(JSON.stringify({
      message: flagged.length > 0
        ? `Found ${flagged.length} users with withdrawals exceeding confirmed deposits`
        : "No discrepancies found",
      flagged_count: flagged.length,
      flagged: flagged.slice(0, 50),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("withdrawal-deposit-audit error:", err);
    return new Response(JSON.stringify({ error: (getErrorMessage(err)) || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
