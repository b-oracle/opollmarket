import { useMemo, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { format, startOfDay, startOfWeek, subDays } from "date-fns";

interface LogEntry {
  endpoint: string;
  created_at: string;
}

interface Props {
  logs: LogEntry[];
}

const RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "All", days: 0 },
];

export const KeyUsageChart = ({ logs }: Props) => {
  const [granularity, setGranularity] = useState<"daily" | "weekly">("daily");
  const [rangeDays, setRangeDays] = useState<number>(30);
  const [endpointFilter, setEndpointFilter] = useState<string>("all");

  const endpoints = useMemo(() => {
    const set = new Set<string>();
    logs.forEach(l => set.add(l.endpoint));
    return [...set].sort();
  }, [logs]);

  const filtered = useMemo(() => {
    const cutoff = rangeDays > 0 ? subDays(new Date(), rangeDays).getTime() : 0;
    return logs.filter(l => {
      const t = new Date(l.created_at).getTime();
      if (cutoff && t < cutoff) return false;
      if (endpointFilter !== "all" && l.endpoint !== endpointFilter) return false;
      return true;
    });
  }, [logs, rangeDays, endpointFilter]);

  const series = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const l of filtered) {
      const d = new Date(l.created_at);
      const bucketDate = granularity === "daily" ? startOfDay(d) : startOfWeek(d, { weekStartsOn: 1 });
      const key = format(bucketDate, "yyyy-MM-dd");
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({
        date,
        label: format(new Date(date), granularity === "daily" ? "MMM d" : "MMM d"),
        count,
      }));
  }, [filtered, granularity]);

  const total = filtered.length;

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(["daily", "weekly"] as const).map(g => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                granularity === g ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted"
              }`}
            >
              {g === "daily" ? "Daily" : "Weekly"}
            </button>
          ))}
        </div>

        <div className="flex rounded-lg border border-border overflow-hidden">
          {RANGES.map(r => (
            <button
              key={r.label}
              onClick={() => setRangeDays(r.days)}
              className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                rangeDays === r.days ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <select
          value={endpointFilter}
          onChange={e => setEndpointFilter(e.target.value)}
          className="text-[11px] bg-muted/30 border border-border rounded-lg px-2 py-1 outline-none"
        >
          <option value="all">All endpoints</option>
          {endpoints.map(ep => (
            <option key={ep} value={ep}>{ep}</option>
          ))}
        </select>

        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
          {total.toLocaleString()} requests
        </span>
      </div>

      {/* Chart */}
      {series.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-xs text-muted-foreground">
          No requests in this range
        </div>
      ) : (
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 6, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="reqFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                width={32}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#reqFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default KeyUsageChart;
