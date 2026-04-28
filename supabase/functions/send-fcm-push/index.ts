// Sends a high-priority FCM push via HTTP v1 API (OAuth2 service account auth).
// Required secrets:
//   FCM_SERVICE_ACCOUNT_JSON — full service account JSON from Firebase Console
//   FCM_PROJECT_ID           — Firebase project ID (e.g. "opollmarket-e7a92")
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---- Diagnostics helpers -------------------------------------------------

function hintForFcmError(
  httpStatus: number,
  errStatus: string | null,
  errCode: string | null,
): string | null {
  if (httpStatus === 401 || httpStatus === 403) {
    return "OAuth2 token rejected. Confirm FCM_SERVICE_ACCOUNT_JSON belongs to FCM_PROJECT_ID and that the service account has 'Firebase Cloud Messaging API' enabled in Google Cloud.";
  }
  if (errCode === "UNREGISTERED" || errStatus === "NOT_FOUND") {
    return "Token is no longer valid (uninstalled/cleared). The token will be deleted from user_fcm_tokens automatically on the next live send.";
  }
  if (errCode === "INVALID_ARGUMENT") {
    return "Token format is wrong, or it was registered against a different Firebase project than FCM_PROJECT_ID. Re-register the device or fix FCM_PROJECT_ID.";
  }
  if (errCode === "SENDER_ID_MISMATCH") {
    return "The device token was issued by a different Firebase Sender ID. Make sure google-services.json on the device matches the project owning FCM_SERVICE_ACCOUNT_JSON.";
  }
  if (errCode === "QUOTA_EXCEEDED") {
    return "Per-project send quota hit. Slow down or request a quota increase in Google Cloud.";
  }
  if (errCode === "UNAVAILABLE" || errStatus === "UNAVAILABLE") {
    return "FCM service temporarily unavailable. Retry with backoff.";
  }
  if (errCode === "THIRD_PARTY_AUTH_ERROR") {
    return "APNs auth failed (iOS). Check the APNs key uploaded in Firebase Console matches the bundle ID.";
  }
  return null;
}

// ---- Google OAuth2 token (service-account JWT bearer) --------------------

let cachedToken: { token: string; expiresAt: number } | null = null;

