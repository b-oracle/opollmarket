import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TELEGRAM_API = "https://api.telegram.org/bot";

async function tg(token: string, method: string, body: Record<string, unknown>) {
  const res = await fetch(`${TELEGRAM_API}${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function progressBar(pct: number, length = 10): string {
  const filled = Math.round((pct / 100) * length);
  const empty = length - filled;
  return "▓".repeat(filled) + "░".repeat(empty);
}

function categoryEmoji(cat: string): string {
  const map: Record<string, string> = {
    crypto: "₿", politics: "🏛️", sports: "⚽", economy: "📈",
    entertainment: "🎬", science: "🔬", technology: "💻", ai: "🤖",
  };
  return map[cat?.toLowerCase()] || "🔮";
}

// ── Shared asset emoji map (single source of truth) ──
const ASSET_EMOJIS: Record<string, string> = {
  BTC: "₿", ETH: "Ξ", BNB: "🔶", SOL: "◎", XRP: "✕", DOGE: "🐕",
  ADA: "🔵", AVAX: "🔺", DOT: "⚪", LINK: "🔗", SHIB: "🐕",
  XAU: "🥇", XAG: "🥈", XPT: "⚪", XPD: "🔘",
  "EUR/USD": "🇪🇺", "GBP/USD": "🇬🇧", "USD/JPY": "🇯🇵", "AUD/USD": "🇦🇺",
  "USD/CAD": "🇨🇦", "USD/CHF": "🇨🇭", "NZD/USD": "🇳🇿", "EUR/GBP": "💱",
};

// ── Crypto price helpers ──
const GECKO_IDS: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", BNB: "binancecoin", SOL: "solana",
  XRP: "ripple", DOGE: "dogecoin", ADA: "cardano", MATIC: "matic-network",
  AVAX: "avalanche-2", DOT: "polkadot", LINK: "chainlink", SHIB: "shiba-inu",
};

async function fetchCryptoPrices(symbols: string[]): Promise<Record<string, number>> {
  const ids = symbols.map(s => GECKO_IDS[s]).filter(Boolean).join(",");
  if (!ids) return {};
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
    if (!r.ok) return {};
    const data = await r.json();
    const result: Record<string, number> = {};
    for (const sym of symbols) {
      const gId = GECKO_IDS[sym];
      if (gId && data[gId]?.usd) result[sym] = data[gId].usd;
    }
    return result;
  } catch { return {}; }
}

async function fetchCryptoPrice(symbol: string): Promise<{ price: number; change24h: number } | null> {
  const gId = GECKO_IDS[symbol];
  if (!gId) return null;
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${gId}&vs_currencies=usd&include_24hr_change=true`);
    if (!r.ok) return null;
    const data = await r.json();
    if (!data[gId]?.usd) return null;
    return { price: data[gId].usd, change24h: data[gId].usd_24h_change ?? 0 };
  } catch { return null; }
}

function formatPrice(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(8)}`;
}

// ── Commodity price helpers ──
const COMMODITY_SYMBOLS: Record<string, string> = {
  XAU: "Gold", XAG: "Silver", XPT: "Platinum", XPD: "Palladium",
};

async function fetchCommodityPrice(symbol: string): Promise<{ price: number } | null> {
  try {
    const apiKey = Deno.env.get("OMKAR_COMMODITY_API_KEY");
    if (!apiKey) return null;
    const r = await fetch(`https://api.metals.dev/v1/latest?api_key=${apiKey}&currency=USD&unit=toz`);
    if (!r.ok) return null;
    const data = await r.json();
    const metalMap: Record<string, string> = { XAU: "gold", XAG: "silver", XPT: "platinum", XPD: "palladium" };
    const key = metalMap[symbol];
    if (key && data.metals?.[key]) return { price: data.metals[key] };
    return null;
  } catch { return null; }
}

// ── Forex price helpers ──
function isForexAsset(symbol: string): boolean {
  return symbol.includes("/");
}

function isCommodityAsset(symbol: string): boolean {
  return !!COMMODITY_SYMBOLS[symbol];
}

