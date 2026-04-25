import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Find scheduled spaces that are due (within 1 minute window)
    const now = new Date().toISOString();
    const { data: dueSpaces, error } = await supabase
      .from("spaces")
      .select("id, title, host_id, scheduled_at")
      .eq("status", "scheduled")
      .lte("scheduled_at", now);

    if (error) throw error;

    if (!dueSpaces || dueSpaces.length === 0) {
      return new Response(JSON.stringify({ message: "No scheduled spaces due" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    for (const space of dueSpaces) {
      // Update space status to live
      await supabase
        .from("spaces")
        .update({ status: "live", started_at: now })
        .eq("id", space.id);

      // Collect all user IDs to notify (deduped)
      const notifyUserIds = new Set<string>();

      // Get all users who set reminders
      const { data: reminders } = await supabase
        .from("space_reminders")
        .select("user_id")
        .eq("space_id", space.id);

      if (reminders) {
        reminders.forEach((r: any) => notifyUserIds.add(r.user_id));
      }

      // Get all invited users (for private spaces)
      const { data: invites } = await supabase
        .from("space_invites")
        .select("invitee_id")
        .eq("space_id", space.id);

      if (invites) {
        invites.forEach((i: any) => notifyUserIds.add(i.invitee_id));
      }

      // Remove the host from the set (they get a separate notification)
      notifyUserIds.delete(space.host_id);

      if (notifyUserIds.size > 0) {
        const notifications = Array.from(notifyUserIds).map((userId) => ({
          user_id: userId,
          title: "Space is Live! 🎙️",
          message: `"${space.title}" is now live! Join the conversation.`,
          type: "info",
          market_id: space.id,
          actor_id: space.host_id,
        }));

        await supabase.from("notifications").insert(notifications);
      }

      // Also notify the host
      await supabase.from("notifications").insert({
        user_id: space.host_id,
        title: "Your Scheduled Space is Live! 🎙️",
        message: `Your space "${space.title}" is now live. Join to start hosting!`,
        type: "info",
        market_id: space.id,
      });
    }

    return new Response(
      JSON.stringify({ message: `Processed ${dueSpaces.length} scheduled spaces` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: (err instanceof Error ? err.message : String(err)) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