function base64url(bytes: Uint8Array): string {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function strToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function pemToDer(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getAccessToken(sa: {
  client_email: string;
  private_key: string;
}): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encHeader = base64url(strToBytes(JSON.stringify(header)));
  const encClaim = base64url(strToBytes(JSON.stringify(claim)));
  const toSign = `${encHeader}.${encClaim}`;

  const keyDer = pemToDer(sa.private_key.replace(/\\n/g, "\n"));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyDer.buffer.slice(keyDer.byteOffset, keyDer.byteOffset + keyDer.byteLength) as ArrayBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const toSignBytes = strToBytes(toSign);
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      toSignBytes.buffer.slice(toSignBytes.byteOffset, toSignBytes.byteOffset + toSignBytes.byteLength) as ArrayBuffer,
    ),
  );
  const jwt = `${toSign}.${base64url(sig)}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new Error(
      `OAuth2 token error: ${tokenRes.status} ${JSON.stringify(tokenJson)}`,
    );
  }

  cachedToken = {
    token: tokenJson.access_token,
    expiresAt: Date.now() + (tokenJson.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}

// ---- Direct APNs (HTTP/2) — required for VoIP/PushKit -------------------
//
// FCM cannot relay VoIP pushes. To wake a killed iOS app and trigger CallKit
// you must POST directly to api.push.apple.com with `apns-push-type: voip`
// and the `<bundleId>.voip` topic. We sign with a JWT (ES256) using an APNs
// auth key (.p8) so we don't have to manage a TLS client certificate.
//
// Required secrets (only needed for iOS VoIP delivery; non-VoIP paths still
// work fine through FCM without these):
//   APNS_AUTH_KEY_P8 — contents of the AuthKey_<KeyID>.p8 file
//   APNS_KEY_ID      — 10-char Key ID from Apple Developer
//   APNS_TEAM_ID     — 10-char Team ID from Apple Developer
//   APNS_BUNDLE_ID   — iOS bundle id (defaults to com.opollmarket.app)
//   APNS_USE_SANDBOX — "1" to use api.sandbox.push.apple.com (debug builds)

let cachedApnsJwt: { token: string; expiresAt: number } | null = null;

async function getApnsJwt(): Promise<string | null> {
  const p8 = Deno.env.get("APNS_AUTH_KEY_P8");
  const keyId = Deno.env.get("APNS_KEY_ID");
  const teamId = Deno.env.get("APNS_TEAM_ID");
  if (!p8 || !keyId || !teamId) return null;

  // APNs JWTs MUST be refreshed at least every 60 minutes (and cannot be
  // refreshed more often than every 20 minutes).
  if (cachedApnsJwt && cachedApnsJwt.expiresAt > Date.now() + 5 * 60_000) {
    return cachedApnsJwt.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const claim = { iss: teamId, iat: now };
  const encHeader = base64url(strToBytes(JSON.stringify(header)));
  const encClaim = base64url(strToBytes(JSON.stringify(claim)));
  const toSign = `${encHeader}.${encClaim}`;

  const keyDer = pemToDer(p8.replace(/\\n/g, "\n"));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyDer.buffer.slice(keyDer.byteOffset, keyDer.byteOffset + keyDer.byteLength) as ArrayBuffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const toSignBytes = strToBytes(toSign);
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      cryptoKey,
      toSignBytes.buffer.slice(toSignBytes.byteOffset, toSignBytes.byteOffset + toSignBytes.byteLength) as ArrayBuffer,
    ),
  );
  const jwt = `${toSign}.${base64url(sig)}`;
  cachedApnsJwt = { token: jwt, expiresAt: Date.now() + 50 * 60_000 };
  return jwt;
}

async function sendVoipApns(opts: {
  deviceToken: string;
  bundleId: string;
  payload: Record<string, unknown>;
}): Promise<{ ok: boolean; status: number; reason?: string; error?: string }> {
  const jwt = await getApnsJwt();
  if (!jwt) {
    return {
      ok: false,
      status: 0,
      reason: "MissingApnsCredentials",
      error: "APNS_AUTH_KEY_P8 / APNS_KEY_ID / APNS_TEAM_ID not configured",
    };
  }
  const host = Deno.env.get("APNS_USE_SANDBOX") === "1"
    ? "api.sandbox.push.apple.com"
    : "api.push.apple.com";
  const url = `https://${host}/3/device/${opts.deviceToken}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `bearer ${jwt}`,
        "apns-topic": `${opts.bundleId}.voip`,
        "apns-push-type": "voip",
        "apns-priority": "10",
        "apns-expiration": "0",
        "content-type": "application/json",
      },
      body: JSON.stringify(opts.payload),
    });
    if (res.ok) return { ok: true, status: res.status };
    const body = await res.text().catch(() => "");
    let reason: string | undefined;
    try {
      reason = JSON.parse(body)?.reason;
    } catch { /* not JSON */ }
    return { ok: false, status: res.status, reason, error: body.slice(0, 500) };
  } catch (e) {
    return { ok: false, status: 0, error: (e as Error).message };
  }
}

