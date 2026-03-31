import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SPORT_API_MAP: Record<string, { host: string; fixturePath: string }> = {
  football: { host: "v3.football.api-sports.io", fixturePath: "/fixtures" },
  basketball: { host: "v1.basketball.api-sports.io", fixturePath: "/games" },
  baseball: { host: "v1.baseball.api-sports.io", fixturePath: "/games" },
  hockey: { host: "v1.hockey.api-sports.io", fixturePath: "/games" },
  rugby: { host: "v1.rugby.api-sports.io", fixturePath: "/games" },
  handball: { host: "v1.handball.api-sports.io", fixturePath: "/games" },
  volleyball: { host: "v1.volleyball.api-sports.io", fixturePath: "/games" },
  nfl: { host: "v1.american-football.api-sports.io", fixturePath: "/games" },
};

function buildMarketTitle(homeTeam: string, awayTeam: string, league: string): string {
  return `${homeTeam} vs ${awayTeam}${league ? ` — ${league}` : ""}`;
}

function buildMarketDescription(homeTeam: string, awayTeam: string, league: string, date: string): string {
  const d = new Date(date);
  const dateStr = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  return `Who will win the match between ${homeTeam} and ${awayTeam}? ${league ? `League: ${league}. ` : ""}Scheduled for ${dateStr}. Market resolves based on the official final result.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiKey = Deno.env.get("API_FOOTBALL_KEY");
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API_FOOTBALL_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth check for manual calls
    const authHeader = req.headers.get("Authorization");
    let manualPresetId: string | null = null;
    if (authHeader) {
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        const { data: isSA } = await adminClient.rpc("has_role", { _user_id: user.id, _role: "super_admin" });
        const { data: isAdmin } = await adminClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
        if (!isSA && !isAdmin) {
          return new Response(JSON.stringify({ error: "Admin access required" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      try {
        const body = await req.json();
        manualPresetId = body?.preset_id || null;
      } catch { /* no body */ }
    }

    // Fetch presets
    let presetsQuery = adminClient.from("sports_import_presets").select("*").eq("enabled", true);
    if (manualPresetId) {
      presetsQuery = adminClient.from("sports_import_presets").select("*").eq("id", manualPresetId);
    }
    const { data: presets, error: presetsErr } = await presetsQuery;
    if (presetsErr || !presets || presets.length === 0) {
      return new Response(JSON.stringify({ message: "No active sports presets found", imported: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get super_admin as creator
    const { data: saRole } = await adminClient
      .from("user_roles")
      .select("user_id")
      .eq("role", "super_admin")
      .limit(1)
      .single();

    if (!saRole) {
      return new Response(JSON.stringify({ error: "No super_admin user found" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const creatorId = saRole.user_id;
    const { data: profile } = await adminClient.from("profiles").select("display_name").eq("id", creatorId).single();
    const creatorName = profile?.display_name || "System";

    let totalImported = 0;
    const errors: string[] = [];

    for (const preset of presets) {
      const sportConfig = SPORT_API_MAP[preset.sport_type];
      if (!sportConfig) {
        errors.push(`Unsupported sport type: ${preset.sport_type}`);
        continue;
      }

      const maxImports = preset.max_imports_per_run || 10;
      const maxEndDate = new Date();
      maxEndDate.setDate(maxEndDate.getDate() + (preset.max_days_ahead || 14));
      let presetImported = 0;

      try {
        let fixturesUrl: string;
        const headers = { "x-apisports-key": apiKey };

        if (preset.sport_type === "football") {
          // Football: use league + next parameter
          fixturesUrl = `https://${sportConfig.host}${sportConfig.fixturePath}?league=${preset.league_id}&next=${Math.min(maxImports * 2, 50)}`;
        } else {
          // Other sports: use league + season
          const currentSeason = new Date().getFullYear();
          fixturesUrl = `https://${sportConfig.host}${sportConfig.fixturePath}?league=${preset.league_id}&season=${currentSeason}`;
        }

        const resp = await fetch(fixturesUrl, { headers });
        if (!resp.ok) {
          errors.push(`API-Sports error for league ${preset.league_name}: ${resp.status}`);
          continue;
        }

        const data = await resp.json();
        if (data?.errors && Object.keys(data.errors).length > 0) {
          errors.push(`API error for ${preset.league_name}: ${JSON.stringify(data.errors)}`);
          continue;
        }

        const fixtures = data?.response || [];

        for (const fixture of fixtures) {
          if (presetImported >= maxImports) break;

          // Extract fixture data based on sport type
          let matchId: string;
          let matchDate: string;
          let homeTeam: string;
          let awayTeam: string;
          let homeLogo: string;
          let awayLogo: string;
          let leagueName: string;

          if (preset.sport_type === "football") {
            matchId = String(fixture.fixture?.id || "");
            matchDate = fixture.fixture?.date || "";
            homeTeam = fixture.teams?.home?.name || "TBD";
            awayTeam = fixture.teams?.away?.name || "TBD";
            homeLogo = fixture.teams?.home?.logo || "";
            awayLogo = fixture.teams?.away?.logo || "";
            leagueName = fixture.league?.name || preset.league_name;
          } else {
            matchId = String(fixture.id || fixture.game?.id || "");
            matchDate = fixture.date || fixture.game?.date?.start || "";
            homeTeam = fixture.teams?.home?.name || "TBD";
            awayTeam = fixture.teams?.away?.name || "TBD";
            homeLogo = fixture.teams?.home?.logo || "";
            awayLogo = fixture.teams?.away?.logo || "";
            leagueName = fixture.league?.name || preset.league_name;
          }

          if (!matchId || !matchDate) continue;

          const fixtureDate = new Date(matchDate);
          // Skip past matches and matches beyond max_days_ahead
          if (fixtureDate < new Date() || fixtureDate > maxEndDate) continue;

          // Check if already imported (by sport_match_id)
          const { data: existing } = await adminClient
            .from("markets")
            .select("id")
            .eq("sport_match_id", matchId)
            .limit(1);
          if (existing && existing.length > 0) continue;

          const title = buildMarketTitle(homeTeam, awayTeam, leagueName);
          const description = buildMarketDescription(homeTeam, awayTeam, leagueName, matchDate);

          // Use league logo or team logo as image
          const imageUrl = fixture.league?.logo || homeLogo || preset.league_logo || null;

          // Create market with multi-option (Home Win, Draw, Away Win) for football
          // For other sports: binary (Home Win vs Away Win)
          const isFootball = preset.sport_type === "football";
          const marketType = isFootball ? "multi" : "binary";

          const { data: newMarket, error: insertErr } = await adminClient.from("markets").insert({
            title: title.slice(0, 500),
            description: description.slice(0, 2000),
            category: "Sports",
            status: preset.auto_approve ? "active" : "pending",
            market_type: marketType,
            creator_wallet: creatorId,
            creator_name: creatorName,
            end_date: fixtureDate.toISOString(),
            resolution_source: "API-Football",
            image_url: imageUrl,
            sport_type: preset.sport_type,
            sport_match_id: matchId,
            sport_league: leagueName,
            yes_price: isFootball ? 0.33 : 0.5,
            no_price: isFootball ? 0.33 : 0.5,
            initial_liquidity: 0,
            liquidity: 0,
          }).select("id").single();

          if (insertErr) {
            if (!insertErr.message?.includes("duplicate")) {
              errors.push(`Insert error for "${title.slice(0, 50)}": ${insertErr.message}`);
            }
            continue;
          }

          // For football multi-option markets, create options (Home Win, Draw, Away Win)
          if (isFootball && newMarket) {
            const options = [
              { label: `${homeTeam} Win`, market_id: newMarket.id, price: 0.33, sort_order: 0 },
              { label: "Draw", market_id: newMarket.id, price: 0.34, sort_order: 1 },
              { label: `${awayTeam} Win`, market_id: newMarket.id, price: 0.33, sort_order: 2 },
            ];
            const { error: optErr } = await adminClient.from("market_options").insert(options);
            if (optErr) {
              errors.push(`Options error for "${title.slice(0, 50)}": ${optErr.message}`);
            }
          }

          totalImported++;
          presetImported++;
        }
      } catch (err: any) {
        errors.push(`Fetch error for ${preset.league_name}: ${err.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        imported: totalImported,
        presets_processed: presets.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
