/**
 * Multi-provider asset price fetcher with automatic fallback.
 * Supports crypto (CoinGecko → CoinCap → CryptoCompare), commodities, and forex.
 * 
 * NON-CRYPTO OPTIMIZATION:
 * Instead of each client polling the commodity-price edge function individually,
 * a server-side "qt-price-broadcaster" fetches all non-crypto prices every 60s
 * and writes them to commodity_price_cache. Clients subscribe to Supabase Realtime
 * on that table, so N users = 1 API call (not N calls).
 * 
 * Includes Binance WebSocket streaming for real-time sub-second crypto updates,
 * and smooth interpolation for non-crypto assets.
 */

import { getAssetClass } from "@/data/assetClasses";
import { supabase } from "@/integrations/supabase/client";

// ── ID maps per provider ──
const GECKO_IDS: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", BNB: "binancecoin", SOL: "solana",
  XRP: "ripple", ADA: "cardano", DOGE: "dogecoin", MATIC: "matic-network",
  AVAX: "avalanche-2", DOT: "polkadot", LINK: "chainlink", SHIB: "shiba-inu",
};

const GECKO_TO_SYM: Record<string, string> = Object.fromEntries(
  Object.entries(GECKO_IDS).map(([k, v]) => [v, k])
);

const COINCAP_IDS: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", BNB: "binance-coin", SOL: "solana",
  XRP: "xrp", ADA: "cardano", DOGE: "dogecoin", MATIC: "polygon",
  AVAX: "avalanche", DOT: "polkadot", LINK: "chainlink", SHIB: "shiba-inu",
};

const CRYPTOCOMPARE_SYMS: Record<string, string> = {
  BTC: "BTC", ETH: "ETH", BNB: "BNB", SOL: "SOL",
  XRP: "XRP", ADA: "ADA", DOGE: "DOGE", MATIC: "MATIC",
  AVAX: "AVAX", DOT: "DOT", LINK: "LINK", SHIB: "SHIB",
};

// ── Per-provider fetch functions ──

async function fetchFromCoinGecko(geckoId: string): Promise<number | null> {
  try {
    const r = await fetchWithTimeout(
      `https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=usd`,
      {},
      2500,
    );
    if (!r.ok) return null;
    const d = await r.json();
    return d[geckoId]?.usd ?? null;
  } catch {
    return null;
  }
}

async function fetchFromCoinCap(coinCapId: string): Promise<number | null> {
  try {
    const r = await fetchWithTimeout(`https://api.coincap.io/v2/assets/${coinCapId}`, {}, 2500);
    if (!r.ok) return null;
    const d = await r.json();
    const price = parseFloat(d?.data?.priceUsd);
    return isNaN(price) ? null : price;
  } catch {
    return null;
  }
}

async function fetchFromCryptoCompare(sym: string): Promise<number | null> {
  try {
    const r = await fetchWithTimeout(
      `https://min-api.cryptocompare.com/data/price?fsym=${sym}&tsyms=USD`,
      {},
      2500,
    );
    if (!r.ok) return null;
    const d = await r.json();
    return d?.USD ?? null;
  } catch {
    return null;
  }
}

async function fetchFromBinanceSpot(sym: string): Promise<number | null> {
  const binanceSym = BINANCE_SYMS[sym];
  if (!binanceSym) return null;
  try {
    const r = await fetchWithTimeout(`https://api.binance.com/api/v3/ticker/price?symbol=${binanceSym}`, {}, 2500);
    if (!r.ok) return null;
    const d = await r.json();
    const price = parseFloat(d?.price);
    return Number.isFinite(price) ? price : null;
  } catch {
    return null;
  }
}

async function fetchFromTwelveDataCrypto(sym: string): Promise<number | null> {
  const tdSym = TWELVE_DATA_CRYPTO[sym];
  if (!tdSym) return null;

  try {
    const { data, error } = await supabase.functions.invoke("commodity-price", {
      body: { asset: sym, type: "crypto" },
    });
    if (error) return null;
    const price = Number(data?.price);
    return Number.isFinite(price) ? price : null;
  } catch {
    return null;
  }
}

// ── Cache & backoff state ──
const cache = new Map<string, { price: number; fetchedAt: number; provider: string }>();
const CACHE_TTL = 5_000;
let failCount = 0;