async function fetchForexPrice(pair: string): Promise<{ price: number } | null> {
  const [from, to] = pair.split("/");
  if (!from || !to) return null;
  try {
    const r = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`);
    if (!r.ok) return null;
    const data = await r.json();
    if (data.rates?.[to]) return { price: data.rates[to] };
    return null;
  } catch { return null; }
}

/** Forex & commodity markets: open Sunday 17:00 ET → Friday 17:00 ET */
function isForexMarketOpen(): boolean {
  const etStr = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
  const et = new Date(etStr);
  const day = et.getDay();
  const hour = et.getHours();
  if (day === 6) return false;
  if (day === 0) return hour >= 17;
  if (day === 5) return hour < 17;
  return true;
}

async function getAssetPrice(symbol: string): Promise<{ price: number; change24h?: number } | null> {
  if (isForexAsset(symbol)) return fetchForexPrice(symbol);
  if (isCommodityAsset(symbol)) return fetchCommodityPrice(symbol);
  return fetchCryptoPrice(symbol);
}

function formatAssetPrice(symbol: string, price: number): string {
  if (isForexAsset(symbol)) return price.toFixed(4);
  return formatPrice(price);
}

const APP_URL = "https://opoll.org";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) {
    return new Response("Bot token not configured", { status: 500 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  if (req.method === "GET") {
    return new Response(JSON.stringify({ ok: true, message: "Telegram bot webhook is active" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verify webhook authenticity via Telegram's secret token header.
  const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  if (webhookSecret) {
    const provided = req.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
    if (!safeEqual(provided, webhookSecret)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } else {
    console.error("TELEGRAM_WEBHOOK_SECRET not configured — rejecting webhook request");
    return new Response(JSON.stringify({ error: "Webhook secret not configured" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }



  try {
    const body = await req.text();
    if (!body) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const update = JSON.parse(body);
    const message = update.message;
    const callback = update.callback_query;

    if (callback) {
      await handleCallback(token, supabase, callback);
      return new Response("ok", { headers: corsHeaders });
    }

    if (!message?.text) {
      return new Response("ok", { headers: corsHeaders });
    }

    const chatId = message.chat.id;
    const text = message.text.trim();
    const username = message.from?.username || null;

    if (text === "/start") {
      await handleStart(token, chatId);
    } else if (text === "/link") {
      await handleLinkStart(token, chatId);
    } else if (text.startsWith("/link ")) {
      await handleLinkLegacy(token, supabase, chatId, text, username, message.message_id);
    } else if (text === "/markets") {
      await handleMarkets(token, supabase, chatId);
    } else if (text === "/portfolio") {
      await handlePortfolio(token, supabase, chatId);
    } else if (text === "/balance") {
      await handleBalance(token, supabase, chatId);
    } else if (text === "/quicktrade") {
      await handleQuickTrade(token, supabase, chatId);
    } else if (text === "/help") {
      await handleHelp(token, chatId);
    } else if (text === "/unlink") {
      await handleUnlink(token, supabase, chatId);
    } else if (text === "/stats") {
      await handleStats(token, supabase, chatId);
    } else if (text === "/faq") {
      await handleFaqStart(token, supabase, chatId);
    } else if (text === "/notifications") {
      await handleNotifications(token, supabase, chatId);
    } else if (text === "/settings") {
      await handleSettings(token, supabase, chatId);
    } else if (text === "/cancel") {
      await supabase.from("telegram_link_sessions").delete().eq("chat_id", chatId);
      await tg(token, "sendMessage", {
        chat_id: chatId,
        text: "❌ Account linking cancelled.",
      });
    } else {
      const handled = await handleLinkSession(token, supabase, chatId, text, username, message.message_id);
      if (!handled) {
        const qtHandled = await handleQTCustomInput(token, supabase, chatId, text);
        if (!qtHandled) {
          const faqHandled = await handleFaqSession(token, supabase, chatId, text);
          if (!faqHandled) {
            await tg(token, "sendMessage", {
              chat_id: chatId,
              text: "Unknown command. Type /help to see available commands.",
            });
          }
        }
      }
    }

    return new Response("ok", { headers: corsHeaders });
  } catch (err) {
    console.error("telegram-bot error:", err);
    return new Response("ok", { headers: corsHeaders });
  }
});

// --- Command handlers ---

async function handleStart(token: string, chatId: number) {
  // Send logo image with welcome message
  await tg(token, "sendPhoto", {
    chat_id: chatId,
    photo: `${APP_URL}/images/opoll-banner.png`,
    caption:
      "🔮 <b>Welcome to OPoll Prediction Market</b>\n" +
      "━━━━━━━━━━━━━━━━━━━━\n" +
      "The World's First Web + Telegram + WhatsApp prediction market protocol.\n\n" +
      "📊 Predict outcomes\n" +
      "💹 Trade markets\n" +
      "⚡ Quick Trade crypto prices\n" +
      "🏆 Win rewards\n\n" +
      "Tap a button below to get started:",
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🔗 Link Account", callback_data: "cmd_link" },
        ],
        [
          { text: "🔮 Markets", callback_data: "cmd_markets" },
          { text: "⚡ Quick Trade", callback_data: "cmd_quicktrade" },
        ],
        [
          { text: "❓ FAQ", callback_data: "cmd_faq" },
          { text: "📖 Help", callback_data: "cmd_help" },
        ],
        [
          { text: "🌐 Open Web App", url: APP_URL },
          { text: "🐦 Follow us on X", url: "https://x.com/opollmarket" },
        ],
      ],
    },
  });
}

async function handleHelp(token: string, chatId: number) {
  await tg(token, "sendMessage", {
    chat_id: chatId,
    text:
      "📖 <b>OPoll Market — Commands</b>\n" +
      "━━━━━━━━━━━━━━━━━━━━\n\n" +
      "🔗 <b>Account</b>\n" +
      "  /link — Link your account (secure)\n" +
      "  /unlink — Unlink account\n" +
      "  /cancel — Cancel linking process\n\n" +
      "📊 <b>Trading</b>\n" +
      "  /markets — Browse active markets\n" +
      "  /portfolio — View your positions\n" +
      "  /balance — Check your balance\n\n" +
      "⚡ <b>Quick Trade</b>\n" +
      "  /quicktrade — Predict asset prices\n\n" +
      "📈 <b>Info</b>\n" +
      "  /faq — Ask the FAQ assistant\n" +
      "  /stats — Platform statistics\n" +
      "  /notifications — Recent alerts\n" +
      "  /settings — Notification preferences\n" +
      "  /help — Show this message",
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🔮 Markets", callback_data: "cmd_markets" },
          { text: "💰 Balance", callback_data: "cmd_balance" },
        ],
        [
          { text: "🔔 Notifications", callback_data: "cmd_notifications" },
          { text: "⚙️ Settings", callback_data: "cmd_settings" },
        ],
        [
          { text: "❓ FAQ", callback_data: "cmd_faq" },
          { text: "🌐 Open Web App", url: APP_URL },
        ],
        [
          { text: "🏠 Home", callback_data: "cmd_home" },
        ],
      ],
    },
  });
}

async function handleStats(
  token: string,
  supabase: any,
  chatId: number
) {
  try {
    const [marketsRes, profilesRes, volumeRes, quickBetsRes] = await Promise.all([
      supabase.from("markets").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("markets").select("volume").eq("status", "active"),
      supabase.from("quick_bets").select("id", { count: "exact", head: true }).in("status", ["won", "lost"]),
    ]);

    const activeMarkets = marketsRes.count ?? 0;
    const totalUsers = profilesRes.count ?? 0;
    const totalVolume = (volumeRes.data || []).reduce((sum: number, m: { volume: number }) => sum + (m.volume || 0), 0);
    const totalQuickBets = quickBetsRes.count ?? 0;

    await tg(token, "sendMessage", {
      chat_id: chatId,
      text:
        "📊 <b>OPoll Platform Stats</b>\n" +
        "━━━━━━━━━━━━━━━━━━━━\n\n" +
        `🏛️ Active Markets: <b>${activeMarkets}</b>\n` +
        `👥 Total Users: <b>${totalUsers}</b>\n` +
        `💰 Total Volume: <b>$${totalVolume.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>\n` +
        `⚡ Quick Trade Bets: <b>${totalQuickBets.toLocaleString()}</b>\n\n` +
        "━━━━━━━━━━━━━━━━━━━━",
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🔮 Browse Markets", callback_data: "cmd_markets" },
            { text: "⚡ Quick Trade", callback_data: "cmd_quicktrade" },
          ],
          [
            { text: "🏠 Home", callback_data: "cmd_home" },
          ],
        ],
      },
    });
  } catch (err) {
    console.error("handleStats error:", err);
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: "❌ Failed to fetch stats. Please try again.",
    });
  }
}

// Step 1: User types /link — bot asks for email
async function handleLinkStart(token: string, chatId: number) {
  await tg(token, "sendMessage", {
    chat_id: chatId,
    text:
      "🔗 <b>Link Your Account</b>\n" +
      "━━━━━━━━━━━━━━━━━━━━\n\n" +
      "Please enter your <b>email address</b>:\n\n" +
      "<i>Type /cancel to abort</i>",
    parse_mode: "HTML",
  });
}

// Handle the interactive linking session (email → password steps)
async function handleLinkSession(
  token: string,
  supabase: any,
  chatId: number,
  text: string,
  username: string | null,
  messageId: number
): Promise<boolean> {
  // Check if there's a pending session (waiting for password)
  const { data: session } = await supabase
    .from("telegram_link_sessions")
    .select("email, created_at")
    .eq("chat_id", chatId)
    .single();

  if (session) {
    // Skip sessions used for custom amounts or FAQ — let their handlers process
    if (session.email.startsWith("qt_custom:") || session.email.startsWith("mkt_custom:") || session.email.startsWith("faq:")) {
      return false;
    }

    // This is the password step — delete the password message immediately
    try {
      await tg(token, "deleteMessage", { chat_id: chatId, message_id: messageId });
    } catch {
      // Bot may not have delete permission
    }

    // Check session expiry (5 min)
    const sessionAge = Date.now() - new Date(session.created_at).getTime();
    if (sessionAge > 5 * 60 * 1000) {
      await supabase.from("telegram_link_sessions").delete().eq("chat_id", chatId);
      await tg(token, "sendMessage", {
        chat_id: chatId,
        text: "⏰ Session expired. Please type /link to start again.",
      });
      return true;
    }

    const password = text;
    const email = session.email;

    // Clean up session immediately
    await supabase.from("telegram_link_sessions").delete().eq("chat_id", chatId);

    // Authenticate
    await completeLink(token, supabase, chatId, email, password, username);
    return true;
  }

  // Check if this looks like an email (step 1 of linking after /link command)
  // We detect this by checking if user recently sent /link
  // Simple heuristic: if text contains @ and looks like email, start session
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (emailRegex.test(text)) {
    // Could be email for linking — store session and ask for password
    await supabase
      .from("telegram_link_sessions")
      .upsert(
        { chat_id: chatId, email: text, created_at: new Date().toISOString() },
        { onConflict: "chat_id" }
      );

    // Delete the email message for privacy too
    try {
      await tg(token, "deleteMessage", { chat_id: chatId, message_id: messageId });
    } catch {
      // Best effort
    }

    await tg(token, "sendMessage", {
      chat_id: chatId,
      text:
        "✉️ Email received!\n\n" +
        "Now enter your <b>password</b>:\n\n" +
        "🔒 <i>Your message will be deleted immediately for security.</i>\n\n" +
        "<i>Type /cancel to abort</i>",
      parse_mode: "HTML",
    });
    return true;
  }

  return false;
}

// Legacy support: /link email password (still works but warns user)
async function handleLinkLegacy(
  token: string,
  supabase: any,
  chatId: number,
  text: string,
  username: string | null,
  messageId: number
) {
  const parts = text.split(" ");
  if (parts.length < 3) {
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: "💡 Just type /link and follow the secure prompts instead!",
    });
    return;
  }

  // Delete the message containing credentials immediately
  try {
    await tg(token, "deleteMessage", { chat_id: chatId, message_id: messageId });
  } catch {
    // Best effort
  }

  const email = parts[1];
  const password = parts.slice(2).join(" ");
  await completeLink(token, supabase, chatId, email, password, username);
}

// Shared authentication + linking logic
async function completeLink(
  token: string,
  supabase: any,
  chatId: number,
  email: string,
  password: string,
  username: string | null
) {
  const authClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!
  );

  const { data: signInData, error: signInError } = await authClient.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !signInData.user) {
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: "❌ Invalid email or password. Please type /link to try again.",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔗 Try Again", callback_data: "cmd_link" }],
        ],
      },
    });
    return;
  }

  const userId = signInData.user.id;
  await authClient.auth.signOut();

  const { error: upsertError } = await supabase
    .from("telegram_users")
    .upsert(
      {
        user_id: userId,
        telegram_chat_id: chatId,
        telegram_username: username,
        linked_at: new Date().toISOString(),
      },
      { onConflict: "telegram_chat_id" }
    );

  if (upsertError) {
    console.error("Upsert error:", upsertError);
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: "❌ Failed to link account. Please try again.",
    });
    return;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .single();

  const name = profile?.display_name || email.split("@")[0];

  await tg(token, "sendMessage", {
    chat_id: chatId,
    text:
      `✅ <b>Account linked successfully!</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Welcome, <b>${escapeHtml(name)}</b>! 👋\n\n` +
      `🔒 Your credentials were not stored and messages were deleted.\n\n` +
      `You're all set! Here's what you can do:`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🔮 Markets", callback_data: "cmd_markets" },
          { text: "📊 Portfolio", callback_data: "cmd_portfolio" },
        ],
        [
          { text: "💰 Balance", callback_data: "cmd_balance" },
          { text: "⚡ Quick Trade", callback_data: "cmd_quicktrade" },
        ],
      ],
    },
  });
}

async function handleUnlink(
  token: string,
  supabase: any,
  chatId: number
) {
  await supabase.from("telegram_users").delete().eq("telegram_chat_id", chatId);
  await tg(token, "sendMessage", {
    chat_id: chatId,
    text: "✅ Account unlinked. Use /link to connect again.",
    reply_markup: {
      inline_keyboard: [
        [{ text: "🔗 Link Account", callback_data: "cmd_link" }],
      ],
    },
  });
}

async function getUserId(
  supabase: any,
  chatId: number
): Promise<string | null> {
  const { data } = await supabase
    .from("telegram_users")
    .select("user_id")
    .eq("telegram_chat_id", chatId)
    .single();
  return data?.user_id || null;
}

const MARKETS_PER_PAGE = 5;

async function handleMarkets(
  token: string,
  supabase: any,
  chatId: number,
  page = 0
) {
  const from = page * MARKETS_PER_PAGE;
  const to = from + MARKETS_PER_PAGE - 1;

  const { data: markets, count } = await supabase
    .from("markets")
    .select("id, title, yes_price, volume, category, participants", { count: "exact" })
    .eq("status", "active")
    .order("volume", { ascending: false })
    .range(from, to);

  if (!markets || markets.length === 0) {
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: page === 0 ? "No active markets right now." : "No more markets.",
      reply_markup: { inline_keyboard: [[{ text: "🏠 Home", callback_data: "cmd_home" }]] },
    });
    return;
  }

  const totalPages = Math.ceil((count || 0) / MARKETS_PER_PAGE);

  // Build compact numbered list
  let text = `📋 <b>Markets</b> (Page ${page + 1}/${totalPages})\n━━━━━━━━━━━━━━━━━━━━\n\n`;

  const marketButtons: Array<Array<{ text: string; callback_data: string }>> = [];

  (markets as any[]).forEach((m: any, i: number) => {
    const num = from + i + 1;
    const yesP = Math.round(m.yes_price * 100);
    const emoji = categoryEmoji(m.category);
    const vol = Number(m.volume).toFixed(0);
    const title = m.title.length > 45 ? m.title.slice(0, 42) + "..." : m.title;

    text += `<b>${num}.</b> ${emoji} ${escapeHtml(title)}\n`;
    text += `   ✅ ${yesP}% · 💰 $${vol} · 👥 ${m.participants}\n\n`;

    // Two markets per row of buttons
    const btn = { text: `${num}. ${emoji} ${m.title.slice(0, 20)}`, callback_data: `mkt_${m.id}` };
    if (i % 2 === 0) {
      marketButtons.push([btn]);
    } else {
      marketButtons[marketButtons.length - 1].push(btn);
    }
  });

  // Pagination buttons
  const navRow: Array<{ text: string; callback_data: string }> = [];
  if (page > 0) {
    navRow.push({ text: "⬅️ Previous", callback_data: `mktpage_${page - 1}` });
  }
  if (page + 1 < totalPages) {
    navRow.push({ text: "Next ➡️", callback_data: `mktpage_${page + 1}` });
  }
  if (navRow.length > 0) {
    marketButtons.push(navRow);
  }

  // Footer row
  marketButtons.push([
    { text: "⚡ Quick Trade", callback_data: "cmd_quicktrade" },
    { text: "🌐 Open Web", url: APP_URL } as any,
  ]);
  marketButtons.push([
    { text: "🏠 Home", callback_data: "cmd_home" },
  ]);

  text += `<i>Tap a market below to see details & predict</i>`;

  await tg(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: marketButtons },
  });
}

async function handlePortfolio(
  token: string,
  supabase: any,
  chatId: number
) {
  const userId = await getUserId(supabase, chatId);
  if (!userId) {
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: "❌ Account not linked. Use /link email password first.",
      reply_markup: {
        inline_keyboard: [[{ text: "📖 How to Link", callback_data: "cmd_help" }]],
      },
    });
    return;
  }

  // Fetch positions, balance and profile in parallel
  const [posRes, balRes, profileRes] = await Promise.all([
    supabase.from("positions").select("side, shares, avg_price, market_id, option_id").eq("user_id", userId).gt("shares", 0),
    supabase.from("balances").select("amount, bonus_balance").eq("user_id", userId).eq("currency", "USDT").single(),
    supabase.from("profiles").select("display_name").eq("id", userId).single(),
  ]);

  const positions = posRes.data;
  const bal = balRes.data;
  const displayName = profileRes.data?.display_name || "Trader";
  const mainBal = Number(bal?.amount || 0);
  const bonusBal = Number(bal?.bonus_balance || 0);

  if (!positions || positions.length === 0) {
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text:
        `📊 <b>${escapeHtml(displayName)}'s Portfolio</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `💰 Balance: <b>$${mainBal.toFixed(2)}</b>\n` +
        `🎁 Bonus: <b>$${bonusBal.toFixed(2)}</b>\n\n` +
        `📂 No active positions yet.\n` +
        `Start predicting to build your portfolio!`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🔮 Browse Markets", callback_data: "cmd_markets" },
            { text: "⚡ Quick Trade", callback_data: "cmd_quicktrade" },
          ],
          [
            { text: "🏠 Home", callback_data: "cmd_home" },
          ],
        ],
      },
    });
    return;
  }

  // Get market titles
  const marketIds = [...new Set((positions as any[]).map((p: any) => p.market_id))];
  const { data: marketsData } = await supabase
    .from("markets")
    .select("id, title, yes_price, no_price, status, category")
    .in("id", marketIds);

  const marketMap = new Map<string, any>(((marketsData || []) as any[]).map((m: any) => [m.id, m]));

  let totalValue = 0;
  let totalPnl = 0;

  let positionLines = "";
  for (const pos of positions.slice(0, 8)) {
    const mkt = marketMap.get(pos.market_id);
    const title = mkt ? escapeHtml(mkt.title.slice(0, 30)) : "Unknown";
    const emoji = mkt ? categoryEmoji(mkt.category) : "🔮";
    const currentPrice = mkt
      ? pos.side === "yes" ? mkt.yes_price : mkt.no_price
      : pos.avg_price;
    const value = currentPrice * pos.shares;
    const pnl = (currentPrice - pos.avg_price) * pos.shares;
    totalValue += value;
    totalPnl += pnl;

    const pnlEmoji = pnl >= 0 ? "🟢" : "🔴";
    const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;

    positionLines += `${emoji} <b>${title}</b>\n`;
    positionLines += `   ${pos.side.toUpperCase()} × ${pos.shares.toFixed(1)} · ${pnlEmoji} ${pnlStr}\n\n`;
  }

  const pnlEmoji = totalPnl >= 0 ? "📈" : "📉";
  const pnlColor = totalPnl >= 0 ? "+" : "";

  let text =
    `📊 <b>${escapeHtml(displayName)}'s Portfolio</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `💰 Cash: <b>$${mainBal.toFixed(2)}</b> · 🎁 Bonus: <b>$${bonusBal.toFixed(2)}</b>\n` +
    `📦 Positions Value: <b>$${totalValue.toFixed(2)}</b>\n` +
    `${pnlEmoji} Total P&L: <b>${pnlColor}$${totalPnl.toFixed(2)}</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    positionLines;

  if (positions.length > 8) {
    text += `<i>...and ${positions.length - 8} more positions</i>\n`;
  }

  await tg(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🔮 Markets", callback_data: "cmd_markets" },
            { text: "💰 Deposit", url: `${APP_URL}/portfolio` },
          ],
          [
            { text: "🌐 Full Portfolio", url: `${APP_URL}/portfolio` },
          ],
          [
            { text: "🏠 Home", callback_data: "cmd_home" },
          ],
        ],
      },
  });
}

