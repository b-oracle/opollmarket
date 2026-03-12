import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// In-memory cache to reduce API calls
const cache = new Map<string, { price: number; fetchedAt: number }>();
const CACHE_TTL = 120_000; // 2 minutes

// Map our symbols to Twelve Data symbols (primary) and Omkar names (fallback)
const TWELVE_DATA_MAP: Record<string, string> = {
  NG: "NG",
  COPPER: "COPPER",
  WTI: "WTI",
  BRENT: "BRENT",
};

const OMKAR_MAP: Record<string, string> = {
  NG: "natural_gas",
  COPPER: "copper",
  WTI: "crude_oil",
  BRENT: "brent_crude_oil",
};

// Fallback static prices (last resort)
const FALLBACK_PRICES: Record<string, number> = {
  NG: 3.50,
  COPPER: 4.25,
  WTI: 72.00,
  BRENT: 76.00,
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

// Store last known good price in DB for cross-instance persistence
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
    const { asset } = await req.json();
    if (!asset || typeof asset !== "string") {
      return new Response(JSON.stringify({ error: "Missing asset parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedAsset = asset.toUpperCase();
    if (!TWELVE_DATA_MAP[normalizedAsset]) {
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

    // 2. Try Twelve Data (primary)
    const twelveDataKey = Deno.env.get("TWELVE_DATA_API_KEY");
    if (twelveDataKey) {
      price = await fetchFromTwelveData(normalizedAsset, twelveDataKey);
      if (price !== null) {
        cache.set(normalizedAsset, { price, fetchedAt: Date.now() });

        // Persist to DB asynchronously
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
      console.log(`Twelve Data failed for ${normalizedAsset}, trying Omkar fallback`);
    }

    // 3. Try Omkar API (fallback)
    const omkarKey = Deno.env.get("OMKAR_COMMODITY_API_KEY");
    const omkarName = OMKAR_MAP[normalizedAsset];
    if (omkarKey && omkarName) {
      price = await fetchFromOmkar(omkarName, omkarKey);
    }

    // 4. If both APIs failed, try DB cache
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

    // 5. Last resort: static fallback
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

    return new Response(JSON.stringify({ price, source: "omkar" }), {
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
