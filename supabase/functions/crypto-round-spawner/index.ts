// Spawns the next "Up or Down" crypto round per (asset, duration) pair
// whenever the active round for that pair has ended. Resolution is handled
// by the existing `check-auto-resolve` cron via the markets table fields.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Price fetch (mirrors check-auto-resolve fallbacks) ──────────────────────
const COINGECKO: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", BNB: "binancecoin",
  SOL: "solana", XRP: "ripple",
};
const BINANCE: Record<string, string> = {
  BTC: "BTCUSDT", ETH: "ETHUSDT", BNB: "BNBUSDT",
  SOL: "SOLUSDT", XRP: "XRPUSDT",
};

async function fetchPrice(asset: string): Promise<number | null> {
  const a = asset.toUpperCase();
  // Binance first (faster, free, no key)
  try {
    const sym = BINANCE[a];
    if (sym) {
      const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${sym}`);
      if (r.ok) {
        const d = await r.json();
        const p = parseFloat(d.price);
        if (!isNaN(p)) return p;
      }
    }
  } catch (_) { /* fall through */ }
  // CoinGecko fallback
  try {
    const id = COINGECKO[a];
    if (id) {
      const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`);
      if (r.ok) {
        const d = await r.json();
        return d[id]?.usd ?? null;
      }
    }
  } catch (_) { /* ignore */ }
  return null;
}

// ─── Title formatting ────────────────────────────────────────────────────────
const ASSET_NAME: Record<string, string> = {
  BTC: "Bitcoin", ETH: "Ethereum", SOL: "Solana", BNB: "BNB", XRP: "XRP",
};

function durationLabel(min: number): string {
  if (min < 60) return `${min} minutes`;
  if (min < 1440) return `${min / 60} hour${min === 60 ? "" : "s"}`;
  return min === 1440 ? "1 day" : `${min / 1440} days`;
}

function buildTitle(asset: string, durationMin: number): string {
  const name = ASSET_NAME[asset] ?? asset;
  return `${name} Up or Down — ${durationLabel(durationMin)}?`;
}

function buildDescription(asset: string, durationMin: number): string {
  const name = ASSET_NAME[asset] ?? asset;
  return `This market resolves to "Yes" if ${name} (${asset}/USD) closes higher than or equal to its opening price after ${durationLabel(durationMin)}. Otherwise it resolves to "No". Resolution source: Binance spot price with CoinGecko fallback.`;
}