export async function fetchCryptoPrice(
  symbol: string,
  geckoId?: string
): Promise<number | null> {
  let sym = symbol.toUpperCase();
  if (!sym && geckoId) {
    sym = GECKO_TO_SYM[geckoId] || "";
  }
  const cacheKey = sym || geckoId || "";

  if (failCount >= 3) {
    const backoffMs = Math.min(2 ** failCount * 1000, 60_000);
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < backoffMs) {
      return cached.price;
    }
  }

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.price;
  }

  const gId = geckoId || GECKO_IDS[sym];
  const ccId = COINCAP_IDS[sym];
  const ccSym = CRYPTOCOMPARE_SYMS[sym];

  // Backend/provider calls first to avoid browser CORS/network restrictions in preview iframes.
  const providers: Array<{ name: string; fn: () => Promise<number | null> }> = [];
  if (TWELVE_DATA_CRYPTO[sym]) providers.push({ name: "twelvedata", fn: () => fetchFromTwelveDataCrypto(sym) });
  if (sym) providers.push({ name: "binance", fn: () => fetchFromBinanceSpot(sym) });
  if (ccSym) providers.push({ name: "cryptocompare", fn: () => fetchFromCryptoCompare(ccSym) });
  if (gId) providers.push({ name: "coingecko", fn: () => fetchFromCoinGecko(gId) });
  if (ccId) providers.push({ name: "coincap", fn: () => fetchFromCoinCap(ccId) });

  for (const { name, fn } of providers) {
    try {
      const price = await fn();
      if (price != null) {
        failCount = 0;
        cache.set(cacheKey, { price, fetchedAt: Date.now(), provider: name });
        return price;
      }
    } catch {
      // try next provider
    }
  }

  failCount++;
  return cached?.price ?? null;
}

// ── Commodity & Forex: Realtime-first, edge function fallback ──
// The server-side qt-price-broadcaster writes prices to commodity_price_cache every 60s.
// Clients subscribe to Realtime updates on that table. Direct edge function calls
// are only used as initial bootstrap / rare fallback.

const METAL_MAP: Record<string, string> = {
  XAU: "gold", XAG: "silver", XPT: "platinum", XPD: "palladium",
};

const TWELVE_DATA_SYMBOLS: Record<string, string> = {
  NG: "NG", COPPER: "COPPER", WTI: "WTI", BRENT: "BRENT",
  XAU: "XAU/USD", XAG: "XAG/USD", XPT: "XPT/USD", XPD: "XPD/USD",
};

// Twelve Data crypto symbol mappings
const TWELVE_DATA_CRYPTO: Record<string, string> = {
  BTC: "BTC/USD", ETH: "ETH/USD", BNB: "BNB/USD", SOL: "SOL/USD",
  XRP: "XRP/USD", ADA: "ADA/USD", DOGE: "DOGE/USD", MATIC: "MATIC/USD",
  AVAX: "AVAX/USD", DOT: "DOT/USD", LINK: "LINK/USD", SHIB: "SHIB/USD",
};

function getEdgeFunctionUrl(fnName: string): string | null {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  if (!projectId) return null;
  return `https://${projectId}.supabase.co/functions/v1/${fnName}`;
}

// ── Helper: fetch with timeout ──
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    return resp;
  } finally {
    clearTimeout(timer);
  }
}

// ── Realtime price cache (populated by Supabase Realtime subscription) ──
const realtimePriceCache = new Map<string, { price: number; updatedAt: number }>();
let realtimeChannelActive = false;

/**
 * Start a single Supabase Realtime subscription on commodity_price_cache.
 * All non-crypto asset prices flow through here instead of per-client polling.
 */
function ensureRealtimeSubscription() {
  if (realtimeChannelActive) return;
  realtimeChannelActive = true;

  const channel = supabase
    .channel("qt-price-stream")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "commodity_price_cache" },
      (payload) => {
        const row = (payload.new as any);
        if (!row?.asset || row?.price == null) return;
        const asset = row.asset as string;
        const price = Number(row.price);
        if (isNaN(price)) return;

        realtimePriceCache.set(asset, { price, updatedAt: Date.now() });

        // Feed into interpolation system for smooth chart streaming
        // Determine the original symbol (strip forex: prefix if present)
        const originalSymbol = asset.startsWith("forex:") ? asset.slice(6) : asset;
        // Only feed if there are active listeners for this asset
        const interpState = interpolationStates.get(originalSymbol);
        if (interpState && interpState.listeners.size > 0) {
          feedRealPrice(originalSymbol, price);
        }

        // Also update the main cache
        cache.set(originalSymbol.toUpperCase(), { price, fetchedAt: Date.now(), provider: "realtime" });
      }
    )
    .subscribe();
}

