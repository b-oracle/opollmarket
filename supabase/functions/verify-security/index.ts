import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";
import { TOTP } from "https://esm.sh/otpauth@9.3.6";

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

    const { type, code } = await req.json();

    if (!type || !code || !/^\d{6}$/.test(code)) {
      return new Response(JSON.stringify({ error: "Invalid input" }), {
        status: 400, headers: corsHeaders,
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: settings } = await adminClient
      .from("user_security_settings")
      .select("pin_hash, totp_secret, pin_enabled, totp_enabled")
      .eq("user_id", user.id)
      .single();

    if (!settings) {
      return new Response(JSON.stringify({ error: "Security not configured" }), {
        status: 400, headers: corsHeaders,
      });
    }

    let valid = false;

    if (type === "pin") {
      if (!settings.pin_enabled || !settings.pin_hash) {
        return new Response(JSON.stringify({ error: "PIN not configured" }), {
          status: 400, headers: corsHeaders,
        });
      }
      valid = bcrypt.compareSync(code, settings.pin_hash);
    } else if (type === "totp") {
      if (!settings.totp_enabled || !settings.totp_secret) {
        return new Response(JSON.stringify({ error: "2FA not configured" }), {
          status: 400, headers: corsHeaders,
        });
      }

      const totp = new TOTP({
        issuer: "oPoll",
        label: user.email || "user",
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: settings.totp_secret,
      });

      const delta = totp.validate({ token: code, window: 1 });
      valid = delta !== null;
    } else {
      return new Response(JSON.stringify({ error: "Invalid verification type" }), {
        status: 400, headers: corsHeaders,
      });
    }

    if (valid) {
      await adminClient
        .from("user_security_settings")
        .update({ last_verified_at: new Date().toISOString() })
        .eq("user_id", user.id);
    }

    return new Response(JSON.stringify({ valid }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("verify-security error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: corsHeaders,
    });
  }
});
