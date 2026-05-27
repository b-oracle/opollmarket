import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SITE_NAME = "opollmarket";
const SENDER_DOMAIN = "notify.www.opoll.org";
const FROM_DOMAIN = "www.opoll.org";
const SITE_URL = "https://www.opoll.org";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authorize via service role key (one-shot backfill)
    const provided = req.headers.get("x-service-key");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (provided !== serviceKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

    // Latest rejected submission per user
    const { data: submissions, error: subErr } = await admin
      .from("kyc_submissions")
      .select("id, user_id, tier, admin_note, reviewed_at")
      .eq("status", "rejected")
      .order("reviewed_at", { ascending: false });

    if (subErr) throw subErr;

    const seen = new Set<string>();
    const latest = (submissions || []).filter((s) => {
      if (seen.has(s.user_id)) return false;
      seen.add(s.user_id);
      return true;
    });

    let notified = 0;
    let pushSent = 0;
    let emailQueued = 0;
    const errors: string[] = [];

    for (const submission of latest) {
      const message = `Your identity verification was rejected. ${
        submission.admin_note
          ? `Reason: ${submission.admin_note}`
          : "Please resubmit with correct documents."
      }`;
      const title = "KYC Rejected";

      // 1. In-app notification
      try {
        await admin.from("notifications").insert({
          user_id: submission.user_id,
          title,
          message,
          type: "warning",
        });
        notified++;
      } catch (e) {
        errors.push(`notif ${submission.user_id}: ${(e as Error).message}`);
      }

      // 2. Push
      try {
        await admin.functions.invoke("send-push", {
          headers: { "x-internal-secret": Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "" },
          body: {
            user_id: submission.user_id,
            title,
            body: message,
            url: "/profile",
          },
        });
        pushSent++;
      } catch (e) {
        errors.push(`push ${submission.user_id}: ${(e as Error).message}`);
      }

      // 3. Email
      try {
        const { data: authUser } = await admin.auth.admin.getUserById(
          submission.user_id
        );
        const recipientEmail = authUser?.user?.email;
        if (!recipientEmail) continue;

        const heading = "Identity verification rejected";
        const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#111827;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <h1 style="font-size:22px;margin:0 0 16px;color:#dc2626;">${heading}</h1>
    <p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 16px;">
      ${message.replace(/</g, "&lt;")}
    </p>
    <p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 24px;">
      You can resubmit your documents from your profile at any time.
    </p>
    <a href="${SITE_URL}/profile" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;">Open ${SITE_NAME}</a>
    <p style="font-size:12px;color:#9ca3af;margin:32px 0 0;">— The ${SITE_NAME} Team</p>
  </div>
</body></html>`;
        const text = `${heading}\n\n${message}\n\nOpen ${SITE_NAME}: ${SITE_URL}/profile`;

        const messageId = crypto.randomUUID();
        const templateName = "kyc_rejected";

        await admin.from("email_send_log").insert({
          message_id: messageId,
          template_name: templateName,
          recipient_email: recipientEmail,
          status: "pending",
        });

        const { error: enqueueError } = await admin.rpc("enqueue_email", {
          queue_name: "transactional_emails",
          payload: {
            message_id: messageId,
            to: recipientEmail,
            from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
            sender_domain: SENDER_DOMAIN,
            subject: `Your ${SITE_NAME} identity verification was rejected`,
            html,
            text,
            purpose: "transactional",
            label: templateName,
            queued_at: new Date().toISOString(),
          },
        });
        if (enqueueError) {
          errors.push(
            `email ${submission.user_id}: ${enqueueError.message}`
          );
          await admin.from("email_send_log").insert({
            message_id: messageId,
            template_name: templateName,
            recipient_email: recipientEmail,
            status: "failed",
            error_message: "Failed to enqueue email",
          });
        } else {
          emailQueued++;
        }
      } catch (e) {
        errors.push(`email ${submission.user_id}: ${(e as Error).message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total: latest.length,
        notified,
        push_sent: pushSent,
        email_queued: emailQueued,
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("notify-rejected-kyc-backfill error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