/**
 * Get cached price from Realtime subscription.
 */
function getRealtimePrice(asset: string): number | null {
  const entry = realtimePriceCache.get(asset);
  if (!entry) return null;
  // Accept if less than 5 minutes old (broadcaster runs every 60s, some buffer)
  if (Date.now() - entry.updatedAt > 300_000) return null;
  return entry.price;
}

/**
 * Bootstrap: load all prices from commodity_price_cache table once.
 * This populates the cache immediately while waiting for Realtime updates.
 */
let bootstrapDone = false;
async function bootstrapNonCryptoPrices() {
  if (bootstrapDone) return;
  bootstrapDone = true;

  try {
    const { data } = await supabase
      .from("commodity_price_cache")
      .select("asset, price, updated_at");

    if (data) {
      for (const row of data) {
        const age = Date.now() - new Date(row.updated_at).getTime();
        if (age < 300_000) { // less than 5 min old
          realtimePriceCache.set(row.asset, { price: row.price, updatedAt: Date.now() - age });
          const originalSymbol = row.asset.startsWith("forex:") ? row.asset.slice(6) : row.asset;
          cache.set(originalSymbol.toUpperCase(), { price: row.price, fetchedAt: Date.now() - age, provider: "db_bootstrap" });
        }
      }
    }
  } catch {
    // non-critical
  }
}

// ── Direct edge function calls (fallback only) ──
async function fetchCommodityPriceDirect(asset: string): Promise<number | null> {
  const url = getEdgeFunctionUrl("commodity-price");
  if (!url) return null;
  try {
    const resp = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data?.price ?? null;
  } catch {
    return null;
  }
}

async function fetchForexPriceDirect(asset: string): Promise<number | null> {
  const url = getEdgeFunctionUrl("commodity-price");
  if (!url) return null;
  try {
    const resp = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset, type: "forex" }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data?.price ?? null;
  } catch {
    return null;
  }
}

// ── Unified commodity/forex price fetcher (Realtime-first) ──
async function fetchCommodityPrice(asset: string): Promise<number | null> {
  // Ensure Realtime is active and bootstrap is loaded
  ensureRealtimeSubscription();
  await bootstrapNonCryptoPrices();

  // Try Realtime cache first (zero API calls)
  const rtPrice = getRealtimePrice(asset);
  if (rtPrice != null) return rtPrice;

  // Fallback: direct edge function call (rare, only if broadcaster hasn't run yet)
  return fetchCommodityPriceDirect(asset);
}

async function fetchForexPrice(asset: string): Promise<number | null> {
  ensureRealtimeSubscription();
  await bootstrapNonCryptoPrices();

  // Try Realtime cache (keyed as forex:PAIR)
  const rtPrice = getRealtimePrice(`forex:${asset}`);
  if (rtPrice != null) return rtPrice;

  // Fallback
  return fetchForexPriceDirect(asset);
}

/**
 * Fetch price for any supported asset (crypto, commodity, or forex).
 */
export async function fetchAssetPrice(asset: string): Promise<number | null> {
  const assetClass = getAssetClass(asset);
  if (assetClass === "crypto") return fetchCryptoPrice(asset);
  if (assetClass === "commodity") return fetchCommodityPrice(asset);
  if (assetClass === "forex") return fetchForexPrice(asset);
  return null;
}

// ── Non-crypto price history accumulator ──
// Builds rolling history via Realtime-fed prices so charts fill up smoothly.

const nonCryptoHistory = new Map<string, [number, number][]>();
const NON_CRYPTO_MAX_POINTS = 1000;
const NON_CRYPTO_POLL_INTERVAL = 30_000; // reduced from 10s since Realtime feeds prices
const activePollers = new Map<string, { timer: ReturnType<typeof setInterval>; refCount: number }>();

function appendPricePoint(asset: string, price: number) {
  let history = nonCryptoHistory.get(asset);
  if (!history) {
    history = [];
    nonCryptoHistory.set(asset, history);
  }
  history.push([Date.now(), price]);
  if (history.length > NON_CRYPTO_MAX_POINTS) {
    nonCryptoHistory.set(asset, history.slice(-NON_CRYPTO_MAX_POINTS));
  }
}

/**
 * Start polling for a non-crypto asset's price history.
 * Now uses Realtime-cached prices (no API calls) with edge function fallback.
 * Returns an unsubscribe function. Multiple callers share the same poller.
 */
