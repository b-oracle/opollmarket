import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAccount } from "wagmi";
import { useAuth } from "@/hooks/useAuth";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  BarChart3,
  DollarSign,
  Target,
  Percent,
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  LogOut,
  Shield,
  Trophy,
} from "lucide-react";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import WinCelebrationModal from "@/components/WinCelebrationModal";
import { toast } from "sonner";

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

const Sparkline = ({ avgPrice, currentPrice, side, seed }: { avgPrice: number; currentPrice: number; side: string; seed: string }) => {
  const points = useMemo(() => {
    const count = 20;
    const seedNum = seed.charCodeAt(seed.length - 1);
    const pts: number[] = [];
    for (let i = 0; i < count; i++) {
      const progress = i / (count - 1);
      const base = avgPrice + (currentPrice - avgPrice) * progress;
      const noise = Math.sin(i * 1.3 + seedNum) * 3 + Math.cos(i * 0.7 + seedNum * 2) * 2;
      pts.push(base + noise);
    }
    pts[pts.length - 1] = currentPrice;
    return pts;
  }, [avgPrice, currentPrice, seed]);

  const min = Math.min(...points) - 1;
  const max = Math.max(...points) + 1;
  const w = 120;
  const h = 28;
  const isUp = currentPrice >= avgPrice;
  const color = isUp ? "hsl(var(--neon-yes))" : "hsl(var(--neon-no))";

  const pathD = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / (max - min)) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const areaD = pathD + ` L${w},${h} L0,${h} Z`;

  return (
    <div className="my-2">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: h }}>
        <defs>
          <linearGradient id={`spark-${seed}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.2} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <path d={areaD} fill={`url(#spark-${seed})`} />
        <path d={pathD} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={w} cy={h - ((currentPrice - min) / (max - min)) * h} r={2.5} fill={color} />
      </svg>
    </div>
  );
};

type EnrichedPosition = Position & { currentValue: number; unrealizedPnl: number; pnlPercent: number; maxPayout: number };

