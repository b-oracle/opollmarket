import { memo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer, ReferenceLine,
  Tooltip as RechartsTooltip, ComposedChart, Bar, Cell, Line
} from "recharts";
import TradingViewChart from "@/components/TradingViewChart";
import type { OHLCCandle } from "@/lib/cryptoPriceProvider";
import { Loader2 } from "lucide-react";

interface QuickTradeChartProps {
  chartType: "area" | "candle" | "tv";
  chartTimeframe: string;
  chartMs: number;
  priceHistory: { time: string; price: number; ts: number }[];
  ohlcData: OHLCCandle[];
  streamingPrice: number | null;
  historyLoading: boolean;
  activeRound: { open_price: number | null; created_at: string; duration_seconds: number } | null;
  userBet: { side: string } | null;
  resolveFlash: "win" | "lose" | null;
  timeframeLabel: string;
  assetClass?: "crypto" | "commodity" | "forex";
}

/** Format a price for tooltip display based on asset class */
function formatTooltipPrice(price: number, assetClass?: string): string {
  if (assetClass === "forex") return price.toFixed(4);
  if (assetClass === "commodity") return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  // Crypto
  if (price >= 1000) return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (price >= 1) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(6)}`;
}

function QuickTradeChart({
  chartType, chartMs, priceHistory, ohlcData, streamingPrice,
  historyLoading, activeRound, userBet, resolveFlash, timeframeLabel,
}: QuickTradeChartProps) {
  if (historyLoading) {
    return (
      <div className="relative h-[100px] overflow-hidden rounded-lg bg-muted/30">
        <div className="absolute inset-0 flex items-end gap-[3px] px-2 pb-2">
          {Array.from({ length: 40 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm bg-muted/50 animate-pulse"
              style={{
                height: `${20 + Math.sin(i * 0.4) * 15 + Math.random() * 10}%`,
                animationDelay: `${i * 50}ms`,
              }}
            />
          ))}
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/80 backdrop-blur-sm">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
            <span className="text-[10px] font-medium text-muted-foreground">Loading chart...</span>
          </div>
        </div>
      </div>
    );
  }

  if (chartType === "tv") {
    return (
      <TradingViewChart
        priceHistory={priceHistory}
        ohlcData={ohlcData}
        chartMs={chartMs}
        timeframeLabel={timeframeLabel}
        streamingPrice={streamingPrice}
        entryPrice={userBet && activeRound?.open_price ? Number(activeRound.open_price) : null}
        entrySide={userBet ? (userBet.side as "up" | "down") : null}
        roundEndTime={activeRound ? new Date(activeRound.created_at).getTime() + activeRound.duration_seconds * 1000 : null}
        targetPrice={userBet && activeRound?.open_price ? Number(activeRound.open_price) : null}
        resolveFlash={resolveFlash}
      />
    );
  }

  const cutoff = Date.now() - chartMs;
  const filtered = priceHistory.filter(pt => pt.ts >= cutoff);
  if (filtered.length < 2) {
    return (
      <div className="flex items-center justify-center h-[120px]">
        <p className="text-[10px] text-muted-foreground">Waiting for price data...</p>
      </div>
    );
  }

  const isUp = filtered[filtered.length - 1].price >= filtered[0].price;
  const upColor = "hsl(142, 76%, 36%)";
  const downColor = "hsl(0, 84%, 60%)";
  const color = isUp ? upColor : downColor;

  const tooltipContent = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    if (chartType === "candle") {
      return (
        <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-[11px]">
          <p className="text-muted-foreground mb-1">{new Date(d.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            <span className="text-muted-foreground">O</span><span className="font-mono font-semibold text-foreground">${d.open.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className="text-muted-foreground">H</span><span className="font-mono font-semibold text-foreground">${d.high.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className="text-muted-foreground">L</span><span className="font-mono font-semibold text-foreground">${d.low.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className="text-muted-foreground">C</span><span className="font-mono font-semibold text-foreground">${d.close.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className="text-muted-foreground">Vol</span><span className="font-mono font-semibold text-foreground">{d.volume}</span>
            {d.ma7 != null && <><span className="text-muted-foreground">MA7</span><span className="font-mono font-semibold" style={{ color: 'hsl(45, 93%, 58%)' }}>${d.ma7.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></>}
            {d.ma14 != null && <><span className="text-muted-foreground">MA14</span><span className="font-mono font-semibold" style={{ color: 'hsl(280, 80%, 65%)' }}>${d.ma14.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></>}
          </div>
        </div>
      );
    }
    return (
      <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-[11px]">
        <p className="font-semibold text-foreground">${Number(d.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        <p className="text-muted-foreground">{new Date(d.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
      </div>
    );
  };

  const targetReferenceLine = userBet && activeRound?.open_price ? (
    <ReferenceLine
      y={Number(activeRound.open_price)}
      stroke="#f59e0b"
      strokeDasharray="4 3"
      strokeOpacity={0.7}
      label={{ value: `Target $${Number(activeRound.open_price).toLocaleString()}`, position: "right", fill: "#f59e0b", fontSize: 9, fontWeight: 600 }}
    />
  ) : null;

  if (chartType === "candle") {
    const bucketMs = Math.max(Math.floor(chartMs / 30), 5000);
    const candles: { ts: number; open: number; high: number; low: number; close: number; volume: number; body: [number, number] }[] = [];
    if (filtered.length) {
      let bucketStart = filtered[0].ts;
      let bucket: number[] = [];
      for (const pt of filtered) {
        if (pt.ts - bucketStart >= bucketMs && bucket.length) {
          const o = bucket[0], c = bucket[bucket.length - 1];
          candles.push({ ts: bucketStart, open: o, high: Math.max(...bucket), low: Math.min(...bucket), close: c, volume: bucket.length, body: [Math.min(o, c), Math.max(o, c)] });
          bucketStart = pt.ts;
          bucket = [];
        }
        bucket.push(pt.price);
      }
      if (bucket.length) {
        const o = bucket[0], c = bucket[bucket.length - 1];
        candles.push({ ts: bucketStart, open: o, high: Math.max(...bucket), low: Math.min(...bucket), close: c, volume: bucket.length, body: [Math.min(o, c), Math.max(o, c)] });
      }
    }

    if (candles.length < 2) {
      return (
        <div className="flex items-center justify-center h-[120px]">
          <p className="text-[10px] text-muted-foreground">Not enough data for candles</p>
        </div>
      );
    }

    const allLows = candles.map(c => c.low);
    const allHighs = candles.map(c => c.high);
    const yMin = Math.min(...allLows);
    const yMax = Math.max(...allHighs);
    const padding = (yMax - yMin) * 0.1 || 1;

    const renderCandlestick = (props: any) => {
      const { x, y, width, height, payload } = props;
      if (!payload) return null;
      const isBullish = payload.close >= payload.open;
      const fill = isBullish ? upColor : downColor;
      const wickX = x + width / 2;
      const yScale = (val: number) => {
        const domain = [yMin - padding, yMax + padding];
        const range = [120 - 4, 4];
        return range[0] + ((val - domain[0]) / (domain[1] - domain[0])) * (range[1] - range[0]);
      };
      const wickTop = yScale(payload.high);
      const wickBottom = yScale(payload.low);
      return (
        <g>
          <line x1={wickX} y1={wickTop} x2={wickX} y2={wickBottom} stroke={fill} strokeWidth={1} />
          <rect x={x + 1} y={y} width={Math.max(width - 2, 2)} height={Math.max(height, 1)} fill={fill} rx={1} />
        </g>
      );
    };

    const withMA = candles.map((c, i) => {
      const ma7 = i >= 6 ? candles.slice(i - 6, i + 1).reduce((s, x) => s + x.close, 0) / 7 : undefined;
      const ma14 = i >= 13 ? candles.slice(i - 13, i + 1).reduce((s, x) => s + x.close, 0) / 14 : undefined;
      return { ...c, ma7, ma14 };
    });

    return (
      <>
        <ResponsiveContainer width="100%" height={120}>
          <ComposedChart data={withMA} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <YAxis domain={[yMin - padding, yMax + padding]} hide />
            <XAxis dataKey="ts" hide />
            <RechartsTooltip content={tooltipContent} cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1, strokeDasharray: '3 3' }} />
            {targetReferenceLine}
            <Bar dataKey="body" shape={renderCandlestick} isAnimationActive={false}>
              {withMA.map((c, i) => (
                <Cell key={i} fill={c.close >= c.open ? upColor : downColor} />
              ))}
            </Bar>
            <Line type="monotone" dataKey="ma7" stroke="hsl(45, 93%, 58%)" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
            <Line type="monotone" dataKey="ma14" stroke="hsl(280, 80%, 65%)" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
        <ResponsiveContainer width="100%" height={30}>
          <ComposedChart data={candles} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <XAxis dataKey="ts" hide />
            <YAxis domain={[0, 'dataMax']} hide />
            <Bar dataKey="volume" isAnimationActive={false} radius={[1, 1, 0, 0]}>
              {candles.map((c, i) => (
                <Cell key={i} fill={c.close >= c.open ? upColor : downColor} fillOpacity={0.35} />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-[10px] text-muted-foreground text-center mt-1">Last {timeframeLabel}</p>
      </>
    );
  }

  // Area chart (default)
  return (
    <>
      <ResponsiveContainer width="100%" height={120}>
        <AreaChart data={filtered} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis domain={["dataMin", "dataMax"]} hide />
          <XAxis dataKey="ts" hide />
          <RechartsTooltip content={tooltipContent} cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1, strokeDasharray: '3 3' }} />
          {targetReferenceLine}
          <Area type="monotone" dataKey="price" stroke={color} strokeWidth={2} fill="url(#priceGradient)" dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-muted-foreground text-center mt-1">Last {timeframeLabel}</p>
    </>
  );
}

export default memo(QuickTradeChart);