export function startNonCryptoHistoryPoller(asset: string): () => void {
  ensureRealtimeSubscription();
  bootstrapNonCryptoPrices();

  const existing = activePollers.get(asset);
  if (existing) {
    existing.refCount++;
    return () => {
      existing.refCount--;
      if (existing.refCount <= 0) {
        clearInterval(existing.timer);
        activePollers.delete(asset);
      }
    };
  }

  const doFetch = async () => {
    const price = await fetchAssetPrice(asset);
    if (price != null) appendPricePoint(asset, price);
  };
  doFetch();
  const timer = setInterval(doFetch, NON_CRYPTO_POLL_INTERVAL);
  activePollers.set(asset, { timer, refCount: 1 });

  return () => {
    const p = activePollers.get(asset);
    if (p) {
      p.refCount--;
      if (p.refCount <= 0) {
        clearInterval(p.timer);
        activePollers.delete(asset);
      }
    }
  };
}

/**
 * Get accumulated non-crypto price history.
 */
export function getNonCryptoHistory(asset: string): [number, number][] {
  return nonCryptoHistory.get(asset) ?? [];
}

/**
 * Seed synthetic history for a non-crypto asset so charts display immediately
 * at the correct price level when switching assets. Generates 60 points
 * spanning the last hour with tiny random micro-variations for visual realism.
 * Only seeds if existing history has fewer than 5 points.
 */
export function seedNonCryptoHistory(asset: string, price: number): void {
  const existing = nonCryptoHistory.get(asset);
  if (existing && existing.length >= 5) return; // already has enough data
  const now = Date.now();
  const points: [number, number][] = [];
  const count = 60;
  const spanMs = 60 * 60 * 1000; // 1 hour
  for (let i = 0; i < count; i++) {
    const ts = now - spanMs + (i * spanMs) / count;
    // Tiny random variation (±0.02%) for visual realism
    const jitter = price * (Math.random() - 0.5) * 0.0004;
    points.push([ts, price + jitter]);
  }
  // Append actual current price as last point
  points.push([now, price]);
  nonCryptoHistory.set(asset, points);
}

// ── Smooth price interpolation for non-crypto assets ──
// Creates synthetic intermediate price points between polls for smooth chart streaming

interface InterpolationState {
  lastRealPrice: number;
  prevRealPrice: number;
  lastRealTime: number;
  listeners: Set<(price: number) => void>;
  rafId: number | null;
  intervalId: ReturnType<typeof setInterval> | null;
}

const interpolationStates = new Map<string, InterpolationState>();

/**
 * Subscribe to smooth price stream for non-crypto assets.
 * Emits interpolated ticks between real API polls (~15fps) for natural chart movement.
 */
export function subscribeToSmoothedPriceStream(
  asset: string,
  callback: (price: number) => void
): () => void {
  let state = interpolationStates.get(asset);
  if (!state) {
    state = {
      lastRealPrice: 0,
      prevRealPrice: 0,
      lastRealTime: 0,
      listeners: new Set(),
      rafId: null,
      intervalId: null,
    };
    interpolationStates.set(asset, state);
  }

  state.listeners.add(callback);

  // Start interpolation loop if first listener
  if (state.listeners.size === 1) {
    startInterpolation(asset, state);
  }

  return () => {
    state!.listeners.delete(callback);
    if (state!.listeners.size === 0) {
      stopInterpolation(state!);
      interpolationStates.delete(asset);
    }
  };
}

function startInterpolation(asset: string, state: InterpolationState) {
  // Emit smooth ticks at ~15fps using setInterval (more battery-friendly than RAF)
  const TICK_INTERVAL = 66; // ~15fps

  state.intervalId = setInterval(() => {
    if (state.lastRealPrice === 0 || state.listeners.size === 0) return;

    const now = Date.now();
    const elapsed = now - state.lastRealTime;

    // Interpolate between prevRealPrice and lastRealPrice, then micro-drift beyond
    const interpDuration = NON_CRYPTO_POLL_INTERVAL;

    let interpolatedPrice: number;
    if (elapsed < interpDuration && state.prevRealPrice > 0) {
      // Smooth ease between previous and current real price
      const t = Math.min(elapsed / interpDuration, 1);
      // Use ease-out cubic for natural deceleration
      const eased = 1 - Math.pow(1 - t, 3);
      interpolatedPrice = state.prevRealPrice + (state.lastRealPrice - state.prevRealPrice) * eased;
    } else {
      // Beyond interpolation window: add tiny Brownian drift for "alive" feel
      const drift = state.lastRealPrice * (Math.random() - 0.5) * 0.0002;
      interpolatedPrice = state.lastRealPrice + drift;
    }

    state.listeners.forEach(cb => cb(interpolatedPrice));
  }, TICK_INTERVAL);
}

