import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

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
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: corsHeaders,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: corsHeaders,
      });
    }

    const { pin, action } = await req.json();

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (action === "change") {
      // Changing PIN — verify old PIN first
      const { old_pin } = await req.json().catch(() => ({ old_pin: null }));
      // For change, the full body is { action: "change", old_pin, pin }
    }

    // Validate PIN format
    if (!pin || !/^\d{6}$/.test(pin)) {
      return new Response(JSON.stringify({ error: "PIN must be exactly 6 digits" }), {
        status: 400, headers: corsHeaders,
      });
    }

    // Hash the PIN
    const salt = await bcrypt.genSalt(10);
    const pinHash = await bcrypt.hash(pin, salt);

    // Update security settings
    const { error: updateError } = await adminClient
      .from("user_security_settings")
      .update({
        pin_hash: pinHash,
        pin_enabled: true,
        security_setup_complete: true,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (updateError) {
      // Row might not exist yet for existing users — upsert
      const { error: upsertError } = await adminClient
        .from("user_security_settings")
        .upsert({
          user_id: user.id,
          pin_hash: pinHash,
          pin_enabled: true,
          security_setup_complete: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      if (upsertError) {
        console.error("Failed to save PIN:", upsertError);
        return new Response(JSON.stringify({ error: "Failed to save PIN" }), {
          status: 500, headers: corsHeaders,
        });
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("setup-security-pin error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: corsHeaders,
    });
  }
});
