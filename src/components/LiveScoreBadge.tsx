import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface LiveScoreBadgeProps {
  sportType: string;
  matchId: string;
}

interface ScoreData {
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  isLive: boolean;
  isFinished: boolean;
}

const LiveScoreBadge = ({ sportType, matchId }: LiveScoreBadgeProps) => {
  const [score, setScore] = useState<ScoreData | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchScore = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("get-live-score", {
          body: { sport: sportType, matchId },
        });
        if (!error && data?.match && !cancelled) {
          setScore(data.match);
        }
      } catch {
        // silently fail — badge just won't show
      }
    };

    fetchScore();
    // Poll every 60s on feed cards (less aggressive than detail page)
    const interval = setInterval(fetchScore, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [sportType, matchId]);

  if (!score) return null;

  // Abbreviate team names to 3 chars
  const abbr = (name: string) => {
    const words = name.split(/\s+/);
    if (words.length >= 2) return words.map(w => w[0]).join("").toUpperCase().slice(0, 3);
    return name.slice(0, 3).toUpperCase();
  };

  const hasScore = score.homeScore !== null && score.awayScore !== null;

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold tabular-nums backdrop-blur-sm ${
        score.isLive
          ? "bg-destructive/15 border border-destructive/30 text-destructive"
          : score.isFinished
          ? "bg-muted/60 border border-border text-muted-foreground"
          : "bg-primary/10 border border-primary/20 text-primary"
      }`}
    >
      {score.isLive && (
        <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse shrink-0" />
      )}
      {hasScore ? (
        <span>
          {abbr(score.homeTeam)} {score.homeScore} – {score.awayScore} {abbr(score.awayTeam)}
        </span>
      ) : (
        <span>{abbr(score.homeTeam)} vs {abbr(score.awayTeam)}</span>
      )}
    </div>
  );
};

export default LiveScoreBadge;