function stopInterpolation(state: InterpolationState) {
  if (state.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }
  if (state.rafId) {
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }
}

/**
 * Feed a new real price into the interpolation system.
 * Call this whenever a real API response comes back.
 */
export function feedRealPrice(asset: string, price: number) {
  const state = interpolationStates.get(asset);
  if (state) {
    state.prevRealPrice = state.lastRealPrice || price;
    state.lastRealPrice = price;
    state.lastRealTime = Date.now();
  }
  // Also update the global cache
  const cacheKey = asset.toUpperCase();
  cache.set(cacheKey, { price, fetchedAt: Date.now(), provider: "polled" });
}

/**
 * Reset interpolation state for an asset so stale prices don't leak
 * when switching between assets.
 */
export function resetInterpolationState(asset: string) {
  const state = interpolationStates.get(asset);
  if (state) {
    stopInterpolation(state);
    state.lastRealPrice = 0;
    state.prevRealPrice = 0;
    state.lastRealTime = 0;
    // Don't delete the entry — listeners may still be attached during transition
  }
}

// ── Historical price data with fallback ──
const rawCache = new Map<string, { prices: [number, number][]; fetchedAt: number }>();
const RAW_CACHE_TTL = 30_000;

// Binance symbol mapping for klines API (no API key needed)
const BINANCE_SYMS: Record<string, string> = {
  BTC: "BTCUSDT", ETH: "ETHUSDT", BNB: "BNBUSDT", SOL: "SOLUSDT",
  XRP: "XRPUSDT", ADA: "ADAUSDT", DOGE: "DOGEUSDT", MATIC: "MATICUSDT",
  AVAX: "AVAXUSDT", DOT: "DOTUSDT", LINK: "LINKUSDT", SHIB: "SHIBUSDT",
};

/**
 * Fetch 1-minute klines from Binance REST API.
 * Returns up to 1000 data points (≈16.7 hours of 1-min candles).
 * This gives much higher resolution than CoinGecko's 5-min intervals.
 */
async function fetchHistoryFromBinance(sym: string): Promise<[number, number][] | null> {
  const binanceSym = BINANCE_SYMS[sym];
  if (!binanceSym) return null;
  try {
    const r = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${binanceSym}&interval=1m&limit=1000`
    );
    if (!r.ok) return null;
    const data: any[] = await r.json();
    if (!data?.length) return null;
    // Each kline: [openTime, open, high, low, close, volume, closeTime, ...]
    // Generate 4 points per candle (O → H → L → C) for richer chart data
    // This gives ~4000 data points instead of 1000, making short timeframes vibrant
    const points: [number, number][] = [];
    for (const k of data) {
      const openTime = k[0] as number;
      const o = parseFloat(k[1]);
      const h = parseFloat(k[2]);
      const l = parseFloat(k[3]);
      const c = parseFloat(k[4]);
      const interval = 60_000; // 1-min candle
      // Distribute O/H/L/C across the candle's time span
      if (o <= c) {
        // Bullish candle: open → low → high → close
        points.push([openTime, o]);
        points.push([openTime + interval * 0.25, l]);
        points.push([openTime + interval * 0.65, h]);
        points.push([openTime + interval * 0.95, c]);
      } else {
        // Bearish candle: open → high → low → close
        points.push([openTime, o]);
        points.push([openTime + interval * 0.25, h]);
        points.push([openTime + interval * 0.65, l]);
        points.push([openTime + interval * 0.95, c]);
      }
    }
    return points;
  } catch {
    return null;
  }
}

async function fetchHistoryFromCoinGecko(geckoId: string): Promise<[number, number][] | null> {
  const r = await fetch(
    `https://api.coingecko.com/api/v3/coins/${geckoId}/market_chart?vs_currency=usd&days=1`
  );
  if (!r.ok) return null;
  const d = await r.json();
  return d.prices || null;
}

async function fetchHistoryFromCoinCap(coinCapId: string): Promise<[number, number][] | null> {
  const now = Date.now();
  const start = now - 24 * 60 * 60 * 1000;
  const r = await fetch(
    `https://api.coincap.io/v2/assets/${coinCapId}/history?interval=m5&start=${start}&end=${now}`
  );
  if (!r.ok) return null;
  const d = await r.json();
  if (!d?.data?.length) return null;
  return d.data.map((p: { time: number; priceUsd: string }) => [
    p.time,
    parseFloat(p.priceUsd),
  ] as [number, number]);
}

