import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AccessToken, RoomServiceClient } from "npm:livekit-server-sdk@2.15.0";

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
      .select("id, host_id, status")
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

    const apiKey = extractEnvValue(Deno.env.get("LIVEKIT_API_KEY"), "LIVEKIT_API_KEY");
    const apiSecret = extractEnvValue(Deno.env.get("LIVEKIT_API_SECRET"), "LIVEKIT_API_SECRET");
    const livekitUrl = extractEnvValue(Deno.env.get("LIVEKIT_URL"), "LIVEKIT_URL");

    if (!apiKey || !apiSecret || !livekitUrl) {
      return new Response(JSON.stringify({ error: "LiveKit not configured" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const roomName = `space-${space_id}`;
    const isHost = space.host_id === userId;

    // --- PROMOTE action: host grants publish permission to a listener ---
    if (action === "promote" && target_user_id) {
      if (!isHost) {
        return new Response(JSON.stringify({ error: "Only the host can promote participants" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Use LiveKit RoomService to update participant permissions
      const httpUrl = livekitUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
      const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret);
      
      await svc.updateParticipant(roomName, target_user_id, undefined, {
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      });

      // Update DB role
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

    // --- DEMOTE action: host revokes publish permission ---
    if (action === "demote" && target_user_id) {
      if (!isHost) {
        return new Response(JSON.stringify({ error: "Only the host can demote participants" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const httpUrl = livekitUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
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

    // --- Default: JOIN — generate a token ---
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
