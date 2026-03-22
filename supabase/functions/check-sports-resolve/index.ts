import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// API-Football sport type to API host mapping
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

interface MatchResult {
  finished: boolean;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  winner: string | null; // "home", "away", "draw", or null
  status: string;
}

async function fetchMatchResult(
  sportType: string,
  matchId: string,
  apiKey: string
): Promise<MatchResult | null> {
  const sport = SPORT_API_MAP[sportType.toLowerCase()];
  if (!sport) {
    console.error(`Unsupported sport type: ${sportType}`);
    return null;
  }

  try {
    const url = `https://${sport.host}${sport.fixturePath}?id=${matchId}`;
    const resp = await fetch(url, {
      headers: { "x-apisports-key": apiKey },
    });
    if (!resp.ok) {
      console.error(`API-Sports responded ${resp.status} for ${sportType} match ${matchId}`);
      return null;
    }
    const data = await resp.json();
    const items = data?.response;
    if (!items || items.length === 0) return null;

    const match = items[0];

    // Football-specific parsing
    if (sportType.toLowerCase() === "football") {
      const status = match.fixture?.status?.short || "";
      const finished = ["FT", "AET", "PEN"].includes(status);
      const homeScore = match.goals?.home ?? null;
      const awayScore = match.goals?.away ?? null;
      let winner: string | null = null;
      if (finished && homeScore !== null && awayScore !== null) {
        winner = homeScore > awayScore ? "home" : awayScore > homeScore ? "away" : "draw";
      }
      return {
        finished,
        homeTeam: match.teams?.home?.name || "Home",
        awayTeam: match.teams?.away?.name || "Away",
        homeScore,
        awayScore,
        winner,
        status,
      };
    }

    // Generic parsing for other sports (basketball, baseball, hockey, etc.)
    const status = match.status?.short || match.game?.status?.short || "";
    const finished = ["FT", "AOT", "AP", "POST"].includes(status) || status === "FIN";
    const scores = match.scores;
    let homeScore: number | null = null;
    let awayScore: number | null = null;
    let winner: string | null = null;

    if (scores) {
      homeScore = scores.home?.total ?? scores.home?.points ?? null;
      awayScore = scores.away?.total ?? scores.away?.points ?? null;
    }

    if (finished && homeScore !== null && awayScore !== null) {
      winner = homeScore > awayScore ? "home" : awayScore > homeScore ? "away" : "draw";
    }

    return {
      finished,
      homeTeam: match.teams?.home?.name || "Home",
      awayTeam: match.teams?.away?.name || "Away",
      homeScore,
      awayScore,
      winner,
      status,
    };
  } catch (err) {
    console.error(`Failed to fetch ${sportType} match ${matchId}:`, err);
    return null;
  }
}

