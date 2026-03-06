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

      // Extract half-time and full-time scores
      const periodScores: any[] = [];
      if (item.score?.halftime?.home !== null && item.score?.halftime?.home !== undefined) {
        periodScores.push({ label: "HT", home: item.score.halftime.home, away: item.score.halftime.away });
      }
      if (item.score?.fulltime?.home !== null && item.score?.fulltime?.home !== undefined) {
        periodScores.push({ label: "FT", home: item.score.fulltime.home, away: item.score.fulltime.away });
      }
      if (item.score?.extratime?.home !== null && item.score?.extratime?.home !== undefined) {
        periodScores.push({ label: "ET", home: item.score.extratime.home, away: item.score.extratime.away });
      }
      if (item.score?.penalty?.home !== null && item.score?.penalty?.home !== undefined) {
        periodScores.push({ label: "PEN", home: item.score.penalty.home, away: item.score.penalty.away });
      }

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
        periodScores,
      };
    } else {
      // Generic for other sports
      const statusShort = item.status?.short || item.game?.status?.short || "NS";
      const statusLong = item.status?.long || item.game?.status?.long || "";
      const liveStatuses = ["Q1", "Q2", "Q3", "Q4", "OT", "HT", "1H", "2H", "LIVE", "BT", "IN1", "IN2", "IN3", "IN4", "IN5", "IN6", "IN7", "IN8", "IN9"];
      const finishedStatuses = ["FT", "FIN", "AET", "AOT", "POST"];

      const homeScore = item.scores?.home?.total ?? item.scores?.home?.points ?? null;
      const awayScore = item.scores?.away?.total ?? item.scores?.away?.points ?? null;

      // Extract quarter/period scores for basketball, NFL, etc.
      const periodScores: any[] = [];
      const scores = item.scores;
      if (scores) {
        // Basketball: quarter1, quarter2, quarter3, quarter4, over_time
        for (const key of ["quarter_1", "quarter_2", "quarter_3", "quarter_4", "over_time"]) {
          if (scores.home?.[key] !== null && scores.home?.[key] !== undefined) {
            const label = key === "over_time" ? "OT" : key.replace("quarter_", "Q");
            periodScores.push({ label, home: scores.home[key], away: scores.away?.[key] ?? null });
          }
        }
        // NFL / American Football: similar structure
        if (periodScores.length === 0) {
          for (const key of ["first", "second", "third", "fourth", "overtime"]) {
            const hVal = scores.home?.[key];
            if (hVal !== null && hVal !== undefined) {
              const labelMap: Record<string, string> = { first: "Q1", second: "Q2", third: "Q3", fourth: "Q4", overtime: "OT" };
              periodScores.push({ label: labelMap[key] || key, home: hVal, away: scores.away?.[key] ?? null });
            }
          }
        }
        // Hockey: period1, period2, period3, overtime
        if (periodScores.length === 0) {
          for (const key of ["period_1", "period_2", "period_3", "overtime"]) {
            const hVal = scores.home?.[key];
            if (hVal !== null && hVal !== undefined) {
              const label = key === "overtime" ? "OT" : key.replace("period_", "P");
              periodScores.push({ label, home: hVal, away: scores.away?.[key] ?? null });
            }
          }
        }
        // Baseball: innings
        if (periodScores.length === 0) {
          for (let i = 1; i <= 9; i++) {
            const key = `inning_${i}`;
            if (scores.home?.[key] !== null && scores.home?.[key] !== undefined) {
              periodScores.push({ label: `${i}`, home: scores.home[key], away: scores.away?.[key] ?? null });
            }
          }
        }
      }

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
        periodScores,
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
