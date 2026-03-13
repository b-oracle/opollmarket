import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { TOTP, Secret } from "https://esm.sh/otpauth@9.3.6";

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

function generateTOTP(secretStr: string): string {
  let secret: any;
  try {
    secret = Secret.fromBase32(secretStr.replace(/\s/g, "").toUpperCase());
  } catch {
    try {
      secret = Secret.fromHex(secretStr.replace(/\s/g, ""));
    } catch {
      secret = Secret.fromUTF8(secretStr);
    }
  }

  const totp = new TOTP({
    issuer: "NOWPayments",
    label: "payout",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });
  return totp.generate();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { batch_id, action } = await req.json();
    if (!batch_id) {
      return new Response(JSON.stringify({ error: "batch_id required" }), {
        status: 400, headers: corsHeaders,
      });
    }

    const apiKey = Deno.env.get("NOWPAYMENTS_API_KEY")!;
    const jwtToken = await getNowPaymentsJwt();

    // Check payout status
    const statusRes = await fetch(`https://api.nowpayments.io/v1/payout/${batch_id}`, {
      headers: {
        "x-api-key": apiKey,
        "Authorization": `Bearer ${jwtToken}`,
      },
    });

    const statusData = statusRes.ok ? await statusRes.json() : null;
    console.log("Payout status:", JSON.stringify(statusData));

    // If action is "status" only, return status without verifying
    if (action === "status") {
      return new Response(
        JSON.stringify({ success: true, payout_status: statusData }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If action is "update_hash", fetch status and update DB
    if (action === "update_hash") {
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const withdrawals = statusData?.withdrawals || [];
      let updated = 0;

      for (const w of withdrawals) {
        if (w.hash) {
          // Update withdrawal_requests
          const { error: wrErr } = await adminClient
            .from("withdrawal_requests")
            .update({ tx_hash: w.hash })
            .eq("nowpayments_id", String(w.id));

          // Update transactions
          const { error: txErr } = await adminClient
            .from("transactions")
            .update({ tx_hash: w.hash })
            .eq("nowpayments_payment_id", String(w.id))
            .eq("type", "withdrawal");

          if (!wrErr && !txErr) updated++;
          console.log(`Updated hash for withdrawal ${w.id}: ${w.hash}`, wrErr, txErr);
        }
      }

      return new Response(
        JSON.stringify({ success: true, updated, payout_status: statusData }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Default: verify payout with 2FA
    const totpSecret = Deno.env.get("NOWPAYMENTS_2FA_SECRET");
    if (!totpSecret) {
      return new Response(JSON.stringify({ error: "NOWPAYMENTS_2FA_SECRET not configured" }), {
        status: 500, headers: corsHeaders,
      });
    }

    const verificationCode = generateTOTP(totpSecret);
    console.log("Generated TOTP code successfully, length:", verificationCode.length);

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
