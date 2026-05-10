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

    // ── Master kill-switch (feature_toggles.crypto_up_down) ──
    // When the entire Crypto Up & Down feature is OFF, block ALL spawns
    // including admin-forced ones.
    {
      const { data: masterToggle } = await admin
        .from("feature_toggles")
        .select("enabled")
        .eq("feature_key", "crypto_up_down")
        .maybeSingle();
      if (masterToggle && masterToggle.enabled === false) {
        return new Response(
          JSON.stringify({ message: "crypto_up_down feature disabled", spawned: 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // ── Cron auto-spawn switch (feature_toggles.crypto_auto_spawn) ──
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

    // Crypto Up/Down rounds are a system preset feature, not a user-created market.
    // We attribute the row to the super_admin user for RLS/payout integrity, but
    // surface "System" as the creator name everywhere it renders.
    const creatorName = "System";

    // 2. Load pairs (filter to the targeted one if specified)
    let cfgQuery = admin
      .from("crypto_round_config")
      .select("asset, duration_minutes, category, enabled");

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
    // Pin "now" to the database clock so the spawn boundary and the
    // resulting round's start/end timestamps are consistent with the
    // deadlines the resolver evaluates against. Edge runtimes can drift
    // several seconds vs Postgres, which would otherwise either skip a
    // spawn (latestEnd > now is wrongly true) or shorten the new round.
    const { data: dbNowRow, error: dbNowErr } = await admin.rpc("db_now");
    if (dbNowErr) {
      console.warn("db_now() failed, using runtime clock:", dbNowErr);
    }
    const now = dbNowRow ? new Date(dbNowRow as string) : new Date();
    let spawned = 0;
    const errors: string[] = [];
    const priceCache: Record<string, number | null> = {};

    for (const cfg of configs) {
      const asset = cfg.asset as string;
      const dur = cfg.duration_minutes as number;
      // Crypto rounds always start at $0 liquidity — losers fund winners.

      // Latest round for this pair
      const { data: latest } = await admin
        .from("crypto_round_meta")
        .select("end_time, market_id")
        .eq("asset", asset)
        .eq("duration_minutes", dur)
        .order("end_time", { ascending: false })
        .limit(1)
        .maybeSingle();

      const latestEnd = latest ? new Date(latest.end_time as string) : null;
      // Predecessor key — the deadline of the round we are following.
      // Combined with the unique index on (asset, duration, predecessor_end_time)
      // this guarantees at most one new round per deadline boundary, even if
      // two cron invocations race.
      const predecessorEnd = latestEnd ? latestEnd.toISOString() : "1970-01-01T00:00:00.000Z";

      // Only spawn if the latest round has already ended (or doesn't exist), unless force.
      // We deliberately do NOT log "skipped" rows here — the cron runs every minute,
      // which floods the audit table with thousands of no-op rows per day. Only
      // spawn events and errors are kept as auditable signal.
      if (!force && latestEnd && latestEnd > now) {
        continue;
      }

      // Wait for the previous round to finish resolving before spawning the next.
      // This prevents stacking new rounds while resolution/payout is still in flight.
      if (!force && latest?.market_id) {
        const { data: prevMarket } = await admin
          .from("markets")
          .select("status")
          .eq("id", latest.market_id as string)
          .maybeSingle();
        if (prevMarket && prevMarket.status !== "resolved") {
          continue;
        }
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
          initial_liquidity: 0,
          liquidity: 0,
          liquidity_verified: false,
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
          predecessor_end_time: predecessorEnd,
        });

      if (metaErr) {
        // Roll back the market we just inserted
        await admin.from("markets").delete().eq("id", market.id);
        // 23505 = unique_violation → another concurrent invocation already spawned
        // the round for this predecessor. Treat as a benign skip, not an error.
        const isDuplicate = (metaErr as any).code === "23505" ||
          /duplicate key|unique constraint/i.test(metaErr.message);
        if (isDuplicate) {
          await writeLog({
            asset, duration_minutes: dur, status: "skipped",
            message: `Duplicate spawn prevented for predecessor ${predecessorEnd}`,
            open_price: openPrice,
          });
          continue;
        }
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

      // ── "Next round started" push (idempotent on previous meta row) ──
      // Notify users who held a position in the previous round of this pair.
      if (latest?.market_id) {
        try {
          const { data: prevMeta } = await admin
            .from("crypto_round_meta")
            .select("notified_spawned_at")
            .eq("market_id", latest.market_id as string)
            .maybeSingle();
          if (prevMeta && !prevMeta.notified_spawned_at) {
            const { data: positions } = await admin
              .from("positions")
              .select("user_id")
              .eq("market_id", latest.market_id as string)
              .gt("shares", 0);
            const uniqueIds = Array.from(new Set((positions ?? []).map((p: any) => p.user_id as string)));
            const label = `${asset} ${dur >= 1440 ? Math.round(dur/1440)+"d" : dur >= 60 ? Math.round(dur/60)+"h" : dur+"m"}`;
            await Promise.all(uniqueIds.map((uid) =>
              admin.functions.invoke("send-push", {
                body: {
                  user_id: uid,
                  title: `🚀 New ${label} round live`,
                  body: `Open @ $${openPrice.toFixed(2)} — tap to predict UP or DOWN.`,
                  url: `/market/${market.id}`,
                },
              }).catch((e) => console.error("send-push (spawned) failed:", e))
            ));
            await admin
              .from("crypto_round_meta")
              .update({ notified_spawned_at: new Date().toISOString() })
              .eq("market_id", latest.market_id as string);
            console.log(`Spawn ${asset} ${dur}m: sent push to ${uniqueIds.length} prior participants`);
          }
        } catch (e) {
          console.error("Spawned push block failed:", e);
        }
      }
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
