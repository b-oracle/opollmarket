import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyInternalOrAdmin } from "../_shared/internalAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TELEGRAM_API = "https://api.telegram.org/bot";

// ── Type → emoji & preference key mapping ──
const TYPE_META: Record<string, { emoji: string; prefKey: string }> = {
  payout:                    { emoji: "💰", prefKey: "payouts" },
  resolution:                { emoji: "⚖️", prefKey: "resolutions" },
  refund:                    { emoji: "🔄", prefKey: "payouts" },
  info:                      { emoji: "ℹ️", prefKey: "info" },
  follow:                    { emoji: "👤", prefKey: "followers" },
  referral:                  { emoji: "🎁", prefKey: "info" },
  first_prediction_required: { emoji: "🚀", prefKey: "info" },
  copy_trade:                { emoji: "📋", prefKey: "info" },
  score:                     { emoji: "⚽", prefKey: "info" },
  quick_trade_loss:          { emoji: "📉", prefKey: "quick_trades" },
  quick_trade_win:           { emoji: "🎉", prefKey: "quick_trades" },
  deposit:                   { emoji: "✅", prefKey: "deposits" },
  withdrawal:                { emoji: "🏦", prefKey: "withdrawals" },
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await verifyInternalOrAdmin(req, { functionName: "telegram-notify", corsHeaders });
  if (!auth.ok) return auth.response!;


  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) {
    return new Response(JSON.stringify({ error: "Bot token not configured" }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  try {
    const { user_id, title, message, market_id, type, actor_id } = await req.json();

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

    // Find linked Telegram chat + preferences
    const { data: tgUser } = await supabase
      .from("telegram_users")
      .select("telegram_chat_id, notification_preferences")
      .eq("user_id", user_id)
      .single();

    if (!tgUser) {
      return new Response(JSON.stringify({ skipped: true, reason: "No Telegram link" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Preference check ──
    const prefs = (tgUser.notification_preferences || {}) as Record<string, boolean>;
    const meta = TYPE_META[type] || TYPE_META.info;
    if (prefs[meta.prefKey] === false) {
      return new Response(JSON.stringify({ skipped: true, reason: "User disabled this notification type" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Build rich text ──
    const appUrl = Deno.env.get("APP_URL") || "https://opoll.org";
    let text = "";

    // Emoji prefix + bold title
    if (title) {
      text += `${meta.emoji} <b>${escapeHtml(title)}</b>\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    }
    text += escapeHtml(message);

    // ── Inline keyboard buttons ──
    const buttons: Array<Array<{ text: string; url?: string; callback_data?: string }>> = [];

    if (market_id) {
      buttons.push([
        { text: "🔮 View Market", url: `${appUrl}/market/${market_id}` },
      ]);
    }

    if (type === "payout" || type === "refund") {
      buttons.push([
        { text: "📊 My Portfolio", url: `${appUrl}/portfolio` },
      ]);
    }

    if (type === "follow" && actor_id) {
      buttons.push([
        { text: "👤 View Profile", url: `${appUrl}/user/${actor_id}` },
      ]);
    }

    if ((type === "quick_trade_win" || type === "quick_trade_loss")) {
      buttons.push([
        { text: "⚡ Trade Again", url: `${appUrl}/quick-trade` },
        { text: "📊 Portfolio", url: `${appUrl}/portfolio` },
      ]);
    }

    if (type === "deposit" || type === "withdrawal") {
      buttons.push([
        { text: "📊 My Portfolio", url: `${appUrl}/portfolio` },
      ]);
    }

    // Always add web app link at bottom
    buttons.push([
      { text: "🌐 Open OPoll", url: appUrl },
    ]);

    const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: tgUser.telegram_chat_id,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: buttons },
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
