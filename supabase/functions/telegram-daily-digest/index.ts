import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TELEGRAM_API = "https://api.telegram.org/bot";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

Deno.serve(async () => {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) {
    return new Response(JSON.stringify({ error: "Bot token not configured" }), { status: 500 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const appUrl = Deno.env.get("APP_URL") || "https://opoll.org";

  // Get all linked Telegram users who haven't disabled digests
  const { data: tgUsers, error: tgErr } = await supabase
    .from("telegram_users")
    .select("user_id, telegram_chat_id, notification_preferences");

  if (tgErr || !tgUsers || tgUsers.length === 0) {
    return new Response(JSON.stringify({ skipped: true, reason: "No Telegram users" }));
  }

  // Get trending markets (top 5)
  const { data: trendingMarkets } = await supabase
    .from("markets")
    .select("id, title, yes_price, volume, participants")
    .eq("status", "active")
    .eq("trending", true)
    .order("volume", { ascending: false })
    .limit(5);

  let sent = 0;
  let skipped = 0;

  for (const tgUser of tgUsers) {
    try {
      // Check if user disabled digests
      const prefs = (tgUser.notification_preferences || {}) as Record<string, boolean>;
      if (prefs.daily_digest === false) {
        skipped++;
        continue;
      }

      const userId = tgUser.user_id;

      // Fetch balance
      const { data: balance } = await supabase
        .from("balances")
        .select("amount, bonus_balance")
        .eq("user_id", userId)
        .single();

      // Fetch P&L data (last 24h)
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data: recentTxns } = await supabase
        .from("transactions")
        .select("type, amount, status")
        .eq("user_id", userId)
        .eq("status", "confirmed")
        .gte("created_at", yesterday)
        .in("type", ["buy", "payout", "refund"]);

      let dayPayouts = 0;
      let dayWagers = 0;
      if (recentTxns) {
        for (const tx of recentTxns) {
          if (tx.type === "payout" || tx.type === "refund") dayPayouts += Number(tx.amount);
          if (tx.type === "buy") dayWagers += Number(tx.amount);
        }
      }
      const dayPnl = dayPayouts - dayWagers;

      // Fetch Quick Trade P&L (last 24h)
      const { data: recentQT } = await supabase
        .from("quick_bets")
        .select("amount, payout, status")
        .eq("user_id", userId)
        .gte("created_at", yesterday)
        .in("status", ["won", "lost"]);

      let qtPnl = 0;
      if (recentQT) {
        for (const qb of recentQT) {
          if (qb.status === "won") qtPnl += Number(qb.payout || 0) - Number(qb.amount);
          else qtPnl -= Number(qb.amount);
        }
      }

      const totalPnl = dayPnl + qtPnl;

      // Fetch active positions count
      const { count: positionCount } = await supabase
        .from("positions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gt("shares", 0);

      // Build message
      const pnlEmoji = totalPnl >= 0 ? "📈" : "📉";
      const pnlSign = totalPnl >= 0 ? "+" : "";
      const balanceAmount = balance ? Number(balance.amount).toFixed(2) : "0.00";
      const bonusAmount = balance ? Number(balance.bonus_balance).toFixed(2) : "0.00";

      let text = `☀️ <b>Good Morning! Your Daily Digest</b>\n━━━━━━━━━━━━━━━━━━━━\n\n`;

      // Balance section
      text += `💰 <b>Balance:</b> $${balanceAmount}`;
      if (Number(bonusAmount) > 0) text += ` (+$${bonusAmount} bonus)`;
      text += `\n`;

      // P&L section
      text += `${pnlEmoji} <b>24h P&L:</b> ${pnlSign}$${totalPnl.toFixed(2)}\n`;
      if (dayPnl !== 0) text += `   ├ Predictions: ${dayPnl >= 0 ? "+" : ""}$${dayPnl.toFixed(2)}\n`;
      if (qtPnl !== 0) text += `   └ Quick Trades: ${qtPnl >= 0 ? "+" : ""}$${qtPnl.toFixed(2)}\n`;

      // Active positions
      text += `\n📊 <b>Active Positions:</b> ${positionCount || 0}\n`;

      // Trending markets
      if (trendingMarkets && trendingMarkets.length > 0) {
        text += `\n🔥 <b>Trending Markets</b>\n`;
        for (const m of trendingMarkets) {
          const yesPercent = Math.round(Number(m.yes_price) * 100);
          text += `  • ${escapeHtml(m.title.length > 40 ? m.title.slice(0, 40) + "…" : m.title)} — <b>${yesPercent}%</b>\n`;
        }
      }

      text += `\n<i>Have a great trading day! 🚀</i>`;

      // Build inline keyboard
      const buttons: Array<Array<{ text: string; url: string }>> = [
        [
          { text: "📊 Portfolio", url: `${appUrl}/portfolio` },
          { text: "⚡ Quick Trade", url: `${appUrl}/quick-trade` },
        ],
        [
          { text: "🔥 Explore Markets", url: appUrl },
        ],
      ];

      // Send message
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
      if (result.ok) sent++;
      else {
        console.warn(`Failed to send digest to chat ${tgUser.telegram_chat_id}:`, result.description);
        skipped++;
      }
    } catch (err) {
      console.error(`Digest error for user ${tgUser.user_id}:`, err);
      skipped++;
    }
  }

  console.log(`Daily digest complete: ${sent} sent, ${skipped} skipped`);
  return new Response(JSON.stringify({ success: true, sent, skipped }));
});
