import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AccessToken, RoomServiceClient } from "npm:livekit-server-sdk@2.15.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function getLivekitConfig() {
  const apiKey = (Deno.env.get("LIVEKIT_API_KEY") || "").trim();
  const apiSecret = (Deno.env.get("LIVEKIT_API_SECRET") || "").trim();
  const livekitUrl = (Deno.env.get("LIVEKIT_URL") || "").trim();
  const httpUrl = livekitUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
  console.log("LiveKit config check:", { apiKey: !!apiKey, apiSecret: !!apiSecret, livekitUrl: !!livekitUrl, url: livekitUrl });
  return { apiKey, apiSecret, livekitUrl, httpUrl };
}

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

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { action, conversation_id, call_id } = body;

    if (!action) return json({ error: "action required" }, 400);

    const { apiKey, apiSecret, livekitUrl, httpUrl } = getLivekitConfig();
    if (!apiKey || !apiSecret || !livekitUrl) return json({ error: "LiveKit not configured" });

    // ─── START CALL ───
    if (action === "start") {
      if (!conversation_id) return json({ error: "conversation_id required" }, 400);

      // Validate conversation exists, is active, and user is participant
      const { data: convo, error: convoErr } = await admin
        .from("dm_conversations")
        .select("id, user_a, user_b, status")
        .eq("id", conversation_id)
        .single();

      if (convoErr || !convo) return json({ error: "Conversation not found" }, 404);
      if (convo.status !== "active") return json({ error: "Conversation is not active" }, 400);

      const isParticipant = convo.user_a === user.id || convo.user_b === user.id;
      if (!isParticipant) return json({ error: "Not a participant" }, 403);

      const calleeId = convo.user_a === user.id ? convo.user_b : convo.user_a;

      // Check if there's already an active/ringing call for this conversation
      const { data: existingCall } = await admin
        .from("dm_calls")
        .select("id")
        .eq("conversation_id", conversation_id)
        .in("status", ["ringing", "active"])
        .limit(1)
        .maybeSingle();

      if (existingCall) return json({ error: "A call is already in progress" }, 400);

      const roomName = `dm-call-${conversation_id}-${Date.now()}`;

      // Create LiveKit room
      const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret);
      await svc.createRoom({ name: roomName, emptyTimeout: 120, maxParticipants: 2 });

      // Insert call record
      const { data: callData, error: callErr } = await admin
        .from("dm_calls")
        .insert({
          conversation_id,
          caller_id: user.id,
          callee_id: calleeId,
          room_name: roomName,
          status: "ringing",
        })
        .select("id")
        .single();

      if (callErr) throw callErr;

      // Send notification to callee
      const { data: callerProfile } = await admin
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single();

      await admin.from("notifications").insert({
        user_id: calleeId,
        title: "Incoming Call 📞",
        message: `${callerProfile?.display_name || "Someone"} is calling you`,
        type: "call",
        actor_id: user.id,
      });

      // Generate token for caller
      const at = new AccessToken(apiKey, apiSecret, {
        identity: user.id,
        name: callerProfile?.display_name || "Anonymous",
        ttl: "5m",
      });
      at.addGrant({
        room: roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      });

      return json({
        token: await at.toJwt(),
        url: livekitUrl,
        room: roomName,
        call_id: callData.id,
        callee_id: calleeId,
        e2ee_passphrase: `e2ee-${conversation_id}-${callData.id}`,
      });
    }

    // ─── ANSWER CALL ───
    if (action === "answer") {
      if (!call_id) return json({ error: "call_id required" }, 400);

      const { data: call, error: callErr } = await admin
        .from("dm_calls")
        .select("*")
        .eq("id", call_id)
        .single();

      if (callErr || !call) return json({ error: "Call not found" }, 404);
      if (call.callee_id !== user.id) return json({ error: "Not the callee" }, 403);
      if (call.status !== "ringing") return json({ error: "Call is no longer ringing" }, 400);

      await admin
        .from("dm_calls")
        .update({ status: "active", started_at: new Date().toISOString() })
        .eq("id", call_id);

      const { data: profile } = await admin
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single();

      const at = new AccessToken(apiKey, apiSecret, {
        identity: user.id,
        name: profile?.display_name || "Anonymous",
        ttl: "2h",
      });
      at.addGrant({
        room: call.room_name,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      });

      return json({
        token: await at.toJwt(),
        url: livekitUrl,
        room: call.room_name,
        call_id: call.id,
        e2ee_passphrase: `e2ee-${call.conversation_id}-${call.id}`,
      });
    }

    // ─── DECLINE CALL ───
    if (action === "decline") {
      if (!call_id) return json({ error: "call_id required" }, 400);

      const { data: call } = await admin
        .from("dm_calls")
        .select("callee_id, room_name, status")
        .eq("id", call_id)
        .single();

      if (!call) return json({ error: "Call not found" }, 404);
      if (call.callee_id !== user.id) return json({ error: "Not the callee" }, 403);
      if (call.status !== "ringing") return json({ error: "Call is not ringing" }, 400);

      await admin
        .from("dm_calls")
        .update({ status: "declined", ended_at: new Date().toISOString() })
        .eq("id", call_id);

      // Insert system message
      await admin.from("dm_messages").insert({
        conversation_id: call.conversation_id,
        sender_id: user.id,
        content: `[CALL:declined:0]`,
      });

      // Destroy room
      try {
        const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret);
        await svc.deleteRoom(call.room_name);
      } catch { /* room may already be gone */ }

      return json({ success: true });
    }

    // ─── CANCEL CALL (caller cancels before answer) ───
    if (action === "cancel") {
      if (!call_id) return json({ error: "call_id required" }, 400);

      const { data: call } = await admin
        .from("dm_calls")
        .select("caller_id, room_name, status")
        .eq("id", call_id)
        .single();

      if (!call) return json({ error: "Call not found" }, 404);
      if (call.caller_id !== user.id) return json({ error: "Not the caller" }, 403);
      if (call.status !== "ringing") return json({ error: "Call is not ringing" }, 400);

      await admin
        .from("dm_calls")
        .update({ status: "missed", ended_at: new Date().toISOString() })
        .eq("id", call_id);

      try {
        const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret);
        await svc.deleteRoom(call.room_name);
      } catch { /* ignore */ }

      return json({ success: true });
    }

    // ─── END CALL ───
    if (action === "end") {
      if (!call_id) return json({ error: "call_id required" }, 400);

      const { data: call } = await admin
        .from("dm_calls")
        .select("caller_id, callee_id, room_name, status, started_at")
        .eq("id", call_id)
        .single();

      if (!call) return json({ error: "Call not found" }, 404);
      if (call.caller_id !== user.id && call.callee_id !== user.id)
        return json({ error: "Not a participant" }, 403);

      const now = new Date();
      const duration = call.started_at
        ? Math.round((now.getTime() - new Date(call.started_at).getTime()) / 1000)
        : 0;

      await admin
        .from("dm_calls")
        .update({
          status: "ended",
          ended_at: now.toISOString(),
          duration_seconds: duration,
        })
        .eq("id", call_id);

      try {
        const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret);
        await svc.deleteRoom(call.room_name);
      } catch { /* ignore */ }

      return json({ success: true, duration_seconds: duration });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err: any) {
    console.error("dm-call-token error:", err);
    return json({ error: err.message || "Internal error" }, 500);
  }
});
