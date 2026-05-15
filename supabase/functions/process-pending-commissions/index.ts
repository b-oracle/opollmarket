import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Accept either a valid CRON_SECRET header (for scheduled invocations)
    // OR an authenticated admin/super_admin user token (for manual runs).
    const cronSecret = Deno.env.get("CRON_SECRET");
    const incomingCron = req.headers.get("x-cron-secret");
    const cronAuthorized = !!cronSecret && incomingCron === cronSecret;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (!cronAuthorized) {
      const authHeader = req.headers.get("Authorization");
      const baseLog = {
        event: "cron_auth_rejected",
        function: "process-pending-commissions",
        method: req.method,
        url_path: new URL(req.url).pathname,
        ip:
          req.headers.get("cf-connecting-ip") ||
          req.headers.get("x-real-ip") ||
          req.headers.get("x-forwarded-for") ||
          null,
        user_agent: req.headers.get("user-agent") || null,
        has_authorization: !!authHeader,
        has_cron_header: !!incomingCron,
        cron_header_length: incomingCron?.length ?? 0,
        timestamp: new Date().toISOString(),
      };
      if (!authHeader?.startsWith("Bearer ")) {
        console.warn(JSON.stringify({ ...baseLog, reason: "no_cron_secret_no_bearer" }));
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user }, error: userErr } = await userClient.auth.getUser();
      if (userErr || !user) {
        console.warn(JSON.stringify({ ...baseLog, reason: "invalid_user_token" }));
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      const { data: isSuperAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "super_admin" });
      if (!isAdmin && !isSuperAdmin) {
        console.warn(JSON.stringify({ ...baseLog, reason: "user_not_admin", user_id: user.id }));
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Fetch all pending commissions that are due for release
    const { data: pendingCommissions, error: fetchErr } = await supabase
      .from("pending_commissions")
      .select("*")
      .eq("status", "pending")
      .lte("releases_at", new Date().toISOString())
      .limit(500);

    if (fetchErr) {
      console.error("Fetch error:", fetchErr);
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!pendingCommissions || pendingCommissions.length === 0) {
      return new Response(JSON.stringify({ released: 0, cancelled: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let releasedCount = 0;
    let cancelledCount = 0;

    for (const pc of pendingCommissions) {
      try {
        // Check if the market is still valid (not cancelled)
        if (pc.market_id) {
          const { data: market } = await supabase
            .from("markets")
            .select("status")
            .eq("id", pc.market_id)
            .single();

          if (market?.status === "cancelled") {
            // Market was cancelled — void the commission
            await supabase
              .from("pending_commissions")
              .update({ status: "cancelled" })
              .eq("id", pc.id);

            cancelledCount++;
            continue;
          }
        }

        // Release: deduct from admin pool, credit to recipient
        if (pc.type === "bc400") {
          // BC400: deduct from platform pool and track in bc400_pool_balance
          await supabase.rpc("adjust_platform_pool", { _delta: -pc.amount });

          // Atomically increment bc400_pool_balance using raw SQL via RPC
          // Since no dedicated RPC exists, use a single update with increment expression
          const { data: cs } = await supabase
            .from("commission_settings")
            .select("id")
            .limit(1)
            .single();
          if (cs) {
            await supabase.rpc("increment_bc400_pool", { _amount: pc.amount });
          }
        } else if (pc.type === "partner") {
          // Partner revenue share: deduct from platform pool, credit to API key owner
          await supabase.rpc("adjust_platform_pool", { _delta: -pc.amount });

          // Find the API key owner from the market's api_key_id
          if (pc.market_id) {
            const { data: market } = await supabase
              .from("markets")
              .select("api_key_id")
              .eq("id", pc.market_id)
              .single();

            if (market?.api_key_id) {
              // Look up which user owns this API key (partner_name is used for display, but we need a user to credit)
              // For now, record in affiliate_earnings and update status
              const { data: earnings } = await supabase
                .from("affiliate_earnings")
                .select("id")
                .eq("api_key_id", market.api_key_id)
                .eq("status", "pending")
                .limit(50);

              if (earnings) {
                for (const e of earnings) {
                  await supabase
                    .from("affiliate_earnings")
                    .update({ status: "released" })
                    .eq("id", e.id);
                }
              }
            }
          }
        } else if (pc.amount >= 0.01) {
          // Creator or referral — deduct from platform pool, credit to recipient
          await supabase.rpc("adjust_platform_pool", { _delta: -pc.amount });
          await supabase.rpc("adjust_balance", { _user_id: pc.user_id, _delta: pc.amount, _bonus_delta: 0, _insurance_delta: 0 });

          // Insert commission transaction
          await supabase.from("transactions").insert({
            user_id: pc.user_id,
            type: "commission",
            amount: pc.amount,
            market_id: pc.market_id || null,
            side: pc.type === "creator" ? "creator" : "referral",
            status: "confirmed",
          });

          // Notify recipient
          const title = pc.type === "creator"
            ? "Creator Commission Credited! 💰"
            : "Referral Commission Credited! 💰";
          const message = `Your $${pc.amount.toFixed(2)} ${pc.type} commission has been credited to your balance!`;

          await supabase.from("notifications").insert({
            user_id: pc.user_id,
            title,
            message,
            type: pc.type === "referral" ? "referral" : "info",
            market_id: pc.market_id || null,
          });
        }

        // Mark as released
        await supabase
          .from("pending_commissions")
          .update({ status: "released" })
          .eq("id", pc.id);

        releasedCount++;
      } catch (err) {
        console.error(`Failed to process commission ${pc.id}:`, err);
      }
    }

    return new Response(JSON.stringify({ released: releasedCount, cancelled: cancelledCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("process-pending-commissions error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: corsHeaders,
    });
  }
});
