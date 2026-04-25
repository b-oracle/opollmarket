import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { errorResponse } from "../_shared/errors.ts";
import { deliverWebhook, recordAttempt } from "../_shared/webhookDelivery.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 25;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Pick due failed events ordered by next_retry_at
    const nowIso = new Date().toISOString();
    const { data: due, error: fetchErr } = await admin
      .from("webhook_events")
      .select(
        `id, attempts, event_type, payload, api_key_id,
         api_keys!inner(webhook_url, webhook_secret, partner_name, is_active)`,
      )
      .eq("status", "failed")
      .lte("next_retry_at", nowIso)
      .order("next_retry_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchErr) {
      console.error("retry-webhooks: fetch failed", fetchErr);
      return errorResponse(fetchErr, 500, corsHeaders);
    }

    if (!due || due.length === 0) {
      return new Response(JSON.stringify({ retried: 0, succeeded: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let succeeded = 0;
    for (const ev of due) {
      // deno-lint-ignore no-explicit-any
      const key: any = (ev as any).api_keys;
      if (!key?.is_active || !key?.webhook_url) {
        // Partner deactivated or URL removed → dead-letter immediately
        await admin
          .from("webhook_events")
          .update({
            status: "dead_letter",
            last_error: "partner_inactive_or_no_url",
            next_retry_at: null,
          })
          .eq("id", ev.id);
        continue;
      }

      const result = await deliverWebhook({
        webhookUrl: key.webhook_url,
        webhookSecret: key.webhook_secret,
        eventType: ev.event_type,
        payload: ev.payload,
      });

      await recordAttempt(admin, ev.id, ev.attempts ?? 0, result);
      if (result.ok) succeeded++;
    }

    return new Response(
      JSON.stringify({ retried: due.length, succeeded }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("retry-webhooks error:", err);
    return errorResponse(err, 500, corsHeaders);
  }
});