// ---- Handler -------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload = await req.json();
    const { user_id, title, body, data, is_call, call_id, url, test } = payload;

    // Diagnostic mode: verify credentials + OAuth2 token, and optionally
    // attempt a dry-run send to a supplied token so admins can see the exact
    // FCM error code/message.
    if (test) {
      const saJsonRaw = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
      const projectId = Deno.env.get("FCM_PROJECT_ID");
      const diag: Record<string, unknown> = {
        has_service_account: !!saJsonRaw,
        has_project_id: !!projectId,
        project_id: projectId ?? null,
      };
      if (!saJsonRaw || !projectId) {
        return new Response(JSON.stringify({ ok: false, stage: "env", ...diag }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      let sa: { client_email: string; private_key: string };
      try {
        sa = JSON.parse(saJsonRaw);
      } catch (e) {
        return new Response(
          JSON.stringify({ ok: false, stage: "parse_sa", error: (e as Error).message, ...diag }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      diag.client_email = sa.client_email ?? null;

      let accessToken: string;
      try {
        accessToken = await getAccessToken(sa);
      } catch (e) {
        return new Response(
          JSON.stringify({ ok: false, stage: "oauth2", error: (e as Error).message, ...diag }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      diag.oauth2_ok = true;

      // Dry-run validate_only send so no actual notification is delivered.
      const testToken = typeof test === "string" ? test : (payload.token as string | undefined);
      if (testToken) {
        const res = await fetch(
          `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              validate_only: true,
              message: {
                token: testToken,
                notification: { title: "test", body: "test" },
              },
            }),
          },
        );
        const json = await res.json().catch(() => ({}));
        const errStatus = json?.error?.status || null;
        const errCode = json?.error?.details?.[0]?.errorCode || null;
        const errMessage = json?.error?.message || null;
        return new Response(
          JSON.stringify({
            ok: res.ok,
            stage: "fcm_send",
            http_status: res.status,
            fcm_error_status: errStatus,
            fcm_error_code: errCode,
            fcm_error_message: errMessage,
            hint: hintForFcmError(res.status, errStatus, errCode),
            fcm_response: json,
            ...diag,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(JSON.stringify({ ok: true, stage: "oauth2", ...diag }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!user_id || !title) {
      return new Response(JSON.stringify({ error: "user_id and title required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const saJsonRaw = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
    const projectId = Deno.env.get("FCM_PROJECT_ID");

    if (!saJsonRaw || !projectId) {
      // Non-fatal: web push still works via send-push
      return new Response(
        JSON.stringify({
          sent: 0,
          reason: "FCM_SERVICE_ACCOUNT_JSON or FCM_PROJECT_ID not configured",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let sa: { client_email: string; private_key: string };
    try {
      sa = JSON.parse(saJsonRaw);
    } catch {
      return new Response(
        JSON.stringify({ error: "FCM_SERVICE_ACCOUNT_JSON is not valid JSON" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!sa.client_email || !sa.private_key) {
      return new Response(
        JSON.stringify({ error: "Service account JSON missing client_email or private_key" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const accessToken = await getAccessToken(sa);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: tokens } = await supabase
      .from("user_fcm_tokens")
      .select("id, token, platform, token_type")
      .eq("user_id", user_id);

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no native tokens" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const expired: string[] = [];
    const results: Array<{
      token_id: string;
      token_tail: string;
      ok: boolean;
      http_status: number;
      fcm_error_status: string | null;
      fcm_error_code: string | null;
      fcm_error_message: string | null;
      hint: string | null;
      removed: boolean;
    }> = [];
    let sent = 0;

    // FCM v1 is single-token per request. Fan out sequentially.
    const stringifiedData: Record<string, string> = {
      url: url || "/",
      is_call: is_call ? "true" : "false",
      call_id: call_id || "",
    };
    if (data && typeof data === "object") {
      for (const [k, v] of Object.entries(data)) {
        stringifiedData[k] = typeof v === "string" ? v : JSON.stringify(v);
      }
    }

    // iOS bundle id used as apns-topic. For VoIP pushes the topic MUST be
    // suffixed with `.voip`. We default to the canonical app bundle id but
    // allow override via APNS_BUNDLE_ID secret for staging builds.
    const apnsBundleId =
      Deno.env.get("APNS_BUNDLE_ID") || "com.opollmarket.app";

    for (const row of tokens) {
      // ── iOS VoIP branch ────────────────────────────────────────────────
      // VoIP pushes cannot be relayed through FCM — they MUST be delivered
      // directly to APNs (`api.push.apple.com`) with `apns-push-type: voip`
      // and the `.voip` topic suffix. They are the only push type that can
      // reliably wake a killed iOS app and legally trigger CallKit's
      // full-screen incoming-call UI.
      if (
        is_call &&
        row.platform === "ios" &&
        row.token_type === "voip"
      ) {
        const apnsRes = await sendVoipApns({
          deviceToken: row.token,
          bundleId: apnsBundleId,
          payload: {
            aps: { "content-available": 1 },
            type: "incoming_call",
            call_id: stringifiedData.call_id || "",
            caller_id: stringifiedData.caller_id || "",
            caller_name: stringifiedData.caller_name || String(title),
            caller_avatar: stringifiedData.caller_avatar || "",
            conversation_id: stringifiedData.conversation_id || "",
            has_video: stringifiedData.has_video === "true",
          },
        });

        const tokenTail = row.token ? `…${row.token.slice(-12)}` : "";
        let removed = false;
        if (apnsRes.ok) {
          sent++;
        } else if (apnsRes.status === 410 || apnsRes.reason === "BadDeviceToken" || apnsRes.reason === "Unregistered") {
          expired.push(row.id);
          removed = true;
        } else {
          console.warn("APNs VoIP send error:", apnsRes.status, apnsRes.reason, apnsRes.error);
        }
        results.push({
          token_id: row.id,
          token_tail: tokenTail,
          ok: apnsRes.ok,
          http_status: apnsRes.status,
          fcm_error_status: apnsRes.reason || null,
          fcm_error_code: apnsRes.reason || null,
          fcm_error_message: apnsRes.error || null,
          hint: apnsRes.ok
            ? null
            : "Direct APNs VoIP push failed. Check APNS_AUTH_KEY_P8 / APNS_KEY_ID / APNS_TEAM_ID / APNS_BUNDLE_ID secrets and that the device VoIP token is registered against the same team/bundle.",
          removed,
        });
        try {
          await supabase.from("push_delivery_logs").insert({
            user_id,
            token_id: row.id,
            token_tail: tokenTail,
            title: String(title),
            body: body ? String(body) : null,
            is_call: true,
            call_id: call_id || null,
            ok: apnsRes.ok,
            http_status: apnsRes.status,
            fcm_error_status: apnsRes.reason || null,
            fcm_error_code: apnsRes.reason || null,
            fcm_error_message: apnsRes.error || null,
            hint: apnsRes.ok ? null : "voip-apns",
            removed,
          });
        } catch (logErr) {
          console.warn("push_delivery_logs insert failed:", (logErr as Error).message);
        }
        continue;
      }

      // For calls: send a DATA-ONLY message so our Android
      // FirebaseMessagingService always handles it and can trigger a
      // full-screen intent (ConnectionService/CallKit-style lockscreen UI).
      // For non-calls: keep notification+data so the system tray handles display.
      const message: Record<string, unknown> = is_call
        ? {
            token: row.token,
            data: {
              ...stringifiedData,
              type: "incoming_call",
              title: String(title),
              body: String(body || ""),
              caller_id: stringifiedData.caller_id || "",
              caller_name: stringifiedData.caller_name || String(title),
              caller_avatar: stringifiedData.caller_avatar || "",
            },
            android: {
              priority: "HIGH",
              // no `notification` block — data-only so our service runs
              ttl: "45s",
            },
            apns: {
              headers: {
                "apns-priority": "10",
                "apns-push-type": "alert",
                // Required by APNs HTTP/2; FCM normally injects this from
                // the bundle id, but we set it explicitly for safety.
                "apns-topic": apnsBundleId,
              },
              payload: {
                aps: {
                  alert: {
                    title: String(title),
                    body: String(body || "Incoming call"),
                  },
                  sound: "ringtone.caf",
                  // Matches the UNNotificationCategory we register on the
                  // client (LocalNotifications.registerActionTypes), so iOS
                  // shows Accept / Mute / Decline buttons on the lockscreen
                  // and notification center — same flow as Android.
                  category: "INCOMING_CALL",
                  "mutable-content": 1,
                  "interruption-level": "time-sensitive",
                },
              },
            },
          }
        : {
            token: row.token,
            notification: { title, body: body || "" },
            data: stringifiedData,
            android: {
              priority: "HIGH",
              notification: {
                channel_id: "default",
                sound: "default",
                click_action: "FCM_PLUGIN_ACTIVITY",
              },
            },
            apns: {
              headers: {
                "apns-priority": "10",
                "apns-topic": apnsBundleId,
              },
              payload: {
                aps: {
                  sound: "default",
                  "content-available": 1,
                  // Missed-call pushes get a "View chat" action button on
                  // iOS via the MISSED_CALL UNNotificationCategory we
                  // register on the client.
                  ...(stringifiedData.type === "call_missed"
                    ? { category: "MISSED_CALL" }
                    : {}),
                },
              },
            },
          };

      const res = await fetch(
        `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message }),
        },
      );

      const json = await res.json().catch(() => ({}));
      const errStatus = json?.error?.status || null;
      const errCode = json?.error?.details?.[0]?.errorCode || null;
      const errMessage = json?.error?.message || null;
      const tokenTail = row.token ? `…${row.token.slice(-12)}` : "";
      let removed = false;

      if (res.ok) {
        sent++;
      } else {
        if (
          errStatus === "NOT_FOUND" ||
          errCode === "UNREGISTERED" ||
          errCode === "INVALID_ARGUMENT"
        ) {
          expired.push(row.id);
          removed = true;
        } else {
          console.warn("FCM v1 send error:", res.status, JSON.stringify(json));
        }
      }

      const hint = res.ok ? null : hintForFcmError(res.status, errStatus, errCode);

      results.push({
        token_id: row.id,
        token_tail: tokenTail,
        ok: res.ok,
        http_status: res.status,
        fcm_error_status: errStatus,
        fcm_error_code: errCode,
        fcm_error_message: errMessage,
        hint,
        removed,
      });

      // Persist delivery log (best-effort; never block the send loop on it)
      try {
        await supabase.from("push_delivery_logs").insert({
          user_id,
          token_id: row.id,
          token_tail: tokenTail,
          title: String(title),
          body: body ? String(body) : null,
          is_call: !!is_call,
          call_id: call_id || null,
          ok: res.ok,
          http_status: res.status,
          fcm_error_status: errStatus,
          fcm_error_code: errCode,
          fcm_error_message: errMessage,
          hint,
          removed,
        });
      } catch (logErr) {
        console.warn("push_delivery_logs insert failed:", (logErr as Error).message);
      }
    }

    if (expired.length > 0) {
      await supabase.from("user_fcm_tokens").delete().in("id", expired);
    }

    return new Response(
      JSON.stringify({ sent, expired: expired.length, results }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("send-fcm-push error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
