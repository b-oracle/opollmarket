import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendNotificationEmail } from "../_shared/notificationEmail.ts";

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
        headers: corsHeaders,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const adminId = user.id;

    // Verify admin role
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: isSuperAdmin } = await adminClient.rpc("has_role", {
      _user_id: adminId,
      _role: "super_admin",
    });

    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Super Admin access required" }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    const { withdrawal_id, action, admin_note, tx_hash } = await req.json();

    if (!withdrawal_id || !["approve", "reject"].includes(action)) {
      return new Response(
        JSON.stringify({ error: "Invalid request" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Atomically claim the withdrawal to prevent double-approve race condition
    const { data: claimResult } = await adminClient.rpc("claim_withdrawal_for_processing", {
      _withdrawal_id: withdrawal_id,
      _action: action,
    });

    if (!claimResult?.success) {
      return new Response(
        JSON.stringify({ error: claimResult?.error || "Withdrawal not found or already processed" }),
        { status: 409, headers: corsHeaders }
      );
    }

    const withdrawal = {
      user_id: claimResult.user_id,
      amount: claimResult.amount,
      wallet_address: claimResult.wallet_address,
      crypto_currency: claimResult.crypto_currency,
    };

    if (action === "approve") {
      await adminClient
        .from("withdrawal_requests")
        .update({
          status: "completed",
          admin_note: admin_note || null,
          tx_hash: tx_hash || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", withdrawal_id);

      // Update the transaction linked to THIS withdrawal_request — no more order/limit guessing.
      await adminClient
        .from("transactions")
        .update({ status: "confirmed", tx_hash: tx_hash || null })
        .eq("withdrawal_request_id", withdrawal_id)
        .eq("type", "withdrawal")
        .eq("status", "pending");

      // Credit withdrawal fee to platform pool now that the payout is approved.
      // (request-withdrawal / request-payaza-withdrawal no longer pre-credit it.)
      try {
        const { data: settings } = await adminClient
          .from("commission_settings")
          .select("withdrawal_fee_percent")
          .limit(1)
          .single();
        const feePct = Math.max(0, Math.min(100, Number(settings?.withdrawal_fee_percent) || 0));
        const feeAmount = feePct > 0 ? (Number(withdrawal.amount) * feePct) / 100 : 0;
        if (feeAmount > 0) {
          await adminClient.rpc("adjust_platform_pool", { _delta: feeAmount });
        }
      } catch (e) {
        console.warn("process-withdrawal: fee credit skipped", e);
      }

      // Notify user
      await adminClient.from("notifications").insert({
        user_id: withdrawal.user_id,
        title: "Withdrawal Approved",
        message: `Your withdrawal of $${Number(withdrawal.amount).toFixed(2)} has been processed.`,
        type: "withdrawal",
      });

      await sendNotificationEmail({
        admin: adminClient as any,
        userId: withdrawal.user_id,
        templateName: "withdrawal-completed",
        prefKey: "email_withdrawal_completed",
        idempotencyKey: `withdrawal-approved-${withdrawal_id}`,
        templateData: { amount: Number(withdrawal.amount), status: "approved" },
      });
    } else {
      // Reject: refund balance atomically (no fee was credited yet, so nothing to reverse).
      await adminClient.rpc("adjust_balance", {
        _user_id: withdrawal.user_id,
        _delta: Number(withdrawal.amount),
        _bonus_delta: 0,
      });

      await adminClient
        .from("withdrawal_requests")
        .update({
          status: "rejected",
          admin_note: admin_note || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", withdrawal_id);

      await adminClient
        .from("transactions")
        .update({ status: "failed" })
        .eq("withdrawal_request_id", withdrawal_id)
        .eq("type", "withdrawal")
        .eq("status", "pending");

      // Notify user
      await adminClient.from("notifications").insert({
        user_id: withdrawal.user_id,
        title: "Withdrawal Rejected",
        message: `Your withdrawal of $${Number(withdrawal.amount).toFixed(2)} was rejected.${admin_note ? " Reason: " + admin_note : ""} Funds have been refunded.`,
        type: "withdrawal",
      });

      await sendNotificationEmail({
        admin: adminClient as any,
        userId: withdrawal.user_id,
        templateName: "withdrawal-completed",
        prefKey: "email_withdrawal_completed",
        idempotencyKey: `withdrawal-rejected-${withdrawal_id}`,
        templateData: { amount: Number(withdrawal.amount), status: "rejected", reason: admin_note || undefined },
      });
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("process-withdrawal error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
