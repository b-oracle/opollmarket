import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
  if (!TWILIO_API_KEY) {
    return new Response(JSON.stringify({ error: "TWILIO_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const FROM = Deno.env.get("TWILIO_WHATSAPP_NUMBER");
  if (!FROM) {
    return new Response(JSON.stringify({ error: "TWILIO_WHATSAPP_NUMBER not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { user_id, title, message, market_id } = await req.json();

    if (!user_id || !message) {
      return new Response(JSON.stringify({ error: "Missing user_id or message" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find linked WhatsApp phone
    const { data: waUser } = await supabase
      .from("whatsapp_users")
      .select("whatsapp_phone")
      .eq("user_id", user_id)
      .single();

    if (!waUser) {
      return new Response(JSON.stringify({ skipped: true, reason: "No WhatsApp link" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let text = "";
    if (title) text += `*${title}*\n\n`;
    text += message;

    if (market_id) {
      const appUrl = Deno.env.get("APP_URL") || "https://opoll.org";
      text += `\n\nView Market → ${appUrl}/market/${market_id}`;
    }

    const res = await fetch(`${GATEWAY_URL}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TWILIO_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: `whatsapp:${waUser.whatsapp_phone}`,
        From: `whatsapp:${FROM}`,
        Body: text,
      }),
    });

    const result = await res.json();

    return new Response(JSON.stringify({ success: res.ok, sid: result.sid }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("whatsapp-send error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
