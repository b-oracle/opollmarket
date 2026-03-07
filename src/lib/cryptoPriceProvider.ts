/**
 * Multi-provider crypto price fetcher with automatic fallback.
 * Order: CoinGecko → CoinCap → CryptoCompare (all free, no API key needed).
 */

// ── ID maps per provider ──
const GECKO_IDS: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", BNB: "binancecoin", SOL: "solana",
  XRP: "ripple", ADA: "cardano", DOGE: "dogecoin", MATIC: "matic-network",
  AVAX: "avalanche-2", DOT: "polkadot", LINK: "chainlink", SHIB: "shiba-inu",
};

// Reverse lookup: geckoId → symbol
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

/**
 * Fetch a crypto price with automatic fallback across 3 free providers.
 * Uses a 5-second per-asset cache and exponential backoff on repeated failures.
 */
export async function fetchCryptoPrice(
  symbol: string,
  geckoId?: string
): Promise<number | null> {
  // Resolve symbol from geckoId if symbol is empty
  let sym = symbol.toUpperCase();
  if (!sym && geckoId) {
    sym = GECKO_TO_SYM[geckoId] || "";
  }
  const cacheKey = sym || geckoId || "";

  // Backoff on repeated failures
  if (failCount >= 3) {
    const backoffMs = Math.min(2 ** failCount * 1000, 60_000);
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < backoffMs) {
      return cached.price;
    }
  }

  // Return cached if fresh
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

/**
 * Fetch 24h historical price data with automatic fallback.
 */
export async function fetchCryptoHistory(
  symbol: string,
  geckoId?: string
): Promise<[number, number][]> {
  const sym = symbol.toUpperCase();
  const cached = rawCache.get(sym);
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
        rawCache.set(sym, { prices, fetchedAt: Date.now() });
        return prices;
      }
    } catch {
      // try next
    }
  }

  return cached?.prices ?? [];
}
