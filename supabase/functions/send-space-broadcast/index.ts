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

    for (let i = 0; i < notifications.length; i += BATCH_SIZE) {
      const batch = notifications.slice(i, i + BATCH_SIZE);
      const { error: insertError } = await supabase
        .from("notifications")
        .insert(batch);

      if (insertError) {
        console.error(`Batch ${i} insert error:`, insertError);
      }
    }

    // Update broadcast status to sent
    await supabase
      .from("space_broadcasts")
      .update({ status: "sent" })
      .eq("id", broadcast_id);

    console.log(`Space broadcast sent to ${users.length} users for space ${space_id}`);

    return new Response(
      JSON.stringify({ success: true, recipients: users.length }),
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
