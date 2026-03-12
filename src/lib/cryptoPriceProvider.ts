/**
 * Multi-provider asset price fetcher with automatic fallback.
 * Supports crypto (CoinGecko → CoinCap → CryptoCompare), commodities, and forex.
 * Commodities: Twelve Data (via edge proxy) → metals.dev → Omkar/DB fallback
 * Forex: ExchangeRate API (via edge proxy) → Frankfurter
 * Includes Binance WebSocket streaming for real-time sub-second updates,
 * and smooth interpolation for non-crypto assets.
 */

import { getAssetClass } from "@/data/assetClasses";

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
  const r = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=usd`
  );
  if (!r.ok) return null;
  const d = await r.json();
  return d[geckoId]?.usd ?? null;
}

async function fetchFromCoinCap(coinCapId: string): Promise<number | null> {
  const r = await fetch(`https://api.coincap.io/v2/assets/${coinCapId}`);
  if (!r.ok) return null;
  const d = await r.json();
  const price = parseFloat(d?.data?.priceUsd);
  return isNaN(price) ? null : price;
}

async function fetchFromCryptoCompare(sym: string): Promise<number | null> {
  const r = await fetch(
    `https://min-api.cryptocompare.com/data/price?fsym=${sym}&tsyms=USD`
  );
  if (!r.ok) return null;
  const d = await r.json();
  return d?.USD ?? null;
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

  const providers: Array<{ name: string; fn: () => Promise<number | null> }> = [];
  if (gId) providers.push({ name: "coingecko", fn: () => fetchFromCoinGecko(gId) });
  if (ccId) providers.push({ name: "coincap", fn: () => fetchFromCoinCap(ccId) });
  if (ccSym) providers.push({ name: "cryptocompare", fn: () => fetchFromCryptoCompare(ccSym) });

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

// ── Commodity & Forex price fetchers ──
// Twelve Data (via edge proxy) is primary for commodities.
// ExchangeRate API (via edge proxy) is primary for forex.
// Both keep API keys secure server-side while the client calls them directly.

const METAL_MAP: Record<string, string> = {
  XAU: "gold", XAG: "silver", XPT: "platinum", XPD: "palladium",
};

const TWELVE_DATA_SYMBOLS: Record<string, string> = {
  NG: "NG", COPPER: "COPPER", WTI: "WTI", BRENT: "BRENT",
  XAU: "XAU/USD", XAG: "XAG/USD", XPT: "XPT/USD", XPD: "XPD/USD",
};

function getEdgeFunctionUrl(fnName: string): string | null {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  if (!projectId) return null;
  return `https://${projectId}.supabase.co/functions/v1/${fnName}`;
}

// ── Twelve Data via edge proxy (primary for commodities) ──
async function fetchFromTwelveDataProxy(asset: string): Promise<number | null> {
  if (!TWELVE_DATA_SYMBOLS[asset]) return null;
  const url = getEdgeFunctionUrl("commodity-price");
  if (!url) return null;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset, provider: "twelve_data" }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data?.price ?? null;
  } catch {
    return null;
  }
}

