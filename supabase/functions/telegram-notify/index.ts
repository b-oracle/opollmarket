import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TELEGRAM_API = "https://api.telegram.org/bot";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) {
    return new Response(JSON.stringify({ error: "Bot token not configured" }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  try {
    const { user_id, title, message, market_id } = await req.json();

    if (!user_id || !message) {
      return new Response(JSON.stringify({ error: "Missing user_id or message" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find linked Telegram chat
    const { data: tgUser } = await supabase
      .from("telegram_users")
      .select("telegram_chat_id")
      .eq("user_id", user_id)
      .single();

    if (!tgUser) {
      return new Response(JSON.stringify({ skipped: true, reason: "No Telegram link" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let text = "";
    if (title) {
      text += `<b>${title.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</b>\n\n`;
    }
    text += message.replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // Add link to market if available
    if (market_id) {
      const appUrl = Deno.env.get("APP_URL") || "https://opoll.org";
      text += `\n\n<a href="${appUrl}/market/${market_id}">View Market →</a>`;
    }

    const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: tgUser.telegram_chat_id,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    const result = await res.json();

    return new Response(JSON.stringify({ success: result.ok }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("telegram-notify error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
