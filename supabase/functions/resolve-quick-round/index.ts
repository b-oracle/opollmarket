import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyCronSecret } from "../_shared/cronAuth.ts";
import { getErrorMessage } from "../_shared/errors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
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

const TWELVE_DATA_COMMODITY_MAP: Record<string, string> = {
  XAU: "XAU/USD",
  XAG: "XAG/USD",
  XPT: "XPT/USD",
  XPD: "XPD/USD",
  NG: "NG",
  COPPER: "COPPER",
  WTI: "WTI",
  BRENT: "BRENT",
};

const EDGE_COMMODITY_SYMBOLS = new Set(["NG", "COPPER", "WTI", "BRENT"]);

type AssetClass = "crypto" | "commodity" | "forex";

function getAssetClass(symbol: string): AssetClass {
  if (METAL_MAP[symbol.toUpperCase()]) return "commodity";
  if (EDGE_COMMODITY_SYMBOLS.has(symbol.toUpperCase())) return "commodity";
  if (symbol.includes("/")) return "forex";
  return "crypto";
}

// Binance symbol mapping
const BINANCE_MAP: Record<string, string> = {
  BTC: "BTCUSDT", ETH: "ETHUSDT", BNB: "BNBUSDT", SOL: "SOLUSDT",
  XRP: "XRPUSDT", ADA: "ADAUSDT", DOGE: "DOGEUSDT",
  AVAX: "AVAXUSDT", DOT: "DOTUSDT", LINK: "LINKUSDT",
};

// Kraken symbol mapping
const KRAKEN_MAP: Record<string, string> = {
  BTC: "XXBTZUSD", ETH: "XETHZUSD", SOL: "SOLUSD", XRP: "XXRPZUSD",
  ADA: "ADAUSD", DOGE: "XDGUSD", DOT: "DOTUSD", LINK: "LINKUSD",
  AVAX: "AVAXUSD",
};

// ── Crypto: CoinGecko (primary) → Binance → Kraken (fallbacks) ──
async function fetchCryptoFromCoinGecko(asset: string): Promise<number | null> {
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

async function fetchCryptoFromBinance(asset: string): Promise<number | null> {
  const symbol = BINANCE_MAP[asset.toUpperCase()];
  if (!symbol) return null;
  try {
    const resp = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    const price = parseFloat(data.price);
    return isNaN(price) ? null : price;
  } catch {
    return null;
  }
}

async function fetchCryptoFromKraken(asset: string): Promise<number | null> {
  const pair = KRAKEN_MAP[asset.toUpperCase()];
  if (!pair) return null;
  try {
    const resp = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${pair}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.error?.length) return null;
    const key = Object.keys(data.result || {})[0];
    if (!key) return null;
    const price = parseFloat(data.result[key].c[0]);
    return isNaN(price) ? null : price;
  } catch {
    return null;
  }
}

async function fetchCryptoPrice(asset: string): Promise<number | null> {
  let price = await fetchCryptoFromCoinGecko(asset);
  if (price !== null) return price;
  console.log(`CoinGecko failed for ${asset}, trying Binance`);
  price = await fetchCryptoFromBinance(asset);
  if (price !== null) return price;
  console.log(`Binance failed for ${asset}, trying Kraken`);
  return fetchCryptoFromKraken(asset);
}

