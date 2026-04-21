// Admin-only test endpoint to send a fake "incoming call" push to a target user.
// Verifies the caller is admin/super_admin via JWT, then invokes send-fcm-push
// with is_call: true so the device rings as if a real call were coming in.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth client to identify caller
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service-role client for role check + invoking send-fcm-push
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const isAdmin = (roles || []).some(
      (r: { role: string }) => r.role === "admin" || r.role === "super_admin",
    );
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden — admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const targetUserId = body.target_user_id as string | undefined;
    if (!targetUserId) {
      return new Response(JSON.stringify({ error: "target_user_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up caller display name for a realistic-looking call
    const { data: callerProfile } = await admin
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle();

    const callerName =
      (body.caller_name as string) ||
      callerProfile?.display_name ||
      "Test Caller";
    const callerAvatar = callerProfile?.avatar_url || "";
    const callId = crypto.randomUUID();
    const conversationId = (body.conversation_id as string) || callId;

    // Count tokens for clearer feedback
    const { count: tokenCount } = await admin
      .from("user_fcm_tokens")
      .select("id", { count: "exact", head: true })
      .eq("user_id", targetUserId);

    // Forward to send-fcm-push
    const fcmRes = await fetch(`${supabaseUrl}/functions/v1/send-fcm-push`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        apikey: serviceKey,
      },
      body: JSON.stringify({
        user_id: targetUserId,
        title: "Incoming Call 📞",
        body: `${callerName} is calling you (test)`,
        url: `/messages/${conversationId}`,
        is_call: true,
        call_id: callId,
        data: {
          caller_id: user.id,
          caller_name: callerName,
          caller_avatar: callerAvatar,
          conversation_id: conversationId,
          test: "true",
        },
      }),
    });

    const fcmJson = await fcmRes.json().catch(() => ({}));

    return new Response(
      JSON.stringify({
        ok: fcmRes.ok && (fcmJson?.sent ?? 0) > 0,
        target_user_id: targetUserId,
        tokens_on_file: tokenCount ?? 0,
        call_id: callId,
        sent: fcmJson?.sent ?? 0,
        expired: fcmJson?.expired ?? 0,
        results: fcmJson?.results ?? [],
        fcm_response: fcmJson,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("admin-test-call-push error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
