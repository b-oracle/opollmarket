import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";

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

    // Read body once and destructure all fields
    const body = await req.json();
    const { pin, action, old_pin } = body;

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (action === "change") {
      // Changing PIN — verify old PIN first
      if (!old_pin || !/^\d{6}$/.test(old_pin)) {
        return new Response(JSON.stringify({ error: "Current PIN is required" }), {
          status: 400, headers: corsHeaders,
        });
      }

      // Pre-check lockout from prior failed attempts to prevent brute force
      // of the change endpoint (mirrors verify-security flow).
      const { data: lockCheck } = await adminClient
        .from("user_security_attempts")
        .select("locked_until")
        .eq("user_id", user.id)
        .maybeSingle();
      if (lockCheck?.locked_until && new Date(lockCheck.locked_until) > new Date()) {
        return new Response(
          JSON.stringify({ error: "Too many attempts. Please wait before trying again." }),
          { status: 429, headers: corsHeaders }
        );
      }

      const { data: settings } = await adminClient
        .from("user_security_settings")
        .select("pin_hash")
        .eq("user_id", user.id)
        .single();

      if (!settings?.pin_hash || !bcrypt.compareSync(old_pin, settings.pin_hash)) {
        // Record failed attempt → enforces lockout after N failures.
        await adminClient.rpc("record_security_attempt", { _user_id: user.id, _success: false });
        return new Response(JSON.stringify({ error: "Current PIN is incorrect" }), {
          status: 400, headers: corsHeaders,
        });
      }

      // Successful old-PIN verification → reset attempt counter.
      await adminClient.rpc("record_security_attempt", { _user_id: user.id, _success: true });
    }

    // Validate PIN format
    if (!pin || !/^\d{6}$/.test(pin)) {
      return new Response(JSON.stringify({ error: "PIN must be exactly 6 digits" }), {
        status: 400, headers: corsHeaders,
      });
    }

    // Hash the PIN
    const salt = bcrypt.genSaltSync(10);
    const pinHash = bcrypt.hashSync(pin, salt);

    // Upsert security settings
    const { error: upsertError } = await adminClient
      .from("user_security_settings")
      .upsert({
      user_id: user.id,
        pin_hash: pinHash,
        pin_enabled: true,
        require_pin_login: true,
        require_pin_withdrawal: true,
        security_setup_complete: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (upsertError) {
      console.error("Failed to save PIN:", JSON.stringify(upsertError));

      // If FK violation (no profile yet), create profile via RPC, then retry
      if (upsertError.code === "23503") {
        // Generate a unique username via DB function so we don't collide on the default 'user'
        const { data: uname } = await adminClient.rpc("generate_unique_username", {
          _display_name: (user.email?.split("@")[0]) || "user",
        });
        const { error: profileErr } = await adminClient
          .from("profiles")
          .upsert(
            {
              id: user.id,
              email: user.email,
              display_name: user.email?.split("@")[0] || "user",
              username: uname || `user_${user.id.slice(0, 8)}`,
            },
            { onConflict: "id" }
          );
        if (profileErr) {
          console.error("Profile auto-create failed:", JSON.stringify(profileErr));
          return new Response(
            JSON.stringify({ error: `Profile setup failed: ${profileErr.message}` }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const { error: retryErr } = await adminClient
          .from("user_security_settings")
          .upsert(
            {
              user_id: user.id,
              pin_hash: pinHash,
              pin_enabled: true,
              require_pin_login: true,
              require_pin_withdrawal: true,
              security_setup_complete: true,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          );
        if (!retryErr) {
          return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        console.error("Retry upsert failed:", JSON.stringify(retryErr));
        return new Response(
          JSON.stringify({ error: `Failed to save PIN: ${retryErr.message}` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Surface the real error to help diagnose (length limit, RLS, etc.)
      return new Response(
        JSON.stringify({
          error: `Failed to save PIN: ${upsertError.message || upsertError.code || "unknown error"}`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("setup-security-pin error:", err);
    return new Response(JSON.stringify({ error: "Something went wrong. Please try again." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
