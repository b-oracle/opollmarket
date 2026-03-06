import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SPORT_API_MAP: Record<string, { host: string; teamPath: string; fixturePath: string }> = {
  football: { host: "v3.football.api-sports.io", teamPath: "/teams", fixturePath: "/fixtures" },
  basketball: { host: "v1.basketball.api-sports.io", teamPath: "/teams", fixturePath: "/games" },
  baseball: { host: "v1.baseball.api-sports.io", teamPath: "/teams", fixturePath: "/games" },
  hockey: { host: "v1.hockey.api-sports.io", teamPath: "/teams", fixturePath: "/games" },
  nfl: { host: "v1.american-football.api-sports.io", teamPath: "/teams", fixturePath: "/games" },
  rugby: { host: "v1.rugby.api-sports.io", teamPath: "/teams", fixturePath: "/games" },
  volleyball: { host: "v1.volleyball.api-sports.io", teamPath: "/teams", fixturePath: "/games" },
  handball: { host: "v1.handball.api-sports.io", teamPath: "/teams", fixturePath: "/games" },
  mma: { host: "v1.mma.api-sports.io", teamPath: "/fighters", fixturePath: "/fights" },
  formula1: { host: "v1.formula-1.api-sports.io", teamPath: "/teams", fixturePath: "/races" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("API_FOOTBALL_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { sport, team, date, season } = await req.json();
    const sportKey = (sport || "football").toLowerCase();
    const sportConfig = SPORT_API_MAP[sportKey];

    if (!sportConfig) {
      return new Response(JSON.stringify({ error: `Unsupported sport: ${sportKey}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const headers = { "x-apisports-key": apiKey };

    // For football, we can search fixtures directly with team name via team search then fixtures
    // Step 1: Search for teams by name
    if (!team || team.trim().length < 2) {
      return new Response(JSON.stringify({ fixtures: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For football: search teams, then get their upcoming fixtures
    if (sportKey === "football") {
      // Search teams
      const teamResp = await fetch(
        `https://${sportConfig.host}${sportConfig.teamPath}?search=${encodeURIComponent(team.trim())}`,
        { headers }
      );
      const teamData = await teamResp.json();
      const teams = teamData?.response?.slice(0, 5) || [];

      if (teams.length === 0) {
        return new Response(JSON.stringify({ fixtures: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get upcoming fixtures for top team match
      const teamId = teams[0].team?.id;
      if (!teamId) {
        return new Response(JSON.stringify({ fixtures: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const currentSeason = season || new Date().getFullYear();
      const fixtureResp = await fetch(
        `https://${sportConfig.host}${sportConfig.fixturePath}?team=${teamId}&season=${currentSeason}&next=20`,
        { headers }
      );
      const fixtureData = await fixtureResp.json();
      const rawFixtures = fixtureData?.response || [];

      const fixtures = rawFixtures.map((f: any) => ({
        id: String(f.fixture?.id || ""),
        date: f.fixture?.date || "",
        status: f.fixture?.status?.long || "Scheduled",
        homeTeam: f.teams?.home?.name || "TBD",
        homeLogo: f.teams?.home?.logo || "",
        awayTeam: f.teams?.away?.name || "TBD",
        awayLogo: f.teams?.away?.logo || "",
        league: f.league?.name || "",
        leagueLogo: f.league?.logo || "",
        venue: f.fixture?.venue?.name || "",
      }));

      return new Response(JSON.stringify({ fixtures, teamMatches: teams.map((t: any) => ({ id: t.team?.id, name: t.team?.name, logo: t.team?.logo })) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generic for other sports: search teams then get games
    const teamResp = await fetch(
      `https://${sportConfig.host}${sportConfig.teamPath}?search=${encodeURIComponent(team.trim())}`,
      { headers }
    );
    const teamData = await teamResp.json();
    const teams = teamData?.response?.slice(0, 5) || [];

    if (teams.length === 0) {
      return new Response(JSON.stringify({ fixtures: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const teamId = teams[0].id || teams[0].team?.id;
    if (!teamId) {
      return new Response(JSON.stringify({ fixtures: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get upcoming games — use date range for non-football sports
    const today = new Date().toISOString().split("T")[0];
    const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const currentSeason = season || new Date().getFullYear();

    const fixtureResp = await fetch(
      `https://${sportConfig.host}${sportConfig.fixturePath}?team=${teamId}&season=${currentSeason}`,
      { headers }
    );
    const fixtureData = await fixtureResp.json();
    const rawFixtures = (fixtureData?.response || []).filter((f: any) => {
      const gameDate = f.date || f.game?.date?.start;
      return gameDate && new Date(gameDate) >= new Date(today);
    }).slice(0, 20);

    const fixtures = rawFixtures.map((f: any) => ({
      id: String(f.id || f.game?.id || ""),
      date: f.date || f.game?.date?.start || "",
      status: f.status?.long || f.game?.status?.long || "Scheduled",
      homeTeam: f.teams?.home?.name || "TBD",
      homeLogo: f.teams?.home?.logo || "",
      awayTeam: f.teams?.away?.name || "TBD",
      awayLogo: f.teams?.away?.logo || "",
      league: f.league?.name || f.country?.name || "",
      leagueLogo: f.league?.logo || "",
      venue: "",
    }));

    return new Response(JSON.stringify({
      fixtures,
      teamMatches: teams.map((t: any) => ({
        id: t.id || t.team?.id,
        name: t.name || t.team?.name,
        logo: t.logo || t.team?.logo,
      })),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("search-fixtures error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
