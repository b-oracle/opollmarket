import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Radio, Loader2, CheckCircle2, Sparkles, Clock, Home } from "lucide-react";

interface Props {
  /** Round end / deadline timestamp (ISO). */
  endsAt: string;
  /** Round start timestamp (ISO). */
  startsAt?: string | null;
  /** Current market status from DB. */
  status?: "active" | "ended" | "resolved" | "cancelled" | string | null;
  className?: string;
}

const fmtClock = (ms: number) => {
  if (ms <= 0) return "00:00";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const fmtElapsed = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
};

/**
 * Seconds until the next 15-second tick — that's how often our resolve +
 * spawner pg_cron jobs fire. Used to give users an accurate ETA instead of
 * looping a stale "60s" countdown.
 */
const secondsToNextTick = (now: number) => {
  const s = new Date(now).getSeconds();
  const next = Math.ceil((s + 0.001) / 15) * 15;
  return Math.max(1, next - s);
};

type Stage = "live" | "resolving" | "payout" | "respawning" | "done";

/**
 * Live countdown + status timeline for auto-spawned crypto Up/Down rounds.
 * Visualizes the four phases of a round so users always know what's happening:
 *   1. LIVE          — round running, target line in play
 *   2. RESOLVING     — past deadline, waiting on the next per-minute resolve cron
 *   3. PAYING OUT    — resolved, settling positions
 *   4. NEXT ROUND    — spawner cron will start the next round on the next minute
 */
const CryptoRoundStatusTimeline = ({ endsAt, startsAt, status, className }: Props) => {
  const navigate = useNavigate();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const endMs = new Date(endsAt).getTime();
  const startMs = startsAt ? new Date(startsAt).getTime() : endMs;
  const remaining = endMs - now;
  const sinceEnd = now - endMs;

  // Stage logic — tightened for the 15s cron cadence.
  let stage: Stage;
  if (status === "resolved") {
    // After resolution the next 15s spawner tick fires almost immediately.
    stage = sinceEnd > 45_000 ? "done" : "respawning";
  } else if (remaining > 0) {
    stage = "live";
  } else if (sinceEnd < 5_000) {
    stage = "resolving";
  } else {
    // Resolve cron runs every 15s; payouts happen inside the same call.
    stage = sinceEnd < 30_000 ? "resolving" : "payout";
  }

  const nextTickEta = secondsToNextTick(now);

  // Round duration progress (for the LIVE bar)
  const totalDur = Math.max(1, endMs - startMs);
  const elapsed = Math.max(0, Math.min(totalDur, now - startMs));
  const progressPct = Math.min(100, (elapsed / totalDur) * 100);

  const steps: Array<{ key: Stage; label: string; icon: typeof Radio }> = [
    { key: "live", label: "Live", icon: Radio },
    { key: "resolving", label: "Resolving", icon: Loader2 },
    { key: "payout", label: "Paying out", icon: CheckCircle2 },
    { key: "respawning", label: "Next round", icon: Sparkles },
  ];

  const stageIndex = (k: Stage) => {
    if (k === "done") return 3;
    return steps.findIndex((s) => s.key === k);
  };
  const activeIdx = stageIndex(stage);

  // Headline copy per stage
  let headline = "";
  let sub = "";
  if (stage === "live") {
    headline = `Live · ends in ${fmtClock(remaining)}`;
    sub = "Trading open until deadline";
  } else if (stage === "resolving") {
    headline = `Resolving · ${fmtElapsed(sinceEnd)} since deadline`;
    sub = `Reading final price · ETA ${nextTickEta}s`;
  } else if (stage === "payout") {
    headline = `Settling payouts · ${fmtElapsed(sinceEnd)}`;
    sub = `Wallets crediting · ETA ${nextTickEta}s`;
  } else if (stage === "respawning") {
    headline = "Resolved · paid out";
    // Don't loop a stale countdown — once we've waited longer than a single
    // spawner cycle, switch to a definite "spawning now" message.
    sub = sinceEnd > 20_000
      ? "Spawning new round…"
      : `Next round spawns in ~${nextTickEta}s`;
  } else {
    headline = "Round complete";
    sub = "Refresh to see the next one";
  }

  return (
    <div
      className={`rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 ${className ?? ""}`}
      aria-label="Crypto round status timeline"
    >
      {/* Headline row */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {stage === "live" ? (
            <span className="relative flex items-center shrink-0">
              <span className="absolute inline-flex h-2 w-2 rounded-full bg-destructive opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
            </span>
          ) : stage === "resolving" || stage === "payout" ? (
            <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
          ) : stage === "respawning" ? (
            <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
          )}
          <span className="text-[12px] font-bold tabular-nums truncate">{headline}</span>
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 inline-flex items-center gap-1">
          <Clock className="w-3 h-3" /> {sub}
        </span>
      </div>

      {/* Progress bar (only meaningful while live) */}
      {stage === "live" && (
        <div className="h-1 w-full rounded-full bg-border/50 overflow-hidden mb-2">
          <div
            className="h-full bg-gradient-to-r from-[hsl(var(--neon-yes))] to-primary transition-[width] duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}

      {/* Stage timeline */}
      <ol className="flex items-center justify-between gap-1">
        {steps.map((s, i) => {
          const done = i < activeIdx || stage === "done";
          const active = i === activeIdx && stage !== "done";
          const Icon = s.icon;
          return (
            <li key={s.key} className="flex-1 flex items-center gap-1 min-w-0">
              <div
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider transition-colors min-w-0 ${
                  active
                    ? "bg-primary/15 text-primary"
                    : done
                      ? "text-foreground/80"
                      : "text-muted-foreground/60"
                }`}
                title={s.label}
              >
                <Icon
                  className={`w-3 h-3 shrink-0 ${
                    active && (s.key === "resolving" || s.key === "payout")
                      ? "animate-spin"
                      : active && s.key === "live"
                        ? "animate-pulse"
                        : ""
                  }`}
                />
                <span className="truncate">{s.label}</span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`flex-1 h-px ${
                    i < activeIdx ? "bg-primary/40" : "bg-border/50"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
};

export default CryptoRoundStatusTimeline;
