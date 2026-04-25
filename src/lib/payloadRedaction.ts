// Client-side redaction for webhook payloads displayed in admin UIs.
// Mirrors the server-side rules in supabase/functions/_shared/webhookLog.ts so:
//   • newly written payloads are double-checked at render time, and
//   • historical (pre-redaction) rows are still safe to display.
//
// Server is the source of truth — this is defense-in-depth, NOT a substitute
// for stripping sensitive data before it ever reaches the database.

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
const MAX_DEPTH = 8;

function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function classifyKey(key: string): "secret" | "pii" | null {
  const padded = `_${normaliseKey(key)}_`;
  if (SENSITIVE_KEY_PATTERNS.some((re) => re.test(padded))) return "secret";
  if (PII_KEY_PATTERNS.some((re) => re.test(padded))) return "pii";
  return null;
}

function maskString(value: string, kind: "secret" | "pii"): string {
  if (kind === "secret") return REDACTED_VALUE;
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

/** True when the payload was already redacted server-side. */
export function wasServerRedacted(payload: unknown): boolean {
  return (
    typeof payload === "object" &&
    payload !== null &&
    (payload as Record<string, unknown>)._redacted === true
  );
}

/** Safe JSON for admin display — re-redacts client-side as a guard. */
export function formatRedactedPayload(payload: unknown): string {
  return JSON.stringify(redactPayload(payload), null, 2);
}