async function handleBalance(
  token: string,
  supabase: any,
  chatId: number
) {
  const userId = await getUserId(supabase, chatId);
  if (!userId) {
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: "❌ Account not linked. Use /link email password first.",
      reply_markup: {
        inline_keyboard: [[{ text: "📖 How to Link", callback_data: "cmd_help" }]],
      },
    });
    return;
  }

  const { data: bal } = await supabase
    .from("balances")
    .select("amount, bonus_balance")
    .eq("user_id", userId)
    .eq("currency", "USDT")
    .single();

  const main = Number(bal?.amount || 0);
  const bonus = Number(bal?.bonus_balance || 0);
  const total = main + bonus;

  // Visual balance bar
  const mainPct = total > 0 ? Math.round((main / total) * 100) : 0;

  await tg(token, "sendMessage", {
    chat_id: chatId,
    text:
      `💰 <b>Your Balance</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `💵 Main:  <b>$${main.toFixed(2)}</b>\n` +
      `🎁 Bonus: <b>$${bonus.toFixed(2)}</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `💎 Total: <b>$${total.toFixed(2)}</b>\n\n` +
      `${progressBar(mainPct, 15)} ${mainPct}% main`,
    parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "💳 Deposit", url: `${APP_URL}/portfolio` },
            { text: "💸 Withdraw", url: `${APP_URL}/portfolio` },
          ],
          [
            { text: "📊 Portfolio", callback_data: "cmd_portfolio" },
            { text: "🔮 Markets", callback_data: "cmd_markets" },
          ],
          [
            { text: "🏠 Home", callback_data: "cmd_home" },
          ],
        ],
      },
  });
}

