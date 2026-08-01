import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// In-memory cache to reduce API calls
const cache = new Map<string, { price: number; fetchedAt: number }>();
const CACHE_TTL = 30_000; // 30 seconds (shorter for streaming)

// Map our symbols to Twelve Data symbols (primary) and Omkar names (fallback)
const TWELVE_DATA_MAP: Record<string, string> = {
  NG: "NG",
  COPPER: "COPPER",
  WTI: "WTI",
  BRENT: "BRENT",
  XAU: "XAU/USD",
  XAG: "XAG/USD",
  XPT: "XPT/USD",
  XPD: "XPD/USD",
};

const OMKAR_MAP: Record<string, string> = {
  NG: "natural_gas",
  COPPER: "copper",
  WTI: "crude_oil",
  BRENT: "brent_crude_oil",
};

const METAL_MAP: Record<string, string> = {
  XAU: "gold",
  XAG: "silver",
  XPT: "platinum",
  XPD: "palladium",
};

// Fallback static prices (last resort)
const FALLBACK_PRICES: Record<string, number> = {
  NG: 3.50,
  COPPER: 4.25,
  WTI: 72.00,
  BRENT: 76.00,
  XAU: 2650.00,
  XAG: 31.00,
  XPT: 1020.00,
  XPD: 1050.00,
};

