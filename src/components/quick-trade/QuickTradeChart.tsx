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
  historyLoading, activeRound, userBet, resolveFlash, timeframeLabel, assetClass,
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

  const upColor = "hsl(142, 76%, 36%)";
  const downColor = "hsl(0, 84%, 60%)";

  // When user has a bet, color reflects P&L relative to their side
  const color = (() => {
    if (userBet && activeRound?.open_price) {
      const entry = Number(activeRound.open_price);
      const current = filtered[filtered.length - 1].price;
      const inProfit = userBet.side === "down"
        ? current < entry
        : current > entry;
      return inProfit ? upColor : downColor;
    }
    // No active bet: use price direction
    const isUp = filtered[filtered.length - 1].price >= filtered[0].price;
    return isUp ? upColor : downColor;
  })();

  const tooltipContent = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    if (chartType === "candle") {
      return (
        <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-[11px]">
          <p className="text-muted-foreground mb-1">{new Date(d.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            <span className="text-muted-foreground">O</span><span className="font-mono font-semibold text-foreground">{formatTooltipPrice(d.open, assetClass)}</span>
            <span className="text-muted-foreground">H</span><span className="font-mono font-semibold text-foreground">{formatTooltipPrice(d.high, assetClass)}</span>
            <span className="text-muted-foreground">L</span><span className="font-mono font-semibold text-foreground">{formatTooltipPrice(d.low, assetClass)}</span>
            <span className="text-muted-foreground">C</span><span className="font-mono font-semibold text-foreground">{formatTooltipPrice(d.close, assetClass)}</span>
            <span className="text-muted-foreground">Vol</span><span className="font-mono font-semibold text-foreground">{d.volume}</span>
            {d.ma7 != null && <><span className="text-muted-foreground">MA7</span><span className="font-mono font-semibold" style={{ color: 'hsl(45, 93%, 58%)' }}>{formatTooltipPrice(d.ma7, assetClass)}</span></>}
            {d.ma14 != null && <><span className="text-muted-foreground">MA14</span><span className="font-mono font-semibold" style={{ color: 'hsl(280, 80%, 65%)' }}>{formatTooltipPrice(d.ma14, assetClass)}</span></>}
          </div>
        </div>
      );
    }
    return (
      <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-[11px]">
        <p className="font-semibold text-foreground">{formatTooltipPrice(Number(d.price), assetClass)}</p>
        <p className="text-muted-foreground">{new Date(d.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
      </div>
    );
  };

  const entryPrice = userBet && activeRound?.open_price ? Number(activeRound.open_price) : null;
  const roundEndTs = activeRound
    ? new Date(activeRound.created_at).getTime() + activeRound.duration_seconds * 1000
    : null;

  const targetReferenceLine = entryPrice ? (
    <ReferenceLine
      y={entryPrice}
      stroke="#f59e0b"
      strokeDasharray="4 3"
      strokeOpacity={0.8}
      label={{ value: `📍 Entry ${formatTooltipPrice(entryPrice, assetClass)}`, position: "insideTopRight", fill: "#f59e0b", fontSize: 9, fontWeight: 600 }}
    />
  ) : null;

  const closeTimeReferenceLine = roundEndTs && userBet ? (
    <ReferenceLine
      x={roundEndTs}
      stroke="#ef4444"
      strokeDasharray="6 3"
      strokeOpacity={0.7}
      label={{ value: `⏱ Close ${new Date(roundEndTs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`, position: "insideTopLeft", fill: "#ef4444", fontSize: 9, fontWeight: 600 }}
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
    const maxVolume = Math.max(...candles.map(c => c.volume), 1);

    const chartHeight = 150;
    const candleAreaTop = 4;
    const candleAreaBottom = chartHeight * 0.25;
    const candleAreaHeight = chartHeight - candleAreaTop - candleAreaBottom;

    const renderCandlestick = (props: any) => {
      const { x, width, payload } = props;
      if (!payload) return null;
      const isBullish = payload.close >= payload.open;
      const fill = isBullish ? upColor : downColor;
      const wickX = x + width / 2;

      const domain0 = yMin - padding;
      const domain1 = yMax + padding;
      const yScale = (val: number) =>
        candleAreaTop + candleAreaHeight * (1 - (val - domain0) / (domain1 - domain0));

      const wickTop = yScale(payload.high);
      const wickBottom = yScale(payload.low);
      const bodyTop = yScale(Math.max(payload.open, payload.close));
      const bodyBottom = yScale(Math.min(payload.open, payload.close));
      const bodyHeight = Math.max(bodyBottom - bodyTop, 1);
      const bodyWidth = Math.max(Math.min(width * 0.5, 6), 2);
      const bodyX = x + (width - bodyWidth) / 2;

      const volHeight = (payload.volume / maxVolume) * (candleAreaBottom - 4);
      const volY = chartHeight - volHeight;
      const volWidth = Math.max(width * 0.7, 3);
      const volX = x + (width - volWidth) / 2;

      return (
        <g>
          <line x1={wickX} y1={wickTop} x2={wickX} y2={wickBottom} stroke={fill} strokeWidth={0.75} strokeOpacity={0.8} />
          <rect x={bodyX} y={bodyTop} width={bodyWidth} height={bodyHeight} fill={fill} rx={0.5} />
          <rect x={volX} y={volY} width={volWidth} height={volHeight} fill={fill} fillOpacity={0.25} rx={1} />
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
        <ResponsiveContainer width="100%" height={chartHeight}>
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
