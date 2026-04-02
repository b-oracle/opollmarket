import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

    const INACTIVITY_MINUTES = 30;
    const cutoff = new Date(Date.now() - INACTIVITY_MINUTES * 60 * 1000).toISOString();

    // Find live spaces that started more than 30 minutes ago
    const { data: liveSpaces, error: fetchErr } = await supabase
      .from("spaces")
      .select("id, title, host_id, started_at")
      .eq("status", "live")
      .lt("started_at", cutoff);

    if (fetchErr) throw fetchErr;

    if (!liveSpaces || liveSpaces.length === 0) {
      return new Response(
        JSON.stringify({ ended: 0, message: "No stale spaces found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let ended = 0;

    for (const space of liveSpaces) {
      // Check if host has any recent messages in the last 30 minutes
      const { count: recentHostMessages } = await supabase
        .from("space_messages")
        .select("id", { count: "exact", head: true })
        .eq("space_id", space.id)
        .eq("user_id", space.host_id)
        .gte("created_at", cutoff);

      // Check if host is still a connected participant (no left_at)
      const { data: hostParticipant } = await supabase
        .from("space_participants")
        .select("id, left_at")
        .eq("space_id", space.id)
        .eq("user_id", space.host_id)
        .is("left_at", null)
        .maybeSingle();

      const hostIsPresent = !!hostParticipant;
      const hostIsActive = (recentHostMessages ?? 0) > 0;

      // End space if host has left OR host has no recent activity
      if (!hostIsPresent || !hostIsActive) {
        const now = new Date().toISOString();

        // End the space
        await supabase
          .from("spaces")
          .update({ status: "ended", ended_at: now })
          .eq("id", space.id)
          .eq("status", "live");

        // Mark all remaining participants as left
        await supabase
          .from("space_participants")
          .update({ left_at: now })
          .eq("space_id", space.id)
          .is("left_at", null);

        // Notify the host
        await supabase.from("notifications").insert({
          user_id: space.host_id,
          title: "Space Ended (Inactivity) ⏰",
          message: `Your space "${space.title}" was automatically ended after ${INACTIVITY_MINUTES} minutes of inactivity.`,
          type: "info",
        });

        // Try to delete the LiveKit room
        try {
          const livekitUrl = Deno.env.get("LIVEKIT_URL") || "";
          const apiKey = Deno.env.get("LIVEKIT_API_KEY") || "";
          const apiSecret = Deno.env.get("LIVEKIT_API_SECRET") || "";

          if (livekitUrl && apiKey && apiSecret) {
            const { RoomServiceClient } = await import("npm:livekit-server-sdk@2.15.0");
            const httpUrl = livekitUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
            const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret);
            await svc.deleteRoom(`space-${space.id}`);
          }
        } catch {
          // Room may already be gone
        }

        ended++;
        console.log(`cleanup-stale-spaces: ended space ${space.id} — "${space.title}"`);
      }
    }

    return new Response(
      JSON.stringify({ ended, checked: liveSpaces.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("cleanup-stale-spaces error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
