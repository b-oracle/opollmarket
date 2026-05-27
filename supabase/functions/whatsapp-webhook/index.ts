import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";
const APP_URL = "https://opoll.org";

// ── Twilio signature verification ──
async function verifyTwilioSignature(req: Request): Promise<boolean> {
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  if (!authToken) return false;

  const sig = req.headers.get("X-Twilio-Signature");
  if (!sig) return false;

  const url = req.url;

  // Parse form body (application/x-www-form-urlencoded)
  const bodyText = await req.clone().text();
  const params = new URLSearchParams(bodyText);
  const keys = Array.from(params.keys()).sort();

  let data = url;
  for (const k of keys) {
    data += k;
    data += params.get(k);
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const computed = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
  return computed === sig;
}

// ── Helpers ──

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

// ── Send WhatsApp message via Twilio gateway ──
async function sendWA(to: string, body: string) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
  const FROM = Deno.env.get("TWILIO_WHATSAPP_NUMBER");
  if (!LOVABLE_API_KEY || !TWILIO_API_KEY || !FROM) {
    console.error("Missing Twilio config");
    return;
  }
  try {
    const res = await fetch(`${GATEWAY_URL}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TWILIO_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: `whatsapp:${to}`,
        From: `whatsapp:${FROM}`,
        Body: body,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("Twilio send error:", res.status, err);
    }
  } catch (e) {
    console.error("sendWA error:", e);
  }
}

// ── Price helpers (mirrored from telegram-bot) ──

const GECKO_IDS: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", BNB: "binancecoin", SOL: "solana",
  XRP: "ripple", DOGE: "dogecoin", ADA: "cardano", MATIC: "matic-network",
  AVAX: "avalanche-2", DOT: "polkadot", LINK: "chainlink", SHIB: "shiba-inu",
};

async function fetchCryptoPrices(symbols: string[]): Promise<Record<string, number>> {
  const ids = symbols.map(s => GECKO_IDS[s]).filter(Boolean).join(",");
  if (!ids) return {};
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
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

const COMMODITY_SYMBOLS: Record<string, string> = { XAU: "Gold", XAG: "Silver", XPT: "Platinum", XPD: "Palladium" };

function isForexAsset(symbol: string): boolean { return symbol.includes("/"); }
function isCommodityAsset(symbol: string): boolean { return !!COMMODITY_SYMBOLS[symbol]; }

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

function formatPrice(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(8)}`;
}

function formatAssetPrice(symbol: string, price: number): string {
  if (isForexAsset(symbol)) return price.toFixed(4);
  return formatPrice(price);
}

// ── Session helpers ──
async function getSession(supabase: any, phone: string) {
  const { data } = await supabase.from("whatsapp_sessions").select("*").eq("phone", phone).single();
  return data;
}

async function setSession(supabase: any, phone: string, state: string, data: Record<string, any> = {}) {
  await supabase.from("whatsapp_sessions").upsert(
    { phone, state, data, created_at: new Date().toISOString() },
    { onConflict: "phone" }
  );
}

async function clearSession(supabase: any, phone: string) {
  await supabase.from("whatsapp_sessions").delete().eq("phone", phone);
}

async function getUserId(supabase: any, phone: string): Promise<string | null> {
  const { data } = await supabase.from("whatsapp_users").select("user_id").eq("whatsapp_phone", phone).single();
  return data?.user_id || null;
}

// ── Main handler ──
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === "GET") {
    return new Response(JSON.stringify({ ok: true, message: "WhatsApp bot webhook is active" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method === "POST") {
    const validSig = await verifyTwilioSignature(req);
    if (!validSig) {
      console.error("Twilio signature verification failed");
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // Twilio sends application/x-www-form-urlencoded
    const formData = await req.formData();
    const body = formData.get("Body")?.toString()?.trim() || "";
    const from = formData.get("From")?.toString()?.replace("whatsapp:", "") || "";
    const profileName = formData.get("ProfileName")?.toString() || "";

    if (!from || !body) {
      return new Response("<Response></Response>", { headers: { ...corsHeaders, "Content-Type": "text/xml" } });
    }

    const text = body.toLowerCase().trim();

    // Route commands
    if (text === "start" || text === "hi" || text === "hello" || text === "menu") {
      await handleStart(from);
    } else if (text === "link") {
      await handleLinkStart(from);
    } else if (text === "balance") {
      await handleBalance(supabase, from);
    } else if (text === "portfolio") {
      await handlePortfolio(supabase, from);
    } else if (text === "markets") {
      await handleMarkets(supabase, from, 0);
    } else if (text === "quicktrade" || text === "qt") {
      await handleQuickTrade(supabase, from);
    } else if (text === "faq") {
      await handleFaqStart(supabase, from);
    } else if (text === "stats") {
      await handleStats(supabase, from);
    } else if (text === "unlink") {
      await handleUnlink(supabase, from);
    } else if (text === "help") {
      await handleHelp(from);
    } else if (text === "cancel") {
      await clearSession(supabase, from);
      await sendWA(from, "❌ Cancelled.");
    } else if (text.startsWith("market ")) {
      const page = parseInt(text.replace("market ", ""), 10);
      if (!isNaN(page)) await handleMarkets(supabase, from, page - 1);
    } else if (text.startsWith("view ")) {
      const marketId = body.replace(/^view\s+/i, "").trim();
      await handleMarketDetail(supabase, from, marketId);
    } else if (text.startsWith("bet ")) {
      await handleBetCommand(supabase, from, body);
    } else if (text.startsWith("qt ")) {
      await handleQTCommand(supabase, from, body);
    } else {
      // Check session state
      const handled = await handleSessionInput(supabase, from, body, profileName);
      if (!handled) {
        await sendWA(from,
          "🔮 *OPoll Market*\n\n" +
          "I didn't understand that. Here are the commands:\n\n" +
          "• *start* — Welcome menu\n" +
          "• *link* — Link your account\n" +
          "• *balance* — Check balance\n" +
          "• *portfolio* — Your positions\n" +
          "• *markets* — Browse markets\n" +
          "• *quicktrade* — Quick Trade\n" +
          "• *faq* — Ask a question\n" +
          "• *stats* — Platform stats\n" +
          "• *help* — All commands"
        );
      }
    }

    // Return TwiML empty response (we send via API instead)
    return new Response("<Response></Response>", {
      headers: { ...corsHeaders, "Content-Type": "text/xml" },
    });
  } catch (err) {
    console.error("whatsapp-webhook error:", err);
    return new Response("<Response></Response>", {
      headers: { ...corsHeaders, "Content-Type": "text/xml" },
    });
  }
});

// ── Command Handlers ──

async function handleStart(phone: string) {
  await sendWA(phone,
    "🔮 *Welcome to OPoll Prediction Market!*\n" +
    "━━━━━━━━━━━━━━━━━━━━\n" +
    "The World's First Web + Telegram + WhatsApp prediction market protocol.\n\n" +
    "📊 Predict outcomes\n" +
    "💹 Trade markets\n" +
    "⚡ Quick Trade crypto prices\n" +
    "🏆 Win rewards\n\n" +
    "To get started, type:\n" +
    "• *link* — Connect your account\n" +
    "• *markets* — Browse predictions\n" +
    "• *quicktrade* — Predict crypto prices\n" +
    "• *help* — All commands\n\n" +
    `🌐 Web: ${APP_URL}`
  );
}

async function handleHelp(phone: string) {
  await sendWA(phone,
    "📖 *OPoll Market — Commands*\n" +
    "━━━━━━━━━━━━━━━━━━━━\n\n" +
    "🔗 *Account*\n" +
    "  link — Link your account\n" +
    "  unlink — Unlink account\n" +
    "  cancel — Cancel current action\n\n" +
    "📊 *Trading*\n" +
    "  markets — Browse active markets\n" +
    "  view <id> — View market details\n" +
    "  bet yes/no <amount> <market_id>\n" +
    "  portfolio — Your positions\n" +
    "  balance — Check balance\n\n" +
    "⚡ *Quick Trade*\n" +
    "  quicktrade — Pick an asset\n" +
    "  qt up/down <amount> <asset>\n\n" +
    "📈 *Info*\n" +
    "  faq — Ask the FAQ assistant\n" +
    "  stats — Platform statistics\n" +
    "  help — Show this message"
  );
}

async function handleLinkStart(supabase: any, phone: string, profileName: string) {
  // Drop any stale session so a leftover state can't accept a message as a password.
  await clearSession(supabase, phone);

  const linkToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const { error } = await supabase.from("bot_link_tokens").insert({
    token: linkToken,
    kind: "whatsapp",
    whatsapp_phone: phone,
    display_name: profileName || null,
  });
  if (error) {
    console.error("bot_link_tokens insert failed", error);
    await sendWA(phone, "❌ Couldn't start linking right now. Please try again in a moment.");
    return;
  }

  const url = `${APP_URL}/link-bot?token=${linkToken}&kind=whatsapp`;
  await sendWA(phone,
    "🔗 *Link Your Account*\n" +
    "━━━━━━━━━━━━━━━━━━━━\n\n" +
    "Tap the secure link below and sign in to OPoll in your browser to finish linking:\n\n" +
    url + "\n\n" +
    "🔒 We never ask for your password in chat.\n" +
    "⏰ Link expires in 10 minutes."
  );
}

async function handleSessionInput(supabase: any, phone: string, text: string, _profileName: string): Promise<boolean> {
  const session = await getSession(supabase, phone);
  if (!session) return false;

  // Legacy password-based linking sessions are no longer accepted — clear and inform.
  if (session.state === "link_password" || session.state === "link_email") {
    await clearSession(supabase, phone);
    await sendWA(phone, "🔒 Linking now uses a secure browser flow. Type *link* to get a fresh link.");
    return true;
  }

  // FAQ session
  if (session.state === "faq") {
    const age = Date.now() - new Date(session.created_at).getTime();
    if (age > 10 * 60 * 1000) {
      await clearSession(supabase, phone);
      await sendWA(phone, "⏰ FAQ session expired. Type *faq* to start again.");
      return true;
    }
    await handleFaqQuestion(supabase, phone, text);
    return true;
  }

  // QT custom amount
  if (session.state === "qt_custom") {
    const asset = session.data?.asset;
    if (!asset) { await clearSession(supabase, phone); return false; }
    await clearSession(supabase, phone);
    const amount = Number(text.replace("$", "").trim());
    if (isNaN(amount) || amount < 1 || amount > 500) {
      await sendWA(phone, "❌ Invalid amount. Must be $1–$500. Type *quicktrade* to try again.");
      return true;
    }
    await sendWA(phone,
      `⚡ *Quick Trade — ${asset} ($${amount})*\n\n` +
      `Will *${asset}* go UP or DOWN in the next 5 minutes?\n\n` +
      `Reply:\n` +
      `• *qt up ${amount} ${asset}*\n` +
      `• *qt down ${amount} ${asset}*`
    );
    return true;
  }

  // Market custom amount
  if (session.state === "mkt_custom") {
    const marketId = session.data?.marketId;
    if (!marketId) { await clearSession(supabase, phone); return false; }
    await clearSession(supabase, phone);
    const amount = Number(text.replace("$", "").trim());
    if (isNaN(amount) || amount < 1 || amount > 500) {
      await sendWA(phone, "❌ Invalid amount. Must be $1–$500.");
      return true;
    }
    await sendWA(phone,
      `💲 Custom amount: *$${amount}*\n\n` +
      `Reply:\n` +
      `• *bet yes ${amount} ${marketId}*\n` +
      `• *bet no ${amount} ${marketId}*`
    );
    return true;
  }

  return false;
}


async function handleUnlink(supabase: any, phone: string) {
  await supabase.from("whatsapp_users").delete().eq("whatsapp_phone", phone);
  await sendWA(phone, "✅ Account unlinked. Type *link* to connect again.");
}

async function handleBalance(supabase: any, phone: string) {
  const userId = await getUserId(supabase, phone);
  if (!userId) {
    await sendWA(phone, "❌ Account not linked. Type *link* first.");
    return;
  }

  const { data: bal } = await supabase.from("balances").select("amount, bonus_balance").eq("user_id", userId).eq("currency", "USDT").single();
  const main = Number(bal?.amount || 0);
  const bonus = Number(bal?.bonus_balance || 0);
  const total = main + bonus;
  const mainPct = total > 0 ? Math.round((main / total) * 100) : 0;

  await sendWA(phone,
    `💰 *Your Balance*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `💵 Main:  *$${main.toFixed(2)}*\n` +
    `🎁 Bonus: *$${bonus.toFixed(2)}*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `💎 Total: *$${total.toFixed(2)}*\n\n` +
    `${progressBar(mainPct, 15)} ${mainPct}% main\n\n` +
    `💳 Deposit/Withdraw: ${APP_URL}/portfolio`
  );
}

async function handlePortfolio(supabase: any, phone: string) {
  const userId = await getUserId(supabase, phone);
  if (!userId) { await sendWA(phone, "❌ Account not linked. Type *link* first."); return; }

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
    await sendWA(phone,
      `📊 *${displayName}'s Portfolio*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
      `💰 Balance: *$${mainBal.toFixed(2)}*\n🎁 Bonus: *$${bonusBal.toFixed(2)}*\n\n` +
      `📂 No active positions yet.\nType *markets* to start predicting!`
    );
    return;
  }

  const marketIds = [...new Set(positions.map((p: any) => p.market_id))];
  const { data: marketsData } = await supabase.from("markets").select("id, title, yes_price, no_price, status, category").in("id", marketIds);
  const marketMap = new Map<string, any>(((marketsData || []) as any[]).map((m: any) => [m.id, m]));

  let totalValue = 0;
  let totalPnl = 0;
  let positionLines = "";

  for (const pos of positions.slice(0, 8)) {
    const mkt = marketMap.get(pos.market_id);
    const title = mkt ? mkt.title.slice(0, 30) : "Unknown";
    const emoji = mkt ? categoryEmoji(mkt.category) : "🔮";
    const currentPrice = mkt ? (pos.side === "yes" ? mkt.yes_price : mkt.no_price) : pos.avg_price;
    const value = currentPrice * pos.shares;
    const pnl = (currentPrice - pos.avg_price) * pos.shares;
    totalValue += value;
    totalPnl += pnl;

    const pnlEmoji = pnl >= 0 ? "🟢" : "🔴";
    const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
    positionLines += `${emoji} *${title}*\n   ${pos.side.toUpperCase()} × ${pos.shares.toFixed(1)} · ${pnlEmoji} ${pnlStr}\n\n`;
  }

  const pnlEmoji = totalPnl >= 0 ? "📈" : "📉";
  const pnlSign = totalPnl >= 0 ? "+" : "";

  await sendWA(phone,
    `📊 *${displayName}'s Portfolio*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `💰 Cash: *$${mainBal.toFixed(2)}* · 🎁 Bonus: *$${bonusBal.toFixed(2)}*\n` +
    `📦 Positions Value: *$${totalValue.toFixed(2)}*\n` +
    `${pnlEmoji} Total P&L: *${pnlSign}$${totalPnl.toFixed(2)}*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    positionLines +
    (positions.length > 8 ? `_...and ${positions.length - 8} more_\n\n` : "") +
    `🌐 Full portfolio: ${APP_URL}/portfolio`
  );
}

const MARKETS_PER_PAGE = 5;

async function handleMarkets(supabase: any, phone: string, page: number) {
  const from = page * MARKETS_PER_PAGE;
  const to = from + MARKETS_PER_PAGE - 1;

  const { data: markets, count } = await supabase
    .from("markets")
    .select("id, title, yes_price, volume, category, participants", { count: "exact" })
    .eq("status", "active")
    .order("volume", { ascending: false })
    .range(from, to);

  if (!markets || markets.length === 0) {
    await sendWA(phone, page === 0 ? "No active markets right now." : "No more markets.");
    return;
  }

  const totalPages = Math.ceil((count || 0) / MARKETS_PER_PAGE);
  let text = `📋 *Markets* (Page ${page + 1}/${totalPages})\n━━━━━━━━━━━━━━━━━━━━\n\n`;

  for (let i = 0; i < markets.length; i++) {
    const m = markets[i];
    const num = from + i + 1;
    const yesP = Math.round(m.yes_price * 100);
    const emoji = categoryEmoji(m.category);
    const title = m.title.length > 45 ? m.title.slice(0, 42) + "..." : m.title;
    text += `*${num}.* ${emoji} ${title}\n   ✅ ${yesP}% · 💰 $${Number(m.volume).toFixed(0)} · 👥 ${m.participants}\n\n`;
  }

  text += `To view a market:\n  *view <market_id>*\n\n`;
  if (page + 1 < totalPages) {
    text += `Next page: *market ${page + 2}*\n`;
  }
  text += `\n🌐 Web: ${APP_URL}`;

  // Also include market IDs for easy access
  text += "\n\n_Market IDs:_\n";
  for (const m of markets) {
    text += `${m.title.slice(0, 25)}: \`${m.id}\`\n`;
  }

  await sendWA(phone, text);
}

async function handleMarketDetail(supabase: any, phone: string, marketId: string) {
  const { data: markets } = await supabase
    .from("markets")
    .select("id, title, description, yes_price, no_price, volume, participants, end_date, market_type, category, status")
    .eq("id", marketId)
    .limit(1);

  const mkt = markets?.[0];
  if (!mkt) { await sendWA(phone, "Market not found."); return; }

  const yesP = Math.round(mkt.yes_price * 100);
  const noP = 100 - yesP;
  const emoji = categoryEmoji(mkt.category);

  await sendWA(phone,
    `${emoji} *${mkt.title}*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `${mkt.description.slice(0, 250)}\n\n` +
    `📊 *Market Data*\n` +
    `✅ Yes: *${yesP}%* ${progressBar(yesP)}\n` +
    `❌ No:  *${noP}%* ${progressBar(noP)}\n\n` +
    `💰 Volume: *$${Number(mkt.volume).toFixed(0)}*\n` +
    `👥 Participants: *${mkt.participants}*\n` +
    `📅 Ends: ${mkt.end_date}\n\n` +
    `To predict, reply:\n` +
    `• *bet yes 5 ${mkt.id}*\n` +
    `• *bet no 10 ${mkt.id}*\n\n` +
    `🌐 ${APP_URL}/market/${mkt.id}`
  );
}

async function handleBetCommand(supabase: any, phone: string, rawText: string) {
  const userId = await getUserId(supabase, phone);
  if (!userId) { await sendWA(phone, "❌ Account not linked. Type *link* first."); return; }

  // Parse: bet yes/no <amount> <marketId>
  const parts = rawText.trim().split(/\s+/);
  if (parts.length < 4) {
    await sendWA(phone, "Usage: *bet yes/no <amount> <market_id>*\nExample: bet yes 10 abc-123");
    return;
  }

  const side = parts[1].toLowerCase();
  const amount = Number(parts[2]);
  const marketId = parts.slice(3).join(" ");

  if (!["yes", "no"].includes(side)) { await sendWA(phone, "Side must be *yes* or *no*."); return; }
  if (isNaN(amount) || amount < 1) { await sendWA(phone, "Invalid amount."); return; }

  const { data: markets } = await supabase.from("markets").select("id, title, yes_price, no_price, status, end_date, category").eq("id", marketId).limit(1);
  const mkt = markets?.[0];
  if (!mkt) { await sendWA(phone, "Market not found."); return; }
  if (mkt.status !== "active" || new Date(mkt.end_date).getTime() < Date.now()) {
    await sendWA(phone, "⏰ This market has ended.");
    return;
  }

  const price = side === "yes" ? mkt.yes_price : mkt.no_price;
  const priceInCents = Math.round(price * 100);
  const shares = amount / price;

  // Check balance
  const { data: bal } = await supabase.from("balances").select("amount").eq("user_id", userId).eq("currency", "USDT").single();
  if (Number(bal?.amount || 0) < amount) {
    await sendWA(phone, `❌ Insufficient balance. You have: $${Number(bal?.amount || 0).toFixed(2)}\n\n💳 Deposit: ${APP_URL}/portfolio`);
    return;
  }

  try {
    const placeBetUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/place-bet`;
    const response = await fetch(placeBetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ marketId: mkt.id, side, amount, price: priceInCents, shares, userId }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("place-bet error:", err);
      await sendWA(phone, "❌ Failed to place prediction. Please try again.");
      return;
    }

    const emoji = categoryEmoji(mkt.category);
    await sendWA(phone,
      `✅ *Prediction Placed!*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
      `${emoji} ${mkt.title.slice(0, 40)}\n\n` +
      `📍 Side: *${side.toUpperCase()}*\n` +
      `💵 Amount: *$${amount}*\n` +
      `💲 Price: *${priceInCents}¢*\n` +
      `📦 Shares: *${shares.toFixed(2)}*\n\n` +
      `Good luck! 🍀`
    );
  } catch (err) {
    console.error("Bet error:", err);
    await sendWA(phone, "❌ Failed to place prediction. Please try again.");
  }
}

async function handleQuickTrade(supabase: any, phone: string) {
  const userId = await getUserId(supabase, phone);
  if (!userId) { await sendWA(phone, "❌ Account not linked. Type *link* first."); return; }

  const { data: settings } = await supabase.from("commission_settings").select("qt_enabled_assets, qt_min_bet, qt_max_bet").limit(1).single();
  const assets = (settings?.qt_enabled_assets || "BTC,ETH,BNB").split(",").map((a: string) => a.trim());
  const minBet = settings?.qt_min_bet || 1;
  const maxBet = settings?.qt_max_bet || 500;

  const cryptoAssets = assets.filter((a: string) => !isForexAsset(a) && !isCommodityAsset(a));
  const prices = await fetchCryptoPrices(cryptoAssets.slice(0, 12));

  for (const asset of assets) {
    if (isForexAsset(asset) || isCommodityAsset(asset)) {
      const p = await getAssetPrice(asset);
      if (p) prices[asset] = p.price;
    }
  }

  let priceList = "";
  for (const asset of assets.slice(0, 10)) {
    const price = prices[asset];
    priceList += price
      ? `• *${asset}*: ${isForexAsset(asset) ? price.toFixed(4) : formatPrice(price)}\n`
      : `• *${asset}*\n`;
  }

  const forexOpen = isForexMarketOpen();
  const hasForex = assets.some((a: string) => isForexAsset(a) || isCommodityAsset(a));
  let marketNote = "";
  if (hasForex && !forexOpen) {
    marketNote = "\n🌙 _Forex & Commodity markets are closed. Opens Sunday 5:00 PM ET._\n";
  }

  await sendWA(phone,
    `⚡ *Quick Trade*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Predict if a price goes 📈 UP or 📉 DOWN!\n\n` +
    `📊 *Live Prices*\n${priceList}${marketNote}\n` +
    `💰 Bet range: *$${minBet}–$${maxBet}*\n` +
    `⏱️ Round duration: *5 minutes*\n\n` +
    `To trade, reply:\n` +
    `*qt up <amount> <asset>*\n` +
    `*qt down <amount> <asset>*\n\n` +
    `Example: *qt up 5 BTC*`
  );
}

async function handleQTCommand(supabase: any, phone: string, rawText: string) {
  const userId = await getUserId(supabase, phone);
  if (!userId) { await sendWA(phone, "❌ Account not linked. Type *link* first."); return; }

  // Parse: qt up/down <amount> <asset>
  const parts = rawText.trim().split(/\s+/);
  if (parts.length < 4) {
    await sendWA(phone, "Usage: *qt up/down <amount> <asset>*\nExample: qt up 5 BTC");
    return;
  }

  const side = parts[1].toLowerCase();
  const amount = Number(parts[2]);
  const asset = parts.slice(3).join("/"); // Support EUR/USD

  if (!["up", "down"].includes(side)) { await sendWA(phone, "Side must be *up* or *down*."); return; }
  if (isNaN(amount) || amount < 1 || amount > 500) { await sendWA(phone, "Amount must be *$1–$500*."); return; }

  // Market hours check
  if ((isForexAsset(asset) || isCommodityAsset(asset)) && !isForexMarketOpen()) {
    await sendWA(phone, "🌙 This market is currently closed.\nTrading hours: Sunday 5:00 PM ET → Friday 5:00 PM ET.");
    return;
  }

  // Check balance
  const { data: bal } = await supabase.from("balances").select("amount").eq("user_id", userId).eq("currency", "USDT").single();
  if (Number(bal?.amount || 0) < amount) {
    await sendWA(phone, `❌ Insufficient balance. You have: $${Number(bal?.amount || 0).toFixed(2)}\n\n💳 Deposit: ${APP_URL}/portfolio`);
    return;
  }

  // Create round
  const { data: round, error: roundErr } = await supabase
    .from("quick_rounds")
    .insert({ asset, duration_seconds: 300, status: "open" })
    .select("id")
    .single();

  if (roundErr || !round) { await sendWA(phone, "❌ Failed to create round. Try again."); return; }

  // Deduct balance atomically
  const { data: debitResult } = await supabase.rpc("debit_balance_atomic", {
    _user_id: userId,
    _main_deduct: amount,
    _bonus_deduct: 0,
  });

  if (!debitResult?.success) {
    await sendWA(phone, `❌ Insufficient balance. Please try again.`);
    return;
  }

  // Place bet
  await supabase.from("quick_bets").insert({
    user_id: userId, round_id: round.id, side, amount, status: "pending", streak: 0,
  });

  const sideEmoji = side === "up" ? "📈" : "📉";
  await sendWA(phone,
    `⚡ *Quick Trade Placed!*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📊 Asset: *${asset}*\n` +
    `${sideEmoji} Prediction: *${side.toUpperCase()}*\n` +
    `💵 Amount: *$${amount}*\n\n` +
    `⏳ Result in ~5 minutes.\nYou'll be notified when the round resolves!`
  );

  // Trigger resolution
  try {
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/resolve-quick-round`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ round_id: round.id }),
    });
  } catch { /* resolve handles its own timing */ }
}

async function handleStats(supabase: any, phone: string) {
  try {
    const [marketsRes, profilesRes, volumeRes, quickBetsRes] = await Promise.all([
      supabase.from("markets").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("markets").select("volume").eq("status", "active"),
      supabase.from("quick_bets").select("id", { count: "exact", head: true }).in("status", ["won", "lost"]),
    ]);

    const activeMarkets = marketsRes.count ?? 0;
    const totalUsers = profilesRes.count ?? 0;
    const totalVolume = (volumeRes.data || []).reduce((sum: number, m: any) => sum + (m.volume || 0), 0);
    const totalQuickBets = quickBetsRes.count ?? 0;

    await sendWA(phone,
      `📊 *OPoll Platform Stats*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
      `🏛️ Active Markets: *${activeMarkets}*\n` +
      `👥 Total Users: *${totalUsers}*\n` +
      `💰 Total Volume: *$${totalVolume.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}*\n` +
      `⚡ Quick Trade Bets: *${totalQuickBets.toLocaleString()}*`
    );
  } catch (err) {
    console.error("handleStats error:", err);
    await sendWA(phone, "❌ Failed to fetch stats. Please try again.");
  }
}

async function handleFaqStart(supabase: any, phone: string) {
  await setSession(supabase, phone, "faq");
  await sendWA(phone,
    `❓ *OPoll FAQ Assistant*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Ask me anything about the OPoll platform!\n\n` +
    `📝 *Example questions:*\n` +
    `• How do I deposit funds?\n` +
    `• How does market resolution work?\n` +
    `• What are the trading fees?\n` +
    `• How do referrals work?\n\n` +
    `Type your question below:\n\n` +
    `_Type cancel to exit FAQ mode_`
  );
}

async function handleFaqQuestion(supabase: any, phone: string, question: string) {
  try {
    const faqUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/faq-ai`;
    const response = await fetch(faqUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ question }),
    });

    if (!response.ok) throw new Error(`FAQ API error: ${response.status}`);

    // Collect SSE stream
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    let fullAnswer = "";
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split("\n")) {
        if (line.startsWith("data: ")) {
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) fullAnswer += content;
          } catch { /* skip */ }
        }
      }
    }

    if (!fullAnswer.trim()) fullAnswer = "Sorry, I couldn't generate an answer. Please try rephrasing.";

    // Refresh session
    await setSession(supabase, phone, "faq");

    // WhatsApp has ~4096 char limit
    const answer = fullAnswer.length > 3800 ? fullAnswer.slice(0, 3800) + "..." : fullAnswer;

    await sendWA(phone,
      `❓ *FAQ Answer*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
      `${answer}\n\n` +
      `_Ask another question or type cancel to exit._`
    );
  } catch (err) {
    console.error("FAQ error:", err);
    await sendWA(phone, "❌ Sorry, I couldn't answer that right now. Please try again.");
  }
}
