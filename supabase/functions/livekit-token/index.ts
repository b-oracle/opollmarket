import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AccessToken, RoomServiceClient, EgressClient, EncodedFileOutput, EncodedFileType } from "npm:livekit-server-sdk@2.15.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const extractEnvValue = (value: string | null, key: string) => {
  const normalized = (value || "").trim();
  if (!normalized) return "";
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const assignmentMatch = normalized.match(
    new RegExp(
      `(?:^|[\\n\\r;\\s])${escapedKey}\\s*=\\s*(?:"([^"\\n\\r]+)"|'([^'\\n\\r]+)'|([^\\s;\\n\\r]+))`,
      "i"
    )
  );
  const fromAssignment = assignmentMatch?.[1] || assignmentMatch?.[2] || assignmentMatch?.[3];
  const candidate = (fromAssignment || normalized).trim();
  return candidate.replace(/^['\"`]|['\"`]$/g, "");
};

function getLivekitConfig() {
  const apiKey = extractEnvValue(Deno.env.get("LIVEKIT_API_KEY"), "LIVEKIT_API_KEY");
  const apiSecret = extractEnvValue(Deno.env.get("LIVEKIT_API_SECRET"), "LIVEKIT_API_SECRET");
  const livekitUrl = extractEnvValue(Deno.env.get("LIVEKIT_URL"), "LIVEKIT_URL");
  const httpUrl = livekitUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
  return { apiKey, apiSecret, livekitUrl, httpUrl };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: authUser }, error: userError } = await supabase.auth.getUser();
    if (userError || !authUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = authUser.id;
    const body = await req.json();
    const { space_id, action, target_user_id } = body;

    if (!space_id) {
      return new Response(JSON.stringify({ error: "space_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: space, error: spaceErr } = await supabaseAdmin
      .from("spaces")
      .select("id, host_id, status, recording_egress_id")
      .eq("id", space_id)
      .single();

    if (spaceErr || !space) {
      return new Response(JSON.stringify({ error: "Space not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (space.status !== "live") {
      return new Response(JSON.stringify({ error: "Space has ended" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { apiKey, apiSecret, livekitUrl, httpUrl } = getLivekitConfig();

    if (!apiKey || !apiSecret || !livekitUrl) {
      return new Response(JSON.stringify({ error: "LiveKit not configured" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const roomName = `space-${space_id}`;
    const isHost = space.host_id === userId;

    // Helper to ensure host
    const requireHost = () => {
      if (!isHost) throw new Error("Only the host can perform this action");
    };

    // --- PROMOTE ---
    if (action === "promote" && target_user_id) {
      requireHost();
      const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret);
      await svc.updateParticipant(roomName, target_user_id, undefined, {
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      });
      await supabaseAdmin
        .from("space_participants")
        .update({ role: "speaker" })
        .eq("space_id", space_id)
        .eq("user_id", target_user_id);
      return new Response(JSON.stringify({ success: true, action: "promoted" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- DEMOTE ---
    if (action === "demote" && target_user_id) {
      requireHost();
      const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret);
      await svc.updateParticipant(roomName, target_user_id, undefined, {
        canPublish: false,
        canSubscribe: true,
        canPublishData: true,
      });
      await supabaseAdmin
        .from("space_participants")
        .update({ role: "listener" })
        .eq("space_id", space_id)
        .eq("user_id", target_user_id);
      return new Response(JSON.stringify({ success: true, action: "demoted" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- FORCE MUTE ---
    if (action === "mute" && target_user_id) {
      requireHost();
      const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret);
      // Mute all audio tracks for this participant
      const participant = await svc.getParticipant(roomName, target_user_id);
      if (participant.tracks) {
        for (const track of participant.tracks) {
          if (track.type === 1) { // AUDIO type
            await svc.mutePublishedTrack(roomName, target_user_id, track.sid!, true);
          }
        }
      }
      return new Response(JSON.stringify({ success: true, action: "muted" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- KICK ---
    if (action === "kick" && target_user_id) {
      requireHost();
      const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret);
      await svc.removeParticipant(roomName, target_user_id);
      // Mark them as left in DB
      await supabaseAdmin
        .from("space_participants")
        .update({ left_at: new Date().toISOString(), role: "kicked" })
        .eq("space_id", space_id)
        .eq("user_id", target_user_id);
      return new Response(JSON.stringify({ success: true, action: "kicked" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- START RECORDING ---
    if (action === "start_recording") {
      requireHost();
      if (space.recording_egress_id) {
        return new Response(JSON.stringify({ error: "Already recording" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const egressClient = new EgressClient(httpUrl, apiKey, apiSecret);
      const output = new EncodedFileOutput({
        fileType: EncodedFileType.OGG,
        filepath: `recordings/space-${space_id}-{time}.ogg`,
      });

      const info = await egressClient.startRoomCompositeEgress(roomName, { file: output }, { audioOnly: true });
      const egressId = info.egressId;

      await supabaseAdmin
        .from("spaces")
        .update({ recording_egress_id: egressId })
        .eq("id", space_id);

      return new Response(JSON.stringify({ success: true, action: "recording_started", egressId }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- STOP RECORDING ---
    if (action === "stop_recording") {
      requireHost();
      if (!space.recording_egress_id) {
        return new Response(JSON.stringify({ error: "Not recording" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const egressClient = new EgressClient(httpUrl, apiKey, apiSecret);
      await egressClient.stopEgress(space.recording_egress_id);

      await supabaseAdmin
        .from("spaces")
        .update({ recording_egress_id: null, is_recorded: true })
        .eq("id", space_id);

      return new Response(JSON.stringify({ success: true, action: "recording_stopped" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Default: JOIN ---
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .single();

    const displayName = profile?.display_name || "Anonymous";

    const at = new AccessToken(apiKey, apiSecret, {
      identity: userId,
      name: displayName,
      ttl: "2h",
    });

    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: isHost,
      canSubscribe: true,
      canPublishData: true,
    });

    const accessToken = await at.toJwt();

    return new Response(
      JSON.stringify({ token: accessToken, url: livekitUrl, room: roomName, isHost }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("livekit-token error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
