import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Radio, Clock, Zap, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  NS: { label: "Not Started", color: "text-muted-foreground" },
  "1H": { label: "1st Half", color: "text-green-500" },
  HT: { label: "Half Time", color: "text-yellow-500" },
  "2H": { label: "2nd Half", color: "text-green-500" },
  ET: { label: "Extra Time", color: "text-orange-500" },
  P: { label: "Penalties", color: "text-orange-500" },
  FT: { label: "Full Time", color: "text-muted-foreground" },
  AET: { label: "After ET", color: "text-muted-foreground" },
  PEN: { label: "After Pens", color: "text-muted-foreground" },
  Q1: { label: "Q1", color: "text-green-500" },
  Q2: { label: "Q2", color: "text-green-500" },
  Q3: { label: "Q3", color: "text-green-500" },
  Q4: { label: "Q4", color: "text-green-500" },
  OT: { label: "Overtime", color: "text-orange-500" },
  LIVE: { label: "Live", color: "text-green-500" },
  FIN: { label: "Finished", color: "text-muted-foreground" },
  POST: { label: "Finished", color: "text-muted-foreground" },
  AWD: { label: "Awarded", color: "text-muted-foreground" },
  WO: { label: "Walkover", color: "text-muted-foreground" },
};

interface MatchData {
  homeTeam: string;
  awayTeam: string;
  homeLogo?: string;
  awayLogo?: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  statusLong?: string;
  elapsed?: number | null;
  isLive: boolean;
  isFinished: boolean;
  startTime?: string;
  league?: string;
  leagueLogo?: string;
  venue?: string;
  periodScores?: { label: string; home: number | null; away: number | null }[];
}

interface SportsMatchTickerProps {
  sportType: string;
  matchId: string;
  predictedOutcome: string;
  league?: string;
  deadline?: string;
  marketStatus?: string;
}