// ─── Asset image URLs (use CoinGecko CDN) ────────────────────────────────────
const ASSET_IMAGES: Record<string, string> = {
  BTC: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png",
  ETH: "https://assets.coingecko.com/coins/images/279/large/ethereum.png",
  BNB: "https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png",
  SOL: "https://assets.coingecko.com/coins/images/4128/large/solana.png",
  XRP: "https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // ── Parse body for optional targeted/manual spawn ────────────────────────
    let body: {
      source?: string;
      asset?: string;
      duration_minutes?: number;
      force?: boolean;
      actor_id?: string;
    } = {};
    try {
      if (req.method === "POST") body = await req.json();
    } catch (_) { /* no body */ }
    const source = body.source ?? "cron";
    const targetAsset = body.asset?.toUpperCase();
    const targetDur = body.duration_minutes;
    const force = body.force === true;

    // ── Global kill-switch (feature_toggles.crypto_auto_spawn) ──
    // When OFF, cron-driven spawns are blocked but admins can still force a
    // round via the Spawn Now buttons (force=true).
    if (source === "cron" && !force) {
      const { data: toggle } = await admin
        .from("feature_toggles")
        .select("enabled")
        .eq("feature_key", "crypto_auto_spawn")
        .maybeSingle();
      if (toggle && toggle.enabled === false) {
        return new Response(
          JSON.stringify({ message: "crypto_auto_spawn disabled", spawned: 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Resolve actor (admin who triggered) when JWT supplied
    let actorId: string | null = body.actor_id ?? null;
    if (!actorId) {
      const authHeader = req.headers.get("Authorization");
      if (authHeader?.startsWith("Bearer ")) {
        try {
          const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
            global: { headers: { Authorization: authHeader } },
          });
          const { data } = await userClient.auth.getUser();
          actorId = data.user?.id ?? null;
        } catch (_) { /* anon */ }
      }
    }

    const writeLog = async (entry: {
      asset?: string | null;
      duration_minutes?: number | null;
      market_id?: string | null;
      status: string;
      message?: string;
      open_price?: number | null;
    }) => {
      await admin.from("crypto_round_spawn_log").insert({
        asset: entry.asset ?? null,
        duration_minutes: entry.duration_minutes ?? null,
        market_id: entry.market_id ?? null,
        source,
        actor_id: actorId,
        status: entry.status,
        message: entry.message ?? null,
        open_price: entry.open_price ?? null,
      });
    };

    // 1. Resolve a system creator (super_admin)
    const { data: saRole } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("role", "super_admin")
      .limit(1)
      .maybeSingle();

    if (!saRole) {
      await writeLog({ asset: targetAsset, duration_minutes: targetDur, status: "error", message: "No super_admin user configured" });
      return new Response(JSON.stringify({ error: "No super_admin user configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const creatorId = saRole.user_id as string;

    const { data: creatorProfile } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", creatorId)
      .maybeSingle();
    const creatorName = creatorProfile?.display_name ?? "OPOLL";

    // 2. Load pairs (filter to the targeted one if specified)
    let cfgQuery = admin
      .from("crypto_round_config")
      .select("asset, duration_minutes, initial_liquidity_usd, category, enabled");

    if (targetAsset && targetDur) {
      cfgQuery = cfgQuery.eq("asset", targetAsset).eq("duration_minutes", targetDur);
    } else {
      cfgQuery = cfgQuery.eq("enabled", true);
    }

    const { data: configs, error: cfgErr } = await cfgQuery;

    if (cfgErr) {
      await writeLog({ asset: targetAsset, duration_minutes: targetDur, status: "error", message: cfgErr.message });
      return new Response(JSON.stringify({ error: cfgErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!configs || configs.length === 0) {
      return new Response(JSON.stringify({ message: "No matching pairs", spawned: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. For each pair, find the most recent round; if it has ended (or force), spawn the next
    const now = new Date();
    let spawned = 0;
    const errors: string[] = [];
    const priceCache: Record<string, number | null> = {};

    for (const cfg of configs) {
      const asset = cfg.asset as string;
      const dur = cfg.duration_minutes as number;
      const liquidity = Number(cfg.initial_liquidity_usd ?? 500);

      // Latest round for this pair
      const { data: latest } = await admin
        .from("crypto_round_meta")
        .select("end_time")
        .eq("asset", asset)
        .eq("duration_minutes", dur)
        .order("end_time", { ascending: false })
        .limit(1)
        .maybeSingle();

      const latestEnd = latest ? new Date(latest.end_time as string) : null;
      // Only spawn if the latest round has already ended (or doesn't exist), unless force
      if (!force && latestEnd && latestEnd > now) {
        await writeLog({
          asset, duration_minutes: dur, status: "skipped",
          message: `Active round still running until ${latestEnd.toISOString()}`,
        });
        continue;
      }

      // Fetch open price
      if (!(asset in priceCache)) {
        priceCache[asset] = await fetchPrice(asset);
      }
      const openPrice = priceCache[asset];
      if (openPrice === null) {
        errors.push(`No price for ${asset}`);
        await writeLog({ asset, duration_minutes: dur, status: "error", message: "No price feed available" });
        continue;
      }

      const start = new Date(now.getTime());
      const end = new Date(start.getTime() + dur * 60_000);

      const { data: market, error: mErr } = await admin
        .from("markets")
        .insert({
          title: buildTitle(asset, dur),
          description: buildDescription(asset, dur),
          category: cfg.category ?? "Crypto",
          end_date: end.toISOString().split("T")[0],
          market_type: "binary",
          image_url: ASSET_IMAGES[asset] ?? null,
          resolution_source: "Binance / CoinGecko",
          creator_wallet: creatorId,
          creator_name: creatorName,
          initial_liquidity: liquidity,
          liquidity,
          liquidity_verified: true,
          status: "active",
          yes_price: 0.5,
          no_price: 0.5,
          is_crypto_round: true,
          auto_resolve: true,
          auto_resolve_asset: asset,
          auto_resolve_target_price: openPrice,
          auto_resolve_operator: "at_or_above",
          auto_resolve_deadline: end.toISOString(),
        })
        .select("id")
        .single();

      if (mErr || !market) {
        errors.push(`Insert market ${asset}/${dur}m failed: ${mErr?.message}`);
        await writeLog({ asset, duration_minutes: dur, status: "error", message: `Market insert failed: ${mErr?.message}`, open_price: openPrice });
        continue;
      }

      const { error: metaErr } = await admin
        .from("crypto_round_meta")
        .insert({
          market_id: market.id,
          asset,
          duration_minutes: dur,
          open_price: openPrice,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
        });

      if (metaErr) {
        await admin.from("markets").delete().eq("id", market.id);
        errors.push(`Insert meta ${asset}/${dur}m failed: ${metaErr.message}`);
        await writeLog({ asset, duration_minutes: dur, status: "error", message: `Meta insert failed: ${metaErr.message}`, open_price: openPrice });
        continue;
      }

      spawned++;
      await writeLog({
        asset, duration_minutes: dur, market_id: market.id,
        status: "success", open_price: openPrice,
        message: `Spawned ${asset} ${dur}m round @ $${openPrice}`,
      });
    }

    return new Response(
      JSON.stringify({ spawned, errors, checked: configs.length, source }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("crypto-round-spawner error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
