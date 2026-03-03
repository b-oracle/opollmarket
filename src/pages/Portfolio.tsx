import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAccount } from "wagmi";
import { motion } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Filter,
  BarChart3,
  DollarSign,
  Target,
  Percent,
} from "lucide-react";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";

interface Position {
  id: string;
  marketId: string;
  marketTitle: string;
  side: "yes" | "no";
  shares: number;
  avgPrice: number; // cents
  currentPrice: number; // cents
  invested: number;
  category: string;
  endDate: string;
  status: "active" | "won" | "lost";
}

const MOCK_POSITIONS: Position[] = [
  {
    id: "p1",
    marketId: "1",
    marketTitle: "Will Bitcoin hit $150K before July 2026?",
    side: "yes",
    shares: 120,
    avgPrice: 55,
    currentPrice: 62,
    invested: 66,
    category: "Crypto",
    endDate: "2026-07-01",
    status: "active",
  },
  {
    id: "p2",
    marketId: "4",
    marketTitle: "Will the US enter a recession in 2026?",
    side: "no",
    shares: 80,
    avgPrice: 60,
    currentPrice: 66,
    invested: 48,
    category: "Economy",
    endDate: "2027-03-01",
    status: "active",
  },
  {
    id: "p3",
    marketId: "2",
    marketTitle: "Will AI pass the Turing Test by end of 2026?",
    side: "yes",
    shares: 200,
    avgPrice: 40,
    currentPrice: 45,
    invested: 80,
    category: "AI & Tech",
    endDate: "2026-12-31",
    status: "active",
  },
  {
    id: "p4",
    marketId: "5",
    marketTitle: "Will Taylor Swift announce a new album before September?",
    side: "yes",
    shares: 50,
    avgPrice: 72,
    currentPrice: 78,
    invested: 36,
    category: "Entertainment",
    endDate: "2026-09-01",
    status: "active",
  },
  {
    id: "p5",
    marketId: "6",
    marketTitle: "Will Ethereum flip Bitcoin in market cap by 2027?",
    side: "no",
    shares: 150,
    avgPrice: 82,
    currentPrice: 88,
    invested: 123,
    category: "Crypto",
    endDate: "2027-01-01",
    status: "active",
  },
];

type FilterType = "all" | "profit" | "loss";