const Portfolio = () => {
  const { isConnected } = useAccount();
  const { user } = useAuth();
  const isAuthenticated = !!user || isConnected;
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterType>("all");
  const [sellTarget, setSellTarget] = useState<EnrichedPosition | null>(null);
  const [sellStep, setSellStep] = useState<"confirm" | "executing" | "success" | "error">("confirm");
  const [winModal, setWinModal] = useState<{ open: boolean; market: string; side: "YES" | "NO"; payout: number; profit: number }>({
    open: false, market: "", side: "YES", payout: 0, profit: 0,
  });

  const openSell = (pos: EnrichedPosition, e: React.MouseEvent) => {
    e.stopPropagation();
    setSellTarget(pos);
    setSellStep("confirm");
  };

  const closeSell = () => {
    setSellTarget(null);
    setSellStep("confirm");
  };

  const executeSell = useCallback(() => {
    setSellStep("executing");
    setTimeout(() => {
      if (Math.random() > 0.1) {
        setSellStep("success");
        toast.success("Position closed successfully!");
        // Trigger win celebration if profitable
        if (sellTarget && sellTarget.unrealizedPnl > 0) {
          setTimeout(() => {
            setWinModal({
              open: true,
              market: sellTarget.marketTitle,
              side: sellTarget.side.toUpperCase() as "YES" | "NO",
              payout: sellTarget.currentValue,
              profit: sellTarget.unrealizedPnl,
            });
          }, 600);
        }
      } else {
        setSellStep("error");
      }
    }, 2500);
  }, [sellTarget]);

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

  if (!isAuthenticated) {
    return (
      <div className="min-h-dvh bg-background pb-20">
        <TopBar />
        <div className="max-w-lg mx-auto px-4 pt-20 flex flex-col items-center justify-center min-h-[60dvh]">
          <div className="glass rounded-2xl p-8 text-center max-w-sm">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Wallet className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold mb-2">Sign In Required</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Sign in or connect your wallet to view your portfolio and active positions.
            </p>
            <button
              onClick={() => navigate("/auth")}
              className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              Sign In
            </button>
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
            <motion.div
              key={pos.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => navigate(`/market/${pos.marketId}`)}
              className="w-full glass rounded-xl p-4 text-left transition-all active:scale-[0.98] hover:bg-accent/30 cursor-pointer"
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

              {/* P&L bar + Sell button */}
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">P&L:</span>
                    <span className={`text-xs font-bold flex items-center gap-0.5 ${pos.unrealizedPnl >= 0 ? "neon-yes" : "neon-no"}`}>
                      {pos.unrealizedPnl >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      ${Math.abs(pos.unrealizedPnl).toFixed(2)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={(e) => openSell(pos, e)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-[10px] font-bold uppercase tracking-wider hover:bg-destructive/20 transition-all active:scale-95"
                >
                  <LogOut className="w-3 h-3" />
                  Sell
                </button>
              </div>
            </motion.div>
          ))}

          {filtered.length === 0 && (
            <div className="glass rounded-xl p-8 text-center">
              <BarChart3 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No positions match this filter.</p>
            </div>
          )}
        </div>
      </div>

      {/* Sell Confirmation Modal */}
      <AnimatePresence>
        {sellTarget && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeSell}
              className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, y: 100, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 100, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 max-w-lg mx-auto"
            >
              <div className="glass-strong rounded-t-3xl p-5 pb-8">
                <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto mb-4" />

                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold">Close Position</h2>
                  <button onClick={closeSell} className="w-8 h-8 rounded-full glass flex items-center justify-center">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <AnimatePresence mode="wait">
                  {sellStep === "confirm" && (
                    <motion.div key="confirm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <p className="text-xs text-muted-foreground mb-4 line-clamp-2">{sellTarget.marketTitle}</p>

                      <div className="glass rounded-xl p-4 mb-4 space-y-2.5">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Side</span>
                          <span className={`font-bold uppercase ${sellTarget.side === "yes" ? "neon-yes" : "neon-no"}`}>{sellTarget.side}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Shares</span>
                          <span className="font-semibold">{sellTarget.shares}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Avg Entry</span>
                          <span className="font-semibold">{sellTarget.avgPrice}¢</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Current Price</span>
                          <span className={`font-semibold ${sellTarget.currentPrice > sellTarget.avgPrice ? "neon-yes" : "neon-no"}`}>
                            {sellTarget.currentPrice}¢
                          </span>
                        </div>
                        <div className="border-t border-border pt-2 flex justify-between text-sm">
                          <span className="text-muted-foreground">Sale Proceeds</span>
                          <span className="font-bold text-lg">${sellTarget.currentValue.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Realized P&L</span>
                          <span className={`font-bold ${sellTarget.unrealizedPnl >= 0 ? "neon-yes" : "neon-no"}`}>
                            {sellTarget.unrealizedPnl >= 0 ? "+" : ""}${sellTarget.unrealizedPnl.toFixed(2)} ({sellTarget.pnlPercent >= 0 ? "+" : ""}{sellTarget.pnlPercent.toFixed(1)}%)
                          </span>
                        </div>
                      </div>

                      <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/50 border border-border mb-5">
                        <AlertTriangle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        <p className="text-[10px] text-muted-foreground">
                          Selling will close your entire position. Proceeds will be credited to your platform balance instantly.
                        </p>
                      </div>

                      <div className="flex gap-3">
                        <button onClick={closeSell} className="flex-1 glass py-3.5 rounded-xl font-semibold text-sm transition-all active:scale-95">
                          Cancel
                        </button>
                        <button
                          onClick={executeSell}
                          className="flex-1 bg-destructive text-destructive-foreground py-3.5 rounded-xl font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
                        >
                          <LogOut className="w-4 h-4" />
                          Confirm Sell
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {sellStep === "executing" && (
                    <motion.div key="executing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center py-8">
                      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}>
                        <Loader2 className="w-12 h-12 text-primary" />
                      </motion.div>
                      <h3 className="text-lg font-bold mt-4 mb-1">Selling Position...</h3>
                      <p className="text-sm text-muted-foreground">Executing trade on-chain</p>
                    </motion.div>
                  )}

                  {sellStep === "success" && (
                    <motion.div key="success" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center py-6">
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", damping: 10 }}
                        className="w-16 h-16 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center mb-4"
                      >
                        <CheckCircle2 className="w-8 h-8 text-primary" />
                      </motion.div>
                      <h3 className="text-lg font-bold mb-1">Position Closed!</h3>
                      <p className="text-sm text-muted-foreground text-center mb-2">
                        Sold {sellTarget.shares} {sellTarget.side.toUpperCase()} shares
                      </p>
                      <p className={`text-xl font-bold mb-4 ${sellTarget.unrealizedPnl >= 0 ? "neon-yes" : "neon-no"}`}>
                        {sellTarget.unrealizedPnl >= 0 ? "+" : ""}${sellTarget.unrealizedPnl.toFixed(2)}
                      </p>
                      <div className="glass rounded-xl p-3 w-full space-y-1.5 mb-5">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Proceeds</span>
                          <span className="font-semibold">${sellTarget.currentValue.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Tx Hash</span>
                          <span className="font-mono text-primary">0x4f8c...b72a</span>
                        </div>
                      </div>
                      <button onClick={closeSell} className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-semibold text-sm transition-all active:scale-95">
                        Done
                      </button>
                    </motion.div>
                  )}

                  {sellStep === "error" && (
                    <motion.div key="error" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center py-6">
                      <div className="w-16 h-16 rounded-full bg-destructive/20 border border-destructive/40 flex items-center justify-center mb-4">
                        <AlertTriangle className="w-8 h-8 text-destructive" />
                      </div>
                      <h3 className="text-lg font-bold mb-1">Sale Failed</h3>
                      <p className="text-sm text-muted-foreground text-center mb-5">Transaction rejected or failed. No shares were sold.</p>
                      <div className="flex gap-3 w-full">
                        <button onClick={closeSell} className="flex-1 glass py-3 rounded-xl font-semibold text-sm transition-all active:scale-95">Cancel</button>
                        <button onClick={() => setSellStep("confirm")} className="flex-1 bg-primary text-primary-foreground py-3 rounded-xl font-semibold text-sm transition-all active:scale-95">Try Again</button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <WinCelebrationModal
        open={winModal.open}
        onClose={() => setWinModal(prev => ({ ...prev, open: false }))}
        market={winModal.market}
        side={winModal.side}
        payout={winModal.payout}
        profit={winModal.profit}
      />

      <BottomNav />
    </div>
  );
};

export default Portfolio;
