import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Web Push requires signing with VAPID keys
// We use the web-push compatible approach with crypto APIs available in Deno

async function importVapidKeys(publicKey: string, privateKey: string) {
  // Decode base64url VAPID private key
  const rawPrivate = Uint8Array.from(
    atob(privateKey.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0)
  );
  const rawPublic = Uint8Array.from(
    atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0)
  );

  const key = await crypto.subtle.importKey(
    "pkcs8",
    rawPrivate,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  return { privateKey: key, publicKeyRaw: rawPublic };
}

function base64UrlEncode(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function createJWT(
  audience: string,
  subject: string,
  privateKey: CryptoKey
): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 12 * 60 * 60,
    sub: subject,
  };

  const encoder = new TextEncoder();
  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const unsigned = `${headerB64}.${payloadB64}`;

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    encoder.encode(unsigned)
  );

  // Convert DER signature to raw r||s format
  const sigBytes = new Uint8Array(signature);
  let r: Uint8Array, s: Uint8Array;

  if (sigBytes[0] === 0x30) {
    // DER encoded
    const rLen = sigBytes[3];
    const rStart = 4;
    r = sigBytes.slice(rStart, rStart + rLen);
    const sLen = sigBytes[rStart + rLen + 1];
    const sStart = rStart + rLen + 2;
    s = sigBytes.slice(sStart, sStart + sLen);

    // Remove leading zeros and pad to 32 bytes
    if (r.length > 32) r = r.slice(r.length - 32);
    if (s.length > 32) s = s.slice(s.length - 32);
    if (r.length < 32) {
      const padded = new Uint8Array(32);
      padded.set(r, 32 - r.length);
      r = padded;
    }
    if (s.length < 32) {
      const padded = new Uint8Array(32);
      padded.set(s, 32 - s.length);
      s = padded;
    }
  } else {
    // Already raw
    r = sigBytes.slice(0, 32);
    s = sigBytes.slice(32, 64);
  }

  const rawSig = new Uint8Array(64);
  rawSig.set(r, 0);
  rawSig.set(s, 32);

  return `${unsigned}.${base64UrlEncode(rawSig)}`;
}

async function sendPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: CryptoKey
): Promise<boolean> {
  try {
    const url = new URL(subscription.endpoint);
    const audience = `${url.protocol}//${url.host}`;
    const subject = "mailto:hello@opollmarket.com";

    const jwt = await createJWT(audience, subject, vapidPrivateKey);

    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        TTL: "86400",
        Urgency: "high",
        Authorization: `vapid t=${jwt}, k=${vapidPublicKey}`,
      },
      body: payload,
    });

    if (response.status === 410 || response.status === 404) {
      // Subscription expired, should be cleaned up
      return false;
    }

    return response.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id, title, body, url, is_call, call_id } = await req.json();

    if (!user_id || !title) {
      return new Response(JSON.stringify({ error: "user_id and title required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKeyPem = Deno.env.get("VAPID_PRIVATE_KEY");

    if (!vapidPublicKey || !vapidPrivateKeyPem) {
      return new Response(JSON.stringify({ error: "VAPID keys not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get user's push subscriptions
    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", user_id);

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no subscriptions" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payloadObj: Record<string, any> = { title, body: body || "", url: url || "/" };
    if (is_call) { payloadObj.is_call = true; payloadObj.call_id = call_id; }
    const payload = JSON.stringify(payloadObj);

    // Also insert a notification row so it appears in the notification bell
    // Skip if this is a call push — the dm-call-token function already inserts a call notification
    if (!is_call) {
      try {
        await supabase.from("notifications").insert({
          user_id,
          title,
          message: body || "",
          type: "info",
        });
      } catch (notifErr) {
        console.warn("Failed to insert notification row:", notifErr);
      }
    }

    const { privateKey } = await importVapidKeys(vapidPublicKey, vapidPrivateKeyPem);

    let sent = 0;
    const expiredIds: string[] = [];

    for (const sub of subscriptions) {
      const ok = await sendPushNotification(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        payload,
        vapidPublicKey,
        privateKey
      );
      if (ok) {
        sent++;
      } else {
        expiredIds.push(sub.id);
      }
    }

    // Clean up expired subscriptions
    if (expiredIds.length > 0) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .in("id", expiredIds);
    }

    return new Response(JSON.stringify({ sent, expired: expiredIds.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err instanceof Error ? err.message : String(err)) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
