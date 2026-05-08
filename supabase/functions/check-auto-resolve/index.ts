import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { getErrorMessage } from "../_shared/errors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// CoinGecko ID mapping for crypto
const CRYPTO_MAP: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  BNB: "binancecoin",
  SOL: "solana",
  XRP: "ripple",
  ADA: "cardano",
  DOGE: "dogecoin",
  MATIC: "matic-network",
  AVAX: "avalanche-2",
  DOT: "polkadot",
  LINK: "chainlink",
  SHIB: "shiba-inu",
};

// Twelve Data symbol mapping for commodities
const TWELVE_DATA_COMMODITY_MAP: Record<string, string> = {
  XAU: "XAU/USD",
  XAG: "XAG/USD",
  XPT: "XPT/USD",
  XPD: "XPD/USD",
  BRENT: "BRENT",
  WTI: "WTI",
  NG: "NG",
  COPPER: "COPPER",
};

const COMMODITY_SYMBOLS = new Set(["XAU", "XAG", "XPT", "XPD", "BRENT", "WTI", "NG", "COPPER"]);
const FOREX_PAIRS = new Set(["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CAD", "USD/CHF", "NZD/USD", "EUR/GBP"]);

function getAssetType(asset: string): "crypto" | "commodity" | "forex" {
  if (FOREX_PAIRS.has(asset)) return "forex";
  if (COMMODITY_SYMBOLS.has(asset)) return "commodity";
  return "crypto";
}

// Binance symbol mapping
const BINANCE_MAP: Record<string, string> = {
  BTC: "BTCUSDT", ETH: "ETHUSDT", BNB: "BNBUSDT", SOL: "SOLUSDT",
  XRP: "XRPUSDT", ADA: "ADAUSDT", DOGE: "DOGEUSDT", MATIC: "MATICUSDT",
  AVAX: "AVAXUSDT", DOT: "DOTUSDT", LINK: "LINKUSDT", SHIB: "SHIBUSDT",
};

// Kraken symbol mapping
const KRAKEN_MAP: Record<string, string> = {
  BTC: "XXBTZUSD", ETH: "XETHZUSD", SOL: "SOLUSD", XRP: "XXRPZUSD",
  ADA: "ADAUSD", DOGE: "XDGUSD", DOT: "DOTUSD", LINK: "LINKUSD",
  AVAX: "AVAXUSD", MATIC: "MATICUSD", SHIB: "SHIBUSD",
};

