// Shared helper to send a transactional notification email respecting user preferences.
// All errors are swallowed and logged — emails should never break critical flows.
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
    // Pull profile email + settings preference
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

    // Default = enabled if no row yet
    const enabled = settings == null ? true : ((settings as any)[prefKey] ?? true);
    if (!enabled) return;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const res = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({
        templateName,
        recipientEmail: email,
        idempotencyKey,
        templateData: templateData ?? {},
      }),
    });

    if (!res.ok) {
      console.warn("sendNotificationEmail: non-2xx", templateName, res.status, await res.text().catch(() => ""));
    }
  } catch (err) {
    console.warn("sendNotificationEmail failed", templateName, err);
  }
}
