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
  mma: { host: "v1.mma.api-sports.io", fixturePath: "/fights" },
  formula1: { host: "v1.formula-1.api-sports.io", fixturePath: "/races" },
  afl: { host: "v1.afl.api-sports.io", fixturePath: "/games" },
  nfl: { host: "v1.american-football.api-sports.io", fixturePath: "/games" },
};

interface LiveScore {
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  isLive: boolean;
  isFinished: boolean;
}

async function fetchLiveScore(
  sportType: string,
  matchId: string,
  apiKey: string
): Promise<LiveScore | null> {
  const config = SPORT_API_MAP[sportType.toLowerCase()];
  if (!config) return null;

  try {
    const resp = await fetch(
      `https://${config.host}${config.fixturePath}?id=${matchId}`,
      { headers: { "x-apisports-key": apiKey } }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    const items = data?.response;
    if (!items || items.length === 0) return null;

    const item = items[0];

    if (sportType.toLowerCase() === "football") {
      const statusShort = item.fixture?.status?.short || "NS";
      const liveStatuses = ["1H", "2H", "ET", "P", "HT", "LIVE", "BT"];
      const finishedStatuses = ["FT", "AET", "PEN", "AWD", "WO"];
      return {
        homeTeam: item.teams?.home?.name || "Home",
        awayTeam: item.teams?.away?.name || "Away",
        homeScore: item.goals?.home ?? null,
        awayScore: item.goals?.away ?? null,
        status: statusShort,
        isLive: liveStatuses.includes(statusShort),
        isFinished: finishedStatuses.includes(statusShort),
      };
    }

    // MMA-specific parsing (fighters structure, no live scores)
    if (sportType.toLowerCase() === "mma") {
      const statusShort = item.status?.short || "NS";
      const liveStatuses = ["LIVE", "IN"];
      const finishedStatuses = ["FT", "FIN"];
      const fighter1 = item.fighters?.first;
      const fighter2 = item.fighters?.second;
      return {
        homeTeam: fighter1?.name || "Fighter 1",
        awayTeam: fighter2?.name || "Fighter 2",
        homeScore: fighter1?.winner === true ? 1 : 0,
        awayScore: fighter2?.winner === true ? 1 : 0,
        status: statusShort,
        isLive: liveStatuses.includes(statusShort),
        isFinished: finishedStatuses.includes(statusShort),
      };
    }

    const statusShort = item.status?.short || item.game?.status?.short || "NS";
    const liveStatuses = ["Q1", "Q2", "Q3", "Q4", "OT", "HT", "1H", "2H", "LIVE", "BT"];
    const finishedStatuses = ["FT", "FIN", "AET", "AOT", "POST"];

    return {
      homeTeam: item.teams?.home?.name || "Home",
      awayTeam: item.teams?.away?.name || "Away",
      homeScore: item.scores?.home?.total ?? item.scores?.home?.points ?? null,
      awayScore: item.scores?.away?.total ?? item.scores?.away?.points ?? null,
      status: statusShort,
      isLive: liveStatuses.includes(statusShort),
      isFinished: finishedStatuses.includes(statusShort),
    };
  } catch (err) {
    console.error(`Failed to fetch live score for ${sportType}/${matchId}:`, err);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("API_FOOTBALL_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API_FOOTBALL_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Get all active sports auto-resolve markets
    const { data: markets, error: mErr } = await admin
      .from("markets")
      .select("id, title, sport_type, sport_match_id, sport_predicted_outcome")
      .eq("status", "active")
      .eq("auto_resolve", true)
      .eq("category", "Sports")
      .not("sport_type", "is", null)
      .not("sport_match_id", "is", null);

    if (mErr || !markets || markets.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active sports markets", notified: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get cached scores for all these markets
    const marketIds = markets.map((m) => m.id);
    const { data: cachedScores } = await admin
      .from("sport_score_cache")
      .select("*")
      .in("market_id", marketIds);

    const cacheMap = new Map<string, any>();
    for (const c of cachedScores || []) {
      cacheMap.set(c.market_id, c);
    }

    let notifiedCount = 0;

    for (const market of markets) {
      const sportType = market.sport_type as string;
      const matchId = market.sport_match_id as string;

      const score = await fetchLiveScore(sportType, matchId, apiKey);
      if (!score) continue;

      // Only process live or recently finished matches
      if (!score.isLive && !score.isFinished) continue;
      if (score.homeScore === null || score.awayScore === null) continue;

      const cached = cacheMap.get(market.id);
      const prevHome = cached?.home_score ?? null;
      const prevAway = cached?.away_score ?? null;
      const wasLive = cached?.is_live ?? false;

      // Detect score change
      const scoreChanged =
        prevHome !== null &&
        prevAway !== null &&
        (score.homeScore !== prevHome || score.awayScore !== prevAway);

      // Detect match just went live
      const justWentLive = score.isLive && !wasLive && prevHome === null;

      // Update cache (upsert)
      await admin.from("sport_score_cache").upsert(
        {
          market_id: market.id,
          match_id: matchId,
          home_score: score.homeScore,
          away_score: score.awayScore,
          status: score.status,
          is_live: score.isLive,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "market_id" }
      );

      // Send notifications if score changed or match just started
      if (scoreChanged || justWentLive) {
        // Get all users who have positions on this market
        const { data: participants } = await admin
          .from("positions")
          .select("user_id")
          .eq("market_id", market.id)
          .gt("shares", 0);

        if (!participants || participants.length === 0) continue;

        const uniqueUserIds = [...new Set(participants.map((p) => p.user_id))];

        let title: string;
        let message: string;

        if (justWentLive) {
          title = "⚽ Match Started!";
          message = `${score.homeTeam} vs ${score.awayTeam} has kicked off! You have a position on "${market.title}"`;
        } else {
          // Score changed
          const emoji = score.homeScore! > prevHome! ? "⚽" : "⚽";
          const scorer =
            score.homeScore! > prevHome!
              ? score.homeTeam
              : score.awayTeam;
          title = `${emoji} GOAL! ${scorer} scores!`;
          message = `${score.homeTeam} ${score.homeScore} – ${score.awayScore} ${score.awayTeam} | "${market.title}"`;
        }

        const notifications = uniqueUserIds.map((userId) => ({
          user_id: userId,
          title,
          message,
          type: "score_update",
          market_id: market.id,
        }));

        // Insert in batches of 100
        for (let i = 0; i < notifications.length; i += 100) {
          const batch = notifications.slice(i, i + 100);
          await admin.from("notifications").insert(batch);
        }

        notifiedCount += uniqueUserIds.length;
        console.log(
          `Score update for market ${market.id}: ${score.homeTeam} ${score.homeScore}-${score.awayScore} ${score.awayTeam} → notified ${uniqueUserIds.length} users`
        );
      }
    }

    return new Response(
      JSON.stringify({ message: "Score check complete", notified: notifiedCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("check-sports-scores error:", err);
    return new Response(JSON.stringify({ error: (err instanceof Error ? err.message : String(err)) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
