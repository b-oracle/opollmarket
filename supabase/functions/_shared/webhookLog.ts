// Shared helper to write structured webhook processing events
// to public.webhook_logs. Failures are swallowed so logging never
// breaks the actual webhook flow.

type SupabaseLike = {
  from: (table: string) => {
    insert: (rows: Record<string, unknown> | Record<string, unknown>[]) => Promise<{ error: unknown }>;
  };
};

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
    if (entry.error !== undefined) row.error = stringifyError(entry.error);

    const { error } = await supabase.from("webhook_logs").insert(row);
    if (error) console.error("logWebhookEvent insert failed:", error);
  } catch (e) {
    console.error("logWebhookEvent threw:", e);
  }
}

function safePayload(value: unknown): unknown {
  try {
    // Truncate huge payloads so the row stays manageable.
    const str = JSON.stringify(value);
    if (str.length > 8000) {
      return { _truncated: true, preview: str.slice(0, 8000) };
    }
    return value;
  } catch {
    return { _unserializable: true };
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