async function fetchFromTwelveData(symbol: string, apiKey: string): Promise<number | null> {
  const tdSymbol = TWELVE_DATA_MAP[symbol];
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

async function fetchFromOmkar(commodityName: string, apiKey: string): Promise<number | null> {
  try {
    const resp = await fetch(
      `https://commodity-price-api.omkar.cloud/commodity-price?name=${commodityName}`,
      { headers: { "API-Key": apiKey } }
    );
    if (!resp.ok) {
      const body = await resp.text();
      console.error(`Omkar API error [${resp.status}]: ${body}`);
      return null;
    }
    const data = await resp.json();
    const price = data?.price_usd;
    if (price == null || isNaN(Number(price))) return null;
    return Number(price);
  } catch (e) {
    console.error("Omkar fetch error:", e);
    return null;
  }
}

async function fetchMetalPrice(asset: string, apiKey?: string): Promise<number | null> {
  const metalName = METAL_MAP[asset];
  if (!metalName) return null;
  const key = apiKey || "demo";
  try {
    const resp = await fetch(`https://api.metals.dev/v1/latest?api_key=${key}&currency=USD&unit=toz`);
    if (!resp.ok) {
      console.error(`metals.dev error [${resp.status}]`);
      return null;
    }
    const data = await resp.json();
    return data?.metals?.[metalName] ?? null;
  } catch (e) {
    console.error("metals.dev fetch error:", e);
    return null;
  }
}

// Forex via ExchangeRate-API
async function fetchForexFromExchangeRateApi(asset: string, apiKey: string): Promise<number | null> {
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

// Forex via Frankfurter (free, no key)
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

// DB cache helpers
async function getDbCachedPrice(supabase: any, asset: string): Promise<number | null> {
  try {
    const { data } = await supabase
      .from("commodity_price_cache")
      .select("price, updated_at")
      .eq("asset", asset)
      .maybeSingle();
    if (!data) return null;
    const age = Date.now() - new Date(data.updated_at).getTime();
    if (age > 3600_000) return null; // Accept if < 1 hour old
    return data.price;
  } catch {
    return null;
  }
}

async function setDbCachedPrice(supabase: any, asset: string, price: number) {
  try {
    await supabase
      .from("commodity_price_cache")
      .upsert({ asset, price, updated_at: new Date().toISOString() }, { onConflict: "asset" });
  } catch {
    // non-critical
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const asset = body?.asset;
    const isForex = body?.type === "forex";
    const preferredProvider = body?.provider; // "twelve_data" or "exchangerate"

    if (!asset || typeof asset !== "string") {
      return new Response(JSON.stringify({ error: "Missing asset parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedAsset = asset.toUpperCase();

    // ── FOREX HANDLING ──
    if (isForex || normalizedAsset.includes("/")) {
      // Check in-memory cache
      const cached = cache.get(`forex:${normalizedAsset}`);
      if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
        return new Response(JSON.stringify({ price: cached.price, cached: true, source: "memory" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let price: number | null = null;

      // Try ExchangeRate-API first
      const exchangeRateKey = Deno.env.get("EXCHANGERATE_API_KEY");
      if (exchangeRateKey) {
        price = await fetchForexFromExchangeRateApi(normalizedAsset, exchangeRateKey);
      }

      // Fallback to Frankfurter
      if (price == null) {
        price = await fetchForexFromFrankfurter(normalizedAsset);
      }

      // DB cache fallback
      if (price == null) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, serviceKey);
        price = await getDbCachedPrice(supabase, `forex:${normalizedAsset}`);
        if (price != null) {
          cache.set(`forex:${normalizedAsset}`, { price, fetchedAt: Date.now() });
          return new Response(JSON.stringify({ price, cached: true, source: "db_cache" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      if (price == null) {
        return new Response(JSON.stringify({ error: "No forex price available" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      cache.set(`forex:${normalizedAsset}`, { price, fetchedAt: Date.now() });

      // Persist to DB
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, serviceKey);
        await setDbCachedPrice(supabase, `forex:${normalizedAsset}`, price);
      } catch {}

      return new Response(JSON.stringify({ price, source: "exchange_rate_api" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── CRYPTO HANDLING (Binance → CoinGecko → Twelve Data) ──
    if (body?.type === "crypto") {
      // 1. Binance spot (free, no key)
      try {
        const resp = await fetch(
          `https://api.binance.com/api/v3/ticker/price?symbol=${normalizedAsset}USDT`
        );
        if (resp.ok) {
          const data = await resp.json();
          const price = parseFloat(data?.price);
          if (Number.isFinite(price)) {
            return new Response(JSON.stringify({ price, source: "binance" }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      } catch {}

      // 2. CoinGecko fallback (free, no key)
      const CG_IDS: Record<string, string> = {
        BTC: "bitcoin", ETH: "ethereum", SOL: "solana", BNB: "binancecoin",
        XRP: "ripple", DOGE: "dogecoin", ADA: "cardano", AVAX: "avalanche-2",
        MATIC: "matic-network", LTC: "litecoin", DOT: "polkadot", LINK: "chainlink",
        TRX: "tron", TON: "the-open-network", SHIB: "shiba-inu", PEPE: "pepe",
      };
      const cgId = CG_IDS[normalizedAsset];
      if (cgId) {
        try {
          const resp = await fetch(
            `https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=usd`
          );
          if (resp.ok) {
            const data = await resp.json();
            const price = parseFloat(data?.[cgId]?.usd);
            if (Number.isFinite(price)) {
              return new Response(JSON.stringify({ price, source: "coingecko" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          }
        } catch {}
      }

      // 3. Twelve Data (optional key)
      const twelveDataKey = Deno.env.get("TWELVE_DATA_API_KEY");
      if (twelveDataKey) {
        try {
          const resp = await fetch(
            `https://api.twelvedata.com/price?symbol=${normalizedAsset}/USD&apikey=${twelveDataKey}`
          );
          if (resp.ok) {
            const data = await resp.json();
            const price = parseFloat(data?.price);
            if (Number.isFinite(price)) {
              return new Response(JSON.stringify({ price, source: "twelve_data_crypto" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          }
        } catch {}
      }

      return new Response(JSON.stringify({ error: "Crypto price unavailable" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // ── COMMODITY HANDLING ──
    if (!TWELVE_DATA_MAP[normalizedAsset] && !METAL_MAP[normalizedAsset]) {
      return new Response(JSON.stringify({ error: `Unsupported asset: ${asset}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Check in-memory cache
    const cached = cache.get(normalizedAsset);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      return new Response(JSON.stringify({ price: cached.price, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let price: number | null = null;
    const metalsDevKey = Deno.env.get("METALS_DEV_API_KEY");

    // 2. For XAU (Gold): metals.dev is ALWAYS primary
    if (normalizedAsset === "XAU" && metalsDevKey) {
      price = await fetchMetalPrice(normalizedAsset, metalsDevKey);
      if (price !== null) {
        cache.set(normalizedAsset, { price, fetchedAt: Date.now() });
        try {
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          const supabase = createClient(supabaseUrl, serviceKey);
          await setDbCachedPrice(supabase, normalizedAsset, price);
        } catch {}
        return new Response(JSON.stringify({ price, source: "metals_dev" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.log(`metals.dev failed for XAU, trying fallbacks`);
    }

    // 2b. For other precious metals (XAG, XPT, XPD): metals.dev is also preferred
    if (normalizedAsset !== "XAU" && METAL_MAP[normalizedAsset]) {
      price = await fetchMetalPrice(normalizedAsset, metalsDevKey || undefined);
      if (price !== null) {
        cache.set(normalizedAsset, { price, fetchedAt: Date.now() });
        try {
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          const supabase = createClient(supabaseUrl, serviceKey);
          await setDbCachedPrice(supabase, normalizedAsset, price);
        } catch {}
        return new Response(JSON.stringify({ price, source: "metals_dev" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.log(`metals.dev failed for ${normalizedAsset}, trying fallbacks`);
    }

    // 3. Try Twelve Data (primary for non-metals, fallback for metals)
    const twelveDataKey = Deno.env.get("TWELVE_DATA_API_KEY");
    if (twelveDataKey) {
      price = await fetchFromTwelveData(normalizedAsset, twelveDataKey);
      if (price !== null) {
        cache.set(normalizedAsset, { price, fetchedAt: Date.now() });
        try {
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          const supabase = createClient(supabaseUrl, serviceKey);
          await setDbCachedPrice(supabase, normalizedAsset, price);
        } catch {}
        return new Response(JSON.stringify({ price, source: "twelve_data" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.log(`Twelve Data failed for ${normalizedAsset}, trying fallback`);
    }

    // 4. Try Omkar API for energy/base metals
    if (price == null) {
      const omkarKey = Deno.env.get("OMKAR_COMMODITY_API_KEY");
      const omkarName = OMKAR_MAP[normalizedAsset];
      if (omkarKey && omkarName) {
        price = await fetchFromOmkar(omkarName, omkarKey);
      }
    }

    // 5. If APIs failed, try DB cache
    if (price == null) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, serviceKey);
      price = await getDbCachedPrice(supabase, normalizedAsset);
      if (price != null) {
        cache.set(normalizedAsset, { price, fetchedAt: Date.now() });
        return new Response(JSON.stringify({ price, cached: true, source: "db_cache" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 6. Last resort: static fallback
    if (price == null) {
      price = FALLBACK_PRICES[normalizedAsset] ?? null;
      if (price != null) {
        cache.set(normalizedAsset, { price, fetchedAt: Date.now() });
        return new Response(JSON.stringify({ price, cached: true, source: "fallback" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (price == null) {
      return new Response(JSON.stringify({ error: "No price available" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cache the result
    cache.set(normalizedAsset, { price, fetchedAt: Date.now() });

    // Persist to DB
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, serviceKey);
      await setDbCachedPrice(supabase, normalizedAsset, price);
    } catch {}

    return new Response(JSON.stringify({ price, source: "fallback_chain" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("commodity-price error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
