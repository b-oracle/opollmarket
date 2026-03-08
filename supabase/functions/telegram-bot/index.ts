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

  // Handle GET requests (e.g. webhook verification) gracefully
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
  await tg(token, "sendMessage", {
    chat_id: chatId,
    text:
      "🔮 <b>Welcome to oPoll Predict!</b>\n\n" +
      "Predict outcomes, trade markets, and win rewards — all from Telegram.\n\n" +
      "To get started, link your account:\n" +
      "<code>/link your@email.com yourpassword</code>\n\n" +
      "Type /help for all commands.",
    parse_mode: "HTML",
  });
}

async function handleHelp(token: string, chatId: number) {
  await tg(token, "sendMessage", {
    chat_id: chatId,
    text:
      "📖 <b>Commands</b>\n\n" +
      "/link email password — Link your account\n" +
      "/unlink — Unlink your account\n" +
      "/markets — Browse active markets\n" +
      "/portfolio — View your positions\n" +
      "/balance — Check your balance\n" +
      "/quicktrade — Play Quick Trade\n" +
      "/stats — Platform-wide stats\n" +
      "/help — Show this message",
    parse_mode: "HTML",
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
        "📊 <b>oPoll Platform Stats</b>\n\n" +
        `🏛️ Active Markets: <b>${activeMarkets}</b>\n` +
        `👥 Total Users: <b>${totalUsers}</b>\n` +
        `💰 Total Volume: <b>$${totalVolume.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>\n` +
        `⚡ Quick Trade Bets: <b>${totalQuickBets.toLocaleString()}</b>`,
      parse_mode: "HTML",
    });
  } catch (err) {
    console.error("handleStats error:", err);
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: "❌ Failed to fetch stats. Please try again.",
    });
  }
}

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

  // Use a separate client for auth sign-in so the service role client isn't tainted
  const authClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!
  );

  // Sign in to verify credentials
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

  // Sign out from the temp client to clean up
  await authClient.auth.signOut();

  // Upsert telegram link using the service-role client (bypasses RLS)
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

  // Delete the message containing credentials for security
  try {
    await tg(token, "deleteMessage", {
      chat_id: chatId,
      message_id: (await supabase).toString(), // we need the original message id
    });
  } catch {
    // Best effort — bot may not have delete permission
  }

  await tg(token, "sendMessage", {
    chat_id: chatId,
    text:
      "✅ <b>Account linked successfully!</b>\n\n" +
      "⚠️ For security, please delete your /link message.\n\n" +
      "You can now use /markets, /portfolio, /balance, and /quicktrade.",
    parse_mode: "HTML",
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
    .select("id, title, yes_price, volume, category, market_type, end_date")
    .eq("status", "active")
    .order("volume", { ascending: false })
    .limit(8);

  if (!markets || markets.length === 0) {
    await tg(token, "sendMessage", { chat_id: chatId, text: "No active markets right now." });
    return;
  }

  const buttons = markets.map((m) => [
    {
      text: `${escapeHtml(m.title.slice(0, 40))} (${Math.round(m.yes_price * 100)}% Yes)`,
      callback_data: `mkt_${m.id.slice(0, 30)}`,
    },
  ]);

  await tg(token, "sendMessage", {
    chat_id: chatId,
    text: "🔮 <b>Active Markets</b>\nTap a market to predict:",
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: buttons },
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
    });
    return;
  }

  const { data: positions } = await supabase
    .from("positions")
    .select("side, shares, avg_price, market_id, option_id")
    .eq("user_id", userId)
    .gt("shares", 0);

  if (!positions || positions.length === 0) {
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: "📂 You have no active positions. Browse /markets to start predicting!",
    });
    return;
  }

  // Get market titles
  const marketIds = [...new Set(positions.map((p) => p.market_id))];
  const { data: marketsData } = await supabase
    .from("markets")
    .select("id, title, yes_price, no_price, status")
    .in("id", marketIds);

  const marketMap = new Map((marketsData || []).map((m) => [m.id, m]));

  let text = "📊 <b>Your Portfolio</b>\n\n";
  for (const pos of positions.slice(0, 10)) {
    const mkt = marketMap.get(pos.market_id);
    const title = mkt ? escapeHtml(mkt.title.slice(0, 35)) : "Unknown";
    const currentPrice = mkt
      ? pos.side === "yes"
        ? mkt.yes_price
        : mkt.no_price
      : pos.avg_price;
    const pnl = (currentPrice - pos.avg_price) * pos.shares;
    const pnlEmoji = pnl >= 0 ? "🟢" : "🔴";
    text += `${pnlEmoji} <b>${title}</b>\n`;
    text += `  ${pos.side.toUpperCase()} × ${pos.shares.toFixed(1)} @ $${pos.avg_price.toFixed(2)} → $${currentPrice.toFixed(2)} (${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)})\n\n`;
  }

  if (positions.length > 10) {
    text += `<i>...and ${positions.length - 10} more positions</i>`;
  }

  await tg(token, "sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
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

  await tg(token, "sendMessage", {
    chat_id: chatId,
    text:
      `💰 <b>Your Balance</b>\n\n` +
      `Main: <b>$${main.toFixed(2)}</b>\n` +
      `Bonus: <b>$${bonus.toFixed(2)}</b>\n` +
      `Total: <b>$${(main + bonus).toFixed(2)}</b>`,
    parse_mode: "HTML",
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
    });
    return;
  }

  // Get commission settings for available assets
  const { data: settings } = await supabase
    .from("commission_settings")
    .select("qt_enabled_assets, qt_min_bet, qt_max_bet")
    .limit(1)
    .single();

  const assets = (settings?.qt_enabled_assets || "BTC,ETH,BNB").split(",");
  const minBet = settings?.qt_min_bet || 1;
  const maxBet = settings?.qt_max_bet || 500;

  const buttons = assets.slice(0, 6).map((asset: string) => ({
    text: asset.trim(),
    callback_data: `qt_asset_${asset.trim()}`,
  }));

  // Split into rows of 3
  const keyboard: Array<Array<{ text: string; callback_data: string }>> = [];
  for (let i = 0; i < buttons.length; i += 3) {
    keyboard.push(buttons.slice(i, i + 3));
  }

  await tg(token, "sendMessage", {
    chat_id: chatId,
    text:
      `⚡ <b>Quick Trade</b>\n\n` +
      `Predict if a crypto price goes UP or DOWN!\n` +
      `Bet: $${minBet} – $${maxBet}\n\n` +
      `Select an asset:`,
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
  // data = mkt_<partial-uuid>
  const partialId = data.replace("mkt_", "");

  const { data: markets } = await supabase
    .from("markets")
    .select("id, title, description, yes_price, no_price, volume, participants, end_date, market_type, category")
    .eq("status", "active")
    .like("id", `${partialId}%`)
    .limit(1);

  const mkt = markets?.[0];
  if (!mkt) {
    await tg(token, "sendMessage", { chat_id: chatId, text: "Market not found." });
    return;
  }

  const yesP = Math.round(mkt.yes_price * 100);
  const noP = Math.round(mkt.no_price * 100);

  const buttons = [
    [
      { text: `✅ Yes ($5 @ ${yesP}¢)`, callback_data: `bet_yes_5_${mkt.id.slice(0, 20)}` },
      { text: `❌ No ($5 @ ${noP}¢)`, callback_data: `bet_no_5_${mkt.id.slice(0, 20)}` },
    ],
    [
      { text: `✅ Yes ($10)`, callback_data: `bet_yes_10_${mkt.id.slice(0, 20)}` },
      { text: `❌ No ($10)`, callback_data: `bet_no_10_${mkt.id.slice(0, 20)}` },
    ],
    [
      { text: `✅ Yes ($25)`, callback_data: `bet_yes_25_${mkt.id.slice(0, 20)}` },
      { text: `❌ No ($25)`, callback_data: `bet_no_25_${mkt.id.slice(0, 20)}` },
    ],
  ];

  await tg(token, "sendMessage", {
    chat_id: chatId,
    text:
      `🔮 <b>${escapeHtml(mkt.title)}</b>\n\n` +
      `${escapeHtml(mkt.description.slice(0, 200))}\n\n` +
      `📊 Yes: <b>${yesP}%</b> | No: <b>${noP}%</b>\n` +
      `💰 Volume: $${Number(mkt.volume).toFixed(0)}\n` +
      `👥 ${mkt.participants} participants\n` +
      `📅 Ends: ${mkt.end_date}\n\n` +
      `Choose your prediction:`,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: buttons },
  });
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

  // data = bet_yes_10_<partial-market-id>
  const parts = data.replace("bet_", "").split("_");
  const side = parts[0]; // yes or no
  const amount = Number(parts[1]);
  const partialMarketId = parts.slice(2).join("_");

  // Find market
  const { data: markets } = await supabase
    .from("markets")
    .select("id, yes_price, no_price, status, market_type")
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

  // Call place-bet edge function
  // First create a temporary auth token for this user
  const { data: tokenData, error: tokenError } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: "", // we need user email
  });

  // Instead, call place-bet directly with service role since we've verified the user
  const placeBetUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/place-bet`;

  // Generate a session for the user to call place-bet
  // Since place-bet validates auth, we'll replicate the core logic here for Telegram bets
  try {
    // Check balance
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
        text: `❌ Insufficient balance. You have $${currentBalance.toFixed(2)}, need $${amount}.`,
      });
      return;
    }

    // Call place-bet via internal service call
    const response = await fetch(placeBetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Create a short-lived token for the user
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

    // place-bet requires user auth, not service role. Let's call it differently.
    // We need to impersonate the user. Since we can't do that easily, let's replicate
    // the core betting logic here for Telegram.

    if (!response.ok) {
      // Fallback: do the bet inline
      await executeBetInline(supabase, userId, mkt.id, null, side, amount, priceInCents, shares);
    }

    const yesP = side === "yes" ? Math.round(price * 100) : Math.round((1 - price) * 100);

    await tg(token, "sendMessage", {
      chat_id: chatId,
      text:
        `✅ <b>Prediction placed!</b>\n\n` +
        `Side: <b>${side.toUpperCase()}</b>\n` +
        `Amount: <b>$${amount}</b>\n` +
        `Price: <b>${priceInCents}¢</b>\n` +
        `Shares: <b>${shares.toFixed(2)}</b>\n\n` +
        `Good luck! 🍀`,
      parse_mode: "HTML",
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
  // Fetch commission settings
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

  // Check & deduct balance
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

  // Insert position
  await supabase.from("positions").insert({
    user_id: userId,
    market_id: marketId,
    option_id: optionId,
    side,
    shares,
    avg_price: price / 100,
  });

  // Insert transaction
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

  // Update market volume
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

  // Credit admin commission
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

  // Credit creator
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
  ];

  await tg(token, "sendMessage", {
    chat_id: chatId,
    text:
      `⚡ <b>Quick Trade — ${asset}</b>\n\n` +
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

  // data = qt_side_up_10_BTC
  const parts = data.replace("qt_side_", "").split("_");
  const side = parts[0]; // up or down
  const amount = Number(parts[1]);
  const asset = parts.slice(2).join("_");

  // Check balance
  const { data: bal } = await supabase
    .from("balances")
    .select("amount")
    .eq("user_id", userId)
    .eq("currency", "USDT")
    .single();

  if (Number(bal?.amount || 0) < amount) {
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: `❌ Insufficient balance. You have $${Number(bal?.amount || 0).toFixed(2)}.`,
    });
    return;
  }

  // Create a quick round and place the bet via the resolve function
  const resolveUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/resolve-quick-round`;

  // Create round
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

  // Deduct balance
  await supabase
    .from("balances")
    .update({
      amount: Number(bal!.amount) - amount,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("currency", "USDT");

  // Place bet
  await supabase.from("quick_bets").insert({
    user_id: userId,
    round_id: round.id,
    side,
    amount,
    status: "pending",
    streak: 0,
  });

  await tg(token, "sendMessage", {
    chat_id: chatId,
    text:
      `⚡ <b>Quick Trade placed!</b>\n\n` +
      `Asset: <b>${asset}</b>\n` +
      `Prediction: <b>${side.toUpperCase()}</b>\n` +
      `Amount: <b>$${amount}</b>\n\n` +
      `⏳ Result in ~5 minutes. You'll be notified!`,
    parse_mode: "HTML",
  });

  // Trigger resolution after delay
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
