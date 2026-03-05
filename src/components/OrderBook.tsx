import { useMemo, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface OrderBookProps {
  yesPrice: number; // 0-100
  noPrice: number;
  liquidity: number;
  marketId?: string;
}

interface OrderLevel {
  price: number;
  size: number;
  total: number;
}

interface RecentTrade {
  id: string;
  side: string;
  amount: number;
  price: number | null;
  shares: number | null;
  created_at: string;
}

const OrderBook = ({ yesPrice, noPrice, liquidity, marketId }: OrderBookProps) => {
  const queryClient = useQueryClient();

  // Fetch real recent trades for this market
  const { data: recentTrades = [] } = useQuery({
    queryKey: ["orderbook-trades", marketId],
    queryFn: async () => {
      if (!marketId) return [];
      const { data } = await supabase
        .from("transactions")
        .select("id, side, amount, price, shares, created_at")
        .eq("market_id", marketId)
        .in("type", ["buy", "sell"])
        .eq("status", "confirmed")
        .order("created_at", { ascending: false })
        .limit(20);
      return (data || []) as RecentTrade[];
    },
    enabled: !!marketId,
    refetchInterval: 15000,
  });

  // Subscribe to real-time trade updates
  useEffect(() => {
    if (!marketId) return;
    const channel = supabase
      .channel(`orderbook-${marketId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "transactions",
          filter: `market_id=eq.${marketId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["orderbook-trades", marketId] });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [marketId, queryClient]);

  // Derive AMM depth levels from liquidity & price
  // For an AMM, we calculate how many shares you can buy at each price level
  // based on the constant-product formula approximation
  const { bids, asks } = useMemo(() => {
    const levels = 8;
    const effectiveLiquidity = Math.max(liquidity, 100);

    // Calculate size at each price level using AMM depth curve
    // Size represents how many shares are available between this level and the next
    const bids: OrderLevel[] = [];
    let bidTotal = 0;
    for (let i = 0; i < levels; i++) {
      const price = Math.max(1, yesPrice - (i + 1) * 2);
      // AMM depth: more liquidity available further from current price
      const depthFactor = effectiveLiquidity / 10;
      const size = Math.round(depthFactor * (2 / (price / 100)) * (1 / (i + 1)) * 0.5);
      bidTotal += size;
      bids.push({ price, size: Math.max(1, size), total: bidTotal });
    }

    const asks: OrderLevel[] = [];
    let askTotal = 0;
    for (let i = 0; i < levels; i++) {
      const price = Math.min(99, yesPrice + (i + 1) * 2);
      const depthFactor = effectiveLiquidity / 10;
      const size = Math.round(depthFactor * (2 / ((100 - price) / 100)) * (1 / (i + 1)) * 0.5);
      askTotal += size;
      asks.push({ price, size: Math.max(1, size), total: askTotal });
    }

    return { bids, asks: asks.reverse() };
  }, [yesPrice, liquidity]);

  // Aggregate real trades into bid/ask volume at price levels
  const tradeVolume = useMemo(() => {
    const vol: Record<string, { buyVol: number; sellVol: number }> = {};
    recentTrades.forEach((t) => {
      const priceKey = t.price ? Math.round(t.price * 100).toString() : "0";
      if (!vol[priceKey]) vol[priceKey] = { buyVol: 0, sellVol: 0 };
      if (t.side === "yes") vol[priceKey].buyVol += t.amount;
      else vol[priceKey].sellVol += t.amount;
    });
    return vol;
  }, [recentTrades]);

  const maxTradeVol = useMemo(() => {
    let max = 0;
    Object.values(tradeVolume).forEach((v) => {
      max = Math.max(max, v.buyVol, v.sellVol);
    });
    return max;
  }, [tradeVolume]);

  const maxTotal = Math.max(
    bids[bids.length - 1]?.total || 0,
    asks[0]?.total || 0
  );

  const formatSize = (v: number) => {
    if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
    return v.toString();
  };

  const formatTimeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h`;
  };

  const spread = Math.abs(100 - yesPrice - noPrice);

  return (
    <div className="glass rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          Order Book
        </h3>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm" style={{ background: "hsl(var(--neon-yes))" }} />
            Bids
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm" style={{ background: "hsl(var(--neon-no))" }} />
            Asks
          </span>
        </div>
      </div>

      {/* Header */}
      <div className="grid grid-cols-3 text-[9px] text-muted-foreground uppercase tracking-wider mb-1.5 px-1">
        <span>Size</span>
        <span className="text-center">Price</span>
        <span className="text-right">Total</span>
      </div>

      {/* Asks (NO side) — red, top */}
      <div className="space-y-[2px] mb-1">
        {asks.map((level, i) => {
          const volKey = level.price.toString();
          const realVol = tradeVolume[volKey];
          return (
            <motion.div
              key={`ask-${level.price}`}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className="relative grid grid-cols-3 text-xs py-1 px-1 rounded-sm overflow-hidden"
            >
              <div
                className="absolute inset-y-0 right-0 rounded-sm"
                style={{
                  width: `${(level.total / maxTotal) * 100}%`,
                  background: "hsl(var(--neon-no) / 0.1)",
                }}
              />
              {realVol && (
                <div
                  className="absolute inset-y-0 right-0 rounded-sm"
                  style={{
                    width: `${Math.min((realVol.sellVol / (maxTradeVol || 1)) * 60, 60)}%`,
                    background: "hsl(var(--neon-no) / 0.25)",
                    borderRight: "2px solid hsl(var(--neon-no) / 0.5)",
                  }}
                />
              )}
              <span className="relative z-10 font-medium" style={{ color: "hsl(var(--neon-no))" }}>
                {formatSize(level.size)}
                {realVol && (
                  <span className="ml-1 text-[9px] opacity-70" title="Real trade volume">
                    (${formatSize(Math.round(realVol.sellVol))})
                  </span>
                )}
              </span>
              <span className="relative z-10 text-center font-mono font-semibold" style={{ color: "hsl(var(--neon-no))" }}>
                {level.price}¢
              </span>
              <span className="relative z-10 text-right text-muted-foreground">
                {formatSize(level.total)}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* Spread */}
      <div className="flex items-center justify-center gap-2 py-1.5 my-1 border-y border-border">
        <span className="text-[10px] text-muted-foreground">Spread</span>
        <span className="text-xs font-bold text-foreground">{spread}¢</span>
        <span className="text-[10px] text-muted-foreground">
          ({yesPrice > 0 ? ((spread / yesPrice) * 100).toFixed(1) : "0.0"}%)
        </span>
      </div>

      {/* Bids (YES side) — green, bottom */}
      <div className="space-y-[2px] mt-1">
        {bids.map((level, i) => {
          const volKey = level.price.toString();
          const realVol = tradeVolume[volKey];
          return (
            <motion.div
              key={`bid-${level.price}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className="relative grid grid-cols-3 text-xs py-1 px-1 rounded-sm overflow-hidden"
            >
              <div
                className="absolute inset-y-0 left-0 rounded-sm"
                style={{
                  width: `${(level.total / maxTotal) * 100}%`,
                  background: "hsl(var(--neon-yes) / 0.1)",
                }}
              />
              {realVol && (
                <div
                  className="absolute inset-y-0 left-0 rounded-sm"
                  style={{
                    width: `${Math.min((realVol.buyVol / (maxTradeVol || 1)) * 60, 60)}%`,
                    background: "hsl(var(--neon-yes) / 0.25)",
                    borderRight: "2px solid hsl(var(--neon-yes) / 0.5)",
                  }}
                />
              )}
              <span className="relative z-10 font-medium" style={{ color: "hsl(var(--neon-yes))" }}>
                {formatSize(level.size)}
                {realVol && (
                  <span className="ml-1 text-[9px] opacity-70" title="Real trade volume">
                    (${formatSize(Math.round(realVol.buyVol))})
                  </span>
                )}
              </span>
              <span className="relative z-10 text-center font-mono font-semibold" style={{ color: "hsl(var(--neon-yes))" }}>
                {level.price}¢
              </span>
              <span className="relative z-10 text-right text-muted-foreground">
                {formatSize(level.total)}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* Recent Trades Tape */}
      {recentTrades.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Recent Trades</h4>
          <div className="space-y-[2px] max-h-40 overflow-y-auto">
            {recentTrades.slice(0, 10).map((trade) => {
              const isYes = trade.side === "yes";
              return (
                <div key={trade.id} className="grid grid-cols-4 text-[11px] py-1 px-1 rounded-sm hover:bg-muted/30">
                  <span className="flex items-center gap-1">
                    {isYes ? (
                      <ArrowDownLeft className="w-3 h-3" style={{ color: "hsl(var(--neon-yes))" }} />
                    ) : (
                      <ArrowUpRight className="w-3 h-3" style={{ color: "hsl(var(--neon-no))" }} />
                    )}
                    <span className="font-semibold" style={{ color: isYes ? "hsl(var(--neon-yes))" : "hsl(var(--neon-no))" }}>
                      {isYes ? "YES" : "NO"}
                    </span>
                  </span>
                  <span className="font-mono text-center">
                    {trade.price ? `${Math.round(trade.price * 100)}¢` : "—"}
                  </span>
                  <span className="text-center font-medium">${trade.amount.toFixed(2)}</span>
                  <span className="text-right text-muted-foreground">{formatTimeAgo(trade.created_at)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderBook;
