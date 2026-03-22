import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Radio, Clock, Zap, RefreshCw, ChevronDown, ChevronUp, Circle, ArrowRightLeft, Shield } from "lucide-react";
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

interface MatchEvent {
  time: number | null;
  extraTime: number | null;
  team: string;
  teamLogo: string;
  player: string;
  assist: string | null;
  type: string;
  detail: string;
}

interface MatchStat {
  type: string;
  home: string | number;
  away: string | number;
}

interface LineupPlayer {
  id: number;
  name: string;
  number: number | null;
  pos: string;
}

interface Lineup {
  team: string;
  teamLogo: string;
  formation: string;
  coach: string;
  startXI: LineupPlayer[];
  substitutes: LineupPlayer[];
}

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
  events?: MatchEvent[];
  statistics?: MatchStat[];
  lineups?: Lineup[];
}

interface SportsMatchTickerProps {
  sportType: string;
  matchId: string;
  predictedOutcome: string;
  league?: string;
  deadline?: string;
  marketStatus?: string;
}

type DetailTab = "events" | "stats" | "lineups";

function EventIcon({ type, detail }: { type: string; detail: string }) {
  const t = type.toLowerCase();
  const d = detail.toLowerCase();
  if (t === "goal") {
    if (d.includes("own")) return <span className="text-sm">🔴</span>;
    if (d.includes("penalty")) return <span className="text-sm">⚽️</span>;
    return <span className="text-sm">⚽</span>;
  }
  if (t === "card") {
    if (d.includes("red")) return <div className="w-3 h-4 rounded-[1px] bg-red-500" />;
    if (d.includes("yellow")) return <div className="w-3 h-4 rounded-[1px] bg-yellow-400" />;
    return <div className="w-3 h-4 rounded-[1px] bg-yellow-400" />;
  }
  if (t === "subst") return <ArrowRightLeft className="w-3.5 h-3.5 text-primary" />;
  if (t === "var") return <span className="text-[10px] font-black text-primary">VAR</span>;
  return <Circle className="w-3 h-3 text-muted-foreground" />;
}

