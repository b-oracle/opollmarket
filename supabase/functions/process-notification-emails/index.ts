// Drains the notification_email_outbox table:
//   - Atomically claims due jobs (FOR UPDATE SKIP LOCKED via RPC)
//   - Sends each through the managed email helper
//   - On success: status=sent
//   - On failure: exponential backoff, requeue until max_attempts, then DLQ
// Designed to be invoked frequently by pg_cron. Safe to run concurrently.

import { createClient } from "@supabase/supabase-js";
import { EmailAPIError } from "npm:@lovable.dev/email-js@0.3.1";
import { sendTemplateEmail } from "../_shared/transactional-email-templates/send-email.ts";
import { logEmailSend } from "../_shared/emailSendLog.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BATCH_SIZE = 25;

// Exponential backoff: 1m, 2m, 5m, 15m, 1h, 6h
const BACKOFF_MINUTES = [1, 2, 5, 15, 60, 360];

interface OutboxRow {
  id: string;
  idempotency_key: string;
  template_name: string;
  recipient_email: string | null;
  template_data: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  // Claim a batch of due jobs atomically.
  const { data: jobs, error: claimErr } = await admin.rpc(
    "claim_notification_email_outbox",
    { _limit: BATCH_SIZE },
  );

  if (claimErr) {
    console.error("claim failed", claimErr);
    return json({ error: "claim_failed", details: claimErr.message }, 500);
  }

  const rows = (jobs as OutboxRow[]) ?? [];
  let sent = 0;
  let retried = 0;
  let dlq = 0;

  await Promise.all(
    rows.map(async (job) => {
      try {
        if (!job.recipient_email) {
          await markFinal(admin, job.id, "skipped", "no recipient_email");
          return;
        }

        try {
          const result = await sendTemplateEmail(job.template_name, job.recipient_email, {
            templateData: job.template_data ?? {},
            idempotencyKey: job.idempotency_key,
          });
          if (!result.sent) {
            await logEmailSend(admin, {
              template_name: job.template_name,
              recipient_email: job.recipient_email,
              status: "suppressed",
            });
            await markFinal(admin, job.id, "skipped", "recipient_suppressed");
            return;
          }
        } catch (sendErr) {
          const msg = (sendErr as Error).message ?? String(sendErr);
          await logEmailSend(admin, {
            template_name: job.template_name,
            recipient_email: job.recipient_email,
            status: "failed",
            error_message: msg.slice(0, 1000),
          });
          const status = sendErr instanceof EmailAPIError ? sendErr.status : 500;
          const transient = !status || status >= 500 || status === 408 || status === 425 || status === 429;
          if (!transient) {
            await markFinal(admin, job.id, "dlq", `HTTP ${status}: ${msg.slice(0, 500)}`);
            dlq++;
            return;
          }
          await scheduleRetry(admin, job, `HTTP ${status}: ${msg.slice(0, 500)}`);
          retried++;
          return;
        }

        await logEmailSend(admin, {
          template_name: job.template_name,
          recipient_email: job.recipient_email,
          status: "sent",
        });
        await admin
          .from("notification_email_outbox")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            last_error: null,
          })
          .eq("id", job.id);
        sent++;
      } catch (err) {
        await scheduleRetry(admin, job, (err as Error).message ?? String(err));
        retried++;
      }
    }),
  );

  return json({ claimed: rows.length, sent, retried, dlq });
});

async function scheduleRetry(
  // deno-lint-ignore no-explicit-any
  admin: any,
  job: OutboxRow,
  reason: string,
) {
  if (job.attempts >= job.max_attempts) {
    await markFinal(admin, job.id, "dlq", reason);
    return;
  }
  const idx = Math.min(job.attempts - 1, BACKOFF_MINUTES.length - 1);
  const delayMs = BACKOFF_MINUTES[Math.max(0, idx)] * 60_000;
  await admin
    .from("notification_email_outbox")
    .update({
      status: "pending",
      next_attempt_at: new Date(Date.now() + delayMs).toISOString(),
      last_error: reason.slice(0, 1000),
      locked_at: null,
    })
    .eq("id", job.id);
}

async function markFinal(
  // deno-lint-ignore no-explicit-any
  admin: any,
  id: string,
  status: "sent" | "dlq" | "skipped",
  reason: string | null,
) {
  await admin
    .from("notification_email_outbox")
    .update({
      status,
      last_error: reason ? reason.slice(0, 1000) : null,
      locked_at: null,
    })
    .eq("id", id);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