async function fetchHistoryFromCryptoCompare(sym: string): Promise<[number, number][] | null> {
  const r = await fetch(
    `https://min-api.cryptocompare.com/data/v2/histominute?fsym=${sym}&tsym=USD&limit=288&aggregate=5`
  );
  if (!r.ok) return null;
  const d = await r.json();
  if (!d?.Data?.Data?.length) return null;
  return d.Data.Data.map((p: { time: number; close: number }) => [
    p.time * 1000,
    p.close,
  ] as [number, number]);
}

export async function fetchCryptoHistory(
  symbol: string,
  geckoId?: string
): Promise<[number, number][]> {
  let sym = symbol.toUpperCase();
  if (!sym && geckoId) {
    sym = GECKO_TO_SYM[geckoId] || "";
  }
  const cacheKey = sym || geckoId || "";
  const cached = rawCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < RAW_CACHE_TTL) {
    return cached.prices;
  }

  const gId = geckoId || GECKO_IDS[sym];
  const ccId = COINCAP_IDS[sym];
  const ccSym = CRYPTOCOMPARE_SYMS[sym];

  // Binance 1-min klines first (highest resolution, no API key needed)
  const providers: Array<() => Promise<[number, number][] | null>> = [];
  if (BINANCE_SYMS[sym]) providers.push(() => fetchHistoryFromBinance(sym));
  if (gId) providers.push(() => fetchHistoryFromCoinGecko(gId));
  if (ccId) providers.push(() => fetchHistoryFromCoinCap(ccId));
  if (ccSym) providers.push(() => fetchHistoryFromCryptoCompare(ccSym));

  for (const fn of providers) {
    try {
      const prices = await fn();
      if (prices && prices.length > 0) {
        rawCache.set(cacheKey, { prices, fetchedAt: Date.now() });
        return prices;
      }
    } catch {
      // try next
    }
  }

  return cached?.prices ?? [];
}

// ── OHLC candlestick data with fallback (up to 30 days) ──

export interface OHLCCandle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

const ohlcCache = new Map<string, { candles: OHLCCandle[]; fetchedAt: number }>();
const OHLC_CACHE_TTL = 30_000;

function timeframeToDays(tfKey: string): number {
  switch (tfKey) {
    case "1m": return 1;
    case "5m": return 2;
    case "15m": return 3;
    case "1h": return 7;
    case "4h": return 14;
    case "1d": return 30;
    case "1w": return 60;
    case "1M": return 180;
    default: return 1;
  }
}

function timeframeToSeconds(tfKey: string): number {
  switch (tfKey) {
    case "1m": return 60;
    case "5m": return 5 * 60;
    case "15m": return 15 * 60;
    case "1h": return 60 * 60;
    case "4h": return 4 * 60 * 60;
    case "1d": return 24 * 60 * 60;
    case "1w": return 7 * 24 * 60 * 60;
    case "1M": return 30 * 24 * 60 * 60;
    default: return 60;
  }
}

function timeframeToCoinCapInterval(tfKey: string): string {
  switch (tfKey) {
    case "1m": return "m1";
    case "5m": return "m5";
    case "15m": return "m15";
    case "1h": return "h1";
    case "4h": return "h4";
    case "1d": return "d1";
    default: return "m5";
  }
}

function timeframeToCryptoCompareConfig(tfKey: string): { endpoint: "histominute" | "histohour" | "histoday"; aggregate: number; limit: number } {
  switch (tfKey) {
    case "1m":
      return { endpoint: "histominute", aggregate: 1, limit: 720 };
    case "5m":
      return { endpoint: "histominute", aggregate: 5, limit: 576 };
    case "15m":
      return { endpoint: "histominute", aggregate: 15, limit: 480 };
    case "1h":
      return { endpoint: "histohour", aggregate: 1, limit: 336 };
    case "4h":
      return { endpoint: "histohour", aggregate: 4, limit: 240 };
    case "1d":
      return { endpoint: "histoday", aggregate: 1, limit: 180 };
    default:
      return { endpoint: "histominute", aggregate: 5, limit: 288 };
  }
}

