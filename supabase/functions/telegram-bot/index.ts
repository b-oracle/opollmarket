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

const APP_URL = "https://opoll.org";

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
    } else if (text.startsWith("/link ")) {
      await handleLink(token, supabase, chatId, text, username);
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
    } else {
      await tg(token, "sendMessage", {
        chat_id: chatId,
        text: "Unknown command. Type /help to see available commands.",
      });
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
      "🔮 <b>Welcome to OPoll Market</b>\n" +
      "━━━━━━━━━━━━━━━━━━━━\n" +
      "The World's First Web + Telegram + WhatsApp prediction market protocol.\n\n" +
      "📊 Predict outcomes\n" +
      "💹 Trade markets\n" +
      "🏆 Win rewards\n\n" +
      "To get started, link your account:\n" +
      "<code>/link your@email.com yourpassword</code>",
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "📖 Help", callback_data: "cmd_help" },
          { text: "🔮 Markets", callback_data: "cmd_markets" },
        ],
        [
          { text: "🌐 Open Web App", url: APP_URL },
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
      "  /link <i>email password</i> — Link account\n" +
      "  /unlink — Unlink account\n\n" +
      "📊 <b>Trading</b>\n" +
      "  /markets — Browse active markets\n" +
      "  /portfolio — View your positions\n" +
      "  /balance — Check your balance\n\n" +
      "⚡ <b>Quick Trade</b>\n" +
      "  /quicktrade — Predict crypto prices\n\n" +
      "📈 <b>Info</b>\n" +
      "  /stats — Platform statistics\n" +
      "  /help — Show this message",
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🔮 Markets", callback_data: "cmd_markets" },
          { text: "💰 Balance", callback_data: "cmd_balance" },
        ],
        [
          { text: "🌐 Open Web App", url: APP_URL },
        ],
      ],
    },
  });
}

async function handleStats(
  token: string,
  supabase: ReturnType<typeof createClient>,
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

async function handleLink(
  token: string,
  supabase: ReturnType<typeof createClient>,
  chatId: number,
  text: string,
  username: string | null
) {
  const parts = text.split(" ");
  if (parts.length < 3) {
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: "Usage: /link your@email.com yourpassword",
    });
    return;
  }

  const email = parts[1];
  const password = parts.slice(2).join(" ");

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
      text: "❌ Invalid email or password. Please try again.",
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

  try {
    await tg(token, "deleteMessage", {
      chat_id: chatId,
      message_id: (await supabase).toString(),
    });
  } catch {
    // Best effort
  }

  // Get display name for personalized greeting
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
      `⚠️ For security, please delete your /link message.\n\n` +
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
  supabase: ReturnType<typeof createClient>,
  chatId: number
) {
  await supabase.from("telegram_users").delete().eq("telegram_chat_id", chatId);
  await tg(token, "sendMessage", {
    chat_id: chatId,
    text: "✅ Account unlinked. Use /link to connect again.",
    reply_markup: {
      inline_keyboard: [
        [{ text: "🔗 Link Account Again", callback_data: "cmd_help" }],
      ],
    },
  });
}

async function getUserId(
  supabase: ReturnType<typeof createClient>,
  chatId: number
): Promise<string | null> {
  const { data } = await supabase
    .from("telegram_users")
    .select("user_id")
    .eq("telegram_chat_id", chatId)
    .single();
  return data?.user_id || null;
}

async function handleMarkets(
  token: string,
  supabase: ReturnType<typeof createClient>,
  chatId: number
) {
  const { data: markets } = await supabase
    .from("markets")
    .select("id, title, yes_price, volume, category, market_type, end_date, image_url, participants")
    .eq("status", "active")
    .order("volume", { ascending: false })
    .limit(5);

  if (!markets || markets.length === 0) {
    await tg(token, "sendMessage", { chat_id: chatId, text: "No active markets right now." });
    return;
  }

  // Send each market as a rich card with image
  for (const m of markets) {
    const yesP = Math.round(m.yes_price * 100);
    const noP = 100 - yesP;
    const emoji = categoryEmoji(m.category);
    const yesBar = progressBar(yesP, 10);
    const vol = Number(m.volume).toFixed(0);

    const caption =
      `${emoji} <b>${escapeHtml(m.title)}</b>\n\n` +
      `✅ Yes: <b>${yesP}%</b> ${yesBar}\n` +
      `❌ No:  <b>${noP}%</b> ${progressBar(noP, 10)}\n\n` +
      `💰 Vol: $${vol} · 👥 ${m.participants}\n` +
      `📅 Ends: ${m.end_date}`;

    const buttons = [
      [
        { text: `✅ Yes (${yesP}¢)`, callback_data: `mkt_${m.id.slice(0, 30)}` },
        { text: `❌ No (${noP}¢)`, callback_data: `mkt_${m.id.slice(0, 30)}` },
      ],
      [
        { text: "📊 View Details", callback_data: `mkt_${m.id.slice(0, 30)}` },
        { text: "🌐 Open on Web", url: `${APP_URL}/market/${m.id}` },
      ],
    ];

    if (m.image_url) {
      await tg(token, "sendPhoto", {
        chat_id: chatId,
        photo: m.image_url,
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

  // Navigation footer
  await tg(token, "sendMessage", {
    chat_id: chatId,
    text: `📋 Showing top ${markets.length} markets by volume`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "⚡ Quick Trade", callback_data: "cmd_quicktrade" },
          { text: "🌐 All Markets", url: APP_URL },
        ],
      ],
    },
  });
}

