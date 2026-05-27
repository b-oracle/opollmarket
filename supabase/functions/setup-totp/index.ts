import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { TOTP } from "https://esm.sh/otpauth@9.3.6";
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generateSecret(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const arr = new Uint8Array(20);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => chars[b % chars.length]).join("");
}

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

    const { action, code, verify_pin } = await req.json();
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (action === "generate") {
      // Check if TOTP is already enabled — require PIN verification to overwrite
      const { data: existing } = await adminClient
        .from("user_security_settings")
        .select("totp_enabled, pin_enabled, pin_hash")
        .eq("user_id", user.id)
        .single();

      if (existing?.totp_enabled) {
        // Already has TOTP — require PIN to regenerate
        if (!existing.pin_enabled || !existing.pin_hash) {
          return new Response(JSON.stringify({ error: "Cannot regenerate 2FA without PIN verification. Please disable 2FA first via admin." }), {
            status: 400, headers: corsHeaders,
          });
        }
        if (!verify_pin || !/^\d{6}$/.test(verify_pin)) {
          return new Response(JSON.stringify({ error: "PIN verification required to regenerate 2FA", require_pin: true }), {
            status: 400, headers: corsHeaders,
          });
        }
        if (!bcrypt.compareSync(verify_pin, existing.pin_hash)) {
          return new Response(JSON.stringify({ error: "Incorrect PIN" }), {
            status: 400, headers: corsHeaders,
          });
        }
      }

      const secret = generateSecret();
      
      const totp = new TOTP({
        issuer: "oPoll",
        label: user.email || "user",
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret,
      });

      const otpauthUri = totp.toString();

      // Store secret (not yet enabled until verified)
      await adminClient
        .from("user_security_settings")
        .upsert({
          user_id: user.id,
          totp_secret: secret,
          totp_enabled: false,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      return new Response(JSON.stringify({
        success: true,
        otpauth_uri: otpauthUri,
        secret,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "verify") {
      if (!code || !/^\d{6}$/.test(code)) {
        return new Response(JSON.stringify({ error: "Invalid code format" }), {
          status: 400, headers: corsHeaders,
        });
      }

      // Get stored secret
      const { data: settings } = await adminClient
        .from("user_security_settings")
        .select("totp_secret")
        .eq("user_id", user.id)
        .single();

      if (!settings?.totp_secret) {
        return new Response(JSON.stringify({ error: "TOTP not set up. Generate a secret first." }), {
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
      if (delta === null) {
        return new Response(JSON.stringify({ error: "Invalid code. Please try again." }), {
          status: 400, headers: corsHeaders,
        });
      }

      // Enable TOTP
      await adminClient
        .from("user_security_settings")
        .update({
          totp_enabled: true,
          require_totp_login: true,
          require_totp_withdrawal: true,
          security_setup_complete: true,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "disable") {
      // Require current TOTP code OR PIN to disable 2FA — prevents stolen-session bypass
      const { data: settings } = await adminClient
        .from("user_security_settings")
        .select("totp_secret, totp_enabled, pin_enabled, pin_hash")
        .eq("user_id", user.id)
        .single();

      if (!settings?.totp_enabled || !settings?.totp_secret) {
        return new Response(JSON.stringify({ error: "2FA is not enabled" }), {
          status: 400, headers: corsHeaders,
        });
      }

      let verified = false;

      // Try TOTP code first
      if (code && /^\d{6}$/.test(code)) {
        const totp = new TOTP({
          issuer: "oPoll",
          label: user.email || "user",
          algorithm: "SHA1",
          digits: 6,
          period: 30,
          secret: settings.totp_secret,
        });
        if (totp.validate({ token: code, window: 1 }) !== null) verified = true;
      }

      // Fallback to PIN
      if (!verified && verify_pin && /^\d{6}$/.test(verify_pin) && settings.pin_enabled && settings.pin_hash) {
        if (bcrypt.compareSync(verify_pin, settings.pin_hash)) verified = true;
      }

      if (!verified) {
        return new Response(JSON.stringify({
          error: "Current 2FA code or PIN required to disable 2FA",
          require_verification: true,
        }), {
          status: 400, headers: corsHeaders,
        });
      }

      await adminClient
        .from("user_security_settings")
        .update({
          totp_secret: null,
          totp_enabled: false,
          require_totp_withdrawal: false,
          require_totp_login: false,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400, headers: corsHeaders,
    });
  } catch (err) {
    console.error("setup-totp error:", err);
    return new Response(JSON.stringify({ error: "Something went wrong. Please try again." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
