import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Radio, Clock, Zap } from "lucide-react";

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

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  "NS": { label: "Not Started", color: "text-muted-foreground" },
  "1H": { label: "1st Half", color: "text-green-500" },
  "HT": { label: "Half Time", color: "text-yellow-500" },
  "2H": { label: "2nd Half", color: "text-green-500" },
  "ET": { label: "Extra Time", color: "text-orange-500" },
  "P": { label: "Penalties", color: "text-orange-500" },
  "FT": { label: "Full Time", color: "text-muted-foreground" },
  "AET": { label: "After ET", color: "text-muted-foreground" },
  "PEN": { label: "After Pens", color: "text-muted-foreground" },
  "Q1": { label: "Q1", color: "text-green-500" },
  "Q2": { label: "Q2", color: "text-green-500" },
  "Q3": { label: "Q3", color: "text-green-500" },
  "Q4": { label: "Q4", color: "text-green-500" },
  "OT": { label: "Overtime", color: "text-orange-500" },
  "LIVE": { label: "Live", color: "text-green-500" },
  "FIN": { label: "Finished", color: "text-muted-foreground" },
};

interface MatchData {
  homeTeam: string;
  awayTeam: string;
  homeLogo?: string;
  awayLogo?: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  isLive: boolean;
  isFinished: boolean;
  startTime?: string;
}

interface SportsMatchTickerProps {
  sportType: string;
  matchId: string;
  predictedOutcome: string;
  league?: string;
  deadline?: string;
}

export default function SportsMatchTicker({
  sportType,
  matchId,
  predictedOutcome,
  league,
  deadline,
}: SportsMatchTickerProps) {
  const [match, setMatch] = useState<MatchData | null>(null);
  const [loading, setLoading] = useState(true);

  // We can't call API-Football from the browser (CORS + key exposure),
  // so we show a static display based on the market data
  // The edge function handles the actual API calls
  useEffect(() => {
    // Show what we know from market data
    setLoading(false);
  }, [sportType, matchId]);

  const statusInfo = match?.status ? STATUS_MAP[match.status] || { label: match.status, color: "text-muted-foreground" } : null;

  const deadlineStr = deadline
    ? new Date(deadline).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC"
    : null;

  const outcomeLabel = predictedOutcome
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const sportLabel = sportType.charAt(0).toUpperCase() + sportType.slice(1);

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 overflow-hidden mb-4">
      {/* Header with LIVE badge */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
            <Trophy className="w-3.5 h-3.5 text-primary" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-primary">Sports Auto-Resolve</span>
            {league && (
              <span className="text-[10px] text-muted-foreground ml-2">{league}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-destructive/15 border border-destructive/30">
          <Radio className="w-3 h-3 text-destructive animate-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-destructive">Live</span>
        </div>
      </div>

      {/* Match info */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/50 text-[10px] font-semibold text-muted-foreground uppercase">
            <Zap className="w-3 h-3" />
            {sportLabel}
          </div>
          <span className="text-[10px] text-muted-foreground">Match ID: {matchId}</span>
        </div>

        {/* Predicted outcome */}
        <div className="bg-muted/30 rounded-xl p-3 mb-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Predicted Outcome</p>
          <p className="text-sm font-bold text-foreground">{outcomeLabel}</p>
          <p className="text-[10px] text-muted-foreground mt-1">
            Resolves <span className="font-semibold text-foreground">YES</span> if this outcome occurs,{" "}
            <span className="font-semibold text-foreground">NO</span> otherwise
          </p>
        </div>

        {/* Deadline */}
        {deadlineStr && (
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>Deadline: <span className="font-semibold text-foreground">{deadlineStr}</span></span>
          </div>
        )}
      </div>
    </div>
  );
}