async function handleQuickTrade(
  token: string,
  supabase: any,
  chatId: number
) {
  const userId = await getUserId(supabase, chatId);
  if (!userId) {
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: "❌ Account not linked. Use /link email password first.",
      reply_markup: {
        inline_keyboard: [[{ text: "📖 How to Link", callback_data: "cmd_help" }]],
      },
    });
    return;
  }

  const { data: settings } = await supabase
    .from("commission_settings")
    .select("qt_enabled_assets, qt_min_bet, qt_max_bet")
    .limit(1)
    .single();

  const assets = (settings?.qt_enabled_assets || "BTC,ETH,BNB").split(",").map((a: string) => a.trim());
  const minBet = settings?.qt_min_bet || 1;
  const maxBet = settings?.qt_max_bet || 500;

  const assetEmojis = ASSET_EMOJIS;

  // Separate crypto and non-crypto for price fetching
  const cryptoAssets = assets.filter((a: string) => !isForexAsset(a) && !isCommodityAsset(a));
  const prices = await fetchCryptoPrices(cryptoAssets.slice(0, 12));

  // Fetch forex/commodity prices individually
  for (const asset of assets) {
    if (isForexAsset(asset) || isCommodityAsset(asset)) {
      const p = await getAssetPrice(asset);
      if (p) prices[asset] = p.price;
    }
  }

  let priceList = "";
  for (const asset of assets.slice(0, 10)) {
    const emoji = assetEmojis[asset] || "📊";
    const price = prices[asset];
    priceList += price
      ? `${emoji} <b>${asset}</b>: ${isForexAsset(asset) ? price.toFixed(4) : formatPrice(price)}\n`
      : `${emoji} <b>${asset}</b>\n`;
  }

  // Market hours notice for forex
  const forexOpen = isForexMarketOpen();
  const hasForex = assets.some((a: string) => isForexAsset(a) || isCommodityAsset(a));
  let marketHoursNote = "";
  if (hasForex && !forexOpen) {
    marketHoursNote = "\n🌙 <i>Forex & Commodity markets are closed. Opens Sunday 5:00 PM ET.</i>\n";
  }

  const buttons = assets.slice(0, 10).map((asset: string) => {
    const price = prices[asset];
    const priceLabel = price ? ` ${isForexAsset(asset) ? price.toFixed(4) : formatPrice(price)}` : "";
    return {
      text: `${assetEmojis[asset] || "📊"} ${asset}${priceLabel}`,
      callback_data: `qt_asset_${asset}`,
    };
  });

  // 2 per row so price labels fit
  const keyboard: Array<Array<{ text: string; callback_data: string }>> = [];
  for (let i = 0; i < buttons.length; i += 2) {
    keyboard.push(buttons.slice(i, i + 2));
  }

  await tg(token, "sendMessage", {
    chat_id: chatId,
    text:
      `⚡ <b>Quick Trade</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Predict if a price goes 📈 UP or 📉 DOWN!\n\n` +
      `📊 <b>Live Prices</b>\n` +
      `${priceList}${marketHoursNote}\n` +
      `💰 Bet range: <b>$${minBet} – $${maxBet}</b>\n` +
      `⏱️ Round duration: <b>5 minutes</b>\n\n` +
      `Select an asset to trade:`,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [...keyboard, [{ text: "🏠 Home", callback_data: "cmd_home" }]] },
  });
}

// --- Callback query handler ---

async function handleCallback(
  token: string,
  supabase: any,
  callback: any
) {
  const chatId = callback.message.chat.id;
  const data = callback.data;

  await tg(token, "answerCallbackQuery", { callback_query_id: callback.id });

  // Handle command shortcuts from inline buttons
  if (data === "cmd_home") {
    await handleStart(token, chatId);
    return;
  } else if (data === "cmd_help") {
    await handleHelp(token, chatId);
    return;
  } else if (data === "cmd_link") {
    await handleLinkStart(token, chatId);
    return;
  } else if (data === "cmd_markets") {
    await handleMarkets(token, supabase, chatId);
    return;
  } else if (data === "cmd_portfolio") {
    await handlePortfolio(token, supabase, chatId);
    return;
  } else if (data === "cmd_balance") {
    await handleBalance(token, supabase, chatId);
    return;
  } else if (data === "cmd_quicktrade") {
    await handleQuickTrade(token, supabase, chatId);
    return;
  } else if (data === "cmd_faq") {
    await handleFaqStart(token, supabase, chatId);
    return;
  } else if (data === "cmd_notifications") {
    await handleNotifications(token, supabase, chatId);
    return;
  } else if (data === "cmd_settings") {
    await handleSettings(token, supabase, chatId);
    return;
  }

  if (data.startsWith("mktpage_")) {
    const page = parseInt(data.replace("mktpage_", ""), 10) || 0;
    await handleMarkets(token, supabase, chatId, page);
  } else if (data.startsWith("mkt_cust_")) {
    await handleMarketCustomAmount(token, supabase, chatId, data);
  } else if (data.startsWith("mkt_")) {
    await handleMarketDetail(token, supabase, chatId, data);
  } else if (data.startsWith("bet_") || data.startsWith("b_")) {
    await handleBetConfirm(token, supabase, chatId, data);
  } else if (data.startsWith("qt_asset_")) {
    await handleQTAssetSelected(token, chatId, data);
  } else if (data.startsWith("qt_custom_")) {
    await handleQTCustomAmount(token, supabase, chatId, data);
  } else if (data.startsWith("qt_side_")) {
    await handleQTSideSelected(token, supabase, chatId, data);
  } else if (data.startsWith("tg_pref_")) {
    await handleSettingsToggle(token, supabase, chatId, data);
  }
}

