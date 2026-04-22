// One-tap self-test for incoming-call push notifications.
//
// Any signed-in user can call this to ring their own device. We:
//   1. Find the user's most recent active DM conversation (they need at least
//      one to deep-link into — you can't DM yourself).
//   2. Insert a real `dm_calls` row (status = ringing) using the service role,
//      with the *other* user as caller and the requesting user as callee.
//      This triggers the realtime subscription in IncomingCallBanner so the
//      app rings exactly like a real incoming call.
//   3. Send an FCM push (is_call: true) that deep-links to
//      /messages/<conversation_id>, so tapping the notification opens the
//      same conversation the call belongs to.
//   4. Auto-mark the call as `missed` after 30s so it doesn't linger if the
//      user doesn't tap.
//
// Returns a summary with conversation_id, call_id, fcm response, and the
// deep-link URL so the diagnostics screen can show exactly what was sent.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Identify caller
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Invalid session" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);

    // Token sanity check first — without a registered FCM token, no ring.
    const { data: tokens } = await admin
      .from("user_fcm_tokens")
      .select("id, platform")
      .eq("user_id", user.id);

    const tokenCount = tokens?.length ?? 0;

    // Find the user's most recent active DM conversation
    const { data: convo, error: convoErr } = await admin
      .from("dm_conversations")
      .select("id, user_a, user_b, status, last_message_at")
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
      .eq("status", "active")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (convoErr) {
      return json({ error: "Lookup failed: " + convoErr.message }, 500);
    }

    let conversationId: string | null = convo?.id ?? null;
    let otherUserId: string | null = null;
    let callId: string | null = null;
    let deepLink = "/messages";

    if (convo) {
      otherUserId = convo.user_a === user.id ? convo.user_b : convo.user_a;

      // Insert a real ringing call row so IncomingCallBanner picks it up over
      // realtime exactly like a production call. Service-role bypasses RLS.
      const roomName = `test-${crypto.randomUUID().slice(0, 8)}`;
      const { data: callRow, error: callErr } = await admin
        .from("dm_calls")
        .insert({
          conversation_id: conversationId,
          caller_id: otherUserId,
          callee_id: user.id,
          room_name: roomName,
          status: "ringing",
        })
        .select("id")
        .single();

      if (callErr) {
        console.error("Failed to insert dm_calls row:", callErr);
      } else {
        callId = callRow.id;
        deepLink = `/messages/${conversationId}?call_id=${callId}`;

        // Schedule auto-cleanup after 30s so a missed test doesn't linger
        // as a "ringing" row in the DB.
        (async () => {
          await new Promise((r) => setTimeout(r, 30_000));
          await admin
            .from("dm_calls")
            .update({ status: "missed", ended_at: new Date().toISOString() })
            .eq("id", callId)
            .eq("status", "ringing");
        })().catch((e) => console.warn("auto-cleanup failed:", e));
      }
    } else {
      // No conversation = nothing to deep-link into. We still send a generic
      // push so the user can verify the ring channel works, but tapping it
      // will just land on /messages.
      deepLink = "/messages";
    }

    // Look up caller name for nicer push body
    let callerName = "Test Caller";
    if (otherUserId) {
      const { data: p } = await admin
        .from("profiles")
        .select("display_name")
        .eq("id", otherUserId)
        .maybeSingle();
      if (p?.display_name) callerName = p.display_name;
    }

    // Fire the push via send-fcm-push (it handles FCM v1 + per-token results)
    const pushRes = await fetch(`${supabaseUrl}/functions/v1/send-fcm-push`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        apikey: serviceKey,
      },
      body: JSON.stringify({
        user_id: user.id,
        title: "Incoming Call 📞",
        body: `${callerName} is calling you (test)`,
        url: deepLink,
        is_call: true,
        call_id: callId ?? crypto.randomUUID(),
        data: {
          caller_id: otherUserId ?? user.id,
          caller_name: callerName,
          conversation_id: conversationId ?? "",
          test: "true",
        },
      }),
    });

    const pushJson = await pushRes.json().catch(() => ({}));

    return json({
      ok: pushRes.ok && (pushJson?.sent ?? 0) > 0,
      user_id: user.id,
      tokens_on_file: tokenCount,
      conversation_id: conversationId,
      call_id: callId,
      deep_link: deepLink,
      sent: pushJson?.sent ?? 0,
      expired: pushJson?.expired ?? 0,
      results: pushJson?.results ?? [],
      hint: tokenCount === 0
        ? "No FCM tokens registered for this user. Open the installed app while signed in to register one."
        : !conversationId
        ? "No active DM conversation found. Start a DM with someone to enable the deep-link test (the call row + tap-to-open conversation flow)."
        : null,
    });
  } catch (err) {
    console.error("self-test-call-push error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
