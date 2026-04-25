// Shared helper to write structured webhook processing events
// to public.webhook_logs. Failures are swallowed so logging never
// breaks the actual webhook flow.

// Use a permissive type so the Supabase JS client (whose `insert` returns a
// thenable PostgrestBuilder, not a real Promise) is accepted without TS friction.
// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

export type WebhookLogStatus = "info" | "success" | "warning" | "error";

export type WebhookLogEntry = {
  provider: "payaza" | "nowpayments" | "flutterwave" | string;
  event_type: string;
  status?: WebhookLogStatus;
  reference?: string | null;
  transaction_id?: string | null;
  user_id?: string | null;
  requested_amount?: number | null;
  credited_amount?: number | null;
  bonus_amount?: number | null;
  message?: string | null;
  payload?: unknown;
  error?: unknown;
};

export async function logWebhookEvent(
  supabase: SupabaseLike,
  entry: WebhookLogEntry,
): Promise<void> {
  try {
    const row: Record<string, unknown> = {
      provider: entry.provider,
      event_type: entry.event_type,
      status: entry.status ?? "info",
    };

    if (entry.reference !== undefined) row.reference = entry.reference;
    if (entry.transaction_id !== undefined) row.transaction_id = entry.transaction_id;
    if (entry.user_id !== undefined) row.user_id = entry.user_id;
    if (entry.requested_amount !== undefined && entry.requested_amount !== null) {
      row.requested_amount = entry.requested_amount;
    }
    if (entry.credited_amount !== undefined && entry.credited_amount !== null) {
      row.credited_amount = entry.credited_amount;
    }
    if (entry.bonus_amount !== undefined && entry.bonus_amount !== null) {
      row.bonus_amount = entry.bonus_amount;
    }
    if (entry.message !== undefined) row.message = entry.message;
    if (entry.payload !== undefined) row.payload = safePayload(entry.payload);
    if (entry.error !== undefined) {
      row.error = stringifyError(entry.error);
      const stack = extractStack(entry.error);
      if (stack) row.stack = stack;
    }

    const { error } = await supabase.from("webhook_logs").insert(row);
    if (error) console.error("logWebhookEvent insert failed:", error);
  } catch (e) {
    console.error("logWebhookEvent threw:", e);
  }
}

function extractStack(err: unknown): string | null {
  if (err instanceof Error && err.stack) {
    return err.stack.length > 6000 ? err.stack.slice(0, 6000) + "\n…(truncated)" : err.stack;
  }
  return null;
}

// Field names whose values must NEVER be persisted in plaintext.
// Matched case-insensitively against the FULL key (after normalising to lowercase
// + stripping non-alphanumeric chars), so "ipn-secret", "IPN_SECRET" and
// "ipnSecret" all collapse to "ipnsecret".
const SENSITIVE_KEY_PATTERNS: RegExp[] = [
  /(^|_)(secret|password|passwd|pwd|pin|otp|cvv|cvc)($|_)/,
  /(^|_)(token|apikey|api_key|access_key|private_key|signing_key|webhook_secret)($|_)/,
  /(^|_)(authorization|authentication|auth_header|bearer)($|_)/,
  /(^|_)(ipn_secret|hmac|signature|sig|hash_signature|x_signature)($|_)/,
  /(^|_)(card_number|pan|cvn|expiry|expirydate|cvv2|account_number|iban|swift|routing_number)($|_)/,
  /(^|_)(ssn|tax_id|nin|bvn)($|_)/,
];

const PII_KEY_PATTERNS: RegExp[] = [
  /(^|_)(email|email_address|customer_email)($|_)/,
  /(^|_)(phone|phone_number|mobile|msisdn|customer_phone)($|_)/,
  /(^|_)(full_name|first_name|last_name|customer_name|account_name|holder_name)($|_)/,
  /(^|_)(address|street|city|postal_code|zip|zipcode|country_code)($|_)/,
];

const REDACTED_VALUE = "[REDACTED]";
const MAX_PAYLOAD_BYTES = 8000;
const MAX_DEPTH = 8;

function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function classifyKey(key: string): "secret" | "pii" | null {
  const k = normaliseKey(key);
  // Wrap in underscores so anchored ($|_) patterns hit on bare keys too
  const padded = `_${k}_`;
  if (SENSITIVE_KEY_PATTERNS.some((re) => re.test(padded))) return "secret";
  if (PII_KEY_PATTERNS.some((re) => re.test(padded))) return "pii";
  return null;
}

function maskString(value: string, kind: "secret" | "pii"): string {
  if (kind === "secret") return REDACTED_VALUE;
  // PII: keep enough to recognise without leaking the full identifier.
  if (value.length <= 4) return REDACTED_VALUE;
  if (value.includes("@")) {
    const [local, domain] = value.split("@");
    const head = local.slice(0, Math.min(2, local.length));
    return `${head}***@${domain}`;
  }
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function redactValue(value: unknown, kind: "secret" | "pii"): unknown {
  if (value == null) return value;
  if (typeof value === "string") return maskString(value, kind);
  if (typeof value === "number" || typeof value === "boolean") {
    return kind === "secret" ? REDACTED_VALUE : value;
  }
  // Object/array under a sensitive key → drop entirely
  return REDACTED_VALUE;
}

export function redactPayload(input: unknown, depth = 0): unknown {
  if (input == null || depth > MAX_DEPTH) return input;
  if (Array.isArray(input)) return input.map((v) => redactPayload(v, depth + 1));
  if (typeof input !== "object") return input;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const kind = classifyKey(key);
    if (kind) {
      out[key] = redactValue(value, kind);
    } else if (value && typeof value === "object") {
      out[key] = redactPayload(value, depth + 1);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function safePayload(value: unknown): unknown {
  try {
    const redacted = redactPayload(value);
    const str = JSON.stringify(redacted);
    if (str.length > MAX_PAYLOAD_BYTES) {
      return {
        _truncated: true,
        _redacted: true,
        preview: str.slice(0, MAX_PAYLOAD_BYTES),
      };
    }
    // Wrap so admin UI can show a "redacted" notice without losing original shape.
    return { _redacted: true, data: redacted };
  } catch {
    return { _unserializable: true, _redacted: true };
  }
}

function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