async function handleMarketDetail(
  token: string,
  supabase: any,
  chatId: number,
  data: string
) {
  const marketId = data.replace("mkt_", "");

  const { data: markets } = await supabase
    .from("markets")
    .select("id, title, description, yes_price, no_price, volume, participants, end_date, market_type, category, image_url, details, status")
    .in("status", ["active", "ended"])
    .eq("id", marketId)
    .limit(1);

  const mkt = markets?.[0];
  if (!mkt) {
    await tg(token, "sendMessage", { chat_id: chatId, text: "Market not found." });
    return;
  }

  const yesP = Math.round(mkt.yes_price * 100);
  const noP = 100 - yesP;
  const emoji = categoryEmoji(mkt.category);

  const caption =
    `${emoji} <b>${escapeHtml(mkt.title)}</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `${escapeHtml(mkt.description.slice(0, 250))}\n\n` +
    `📊 <b>Market Data</b>\n` +
    `✅ Yes: <b>${yesP}%</b> ${progressBar(yesP)}\n` +
    `❌ No:  <b>${noP}%</b> ${progressBar(noP)}\n\n` +
    `💰 Volume: <b>$${Number(mkt.volume).toFixed(0)}</b>\n` +
    `👥 Participants: <b>${mkt.participants}</b>\n` +
    `📅 Ends: <b>${mkt.end_date}</b>\n\n` +
    `Choose your prediction:`;

  const buttons = [
    [
      { text: `✅ Yes $5 (${yesP}¢)`, callback_data: `b_y_5_${mkt.id}` },
      { text: `❌ No $5 (${noP}¢)`, callback_data: `b_n_5_${mkt.id}` },
    ],
    [
      { text: `✅ Yes $10`, callback_data: `b_y_10_${mkt.id}` },
      { text: `❌ No $10`, callback_data: `b_n_10_${mkt.id}` },
    ],
    [
      { text: `✅ Yes $25`, callback_data: `b_y_25_${mkt.id}` },
      { text: `❌ No $25`, callback_data: `b_n_25_${mkt.id}` },
    ],
    [
      { text: "💲 Custom Amount", callback_data: `mkt_cust_${mkt.id}` },
    ],
    [
      { text: "🌐 View on Web", url: `${APP_URL}/market/${mkt.id}` },
    ],
    [
      { text: "⬅️ Back to Markets", callback_data: "cmd_markets" },
      { text: "🏠 Home", callback_data: "cmd_home" },
    ],
  ];

  // Send with image if available
  if (mkt.image_url) {
    await tg(token, "sendPhoto", {
      chat_id: chatId,
      photo: mkt.image_url,
      caption,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: buttons },
    });
  } else {
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: caption,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: buttons },
    });
  }
}

async function handleBetConfirm(
  token: string,
  supabase: any,
  chatId: number,
  data: string
) {
  const userId = await getUserId(supabase, chatId);
  if (!userId) {
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: "❌ Link your account first: /link email password",
    });
    return;
  }

  // Support both old "bet_yes_5_ID" and new "b_y_5_UUID" formats
  let side: string;
  let amount: number;
  let marketId: string;

  if (data.startsWith("b_")) {
    const parts = data.split("_");
    side = parts[1] === "y" ? "yes" : "no";
    amount = Number(parts[2]);
    marketId = parts.slice(3).join("_");
  } else {
    const parts = data.replace("bet_", "").split("_");
    side = parts[0];
    amount = Number(parts[1]);
    marketId = parts.slice(2).join("_");
  }

  const { data: markets } = await supabase
    .from("markets")
    .select("id, title, yes_price, no_price, status, market_type, category, end_date")
    .in("status", ["active", "ended"])
    .eq("id", marketId)
    .limit(1);

  const mkt = markets?.[0];
  if (!mkt) {
    await tg(token, "sendMessage", { chat_id: chatId, text: "Market not found or closed." });
    return;
  }

  if (mkt.status !== "active" || new Date(mkt.end_date).getTime() < Date.now()) {
    await tg(token, "sendMessage", { chat_id: chatId, text: "⏰ This market has ended and is no longer accepting predictions." });
    return;
  }

  const price = side === "yes" ? mkt.yes_price : mkt.no_price;
  const priceInCents = Math.round(price * 100);
  const shares = amount / price;

  try {
    const { data: bal } = await supabase
      .from("balances")
      .select("amount, bonus_balance")
      .eq("user_id", userId)
      .eq("currency", "USDT")
      .single();

    const currentBalance = Number(bal?.amount || 0);
    if (currentBalance < amount) {
      await tg(token, "sendMessage", {
        chat_id: chatId,
        text:
          `❌ <b>Insufficient balance</b>\n\n` +
          `You have: <b>$${currentBalance.toFixed(2)}</b>\n` +
          `Need: <b>$${amount}</b>`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "💳 Deposit Funds", url: `${APP_URL}/portfolio` }],
          ],
        },
      });
      return;
    }

    const placeBetUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/place-bet`;
    const response = await fetch(placeBetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        marketId: mkt.id,
        side,
        amount,
        price: priceInCents,
        shares,
        userId,
      }),
    });

    if (!response.ok) {
      await executeBetInline(supabase, userId, mkt.id, null, side, amount, priceInCents, shares);
    }

    const emoji = categoryEmoji(mkt.category);

    await tg(token, "sendMessage", {
      chat_id: chatId,
      text:
        `✅ <b>Prediction Placed!</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `${emoji} ${escapeHtml(mkt.title.slice(0, 40))}\n\n` +
        `📍 Side: <b>${side.toUpperCase()}</b>\n` +
        `💵 Amount: <b>$${amount}</b>\n` +
        `💲 Price: <b>${priceInCents}¢</b>\n` +
        `📦 Shares: <b>${shares.toFixed(2)}</b>\n\n` +
        `Good luck! 🍀`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "📊 My Portfolio", callback_data: "cmd_portfolio" },
            { text: "🔮 More Markets", callback_data: "cmd_markets" },
          ],
          [
            { text: "🌐 View Market", url: `${APP_URL}/market/${mkt.id}` },
          ],
          [
            { text: "🏠 Home", callback_data: "cmd_home" },
          ],
        ],
      },
    });
  } catch (err) {
    console.error("Bet error:", err);
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: "❌ Failed to place prediction. Please try again.",
    });
  }
}

async function executeBetInline(
  supabase: any,
  userId: string,
  marketId: string,
  optionId: string | null,
  side: string,
  amount: number,
  price: number,
  shares: number
) {
  const { data: commData } = await supabase
    .from("commission_settings")
    .select("admin_fee_percent, creator_fee_percent, creator_fee_blue_percent, creator_fee_gold_percent, referrer_commission_percent, bc400_pool_percent")
    .limit(1)
    .single();

  const adminFeePercent = Number(commData?.admin_fee_percent ?? 2) / 100;
  const referrerCommissionPercent = Number(commData?.referrer_commission_percent ?? 0) / 100;
  const bc400PoolPercent = Number((commData as any)?.bc400_pool_percent ?? 0) / 100;

  // Determine creator fee based on verification level
  let creatorFeePercent = 0;
  let creatorId: string | null = null;
  {
    const { data: market } = await supabase
      .from("markets")
      .select("creator_wallet")
      .eq("id", marketId)
      .single();

    if (market?.creator_wallet) {
      const { data: creatorProfile } = await supabase
        .from("profiles")
        .select("id, verification_level")
        .eq("id", market.creator_wallet)
        .single();

      if (creatorProfile) {
        creatorId = creatorProfile.id;
        const level = creatorProfile.verification_level || "none";
        if (level === "gold") {
          creatorFeePercent = Number(commData?.creator_fee_gold_percent ?? 3) / 100;
        } else if (level === "blue") {
          creatorFeePercent = Number(commData?.creator_fee_blue_percent ?? 3) / 100;
        } else {
          creatorFeePercent = Number(commData?.creator_fee_percent ?? 3) / 100;
        }
      }
    }
  }

  // Look up trader's referrer
  let referrerId: string | null = null;
  if (referrerCommissionPercent > 0) {
    const { data: traderProfile } = await supabase
      .from("profiles")
      .select("referred_by")
      .eq("id", userId)
      .single();
    referrerId = traderProfile?.referred_by || null;
  }

  const adminAmount = amount * adminFeePercent;
  const creatorAmount = amount * creatorFeePercent;
  const referrerAmount = referrerId ? amount * referrerCommissionPercent : 0;
  const bc400Amount = amount * bc400PoolPercent;
  const totalFees = adminAmount + creatorAmount + referrerAmount + bc400Amount;

  const { data: bal } = await supabase
    .from("balances")
    .select("amount, bonus_balance")
    .eq("user_id", userId)
    .eq("currency", "USDT")
    .single();

  const currentBalance = Number(bal?.amount || 0);
  const currentBonus = Number(bal?.bonus_balance || 0);
  const bonusForFees = Math.min(currentBonus, totalFees);
  const feesFromMain = totalFees - bonusForFees;
  const betAmount = amount - totalFees;
  const mainDeduct = betAmount + feesFromMain;

  if (currentBalance < mainDeduct) throw new Error("Insufficient balance");

  await supabase
    .from("balances")
    .update({
      amount: currentBalance - mainDeduct,
      bonus_balance: currentBonus - bonusForFees,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("currency", "USDT");

  await supabase.from("positions").insert({
    user_id: userId,
    market_id: marketId,
    option_id: optionId,
    side,
    shares,
    avg_price: price / 100,
  });

  await supabase.from("transactions").insert({
    user_id: userId,
    type: "buy",
    amount,
    market_id: marketId,
    option_id: optionId,
    side,
    shares,
    price: price / 100,
    status: "confirmed",
  });

  const poolAmount = amount - totalFees;
  const { data: mkt } = await supabase
    .from("markets")
    .select("volume, participants, yes_price")
    .eq("id", marketId)
    .single();

  if (mkt) {
    const totalLiq = Number(mkt.volume) + poolAmount + 100;
    const impact = Math.min(poolAmount / totalLiq, 0.15);
    let newYes = Number(mkt.yes_price);
    if (side === "yes") newYes = Math.min(0.99, newYes + impact);
    else newYes = Math.max(0.01, newYes - impact);
    const newNo = Math.round((1 - newYes) * 100) / 100;
    newYes = Math.round(newYes * 100) / 100;

    await supabase
      .from("markets")
      .update({
        volume: Number(mkt.volume) + poolAmount,
        participants: mkt.participants + 1,
        yes_price: newYes,
        no_price: newNo,
      })
      .eq("id", marketId);
  }

  // Credit entire total fee to platform pool
  if (totalFees > 0) {
    await supabase.rpc("adjust_platform_pool", { _delta: totalFees });
  }

  // Queue commissions for 48-hour deferred release
  const releasesAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  if (creatorId && creatorAmount > 0) {
    await supabase.from("pending_commissions").insert({
      user_id: creatorId, market_id: marketId, amount: creatorAmount,
      type: "creator", status: "pending", releases_at: releasesAt,
    });
    await supabase.from("notifications").insert({
      user_id: creatorId, title: "Creator Commission Earned! 🎉",
      message: `You earned $${creatorAmount.toFixed(2)} creator commission — it will be credited in 48 hours.`,
      type: "info", market_id: marketId,
    });
  }

  if (referrerId && referrerAmount > 0) {
    await supabase.from("pending_commissions").insert({
      user_id: referrerId, market_id: marketId, amount: referrerAmount,
      type: "referral", status: "pending", releases_at: releasesAt,
    });
    await supabase.from("notifications").insert({
      user_id: referrerId, title: "Referral Commission Earned! 💰",
      message: `You earned $${referrerAmount.toFixed(2)} referral commission — it will be credited in 48 hours.`,
      type: "referral", market_id: marketId,
    });
  }

  if (bc400Amount > 0) {
    await supabase.from("pending_commissions").insert({
      user_id: "00000000-0000-0000-0000-000000000000",
      market_id: marketId, amount: bc400Amount,
      type: "bc400", status: "pending", releases_at: releasesAt,
    });
  }
}

async function handleQTAssetSelected(token: string, chatId: number, data: string) {
  const asset = data.replace("qt_asset_", "");

  const assetEmojis = ASSET_EMOJIS;

  const isForex = isForexAsset(asset);
  const isCommodity = isCommodityAsset(asset);
  const needsMarketHours = isForex || isCommodity;

  // Market hours check
  if (needsMarketHours && !isForexMarketOpen()) {
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text:
        `🌙 <b>Market Closed</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `${assetEmojis[asset] || "📊"} <b>${asset}</b> trading is currently closed.\n\n` +
        `🕐 <b>Trading hours:</b>\n` +
        `Sunday 5:00 PM ET → Friday 5:00 PM ET\n\n` +
        `Try a crypto asset instead — they trade 24/7!`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "⬅️ Back to Assets", callback_data: "cmd_quicktrade" }],
          [{ text: "🏠 Home", callback_data: "cmd_home" }],
        ],
      },
    });
    return;
  }

  const chartUrl = `${APP_URL}/quick-trade?asset=${encodeURIComponent(asset)}`;

  // Fetch live price
  const priceData = await getAssetPrice(asset);
  let priceText = "";
  if (priceData) {
    priceText = `\n💲 <b>Current Price</b>: ${formatAssetPrice(asset, priceData.price)}\n`;
    if (priceData.change24h !== undefined) {
      const changeEmoji = priceData.change24h >= 0 ? "🟢" : "🔴";
      const changeSign = priceData.change24h >= 0 ? "+" : "";
      priceText += `${changeEmoji} <b>24h Change</b>: ${changeSign}${priceData.change24h.toFixed(2)}%\n`;
    }
  }

  // Build TradingView URL based on asset type
  let tvUrl = `https://www.tradingview.com/chart/?symbol=BINANCE:${asset}USDT`;
  if (isForex) {
    tvUrl = `https://www.tradingview.com/chart/?symbol=FX:${asset.replace("/", "")}`;
  } else if (isCommodity) {
    const tvMap: Record<string, string> = { XAU: "XAUUSD", XAG: "XAGUSD", XPT: "XPTUSD", XPD: "XPDUSD" };
    tvUrl = `https://www.tradingview.com/chart/?symbol=OANDA:${tvMap[asset] || asset}`;
  }

  const buttons = [
    [
      { text: "📊 View Chart", url: chartUrl },
      { text: "📈 TradingView", url: tvUrl },
    ],
    [
      { text: "📈 UP ($5)", callback_data: `qt_side_up_5_${asset}` },
      { text: "📉 DOWN ($5)", callback_data: `qt_side_down_5_${asset}` },
    ],
    [
      { text: "📈 UP ($10)", callback_data: `qt_side_up_10_${asset}` },
      { text: "📉 DOWN ($10)", callback_data: `qt_side_down_10_${asset}` },
    ],
    [
      { text: "📈 UP ($25)", callback_data: `qt_side_up_25_${asset}` },
      { text: "📉 DOWN ($25)", callback_data: `qt_side_down_25_${asset}` },
    ],
    [
      { text: "💲 Custom Amount", callback_data: `qt_custom_${asset}` },
    ],
    [
      { text: "⬅️ Back to Assets", callback_data: "cmd_quicktrade" },
      { text: "🏠 Home", callback_data: "cmd_home" },
    ],
  ];

  await tg(token, "sendMessage", {
    chat_id: chatId,
    text:
      `⚡ <b>Quick Trade — ${assetEmojis[asset] || "📊"} ${asset}</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `${priceText}\n` +
      `Will <b>${asset}</b> go UP 📈 or DOWN 📉 in the next 5 minutes?\n\n` +
      `📊 View the chart before deciding!\n\n` +
      `Choose your prediction and amount:`,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: buttons },
  });
}

async function handleQTSideSelected(
  token: string,
  supabase: any,
  chatId: number,
  data: string
) {
  const userId = await getUserId(supabase, chatId);
  if (!userId) {
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: "❌ Link your account first: /link email password",
    });
    return;
  }

  const parts = data.replace("qt_side_", "").split("_");
  const side = parts[0];
  const amount = Number(parts[1]);
  const asset = parts.slice(2).join("_");

  // Market hours check for forex/commodity
  if ((isForexAsset(asset) || isCommodityAsset(asset)) && !isForexMarketOpen()) {
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: "🌙 This market is currently closed. Trading hours: Sunday 5:00 PM ET → Friday 5:00 PM ET.",
      reply_markup: {
        inline_keyboard: [[{ text: "⬅️ Back", callback_data: "cmd_quicktrade" }]],
      },
    });
    return;
  }

  const { data: bal } = await supabase
    .from("balances")
    .select("amount")
    .eq("user_id", userId)
    .eq("currency", "USDT")
    .single();

  if (Number(bal?.amount || 0) < amount) {
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text:
        `❌ <b>Insufficient balance</b>\n\n` +
        `You have: <b>$${Number(bal?.amount || 0).toFixed(2)}</b>\n` +
        `Need: <b>$${amount}</b>`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "💳 Deposit Funds", url: `${APP_URL}/portfolio` }],
        ],
      },
    });
    return;
  }

  const resolveUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/resolve-quick-round`;

  const { data: round, error: roundErr } = await supabase
    .from("quick_rounds")
    .insert({
      asset,
      duration_seconds: 300,
      status: "open",
    })
    .select("id")
    .single();

  if (roundErr || !round) {
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: "❌ Failed to create round. Try again.",
    });
    return;
  }

  await supabase
    .from("balances")
    .update({
      amount: Number(bal!.amount) - amount,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("currency", "USDT");

  await supabase.from("quick_bets").insert({
    user_id: userId,
    round_id: round.id,
    side,
    amount,
    status: "pending",
    streak: 0,
  });

  const assetEmojis = ASSET_EMOJIS;
  const sideEmoji = side === "up" ? "📈" : "📉";

  await tg(token, "sendMessage", {
    chat_id: chatId,
    text:
      `⚡ <b>Quick Trade Placed!</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `${assetEmojis[asset] || "📊"} Asset: <b>${asset}</b>\n` +
      `${sideEmoji} Prediction: <b>${side.toUpperCase()}</b>\n` +
      `💵 Amount: <b>$${amount}</b>\n\n` +
      `⏳ Result in ~5 minutes.\n` +
      `You'll be notified when the round resolves!`,
    parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "⚡ Trade Again", callback_data: "cmd_quicktrade" },
            { text: "📊 Portfolio", callback_data: "cmd_portfolio" },
          ],
          [
            { text: "🏠 Home", callback_data: "cmd_home" },
          ],
        ],
      },
  });

  try {
    await fetch(resolveUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ round_id: round.id }),
    });
  } catch {
    // resolve-quick-round handles its own timing
  }
}