function StatBar({ label, home, away }: { label: string; home: string | number; away: string | number }) {
  const hNum = typeof home === "string" ? parseFloat(home) || 0 : home;
  const aNum = typeof away === "string" ? parseFloat(away) || 0 : away;
  const total = hNum + aNum || 1;
  const hPct = (hNum / total) * 100;
  const aPct = (aNum / total) * 100;

  return (
    <div className="mb-2.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-bold tabular-nums text-foreground">{String(home).replace("%", "")}</span>
        <span className="text-[10px] text-muted-foreground font-medium">{label}</span>
        <span className="text-[11px] font-bold tabular-nums text-foreground">{String(away).replace("%", "")}</span>
      </div>
      <div className="flex gap-0.5 h-1.5 rounded-full overflow-hidden bg-muted/30">
        <div
          className="h-full rounded-l-full bg-primary transition-all duration-500"
          style={{ width: `${hPct}%` }}
        />
        <div
          className="h-full rounded-r-full bg-destructive/70 transition-all duration-500"
          style={{ width: `${aPct}%` }}
        />
      </div>
    </div>
  );
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
  const [showDetails, setShowDetails] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("events");

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

  const matchStartStr = match?.startTime
    ? new Date(match.startTime).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC"
    : null;

  const hasEvents = (match?.events?.length ?? 0) > 0;
  const hasStats = (match?.statistics?.length ?? 0) > 0;
  const hasLineups = (match?.lineups?.length ?? 0) > 0;
  const hasAnyDetails = hasEvents || hasStats || hasLineups;

  // Goal events for quick display
  const goals = match?.events?.filter(e => e.type.toLowerCase() === "goal") || [];

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

              {/* Goal Scorers (compact inline under scoreboard) */}
              {goals.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border/50">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                    {/* Home goals */}
                    <div className="flex flex-col items-start gap-0.5">
                      {goals.filter(g => g.team === match.homeTeam).map((g, i) => (
                        <span key={`hg-${i}`} className="text-[10px] text-muted-foreground">
                          ⚽ <span className="font-semibold text-foreground">{g.player}</span>
                          {g.time !== null && <span className="ml-1">{g.time}{g.extraTime ? `+${g.extraTime}` : ""}'</span>}
                          {g.detail.toLowerCase().includes("penalty") && <span className="ml-0.5 text-primary">(P)</span>}
                          {g.detail.toLowerCase().includes("own") && <span className="ml-0.5 text-destructive">(OG)</span>}
                        </span>
                      ))}
                    </div>
                    {/* Away goals */}
                    <div className="flex flex-col items-end gap-0.5">
                      {goals.filter(g => g.team === match.awayTeam).map((g, i) => (
                        <span key={`ag-${i}`} className="text-[10px] text-muted-foreground">
                          {g.detail.toLowerCase().includes("penalty") && <span className="mr-0.5 text-primary">(P)</span>}
                          {g.detail.toLowerCase().includes("own") && <span className="mr-0.5 text-destructive">(OG)</span>}
                          {g.time !== null && <span className="mr-1">{g.time}{g.extraTime ? `+${g.extraTime}` : ""}'</span>}
                          <span className="font-semibold text-foreground">{g.player}</span> ⚽
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Period Scores Breakdown */}
              {match.periodScores && match.periodScores.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border/50">
                  <div className="grid gap-0" style={{ gridTemplateColumns: `1fr repeat(${match.periodScores.length}, minmax(0, 1fr)) 1fr` }}>
                    <div className="text-[9px] text-muted-foreground font-medium py-1 px-1" />
                    {match.periodScores.map((p, i) => (
                      <div key={`h-${i}`} className="text-[9px] text-muted-foreground font-bold text-center py-1 uppercase">
                        {p.label}
                      </div>
                    ))}
                    <div className="text-[9px] text-muted-foreground font-bold text-center py-1">T</div>

                    <div className="text-[10px] font-semibold truncate py-1 px-1">{match.homeTeam.split(' ').pop()}</div>
                    {match.periodScores.map((p, i) => (
                      <div key={`hv-${i}`} className="text-[10px] font-bold text-center py-1 tabular-nums">
                        {p.home ?? '-'}
                      </div>
                    ))}
                    <div className="text-[10px] font-black text-center py-1 tabular-nums text-primary">{match.homeScore}</div>

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

            {/* Match Result + Market Condition */}
            <div className="bg-muted/20 rounded-xl p-3 mb-3">
              {/* Final match result */}
              {(match.isFinished || marketStatus === "resolved") && match.homeScore !== null && match.awayScore !== null && (
                <div className="mb-3 pb-3 border-b border-border/50">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Match Result</p>
                  <div className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm font-black text-foreground">
                      {match.homeScore > match.awayScore
                        ? `${match.homeTeam} Win`
                        : match.awayScore > match.homeScore
                          ? `${match.awayTeam} Win`
                          : "Draw"}
                    </span>
                    <span className="text-xs text-muted-foreground ml-auto tabular-nums font-bold">
                      {match.homeScore} – {match.awayScore}
                    </span>
                  </div>
                </div>
              )}

              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Market Condition</p>
              <p className="text-sm font-bold text-foreground">
                Resolves YES if: <span className="text-primary">{outcomeLabel}</span>
              </p>

              {/* Resolution indicator */}
              {(match.isFinished || marketStatus === "resolved") && match.homeScore !== null && match.awayScore !== null && (
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

            {/* Expandable Match Details (Events / Stats / Lineups) */}
            {hasAnyDetails && (
              <div className="mb-3">
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-muted/20 hover:bg-muted/30 transition-colors"
                >
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Match Details</span>
                  {showDetails ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>

                <AnimatePresence>
                  {showDetails && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      {/* Tabs */}
                      <div className="flex gap-1 mt-2 mb-3">
                        {hasEvents && (
                          <button
                            onClick={() => setDetailTab("events")}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors ${
                              detailTab === "events" ? "bg-primary/20 text-primary" : "bg-muted/20 text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            Events
                          </button>
                        )}
                        {hasStats && (
                          <button
                            onClick={() => setDetailTab("stats")}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors ${
                              detailTab === "stats" ? "bg-primary/20 text-primary" : "bg-muted/20 text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            Stats
                          </button>
                        )}
                        {hasLineups && (
                          <button
                            onClick={() => setDetailTab("lineups")}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors ${
                              detailTab === "lineups" ? "bg-primary/20 text-primary" : "bg-muted/20 text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            Lineups
                          </button>
                        )}
                      </div>

                      {/* Events Timeline */}
                      {detailTab === "events" && hasEvents && (
                        <div className="bg-muted/15 rounded-xl p-3 max-h-72 overflow-y-auto space-y-1">
                          {match.events!.map((ev, i) => (
                            <div
                              key={i}
                              className={`flex items-center gap-2.5 py-1.5 px-2 rounded-lg ${
                                ev.type.toLowerCase() === "goal" ? "bg-primary/5" : ""
                              }`}
                            >
                              <span className="text-[10px] font-bold tabular-nums text-muted-foreground w-8 text-right shrink-0">
                                {ev.time !== null ? `${ev.time}${ev.extraTime ? `+${ev.extraTime}` : ""}'` : ""}
                              </span>
                              <div className="w-5 flex items-center justify-center shrink-0">
                                <EventIcon type={ev.type} detail={ev.detail} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className={`text-[11px] font-semibold ${ev.type.toLowerCase() === "goal" ? "text-foreground" : "text-muted-foreground"}`}>
                                  {ev.player}
                                </span>
                                {ev.assist && ev.type.toLowerCase() === "goal" && (
                                  <span className="text-[10px] text-muted-foreground ml-1">(assist: {ev.assist})</span>
                                )}
                                {ev.type.toLowerCase() === "subst" && ev.assist && (
                                  <span className="text-[10px] text-muted-foreground ml-1">↔ {ev.assist}</span>
                                )}
                              </div>
                              {ev.teamLogo && (
                                <img src={ev.teamLogo} alt="" className="w-4 h-4 object-contain shrink-0" />
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Match Statistics */}
                      {detailTab === "stats" && hasStats && (
                        <div className="bg-muted/15 rounded-xl p-3">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-1.5">
                              {match.homeLogo && <img src={match.homeLogo} alt="" className="w-4 h-4 object-contain" />}
                              <span className="text-[10px] font-bold">{match.homeTeam.split(' ').pop()}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold">{match.awayTeam.split(' ').pop()}</span>
                              {match.awayLogo && <img src={match.awayLogo} alt="" className="w-4 h-4 object-contain" />}
                            </div>
                          </div>
                          {match.statistics!.map((stat, i) => (
                            <StatBar key={i} label={stat.type} home={stat.home} away={stat.away} />
                          ))}
                        </div>
                      )}

                      {/* Lineups */}
                      {detailTab === "lineups" && hasLineups && (
                        <div className="bg-muted/15 rounded-xl p-3 space-y-4">
                          {match.lineups!.map((lineup, li) => (
                            <div key={li}>
                              <div className="flex items-center gap-2 mb-2">
                                {lineup.teamLogo && <img src={lineup.teamLogo} alt="" className="w-5 h-5 object-contain" />}
                                <span className="text-xs font-bold">{lineup.team}</span>
                                {lineup.formation && (
                                  <span className="text-[10px] text-muted-foreground ml-auto font-mono">{lineup.formation}</span>
                                )}
                              </div>
                              {lineup.coach && (
                                <p className="text-[10px] text-muted-foreground mb-2 flex items-center gap-1">
                                  <Shield className="w-3 h-3" /> Coach: <span className="font-semibold text-foreground">{lineup.coach}</span>
                                </p>
                              )}
                              {/* Starting XI */}
                              <div className="mb-2">
                                <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1 font-bold">Starting XI</p>
                                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                                  {lineup.startXI.map((p, pi) => (
                                    <div key={pi} className="flex items-center gap-1.5 text-[10px]">
                                      {p.number !== null && (
                                        <span className="text-muted-foreground font-mono w-4 text-right">{p.number}</span>
                                      )}
                                      <span className="font-semibold text-foreground truncate">{p.name}</span>
                                      {p.pos && (
                                        <span className="text-[8px] text-primary font-bold shrink-0">{p.pos}</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                              {/* Substitutes */}
                              {lineup.substitutes.length > 0 && (
                                <div>
                                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1 font-bold">Substitutes</p>
                                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                                    {lineup.substitutes.map((p, pi) => (
                                      <div key={pi} className="flex items-center gap-1.5 text-[10px]">
                                        {p.number !== null && (
                                          <span className="text-muted-foreground font-mono w-4 text-right">{p.number}</span>
                                        )}
                                        <span className="text-muted-foreground truncate">{p.name}</span>
                                        {p.pos && (
                                          <span className="text-[8px] text-primary/60 font-bold shrink-0">{p.pos}</span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </>
        ) : (
          /* Fallback: no live data available */
          <>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/50 text-[10px] font-semibold text-muted-foreground uppercase">
                <Zap className="w-3 h-3" />
                {sportType.charAt(0).toUpperCase() + sportType.slice(1)}
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
