// Drains the notification_email_outbox table:
//   - Atomically claims due jobs (FOR UPDATE SKIP LOCKED via RPC)
//   - Calls send-transactional-email for each
//   - On success: status=sent
//   - On failure: exponential backoff, requeue until max_attempts, then DLQ
// Designed to be invoked frequently by pg_cron. Safe to run concurrently.

import { createClient } from "@supabase/supabase-js";

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

        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/send-transactional-email`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SERVICE_ROLE}`,
              apikey: SERVICE_ROLE,
            },
            body: JSON.stringify({
              templateName: job.template_name,
              recipientEmail: job.recipient_email,
              idempotencyKey: job.idempotency_key,
              templateData: job.template_data ?? {},
            }),
          },
        );

        if (res.ok) {
          await admin
            .from("notification_email_outbox")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              last_error: null,
            })
            .eq("id", job.id);
          sent++;
          return;
        }

        const body = await res.text().catch(() => "");
        // 4xx (except 408/425/429) = permanent — straight to DLQ.
        const transient =
          res.status >= 500 || res.status === 408 || res.status === 425 || res.status === 429;
        if (!transient) {
          await markFinal(admin, job.id, "dlq", `HTTP ${res.status}: ${body.slice(0, 500)}`);
          dlq++;
          return;
        }
        await scheduleRetry(admin, job, `HTTP ${res.status}: ${body.slice(0, 500)}`);
        retried++;
      } catch (err) {
        await scheduleRetry(admin, job, (err as Error).message ?? String(err));
        retried++;
      }
    }),
  );

  return json({ claimed: rows.length, sent, retried, dlq });
});

async function scheduleRetry(
  admin: ReturnType<typeof createClient>,
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
  admin: ReturnType<typeof createClient>,
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
