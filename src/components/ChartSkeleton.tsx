/**
 * ChartSkeleton — shimmering placeholder for the probability chart.
 * Used while price history is being fetched, so the chart card never
 * looks empty even if prefetch fails or the network is slow.
 */
interface Props {
  height?: number;
  className?: string;
}

const ChartSkeleton = ({ height = 160, className = "" }: Props) => {
  // Pre-baked sine-ish polyline so it looks like a real probability curve
  const W = 300;
  const H = height;
  const points: string[] = [];
  for (let i = 0; i <= 30; i++) {
    const x = (i / 30) * W;
    const y =
      H / 2 +
      Math.sin(i / 3) * (H / 6) +
      Math.cos(i / 5) * (H / 10);
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  const line = points.join(" ");
  const area = `0,${H} ${line} ${W},${H}`;

  return (
    <div
      className={`relative w-full overflow-hidden rounded-lg ${className}`}
      style={{ height }}
      aria-busy="true"
      aria-label="Loading chart"
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full"
      >
        <defs>
          <linearGradient id="chart-skel-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.18} />
            <stop offset="100%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#chart-skel-grad)" />
        <polyline
          points={line}
          fill="none"
          stroke="hsl(var(--muted-foreground))"
          strokeOpacity={0.35}
          strokeWidth={1.5}
        />
      </svg>
      {/* Shimmer sweep */}
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-foreground/5 to-transparent" />
      <style>{`
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
};

export default ChartSkeleton;
