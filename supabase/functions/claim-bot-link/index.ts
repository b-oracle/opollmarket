// Claim a bot link token: binds the authenticated user to a Telegram chat_id
// or WhatsApp phone number. Replaces the old password-over-chat link flow.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
  const userId = userData.user.id;

  let payload: { token?: string };
  try { payload = await req.json(); } catch { return json({ error: "Invalid body" }, 400); }
  const token = (payload.token || "").trim();
  if (!token || token.length < 16 || token.length > 128) {
    return json({ error: "Invalid token" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  // Atomically claim: only if unclaimed and unexpired.
  const { data: claimed, error: claimErr } = await admin
    .from("bot_link_tokens")
    .update({ claimed_at: new Date().toISOString(), claimed_by: userId })
    .eq("token", token)
    .is("claimed_at", null)
    .gt("expires_at", new Date().toISOString())
    .select()
    .maybeSingle();

  if (claimErr) {
    console.error("claim-bot-link update failed", claimErr);
    return json({ error: "Failed to claim token" }, 500);
  }
  if (!claimed) return json({ error: "Token is invalid, expired, or already used" }, 400);

  try {
    if (claimed.kind === "telegram") {
      if (!claimed.telegram_chat_id) return json({ error: "Malformed token" }, 400);
      const { error } = await admin.from("telegram_users").upsert(
        {
          user_id: userId,
          telegram_chat_id: claimed.telegram_chat_id,
          telegram_username: claimed.telegram_username,
          linked_at: new Date().toISOString(),
        },
        { onConflict: "telegram_chat_id" },
      );
      if (error) throw error;

      // Best-effort confirmation message back to the user in Telegram.
      const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
      if (botToken) {
        try {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: claimed.telegram_chat_id,
              text: "✅ Your Telegram is now linked to your OPoll account. Try /balance or /markets.",
            }),
          });
        } catch (e) { console.warn("telegram confirm send failed", e); }
      }

      return json({ ok: true, kind: "telegram" });
    }

    if (claimed.kind === "whatsapp") {
      if (!claimed.whatsapp_phone) return json({ error: "Malformed token" }, 400);
      const { error } = await admin.from("whatsapp_users").upsert(
        {
          user_id: userId,
          whatsapp_phone: claimed.whatsapp_phone,
          display_name: claimed.display_name || null,
          linked_at: new Date().toISOString(),
        },
        { onConflict: "whatsapp_phone" },
      );
      if (error) throw error;
      return json({ ok: true, kind: "whatsapp" });
    }

    return json({ error: "Unknown link kind" }, 400);
  } catch (err) {
    console.error("claim-bot-link upsert failed", err);
    // Roll back the claim so the user can retry.
    await admin.from("bot_link_tokens").update({ claimed_at: null, claimed_by: null }).eq("token", token);
    return json({ error: "Failed to link account" }, 500);
  }
});