const Portfolio = () => {
  const { isConnected } = useAccount();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterType>("all");

  const positions = MOCK_POSITIONS;

  // Calculate P&L for each position
  const enriched = positions.map((p) => {
    const currentValue = p.shares * (p.currentPrice / 100);
    const unrealizedPnl = currentValue - p.invested;
    const pnlPercent = (unrealizedPnl / p.invested) * 100;
    const maxPayout = p.shares; // $1 per share if correct
    return { ...p, currentValue, unrealizedPnl, pnlPercent, maxPayout };
  });

  const filtered = enriched.filter((p) => {
    if (filter === "profit") return p.unrealizedPnl > 0;
    if (filter === "loss") return p.unrealizedPnl < 0;
    return true;
  });

  // Portfolio totals
  const totalInvested = enriched.reduce((s, p) => s + p.invested, 0);
  const totalValue = enriched.reduce((s, p) => s + p.currentValue, 0);
  const totalPnl = totalValue - totalInvested;
  const totalPnlPercent = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;
  const totalMaxPayout = enriched.reduce((s, p) => s + p.maxPayout, 0);

  const getTimeRemaining = (endDate: string) => {
    const diff = new Date(endDate).getTime() - Date.now();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days > 30) return `${Math.floor(days / 30)}mo`;
    return `${days}d`;
  };

  if (!isConnected) {
    return (
      <div className="min-h-dvh bg-background pb-20">
        <TopBar />
        <div className="max-w-lg mx-auto px-4 pt-20 flex flex-col items-center justify-center min-h-[60dvh]">
          <div className="glass rounded-2xl p-8 text-center max-w-sm">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Wallet className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold mb-2">Connect Wallet</h2>
            <p className="text-sm text-muted-foreground">
              Connect your wallet to view your portfolio and active positions.
            </p>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background pb-20">
      <TopBar />
      <div className="max-w-lg mx-auto px-4 pt-20">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
          <h1 className="text-2xl font-bold mb-1">Portfolio</h1>
          <p className="text-sm text-muted-foreground">{enriched.length} active positions</p>
        </motion.div>

        {/* Summary cards */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="glass rounded-2xl p-4 mb-4"
        >
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Portfolio Value</p>
              <p className="text-2xl font-bold">${totalValue.toFixed(2)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Unrealized P&L</p>
              <p className={`text-2xl font-bold flex items-center justify-end gap-1 ${totalPnl >= 0 ? "neon-yes" : "neon-no"}`}>
                {totalPnl >= 0 ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                ${Math.abs(totalPnl).toFixed(2)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                <DollarSign className="w-3 h-3" />
                <span className="text-[10px]">Invested</span>
              </div>
              <p className="text-sm font-bold">${totalInvested.toFixed(0)}</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                <Percent className="w-3 h-3" />
                <span className="text-[10px]">ROI</span>
              </div>
              <p className={`text-sm font-bold ${totalPnlPercent >= 0 ? "neon-yes" : "neon-no"}`}>
                {totalPnlPercent >= 0 ? "+" : ""}{totalPnlPercent.toFixed(1)}%
              </p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                <Target className="w-3 h-3" />
                <span className="text-[10px]">Max Payout</span>
              </div>
              <p className="text-sm font-bold">${totalMaxPayout.toFixed(0)}</p>
            </div>
          </div>
        </motion.div>

        {/* Filter tabs */}
        <div className="flex gap-1 p-0.5 rounded-lg bg-muted/50 mb-4 w-fit">
          {([
            { key: "all" as FilterType, label: "All" },
            { key: "profit" as FilterType, label: "In Profit", icon: TrendingUp },
            { key: "loss" as FilterType, label: "At Loss", icon: TrendingDown },
          ]).map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                filter === f.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.icon && <f.icon className="w-3 h-3" />}
              {f.label}
            </button>
          ))}
        </div>

        {/* Positions list */}
        <div className="space-y-3">
          {filtered.map((pos, i) => (
            <motion.button
              key={pos.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => navigate(`/market/${pos.marketId}`)}
              className="w-full glass rounded-xl p-4 text-left transition-all active:scale-[0.98] hover:bg-accent/30"
            >
              {/* Top row: title + side badge */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <p className="text-sm font-semibold leading-tight flex-1 line-clamp-2">{pos.marketTitle}</p>
                <span
                  className={`shrink-0 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                    pos.side === "yes"
                      ? "bg-primary/15 text-primary border border-primary/30"
                      : "bg-destructive/15 text-destructive border border-destructive/30"
                  }`}
                >
                  {pos.side}
                </span>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-4 gap-2 mb-2">
                <div>
                  <p className="text-[9px] text-muted-foreground uppercase">Shares</p>
                  <p className="text-xs font-bold">{pos.shares}</p>
                </div>
                <div>
                  <p className="text-[9px] text-muted-foreground uppercase">Avg Price</p>
                  <p className="text-xs font-bold">{pos.avgPrice}¢</p>
                </div>
                <div>
                  <p className="text-[9px] text-muted-foreground uppercase">Current</p>
                  <p className={`text-xs font-bold ${pos.currentPrice > pos.avgPrice ? "neon-yes" : pos.currentPrice < pos.avgPrice ? "neon-no" : ""}`}>
                    {pos.currentPrice}¢
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-muted-foreground uppercase">Expires</p>
                  <p className="text-xs font-bold flex items-center gap-0.5">
                    <Clock className="w-2.5 h-2.5" />
                    {getTimeRemaining(pos.endDate)}
                  </p>
                </div>
              </div>

              {/* Sparkline */}
              <Sparkline avgPrice={pos.avgPrice} currentPrice={pos.currentPrice} side={pos.side} seed={pos.id} />

              {/* P&L bar */}
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">Invested:</span>
                  <span className="text-xs font-semibold">${pos.invested.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">P&L:</span>
                  <span className={`text-xs font-bold flex items-center gap-0.5 ${pos.unrealizedPnl >= 0 ? "neon-yes" : "neon-no"}`}>
                    {pos.unrealizedPnl >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    ${Math.abs(pos.unrealizedPnl).toFixed(2)} ({pos.pnlPercent >= 0 ? "+" : ""}{pos.pnlPercent.toFixed(1)}%)
                  </span>
                </div>
              </div>
            </motion.button>
          ))}

          {filtered.length === 0 && (
            <div className="glass rounded-xl p-8 text-center">
              <BarChart3 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No positions match this filter.</p>
            </div>
          )}
        </div>
      </div>
      <BottomNav />
    </div>
  );
};

export default Portfolio;
