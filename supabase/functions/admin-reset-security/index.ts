import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is admin
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Check admin role
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "super_admin"]);

    if (!roleData || roleData.length === 0) {
      throw new Error("Admin access required");
    }

    const { target_user_id, reset_type } = await req.json();
    if (!target_user_id || !["pin", "totp"].includes(reset_type)) {
      throw new Error("Invalid parameters");
    }

    const updateFields: Record<string, any> = { updated_at: new Date().toISOString() };

    if (reset_type === "pin") {
      updateFields.pin_enabled = false;
      updateFields.pin_hash = null;
      updateFields.require_pin_login = false;
      updateFields.require_pin_withdrawal = false;
    } else {
      updateFields.totp_enabled = false;
      updateFields.totp_secret = null;
      updateFields.require_totp_login = false;
      updateFields.require_totp_withdrawal = false;
    }

    // Reset security_setup_complete so user is prompted to set up again
    const { data: currentSettings } = await adminClient
      .from("user_security_settings")
      .select("pin_enabled, totp_enabled")
      .eq("user_id", target_user_id)
      .maybeSingle();

    // If resetting the only active method, mark setup incomplete
    if (currentSettings) {
      const otherMethodActive = reset_type === "pin" ? currentSettings.totp_enabled : currentSettings.pin_enabled;
      if (!otherMethodActive) {
        updateFields.security_setup_complete = false;
      }
    }

    const { error: updateError } = await adminClient
      .from("user_security_settings")
      .update(updateFields)
      .eq("user_id", target_user_id);

    if (updateError) throw updateError;

    // Audit log
    await adminClient.from("audit_logs").insert({
      actor_id: user.id,
      action: `reset_user_${reset_type}`,
      target_id: target_user_id,
      target_type: "user_security",
      details: { reset_type },
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: (err instanceof Error ? err.message : String(err)) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
