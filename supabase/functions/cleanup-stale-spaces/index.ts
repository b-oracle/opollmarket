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
    const HARD_TIMEOUT_HOURS = 6;
    const cutoff = new Date(Date.now() - INACTIVITY_MINUTES * 60 * 1000).toISOString();
    const hardCutoff = new Date(Date.now() - HARD_TIMEOUT_HOURS * 60 * 60 * 1000).toISOString();

    // Find live spaces that started more than 30 minutes ago
    const { data: liveSpaces, error: fetchErr } = await supabase
      .from("spaces")
      .select("id, title, host_id, co_host_ids, started_at")
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
      // Gather all key user IDs: host + co-hosts
      const keyUserIds: string[] = [space.host_id];
      if (space.co_host_ids?.length) {
        keyUserIds.push(...space.co_host_ids);
      }

      // Get all connected speakers in this space
      const { data: connectedSpeakers } = await supabase
        .from("space_participants")
        .select("user_id")
        .eq("space_id", space.id)
        .eq("role", "speaker")
        .is("left_at", null);

      if (connectedSpeakers?.length) {
        for (const sp of connectedSpeakers) {
          if (!keyUserIds.includes(sp.user_id)) {
            keyUserIds.push(sp.user_id);
          }
        }
      }

      // Check if ANY key user (host/co-host/speaker) is still connected
      const { data: connectedKeyUsers } = await supabase
        .from("space_participants")
        .select("user_id")
        .eq("space_id", space.id)
        .in("user_id", keyUserIds)
        .is("left_at", null);

      const anyKeyUserPresent = (connectedKeyUsers?.length ?? 0) > 0;

      // Check if ANY key user has sent messages in the last 30 minutes
      const { count: recentKeyMessages } = await supabase
        .from("space_messages")
        .select("id", { count: "exact", head: true })
        .eq("space_id", space.id)
        .in("user_id", keyUserIds)
        .gte("created_at", cutoff);

      const anyKeyUserActive = (recentKeyMessages ?? 0) > 0;

      // Force-end if space has been live longer than the hard timeout (e.g. 6 hours),
      // regardless of participant records — DB left_at can be stale if the host disconnected
      // without a clean leave event.
      const pastHardTimeout = space.started_at < hardCutoff;

      // End space if NO key user is connected AND none have recent chat activity,
      // OR if the space exceeded the hard timeout
      if (pastHardTimeout || (!anyKeyUserPresent && !anyKeyUserActive)) {
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

        const reason = pastHardTimeout
          ? `exceeded the maximum duration of ${HARD_TIMEOUT_HOURS} hours`
          : `${INACTIVITY_MINUTES} minutes of no host, co-host, or speaker activity`;

        // Notify the host
        await supabase.from("notifications").insert({
          user_id: space.host_id,
          title: "Space Ended (Auto-Closed) ⏰",
          message: `Your space "${space.title}" was automatically ended after ${reason}.`,
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
