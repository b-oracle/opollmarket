import { nextRetryAt, MAX_ATTEMPTS } from "./webhookRetry.ts";

// deno-lint-ignore no-explicit-any
type Supa = any;

async function hmacSign(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return "sha256=" + hex;
}

export interface DeliverParams {
  webhookUrl: string;
  webhookSecret: string | null;
  eventType: string;
  payload: unknown;
}

export interface DeliverResult {
  ok: boolean;
  status?: number;
  error?: string;
}

/** Fire a single HTTP delivery with HMAC signing + 10s timeout. */
export async function deliverWebhook(p: DeliverParams): Promise<DeliverResult> {
  // Validate URL protocol
  try {
    const u = new URL(p.webhookUrl);
    if (!["https:", "http:"].includes(u.protocol)) {
      return { ok: false, error: "invalid_protocol" };
    }
  } catch {
    return { ok: false, error: "invalid_url" };
  }

  const bodyStr = JSON.stringify(p.payload);
  let signature = "v1_unsigned";
  if (p.webhookSecret) {
    try {
      signature = await hmacSign(p.webhookSecret, bodyStr);
    } catch {
      signature = "v1_sign_error";
    }
  }

  try {
    const resp = await Promise.race([
      fetch(p.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-OPOLL-Event": p.eventType,
          "X-OPOLL-Signature": signature,
        },
        body: bodyStr,
      }),
      new Promise<Response>((_, rej) => setTimeout(() => rej(new Error("timeout")), 10000)),
    ]);
    return { ok: resp.ok, status: resp.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Record the result of a delivery attempt against a webhook_events row.
 * - On success → status="delivered", clears next_retry_at.
 * - On failure → schedules next attempt via exponential backoff,
 *   or marks "dead_letter" once retries are exhausted.
 */
export async function recordAttempt(
  admin: Supa,
  eventId: string,
  prevAttempts: number,
  result: DeliverResult,
): Promise<void> {
  const newAttempts = prevAttempts + 1;
  const nowIso = new Date().toISOString();

  if (result.ok) {
    await admin
      .from("webhook_events")
      .update({
        status: "delivered",
        response_code: result.status ?? null,
        attempts: newAttempts,
        last_attempt_at: nowIso,
        next_retry_at: null,
        last_error: null,
      })
      .eq("id", eventId);
    return;
  }

  const next = nextRetryAt(newAttempts);
  const exhausted = next === null;
  await admin
    .from("webhook_events")
    .update({
      status: exhausted ? "dead_letter" : "failed",
      response_code: result.status ?? null,
      attempts: newAttempts,
      last_attempt_at: nowIso,
      next_retry_at: next,
      last_error: result.error ?? (result.status ? `HTTP ${result.status}` : "unknown"),
    })
    .eq("id", eventId);
}

export { MAX_ATTEMPTS };
