// Appends a row to email_send_log. Never decides a send result — failures are
// only logged. Status strings must match the table's CHECK constraint.
// deno-lint-ignore no-explicit-any
type AnyClient = any;

export async function logEmailSend(
  admin: AnyClient,
  row: {
    template_name: string;
    recipient_email: string;
    status: "sent" | "suppressed" | "failed";
    error_message?: string | null;
  },
): Promise<void> {
  try {
    const { error } = await admin.from("email_send_log").insert({
      message_id: null,
      template_name: row.template_name,
      recipient_email: row.recipient_email,
      status: row.status,
      error_message: row.error_message ?? null,
    });
    if (error) {
      console.error("email_send_log insert failed", { code: error.code, message: error.message });
    }
  } catch (e) {
    console.error("email_send_log insert threw", (e as Error).message);
  }
}
