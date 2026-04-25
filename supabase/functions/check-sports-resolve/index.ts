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

    // MMA-specific parsing
    if (sportType.toLowerCase() === "mma") {
      const status = match.status?.short || "";
      const finished = ["FT", "FIN"].includes(status);
      const fighter1 = match.fighters?.first;
      const fighter2 = match.fighters?.second;
      let winner: string | null = null;
      if (finished) {
        if (fighter1?.winner === true) winner = "home";
        else if (fighter2?.winner === true) winner = "away";
        else if (fighter1?.winner === false && fighter2?.winner === false) winner = "draw";
      }
      return {
        finished,
        homeTeam: fighter1?.name || "Fighter 1",
        awayTeam: fighter2?.name || "Fighter 2",
        homeScore: null,
        awayScore: null,
        winner,
        status,
      };
    }

    // Generic parsing for other sports
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

  if (outcome === "home_win" || outcome === "home" || outcome === "fighter1_win") {
    return result.winner === "home" ? "yes" : "no";
  }
  if (outcome === "away_win" || outcome === "away" || outcome === "fighter2_win") {
    return result.winner === "away" ? "yes" : "no";
  }
  if (outcome === "draw") {
    return result.winner === "draw" ? "yes" : "no";
  }

  // Team/fighter name matching
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

  // BTTS
  if (outcome === "btts" || outcome === "both teams to score") {
    if (result.homeScore !== null && result.awayScore !== null) {
      return result.homeScore > 0 && result.awayScore > 0 ? "yes" : "no";
    }
  }

  return null;
}

/**
 * For multi-option markets (e.g. football Home/Draw/Away), determine the winning option ID
 * based on the match result.
 */
