import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyCronSecret } from "../_shared/cronAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// All non-crypto QT assets that need server-side price fetching
const COMMODITY_ASSETS = ["XAU", "XAG", "XPT", "XPD", "NG", "COPPER", "WTI", "BRENT"];
const FOREX_ASSETS = ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CHF", "USD/CAD", "NZD/USD", "EUR/GBP"];

// Twelve Data symbol map
const TWELVE_DATA_MAP: Record<string, string> = {
  NG: "NG", COPPER: "COPPER", WTI: "WTI", BRENT: "BRENT",
  XAU: "XAU/USD", XAG: "XAG/USD", XPT: "XPT/USD", XPD: "XPD/USD",
};

const METAL_MAP: Record<string, string> = {
  XAU: "gold", XAG: "silver", XPT: "platinum", XPD: "palladium",
};

const OMKAR_MAP: Record<string, string> = {
  NG: "natural_gas", COPPER: "copper", WTI: "crude_oil", BRENT: "brent_crude_oil",
};

// ── Fetch helpers (same logic as commodity-price but batched) ──

async function fetchTwelveDataBatch(symbols: string[], apiKey: string): Promise<Record<string, number>> {
  const results: Record<string, number> = {};
  const tdSymbols = symbols
    .filter(s => TWELVE_DATA_MAP[s])
    .map(s => TWELVE_DATA_MAP[s]);
  
  if (tdSymbols.length === 0) return results;

  try {
    // Twelve Data supports comma-separated symbols for batch
    const resp = await fetch(
      `https://api.twelvedata.com/price?symbol=${tdSymbols.join(",")}&apikey=${apiKey}`
    );
    if (!resp.ok) return results;
    const data = await resp.json();

    // Single symbol returns { price }, multiple returns { SYMBOL: { price } }
    if (tdSymbols.length === 1) {
      const price = parseFloat(data.price);
      if (!isNaN(price)) {
        const origSymbol = symbols.find(s => TWELVE_DATA_MAP[s] === tdSymbols[0]);
        if (origSymbol) results[origSymbol] = price;
      }
    } else {
      for (const [tdSym, val] of Object.entries(data)) {
        const price = parseFloat((val as any)?.price);
        if (!isNaN(price)) {
          const origSymbol = symbols.find(s => TWELVE_DATA_MAP[s] === tdSym);
          if (origSymbol) results[origSymbol] = price;
        }
      }
    }
  } catch (e) {
    console.error("Twelve Data batch error:", e);
  }
  return results;
}

async function fetchMetalPrices(apiKey?: string): Promise<Record<string, number>> {
  const results: Record<string, number> = {};
  try {
    const key = apiKey || "demo";
    const resp = await fetch(`https://api.metals.dev/v1/latest?api_key=${key}&currency=USD&unit=toz`);
    if (!resp.ok) return results;
    const data = await resp.json();
    for (const [sym, metalName] of Object.entries(METAL_MAP)) {
      const price = data?.metals?.[metalName];
      if (price != null) results[sym] = price;
    }
  } catch {}
  return results;
}

async function fetchOmkarPrice(commodityName: string, apiKey: string): Promise<number | null> {
  try {
    const resp = await fetch(
      `https://commodity-price-api.omkar.cloud/commodity-price?name=${commodityName}`,
      { headers: { "API-Key": apiKey } }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    const price = data?.price_usd;
    return price != null && !isNaN(Number(price)) ? Number(price) : null;
  } catch {
    return null;
  }
}

async function fetchForexBatch(pairs: string[], apiKey: string): Promise<Record<string, number>> {
  const results: Record<string, number> = {};
  
  // ExchangeRate-API doesn't support batch, but we can fetch per base currency
  // Group by base currency to minimize calls
  const baseGroups = new Map<string, string[]>();
  for (const pair of pairs) {
    const [base] = pair.split("/");
    if (!baseGroups.has(base)) baseGroups.set(base, []);
    baseGroups.get(base)!.push(pair);
  }

  const fetches = Array.from(baseGroups.entries()).map(async ([base, pairsForBase]) => {
    try {
      const resp = await fetch(`https://v6.exchangerate-api.com/v6/${apiKey}/latest/${base}`);
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.result !== "success") return;
      for (const pair of pairsForBase) {
        const [, quote] = pair.split("/");
        const rate = data.conversion_rates?.[quote];
        if (rate != null) results[pair] = rate;
      }
    } catch {}
  });

  await Promise.allSettled(fetches);
  return results;
}

