import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AccessToken, RoomServiceClient } from "npm:livekit-server-sdk@2.15.0";
import { getErrorMessage } from "../_shared/errors.ts";

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

// Fire-and-forget event logger — uses service role bypassing RLS.
// Never throws; logs warnings if insertion fails.
const logCallEvent = async (
  admin: any,
  callId: string,
  conversationId: string | null,
  eventType: string,
  actorId: string | null,
  metadata: Record<string, unknown> = {},
) => {
  try {
    const { error } = await admin.from("dm_call_events").insert({
      call_id: callId,
      conversation_id: conversationId,
      event_type: eventType,
      actor_id: actorId,
      source: "edge",
      metadata,
    });
    if (error) console.warn("logCallEvent insert error:", eventType, error.message);
  } catch (err) {
    console.warn("logCallEvent threw:", err);
  }
};

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

      console.log("start call - convo lookup:", { convoErr: convoErr?.message, convoId: convo?.id, status: convo?.status });

      if (convoErr || !convo) return json({ error: "Conversation not found" }, 404);
      if (convo.status !== "active") return json({ error: "Conversation is not active" }, 400);

      const isParticipant = convo.user_a === user.id || convo.user_b === user.id;
      if (!isParticipant) return json({ error: "Not a participant" }, 403);

      const calleeId = convo.user_a === user.id ? convo.user_b : convo.user_a;

      // Check if there's already an active/ringing call for this conversation
      const { data: existingCalls } = await admin
        .from("dm_calls")
        .select("id, status, created_at, started_at, room_name")
        .eq("conversation_id", conversation_id)
        .in("status", ["ringing", "active"])
        .order("created_at", { ascending: false });

      if (existingCalls && existingCalls.length > 0) {
        const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret);
        let blocked = false;

        for (const ec of existingCalls) {
          const ageMs = ec.created_at
            ? Date.now() - new Date(ec.created_at).getTime()
            : 0;

          const isStaleRinging = ec.status === "ringing" && ageMs > 90_000;
          const isStaleActive = ec.status === "active" && ec.started_at
            ? Date.now() - new Date(ec.started_at).getTime() > 2 * 60 * 60 * 1000
            : ec.status === "active" && ageMs > 2 * 60 * 60 * 1000;

          if (isStaleRinging || isStaleActive) {
            console.warn("Cleaning up stale call", { callId: ec.id, status: ec.status, ageMs });
            await admin
              .from("dm_calls")
              .update({
                status: isStaleRinging ? "missed" : "ended",
                ended_at: new Date().toISOString(),
              })
              .eq("id", ec.id);

            try { await svc.deleteRoom(ec.room_name); } catch { /* room may be gone */ }
          } else {
            blocked = true;
          }
        }

        if (blocked) {
          // Find the blocking call ID so the client can rejoin
          const blockingCall = existingCalls.find(
            (ec) => ec.status === "ringing" || ec.status === "active"
          );
          return json(
            {
              error: "There is an ongoing call in this chat. Please end it first or wait.",
              active_call_id: blockingCall?.id || null,
              can_rejoin: blockingCall?.status === "active",
            },
            409
          );
        }
      }

      // Clean up any leftover "active" calls that have no participants in LiveKit
      // This catches calls that ended but weren't cleaned up properly
      try {
        const svc2 = new RoomServiceClient(httpUrl, apiKey, apiSecret);
        const { data: activeCalls } = await admin
          .from("dm_calls")
          .select("id, room_name, status")
          .eq("conversation_id", conversation_id)
          .eq("status", "active");

        if (activeCalls && activeCalls.length > 0) {
          for (const ac of activeCalls) {
            try {
              const participants = await svc2.listParticipants(ac.room_name);
              if (!participants || participants.length === 0) {
                console.warn("Cleaning up orphaned active call with no participants:", ac.id);
                await admin
                  .from("dm_calls")
                  .update({ status: "ended", ended_at: new Date().toISOString() })
                  .eq("id", ac.id);
                try { await svc2.deleteRoom(ac.room_name); } catch { /* room may be gone */ }
              }
            } catch {
              // Room doesn't exist in LiveKit — mark as ended
              console.warn("Cleaning up active call with missing LiveKit room:", ac.id);
              await admin
                .from("dm_calls")
                .update({ status: "ended", ended_at: new Date().toISOString() })
                .eq("id", ac.id);
            }
          }
        }
      } catch (cleanupErr) {
        console.warn("Orphan cleanup failed (non-fatal):", cleanupErr);
      }

      const roomName = `dm-call-${conversation_id}-${Date.now()}`;

      // Create LiveKit room with reduced emptyTimeout
      console.log("Creating LiveKit room:", { roomName, httpUrl });
      try {
        const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret);
        await svc.createRoom({ name: roomName, emptyTimeout: 60, maxParticipants: 2 });
        console.log("LiveKit room created successfully");
      } catch (lkErr: any) {
        console.error("LiveKit room creation failed:", lkErr?.message || lkErr);
        return json({ error: "Failed to create call room" }, 500);
      }

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
        .select("display_name, avatar_url")
        .eq("id", user.id)
        .single();

      const notifPayload = {
        user_id: calleeId,
        title: "Incoming Call 📞",
        message: `${callerProfile?.display_name || "Someone"} is calling you`,
        type: "call",
        actor_id: user.id,
        market_id: conversation_id,
      };
      console.log("Inserting call notification:", JSON.stringify(notifPayload));
      const { error: notifErr } = await admin.from("notifications").insert(notifPayload);
      if (notifErr) console.error("Call notification insert error:", notifErr);

      // Also trigger an urgent push with call metadata (web push + native FCM)
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const pushBody = JSON.stringify({
          user_id: calleeId,
          title: "Incoming Call 📞",
          body: `${callerProfile?.display_name || "Someone"} is calling you`,
          url: `/messages/${conversation_id}`,
          is_call: true,
          call_id: callData.id,
          data: {
            caller_id: user.id,
            caller_name: callerProfile?.display_name || "Someone",
            caller_avatar: callerProfile?.avatar_url || "",
            conversation_id,
          },
        });
        // Fire both in parallel — web push (browsers/PWA) and FCM (native app)
        await Promise.all([
          fetch(`${supabaseUrl}/functions/v1/send-push`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
            body: pushBody,
          }).catch((e) => console.warn("web push failed:", e)),
          fetch(`${supabaseUrl}/functions/v1/send-fcm-push`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
            body: pushBody,
          }).catch((e) => console.warn("fcm push failed:", e)),
        ]);
      } catch (pushErr) {
        console.warn("Urgent push for call failed (non-fatal):", pushErr);
      }

      // Generate token for caller
      const at = new AccessToken(apiKey, apiSecret, {
        identity: user.id,
        name: callerProfile?.display_name || "Anonymous",
        ttl: "2h",
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
        .select("callee_id, caller_id, room_name, status, conversation_id")
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

      // Notify caller about declined call
      const { data: calleeProfile } = await admin
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single();

      await admin.from("notifications").insert({
        user_id: call.caller_id,
        title: "Call Declined 📞",
        message: `${calleeProfile?.display_name || "User"} declined your call`,
        type: "call",
        actor_id: user.id,
        market_id: call.conversation_id,
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
        .select("caller_id, room_name, status, conversation_id")
        .eq("id", call_id)
        .single();

      if (!call) return json({ error: "Call not found" }, 404);
      if (call.caller_id !== user.id) return json({ error: "Not the caller" }, 403);
      // Tolerate already-ended calls
      if (!["ringing", "active", "ended", "missed"].includes(call.status)) {
        return json({ error: "Call is not ringing" }, 400);
      }
      if (call.status === "ended" || call.status === "missed") {
        return json({ success: true });
      }

      await admin
        .from("dm_calls")
        .update({ status: "missed", ended_at: new Date().toISOString() })
        .eq("id", call_id);

      // Insert system message
      await admin.from("dm_messages").insert({
        conversation_id: call.conversation_id,
        sender_id: user.id,
        content: `[CALL:missed:0]`,
      });

      // Notify callee about missed call
      const { data: call2 } = await admin
        .from("dm_calls")
        .select("callee_id")
        .eq("id", call_id)
        .single();

      if (call2) {
        const { data: callerP } = await admin
          .from("profiles")
          .select("display_name")
          .eq("id", user.id)
          .single();

        await admin.from("notifications").insert({
          user_id: call2.callee_id,
          title: "Missed Call 📞",
          message: `You missed a call from ${callerP?.display_name || "someone"}`,
          type: "call",
          actor_id: user.id,
          market_id: call.conversation_id,
        });
      }

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
        .select("caller_id, callee_id, room_name, status, started_at, conversation_id")
        .eq("id", call_id)
        .single();

      if (!call) return json({ error: "Call not found" }, 404);
      if (call.caller_id !== user.id && call.callee_id !== user.id)
        return json({ error: "Not a participant" }, 403);

      // Tolerate already-ended calls — return success silently
      if (["ended", "missed", "declined"].includes(call.status)) {
        return json({ success: true, duration_seconds: call.started_at ? 0 : 0 });
      }

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

      // Insert system message
      await admin.from("dm_messages").insert({
        conversation_id: call.conversation_id,
        sender_id: user.id,
        content: `[CALL:ended:${duration}]`,
      });

      try {
        const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret);
        await svc.deleteRoom(call.room_name);
      } catch { /* ignore */ }

      return json({ success: true, duration_seconds: duration });
    }

    // ─── REJOIN CALL ───
    if (action === "rejoin") {
      if (!call_id) return json({ error: "call_id required" }, 400);

      const { data: call, error: callErr } = await admin
        .from("dm_calls")
        .select("*")
        .eq("id", call_id)
        .single();

      if (callErr || !call) return json({ error: "Call not found" }, 404);

      const isParticipant = call.caller_id === user.id || call.callee_id === user.id;
      if (!isParticipant) return json({ error: "Not a participant" }, 403);

      if (call.status !== "active") {
        return json({ error: "Call is no longer active" }, 400);
      }

      // Check the call isn't too old (max 2h)
      const callAge = call.started_at
        ? Date.now() - new Date(call.started_at).getTime()
        : 0;
      if (callAge > 2 * 60 * 60 * 1000) {
        return json({ error: "Call has expired" }, 400);
      }

      // Verify room still exists in LiveKit
      const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret);
      try {
        const participants = await svc.listParticipants(call.room_name);
        // Room exists — generate a new token for the rejoining user
        console.log("Rejoin: room has", participants?.length || 0, "participants");
      } catch {
        // Room is gone — cannot rejoin
        await admin
          .from("dm_calls")
          .update({ status: "ended", ended_at: new Date().toISOString() })
          .eq("id", call_id);
        return json({ error: "Call room no longer exists" }, 410);
      }

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

    return json({ error: "Unknown action" }, 400);
  } catch (err: any) {
    console.error("dm-call-token error:", err);
    return json({ error: (getErrorMessage(err)) || "Internal error" }, 500);
  }
});
