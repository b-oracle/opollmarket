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
      .select("id, token")
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

    for (const row of tokens) {
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
              headers: { "apns-priority": "10" },
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