// ── Commodities: Twelve Data (primary) → metals.dev / edge function (fallback) ──
async function fetchCommodityFromTwelveData(symbol: string): Promise<number | null> {
  const apiKey = Deno.env.get("TWELVE_DATA_API_KEY");
  if (!apiKey) return null;
  const tdSymbol = TWELVE_DATA_COMMODITY_MAP[symbol.toUpperCase()];
  if (!tdSymbol) return null;
  try {
    const resp = await fetch(`https://api.twelvedata.com/price?symbol=${tdSymbol}&apikey=${apiKey}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.code || data.status === "error") return null;
    const price = parseFloat(data.price);
    return isNaN(price) ? null : price;
  } catch {
    return null;
  }
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
  // Try Twelve Data first
  const price = await fetchCommodityFromTwelveData(asset);
  if (price !== null) return price;

  // Fallback
  if (METAL_MAP[asset.toUpperCase()]) return fetchMetalPrice(asset);
  if (EDGE_COMMODITY_SYMBOLS.has(asset.toUpperCase())) return fetchEdgeCommodityPrice(asset);
  return null;
}

// ── Forex: ExchangeRate-API (primary) → Frankfurter (fallback) ──
async function fetchForexFromExchangeRateApi(asset: string): Promise<number | null> {
  const apiKey = Deno.env.get("EXCHANGERATE_API_KEY");
  if (!apiKey) return null;
  const [base, quote] = asset.split("/");
  if (!base || !quote) return null;
  try {
    const resp = await fetch(`https://v6.exchangerate-api.com/v6/${apiKey}/pair/${base}/${quote}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.result !== "success") return null;
    return data.conversion_rate ?? null;
  } catch {
    return null;
  }
}

async function fetchForexFromFrankfurter(asset: string): Promise<number | null> {
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

async function fetchForexPrice(asset: string): Promise<number | null> {
  const price = await fetchForexFromExchangeRateApi(asset);
  if (price !== null) return price;
  return fetchForexFromFrankfurter(asset);
}

// ── Unified fetcher ──
async function fetchAssetPrice(asset: string): Promise<number | null> {
  const assetClass = getAssetClass(asset);
  if (assetClass === "commodity") return fetchCommodityPrice(asset);
  if (assetClass === "forex") return fetchForexPrice(asset);
  return fetchCryptoPrice(asset);
}

// ── Streak helpers ──
function getStreakMultiplier(streak: number, s2: number, s3: number, s4: number, s5: number): number {
  if (streak >= 5) return s5;
  if (streak === 4) return s4;
  if (streak === 3) return s3;
  if (streak === 2) return s2;
  return 1.0;
}

async function getOrCreateStreak(supabase: any, userId: string) {
  const { data } = await supabase
    .from("quick_trade_streaks")
    .select("*")
    .eq("user_id", userId)
    .single();
  if (data) return data;
  const { data: created } = await supabase
    .from("quick_trade_streaks")
    .insert({ user_id: userId, current_streak: 0, best_streak: 0 })
    .select()
    .single();
  return created || { user_id: userId, current_streak: 0, best_streak: 0 };
}

async function creditBalance(supabase: any, userId: string, amount: number) {
  await supabase.rpc("adjust_balance", { _user_id: userId, _delta: amount, _bonus_delta: 0, _insurance_delta: 0 });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const isClientDeduct = body.action === "deduct" && body.amount;
  const requestedRoundId = typeof body.roundId === "string" ? body.roundId : null;

  // Cron scans must still use the cron secret, but Quick Trade clients need to
  // trigger a single due round resolution and authenticated balance deduction.
  if (!isClientDeduct && !requestedRoundId) {
    const cronCheck = verifyCronSecret(req, { functionName: "resolve-quick-round", corsHeaders });
    if (!cronCheck.ok) return cronCheck.response!;
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // Handle balance deduction for placing bets
    if (req.method === "POST") {
      if (body.action === "deduct" && body.amount) {
        // SECURITY: Verify the caller's JWT to get the real user ID
        const authHeader = req.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const anonClient = createClient(
          supabaseUrl,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } }
        );
        const { data: { user: deductUser }, error: deductAuthErr } = await anonClient.auth.getUser();
        if (deductAuthErr || !deductUser) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const verifiedUserId = deductUser.id;
        const betAmount = Number(body.amount);

        // Validate min/max bet from settings
        const { data: qtSettings } = await supabase
          .from("commission_settings")
          .select("qt_min_bet, qt_max_bet")
          .limit(1)
          .single();
        const qtMinBet = Number(qtSettings?.qt_min_bet) || 1;
        const qtMaxBet = Number(qtSettings?.qt_max_bet) || 1000;

        if (!betAmount || betAmount < qtMinBet || betAmount > qtMaxBet) {
          return new Response(JSON.stringify({ error: `Bet must be between $${qtMinBet} and $${qtMaxBet}` }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Rate limit: max 20 QT bets per minute per user
        const oneMinAgo = new Date(Date.now() - 60_000).toISOString();
        const { count: recentBets } = await supabase
          .from("quick_bets")
          .select("id", { count: "exact", head: true })
          .eq("user_id", verifiedUserId)
          .gte("created_at", oneMinAgo);

        if ((recentBets ?? 0) >= 20) {
          return new Response(JSON.stringify({ error: "Too many bets. Please slow down." }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: debitResult } = await supabase.rpc("debit_balance_atomic", {
          _user_id: verifiedUserId,
          _main_deduct: betAmount,
        });
        if (!debitResult?.success) {
          return new Response(JSON.stringify({ error: debitResult?.error || "Insufficient balance" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 1. Find rounds that are past their deadline and still open/locked
    const deadline = new Date();
    let roundsQuery = supabase
      .from("quick_rounds")
      .select("*")
      .in("status", ["open", "locked"])
      .lte("locks_at", deadline.toISOString())
      .order("created_at", { ascending: true });

    if (requestedRoundId) {
      roundsQuery = roundsQuery.eq("id", requestedRoundId).limit(1);
    }

    const { data: rounds, error: fetchErr } = await roundsQuery;

    if (fetchErr) throw fetchErr;
    if (!rounds || rounds.length === 0) {
      return new Response(JSON.stringify({ resolved: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get commission rate
    const { data: settings } = await supabase
      .from("commission_settings")
      .select("id, admin_fee_percent, creator_fee_percent, quick_trade_fee_percent, qt_streak_2x, qt_streak_3x, qt_streak_4x, qt_streak_5x, qt_disabled_assets, qt_one_sided_bonus")
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
    const qtOneSidedBonus = settings?.qt_one_sided_bonus !== false;

    let resolvedCount = 0;

    // Track consecutive price-fetch failures per asset for auto-disable
    const MAX_CONSECUTIVE_FAILURES = 3;
    const failureCount: Record<string, number> = {};

    // Load current disabled assets
    const currentDisabledStr = String(settings?.qt_disabled_assets ?? "");
    const currentDisabled = new Set(currentDisabledStr.split(",").filter(Boolean));

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
      if (closePrice == null) {
        // Track failure
        failureCount[round.asset] = (failureCount[round.asset] || 0) + 1;
        console.warn(`Price fetch failed for ${round.asset} (${failureCount[round.asset]}/${MAX_CONSECUTIVE_FAILURES})`);

        // Auto-disable asset after MAX_CONSECUTIVE_FAILURES
        if (failureCount[round.asset] >= MAX_CONSECUTIVE_FAILURES && !currentDisabled.has(round.asset)) {
          currentDisabled.add(round.asset);
          const newDisabledStr = Array.from(currentDisabled).join(",");
          await supabase
            .from("commission_settings")
            .update({ qt_disabled_assets: newDisabledStr })
            .eq("id", settings?.id ?? (await supabase.from("commission_settings").select("id").limit(1).single()).data?.id);
          console.warn(`Auto-disabled asset ${round.asset} due to ${MAX_CONSECUTIVE_FAILURES} consecutive price fetch failures`);

          // Refund all pending bets for this asset's unresolved rounds
          const { data: failedBets } = await supabase
            .from("quick_bets")
            .select("*")
            .eq("round_id", round.id)
            .eq("status", "pending");
          if (failedBets) {
            for (const bet of failedBets) {
              await supabase
                .from("quick_bets")
                .update({ payout: bet.amount, status: "refunded" })
                .eq("id", bet.id);
              await creditBalance(supabase, bet.user_id, Number(bet.amount));
            }
          }
          // Mark round as cancelled
          await supabase
            .from("quick_rounds")
            .update({ status: "resolved", result: "flat", resolved_at: new Date().toISOString() })
            .eq("id", round.id);
          resolvedCount++;
        }
        continue;
      }
      // Reset failure count on success
      failureCount[round.asset] = 0;

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
        for (const bet of losers) {
          await supabase
            .from("quick_bets")
            .update({ payout: 0, status: "lost" })
            .eq("id", bet.id);

          await supabase.from("notifications").insert({
            user_id: bet.user_id,
            title: "Quick Trade Result 📉",
            message: `You lost $${Number(bet.amount).toFixed(2)} on ${round.asset}. The price went ${result.toUpperCase()}. Try again!`,
            type: "payout",
          });
        }
      } else if (losers.length === 0) {
        // One-sided round (everyone won) → pure refund of stake.
        // No platform fee, no one-sided bonus, no streak multiplier
        // (there's no profit to multiply).
        for (const bet of winners) {
          const payout = Number(bet.amount);

          await supabase
            .from("quick_bets")
            .update({ payout, status: "won" })
            .eq("id", bet.id);
          await creditBalance(supabase, bet.user_id, payout);

          await supabase.from("notifications").insert({
            user_id: bet.user_id,
            title: "Quick Trade Refunded",
            message: `No opposing bets on ${round.asset} — your $${payout.toFixed(2)} stake has been refunded.`,
            type: "payout",
          });
        }
      } else {
        const distributable = totalLosePool * (1 - platformFee);
        const availablePool = totalWinPool + distributable;

        // Pre-calculate all payouts with streak multipliers
        const payoutCalcs: { bet: any; payout: number; newStreak: number; multiplier: number; bestStreak: number }[] = [];
        let totalCalcPayout = 0;

        for (const bet of winners) {
          const streak = await getOrCreateStreak(supabase, bet.user_id);
          const newStreak = (streak.current_streak || 0) + 1;
          const multiplier = getStreakMultiplier(newStreak, s2, s3, s4, s5);
          const share = Number(bet.amount) / totalWinPool;
          const basePayout = Number(bet.amount) + distributable * share;
          const payout = basePayout * multiplier;
          payoutCalcs.push({ bet, payout, newStreak, multiplier, bestStreak: streak.best_streak || 0 });
          totalCalcPayout += payout;
        }

        // Cap total payouts at available pool to prevent money creation from streak multipliers
        const scaleFactor = totalCalcPayout > availablePool ? availablePool / totalCalcPayout : 1;
        if (scaleFactor < 1) {
          console.log(`resolve-quick-round: Capping payouts, scale=${scaleFactor.toFixed(4)}, calc=${totalCalcPayout.toFixed(2)}, available=${availablePool.toFixed(2)}`);
        }

        for (const { bet, payout: rawPayout, newStreak, multiplier, bestStreak } of payoutCalcs) {
          const payout = rawPayout * scaleFactor;

          await supabase
            .from("quick_bets")
            .update({ payout, status: "won", streak: newStreak })
            .eq("id", bet.id);
          await creditBalance(supabase, bet.user_id, payout);

          await supabase
            .from("quick_trade_streaks")
            .upsert({
              user_id: bet.user_id,
              current_streak: newStreak,
              best_streak: Math.max(newStreak, bestStreak),
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

        for (const bet of losers) {
          await supabase
            .from("quick_bets")
            .update({ payout: 0, status: "lost" })
            .eq("id", bet.id);

          // Notify losers so they get Telegram alerts via the trigger
          await supabase.from("notifications").insert({
            user_id: bet.user_id,
            title: "Quick Trade Result 📉",
            message: `You lost $${Number(bet.amount).toFixed(2)} on ${round.asset}. The price went ${result.toUpperCase()}. Try again!`,
            type: "payout",
          });
        }
      }

      resolvedCount++;
    }

    return new Response(JSON.stringify({ resolved: resolvedCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("resolve-quick-round error:", err);
    return new Response(JSON.stringify({ error: (getErrorMessage(err)) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