// ── metals.dev fallback for precious metals ──
async function fetchMetalPrice(asset: string): Promise<number | null> {
  const metalName = METAL_MAP[asset];
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

// ── Generic edge function fallback (Omkar + DB cache + static) ──
async function fetchCommodityViaEdgeFallback(asset: string): Promise<number | null> {
  const url = getEdgeFunctionUrl("commodity-price");
  if (!url) return null;
  try {
    const resp = await fetch(url, {
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

async function fetchCommodityPrice(asset: string): Promise<number | null> {
  // 1. Twelve Data (via edge proxy — primary, uses TWELVE_DATA_API_KEY server-side)
  const tdPrice = await fetchFromTwelveDataProxy(asset);
  if (tdPrice != null) return tdPrice;
  // 2. metals.dev for precious metals (free client-side)
  if (METAL_MAP[asset]) {
    const metalPrice = await fetchMetalPrice(asset);
    if (metalPrice != null) return metalPrice;
  }
  // 3. Edge function fallback chain (Omkar → DB cache → static)
  return fetchCommodityViaEdgeFallback(asset);
}

// ── ExchangeRate API via edge proxy (primary for forex, uses EXCHANGERATE_API_KEY server-side) ──
async function fetchFromExchangeRateProxy(asset: string): Promise<number | null> {
  const url = getEdgeFunctionUrl("commodity-price");
  if (!url) return null;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset, type: "forex", provider: "exchangerate" }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data?.price ?? null;
  } catch {
    return null;
  }
}

// ── Frankfurter (free, no key — fallback for forex) ──
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
  // 1. ExchangeRate API (via edge proxy — primary, uses EXCHANGERATE_API_KEY server-side)
  const erPrice = await fetchFromExchangeRateProxy(asset);
  if (erPrice != null) return erPrice;
  // 2. Frankfurter (free client-side fallback)
  return fetchForexFromFrankfurter(asset);
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
// Builds rolling history via periodic polling so charts fill up smoothly.

const nonCryptoHistory = new Map<string, [number, number][]>();
const NON_CRYPTO_MAX_POINTS = 1000;
const NON_CRYPTO_POLL_INTERVAL = 10_000; // poll every 10 seconds for smooth charts
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
 * Returns an unsubscribe function. Multiple callers share the same poller.
 */
export function startNonCryptoHistoryPoller(asset: string): () => void {
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
      const drift = state.lastRealPrice * (Math.random() - 0.5) * 0.00005;
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

// ── Historical price data with fallback ──
const rawCache = new Map<string, { prices: [number, number][]; fetchedAt: number }>();
const RAW_CACHE_TTL = 30_000;

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

  const providers: Array<() => Promise<[number, number][] | null>> = [];
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
    case "1m": case "5m": case "15m": case "1h": case "4h": return 1;
    case "1d": return 2;
    case "1w": return 7;
    case "1M": return 30;
    default: return 1;
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

async function fetchOHLCFromCoinCap(coinCapId: string, days: number): Promise<OHLCCandle[] | null> {
  const now = Date.now();
  const start = now - days * 24 * 60 * 60 * 1000;
  const interval = days <= 1 ? "m5" : days <= 7 ? "h1" : "h2";
  const r = await fetch(
    `https://api.coincap.io/v2/assets/${coinCapId}/history?interval=${interval}&start=${start}&end=${now}`
  );
  if (!r.ok) return null;
  const d = await r.json();
  if (!d?.data?.length) return null;
  const points: { time: number; price: number }[] = d.data.map((p: { time: number; priceUsd: string }) => ({
    time: Math.floor(p.time / 1000),
    price: parseFloat(p.priceUsd),
  }));
  const bucketSize = days <= 1 ? 6 : 1;
  const candles: OHLCCandle[] = [];
  for (let i = 0; i < points.length; i += bucketSize) {
    const slice = points.slice(i, i + bucketSize);
    if (slice.length === 0) continue;
    candles.push({
      time: slice[0].time,
      open: slice[0].price,
      high: Math.max(...slice.map(s => s.price)),
      low: Math.min(...slice.map(s => s.price)),
      close: slice[slice.length - 1].price,
    });
  }
  return candles.length > 0 ? candles : null;
}

async function fetchOHLCFromCryptoCompare(sym: string, days: number): Promise<OHLCCandle[] | null> {
  let url: string;
  if (days <= 1) {
    url = `https://min-api.cryptocompare.com/data/v2/histominute?fsym=${sym}&tsym=USD&limit=288&aggregate=5`;
  } else if (days <= 7) {
    url = `https://min-api.cryptocompare.com/data/v2/histohour?fsym=${sym}&tsym=USD&limit=${days * 24}`;
  } else {
    url = `https://min-api.cryptocompare.com/data/v2/histoday?fsym=${sym}&tsym=USD&limit=${days}`;
  }
  const r = await fetch(url);
  if (!r.ok) return null;
  const d = await r.json();
  if (!d?.Data?.Data?.length) return null;
  return d.Data.Data.map((p: { time: number; open: number; high: number; low: number; close: number }) => ({
    time: p.time,
    open: p.open,
    high: p.high,
    low: p.low,
    close: p.close,
  }));
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
  const cacheKey = `${sym || geckoId}:${days}`;
  const cached = ohlcCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < OHLC_CACHE_TTL) {
    return cached.candles;
  }

  const gId = geckoId || GECKO_IDS[sym];
  const ccId = COINCAP_IDS[sym];
  const ccSym = CRYPTOCOMPARE_SYMS[sym];

  const providers: Array<() => Promise<OHLCCandle[] | null>> = [];
  if (gId) providers.push(() => fetchOHLCFromCoinGecko(gId, days));
  if (ccId) providers.push(() => fetchOHLCFromCoinCap(ccId, days));
  if (ccSym) providers.push(() => fetchOHLCFromCryptoCompare(ccSym, days));

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
}

const wsSubscriptions = new Map<string, WSSubscription>();

function createBinanceWS(symbol: string): WSSubscription {
  const binanceSymbol = BINANCE_WS_SYMBOLS[symbol];
  if (!binanceSymbol) throw new Error(`No Binance symbol for ${symbol}`);
  
  const sub: WSSubscription = {
    ws: null as any,
    listeners: new Set(),
    lastPrice: null,
  };

  function connect() {
    try {
      const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${binanceSymbol}@trade`);
      sub.ws = ws;

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
        ws.close();
      };

      ws.onclose = () => {
        if (sub.listeners.size > 0) {
          sub.reconnectTimer = setTimeout(connect, 2000);
        }
      };
    } catch {
      sub.reconnectTimer = setTimeout(connect, 5000);
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
