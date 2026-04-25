import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { getErrorMessage } from "../_shared/errors.ts";

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
      console.log("Team search response status:", teamResp.status, "results:", teamData?.response?.length ?? 0, "errors:", JSON.stringify(teamData?.errors || {}));

      // Check for API errors (suspended account, rate limit, etc.)
      if (teamData?.errors && Object.keys(teamData.errors).length > 0) {
        console.error("API-Football team search errors:", JSON.stringify(teamData.errors));
        return new Response(JSON.stringify({ fixtures: [], error: "Sports data API is currently unavailable" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

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

      // Use `next` parameter WITHOUT season — season filter conflicts with upcoming fixtures
      // because football seasons span calendar years (e.g., 2025/2026 season = "2025")
      const fixtureResp = await fetch(
        `https://${sportConfig.host}${sportConfig.fixturePath}?team=${teamId}&next=20`,
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

    // MMA: search fighters then get fights
    if (sportKey === "mma") {
      const fighterResp = await fetch(
        `https://${sportConfig.host}/fighters?search=${encodeURIComponent(team.trim())}`,
        { headers }
      );
      const fighterData = await fighterResp.json();
      const fighters = fighterData?.response?.slice(0, 5) || [];

      if (fighters.length === 0) {
        return new Response(JSON.stringify({ fixtures: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const fighterId = fighters[0].id;
      if (!fighterId) {
        return new Response(JSON.stringify({ fixtures: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const currentSeason = season || new Date().getFullYear();
      const fightResp = await fetch(
        `https://${sportConfig.host}${sportConfig.fixturePath}?fighter=${fighterId}&season=${currentSeason}`,
        { headers }
      );
      const fightData = await fightResp.json();
      const today = new Date().toISOString().split("T")[0];
      const rawFights = (fightData?.response || []).filter((f: any) => {
        const fightDate = f.date;
        const hasNames = f.fighters?.first?.name && f.fighters?.second?.name;
        return fightDate && hasNames && new Date(fightDate) >= new Date(today);
      }).slice(0, 20);

      const fixtures = rawFights.map((f: any) => ({
        id: String(f.id || ""),
        date: f.date || "",
        status: f.status?.long || "Scheduled",
        homeTeam: f.fighters?.first?.name || "TBD",
        homeLogo: f.fighters?.first?.logo || "",
        awayTeam: f.fighters?.second?.name || "TBD",
        awayLogo: f.fighters?.second?.logo || "",
        league: f.league?.name || "",
        leagueLogo: f.league?.logo || "",
        venue: "",
      }));

      return new Response(JSON.stringify({
        fixtures,
        teamMatches: fighters.map((f: any) => ({
          id: f.id,
          name: f.name,
          logo: f.logo,
        })),
      }), {
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
    const currentSeason = season || new Date().getFullYear();

    // Try with season first; for many sports APIs season is required
    const fixtureResp = await fetch(
      `https://${sportConfig.host}${sportConfig.fixturePath}?team=${teamId}&season=${currentSeason}`,
      { headers }
    );
    const fixtureData = await fixtureResp.json();
    console.log(`Non-football fixtures API (${sportKey}) for team ${teamId}, season ${currentSeason}: ${fixtureData?.response?.length ?? 0} results`);

    // Also try previous season year in case current season spans years
    let allFixtures = fixtureData?.response || [];
    if (allFixtures.length === 0 && !season) {
      const prevSeason = new Date().getFullYear() - 1;
      const fallbackResp = await fetch(
        `https://${sportConfig.host}${sportConfig.fixturePath}?team=${teamId}&season=${prevSeason}`,
        { headers }
      );
      const fallbackData = await fallbackResp.json();
      console.log(`Fallback season ${prevSeason}: ${fallbackData?.response?.length ?? 0} results`);
      allFixtures = fallbackData?.response || [];
    }

    const rawFixtures = allFixtures.filter((f: any) => {
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
    return new Response(JSON.stringify({ error: (getErrorMessage(err)) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
