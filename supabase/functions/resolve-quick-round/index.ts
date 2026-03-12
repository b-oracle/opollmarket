import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ASSET_GECKO_MAP: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  BNB: "binancecoin",
  SOL: "solana",
  XRP: "ripple",
  ADA: "cardano",
  DOGE: "dogecoin",
  AVAX: "avalanche-2",
  DOT: "polkadot",
  LINK: "chainlink",
};

const METAL_MAP: Record<string, string> = {
  XAU: "gold",
  XAG: "silver",
  XPT: "platinum",
  XPD: "palladium",
};

// Non-metal commodities resolved via Omkar API edge function
const EDGE_COMMODITY_SYMBOLS = new Set(["NG", "COPPER", "WTI", "BRENT"]);

type AssetClass = "crypto" | "commodity" | "forex";

function getAssetClass(symbol: string): AssetClass {
  if (METAL_MAP[symbol.toUpperCase()]) return "commodity";
  if (EDGE_COMMODITY_SYMBOLS.has(symbol.toUpperCase())) return "commodity";
  if (symbol.includes("/")) return "forex";
  return "crypto";
}

async function fetchMetalPrice(asset: string): Promise<number | null> {
  const metalName = METAL_MAP[asset.toUpperCase()];
  if (!metalName) return null;
  try {
    const resp = await fetch(`https://api.metals.dev/v1/latest?api_key=demo&currency=USD&unit=toz`);
    if (!resp.ok) return null;
    const data = await resp.json();
    return data?.metals?.[metalName] ?? null;
  } catch {
    return null;
  }
}

async function fetchEdgeCommodityPrice(asset: string): Promise<number | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  try {
    const resp = await fetch(
      `${supabaseUrl}/functions/v1/commodity-price`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ asset: asset.toUpperCase() }),
      }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return data?.price ?? null;
  } catch {
    return null;
  }
}

async function fetchCommodityPrice(asset: string): Promise<number | null> {
  if (METAL_MAP[asset.toUpperCase()]) return fetchMetalPrice(asset);
  if (EDGE_COMMODITY_SYMBOLS.has(asset.toUpperCase())) return fetchEdgeCommodityPrice(asset);
  return null;
}

