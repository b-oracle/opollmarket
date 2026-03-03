import { useMemo } from "react";
import { motion } from "framer-motion";
import { BarChart3 } from "lucide-react";

interface OrderBookProps {
  yesPrice: number; // 0-100
  noPrice: number;
  liquidity: number;
}

interface OrderLevel {
  price: number;
  size: number;
  total: number;
}

const OrderBook = ({ yesPrice, noPrice, liquidity }: OrderBookProps) => {
  const { bids, asks } = useMemo(() => {
    const levels = 8;
    const baseLiquidity = liquidity / 20;

    // YES bids (buy YES) — descending from current price
    const bids: OrderLevel[] = [];
    let bidTotal = 0;
    for (let i = 0; i < levels; i++) {
      const price = Math.max(1, yesPrice - (i + 1) * 2);
      const size = Math.round(baseLiquidity * (1 - i * 0.08) * (0.8 + Math.sin(i * 1.2) * 0.3));
      bidTotal += size;
      bids.push({ price, size, total: bidTotal });
    }

    // NO asks (buy NO / sell YES) — ascending from current price
    const asks: OrderLevel[] = [];
    let askTotal = 0;
    for (let i = 0; i < levels; i++) {
      const price = Math.min(99, yesPrice + (i + 1) * 2);
      const size = Math.round(baseLiquidity * (1 - i * 0.1) * (0.7 + Math.cos(i * 0.9) * 0.4));
      askTotal += size;
      asks.push({ price, size, total: askTotal });
    }

    return { bids, asks: asks.reverse() };
  }, [yesPrice, liquidity]);

  const maxTotal = Math.max(
    bids[bids.length - 1]?.total || 0,
    asks[0]?.total || 0
  );

  const formatSize = (v: number) => {
    if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
    return v.toString();
  };

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
            YES Bids
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm" style={{ background: "hsl(var(--neon-no))" }} />
            NO Asks
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
        {asks.map((level, i) => (
          <motion.div
            key={`ask-${level.price}`}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            className="relative grid grid-cols-3 text-xs py-1 px-1 rounded-sm overflow-hidden"
          >
            {/* Depth bar */}
            <div
              className="absolute inset-y-0 right-0 rounded-sm"
              style={{
                width: `${(level.total / maxTotal) * 100}%`,
                background: "hsl(var(--neon-no) / 0.1)",
              }}
            />
            <span className="relative z-10 font-medium" style={{ color: "hsl(var(--neon-no))" }}>
              {formatSize(level.size)}
            </span>
            <span className="relative z-10 text-center font-mono font-semibold" style={{ color: "hsl(var(--neon-no))" }}>
              {level.price}¢
            </span>
            <span className="relative z-10 text-right text-muted-foreground">
              {formatSize(level.total)}
            </span>
          </motion.div>
        ))}
      </div>

      {/* Spread */}
      <div className="flex items-center justify-center gap-2 py-1.5 my-1 border-y border-border">
        <span className="text-[10px] text-muted-foreground">Spread</span>
        <span className="text-xs font-bold text-foreground">
          {Math.abs(100 - yesPrice - noPrice)}¢
        </span>
        <span className="text-[10px] text-muted-foreground">
          ({((Math.abs(100 - yesPrice - noPrice)) / yesPrice * 100).toFixed(1)}%)
        </span>
      </div>

      {/* Bids (YES side) — green, bottom */}
      <div className="space-y-[2px] mt-1">
        {bids.map((level, i) => (
          <motion.div
            key={`bid-${level.price}`}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            className="relative grid grid-cols-3 text-xs py-1 px-1 rounded-sm overflow-hidden"
          >
            {/* Depth bar */}
            <div
              className="absolute inset-y-0 left-0 rounded-sm"
              style={{
                width: `${(level.total / maxTotal) * 100}%`,
                background: "hsl(var(--neon-yes) / 0.1)",
              }}
            />
            <span className="relative z-10 font-medium" style={{ color: "hsl(var(--neon-yes))" }}>
              {formatSize(level.size)}
            </span>
            <span className="relative z-10 text-center font-mono font-semibold" style={{ color: "hsl(var(--neon-yes))" }}>
              {level.price}¢
            </span>
            <span className="relative z-10 text-right text-muted-foreground">
              {formatSize(level.total)}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default OrderBook;