function determineWinningOption(
  options: { id: string; label: string }[],
  result: MatchResult
): string | null {
  if (!result.finished || !result.winner) return null;

  for (const opt of options) {
    const label = opt.label.toLowerCase().trim();

    // Check for "Draw"
    if (result.winner === "draw" && label === "draw") return opt.id;

    // Check for home team win
    if (result.winner === "home") {
      if (label.includes("win") && label.includes(result.homeTeam.toLowerCase())) return opt.id;
      // Check by partial team name match
      const teamParts = result.homeTeam.toLowerCase().split(/\s+/);
      if (label.includes("win") && teamParts.some((p) => p.length > 2 && label.includes(p))) return opt.id;
    }

    // Check for away team win
    if (result.winner === "away") {
      if (label.includes("win") && label.includes(result.awayTeam.toLowerCase())) return opt.id;
      const teamParts = result.awayTeam.toLowerCase().split(/\s+/);
      if (label.includes("win") && teamParts.some((p) => p.length > 2 && label.includes(p))) return opt.id;
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

    // Fetch all active + ended sports auto-resolve markets
    const { data: markets, error: fetchErr } = await adminClient
      .from("markets")
      .select("*")
      .eq("auto_resolve", true)
      .eq("category", "Sports")
      .in("status", ["active", "ended"])
      .not("sport_type", "is", null)
      .not("sport_match_id", "is", null);

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
      const predictedOutcome = (market.sport_predicted_outcome as string) || "";
      const isMultiOption = market.market_type === "multi" || predictedOutcome === "multi_option";
      const deadline = market.auto_resolve_deadline ? new Date(market.auto_resolve_deadline) : new Date(market.end_date);
      const now = new Date();

      const result = await fetchMatchResult(sportType, matchId, apiKey);

      if (result && result.finished) {
        if (isMultiOption) {
          // Multi-option resolution: find the winning option
          const { data: options } = await adminClient
            .from("market_options")
            .select("id, label")
            .eq("market_id", market.id)
            .order("sort_order");

          if (!options || options.length === 0) {
            console.warn(`Market ${market.id}: Multi-option but no options found, skipping`);
            continue;
          }

          const winningOptionId = determineWinningOption(options, result);
          if (!winningOptionId) {
            console.warn(`Market ${market.id}: Could not determine winning option from result ${result.winner}`);
            continue;
          }

          // Resolve multi-option market
          await adminClient
            .from("markets")
            .update({
              status: "resolved",
              winning_option_id: winningOptionId,
              resolved_side: result.winner || "resolved",
            })
            .eq("id", market.id);

          // Update option prices: winner = 1.0, losers = 0
          for (const opt of options) {
            await adminClient
              .from("market_options")
              .update({ price: opt.id === winningOptionId ? 1.0 : 0 })
              .eq("id", opt.id);
          }

          // Pay out winners (positions with the winning option)
          const { data: winningPositions } = await adminClient
            .from("positions")
            .select("*")
            .eq("market_id", market.id)
            .eq("option_id", winningOptionId)
            .gt("shares", 0);

          // Calculate total pool and winning pool for capital-first parimutuel
          const { data: allPositions } = await adminClient
            .from("positions")
            .select("*")
            .eq("market_id", market.id)
            .gt("shares", 0);

          const totalPool = (allPositions || []).reduce((s, p) => s + p.shares * p.avg_price, 0);
          const winnerCapital = (winningPositions || []).reduce((s, p) => s + p.shares * p.avg_price, 0);
          const loserPool = totalPool - winnerCapital;

          // Get fee settings
          const { data: settings } = await adminClient
            .from("commission_settings")
            .select("admin_fee_percent")
            .limit(1)
            .single();
          const feePercent = settings?.admin_fee_percent ?? 2;
          const fees = loserPool * (feePercent / 100);
          const profitPool = loserPool - fees;
          const totalWinnerShares = (winningPositions || []).reduce((s, p) => s + p.shares, 0);

          for (const pos of winningPositions || []) {
            const capital = pos.shares * pos.avg_price;
            const profitShare = totalWinnerShares > 0 ? (pos.shares / totalWinnerShares) * profitPool : 0;
            const payout = Math.min(capital + profitShare, pos.shares); // cap at $1/share

            await adminClient.rpc("adjust_balance", { _user_id: pos.user_id, _delta: payout });

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

          // Credit fees to platform pool
          if (fees > 0) {
            await adminClient.rpc("adjust_platform_pool", { _delta: fees });
          }

          // Notify participants
          const scoreInfo = `${result.homeTeam} ${result.homeScore ?? "?"} - ${result.awayScore ?? "?"} ${result.awayTeam}`;
          const winningLabel = options.find((o) => o.id === winningOptionId)?.label || "Winner";

          const uniqueUsers = new Map<string, boolean>();
          for (const p of allPositions || []) {
            if (!uniqueUsers.has(p.user_id)) {
              uniqueUsers.set(p.user_id, p.option_id === winningOptionId);
            }
          }

          const notifications = Array.from(uniqueUsers.entries()).map(([userId, won]) => ({
            user_id: userId,
            title: won ? "You Won! 🎉 Sports Market Resolved" : "Sports Market Resolved",
            message: `"${market.title}" resolved: ${winningLabel}. Final: ${scoreInfo}. ${won ? "Your payout has been credited!" : "Better luck next time!"}`,
            type: won ? "payout" : "resolution",
            market_id: market.id,
          }));

          if (notifications.length > 0) {
            await adminClient.from("notifications").insert(notifications);
          }

          console.log(`Sports Market ${market.id}: Multi-option resolved → ${winningLabel} — notified ${notifications.length}`);
          resolvedCount++;
        } else {
          // Binary market resolution
          const winningSide = determineWinningSide(predictedOutcome, result);
          if (!winningSide) continue;

          await adminClient
            .from("markets")
            .update({
              status: "resolved",
              resolved_side: winningSide,
              yes_price: winningSide === "yes" ? 1 : 0,
              no_price: winningSide === "no" ? 1 : 0,
            })
            .eq("id", market.id);

          const { data: winningPositions } = await adminClient
            .from("positions")
            .select("*")
            .eq("market_id", market.id)
            .eq("side", winningSide)
            .gt("shares", 0);

          for (const pos of winningPositions || []) {
            const payout = pos.shares;
            await adminClient.rpc("adjust_balance", { _user_id: pos.user_id, _delta: payout });

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

          const scoreInfo = `${result.homeTeam} ${result.homeScore ?? "?"} - ${result.awayScore ?? "?"} ${result.awayTeam}`;

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
            return {
              user_id: userId,
              title: won ? "You Won! 🎉 Sports Market Resolved" : "Sports Market Resolved",
              message: `"${market.title}" resolved ${winningSide!.toUpperCase()} — Final: ${scoreInfo}. ${won ? "Your payout has been credited!" : "Better luck next time!"}`,
              type: won ? "payout" : "resolution",
              market_id: market.id,
            };
          });

          if (notifications.length > 0) {
            await adminClient.from("notifications").insert(notifications);
          }

          console.log(`Sports Market ${market.id}: Resolved ${winningSide.toUpperCase()} — notified ${notifications.length}`);
          resolvedCount++;
        }
      } else if (now > deadline) {
        // Deadline passed handling
        const matchStatus = result?.status?.toUpperCase() || "UNKNOWN";
        const cancelledStatuses = ["PST", "CANC", "ABD", "WO", "INT", "SUSP"];
        const notStartedStatuses = ["NS", "TBD", "UNKNOWN", ""];

        if (cancelledStatuses.includes(matchStatus)) {
          await adminClient
            .from("markets")
            .update({ status: "ended" })
            .eq("id", market.id);

          const { data: adminUsers } = await adminClient
            .from("user_roles")
            .select("user_id")
            .in("role", ["admin", "super_admin"]);

          if (adminUsers && adminUsers.length > 0) {
            const adminNotifs = adminUsers.map((a) => ({
              user_id: a.user_id,
              title: "⚠️ Match Postponed/Cancelled",
              message: `"${market.title}" — match status: ${matchStatus}. Please resolve manually.`,
              type: "pending_review",
              market_id: market.id,
            }));
            await adminClient.from("notifications").insert(adminNotifs);
          }

          console.log(`Market ${market.id}: Match ${matchStatus}, moved to ended for admin review`);
        } else if (!notStartedStatuses.includes(matchStatus) && result) {
          console.log(`Market ${market.id}: Match status ${matchStatus}, waiting for finish...`);
        } else if (now.getTime() - deadline.getTime() > 6 * 60 * 60 * 1000) {
          await adminClient
            .from("markets")
            .update({ status: "ended" })
            .eq("id", market.id);

          const { data: adminUsers } = await adminClient
            .from("user_roles")
            .select("user_id")
            .in("role", ["admin", "super_admin"]);

          if (adminUsers && adminUsers.length > 0) {
            const adminNotifs = adminUsers.map((a) => ({
              user_id: a.user_id,
              title: "⚠️ Match Not Started — Review Needed",
              message: `"${market.title}" deadline passed 6h+ ago, match status: ${matchStatus}. Please resolve manually.`,
              type: "pending_review",
              market_id: market.id,
            }));
            await adminClient.from("notifications").insert(adminNotifs);
          }

          console.log(`Market ${market.id}: 6h+ past deadline, status ${matchStatus}, moved to ended for admin review`);
        } else {
          console.log(`Market ${market.id}: Deadline passed but match not started (${matchStatus}), waiting...`);
        }
      }
    }

    return new Response(
      JSON.stringify({ message: "Sports auto-resolve check complete", resolved: resolvedCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("check-sports-resolve error:", err);
    return new Response(JSON.stringify({ error: (err instanceof Error ? err.message : String(err)) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
