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

    // Verify the transaction exists and is pending/partial/wrong_asset
    const { data: tx, error: txError } = await adminClient
      .from("transactions")
      .select("id, status, amount, gross_amount_usd, net_amount_usd")
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

    // Cap the credit at the actual received amount (gross), NOT the originally requested invoice.
    // This allows admin to credit overpayments / wrong-asset deposits at their true received value.
    const grossReceived = Number((tx as any).gross_amount_usd) || 0;
    const originalAmount = Number(tx.amount);
    const maxCredit = grossReceived > 0 ? grossReceived : originalAmount;
    if (Number(amount) > maxCredit) {
      return new Response(JSON.stringify({ error: `Amount $${Number(amount).toFixed(2)} exceeds received amount $${maxCredit.toFixed(2)}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Credit the user's balance atomically
    // Partial deposits were NOT credited by the webhook, so credit the full approved amount
    const creditAmount = Number(amount);

    if (creditAmount > 0) {
      const { error: balError } = await adminClient.rpc("adjust_balance", {
        _user_id: user_id,
        _delta: creditAmount,
        _bonus_delta: 0,
        _insurance_delta: 0,
      });
      if (balError) {
        console.error("CRITICAL: Failed to credit balance:", balError);
        return new Response(JSON.stringify({ error: "Balance credit failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Update transaction
    await adminClient
      .from("transactions")
      .update({ status: "confirmed", amount: Number(amount), net_amount_usd: Number(amount) })
      .eq("id", transaction_id);

    // Notify user
    await adminClient.from("notifications").insert({
      user_id,
      title: "Deposit Confirmed ✅",
      message: `Your deposit of $${Number(amount).toFixed(2)} has been manually confirmed.`,
      type: "deposit",
    });

    // Welcome bonus check
    try {
      const { data: toggle } = await adminClient.from("feature_toggles").select("enabled").eq("feature_key", "welcome_bonus").maybeSingle();
      if (toggle?.enabled) {
        // Idempotency: check if already credited
        const { count: existingBonus } = await adminClient.from("transactions").select("id", { count: "exact", head: true }).eq("user_id", user_id).eq("type", "welcome_bonus").eq("status", "confirmed");
        if ((existingBonus ?? 0) === 0) {
          const { data: profile } = await adminClient.from("profiles").select("kyc_status").eq("id", user_id).single();
          if (profile?.kyc_status === "approved") {
            const { count } = await adminClient.from("transactions").select("id", { count: "exact", head: true }).eq("user_id", user_id).eq("type", "deposit").eq("status", "confirmed");
            if ((count ?? 0) <= 1) {
              const { data: settings } = await adminClient.from("commission_settings").select("welcome_bonus_percent, welcome_bonus_cap").limit(1).single();
              if (settings) {
                const percent = Number(settings.welcome_bonus_percent) || 0;
                const cap = Number(settings.welcome_bonus_cap) || 0;
                if (percent > 0 && cap > 0) {
                  const bonus = Math.min(Number(amount) * percent / 100, cap);
                  if (bonus > 0) {
                    await adminClient.rpc("adjust_balance", { _user_id: user_id, _delta: 0, _bonus_delta: bonus, _insurance_delta: 0 });
                    await adminClient.from("transactions").insert({ user_id, type: "welcome_bonus", amount: bonus, status: "confirmed" });
                    await adminClient.from("notifications").insert({ user_id, title: "Welcome Bonus! 🎁", message: `You received a $${bonus.toFixed(2)} welcome bonus on your first deposit!`, type: "deposit" });
                    console.log(`Welcome bonus: $${bonus.toFixed(2)} credited to user ${user_id}`);
                  }
                }
              }
            }
          }
        }
      }
    } catch (wbErr) {
      console.error("Welcome bonus error:", wbErr);
    }

    // Settle any outstanding debts
    try {
      const { data: debtResult } = await adminClient.rpc("settle_user_debts", { _user_id: user_id });
      if (debtResult && Number(debtResult.amount) > 0) {
        console.log(`Settled $${debtResult.amount} in debts for user ${user_id}`);
        await adminClient.from("notifications").insert({
          user_id,
          title: "Outstanding Balance Settled 📋",
          message: `$${Number(debtResult.amount).toFixed(2)} was deducted from your deposit to cover outstanding market liquidity fees.`,
          type: "info",
        });
      }
    } catch (debtErr) {
      console.error("Failed to settle debts:", debtErr);
    }

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
