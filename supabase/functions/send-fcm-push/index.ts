// Sends a high-priority FCM push to a user's native Android/iOS devices.
// Requires FCM_SERVER_KEY secret (Legacy server key from Firebase Console).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { user_id, title, body, data, is_call, call_id, url } = await req.json();
    if (!user_id || !title) {
      return new Response(JSON.stringify({ error: "user_id and title required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serverKey = Deno.env.get("FCM_SERVER_KEY");
    if (!serverKey) {
      return new Response(JSON.stringify({ error: "FCM_SERVER_KEY not configured", sent: 0 }), {
        status: 200, // non-fatal: web push still works via send-push
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: tokens } = await supabase
      .from("user_fcm_tokens")
      .select("id, token")
      .eq("user_id", user_id);

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no native tokens" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const expired: string[] = [];
    let sent = 0;

    for (const row of tokens) {
      // High-priority, heads-up notification. For calls we use a special channel
      // with ringtone sound so it rings even when app is closed.
      const payload: Record<string, unknown> = {
        to: row.token,
        priority: "high",
        notification: {
          title,
          body: body || "",
          sound: is_call ? "ringtone" : "default",
          android_channel_id: is_call ? "incoming_calls" : "default",
          click_action: "FCM_PLUGIN_ACTIVITY",
        },
        data: {
          ...(data || {}),
          url: url || "/",
          is_call: is_call ? "true" : "false",
          call_id: call_id || "",
        },
        android: {
          priority: "high",
          notification: {
            channel_id: is_call ? "incoming_calls" : "default",
            sound: is_call ? "ringtone" : "default",
          },
        },
      };

      const res = await fetch("https://fcm.googleapis.com/fcm/send", {
        method: "POST",
        headers: {
          Authorization: `key=${serverKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.success === 1) {
        sent++;
      } else if (
        json?.results?.[0]?.error === "NotRegistered" ||
        json?.results?.[0]?.error === "InvalidRegistration"
      ) {
        expired.push(row.id);
      }
    }

    if (expired.length > 0) {
      await supabase.from("user_fcm_tokens").delete().in("id", expired);
    }

    return new Response(JSON.stringify({ sent, expired: expired.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
