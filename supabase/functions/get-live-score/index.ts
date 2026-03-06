import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SPORT_API_MAP: Record<string, { host: string; fixturePath: string; idParam: string }> = {
  football: { host: "v3.football.api-sports.io", fixturePath: "/fixtures", idParam: "id" },
  basketball: { host: "v1.basketball.api-sports.io", fixturePath: "/games", idParam: "id" },
  baseball: { host: "v1.baseball.api-sports.io", fixturePath: "/games", idParam: "id" },
  hockey: { host: "v1.hockey.api-sports.io", fixturePath: "/games", idParam: "id" },
  nfl: { host: "v1.american-football.api-sports.io", fixturePath: "/games", idParam: "id" },
  rugby: { host: "v1.rugby.api-sports.io", fixturePath: "/games", idParam: "id" },
  volleyball: { host: "v1.volleyball.api-sports.io", fixturePath: "/games", idParam: "id" },
  handball: { host: "v1.handball.api-sports.io", fixturePath: "/games", idParam: "id" },
  mma: { host: "v1.mma.api-sports.io", fixturePath: "/fights", idParam: "id" },
  formula1: { host: "v1.formula-1.api-sports.io", fixturePath: "/races", idParam: "id" },
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

    const { sport, matchId } = await req.json();
    const sportKey = (sport || "football").toLowerCase();
    const config = SPORT_API_MAP[sportKey];

    if (!config) {
      return new Response(JSON.stringify({ error: `Unsupported sport: ${sportKey}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!matchId) {
      return new Response(JSON.stringify({ error: "matchId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const headers = { "x-apisports-key": apiKey };
    const url = `https://${config.host}${config.fixturePath}?${config.idParam}=${matchId}`;
    const resp = await fetch(url, { headers });
    const data = await resp.json();
    const items = data?.response || [];

    if (items.length === 0) {
      return new Response(JSON.stringify({ match: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const item = items[0];
    let match: any;

    if (sportKey === "football") {
      const statusShort = item.fixture?.status?.short || "NS";
      const liveStatuses = ["1H", "2H", "ET", "P", "HT", "LIVE", "BT"];
      const finishedStatuses = ["FT", "AET", "PEN", "AWD", "WO"];
      match = {
        homeTeam: item.teams?.home?.name || "TBD",
        awayTeam: item.teams?.away?.name || "TBD",
        homeLogo: item.teams?.home?.logo || "",
        awayLogo: item.teams?.away?.logo || "",
        homeScore: item.goals?.home ?? null,
        awayScore: item.goals?.away ?? null,
        status: statusShort,
        statusLong: item.fixture?.status?.long || "",
        elapsed: item.fixture?.status?.elapsed || null,
        isLive: liveStatuses.includes(statusShort),
        isFinished: finishedStatuses.includes(statusShort),
        startTime: item.fixture?.date || "",
        league: item.league?.name || "",
        leagueLogo: item.league?.logo || "",
        venue: item.fixture?.venue?.name || "",
      };
    } else {
      // Generic for other sports
      const statusShort = item.status?.short || item.game?.status?.short || "NS";
      const statusLong = item.status?.long || item.game?.status?.long || "";
      const liveStatuses = ["Q1", "Q2", "Q3", "Q4", "OT", "HT", "1H", "2H", "LIVE", "BT", "IN1", "IN2", "IN3", "IN4", "IN5", "IN6", "IN7", "IN8", "IN9"];
      const finishedStatuses = ["FT", "FIN", "AET", "AOT", "POST"];

      const homeScore = item.scores?.home?.total ?? item.scores?.home?.points ?? null;
      const awayScore = item.scores?.away?.total ?? item.scores?.away?.points ?? null;

      match = {
        homeTeam: item.teams?.home?.name || "TBD",
        awayTeam: item.teams?.away?.name || "TBD",
        homeLogo: item.teams?.home?.logo || "",
        awayLogo: item.teams?.away?.logo || "",
        homeScore,
        awayScore,
        status: statusShort,
        statusLong,
        elapsed: null,
        isLive: liveStatuses.includes(statusShort),
        isFinished: finishedStatuses.includes(statusShort),
        startTime: item.date || item.game?.date?.start || "",
        league: item.league?.name || item.country?.name || "",
        leagueLogo: item.league?.logo || "",
        venue: "",
      };
    }

    return new Response(JSON.stringify({ match }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("get-live-score error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
