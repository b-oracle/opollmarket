import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// In-memory cache to reduce API calls (5000/month free tier)
const cache = new Map<string, { price: number; fetchedAt: number }>();
const CACHE_TTL = 30_000; // 30 seconds

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

    // Map our symbols to Omkar API commodity names
    const ASSET_MAP: Record<string, string> = {
      NG: "natural_gas",
      COPPER: "copper",
      WTI: "crude_oil",
      BRENT: "brent_crude_oil",
    };

    const commodityName = ASSET_MAP[asset.toUpperCase()];
    if (!commodityName) {
      return new Response(JSON.stringify({ error: `Unsupported asset: ${asset}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check cache
    const cached = cache.get(commodityName);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      return new Response(JSON.stringify({ price: cached.price, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("OMKAR_COMMODITY_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "OMKAR_COMMODITY_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resp = await fetch(
      `https://commodity-price-api.omkar.cloud/commodity-price?name=${commodityName}`,
      { headers: { "API-Key": apiKey } }
    );

    if (!resp.ok) {
      const body = await resp.text();
      console.error(`Omkar API error [${resp.status}]: ${body}`);
      return new Response(JSON.stringify({ error: "Upstream API error" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const price = data?.price_usd;

    if (price == null || isNaN(Number(price))) {
      return new Response(JSON.stringify({ error: "Invalid price data" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cache the result
    cache.set(commodityName, { price: Number(price), fetchedAt: Date.now() });

    return new Response(JSON.stringify({ price: Number(price), commodity: data?.commodity_name }), {
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