// ── Crypto: CoinGecko (primary) → Binance → Kraken (fallbacks) ──
async function fetchCryptoFromCoinGecko(asset: string): Promise<number | null> {
  const geckoId = CRYPTO_MAP[asset.toUpperCase()];
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

// ── Forex: ExchangeRate-API (primary) → Frankfurter (fallback) ──
async function fetchForexFromExchangeRateApi(pair: string, apiKey: string): Promise<number | null> {
  try {
    const [base, quote] = pair.split("/");
    if (!base || !quote) return null;
    const resp = await fetch(`https://v6.exchangerate-api.com/v6/${apiKey}/pair/${base}/${quote}`);
    if (!resp.ok) {
      console.error(`ExchangeRate-API error [${resp.status}]`);
      return null;
    }
    const data = await resp.json();
    if (data.result !== "success") return null;
    return data.conversion_rate ?? null;
  } catch (e) {
    console.error("ExchangeRate-API fetch error:", e);
    return null;
  }
}

async function fetchForexFromFrankfurter(pair: string): Promise<number | null> {
  try {
    const [base, quote] = pair.split("/");
    if (!base || !quote) return null;
    const resp = await fetch(`https://api.frankfurter.app/latest?from=${base}&to=${quote}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    return data?.rates?.[quote] ?? null;
  } catch {
    return null;
  }
}

async function fetchForexRate(pair: string): Promise<number | null> {
  const apiKey = Deno.env.get("EXCHANGERATE_API_KEY");
  if (apiKey) {
    const price = await fetchForexFromExchangeRateApi(pair, apiKey);
    if (price !== null) return price;
    console.log(`ExchangeRate-API failed for ${pair}, falling back to Frankfurter`);
  }
  return fetchForexFromFrankfurter(pair);
}

// ── Commodities: Twelve Data (primary) → metals.dev (precious metals fallback) ──
async function fetchCommodityFromTwelveData(symbol: string, apiKey: string): Promise<number | null> {
  const tdSymbol = TWELVE_DATA_COMMODITY_MAP[symbol.toUpperCase()];
  if (!tdSymbol) return null;
  try {
    const resp = await fetch(
      `https://api.twelvedata.com/price?symbol=${tdSymbol}&apikey=${apiKey}`
    );
    if (!resp.ok) {
      console.error(`Twelve Data error [${resp.status}]`);
      return null;
    }
    const data = await resp.json();
    if (data.code || data.status === "error") {
      console.error("Twelve Data error:", data.message);
      return null;
    }
    const price = parseFloat(data.price);
    return isNaN(price) ? null : price;
  } catch (e) {
    console.error("Twelve Data fetch error:", e);
    return null;
  }
}

async function fetchMetalFallback(symbol: string): Promise<number | null> {
  const metalMap: Record<string, string> = { XAU: "gold", XAG: "silver", XPT: "platinum", XPD: "palladium" };
  const metalName = metalMap[symbol];
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

async function fetchCommodityPrice(symbol: string): Promise<number | null> {
  const apiKey = Deno.env.get("TWELVE_DATA_API_KEY");
  if (apiKey) {
    const price = await fetchCommodityFromTwelveData(symbol, apiKey);
    if (price !== null) return price;
    console.log(`Twelve Data failed for ${symbol}, trying fallback`);
  }
  // Fallback for precious metals only
  if (["XAU", "XAG", "XPT", "XPD"].includes(symbol)) {
    return fetchMetalFallback(symbol);
  }
  return null;
}

// ── Unified price fetcher ──
async function fetchPrice(asset: string): Promise<number | null> {
  const assetType = getAssetType(asset);
  switch (assetType) {
    case "crypto": return fetchCryptoPrice(asset);
    case "commodity": return fetchCommodityPrice(asset);
    case "forex": return fetchForexRate(asset);
  }
}

// ── Return creator liquidity helper (mirrors resolve-market logic) ──
async function returnCreatorLiquidity(adminClient: any, market: any) {
  if (!market.initial_liquidity || market.initial_liquidity <= 0 || !market.liquidity_verified) {
    return;
  }
  const creatorUserId = market.creator_wallet;
  if (!creatorUserId) return;

  const { data: settings } = await adminClient
    .from("commission_settings")
    .select("liquidity_return_fee_percent")
    .limit(1)
    .single();

  const liquidityReturnFeePercent = Number(settings?.liquidity_return_fee_percent) || 5;
  const feeAmount = market.initial_liquidity * (liquidityReturnFeePercent / 100);
  const liquidityRefund = market.initial_liquidity - feeAmount;

  if (liquidityRefund <= 0) return;

  await adminClient.rpc("adjust_balance", { _user_id: creatorUserId, _delta: liquidityRefund, _bonus_delta: 0, _insurance_delta: 0 });

  await adminClient.from("transactions").insert({
    user_id: creatorUserId,
    market_id: market.id,
    type: "refund",
    amount: liquidityRefund,
    side: "liquidity_return",
    status: "confirmed",
  });

  await adminClient.from("notifications").insert({
    user_id: creatorUserId,
    title: "Liquidity Returned 💰",
    message: `Your $${market.initial_liquidity.toFixed(2)} initial liquidity for "${market.title}" has been returned ($${liquidityRefund.toFixed(2)} after ${liquidityReturnFeePercent}% fee).`,
    type: "refund",
    market_id: market.id,
  });

  console.log(`returnCreatorLiquidity: market ${market.id} refunded $${liquidityRefund} to ${creatorUserId}`);
}

function conditionMet(currentPrice: number, targetPrice: number, operator: string): boolean {
  switch (operator) {
    case "above": return currentPrice > targetPrice;
    case "below": return currentPrice < targetPrice;
    case "at_or_above": return currentPrice >= targetPrice;
    case "at_or_below": return currentPrice <= targetPrice;
    default: return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Fetch all active auto-resolve markets
    const { data: markets, error: fetchErr } = await adminClient
      .from("markets")
      .select("*")
      .in("status", ["active", "ended"])
      .eq("auto_resolve", true)
      .not("auto_resolve_asset", "is", null)
      .not("auto_resolve_target_price", "is", null)
      .not("auto_resolve_operator", "is", null)
      .not("auto_resolve_deadline", "is", null);

    if (fetchErr) {
      console.error("Failed to fetch auto-resolve markets:", fetchErr);
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!markets || markets.length === 0) {
      return new Response(JSON.stringify({ message: "No auto-resolve markets to check", resolved: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group by asset to minimize API calls
    const assetSet = new Set(markets.map((m) => m.auto_resolve_asset as string));
    const prices: Record<string, number | null> = {};
    for (const asset of assetSet) {
      prices[asset] = await fetchPrice(asset);
    }

    let resolvedCount = 0;

    for (const market of markets) {
      const asset = market.auto_resolve_asset as string;
      const targetPrice = Number(market.auto_resolve_target_price);
      const operator = market.auto_resolve_operator as string;
      const deadline = new Date(market.auto_resolve_deadline as string);
      const currentPrice = prices[asset];
      const now = new Date();

      // GUARDRAIL: skip if already flagged for manual review
      if ((market as any).resolution_blocked) {
        console.warn(`Market ${market.id}: resolution blocked — skipping auto-resolve`);
        continue;
      }

      // ── "Resolving" push notification (crypto rounds only) ─────────────
      // Fired once when the deadline passes, before the round is resolved.
      // Idempotent via crypto_round_meta.notified_resolving_at.
      if ((market as any).is_crypto_round && now >= deadline) {
        try {
          const { data: meta } = await adminClient
            .from("crypto_round_meta")
            .select("asset, duration_minutes, notified_resolving_at")
            .eq("market_id", market.id)
            .maybeSingle();
          if (meta && !meta.notified_resolving_at) {
            const { data: positions } = await adminClient
              .from("positions")
              .select("user_id")
              .eq("market_id", market.id)
              .gt("shares", 0);
            const uniqueIds = Array.from(new Set((positions ?? []).map((p: any) => p.user_id as string)));
            const durLabel = (m: number) => m >= 1440 ? `${Math.round(m / 1440)}d` : m >= 60 ? `${Math.round(m / 60)}h` : `${m}m`;
            const label = `${meta.asset} ${durLabel(meta.duration_minutes as number)}`;
            await Promise.all(uniqueIds.map((uid) =>
              adminClient.functions.invoke("send-push", {
                body: {
                  user_id: uid,
                  title: `⏳ ${label} round resolving`,
                  body: `Closing price is being verified. Payouts land in a few seconds.`,
                  url: `/market/${market.id}`,
                },
              }).catch((e) => console.error("send-push (resolving) failed:", e))
            ));
            await adminClient
              .from("crypto_round_meta")
              .update({ notified_resolving_at: new Date().toISOString() })
              .eq("market_id", market.id);
            console.log(`Market ${market.id}: sent resolving push to ${uniqueIds.length} users`);
          }
        } catch (e) {
          console.error("Resolving push block failed:", e);
        }
      }

      let winningSide: string | null = null;

      if (currentPrice !== null && conditionMet(currentPrice, targetPrice, operator)) {
        winningSide = "yes";
      } else if (now > deadline) {
        // Deadline passed without target hit — but only resolve NO if we have a
        // confirmed price feed. Missing data is an abnormal termination → block.
        if (currentPrice === null) {
          console.warn(`Market ${market.id}: deadline passed but price feed missing — blocking resolution`);
          await adminClient
            .from("markets")
            .update({
              resolution_blocked: true,
              resolution_block_reason: `Price feed unavailable for ${asset} at deadline ${deadline.toISOString()}`,
              resolution_blocked_at: new Date().toISOString(),
            })
            .eq("id", market.id);
          continue;
        }
        winningSide = "no";
      }

      if (!winningSide) continue;

      // Resolve the market
      await adminClient
        .from("markets")
        .update({
          status: "resolved",
          resolved_side: winningSide,
          yes_price: winningSide === "yes" ? 1 : 0,
          no_price: winningSide === "no" ? 1 : 0,
        })
        .eq("id", market.id);

      // Find winning positions
      const { data: winningPositions } = await adminClient
        .from("positions")
        .select("*")
        .eq("market_id", market.id)
        .eq("side", winningSide)
        .gt("shares", 0);

      // Find losing positions
      const losingSide = winningSide === "yes" ? "no" : "yes";
      const { data: losingPositions } = await adminClient
        .from("positions")
        .select("*")
        .eq("market_id", market.id)
        .eq("side", losingSide)
        .gt("shares", 0);

      const winners = winningPositions || [];
      const losers = losingPositions || [];
      const isOneSided = losers.length === 0 || winners.length === 0;

      // ── Payout policy (mirrors quick_trade one-sided semantics) ──
      // 1) Everyone WINS (no losers) → full capital refund, no fee
      // 2) Everyone LOSES (no winners) → refund capital + small bonus (qt_one_sided_bonus)
      // 3) Mixed → losers pay winners ($1/share)
      const ONE_SIDED_BONUS_RATE = 0.005; // 0.5%, parity with quick trade

      if (isOneSided && losers.length === 0 && winners.length > 0) {
        // Everyone wins → full refund
        for (const pos of winners) {
          const refund = Number(pos.shares) * Number(pos.avg_price);
          if (refund <= 0) continue;
          await adminClient.rpc("adjust_balance", { _user_id: pos.user_id, _delta: refund, _bonus_delta: 0, _insurance_delta: 0 });
          await adminClient.from("transactions").insert({
            user_id: pos.user_id,
            market_id: market.id,
            option_id: pos.option_id,
            type: "refund",
            amount: refund,
            side: pos.side,
            shares: pos.shares,
            price: pos.avg_price,
            status: "confirmed",
          });
        }
      } else if (isOneSided && winners.length === 0 && losers.length > 0) {
        // Everyone "loses" (no opposing side) → pure refund of stake.
        // No platform fee, no one-sided bonus.
        for (const pos of losers) {
          const refund = Number(pos.shares) * Number(pos.avg_price);
          if (refund <= 0) continue;

          await adminClient.rpc("adjust_balance", { _user_id: pos.user_id, _delta: refund, _bonus_delta: 0, _insurance_delta: 0 });

          await adminClient.from("transactions").insert({
            user_id: pos.user_id,
            market_id: market.id,
            option_id: pos.option_id,
            type: "refund",
            amount: refund,
            side: pos.side,
            shares: pos.shares,
            price: pos.avg_price,
            status: "confirmed",
          });
        }
      } else if ((market as any).is_crypto_round) {
        // Crypto rounds: parimutuel — losers' staked capital funds winners.
        // Platform takes 5% of the losers' pool; remaining 95% is split among
        // winners pro-rata to their staked capital. Winners also get their own
        // capital back. Losers get nothing.
        const CRYPTO_PLATFORM_FEE_RATE = 0.05;
        const losersPool = losers.reduce(
          (sum: number, p: any) => sum + Number(p.shares) * Number(p.avg_price),
          0,
        );
        const winnersStake = winners.reduce(
          (sum: number, p: any) => sum + Number(p.shares) * Number(p.avg_price),
          0,
        );
        const distributable = losersPool * (1 - CRYPTO_PLATFORM_FEE_RATE);

        for (const pos of winners) {
          const stake = Number(pos.shares) * Number(pos.avg_price);
          if (stake <= 0) continue;
          const proRataWinnings = winnersStake > 0
            ? distributable * (stake / winnersStake)
            : 0;
          const payout = stake + proRataWinnings;
          if (payout <= 0) continue;
          await adminClient.rpc("adjust_balance", { _user_id: pos.user_id, _delta: payout, _bonus_delta: 0, _insurance_delta: 0 });
          await adminClient.from("transactions").insert({
            user_id: pos.user_id,
            market_id: market.id,
            option_id: pos.option_id,
            type: "payout",
            amount: payout,
            side: pos.side,
            shares: pos.shares,
            price: stake > 0 ? payout / Number(pos.shares) : 0,
            status: "confirmed",
          });
        }
        console.log(
          `Crypto round ${market.id}: parimutuel payout — losersPool=$${losersPool.toFixed(2)}, fee=$${(losersPool * CRYPTO_PLATFORM_FEE_RATE).toFixed(2)}, distributed=$${distributable.toFixed(2)} to ${winners.length} winners`,
        );
      } else {
        // Mixed → losers pay winners (full $1/share to winners)
        for (const pos of winners) {
          const payout = Number(pos.shares);
          if (payout <= 0) continue;
          await adminClient.rpc("adjust_balance", { _user_id: pos.user_id, _delta: payout, _bonus_delta: 0, _insurance_delta: 0 });
          await adminClient.from("transactions").insert({
            user_id: pos.user_id,
            market_id: market.id,
            option_id: pos.option_id,
            type: "payout",
            amount: payout,
            side: pos.side,
            shares: pos.shares,
            price: 1,
            status: "confirmed",
          });
        }
      }

      // Notifications
      const assetType = getAssetType(asset);
      const priceLabel = assetType === "forex" ? asset : `${asset}/USD`;
      const priceInfo = currentPrice !== null ? `${priceLabel}: $${currentPrice.toLocaleString()}` : "";

      const { data: allParticipants } = await adminClient
        .from("positions")
        .select("user_id, side")
        .eq("market_id", market.id)
        .gt("shares", 0);

      const uniqueUsers = new Map<string, string>();
      for (const p of allParticipants || []) {
        if (!uniqueUsers.has(p.user_id)) uniqueUsers.set(p.user_id, p.side);
      }

      // Sum payouts per user for this market (for richer messaging)
      const payoutByUser = new Map<string, number>();
      try {
        const { data: payoutTxs } = await adminClient
          .from("transactions")
          .select("user_id, amount")
          .eq("market_id", market.id)
          .eq("type", "payout")
          .eq("status", "confirmed");
        for (const t of payoutTxs || []) {
          payoutByUser.set(t.user_id, (payoutByUser.get(t.user_id) ?? 0) + Number(t.amount ?? 0));
        }
      } catch (_) { /* best-effort */ }

      // Crypto Up/Down round meta for tailored messaging
      let cryptoMeta: { asset: string; duration_minutes: number; open_price: number; close_price: number | null } | null = null;
      if ((market as any).is_crypto_round) {
        const { data: meta } = await adminClient
          .from("crypto_round_meta")
          .select("asset, duration_minutes, open_price, close_price")
          .eq("market_id", market.id)
          .maybeSingle();
        if (meta) cryptoMeta = meta as any;
      }

      const fmtMoney = (v: number) => `$${v.toFixed(2)}`;
      const durLabel = (m: number) => m >= 1440 ? `${Math.round(m / 1440)}d` : m >= 60 ? `${Math.round(m / 60)}h` : `${m}m`;

      const notifications = Array.from(uniqueUsers.entries()).map(([userId, side]) => {
        const won = side === winningSide;
        const payout = payoutByUser.get(userId) ?? 0;
        let title: string;
        let message: string;

        if (cryptoMeta) {
          const direction = winningSide === "yes" ? "UP" : "DOWN";
          const userPick = side === "yes" ? "UP" : "DOWN";
          const open = cryptoMeta.open_price;
          const close = cryptoMeta.close_price ?? currentPrice;
          const moveStr = open != null && close != null
            ? ` (${open.toFixed(2)} → ${close.toFixed(2)})`
            : "";
          const label = `${cryptoMeta.asset} ${durLabel(cryptoMeta.duration_minutes)}`;
          if (won) {
            title = `🎉 You won the ${label} round!`;
            message = `${label} closed ${direction}${moveStr}. Your ${userPick} bet won — ${fmtMoney(payout)} credited to your balance.`;
          } else {
            title = `${label} round resolved ${direction}`;
            message = `Your ${userPick} bet didn't win this round${moveStr}. Next round is already open — try again!`;
          }
        } else {
          title = won ? "You Won! 🎉 Market Auto-Resolved" : "Market Auto-Resolved";
          message = winningSide === "yes"
            ? `"${market.title}" resolved YES — ${priceInfo ? `price condition met (${priceInfo})` : "condition met"}. ${won ? `Your payout of ${fmtMoney(payout)} has been credited!` : "Better luck next time!"}`
            : `"${market.title}" resolved NO — deadline passed without condition being met${priceInfo ? ` (${priceInfo})` : ""}. ${won ? `Your payout of ${fmtMoney(payout)} has been credited!` : "Better luck next time!"}`;
        }

        return {
          user_id: userId,
          title,
          message,
          type: won ? "payout" : "resolution",
          market_id: market.id,
        };
      });

      if (notifications.length > 0) {
        await adminClient.from("notifications").insert(notifications);
      }

      console.log(`Market ${market.id}: Auto-resolved ${winningSide.toUpperCase()} — notified ${notifications.length} participants${cryptoMeta ? " (crypto Up/Down)" : ""}`);

      // Return creator liquidity
      await returnCreatorLiquidity(adminClient, market);

      resolvedCount++;
    }

    // Piggyback: update Twitter market counts & auto-resolve
    let twitterResolved = 0;
    try {
      const { data: twitterData } = await adminClient.functions.invoke("fetch-twitter-metrics", {
        headers: { Authorization: `Bearer ${serviceRoleKey}` },
      });
      console.log("Twitter metrics update:", twitterData?.updated ?? 0);

      // Now check for Twitter markets that have passed their deadline
      const { data: twitterMarkets } = await adminClient
        .from("markets")
        .select("*, market_options!market_options_market_id_fkey(*)")
        .in("status", ["active", "ended"])
        .eq("auto_resolve", true)
        .not("twitter_metric_type", "is", null)
        .not("twitter_resource_id", "is", null);

      if (twitterMarkets && twitterMarkets.length > 0) {
        for (const tm of twitterMarkets) {
          // GUARDRAIL: skip if already flagged for manual review
          if ((tm as any).resolution_blocked) {
            console.warn(`Twitter market ${tm.id}: resolution blocked — skipping`);
            continue;
          }

          const deadline = tm.auto_resolve_deadline ? new Date(tm.auto_resolve_deadline) : new Date(tm.end_date);
          if (new Date() <= deadline) continue; // Not past deadline yet

          // Force-refresh the count for this single market so we resolve on the
          // true value at the deadline rather than a stale cached number.
          let count = tm.twitter_current_count ?? 0;
          let refreshOk = false;
          try {
            const { data: refreshed } = await adminClient.functions.invoke("fetch-twitter-metrics", {
              body: {
                market_id: tm.id,
                metric_type: tm.twitter_metric_type,
                resource_id: tm.twitter_resource_id,
              },
              headers: { Authorization: `Bearer ${serviceRoleKey}` },
            });
            if (typeof refreshed?.count === "number") {
              count = refreshed.count;
              refreshOk = true;
              await adminClient.from("markets").update({ twitter_current_count: count }).eq("id", tm.id);
            }
          } catch (refreshErr) {
            console.warn("Twitter resolve: count refresh failed, using cached", tm.id, refreshErr);
          }

          // GUARDRAIL: abnormal termination if we have no fresh count AND no cached count.
          // Marking such a market as YES/NO would be unfair (the same root cause that broke
          // BG / Elon / Instablog9ja markets). Flag for manual review instead.
          if (!refreshOk && (tm.twitter_current_count === null || tm.twitter_current_count === undefined)) {
            await adminClient
              .from("markets")
              .update({
                resolution_blocked: true,
                resolution_block_reason: `Twitter metric refresh failed at deadline and no cached count was available (resource ${tm.twitter_resource_id}, metric ${tm.twitter_metric_type})`,
                resolution_blocked_at: new Date().toISOString(),
              })
              .eq("id", tm.id);
            console.warn(`Twitter market ${tm.id}: blocked — no metric data at deadline`);
            continue;
          }
          const options = (tm.market_options || []).sort((a: any, b: any) => a.sort_order - b.sort_order);

          // ── Binary Twitter markets ──
          if (tm.market_type === "binary" || options.length === 0) {
            // For binary: check if count met the target condition
            const target = Number(tm.auto_resolve_target_price);
            const operator = tm.auto_resolve_operator as string;
            let winningSide = "no"; // deadline passed = default NO
            if (!isNaN(target) && operator) {
              if (conditionMet(count, target, operator)) {
                winningSide = "yes";
              }
            }

            await adminClient
              .from("markets")
              .update({
                status: "resolved",
                resolved_side: winningSide,
                yes_price: winningSide === "yes" ? 1 : 0,
                no_price: winningSide === "no" ? 1 : 0,
              })
              .eq("id", tm.id);

            // Find winning/losing positions
            const { data: winPositions } = await adminClient
              .from("positions")
              .select("*")
              .eq("market_id", tm.id)
              .eq("side", winningSide)
              .gt("shares", 0);

            const losingSide = winningSide === "yes" ? "no" : "yes";
            const { data: losePositions } = await adminClient
              .from("positions")
              .select("*")
              .eq("market_id", tm.id)
              .eq("side", losingSide)
              .gt("shares", 0);

            const winners = winPositions || [];
            const losers = losePositions || [];
            const isOneSidedBinary = losers.length === 0 || winners.length === 0;

            if (winners.length === 0) {
              console.log(`Twitter binary market ${tm.id}: No winners — platform profit`);
            } else if (isOneSidedBinary && losers.length === 0) {
              const { data: feeSettings } = await adminClient
                .from("commission_settings")
                .select("admin_fee_percent")
                .limit(1)
                .single();
              const adminFeePercent = feeSettings?.admin_fee_percent ?? 2;
              for (const pos of winners) {
                const capital = pos.shares * pos.avg_price;
                const fee = capital * (adminFeePercent / 100);
                const payout = capital - fee;
                if (payout <= 0) continue;
                await adminClient.rpc("adjust_balance", { _user_id: pos.user_id, _delta: payout, _bonus_delta: 0, _insurance_delta: 0 });
                await adminClient.from("transactions").insert({
                  user_id: pos.user_id, market_id: tm.id, option_id: pos.option_id,
                  type: "payout", amount: payout, side: pos.side, shares: pos.shares,
                  price: pos.avg_price, status: "confirmed",
                });
              }
            } else {
              for (const pos of winners) {
                const payout = pos.shares;
                await adminClient.rpc("adjust_balance", { _user_id: pos.user_id, _delta: payout, _bonus_delta: 0, _insurance_delta: 0 });
                await adminClient.from("transactions").insert({
                  user_id: pos.user_id, market_id: tm.id, option_id: pos.option_id,
                  type: "payout", amount: payout, side: pos.side, shares: pos.shares,
                  price: 1, status: "confirmed",
                });
              }
            }

            // Notifications
            const allBinaryPositions = [...winners, ...losers];
            const uniqueBinaryUsers = new Map<string, string>();
            for (const p of allBinaryPositions) {
              if (!uniqueBinaryUsers.has(p.user_id)) uniqueBinaryUsers.set(p.user_id, p.side);
            }
            const binaryNotifs = Array.from(uniqueBinaryUsers.entries()).map(([userId, side]) => {
              const won = side === winningSide;
              return {
                user_id: userId,
                title: won ? "You Won! 🎉 Twitter Market Resolved" : "Twitter Market Resolved",
                message: `"${tm.title}" resolved ${winningSide.toUpperCase()} (Count: ${count}). ${won ? "Your payout has been credited!" : "Better luck next time!"}`,
                type: won ? "payout" : "resolution",
                market_id: tm.id,
              };
            });
            if (binaryNotifs.length > 0) await adminClient.from("notifications").insert(binaryNotifs);
            console.log(`Twitter binary market ${tm.id}: Resolved ${winningSide.toUpperCase()} (count=${count})`);
            await returnCreatorLiquidity(adminClient, tm);
            twitterResolved++;
            continue;
          }

          // ── Multi-option / Range Twitter markets ──
          // Find the winning option based on which range bracket the count falls into
          let winningOptionId: string | null = null;
          for (const opt of options) {
            const rangeMatch = opt.label.match(/^(\d+)\s*[-–]\s*(\d+)$/);
            const ltMatch = opt.label.match(/^[<≤]\s*(\d+)$/);
            const gtMatch = opt.label.match(/^[>≥]\s*(\d+)$/);

            if (rangeMatch && count >= parseInt(rangeMatch[1]) && count <= parseInt(rangeMatch[2])) {
              winningOptionId = opt.id;
              break;
            }
            if (ltMatch && count < parseInt(ltMatch[1])) {
              winningOptionId = opt.id;
              break;
            }
            if (gtMatch && count > parseInt(gtMatch[1])) {
              winningOptionId = opt.id;
              break;
            }
          }

          if (!winningOptionId) {
            // Default to last option (usually "Other" or highest range)
            winningOptionId = options[options.length - 1].id;
          }

          // Resolve the market
          await adminClient
            .from("markets")
            .update({
              status: "resolved",
              winning_option_id: winningOptionId,
            })
            .eq("id", tm.id);

          // Find winning positions (those who picked the winning option)
          const { data: winPositions } = await adminClient
            .from("positions")
            .select("*")
            .eq("market_id", tm.id)
            .eq("option_id", winningOptionId)
            .gt("shares", 0);

          const { data: allPositions } = await adminClient
            .from("positions")
            .select("*")
            .eq("market_id", tm.id)
            .gt("shares", 0);

          const winners = winPositions || [];
          const losers = (allPositions || []).filter((p: any) => p.option_id !== winningOptionId);
          const isOneSided = losers.length === 0 || winners.length === 0;

          if (winners.length === 0) {
            console.log(`Twitter market ${tm.id}: No winners — platform profit`);
          } else if (isOneSided && losers.length === 0) {
            const { data: feeSettings } = await adminClient
              .from("commission_settings")
              .select("admin_fee_percent")
              .limit(1)
              .single();
            const adminFeePercent = feeSettings?.admin_fee_percent ?? 2;
            for (const pos of winners) {
              const capital = pos.shares * pos.avg_price;
              const fee = capital * (adminFeePercent / 100);
              const payout = capital - fee;
              if (payout <= 0) continue;
              await adminClient.rpc("adjust_balance", { _user_id: pos.user_id, _delta: payout, _bonus_delta: 0, _insurance_delta: 0 });
              await adminClient.from("transactions").insert({
                user_id: pos.user_id, market_id: tm.id, option_id: pos.option_id,
                type: "payout", amount: payout, side: pos.side, shares: pos.shares,
                price: pos.avg_price, status: "confirmed",
              });
            }
          } else {
            // Capital-first parimutuel payout for multi-option markets
            const totalWinnerShares = winners.reduce((s: number, p: any) => s + p.shares, 0);
            const allPos = [...winners, ...losers];
            const totalPool = allPos.reduce((s: number, p: any) => s + p.shares * p.avg_price, 0);
            const winnersCapital = winners.reduce((s: number, p: any) => s + p.shares * p.avg_price, 0);
            const loserPool = totalPool - winnersCapital;
            const profitPerShare = totalWinnerShares > 0 ? loserPool / totalWinnerShares : 0;
            const payoutPerShare = totalWinnerShares > 0 ? totalPool / totalWinnerShares : 1;
            console.log(`Twitter multi market ${tm.id}: capital-first payout`, { totalPool, winnersCapital, loserPool, profitPerShare, payoutPerShare });

            for (const pos of winners) {
              const capital = pos.shares * pos.avg_price;
              const payout = Math.round((capital + pos.shares * profitPerShare) * 100) / 100;
              await adminClient.rpc("adjust_balance", { _user_id: pos.user_id, _delta: payout, _bonus_delta: 0, _insurance_delta: 0 });
              await adminClient.from("transactions").insert({
                user_id: pos.user_id, market_id: tm.id, option_id: pos.option_id,
                type: "payout", amount: payout, side: pos.side, shares: pos.shares,
                price: payoutPerShare, status: "confirmed",
              });
            }
          }

          // Notifications
          const winningLabel = options.find((o: any) => o.id === winningOptionId)?.label || "Unknown";
          const uniqueUsers = new Map<string, string>();
          for (const p of allPositions || []) {
            if (!uniqueUsers.has(p.user_id)) uniqueUsers.set(p.user_id, p.option_id);
          }
          const notifs = Array.from(uniqueUsers.entries()).map(([userId, optId]) => {
            const won = optId === winningOptionId;
            return {
              user_id: userId,
              title: won ? "You Won! 🎉 Twitter Market Resolved" : "Twitter Market Resolved",
              message: `"${tm.title}" resolved to "${winningLabel}" (Count: ${count}). ${won ? "Your payout has been credited!" : "Better luck next time!"}`,
              type: won ? "payout" : "resolution",
              market_id: tm.id,
            };
          });
          if (notifs.length > 0) await adminClient.from("notifications").insert(notifs);
          console.log(`Twitter market ${tm.id}: Resolved to "${winningLabel}" (count=${count})`);
          await returnCreatorLiquidity(adminClient, tm);
          twitterResolved++;
        }
      }
    } catch (twitterErr) {
      console.error("Twitter auto-resolve failed:", twitterErr);
    }

    // Piggyback: run bulk verification sweep
    let verificationResult = null;
    try {
      const { data } = await adminClient.functions.invoke("bulk-update-verification", {
        headers: { Authorization: `Bearer ${serviceRoleKey}` },
      });
      verificationResult = data;
      console.log("Bulk verification sweep complete:", data?.updated ?? 0, "profiles checked");
    } catch (verErr) {
      console.error("Bulk verification sweep failed:", verErr);
    }

    return new Response(
      JSON.stringify({
        message: "Auto-resolve check complete",
        resolved: resolvedCount,
        twitter_resolved: twitterResolved,
        verification_sweep: verificationResult,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("check-auto-resolve error:", err);
    return new Response(JSON.stringify({ error: (getErrorMessage(err)) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
