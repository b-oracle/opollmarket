import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// In-memory cache to reduce API calls (5000/month free tier)
const cache = new Map<string, { price: number; fetchedAt: number }>();
const CACHE_TTL = 120_000; // 2 minutes (was 30s — more conservative to avoid quota burn)

// Map our symbols to Omkar API commodity names
const ASSET_MAP: Record<string, string> = {
  NG: "natural_gas",
  COPPER: "copper",
  WTI: "crude_oil",
  BRENT: "brent_crude_oil",
};

// Fallback: scrape-free static prices (updated periodically as a last resort)
const FALLBACK_PRICES: Record<string, number> = {
  natural_gas: 3.50,
  copper: 4.25,
  crude_oil: 72.00,
  brent_crude_oil: 76.00,
};

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

// Try CommodityPriceAPI.com (free, no key required, 60s updates)
async function fetchFromCommodityPriceApi(commodityName: string): Promise<number | null> {
  // Map Omkar names to symbols used by metals.dev / frankfurter as last resort
  // This provider doesn't exist without a key, so we skip it
  return null;
}

// Store last known good price in Supabase for cross-instance persistence
async function getDbCachedPrice(supabase: any, asset: string): Promise<number | null> {
  try {
    const { data } = await supabase
      .from("commodity_price_cache")
      .select("price, updated_at")
      .eq("asset", asset)
      .maybeSingle();
    if (!data) return null;
    // Accept DB cache if < 1 hour old
    const age = Date.now() - new Date(data.updated_at).getTime();
    if (age > 3600_000) return null;
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

    const commodityName = ASSET_MAP[asset.toUpperCase()];
    if (!commodityName) {
      return new Response(JSON.stringify({ error: `Unsupported asset: ${asset}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Check in-memory cache
    const cached = cache.get(commodityName);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      return new Response(JSON.stringify({ price: cached.price, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Try Omkar API
    const apiKey = Deno.env.get("OMKAR_COMMODITY_API_KEY");
    let price: number | null = null;

    if (apiKey) {
      price = await fetchFromOmkar(commodityName, apiKey);
    }

    // 3. If Omkar failed, try DB cache
    if (price == null) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, serviceKey);
      
      price = await getDbCachedPrice(supabase, commodityName);
      
      if (price != null) {
        cache.set(commodityName, { price, fetchedAt: Date.now() });
        return new Response(JSON.stringify({ price, cached: true, source: "db_cache" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 4. Last resort: static fallback
    if (price == null) {
      price = FALLBACK_PRICES[commodityName] ?? null;
      if (price != null) {
        cache.set(commodityName, { price, fetchedAt: Date.now() });
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

    // Cache the result in memory + DB
    cache.set(commodityName, { price, fetchedAt: Date.now() });

    // Persist to DB asynchronously
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, serviceKey);
      await setDbCachedPrice(supabase, commodityName, price);
    } catch {}

    return new Response(JSON.stringify({ price, commodity: commodityName }), {
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