async function fetchOHLCFromCoinGecko(geckoId: string, days: number): Promise<OHLCCandle[] | null> {
  const validDays = days <= 1 ? 1 : days <= 7 ? 7 : days <= 14 ? 14 : 30;
  const r = await fetch(
    `https://api.coingecko.com/api/v3/coins/${geckoId}/ohlc?vs_currency=usd&days=${validDays}`
  );
  if (!r.ok) return null;
  const data: [number, number, number, number, number][] = await r.json();
  if (!Array.isArray(data) || data.length === 0) return null;
  return data.map(([ts, o, h, l, c]) => ({
    time: Math.floor(ts / 1000),
    open: o, high: h, low: l, close: c,
  }));
}

async function fetchOHLCFromCoinCap(coinCapId: string, tfKey: string): Promise<OHLCCandle[] | null> {
  const now = Date.now();
  const bucketSec = timeframeToSeconds(tfKey);
  const lookbackMs = Math.min(bucketSec * 1000 * 240, 30 * 24 * 60 * 60 * 1000);
  const start = now - lookbackMs;
  const interval = timeframeToCoinCapInterval(tfKey);

  const r = await fetch(
    `https://api.coincap.io/v2/assets/${coinCapId}/history?interval=${interval}&start=${start}&end=${now}`
  );
  if (!r.ok) return null;
  const d = await r.json();
  if (!d?.data?.length) return null;

  const points: { time: number; price: number }[] = d.data
    .map((p: { time: number; priceUsd: string }) => ({
      time: Math.floor(p.time / 1000),
      price: parseFloat(p.priceUsd),
    }))
    .filter((p: { time: number; price: number }) => Number.isFinite(p.price));

  if (!points.length) return null;

  // CoinCap returns one price per interval, so derive pseudo-OHLC from previous close.
  return points.map((p, i) => {
    const open = i === 0 ? p.price : points[i - 1].price;
    const close = p.price;
    return {
      time: p.time,
      open,
      high: Math.max(open, close),
      low: Math.min(open, close),
      close,
    };
  });
}

async function fetchOHLCFromCryptoCompare(sym: string, tfKey: string): Promise<OHLCCandle[] | null> {
  const { endpoint, aggregate, limit } = timeframeToCryptoCompareConfig(tfKey);
  const url = `https://min-api.cryptocompare.com/data/v2/${endpoint}?fsym=${sym}&tsym=USD&limit=${limit}&aggregate=${aggregate}`;

  const r = await fetch(url);
  if (!r.ok) return null;
  const d = await r.json();
  if (!d?.Data?.Data?.length) return null;

  const candles = d.Data.Data
    .map((p: { time: number; open: number; high: number; low: number; close: number }) => ({
      time: p.time,
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
    }))
    .filter((c: OHLCCandle) => Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close));

  return candles.length > 0 ? candles : null;
}

export async function fetchOHLCData(
  symbol: string,
  tfKey: string,
  geckoId?: string
): Promise<OHLCCandle[]> {
  let sym = symbol.toUpperCase();
  if (!sym && geckoId) {
    sym = GECKO_TO_SYM[geckoId] || "";
  }
  const days = timeframeToDays(tfKey);
  const cacheKey = `${sym || geckoId}:${tfKey}`;
  const cached = ohlcCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < OHLC_CACHE_TTL) {
    return cached.candles;
  }

  const gId = geckoId || GECKO_IDS[sym];
  const ccId = COINCAP_IDS[sym];
  const ccSym = CRYPTOCOMPARE_SYMS[sym];

  // Prefer timeframe-native providers first for better interval accuracy.
  const providers: Array<() => Promise<OHLCCandle[] | null>> = [];
  if (ccSym) providers.push(() => fetchOHLCFromCryptoCompare(ccSym, tfKey));
  if (ccId) providers.push(() => fetchOHLCFromCoinCap(ccId, tfKey));
  if (gId) providers.push(() => fetchOHLCFromCoinGecko(gId, days));

  for (const fn of providers) {
    try {
      const candles = await fn();
      if (candles && candles.length > 0) {
        ohlcCache.set(cacheKey, { candles, fetchedAt: Date.now() });
        return candles;
      }
    } catch {
      // try next
    }
  }

  return cached?.candles ?? [];
}

// ── Binance WebSocket real-time streaming ──

const BINANCE_WS_SYMBOLS: Record<string, string> = {
  BTC: "btcusdt", ETH: "ethusdt", BNB: "bnbusdt", SOL: "solusdt",
  XRP: "xrpusdt", DOGE: "dogeusdt", ADA: "adausdt", MATIC: "maticusdt",
  AVAX: "avaxusdt", DOT: "dotusdt", LINK: "linkusdt", SHIB: "shibusdt",
};