// Handle "Custom Amount" button click — prompt user to type an amount
async function handleQTCustomAmount(
  token: string,
  supabase: any,
  chatId: number,
  data: string
) {
  const asset = data.replace("qt_custom_", "");

  const assetEmojis = ASSET_EMOJIS;

  // Get bet limits
  const { data: settings } = await supabase
    .from("commission_settings")
    .select("qt_min_bet, qt_max_bet")
    .limit(1)
    .single();

  const minBet = settings?.qt_min_bet || 1;
  const maxBet = settings?.qt_max_bet || 500;

  // Store state: reuse telegram_link_sessions with special prefix
  await supabase
    .from("telegram_link_sessions")
    .upsert(
      { chat_id: chatId, email: `qt_custom:${asset}`, created_at: new Date().toISOString() },
      { onConflict: "chat_id" }
    );

  await tg(token, "sendMessage", {
    chat_id: chatId,
    text:
      `💲 <b>Custom Amount — ${assetEmojis[asset] || "📊"} ${asset}</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Type the amount you want to predict with:\n\n` +
      `💰 Min: <b>$${minBet}</b> | Max: <b>$${maxBet}</b>\n\n` +
      `<i>Example: Type <b>15</b> to bet $15</i>\n\n` +
      `<i>Type /cancel to abort</i>`,
    parse_mode: "HTML",
    reply_markup: {
      force_reply: true,
      input_field_placeholder: `Enter amount ($${minBet}-$${maxBet})`,
    },
  });
}

