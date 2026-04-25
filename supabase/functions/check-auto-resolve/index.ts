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

      let winningSide: string | null = null;

      if (currentPrice !== null && conditionMet(currentPrice, targetPrice, operator)) {
        winningSide = "yes";
      } else if (now > deadline) {
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

      if (winners.length === 0) {
        console.log(`Market ${market.id}: One-sided loss — platform profit`);
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
            user_id: pos.user_id,
            market_id: market.id,
            option_id: pos.option_id,
            type: "payout",
            amount: payout,
            side: pos.side,
            shares: pos.shares,
            price: pos.avg_price,
            status: "confirmed",
          });
        }
      } else {
        for (const pos of winners) {
          const payout = pos.shares;

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

      const notifications = Array.from(uniqueUsers.entries()).map(([userId, side]) => {
        const won = side === winningSide;
        const title = won ? "You Won! 🎉 Market Auto-Resolved" : "Market Auto-Resolved";
        const message = winningSide === "yes"
          ? `"${market.title}" resolved YES — ${priceInfo ? `price condition met (${priceInfo})` : "condition met"}. ${won ? "Your payout has been credited!" : "Better luck next time!"}`
          : `"${market.title}" resolved NO — deadline passed without condition being met${priceInfo ? ` (${priceInfo})` : ""}. ${won ? "Your payout has been credited!" : "Better luck next time!"}`;
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

      console.log(`Market ${market.id}: Auto-resolved ${winningSide.toUpperCase()} — notified ${notifications.length} participants`);

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
          const deadline = tm.auto_resolve_deadline ? new Date(tm.auto_resolve_deadline) : new Date(tm.end_date);
          if (new Date() <= deadline) continue; // Not past deadline yet

          const count = tm.twitter_current_count ?? 0;
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
