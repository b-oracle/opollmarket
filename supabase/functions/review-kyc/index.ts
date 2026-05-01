import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller is admin
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check admin role
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "super_admin", "support"]);

    if (!roleData || roleData.length === 0) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { submission_id, action, admin_note } = await req.json();

    if (!submission_id || !["approved", "rejected"].includes(action)) {
      return new Response(
        JSON.stringify({ error: "Invalid parameters" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch the submission
    const { data: submission, error: fetchErr } = await adminClient
      .from("kyc_submissions")
      .select("*")
      .eq("id", submission_id)
      .single();

    if (fetchErr || !submission) {
      return new Response(
        JSON.stringify({ error: "Submission not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Update submission status
    const { error: subError } = await adminClient
      .from("kyc_submissions")
      .update({
        status: action,
        admin_note: admin_note || null,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", submission_id);

    if (subError) throw subError;

    // Update profile kyc_status
    const newKycStatus =
      action === "approved"
        ? submission.tier === 2
          ? "tier2"
          : "tier1"
        : "rejected";

    const { error: profError } = await adminClient
      .from("profiles")
      .update({ kyc_status: newKycStatus })
      .eq("id", submission.user_id);

    if (profError) {
      console.error("Profile update error:", profError);
    }

    // Send notification to user
    const notifMessage =
      action === "approved"
        ? `Your Tier ${submission.tier} identity verification has been approved. ${
            submission.tier === 1
              ? "You can now withdraw up to $500/day."
              : "You now have full withdrawal access up to $50,000/day."
          }`
        : `Your identity verification was rejected. ${
            admin_note
              ? `Reason: ${admin_note}`
              : "Please resubmit with correct documents."
          }`;

    const { error: notifError } = await adminClient
      .from("notifications")
      .insert({
        user_id: submission.user_id,
        title: action === "approved" ? "KYC Approved ✓" : "KYC Rejected",
        message: notifMessage,
        type: action === "approved" ? "info" : "warning",
      });

    if (notifError) {
      console.error("Notification insert error:", notifError);
    }

    const notifTitle = action === "approved" ? "KYC Approved ✓" : "KYC Rejected";

    // Fire push notification (best-effort)
    try {
      await adminClient.functions.invoke("send-push", {
        body: {
          user_id: submission.user_id,
          title: notifTitle,
          body: notifMessage,
          url: "/profile",
        },
      });
    } catch (pushErr) {
      console.error("KYC push notification failed:", pushErr);
    }

    // Send email notification (best-effort, via shared email queue)
    try {
      const { data: authUser } = await adminClient.auth.admin.getUserById(
        submission.user_id
      );
      const recipientEmail = authUser?.user?.email;

      if (recipientEmail) {
        const SITE_NAME = "opollmarket";
        const SENDER_DOMAIN = "notify.www.opoll.org";
        const FROM_DOMAIN = "www.opoll.org";
        const SITE_URL = "https://www.opoll.org";

        const headlineColor = action === "approved" ? "#16a34a" : "#dc2626";
        const heading =
          action === "approved"
            ? `Tier ${submission.tier} verification approved`
            : "Identity verification rejected";

        const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#111827;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <h1 style="font-size:22px;margin:0 0 16px;color:${headlineColor};">${heading}</h1>
    <p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 16px;">
      ${notifMessage.replace(/</g, "&lt;")}
    </p>
    <p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 24px;">
      ${
        action === "approved"
          ? "You can now access the features unlocked by this verification tier."
          : "You can resubmit your documents from your profile at any time."
      }
    </p>
    <a href="${SITE_URL}/profile" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;">Open ${SITE_NAME}</a>
    <p style="font-size:12px;color:#9ca3af;margin:32px 0 0;">— The ${SITE_NAME} Team</p>
  </div>
</body></html>`;

        const text = `${heading}\n\n${notifMessage}\n\nOpen ${SITE_NAME}: ${SITE_URL}/profile`;

        const messageId = crypto.randomUUID();
        const templateName = action === "approved" ? "kyc_approved" : "kyc_rejected";

        await adminClient.from("email_send_log").insert({
          message_id: messageId,
          template_name: templateName,
          recipient_email: recipientEmail,
          status: "pending",
        });

        const { error: enqueueError } = await adminClient.rpc("enqueue_email", {
          queue_name: "transactional_emails",
          payload: {
            message_id: messageId,
            to: recipientEmail,
            from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
            sender_domain: SENDER_DOMAIN,
            subject:
              action === "approved"
                ? `Your ${SITE_NAME} identity verification was approved`
                : `Your ${SITE_NAME} identity verification was rejected`,
            html,
            text,
            purpose: "transactional",
            label: templateName,
            queued_at: new Date().toISOString(),
          },
        });

        if (enqueueError) {
          console.error("KYC email enqueue failed:", enqueueError);
          await adminClient.from("email_send_log").insert({
            message_id: messageId,
            template_name: templateName,
            recipient_email: recipientEmail,
            status: "failed",
            error_message: "Failed to enqueue email",
          });
        }
      }
    } catch (emailErr) {
      console.error("KYC email notification failed:", emailErr);
    }

    return new Response(
      JSON.stringify({ success: true, kyc_status: newKycStatus }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("review-kyc error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
