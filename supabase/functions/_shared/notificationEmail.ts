// Shared helper to enqueue a transactional notification email into the
// durable outbox. Actual HTTP delivery happens in `process-notification-emails`
// with retries + dead-letter queue. This way a transient failure (5xx,
// timeout, rate-limit) cannot drop a critical user notification.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

type AdminClient = ReturnType<typeof createClient>;

export type EmailPrefKey =
  | "email_market_won"
  | "email_market_lost"
  | "email_market_expired_creator"
  | "email_deposit_completed"
  | "email_withdrawal_completed";

interface SendArgs {
  admin: AdminClient;
  userId: string;
  templateName: string;
  prefKey: EmailPrefKey;
  idempotencyKey: string;
  templateData?: Record<string, unknown>;
}

export async function sendNotificationEmail({
  admin,
  userId,
  templateName,
  prefKey,
  idempotencyKey,
  templateData,
}: SendArgs): Promise<void> {
  try {
    // Resolve recipient email + preference at enqueue time (cheap, and lets
    // us short-circuit unsubscribed/no-email users without a queue slot).
    const [{ data: profile }, { data: settings }] = await Promise.all([
      admin.from("profiles").select("email").eq("id", userId).maybeSingle(),
      admin
        .from("user_settings")
        .select(prefKey)
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    const email = (profile as any)?.email as string | undefined;
    if (!email) return;

    const enabled = settings == null ? true : ((settings as any)[prefKey] ?? true);
    if (!enabled) return;

    // Insert into outbox; ON CONFLICT (idempotency_key) DO NOTHING gives us
    // dedup across cron re-runs, webhook redeliveries, and edge retries.
    const { error } = await admin
      .from("notification_email_outbox")
      .insert({
        idempotency_key: idempotencyKey,
        template_name: templateName,
        user_id: userId,
        recipient_email: email,
        template_data: templateData ?? {},
        pref_key: prefKey,
      });

    if (error && (error as any).code !== "23505") {
      // 23505 = unique_violation = already enqueued, expected
      console.warn("sendNotificationEmail enqueue failed", templateName, error);
    }
  } catch (err) {
    console.warn("sendNotificationEmail failed", templateName, err);
  }
}