function determineWinningSide(
  predictedOutcome: string,
  result: MatchResult
): string | null {
  if (!result.finished || !result.winner) return null;

  const outcome = predictedOutcome.toLowerCase().trim();

  // Check common outcome patterns
  if (outcome === "home_win" || outcome === "home") {
    return result.winner === "home" ? "yes" : "no";
  }
  if (outcome === "away_win" || outcome === "away") {
    return result.winner === "away" ? "yes" : "no";
  }
  if (outcome === "draw") {
    return result.winner === "draw" ? "yes" : "no";
  }

  // Team name matching
  if (result.homeTeam.toLowerCase().includes(outcome) || outcome.includes(result.homeTeam.toLowerCase())) {
    return result.winner === "home" ? "yes" : "no";
  }
  if (result.awayTeam.toLowerCase().includes(outcome) || outcome.includes(result.awayTeam.toLowerCase())) {
    return result.winner === "away" ? "yes" : "no";
  }

  // Over/Under patterns
  const overMatch = outcome.match(/over\s*([\d.]+)/);
  if (overMatch && result.homeScore !== null && result.awayScore !== null) {
    const threshold = parseFloat(overMatch[1]);
    const totalGoals = result.homeScore + result.awayScore;
    return totalGoals > threshold ? "yes" : "no";
  }
  const underMatch = outcome.match(/under\s*([\d.]+)/);
  if (underMatch && result.homeScore !== null && result.awayScore !== null) {
    const threshold = parseFloat(underMatch[1]);
    const totalGoals = result.homeScore + result.awayScore;
    return totalGoals < threshold ? "yes" : "no";
  }

  // BTTS (Both Teams To Score)
  if (outcome === "btts" || outcome === "both teams to score") {
    if (result.homeScore !== null && result.awayScore !== null) {
      return result.homeScore > 0 && result.awayScore > 0 ? "yes" : "no";
    }
  }

  return null;
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
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Fetch all active sports auto-resolve markets
    const { data: markets, error: fetchErr } = await adminClient
      .from("markets")
      .select("*")
      .eq("status", "active")
      .eq("auto_resolve", true)
      .eq("category", "Sports")
      .not("sport_type", "is", null)
      .not("sport_match_id", "is", null)
      .not("sport_predicted_outcome", "is", null);

    if (fetchErr) {
      console.error("Failed to fetch sports auto-resolve markets:", fetchErr);
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!markets || markets.length === 0) {
      return new Response(
        JSON.stringify({ message: "No sports auto-resolve markets to check", resolved: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let resolvedCount = 0;

    for (const market of markets) {
      const sportType = market.sport_type as string;
      const matchId = market.sport_match_id as string;
      const predictedOutcome = market.sport_predicted_outcome as string;
      const deadline = market.auto_resolve_deadline ? new Date(market.auto_resolve_deadline) : null;
      const now = new Date();

      const result = await fetchMatchResult(sportType, matchId, apiKey);

      let winningSide: string | null = null;

      if (result && result.finished) {
        winningSide = determineWinningSide(predictedOutcome, result);
      } else if (deadline && now > deadline) {
        // Only force-resolve if the match actually finished but we couldn't determine the outcome,
        // OR if a generous grace period (6 hours past deadline) has elapsed (match likely cancelled/postponed).
        // Do NOT resolve if the match simply hasn't started yet (status NS/TBD/PST).
        const matchStatus = result?.status?.toUpperCase() || "UNKNOWN";
        const notStartedStatuses = ["NS", "TBD", "PST", "CANC", "ABD", "UNKNOWN", ""];
        const gracePeriodMs = 6 * 60 * 60 * 1000; // 6 hours

        if (result && result.finished) {
          // Match finished but determineWinningSide returned null — force NO
          winningSide = "no";
        } else if (!notStartedStatuses.includes(matchStatus) && result) {
          // Match is in some live/post state but not marked finished — skip, wait longer
          console.log(`Market ${market.id}: Match status ${matchStatus}, waiting for finish...`);
          continue;
        } else if (now.getTime() - deadline.getTime() > gracePeriodMs) {
          // 6+ hours past deadline and match never started — likely postponed/cancelled, resolve NO
          console.log(`Market ${market.id}: 6h+ past deadline, match status ${matchStatus}, force-resolving NO`);
          winningSide = "no";
        } else {
          // Deadline passed but match hasn't started and we're within grace period — skip
          console.log(`Market ${market.id}: Deadline passed but match not started (${matchStatus}), waiting...`);
          continue;
        }
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

      // Notify ALL participants
      const scoreInfo = result
        ? `${result.homeTeam} ${result.homeScore ?? "?"} - ${result.awayScore ?? "?"} ${result.awayTeam}`
        : "";

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
          ? "You Won! 🎉 Sports Market Resolved"
          : "Sports Market Resolved";
        const message = `"${market.title}" resolved ${winningSide!.toUpperCase()}${scoreInfo ? ` — Final: ${scoreInfo}` : ""}. ${won ? "Your payout has been credited!" : "Better luck next time!"}`;
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

      console.log(`Sports Market ${market.id}: Resolved ${winningSide.toUpperCase()} — notified ${notifications.length} participants`);
      resolvedCount++;
    }

    return new Response(
      JSON.stringify({ message: "Sports auto-resolve check complete", resolved: resolvedCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("check-sports-resolve error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
