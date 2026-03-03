import { useState, useEffect } from "react";
import { Zap, Flame, Crown } from "lucide-react";

interface BoostCountdownProps {
  endsAt: string;
  tier?: string;
  compact?: boolean;
}

const TIER_CONFIG: Record<string, { color: string; label: string; icon: typeof Zap }> = {
  flash: { color: "hsl(var(--primary))", label: "Flash Boost", icon: Zap },
  standard: { color: "hsl(280, 70%, 60%)", label: "Standard", icon: Flame },
  whale: { color: "hsl(45, 93%, 58%)", label: "Whale Pin", icon: Crown },
};

const formatCountdown = (ms: number) => {
  if (ms <= 0) return "Expired";
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
};

const BoostCountdown = ({ endsAt, tier, compact = false }: BoostCountdownProps) => {
  const [remaining, setRemaining] = useState(() => new Date(endsAt).getTime() - Date.now());
  const config = TIER_CONFIG[tier || "flash"] || TIER_CONFIG.flash;
  const Icon = config.icon;

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(new Date(endsAt).getTime() - Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [endsAt]);

  if (remaining <= 0) return null;

  const totalDuration = (() => {
    switch (tier) {
      case "flash": return 12 * 3600 * 1000;
      case "standard": return 24 * 3600 * 1000;
      case "whale": return 7 * 24 * 3600 * 1000;
      default: return 24 * 3600 * 1000;
    }
  })();

  const progress = Math.max(0, Math.min(100, (remaining / totalDuration) * 100));

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold" style={{ color: config.color }}>
        <Icon className="w-3 h-3" />
        {formatCountdown(remaining)}
      </span>
    );
  }

  return (
    <div className="glass rounded-lg px-3 py-2 flex items-center gap-2.5 min-w-0">
      <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: config.color }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold" style={{ color: config.color }}>{config.label}</span>
          <span className="text-[10px] font-bold text-foreground tabular-nums">
            {formatCountdown(remaining)}
          </span>
        </div>
        <div className="h-1 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{ width: `${progress}%`, backgroundColor: config.color }}
          />
        </div>
      </div>
    </div>
  );
};

export default BoostCountdown;
