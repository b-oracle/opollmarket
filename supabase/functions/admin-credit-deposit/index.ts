import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildInsert, callRpc, RpcContractError } from "../_shared/rpcContracts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    // Verify caller identity
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Require admin or super_admin role
    const [{ data: isAdmin }, { data: isSuperAdmin }] = await Promise.all([
      adminClient.rpc("has_role", { _user_id: user.id, _role: "admin" }),
      adminClient.rpc("has_role", { _user_id: user.id, _role: "super_admin" }),
    ]);
    if (!isAdmin && !isSuperAdmin) return json({ error: "Forbidden" }, 403);

    // Parse & validate input
    const body = await req.json();
    const targetUserId: string | undefined = body.user_id;
    const amount: number | undefined = body.amount;
    const description: string | undefined = body.description;

    if (!targetUserId || typeof targetUserId !== "string") {
      return json({ error: "user_id is required" }, 400);
    }
    if (!amount || typeof amount !== "number" || amount <= 0) {
      return json({ error: "amount must be a positive number" }, 400);
    }
    if (amount > 100_000) {
      return json({ error: "Amount exceeds maximum allowed ($100,000)" }, 400);
    }

    // Verify the target user exists
    const { data: profile, error: profileErr } = await adminClient
      .from("profiles")
      .select("id, display_name, email")
      .eq("id", targetUserId)
      .maybeSingle();

    if (profileErr || !profile) {
      return json({ error: "User not found" }, 404);
    }

    // Credit the user's main balance
    const { error: balError } = await adminClient.rpc("adjust_balance", {
      _user_id: targetUserId,
      _delta: amount,
      _bonus_delta: 0,
      _insurance_delta: 0,
    });
    if (balError) {
      console.error("Failed to credit balance:", balError);
      return json({ error: "Balance credit failed" }, 500);
    }

    // Create a confirmed deposit transaction for the audit trail
    const txDescription = description
      ? `Admin credit: ${description}`
      : "Admin direct credit deposit";

    const { data: tx, error: txError } = await adminClient
      .from("transactions")
      .insert({
        user_id: targetUserId,
        type: "deposit",
        amount,
        status: "confirmed",
        payment_provider: "admin_credit",
        description: txDescription,
      })
      .select("id")
      .single();

    if (txError) {
      console.error("Failed to create transaction record:", txError);
      // Balance was already credited — log but don't fail
    }

    // Notify the user
    await adminClient.from("notifications").insert({
      user_id: targetUserId,
      title: "Deposit Credited ✅",
      message: `$${amount.toFixed(2)} has been credited to your account.${description ? ` (${description})` : ""}`,
      type: "deposit",
    });

    // Welcome bonus check (same logic as confirm-deposit-admin)
    try {
      const { data: toggle } = await adminClient
        .from("feature_toggles")
        .select("enabled")
        .eq("feature_key", "welcome_bonus")
        .maybeSingle();

      if (toggle?.enabled) {
        const { count: existingBonus } = await adminClient
          .from("transactions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", targetUserId)
          .eq("type", "welcome_bonus")
          .eq("status", "confirmed");

        if ((existingBonus ?? 0) === 0) {
          const { data: userProfile } = await adminClient
            .from("profiles")
            .select("kyc_status")
            .eq("id", targetUserId)
            .single();

          if (userProfile?.kyc_status === "approved") {
            const { count } = await adminClient
              .from("transactions")
              .select("id", { count: "exact", head: true })
              .eq("user_id", targetUserId)
              .eq("type", "deposit")
              .eq("status", "confirmed");

            if ((count ?? 0) <= 1) {
              const { data: settings } = await adminClient
                .from("commission_settings")
                .select("welcome_bonus_percent, welcome_bonus_cap")
                .limit(1)
                .single();

              if (settings) {
                const percent = Number(settings.welcome_bonus_percent) || 0;
                const cap = Number(settings.welcome_bonus_cap) || 0;
                if (percent > 0 && cap > 0) {
                  const bonus = Math.min((amount * percent) / 100, cap);
                  if (bonus > 0) {
                    await adminClient.rpc("adjust_balance", {
                      _user_id: targetUserId,
                      _delta: 0,
                      _bonus_delta: bonus,
                      _insurance_delta: 0,
                    });
                    await adminClient.from("transactions").insert({
                      user_id: targetUserId,
                      type: "welcome_bonus",
                      amount: bonus,
                      status: "confirmed",
                    });
                    await adminClient.from("notifications").insert({
                      user_id: targetUserId,
                      title: "Welcome Bonus! 🎁",
                      message: `You received a $${bonus.toFixed(2)} welcome bonus on your first deposit!`,
                      type: "deposit",
                    });
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

    // Settle outstanding debts
    try {
      const { data: debtResult } = await adminClient.rpc("settle_user_debts", {
        _user_id: targetUserId,
      });
      if (debtResult && Number(debtResult.amount) > 0) {
        console.log(`Settled $${debtResult.amount} in debts for user ${targetUserId}`);
        await adminClient.from("notifications").insert({
          user_id: targetUserId,
          title: "Outstanding Balance Settled 📋",
          message: `$${Number(debtResult.amount).toFixed(2)} was deducted to cover outstanding fees.`,
          type: "info",
        });
      }
    } catch (debtErr) {
      console.error("Failed to settle debts:", debtErr);
    }

    // Audit log
    await adminClient.from("audit_logs").insert({
      actor_id: user.id,
      action: "admin_credit_deposit",
      target_type: "user",
      target_id: targetUserId,
      details: {
        amount,
        description: txDescription,
        transaction_id: tx?.id || null,
        target_display_name: profile.display_name,
      },
    });

    console.log(
      `Admin ${user.id} credited $${amount.toFixed(2)} to user ${targetUserId} (${profile.display_name})`,
    );

    return json({
      success: true,
      transaction_id: tx?.id || null,
      credited_amount: amount,
      user_id: targetUserId,
    });
  } catch (err) {
    console.error("admin-credit-deposit error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
