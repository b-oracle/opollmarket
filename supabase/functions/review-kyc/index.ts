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
      .in("role", ["admin", "super_admin"]);

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
