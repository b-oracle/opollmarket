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

      // Get all users who set reminders
      const { data: reminders } = await supabase
        .from("space_reminders")
        .select("user_id")
        .eq("space_id", space.id);

      if (reminders && reminders.length > 0) {
        // Send notifications to all reminder users
        const notifications = reminders.map((r: any) => ({
          user_id: r.user_id,
          title: "Space is Live! 🎙️",
          message: `"${space.title}" is now live! Join the conversation.`,
          type: "info",
        }));

        await supabase.from("notifications").insert(notifications);
      }

      // Also notify the host
      await supabase.from("notifications").insert({
        user_id: space.host_id,
        title: "Your Scheduled Space is Live! 🎙️",
        message: `Your space "${space.title}" is now live. Join to start hosting!`,
        type: "info",
      });
    }

    return new Response(
      JSON.stringify({ message: `Processed ${dueSpaces.length} scheduled spaces` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
