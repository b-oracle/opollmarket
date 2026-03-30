import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Twitter, TrendingUp, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";

interface TwitterEngagementTrackerProps {
  metricType: string;
  resourceId: string;
  currentCount: number;
  marketId?: string;
  options?: { id: string; label: string; price: number }[];
  deadline?: string;
}

const METRIC_LABELS: Record<string, string> = {
  likes: "Likes",
  replies: "Replies",
  retweets: "Retweets",
  views: "Views",
  tweets: "Tweets",
  posts: "Posts",
};

const METRIC_ICONS: Record<string, string> = {
  likes: "❤️",
  replies: "💬",
  retweets: "🔁",
  views: "👁️",
  tweets: "🐦",
  posts: "📝",
};

function parseHumanNumber(str: string): number {
  const clean = str.replace(/,/g, "").trim();
  const match = clean.match(/^([\d.]+)\s*([kKmMbB])?(\+)?$/);
  if (!match) return NaN;
  const num = parseFloat(match[1]);
  const suffix = (match[2] || "").toLowerCase();
  if (suffix === "k") return num * 1_000;
  if (suffix === "m") return num * 1_000_000;
  if (suffix === "b") return num * 1_000_000_000;
  return num;
}

function parseBracketRange(label: string): { min: number; max: number } | null {
  // Strip trailing text like " Views", " Likes", " Posts" etc.
  const cleaned = label.replace(/\s*(views|likes|replies|retweets|tweets|posts|impressions)\s*$/i, "").trim();

  // Range: "4.1M - 8M", "80 - 99", "501k - 1.5M"
  const rangeMatch = cleaned.match(/^(.+?)\s*[-–]\s*(.+)$/);
  if (rangeMatch) {
    const min = parseHumanNumber(rangeMatch[1]);
    const maxStr = rangeMatch[2].trim();
    const hasPlus = maxStr.endsWith("+");
    const max = hasPlus ? Infinity : parseHumanNumber(maxStr);
    if (!isNaN(min) && (max === Infinity || !isNaN(max))) return { min, max };
  }

  // Less than: "< 500k", "< 50"
  const ltMatch = cleaned.match(/^[<≤]\s*(.+)$/);
  if (ltMatch) {
    const max = parseHumanNumber(ltMatch[1]);
    if (!isNaN(max)) return { min: 0, max };
  }

  // Greater than: "> 200", "> 60M", "60M+"
  const gtMatch = cleaned.match(/^[>≥]\s*(.+)$/);
  if (gtMatch) {
    const min = parseHumanNumber(gtMatch[1]);
    if (!isNaN(min)) return { min, max: Infinity };
  }

  // Standalone with +: "60M+"
  if (cleaned.endsWith("+")) {
    const min = parseHumanNumber(cleaned.slice(0, -1));
    if (!isNaN(min)) return { min, max: Infinity };
  }

  return null;
}

function getActiveRange(count: number, options: { label: string }[]): string | null {
  for (const opt of options) {
    const range = parseBracketRange(opt.label);
    if (range && count >= range.min && count <= range.max) return opt.label;
  }
  return null;
}

const TwitterEngagementTracker = ({
  metricType,
  resourceId,
  currentCount,
  marketId,
  options,
  deadline,
}: TwitterEngagementTrackerProps) => {
  const [liveCount, setLiveCount] = useState(currentCount);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchLiveCount = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-twitter-metrics", {
        body: { metric_type: metricType, resource_id: resourceId, market_id: marketId },
      });
      if (!error && data?.count !== null && data?.count !== undefined) {
        setLiveCount(data.count);
        setLastUpdated(new Date());
      }
    } catch {
      // Silently fail, keep existing count
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh every 60 seconds
  useEffect(() => {
    fetchLiveCount();
    const interval = setInterval(fetchLiveCount, 60_000);
    return () => clearInterval(interval);
  }, [metricType, resourceId]);

  const activeRange = options ? getActiveRange(liveCount, options) : null;
  const metricLabel = METRIC_LABELS[metricType] || metricType;
  const metricIcon = METRIC_ICONS[metricType] || "📊";

  // Calculate progress bar percentage based on options range
  let progressPercent = 0;
  if (options && options.length > 0) {
    const allRanges = options.map((o) => parseBracketRange(o.label)).filter(Boolean);
    const globalMin = Math.min(...allRanges.map((r) => r!.min));
    const globalMax = Math.max(...allRanges.filter((r) => r!.max !== Infinity).map((r) => r!.max));
    if (globalMax > globalMin) {
      progressPercent = Math.min(100, Math.max(0, ((liveCount - globalMin) / (globalMax - globalMin)) * 100));
    }
  }

  const timeLeft = deadline
    ? (() => {
        const diff = new Date(deadline).getTime() - Date.now();
        if (diff <= 0) return "Ended";
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h left`;
        return `${hours}h ${mins}m left`;
      })()
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-xl p-4 space-y-3"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[hsl(var(--primary))]/10 flex items-center justify-center">
            <Twitter className="w-4 h-4 text-[hsl(var(--primary))]" />
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">Live {metricLabel} Tracker</p>
            <p className="text-[10px] text-muted-foreground">X (Twitter) • Auto-updates every 60s</p>
          </div>
        </div>
        <button
          onClick={fetchLiveCount}
          disabled={loading}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Big number display */}
      <div className="text-center py-2">
        <span className="text-3xl font-bold text-foreground">{metricIcon} {liveCount.toLocaleString()}</span>
        <p className="text-xs text-muted-foreground mt-1">
          Current {metricLabel}
          {timeLeft && <span className="ml-2 text-[hsl(var(--primary))]">• {timeLeft}</span>}
        </p>
      </div>

      {/* Progress bar */}
      {options && options.length > 0 && (
        <div className="space-y-2">
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full rounded-full bg-[hsl(var(--primary))]"
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </div>

          {/* Range brackets */}
          <div className="grid gap-1.5">
            {options.map((opt) => {
              const isActive = opt.label === activeRange;
              return (
                <div
                  key={opt.id || opt.label}
                  className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-colors ${
                    isActive
                      ? "bg-[hsl(var(--primary))]/10 border border-[hsl(var(--primary))]/30 text-[hsl(var(--primary))] font-semibold"
                      : "bg-muted/50 text-muted-foreground"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {isActive && <TrendingUp className="w-3 h-3" />}
                    {opt.label}
                  </span>
                  <span>{(opt.price * 100).toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Last updated */}
      <p className="text-[10px] text-muted-foreground text-center">
        Updated {lastUpdated.toLocaleTimeString()}
      </p>
    </motion.div>
  );
};

export default TwitterEngagementTracker;