const GECKO_TO_SYM_WS: Record<string, string> = {
  bitcoin: "BTC", ethereum: "ETH", binancecoin: "BNB", solana: "SOL",
  ripple: "XRP", cardano: "ADA", dogecoin: "DOGE", "matic-network": "MATIC",
  "avalanche-2": "AVAX", polkadot: "DOT", chainlink: "LINK", "shiba-inu": "SHIB",
};

interface WSSubscription {
  ws: WebSocket;
  listeners: Set<(price: number) => void>;
  lastPrice: number | null;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  reconnectAttempts: number;
  onlineHandler?: () => void;
}

const wsSubscriptions = new Map<string, WSSubscription>();

// Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (cap), with ±20% jitter.
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;
function computeBackoff(attempt: number): number {
  const exp = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * Math.pow(2, attempt));
  const jitter = exp * (0.8 + Math.random() * 0.4); // 0.8x – 1.2x
  return Math.round(jitter);
}

function createBinanceWS(symbol: string): WSSubscription {
  const binanceSymbol = BINANCE_WS_SYMBOLS[symbol];
  if (!binanceSymbol) throw new Error(`No Binance symbol for ${symbol}`);

  const sub: WSSubscription = {
    ws: null as any,
    listeners: new Set(),
    lastPrice: null,
    reconnectAttempts: 0,
  };

  const scheduleReconnect = (reason: string) => {
    if (sub.listeners.size === 0) return;
    if (sub.reconnectTimer) clearTimeout(sub.reconnectTimer);

    // If the browser is offline, wait for it to come back online instead of burning attempts.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      if (!sub.onlineHandler) {
        sub.onlineHandler = () => {
          window.removeEventListener("online", sub.onlineHandler!);
          sub.onlineHandler = undefined;
          sub.reconnectAttempts = 0;
          connect();
        };
        window.addEventListener("online", sub.onlineHandler);
      }
      return;
    }

    const delay = computeBackoff(sub.reconnectAttempts);
    sub.reconnectAttempts = Math.min(sub.reconnectAttempts + 1, 10);
    sub.reconnectTimer = setTimeout(() => {
      sub.reconnectTimer = undefined;
      connect();
    }, delay);
    if (typeof console !== "undefined") {
      console.debug(`[binance-ws] reconnect ${symbol} in ${delay}ms (attempt ${sub.reconnectAttempts}, ${reason})`);
    }
  };

  function connect() {
    try {
      const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${binanceSymbol}@trade`);
      sub.ws = ws;

      ws.onopen = () => {
        // Successful connection — reset backoff so the next disruption starts fresh.
        sub.reconnectAttempts = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const price = parseFloat(data.p);
          if (!isNaN(price)) {
            sub.lastPrice = price;
            const cacheKey = symbol.toUpperCase();
            cache.set(cacheKey, { price, fetchedAt: Date.now(), provider: "binance-ws" });
            sub.listeners.forEach((cb) => cb(price));
          }
        } catch {}
      };

      ws.onerror = () => {
        try { ws.close(); } catch {}
      };

      ws.onclose = () => {
        scheduleReconnect("close");
      };
    } catch {
      scheduleReconnect("throw");
    }
  }

  connect();
  return sub;
}


/**
 * Subscribe to real-time price updates via Binance WebSocket.
 * Returns an unsubscribe function. Falls back gracefully if WS unavailable.
 */
export function subscribeToPriceStream(
  symbolOrGeckoId: string,
  callback: (price: number) => void
): () => void {
  let sym = symbolOrGeckoId.toUpperCase();
  if (GECKO_TO_SYM_WS[symbolOrGeckoId]) {
    sym = GECKO_TO_SYM_WS[symbolOrGeckoId];
  }

  if (!BINANCE_WS_SYMBOLS[sym]) {
    return () => {};
  }

  let sub = wsSubscriptions.get(sym);
  if (!sub) {
    sub = createBinanceWS(sym);
    wsSubscriptions.set(sym, sub);
  }

  sub.listeners.add(callback);

  if (sub.lastPrice !== null) {
    callback(sub.lastPrice);
  }

  return () => {
    sub!.listeners.delete(callback);
    if (sub!.listeners.size === 0) {
      clearTimeout(sub!.reconnectTimer);
      try { sub!.ws?.close(); } catch {}
      wsSubscriptions.delete(sym);
    }
  };
}
