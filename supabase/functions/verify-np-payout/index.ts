import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { TOTP } from "https://esm.sh/otpauth@9.3.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function getNowPaymentsJwt(): Promise<string> {
  const email = Deno.env.get("NOWPAYMENTS_EMAIL");
  const password = Deno.env.get("NOWPAYMENTS_PASSWORD");
  if (!email || !password) throw new Error("NOWPayments credentials not configured");

  const res = await fetch("https://api.nowpayments.io/v1/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`NOWPayments auth failed (${res.status}): ${errText}`);
  }

  const { token } = await res.json();
  if (!token) throw new Error("NOWPayments auth returned no token");
  return token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const isServiceRole = token === serviceRoleKey || token === anonKey;

    if (!isServiceRole) {
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

      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        serviceRoleKey
      );

      const { data: role } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["admin", "super_admin"])
        .maybeSingle();

      if (!role) {
        return new Response(JSON.stringify({ error: "Admin access required" }), {
          status: 403, headers: corsHeaders,
        });
      }
    }

    const { batch_id } = await req.json();
    if (!batch_id) {
      return new Response(JSON.stringify({ error: "batch_id required" }), {
        status: 400, headers: corsHeaders,
      });
    }

    const apiKey = Deno.env.get("NOWPAYMENTS_API_KEY")!;
    const totpSecret = Deno.env.get("NOWPAYMENTS_2FA_SECRET");

    if (!totpSecret) {
      return new Response(JSON.stringify({ error: "NOWPAYMENTS_2FA_SECRET not configured" }), {
        status: 500, headers: corsHeaders,
      });
    }

    // Step 1: Get JWT
    const jwtToken = await getNowPaymentsJwt();

    // Step 2: Check payout status first
    const statusRes = await fetch(`https://api.nowpayments.io/v1/payout/${batch_id}`, {
      headers: {
        "x-api-key": apiKey,
        "Authorization": `Bearer ${jwtToken}`,
      },
    });

    const statusData = statusRes.ok ? await statusRes.json() : null;
    const statusText = statusRes.ok ? JSON.stringify(statusData) : await statusRes.text();
    console.log("Payout status:", statusText);

    // Step 3: Generate TOTP and verify
    const totp = new TOTP({
      issuer: "NOWPayments",
      label: "payout",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: totpSecret,
    });
    const verificationCode = totp.generate();

    const verifyRes = await fetch(
      `https://api.nowpayments.io/v1/payout/${batch_id}/verify`,
      {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "Authorization": `Bearer ${jwtToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ verification_code: verificationCode }),
      }
    );

    const verifyBody = await verifyRes.text();
    console.log("Verify response:", verifyRes.status, verifyBody);

    if (!verifyRes.ok) {
      return new Response(
        JSON.stringify({ error: "Verification failed", status: verifyRes.status, details: verifyBody, payout_status: statusData }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, verify_response: verifyBody, payout_status: statusData }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("verify-np-payout error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: corsHeaders }
    );
  }
});
