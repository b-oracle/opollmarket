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

function getLivekitConfig() {
  const apiKey = extractEnvValue(Deno.env.get("LIVEKIT_API_KEY"), "LIVEKIT_API_KEY");
  const apiSecret = extractEnvValue(Deno.env.get("LIVEKIT_API_SECRET"), "LIVEKIT_API_SECRET");
  const livekitUrl = extractEnvValue(Deno.env.get("LIVEKIT_URL"), "LIVEKIT_URL");
  const httpUrl = livekitUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
  return { apiKey, apiSecret, livekitUrl, httpUrl };
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const { market_id, action } = body;
    if (!market_id) return json({ error: "market_id required" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: market, error: mErr } = await admin
      .from("markets")
      .select("id, creator_wallet, status, is_streaming, stream_url")
      .eq("id", market_id)
      .single();

    if (mErr || !market) return json({ error: "Market not found" }, 404);

    const isCreator = market.creator_wallet === user.id;
    const { apiKey, apiSecret, livekitUrl, httpUrl } = getLivekitConfig();

    if (!apiKey || !apiSecret || !livekitUrl) {
      return json({ error: "LiveKit not configured" });
    }

    const roomName = `market-${market_id}`;

    // --- START STREAM ---
    if (action === "start_stream") {
      if (!isCreator) return json({ error: "Only the market creator can go live" }, 403);
      if (market.status !== "active") return json({ error: "Market is not active" });

      const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret);
      try {
        await svc.createRoom({ name: roomName, emptyTimeout: 300, maxParticipants: 500 });
      } catch { /* room may already exist */ }

      await admin.from("markets").update({ is_streaming: true }).eq("id", market_id);

      const { data: profile } = await admin.from("profiles").select("display_name").eq("id", user.id).single();
      const at = new AccessToken(apiKey, apiSecret, {
        identity: user.id,
        name: profile?.display_name || "Host",
        ttl: "4h",
      });
      at.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
      const token = await at.toJwt();

      return json({ success: true, token, url: livekitUrl, room: roomName });
    }

    // --- STOP STREAM ---
    if (action === "stop_stream") {
      if (!isCreator) return json({ error: "Only the market creator can stop the stream" }, 403);

      const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret);
      try { await svc.deleteRoom(roomName); } catch { /* room may be gone */ }

      await admin.from("markets").update({ is_streaming: false }).eq("id", market_id);

      return json({ success: true });
    }

    // --- SET STREAM URL (external embed) ---
    if (action === "set_stream_url") {
      if (!isCreator) return json({ error: "Only the market creator can set a stream URL" }, 403);
      const { stream_url } = body;
      await admin.from("markets").update({ stream_url: stream_url || null }).eq("id", market_id);
      return json({ success: true });
    }

    // --- JOIN (viewer token) ---
    if (action === "join") {
      if (!market.is_streaming) return json({ error: "This market is not currently streaming" });

      const { data: profile } = await admin.from("profiles").select("display_name").eq("id", user.id).single();
      const at = new AccessToken(apiKey, apiSecret, {
        identity: user.id,
        name: profile?.display_name || "Viewer",
        ttl: "4h",
      });
      at.addGrant({ room: roomName, roomJoin: true, canPublish: false, canSubscribe: true, canPublishData: false });
      const token = await at.toJwt();

      return json({ token, url: livekitUrl, room: roomName });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (err: any) {
    console.error("market-stream-token error:", err);
    return json({ error: err.message || "Internal error" }, 500);
  }
});
