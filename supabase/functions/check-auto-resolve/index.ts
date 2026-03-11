import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

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

// Commodity symbols — fetched via Frankfurter (metals) or fallback
const COMMODITY_SYMBOLS = new Set(["XAU", "XAG", "XPT", "XPD", "BRENT", "WTI", "NG", "COPPER"]);

// Forex pairs
const FOREX_PAIRS = new Set(["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CAD", "USD/CHF", "NZD/USD", "EUR/GBP"]);

function getAssetType(asset: string): "crypto" | "commodity" | "forex" {
  if (FOREX_PAIRS.has(asset)) return "forex";
  if (COMMODITY_SYMBOLS.has(asset)) return "commodity";
  return "crypto";
}

async function fetchCryptoPrice(asset: string): Promise<number | null> {
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

async function fetchCommodityPrice(symbol: string): Promise<number | null> {
  try {
    // Use metals.dev free API for precious metals
    if (["XAU", "XAG", "XPT", "XPD"].includes(symbol)) {
      const metalMap: Record<string, string> = { XAU: "gold", XAG: "silver", XPT: "platinum", XPD: "palladium" };
      const metalName = metalMap[symbol];
      if (!metalName) return null;
      
      const resp = await fetch(`https://api.metals.dev/v1/latest?api_key=demo&currency=USD&unit=toz`);
      if (!resp.ok) return null;
      const data = await resp.json();
      return data?.metals?.[metalName] ?? null;
    }
    
    // For oil and other commodities, use a proxy via exchangerate
    // Fallback: return null (manual resolution needed)
    return null;
  } catch {
    return null;
  }
}

async function fetchForexRate(pair: string): Promise<number | null> {
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

async function fetchPrice(asset: string): Promise<number | null> {
  const assetType = getAssetType(asset);
  switch (assetType) {
    case "crypto": return fetchCryptoPrice(asset);
    case "commodity": return fetchCommodityPrice(asset);
    case "forex": return fetchForexRate(asset);
  }
}

function conditionMet(
  currentPrice: number,
  targetPrice: number,
  operator: string
): boolean {
  switch (operator) {
    case "above":
      return currentPrice > targetPrice;
    case "below":
      return currentPrice < targetPrice;
    case "at_or_above":
      return currentPrice >= targetPrice;
    case "at_or_below":
      return currentPrice <= targetPrice;
    default:
      return false;
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
      .eq("status", "active")
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

      // Pay out winners
      for (const pos of winningPositions || []) {
        const payout = pos.shares;

        const { data: balance } = await adminClient
          .from("balances")
          .select("amount")
          .eq("user_id", pos.user_id)
          .single();

        if (balance) {
          await adminClient
            .from("balances")
            .update({
              amount: balance.amount + payout,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", pos.user_id);
        }

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

      // Determine asset display label
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
        const title = won
          ? "You Won! 🎉 Market Auto-Resolved"
          : "Market Auto-Resolved";
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
      resolvedCount++;
    }

    // Piggyback: run bulk verification sweep to catch stale badges
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
        verification_sweep: verificationResult,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("check-auto-resolve error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});