async function handlePortfolio(
  token: string,
  supabase: ReturnType<typeof createClient>,
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
        ],
      },
    });
    return;
  }

  // Get market titles
  const marketIds = [...new Set(positions.map((p) => p.market_id))];
  const { data: marketsData } = await supabase
    .from("markets")
    .select("id, title, yes_price, no_price, status, category")
    .in("id", marketIds);

  const marketMap = new Map((marketsData || []).map((m) => [m.id, m]));

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
      ],
    },
  });
}

async function handleBalance(
  token: string,
  supabase: ReturnType<typeof createClient>,
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
      ],
    },
  });
}

async function handleQuickTrade(
  token: string,
  supabase: ReturnType<typeof createClient>,
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

  const assets = (settings?.qt_enabled_assets || "BTC,ETH,BNB").split(",");
  const minBet = settings?.qt_min_bet || 1;
  const maxBet = settings?.qt_max_bet || 500;

  // Asset emojis
  const assetEmojis: Record<string, string> = {
    BTC: "₿", ETH: "Ξ", BNB: "🔶", SOL: "◎", XRP: "✕", DOGE: "🐕",
  };

  const buttons = assets.slice(0, 6).map((asset: string) => ({
    text: `${assetEmojis[asset.trim()] || "📊"} ${asset.trim()}`,
    callback_data: `qt_asset_${asset.trim()}`,
  }));

  const keyboard: Array<Array<{ text: string; callback_data: string }>> = [];
  for (let i = 0; i < buttons.length; i += 3) {
    keyboard.push(buttons.slice(i, i + 3));
  }

  await tg(token, "sendMessage", {
    chat_id: chatId,
    text:
      `⚡ <b>Quick Trade</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Predict if a crypto price goes 📈 UP or 📉 DOWN!\n\n` +
      `💰 Bet range: <b>$${minBet} – $${maxBet}</b>\n` +
      `⏱️ Round duration: <b>5 minutes</b>\n\n` +
      `Select an asset to trade:`,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: keyboard },
  });
}

// --- Callback query handler ---

async function handleCallback(
  token: string,
  supabase: ReturnType<typeof createClient>,
  callback: any
) {
  const chatId = callback.message.chat.id;
  const data = callback.data;

  await tg(token, "answerCallbackQuery", { callback_query_id: callback.id });

  // Handle command shortcuts from inline buttons
  if (data === "cmd_help") {
    await handleHelp(token, chatId);
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
  }

  if (data.startsWith("mkt_")) {
    await handleMarketDetail(token, supabase, chatId, data);
  } else if (data.startsWith("bet_")) {
    await handleBetConfirm(token, supabase, chatId, data);
  } else if (data.startsWith("qt_asset_")) {
    await handleQTAssetSelected(token, chatId, data);
  } else if (data.startsWith("qt_side_")) {
    await handleQTSideSelected(token, supabase, chatId, data);
  }
}

