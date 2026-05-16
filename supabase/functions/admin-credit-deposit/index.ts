import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildInsert, callRpc, RpcContractError } from "../_shared/rpcContracts.ts";
import { adjustBalanceLogged } from "../_shared/balanceLogger.ts";

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

    // Restrict to admin/super_admin. `support` is explicitly excluded —
    // direct balance crediting is not a support function.
    const [{ data: isAdmin }, { data: isSuperAdmin }] = await Promise.all([
      adminClient.rpc("has_role", { _user_id: user.id, _role: "admin" }),
      adminClient.rpc("has_role", { _user_id: user.id, _role: "super_admin" }),
    ]);
    if (!isAdmin && !isSuperAdmin) return json({ error: "Forbidden" }, 403);

    // Per-request and 24h caps, scaled by privilege level.
    const PER_REQUEST_CAP = isSuperAdmin ? 100_000 : 10_000;
    const DAILY_CAP = isSuperAdmin ? 500_000 : 50_000;

    // Parse & validate input
    const body = await req.json();
    const targetUserId: string | undefined = body.user_id;
    const amount: number | undefined = body.amount;
    const description: string | undefined = body.description;
    const idempotencyKey: string | undefined =
      body.idempotency_key || req.headers.get("Idempotency-Key") || undefined;

    if (!targetUserId || typeof targetUserId !== "string") {
      return json({ error: "user_id is required" }, 400);
    }
    if (
      !idempotencyKey ||
      typeof idempotencyKey !== "string" ||
      idempotencyKey.length < 8 ||
      idempotencyKey.length > 200
    ) {
      return json({
        error:
          "idempotency_key is required (8-200 chars); supply via body.idempotency_key or Idempotency-Key header",
      }, 400);
    }
    if (!amount || typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return json({ error: "amount must be a positive number" }, 400);
    }
    if (amount > PER_REQUEST_CAP) {
      return json({
        error: `Amount exceeds per-request cap ($${PER_REQUEST_CAP.toLocaleString()}). Ask a super_admin for larger credits.`,
      }, 400);
    }
    if (!description || typeof description !== "string" || description.trim().length < 5) {
      return json({ error: "description is required (min 5 chars) for audit trail" }, 400);
    }

    // 24h rolling cap per actor — sum prior admin_credit_deposit audit entries.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentLogs } = await adminClient
      .from("audit_logs")
      .select("details")
      .eq("actor_id", user.id)
      .eq("action", "admin_credit_deposit")
      .gte("created_at", since);
    const used24h = (recentLogs || []).reduce(
      (sum, row: any) => sum + (Number(row?.details?.amount) || 0),
      0,
    );
    if (used24h + amount > DAILY_CAP) {
      return json({
        error: `24h credit cap exceeded: used $${used24h.toLocaleString()} of $${DAILY_CAP.toLocaleString()}. Requested $${amount.toLocaleString()} would exceed cap.`,
      }, 429);
    }

    // Per-TARGET 24h cap (defense-in-depth: prevents a single user from being
    // over-credited even if multiple admins act independently or one admin is
    // compromised). Enforced via SECURITY DEFINER RPC so the cap can't be
    // bypassed from any other code path.
    {
      const { data: targetCap } = await adminClient.rpc(
        "check_admin_credit_target_cap",
        { _target_id: targetUserId, _amount: amount },
      );
      if (targetCap && (targetCap as any).allowed === false) {
        return json({
          error: (targetCap as any).reason ?? "Per-target credit cap exceeded",
          used: (targetCap as any).used,
          cap: (targetCap as any).cap,
        }, 429);
      }
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

    // Idempotency reservation — atomic INSERT on (action, idempotency_key) PK.
    // If the key already exists, return the prior response and DO NOT credit again.
    const requestHash = `${targetUserId}:${amount}`;
    const { error: idemErr } = await adminClient
      .from("admin_action_idempotency")
      .insert({
        action: "admin_credit_deposit",
        idempotency_key: idempotencyKey,
        actor_id: user.id,
        target_id: targetUserId,
        request_hash: requestHash,
      });

    if (idemErr) {
      // Duplicate key — replay. Look up the prior record and return its response.
      const { data: existing } = await adminClient
        .from("admin_action_idempotency")
        .select("response, request_hash, actor_id")
        .eq("action", "admin_credit_deposit")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      if (!existing) {
        // Insert failed for a non-duplicate reason
        console.error("Idempotency insert failed:", idemErr);
        return json({ error: "Idempotency check failed" }, 500);
      }
      // Reject if the same key is reused with different parameters (collision/abuse).
      if (existing.request_hash && existing.request_hash !== requestHash) {
        return json({
          error: "idempotency_key reused with different parameters",
        }, 409);
      }
      if (existing.response) {
        return json({ ...(existing.response as Record<string, unknown>), replayed: true });
      }
      // Reservation exists but no response cached yet — a concurrent request is in-flight.
      return json({ error: "Duplicate request in progress", replayed: true }, 409);
    }

    // Credit the user's main balance (audited via balanceLogger)
    const correlationId = `admin-credit:${user.id}:${idempotencyKey}`;
    const balResult = await adjustBalanceLogged(adminClient, {
      userId: targetUserId,
      delta: amount,
      source: "admin-credit-deposit",
      reason: description,
      correlationId,
      actorId: user.id,
    });
    if (!balResult.success) {
      console.error("Failed to credit balance:", balResult.error);
      // Release the idempotency reservation so the admin can retry safely.
      await adminClient
        .from("admin_action_idempotency")
        .delete()
        .eq("action", "admin_credit_deposit")
        .eq("idempotency_key", idempotencyKey);
      return json({ error: "Balance credit failed", correlation_id: balResult.correlation_id }, 500);
    }

    // Create a confirmed deposit transaction for the audit trail
    const txDescription = description
      ? `Admin credit: ${description}`
      : "Admin direct credit deposit";

    const { data: tx, error: txError } = await adminClient
      .from("transactions")
      .insert(
        buildInsert("transactions", {
          user_id: targetUserId,
          type: "deposit",
          amount,
          status: "confirmed",
          payment_provider: "admin_credit",
          description: txDescription,
        }),
      )
      .select("id")
      .single();

    if (txError) {
      console.error("Failed to create transaction record:", txError);
      // Balance was already credited — log but don't fail
    }

    // Notify the user
    await adminClient.from("notifications").insert(
      buildInsert("notifications", {
        user_id: targetUserId,
        title: "Deposit Credited ✅",
        message: `$${amount.toFixed(2)} has been credited to your account.${description ? ` (${description})` : ""}`,
        type: "deposit",
      }),
    );

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
    await adminClient.from("audit_logs").insert(
      buildInsert("audit_logs", {
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
      }),
    );

    console.log(
      `Admin ${user.id} credited $${amount.toFixed(2)} to user ${targetUserId} (${profile.display_name})`,
    );

    const responsePayload = {
      success: true,
      transaction_id: tx?.id || null,
      credited_amount: amount,
      user_id: targetUserId,
      correlation_id: correlationId,
      idempotency_key: idempotencyKey,
    };

    // Cache the response on the idempotency row so replays return the same result.
    await adminClient
      .from("admin_action_idempotency")
      .update({ response: responsePayload })
      .eq("action", "admin_credit_deposit")
      .eq("idempotency_key", idempotencyKey);

    return json(responsePayload);
  } catch (err) {
    if (err instanceof RpcContractError) {
      console.error("admin-credit-deposit contract error:", err.message);
      return json({ error: `Validation failed: ${err.message}` }, 400);
    }
    console.error("admin-credit-deposit error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