async function fetchForexFrankfurterBatch(pairs: string[]): Promise<Record<string, number>> {
  const results: Record<string, number> = {};
  const baseGroups = new Map<string, string[]>();
  for (const pair of pairs) {
    const [base] = pair.split("/");
    if (!baseGroups.has(base)) baseGroups.set(base, []);
    baseGroups.get(base)!.push(pair);
  }

  const fetches = Array.from(baseGroups.entries()).map(async ([base, pairsForBase]) => {
    const quotes = pairsForBase.map(p => p.split("/")[1]);
    try {
      const resp = await fetch(`https://api.frankfurter.app/latest?from=${base}&to=${quotes.join(",")}`);
      if (!resp.ok) return;
      const data = await resp.json();
      for (const pair of pairsForBase) {
        const [, quote] = pair.split("/");
        const rate = data?.rates?.[quote];
        if (rate != null) results[pair] = rate;
      }
    } catch {}
  });

  await Promise.allSettled(fetches);
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const cronCheck = verifyCronSecret(req, { functionName: "qt-price-broadcaster", corsHeaders });
  if (!cronCheck.ok) return cronCheck.response!;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Check which non-crypto assets are enabled for QT
    const { data: settings } = await supabase
      .from("commission_settings")
      .select("qt_enabled_assets, qt_disabled_assets")
      .limit(1)
      .maybeSingle();

    const enabledSet = settings?.qt_enabled_assets
      ? new Set(settings.qt_enabled_assets.split(",").filter(Boolean))
      : new Set([...COMMODITY_ASSETS, ...FOREX_ASSETS]);

    const disabledSet = settings?.qt_disabled_assets
      ? new Set(settings.qt_disabled_assets.split(",").filter(Boolean))
      : new Set<string>();

    const activeCommodities = COMMODITY_ASSETS.filter(s => enabledSet.has(s) && !disabledSet.has(s));
    const activeForex = FOREX_ASSETS.filter(s => enabledSet.has(s) && !disabledSet.has(s));

    if (activeCommodities.length === 0 && activeForex.length === 0) {
      return new Response(JSON.stringify({ message: "No active non-crypto assets" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prices: Record<string, number> = {};
    const now = new Date().toISOString();

    // ── Fetch commodities ──
    if (activeCommodities.length > 0) {
      // 1. metals.dev is PRIMARY for gold (XAU) and other precious metals
      const metalsDevKey = Deno.env.get("METALS_DEV_API_KEY");
      const preciousMetals = activeCommodities.filter(s => METAL_MAP[s]);
      if (preciousMetals.length > 0) {
        const metalPrices = await fetchMetalPrices(metalsDevKey || undefined);
        for (const s of preciousMetals) {
          if (metalPrices[s]) prices[s] = metalPrices[s];
        }
      }

      // 2. Try Twelve Data batch for remaining commodities (and as fallback for metals)
      const twelveDataKey = Deno.env.get("TWELVE_DATA_API_KEY");
      const missingAfterMetals = activeCommodities.filter(s => !prices[s]);
      if (twelveDataKey && missingAfterMetals.length > 0) {
        const tdPrices = await fetchTwelveDataBatch(missingAfterMetals, twelveDataKey);
        Object.assign(prices, tdPrices);
      }

      // 3. Fill remaining gaps with Omkar
      const omkarKey = Deno.env.get("OMKAR_COMMODITY_API_KEY");
      if (omkarKey) {
        const missingOmkar = activeCommodities.filter(s => !prices[s] && OMKAR_MAP[s]);
        for (const s of missingOmkar) {
          const p = await fetchOmkarPrice(OMKAR_MAP[s], omkarKey);
          if (p != null) prices[s] = p;
        }
      }
    }

    // ── Fetch forex ──
    if (activeForex.length > 0) {
      const exchangeRateKey = Deno.env.get("EXCHANGERATE_API_KEY");
      if (exchangeRateKey) {
        const fxPrices = await fetchForexBatch(activeForex, exchangeRateKey);
        // Prefix forex keys for DB storage
        for (const [pair, price] of Object.entries(fxPrices)) {
          prices[`forex:${pair}`] = price;
        }
      }

      // Fill gaps with Frankfurter (free)
      const missingForex = activeForex.filter(s => !prices[`forex:${s}`]);
      if (missingForex.length > 0) {
        const ffPrices = await fetchForexFrankfurterBatch(missingForex);
        for (const [pair, price] of Object.entries(ffPrices)) {
          prices[`forex:${pair}`] = price;
        }
      }
    }

    // ── Upsert all prices into commodity_price_cache ──
    const upsertRows = Object.entries(prices).map(([asset, price]) => ({
      asset,
      price,
      updated_at: now,
    }));

    if (upsertRows.length > 0) {
      const { error } = await supabase
        .from("commodity_price_cache")
        .upsert(upsertRows, { onConflict: "asset" });

      if (error) {
        console.error("Upsert error:", error);
      }
    }

    console.log(`Broadcast ${upsertRows.length} prices: ${Object.keys(prices).join(", ")}`);

    return new Response(
      JSON.stringify({
        broadcast: upsertRows.length,
        assets: Object.keys(prices),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("qt-price-broadcaster error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
