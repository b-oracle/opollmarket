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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get admin user for balance operations
    const { data: adminRole } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin")
      .limit(1)
      .single();

    if (!adminRole) {
      return new Response(JSON.stringify({ error: "No admin found" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
          // BC400: deduct from admin balance and track in bc400_pool_balance
          await supabase.rpc("adjust_balance", { _user_id: adminRole.user_id, _delta: -pc.amount, _bonus_delta: 0, _insurance_delta: 0 });

          const { data: cs } = await supabase
            .from("commission_settings")
            .select("bc400_pool_balance, id")
            .limit(1)
            .single();
          if (cs) {
            await supabase
              .from("commission_settings")
              .update({ bc400_pool_balance: Number((cs as any).bc400_pool_balance || 0) + pc.amount } as any)
              .eq("id", cs.id);
          }
        } else if (pc.amount >= 0.01) {
          // Creator or referral — transfer from admin to recipient (skip sub-cent amounts)
          await supabase.rpc("adjust_balance", { _user_id: adminRole.user_id, _delta: -pc.amount });
          await supabase.rpc("adjust_balance", { _user_id: pc.user_id, _delta: pc.amount });

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
