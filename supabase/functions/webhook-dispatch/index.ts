import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { errorResponse } from "../_shared/errors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function hmacSign(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return "sha256=" + hex;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // FIX: Authenticate the caller — only service-role or admin users can dispatch webhooks
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    
    // Allow service_role tokens (no claims needed) or admin users
    if (claimsErr || !claimsData?.claims) {
      // Check if it's a service role call (token matches service key)
      // Service role calls come from other edge functions — they pass the service key as bearer
      if (token !== serviceKey) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      // It's a user token — verify they're an admin
      const userId = claimsData.claims.sub as string;
      const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
      const { data: isSuperAdmin } = await admin.rpc("has_role", { _user_id: userId, _role: "super_admin" });
      if (!isAdmin && !isSuperAdmin) {
        return new Response(JSON.stringify({ error: "Forbidden: admin access required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { event_type, market_id, payload } = await req.json();

    if (!event_type || typeof event_type !== "string") {
      return new Response(JSON.stringify({ error: "Missing or invalid event_type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all active API keys with webhook URLs
    const { data: apiKeys } = await admin
      .from("api_keys")
      .select("id, webhook_url, webhook_secret, partner_name")
      .eq("is_active", true)
      .not("webhook_url", "is", null);

    if (!apiKeys || apiKeys.length === 0) {
      return new Response(JSON.stringify({ dispatched: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const webhookPayload = {
      event: event_type,
      timestamp: new Date().toISOString(),
      data: payload || {},
      ...(market_id && { market_id }),
    };

    const bodyStr = JSON.stringify(webhookPayload);

    let dispatched = 0;

    for (const key of apiKeys) {
      if (!key.webhook_url) continue;

      // Validate webhook URL protocol
      try {
        const webhookUrl = new URL(key.webhook_url);
        if (!["https:", "http:"].includes(webhookUrl.protocol)) continue;
      } catch {
        continue;
      }

      // Insert webhook event record
      const { data: eventRecord } = await admin
        .from("webhook_events")
        .insert({
          api_key_id: key.id,
          event_type,
          payload: webhookPayload,
          status: "pending",
        })
        .select("id")
        .single();

      // Compute HMAC signature if webhook_secret exists
      let signature = "v1_unsigned";
      if (key.webhook_secret) {
        try {
          signature = await hmacSign(key.webhook_secret, bodyStr);
        } catch {
          signature = "v1_sign_error";
        }
      }

      // Fire webhook
      try {
        const resp = await Promise.race([
          fetch(key.webhook_url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-OPOLL-Event": event_type,
              "X-OPOLL-Signature": signature,
            },
            body: bodyStr,
          }),
          new Promise<Response>((_, rej) => setTimeout(() => rej(new Error("timeout")), 10000)),
        ]);

        await admin
          .from("webhook_events")
          .update({
            status: resp.ok ? "delivered" : "failed",
            response_code: resp.status,
            attempts: 1,
            last_attempt_at: new Date().toISOString(),
          })
          .eq("id", eventRecord?.id);

        if (resp.ok) dispatched++;
      } catch (fetchErr) {
        console.error(`Webhook to ${key.partner_name} failed:`, fetchErr);
        await admin
          .from("webhook_events")
          .update({
            status: "failed",
            attempts: 1,
            last_attempt_at: new Date().toISOString(),
          })
          .eq("id", eventRecord?.id);
      }
    }

    return new Response(JSON.stringify({ dispatched, total: apiKeys.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("webhook-dispatch error:", err);
    return errorResponse(err, 500, corsHeaders);
  }
});
