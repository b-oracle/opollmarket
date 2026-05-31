import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyInternalOrAdmin } from "../_shared/internalAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { broadcast_id, space_id } = await req.json();

    if (!broadcast_id || !space_id) {
      return new Response(JSON.stringify({ error: "broadcast_id and space_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Auth: allow internal secret, admin JWT, the broadcast creator, or the space host.
    const auth = await verifyInternalOrAdmin(req, {
      functionName: "send-space-broadcast",
      corsHeaders,
      allowUser: async (userId) => {
        const [{ data: bcast }, { data: spaceRow }] = await Promise.all([
          supabase.from("space_broadcasts").select("user_id").eq("id", broadcast_id).maybeSingle(),
          supabase.from("spaces").select("host_id").eq("id", space_id).maybeSingle(),
        ]);
        return (!!bcast && bcast.user_id === userId) ||
               (!!spaceRow && spaceRow.host_id === userId);
      },
    });
    if (!auth.ok) return auth.response!;

    // Idempotency guard.
    const { data: bcastRow } = await supabase
      .from("space_broadcasts")
      .select("status")
      .eq("id", broadcast_id)
      .maybeSingle();
    if (bcastRow?.status === "sent") {
      return new Response(JSON.stringify({ skipped: true, reason: "already_sent" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get space title
    const { data: space } = await supabase
      .from("spaces")
      .select("title, status")
      .eq("id", space_id)
      .single();

    const spaceTitle = space?.title || "a space";
    const isLive = space?.status === "live";

    // Get all user IDs from profiles
    const { data: users, error: usersError } = await supabase
      .from("profiles")
      .select("id");

    if (usersError || !users || users.length === 0) {
      console.error("Failed to fetch users:", usersError);
      return new Response(JSON.stringify({ error: "No users found" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Batch insert notifications for all users
    const BATCH_SIZE = 500;
    // NOTE: notifications.market_id has a FK to markets; spaces are NOT markets,
    // so we must omit market_id here. Deep-link routing uses the type field.
    const notifications = users.map((u) => ({
      user_id: u.id,
      title: isLive ? "🎙️ Space is Live!" : "📢 Space Alert",
      message: isLive
        ? `Join now: "${spaceTitle}"`
        : `Check out this upcoming space: "${spaceTitle}"`,
      type: "broadcast",
    }));

    let delivered = 0;
    let lastError: unknown = null;
    for (let i = 0; i < notifications.length; i += BATCH_SIZE) {
      const batch = notifications.slice(i, i + BATCH_SIZE);
      const { error: insertError } = await supabase
        .from("notifications")
        .insert(batch);

      if (insertError) {
        lastError = insertError;
        console.error(`Batch ${i} insert error:`, insertError);
      } else {
        delivered += batch.length;
      }
    }

    // If nothing was delivered, refund the user and mark broadcast as failed.
    if (delivered === 0) {
      console.error(
        `Broadcast ${broadcast_id} delivered 0 notifications — refunding.`,
        lastError,
      );

      const { data: bc } = await supabase
        .from("space_broadcasts")
        .select("user_id, amount, bonus_amount, status")
        .eq("id", broadcast_id)
        .maybeSingle();

      if (bc && bc.status !== "refunded") {
        const amount = Number(bc.amount) || 0;
        const bonusAmount = Number(bc.bonus_amount) || 0;
        const mainRefund = Math.max(0, amount - bonusAmount);

        const { error: refundErr } = await supabase.rpc(
          "adjust_balance_logged",
          {
            _user_id: bc.user_id,
            _delta: mainRefund,
            _bonus_delta: bonusAmount,
            _insurance_delta: 0,
            _correlation_id: `space_broadcast_refund:${broadcast_id}`,
            _source: "space_broadcast_refund",
            _reason: "Broadcast delivered 0 notifications — automatic refund",
            _actor_id: null,
          },
        );

        if (refundErr) {
          console.error("Refund RPC failed:", refundErr);
          await supabase
            .from("space_broadcasts")
            .update({ status: "failed" })
            .eq("id", broadcast_id);
          return new Response(
            JSON.stringify({
              error: "Broadcast failed and refund could not be processed automatically. Support has been notified.",
            }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        await supabase
          .from("space_broadcasts")
          .update({ status: "refunded" })
          .eq("id", broadcast_id);

        // Notify the broadcast owner
        await supabase.from("notifications").insert({
          user_id: bc.user_id,
          title: "Broadcast refunded",
          message: `Your space broadcast couldn't be delivered. $${amount.toFixed(2)} has been refunded to your balance.`,
          type: "system",
        });
      }

      return new Response(
        JSON.stringify({ refunded: true, recipients: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Update broadcast status to sent
    await supabase
      .from("space_broadcasts")
      .update({ status: "sent" })
      .eq("id", broadcast_id);

    console.log(
      `Space broadcast ${broadcast_id} delivered to ${delivered}/${users.length} users for space ${space_id}`,
    );

    return new Response(
      JSON.stringify({ success: true, recipients: delivered, attempted: users.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("send-space-broadcast error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
