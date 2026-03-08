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

    // Verify caller is admin
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
    const { data: hasRole } = await adminClient.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    const { data: hasSuperRole } = await adminClient.rpc("has_role", {
      _user_id: user.id,
      _role: "super_admin",
    });

    if (!hasRole && !hasSuperRole) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { transaction_id, user_id, amount } = await req.json();

    if (!transaction_id || !user_id || !amount) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the transaction exists and is pending/partial
    const { data: tx, error: txError } = await adminClient
      .from("transactions")
      .select("id, status, amount")
      .eq("id", transaction_id)
      .eq("user_id", user_id)
      .single();

    if (txError || !tx) {
      return new Response(JSON.stringify({ error: "Transaction not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (tx.status === "confirmed") {
      return new Response(JSON.stringify({ error: "Already confirmed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Credit the user's balance
    const { data: balance } = await adminClient
      .from("balances")
      .select("amount")
      .eq("user_id", user_id)
      .eq("currency", "USDT")
      .single();

    if (!balance) {
      return new Response(JSON.stringify({ error: "No balance record found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If partial, only credit the difference (amount - already credited)
    const alreadyCredited = tx.status === "partial" ? Number(tx.amount) : 0;
    const creditAmount = Number(amount) - alreadyCredited;

    if (creditAmount > 0) {
      await adminClient
        .from("balances")
        .update({
          amount: Number(balance.amount) + creditAmount,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user_id)
        .eq("currency", "USDT");
    }

    // Update transaction
    await adminClient
      .from("transactions")
      .update({ status: "confirmed", amount: Number(amount) })
      .eq("id", transaction_id);

    // Notify user
    await adminClient.from("notifications").insert({
      user_id,
      title: "Deposit Confirmed ✅",
      message: `Your deposit of $${Number(amount).toFixed(2)} has been manually confirmed.`,
      type: "deposit",
    });

    // Audit log
    await adminClient.from("audit_logs").insert({
      actor_id: user.id,
      action: "manual_deposit_confirm",
      target_type: "transaction",
      target_id: transaction_id,
      details: { amount, user_id, previous_status: tx.status, credit_amount: creditAmount },
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("confirm-deposit-admin error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