// Handle numeric input for custom amount (QT or Market)
async function handleQTCustomInput(
  token: string,
  supabase: any,
  chatId: number,
  text: string
): Promise<boolean> {
  const { data: session } = await supabase
    .from("telegram_link_sessions")
    .select("email, created_at")
    .eq("chat_id", chatId)
    .single();

  if (!session) return false;

  const isQT = session.email.startsWith("qt_custom:");
  const isMkt = session.email.startsWith("mkt_custom:");
  if (!isQT && !isMkt) return false;

  // Check expiry (5 min)
  const sessionAge = Date.now() - new Date(session.created_at).getTime();
  if (sessionAge > 5 * 60 * 1000) {
    await supabase.from("telegram_link_sessions").delete().eq("chat_id", chatId);
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: "⏰ Session expired. Please try again.",
      reply_markup: {
        inline_keyboard: [[{ text: "🏠 Home", callback_data: "cmd_home" }]],
      },
    });
    return true;
  }

  const identifier = session.email.replace("qt_custom:", "").replace("mkt_custom:", "");
  const amount = Number(text.replace("$", "").trim());

  // Clean up session
  await supabase.from("telegram_link_sessions").delete().eq("chat_id", chatId);

  if (isNaN(amount) || amount <= 0) {
    const retryData = isQT ? `qt_custom_${identifier}` : `mkt_cust_${identifier}`;
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: "❌ Invalid amount. Please enter a number.",
      reply_markup: {
        inline_keyboard: [[{ text: "🔄 Try Again", callback_data: retryData }]],
      },
    });
    return true;
  }

  if (amount < 1 || amount > 500) {
    const retryData = isQT ? `qt_custom_${identifier}` : `mkt_cust_${identifier}`;
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: `❌ Amount must be between <b>$1</b> and <b>$500</b>.`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "🔄 Try Again", callback_data: retryData }]],
      },
    });
    return true;
  }

  if (isQT) {
    // Quick Trade: show UP/DOWN
    const asset = identifier;
    const assetEmojis = ASSET_EMOJIS;

    await tg(token, "sendMessage", {
      chat_id: chatId,
      text:
        `⚡ <b>Quick Trade — ${assetEmojis[asset] || "📊"} ${asset} ($${amount})</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Will <b>${asset}</b> go UP 📈 or DOWN 📉?\n\n` +
        `💵 Amount: <b>$${amount}</b>`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: `📈 UP ($${amount})`, callback_data: `qt_side_up_${amount}_${asset}` },
            { text: `📉 DOWN ($${amount})`, callback_data: `qt_side_down_${amount}_${asset}` },
          ],
          [
            { text: "⬅️ Back to Assets", callback_data: "cmd_quicktrade" },
            { text: "🏠 Home", callback_data: "cmd_home" },
          ],
        ],
      },
    });
  } else {
    // Market bet: show Yes/No with custom amount
    const marketId = identifier;

    const { data: markets } = await supabase
      .from("markets")
      .select("id, title, yes_price, no_price, category")
      .eq("id", marketId)
      .limit(1);

    const mkt = markets?.[0];
    if (!mkt) {
      await tg(token, "sendMessage", { chat_id: chatId, text: "Market not found." });
      return true;
    }

    const yesP = Math.round(mkt.yes_price * 100);
    const noP = 100 - yesP;
    const emoji = categoryEmoji(mkt.category);

    await tg(token, "sendMessage", {
      chat_id: chatId,
      text:
        `${emoji} <b>${escapeHtml(mkt.title.slice(0, 60))}</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `💵 Custom Amount: <b>$${amount}</b>\n\n` +
        `Choose your prediction:`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: `✅ Yes $${amount} (${yesP}¢)`, callback_data: `b_y_${amount}_${mkt.id}` },
            { text: `❌ No $${amount} (${noP}¢)`, callback_data: `b_n_${amount}_${mkt.id}` },
          ],
          [
            { text: "⬅️ Back to Market", callback_data: `mkt_${mkt.id}` },
            { text: "🏠 Home", callback_data: "cmd_home" },
          ],
        ],
      },
    });
  }

  return true;
}

// Handle "Custom Amount" for market predictions
async function handleMarketCustomAmount(
  token: string,
  supabase: any,
  chatId: number,
  data: string
) {
  const marketId = data.replace("mkt_cust_", "");

  // Store state
  await supabase
    .from("telegram_link_sessions")
    .upsert(
      { chat_id: chatId, email: `mkt_custom:${marketId}`, created_at: new Date().toISOString() },
      { onConflict: "chat_id" }
    );

  await tg(token, "sendMessage", {
    chat_id: chatId,
    text:
      `💲 <b>Custom Prediction Amount</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Type the amount you want to predict with:\n\n` +
      `💰 Min: <b>$1</b> | Max: <b>$500</b>\n\n` +
      `<i>Example: Type <b>50</b> to bet $50</i>\n\n` +
      `<i>Type /cancel to abort</i>`,
    parse_mode: "HTML",
    reply_markup: {
      force_reply: true,
      input_field_placeholder: "Enter amount ($1-$500)",
    },
  });
}

// ── FAQ Handlers ──

async function handleFaqStart(
  token: string,
  supabase: any,
  chatId: number
) {
  // Store FAQ session
  await supabase
    .from("telegram_link_sessions")
    .upsert(
      { chat_id: chatId, email: "faq:", created_at: new Date().toISOString() },
      { onConflict: "chat_id" }
    );

  await tg(token, "sendMessage", {
    chat_id: chatId,
    text:
      `❓ <b>OPoll FAQ Assistant</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Ask me anything about the OPoll platform!\n\n` +
      `📝 <b>Example questions:</b>\n` +
      `• How do I deposit funds?\n` +
      `• How does market resolution work?\n` +
      `• What are the trading fees?\n` +
      `• How do referrals work?\n\n` +
      `Type your question below:\n\n` +
      `<i>Type /cancel to exit FAQ mode</i>`,
    parse_mode: "HTML",
  });
}

async function handleFaqSession(
  token: string,
  supabase: any,
  chatId: number,
  question: string
): Promise<boolean> {
  const { data: session } = await supabase
    .from("telegram_link_sessions")
    .select("email, created_at")
    .eq("chat_id", chatId)
    .single();

  if (!session || !session.email.startsWith("faq:")) return false;

  // Check expiry (10 min for FAQ)
  const sessionAge = Date.now() - new Date(session.created_at).getTime();
  if (sessionAge > 10 * 60 * 1000) {
    await supabase.from("telegram_link_sessions").delete().eq("chat_id", chatId);
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: "⏰ FAQ session expired. Type /faq to start again.",
    });
    return true;
  }

  // Send typing indicator
  await tg(token, "sendChatAction", { chat_id: chatId, action: "typing" });

  try {
    // Call faq-ai edge function (non-streaming)
    const faqUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/faq-ai`;
    const response = await fetch(faqUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ question }),
    });

    if (!response.ok) {
      throw new Error(`FAQ API error: ${response.status}`);
    }

    // The faq-ai function streams SSE — we need to collect the full response
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    let fullAnswer = "";
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) fullAnswer += content;
          } catch {
            // skip unparseable chunks
          }
        }
      }
    }

    if (!fullAnswer.trim()) {
      fullAnswer = "Sorry, I couldn't generate an answer. Please try rephrasing your question.";
    }

    // Refresh FAQ session for follow-up questions
    await supabase
      .from("telegram_link_sessions")
      .upsert(
        { chat_id: chatId, email: "faq:", created_at: new Date().toISOString() },
        { onConflict: "chat_id" }
      );

    // Telegram has 4096 char limit — truncate if needed
    const answer = fullAnswer.length > 3800 ? fullAnswer.slice(0, 3800) + "..." : fullAnswer;

    await tg(token, "sendMessage", {
      chat_id: chatId,
      text:
        `❓ <b>FAQ Answer</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `${escapeHtml(answer)}\n\n` +
        `<i>Ask another question or type /cancel to exit.</i>`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🔮 Markets", callback_data: "cmd_markets" },
            { text: "⚡ Quick Trade", callback_data: "cmd_quicktrade" },
          ],
          [
            { text: "🏠 Home", callback_data: "cmd_home" },
          ],
        ],
      },
    });
  } catch (err) {
    console.error("FAQ error:", err);
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: "❌ Sorry, I couldn't answer that right now. Please try again.",
      reply_markup: {
        inline_keyboard: [
          [{ text: "❓ Try Again", callback_data: "cmd_faq" }],
          [{ text: "🏠 Home", callback_data: "cmd_home" }],
        ],
      },
    });
  }

  return true;
}

// ── /notifications handler ──
const NOTIF_TYPE_EMOJI: Record<string, string> = {
  payout: "💰", resolution: "⚖️", refund: "🔄", info: "ℹ️",
  follow: "👤", referral: "🎁", first_prediction_required: "🚀",
  copy_trade: "📋", score: "⚽",
};

async function handleNotifications(
  token: string,
  supabase: any,
  chatId: number
) {
  const userId = await getUserId(supabase, chatId);
  if (!userId) {
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: "❌ Account not linked. Use /link to connect first.",
      reply_markup: { inline_keyboard: [[{ text: "🔗 Link Account", callback_data: "cmd_link" }]] },
    });
    return;
  }

  const { data: notifs } = await supabase
    .from("notifications")
    .select("title, message, type, created_at, market_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (!notifs || notifs.length === 0) {
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: "🔔 <b>Recent Notifications</b>\n━━━━━━━━━━━━━━━━━━━━\n\nNo notifications yet!",
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "🏠 Home", callback_data: "cmd_home" }]] },
    });
    return;
  }

  let text = "🔔 <b>Recent Notifications</b>\n━━━━━━━━━━━━━━━━━━━━\n\n";
  for (const n of notifs) {
    const emoji = NOTIF_TYPE_EMOJI[n.type] || "🔔";
    const date = new Date(n.created_at);
    const timeStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
    text += `${emoji} <b>${escapeHtml(n.title)}</b>\n`;
    text += `   ${escapeHtml(n.message.slice(0, 100))}\n`;
    text += `   <i>${timeStr}</i>\n\n`;
  }

  await tg(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "⚙️ Notification Settings", callback_data: "cmd_settings" },
        ],
        [
          { text: "🏠 Home", callback_data: "cmd_home" },
        ],
      ],
    },
  });
}

// ── /settings handler ──
const PREF_KEYS = [
  { key: "payouts", label: "💰 Payouts & Refunds", desc: "Win/loss/refund alerts" },
  { key: "resolutions", label: "⚖️ Market Resolutions", desc: "Market resolved alerts" },
  { key: "quick_trades", label: "⚡ Quick Trades", desc: "QT win/loss results" },
  { key: "followers", label: "👤 New Followers", desc: "When someone follows you" },
  { key: "deposits", label: "✅ Deposits", desc: "Deposit confirmation alerts" },
  { key: "withdrawals", label: "🏦 Withdrawals", desc: "Withdrawal status alerts" },
  { key: "daily_digest", label: "☀️ Daily Digest", desc: "Morning P&L & trending markets" },
  { key: "info", label: "ℹ️ General Info", desc: "Commissions, referrals, etc." },
];

async function handleSettings(
  token: string,
  supabase: any,
  chatId: number
) {
  const userId = await getUserId(supabase, chatId);
  if (!userId) {
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: "❌ Account not linked. Use /link to connect first.",
      reply_markup: { inline_keyboard: [[{ text: "🔗 Link Account", callback_data: "cmd_link" }]] },
    });
    return;
  }

  const { data: tgUser } = await supabase
    .from("telegram_users")
    .select("notification_preferences")
    .eq("user_id", userId)
    .single();

  const prefs = (tgUser?.notification_preferences || {}) as Record<string, boolean>;

  let text = "⚙️ <b>Notification Settings</b>\n━━━━━━━━━━━━━━━━━━━━\n\n";
  text += "Toggle which notifications you receive on Telegram:\n\n";

  const buttons: Array<Array<{ text: string; callback_data: string }>> = [];
  for (const p of PREF_KEYS) {
    const enabled = prefs[p.key] !== false; // default on
    const statusIcon = enabled ? "✅" : "❌";
    text += `${statusIcon} <b>${p.label}</b> — ${p.desc}\n`;
    buttons.push([{
      text: `${statusIcon} ${p.label}`,
      callback_data: `tg_pref_${p.key}`,
    }]);
  }

  buttons.push([{ text: "🔔 View Notifications", callback_data: "cmd_notifications" }]);
  buttons.push([{ text: "🏠 Home", callback_data: "cmd_home" }]);

  await tg(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: buttons },
  });
}

async function handleSettingsToggle(
  token: string,
  supabase: any,
  chatId: number,
  data: string
) {
  const prefKey = data.replace("tg_pref_", "");
  const userId = await getUserId(supabase, chatId);
  if (!userId) return;

  const { data: tgUser } = await supabase
    .from("telegram_users")
    .select("notification_preferences")
    .eq("user_id", userId)
    .single();

  const prefs = { ...((tgUser?.notification_preferences || {}) as Record<string, boolean>) };
  const currentlyEnabled = prefs[prefKey] !== false;
  prefs[prefKey] = !currentlyEnabled;

  await supabase
    .from("telegram_users")
    .update({ notification_preferences: prefs })
    .eq("user_id", userId);

  const label = PREF_KEYS.find(p => p.key === prefKey)?.label || prefKey;
  const newStatus = prefs[prefKey] ? "✅ ON" : "❌ OFF";

  await tg(token, "sendMessage", {
    chat_id: chatId,
    text: `${label} is now <b>${newStatus}</b>`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "⚙️ Back to Settings", callback_data: "cmd_settings" }],
        [{ text: "🏠 Home", callback_data: "cmd_home" }],
      ],
    },
  });
}