async function fetchForexPrice(asset: string): Promise<number | null> {
  const [base, quote] = asset.split("/");
  if (!base || !quote) return null;
  try {
    const resp = await fetch(`https://api.frankfurter.app/latest?from=${base}&to=${quote}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    return data?.rates?.[quote] ?? null;
  } catch {
    return null;
  }
}

// Streak multiplier tiers - configurable via settings
function getStreakMultiplier(streak: number, s2: number, s3: number, s4: number, s5: number): number {
  if (streak >= 5) return s5;
  if (streak === 4) return s4;
  if (streak === 3) return s3;
  if (streak === 2) return s2;
  return 1.0;
}

async function fetchCryptoPrice(asset: string): Promise<number | null> {
  const geckoId = ASSET_GECKO_MAP[asset.toUpperCase()];
  if (!geckoId) return null;
  try {
    const resp = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=usd`
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return data[geckoId]?.usd ?? null;
  } catch {
    return null;
  }
}

async function fetchAssetPrice(asset: string): Promise<number | null> {
  const assetClass = getAssetClass(asset);
  if (assetClass === "commodity") return fetchCommodityPrice(asset);
  if (assetClass === "forex") return fetchForexPrice(asset);
  return fetchCryptoPrice(asset);
}

async function getOrCreateStreak(supabase: any, userId: string) {
  const { data } = await supabase
    .from("quick_trade_streaks")
    .select("*")
    .eq("user_id", userId)
    .single();
  if (data) return data;
  // Create new streak row
  const { data: created } = await supabase
    .from("quick_trade_streaks")
    .insert({ user_id: userId, current_streak: 0, best_streak: 0 })
    .select()
    .single();
  return created || { user_id: userId, current_streak: 0, best_streak: 0 };
}

async function creditBalance(supabase: any, userId: string, amount: number) {
  const { data: bal } = await supabase
    .from("balances")
    .select("amount")
    .eq("user_id", userId)
    .eq("currency", "USDT")
    .single();
  if (bal) {
    await supabase
      .from("balances")
      .update({ amount: Number(bal.amount) + amount, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("currency", "USDT");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // Handle balance deduction for placing bets
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body.action === "deduct" && body.userId && body.amount) {
        const { data: bal } = await supabase
          .from("balances")
          .select("amount")
          .eq("user_id", body.userId)
          .eq("currency", "USDT")
          .single();
        if (!bal || Number(bal.amount) < Number(body.amount)) {
          return new Response(JSON.stringify({ error: "Insufficient balance" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        await supabase
          .from("balances")
          .update({
            amount: Number(bal.amount) - Number(body.amount),
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", body.userId)
          .eq("currency", "USDT");
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 1. Find rounds that are past their deadline and still open/locked
    const deadline = new Date();
    const { data: rounds, error: fetchErr } = await supabase
      .from("quick_rounds")
      .select("*")
      .in("status", ["open", "locked"])
      .lte("locks_at", deadline.toISOString())
      .order("created_at", { ascending: true });

    if (fetchErr) throw fetchErr;
    if (!rounds || rounds.length === 0) {
      return new Response(JSON.stringify({ resolved: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get commission rate
    const { data: settings } = await supabase
      .from("commission_settings")
      .select("admin_fee_percent, creator_fee_percent, quick_trade_fee_percent, qt_streak_2x, qt_streak_3x, qt_streak_4x, qt_streak_5x")
      .limit(1)
      .single();
    const platformFee = settings?.quick_trade_fee_percent != null
      ? Number(settings.quick_trade_fee_percent) / 100
      : settings
        ? (Number(settings.admin_fee_percent) + Number(settings.creator_fee_percent)) / 100
        : 0.05;
    const s2 = Number(settings?.qt_streak_2x ?? 1.05);
    const s3 = Number(settings?.qt_streak_3x ?? 1.10);
    const s4 = Number(settings?.qt_streak_4x ?? 1.15);
    const s5 = Number(settings?.qt_streak_5x ?? 1.25);

    let resolvedCount = 0;

    for (const round of rounds) {
      const endTime = new Date(
        new Date(round.created_at).getTime() + round.duration_seconds * 1000
      );
      if (deadline < endTime) {
        if (round.status === "open") {
          await supabase
            .from("quick_rounds")
            .update({ status: "locked" })
            .eq("id", round.id);
        }
        continue;
      }

      const closePrice = await fetchAssetPrice(round.asset);
      if (closePrice == null) continue;

      const openPrice = Number(round.open_price);
      const result =
        closePrice > openPrice ? "up" : closePrice < openPrice ? "down" : "flat";

      await supabase
        .from("quick_rounds")
        .update({
          close_price: closePrice,
          result,
          status: "resolved",
          resolved_at: new Date().toISOString(),
        })
        .eq("id", round.id);

      const { data: bets } = await supabase
        .from("quick_bets")
        .select("*")
        .eq("round_id", round.id)
        .eq("status", "pending");

      if (!bets || bets.length === 0) {
        resolvedCount++;
        continue;
      }

      if (result === "flat") {
        for (const bet of bets) {
          await supabase
            .from("quick_bets")
            .update({ payout: bet.amount, status: "refunded" })
            .eq("id", bet.id);
          await creditBalance(supabase, bet.user_id, Number(bet.amount));
        }
        resolvedCount++;
        continue;
      }

      const winners = bets.filter((b: any) => b.side === result);
      const losers = bets.filter((b: any) => b.side !== result);

      const totalWinPool = winners.reduce((s: number, b: any) => s + Number(b.amount), 0);
      const totalLosePool = losers.reduce((s: number, b: any) => s + Number(b.amount), 0);

      // Reset streak for losers
      for (const bet of losers) {
        await supabase
          .from("quick_trade_streaks")
          .upsert({
            user_id: bet.user_id,
            current_streak: 0,
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id", ignoreDuplicates: false });
      }

      if (winners.length === 0) {
        // All losers — wager becomes platform profit, no refund
        for (const bet of losers) {
          await supabase
            .from("quick_bets")
            .update({ payout: 0, status: "lost" })
            .eq("id", bet.id);
        }
      } else if (losers.length === 0) {
        // All winners — refund minus commission, increment streak
        for (const bet of winners) {
          const streak = await getOrCreateStreak(supabase, bet.user_id);
          const newStreak = (streak.current_streak || 0) + 1;
          const multiplier = getStreakMultiplier(newStreak, s2, s3, s4, s5);
          const baseRefund = Number(bet.amount) * (1 - platformFee);
          const payout = baseRefund * multiplier;

          await supabase
            .from("quick_bets")
            .update({ payout, status: "won", streak: newStreak })
            .eq("id", bet.id);
          await creditBalance(supabase, bet.user_id, payout);

          // Update streak
          await supabase
            .from("quick_trade_streaks")
            .upsert({
              user_id: bet.user_id,
              current_streak: newStreak,
              best_streak: Math.max(newStreak, streak.best_streak || 0),
              updated_at: new Date().toISOString(),
            }, { onConflict: "user_id", ignoreDuplicates: false });

          if (multiplier > 1) {
            await supabase.from("notifications").insert({
              user_id: bet.user_id,
              title: `🔥 ${newStreak} Win Streak!`,
              message: `${multiplier}x bonus applied! You won $${payout.toFixed(2)} on ${round.asset}.`,
              type: "payout",
            });
          }
        }
      } else {
        // Normal payout with streak bonus
        const distributable = totalLosePool * (1 - platformFee);

        for (const bet of winners) {
          const streak = await getOrCreateStreak(supabase, bet.user_id);
          const newStreak = (streak.current_streak || 0) + 1;
          const multiplier = getStreakMultiplier(newStreak, s2, s3, s4, s5);
          const share = Number(bet.amount) / totalWinPool;
          const basePayout = Number(bet.amount) + distributable * share;
          const payout = basePayout * multiplier;

          await supabase
            .from("quick_bets")
            .update({ payout, status: "won", streak: newStreak })
            .eq("id", bet.id);
          await creditBalance(supabase, bet.user_id, payout);

          // Update streak
          await supabase
            .from("quick_trade_streaks")
            .upsert({
              user_id: bet.user_id,
              current_streak: newStreak,
              best_streak: Math.max(newStreak, streak.best_streak || 0),
              updated_at: new Date().toISOString(),
            }, { onConflict: "user_id", ignoreDuplicates: false });

          const streakMsg = multiplier > 1 ? ` (🔥 ${newStreak} streak — ${multiplier}x bonus!)` : "";
          await supabase.from("notifications").insert({
            user_id: bet.user_id,
            title: "Quick Trade Won! 🎉",
            message: `You won $${payout.toFixed(2)} on ${round.asset} ${result.toUpperCase()} prediction!${streakMsg}`,
            type: "payout",
          });
        }

        // Mark losers
        for (const bet of losers) {
          await supabase
            .from("quick_bets")
            .update({ payout: 0, status: "lost" })
            .eq("id", bet.id);
        }
      }

      resolvedCount++;
    }

    return new Response(JSON.stringify({ resolved: resolvedCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("resolve-quick-round error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