async function handleMarketDetail(
  token: string,
  supabase: ReturnType<typeof createClient>,
  chatId: number,
  data: string
) {
  const partialId = data.replace("mkt_", "");

  const { data: markets } = await supabase
    .from("markets")
    .select("id, title, description, yes_price, no_price, volume, participants, end_date, market_type, category, image_url, details")
    .eq("status", "active")
    .like("id", `${partialId}%`)
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
      { text: `✅ Yes $5 (${yesP}¢)`, callback_data: `bet_yes_5_${mkt.id.slice(0, 20)}` },
      { text: `❌ No $5 (${noP}¢)`, callback_data: `bet_no_5_${mkt.id.slice(0, 20)}` },
    ],
    [
      { text: `✅ Yes $10`, callback_data: `bet_yes_10_${mkt.id.slice(0, 20)}` },
      { text: `❌ No $10`, callback_data: `bet_no_10_${mkt.id.slice(0, 20)}` },
    ],
    [
      { text: `✅ Yes $25`, callback_data: `bet_yes_25_${mkt.id.slice(0, 20)}` },
      { text: `❌ No $25`, callback_data: `bet_no_25_${mkt.id.slice(0, 20)}` },
    ],
    [
      { text: "🌐 View on Web", url: `${APP_URL}/market/${mkt.id}` },
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
  supabase: ReturnType<typeof createClient>,
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

  const parts = data.replace("bet_", "").split("_");
  const side = parts[0];
  const amount = Number(parts[1]);
  const partialMarketId = parts.slice(2).join("_");

  const { data: markets } = await supabase
    .from("markets")
    .select("id, title, yes_price, no_price, status, market_type, category")
    .eq("status", "active")
    .like("id", `${partialMarketId}%`)
    .limit(1);

  const mkt = markets?.[0];
  if (!mkt) {
    await tg(token, "sendMessage", { chat_id: chatId, text: "Market not found or closed." });
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
  supabase: ReturnType<typeof createClient>,
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
    .select("admin_fee_percent, creator_fee_percent")
    .limit(1)
    .single();

  const adminFeePercent = Number(commData?.admin_fee_percent ?? 2) / 100;
  const creatorFeePercent = Number(commData?.creator_fee_percent ?? 3) / 100;
  const adminAmount = amount * adminFeePercent;
  const creatorAmount = amount * creatorFeePercent;
  const totalFees = adminAmount + creatorAmount;

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

  const poolAmount = amount - adminAmount - creatorAmount;
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

  const { data: adminRole } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin")
    .limit(1)
    .single();

  if (adminRole && adminAmount > 0) {
    const { data: adminBal } = await supabase
      .from("balances")
      .select("amount")
      .eq("user_id", adminRole.user_id)
      .eq("currency", "USDT")
      .single();

    if (adminBal) {
      await supabase
        .from("balances")
        .update({
          amount: Number(adminBal.amount) + adminAmount,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", adminRole.user_id)
        .eq("currency", "USDT");
    }

    await supabase.from("transactions").insert({
      user_id: adminRole.user_id,
      type: "commission",
      amount: adminAmount,
      market_id: marketId,
      side,
      status: "confirmed",
    });
  }

  if (creatorAmount > 0) {
    const { data: market } = await supabase
      .from("markets")
      .select("creator_wallet")
      .eq("id", marketId)
      .single();

    if (market?.creator_wallet) {
      const creatorId = market.creator_wallet;
      const { data: creatorBal } = await supabase
        .from("balances")
        .select("amount")
        .eq("user_id", creatorId)
        .eq("currency", "USDT")
        .single();

      if (creatorBal) {
        await supabase
          .from("balances")
          .update({
            amount: Number(creatorBal.amount) + creatorAmount,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", creatorId)
          .eq("currency", "USDT");
      }

      await supabase.from("transactions").insert({
        user_id: creatorId,
        type: "commission",
        amount: creatorAmount,
        market_id: marketId,
        side,
        status: "confirmed",
      });
    }
  }
}

async function handleQTAssetSelected(token: string, chatId: number, data: string) {
  const asset = data.replace("qt_asset_", "");

  const assetEmojis: Record<string, string> = {
    BTC: "₿", ETH: "Ξ", BNB: "🔶", SOL: "◎", XRP: "✕", DOGE: "🐕",
  };

  const buttons = [
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
      { text: "⬅️ Back to Assets", callback_data: "cmd_quicktrade" },
    ],
  ];

  await tg(token, "sendMessage", {
    chat_id: chatId,
    text:
      `⚡ <b>Quick Trade — ${assetEmojis[asset] || "📊"} ${asset}</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Will <b>${asset}</b> go UP 📈 or DOWN 📉 in the next 5 minutes?\n\n` +
      `Choose your prediction and amount:`,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: buttons },
  });
}

async function handleQTSideSelected(
  token: string,
  supabase: ReturnType<typeof createClient>,
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

  const assetEmojis: Record<string, string> = {
    BTC: "₿", ETH: "Ξ", BNB: "🔶", SOL: "◎", XRP: "✕", DOGE: "🐕",
  };
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