export default function SportsMatchTicker({
  sportType,
  matchId,
  predictedOutcome,
  league,
  deadline,
  marketStatus,
}: SportsMatchTickerProps) {
  const [match, setMatch] = useState<MatchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchLiveScore = useCallback(async () => {
    try {
      const { data, error: fnError } = await supabase.functions.invoke("get-live-score", {
        body: { sport: sportType, matchId },
      });
      if (!fnError && data?.match) {
        setMatch(data.match);
        setError(false);
        setLastUpdated(new Date());
      } else if (!fnError && data?.match === null) {
        // Match not found — keep showing static info
        setError(false);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [sportType, matchId]);

  useEffect(() => {
    fetchLiveScore();
    // Poll every 30s if match is live, every 5min otherwise
    const interval = setInterval(() => {
      fetchLiveScore();
    }, match?.isLive ? 30_000 : 300_000);
    return () => clearInterval(interval);
  }, [fetchLiveScore, match?.isLive]);

  const statusInfo = match?.status
    ? STATUS_MAP[match.status] || { label: match.statusLong || match.status, color: "text-muted-foreground" }
    : null;

  const deadlineStr = deadline
    ? new Date(deadline).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC"
    : null;

  const outcomeLabel = predictedOutcome
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const sportLabel = sportType.charAt(0).toUpperCase() + sportType.slice(1);

  const matchStartStr = match?.startTime
    ? new Date(match.startTime).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC"
    : null;

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 overflow-hidden mb-4">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
            <Trophy className="w-3.5 h-3.5 text-primary" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-primary">Sports Auto-Resolve</span>
            {(match?.league || league) && (
              <span className="text-[10px] text-muted-foreground ml-2">{match?.league || league}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {marketStatus === "resolved" && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/50 border border-border">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Resolved</span>
            </div>
          )}
          {marketStatus !== "resolved" && match?.isLive && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-destructive/15 border border-destructive/30">
              <Radio className="w-3 h-3 text-destructive animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-destructive">Live</span>
            </div>
          )}
          {marketStatus !== "resolved" && match?.isFinished && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/50 border border-border">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Final</span>
            </div>
          )}
          {marketStatus !== "resolved" && !match?.isLive && !match?.isFinished && !loading && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20">
              <Clock className="w-3 h-3 text-primary" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Upcoming</span>
            </div>
          )}
        </div>
      </div>

      {/* Live Scoreboard */}
      <div className="px-4 py-3">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground ml-2">Fetching live data...</span>
          </div>
        ) : match ? (
          <>
            {/* Scoreboard */}
            <div className="bg-muted/30 rounded-xl p-4 mb-3">
              <div className="flex items-center justify-between">
                {/* Home Team */}
                <div className="flex flex-col items-center gap-1.5 flex-1">
                  {match.homeLogo && (
                    <img src={match.homeLogo} alt={match.homeTeam} className="w-10 h-10 object-contain" />
                  )}
                  <span className="text-xs font-bold text-center leading-tight">{match.homeTeam}</span>
                </div>

                {/* Score */}
                <div className="flex flex-col items-center gap-1 px-4">
                  {(match.homeScore !== null && match.awayScore !== null) ? (
                    <motion.div
                      key={`${match.homeScore}-${match.awayScore}`}
                      initial={{ scale: 1.3, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="flex items-center gap-2"
                    >
                      <span className="text-2xl font-black tabular-nums">{match.homeScore}</span>
                      <span className="text-lg text-muted-foreground font-bold">–</span>
                      <span className="text-2xl font-black tabular-nums">{match.awayScore}</span>
                    </motion.div>
                  ) : (
                    <span className="text-lg font-bold text-muted-foreground">vs</span>
                  )}
                  {statusInfo && (
                    <div className="flex items-center gap-1">
                      {match.isLive && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
                      <span className={`text-[10px] font-bold uppercase ${statusInfo.color}`}>
                        {statusInfo.label}
                        {match.elapsed ? ` ${match.elapsed}'` : ""}
                      </span>
                    </div>
                  )}
                </div>

                {/* Away Team */}
                <div className="flex flex-col items-center gap-1.5 flex-1">
                  {match.awayLogo && (
                    <img src={match.awayLogo} alt={match.awayTeam} className="w-10 h-10 object-contain" />
                  )}
                  <span className="text-xs font-bold text-center leading-tight">{match.awayTeam}</span>
                </div>
              </div>

              {/* Period Scores Breakdown */}
              {match.periodScores && match.periodScores.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border/50">
                  <div className="grid gap-0" style={{ gridTemplateColumns: `1fr repeat(${match.periodScores.length}, minmax(0, 1fr)) 1fr` }}>
                    {/* Header row */}
                    <div className="text-[9px] text-muted-foreground font-medium py-1 px-1" />
                    {match.periodScores.map((p, i) => (
                      <div key={`h-${i}`} className="text-[9px] text-muted-foreground font-bold text-center py-1 uppercase">
                        {p.label}
                      </div>
                    ))}
                    <div className="text-[9px] text-muted-foreground font-bold text-center py-1">T</div>

                    {/* Home row */}
                    <div className="text-[10px] font-semibold truncate py-1 px-1">{match.homeTeam.split(' ').pop()}</div>
                    {match.periodScores.map((p, i) => (
                      <div key={`hv-${i}`} className="text-[10px] font-bold text-center py-1 tabular-nums">
                        {p.home ?? '-'}
                      </div>
                    ))}
                    <div className="text-[10px] font-black text-center py-1 tabular-nums text-primary">{match.homeScore}</div>

                    {/* Away row */}
                    <div className="text-[10px] font-semibold truncate py-1 px-1">{match.awayTeam.split(' ').pop()}</div>
                    {match.periodScores.map((p, i) => (
                      <div key={`av-${i}`} className="text-[10px] font-bold text-center py-1 tabular-nums">
                        {p.away ?? '-'}
                      </div>
                    ))}
                    <div className="text-[10px] font-black text-center py-1 tabular-nums text-primary">{match.awayScore}</div>
                  </div>
                </div>
              )}

              {/* Match start time for upcoming */}
              {!match.isLive && !match.isFinished && matchStartStr && (
                <div className="flex items-center justify-center gap-1.5 mt-3 pt-3 border-t border-border/50">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">Kickoff: <span className="font-semibold text-foreground">{matchStartStr}</span></span>
                </div>
              )}

              {/* Venue */}
              {match.venue && (
                <div className="flex items-center justify-center gap-1.5 mt-1.5">
                  <span className="text-[10px] text-muted-foreground">📍 {match.venue}</span>
                </div>
              )}
            </div>

            {/* Predicted outcome */}
            <div className="bg-muted/20 rounded-xl p-3 mb-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Market Condition</p>
              <p className="text-sm font-bold text-foreground">
                Resolves YES if: <span className="text-primary">{outcomeLabel}</span>
              </p>

              {/* Show result indicator if finished */}
              {match.isFinished && match.homeScore !== null && match.awayScore !== null && (
                <div className="mt-2 pt-2 border-t border-border/50">
                  {(() => {
                    const homeWin = match.homeScore > match.awayScore;
                    const awayWin = match.awayScore > match.homeScore;
                    const draw = match.homeScore === match.awayScore;
                    const predicted = predictedOutcome.toLowerCase();
                    const conditionMet =
                      (predicted === "home_win" && homeWin) ||
                      (predicted === "away_win" && awayWin) ||
                      (predicted === "draw" && draw);

                    return (
                      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${conditionMet ? "bg-green-500/15 border border-green-500/30" : "bg-destructive/10 border border-destructive/20"}`}>
                        <span className={`text-xs font-bold ${conditionMet ? "text-green-500" : "text-destructive"}`}>
                          {conditionMet ? "✅ Condition MET → Resolves YES" : "❌ Condition NOT met → Resolves NO"}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </>
        ) : (
          /* Fallback: no live data available */
          <>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/50 text-[10px] font-semibold text-muted-foreground uppercase">
                <Zap className="w-3 h-3" />
                {sportLabel}
              </div>
              <span className="text-[10px] text-muted-foreground">Match ID: {matchId}</span>
            </div>
            <div className="bg-muted/30 rounded-xl p-3 mb-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Predicted Outcome</p>
              <p className="text-sm font-bold text-foreground">{outcomeLabel}</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Resolves <span className="font-semibold text-foreground">YES</span> if this outcome occurs,{" "}
                <span className="font-semibold text-foreground">NO</span> otherwise
              </p>
            </div>
          </>
        )}

        {/* Last updated + Deadline */}
        <div className="flex items-center justify-between">
          {deadlineStr && (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>Deadline: <span className="font-semibold text-foreground">{deadlineStr}</span></span>
            </div>
          )}
          {lastUpdated && (
            <button
              onClick={fetchLiveScore}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
