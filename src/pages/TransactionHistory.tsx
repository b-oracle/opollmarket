import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import DepositWithdrawModal from "@/components/DepositWithdrawModal";
import OutstandingDebtBanner from "@/components/OutstandingDebtBanner";
import TransactionStatusTracker, {
  buildWithdrawalStages,
  buildPayoutStages,
} from "@/components/TransactionStatusTracker";
import {
  ArrowLeft, ArrowUpRight, ArrowDownLeft, ArrowUpFromLine, ArrowDownToLine,
  Gift, Repeat, BarChart3, Sparkles, Zap, ArrowUp, ArrowDown, ChevronDown,
  ChevronRight, Copy, Undo2,
} from "lucide-react";

type TxType = "buy" | "sell" | "deposit" | "withdraw" | "withdrawal" | "commission" | "payout" | "refund" | "initial_liquidity" | "qt_one_sided_bonus" | "clawback";

const txConfig: Record<TxType, { icon: typeof ArrowUpRight; label: string; colorClass: string }> = {
  buy: { icon: ArrowDownLeft, label: "Prediction", colorClass: "text-primary bg-primary/10" },
  sell: { icon: ArrowUpRight, label: "Sell", colorClass: "text-destructive bg-destructive/10" },
  deposit: { icon: ArrowDownToLine, label: "Deposit", colorClass: "text-primary bg-primary/10" },
  withdraw: { icon: ArrowUpFromLine, label: "Withdrawal", colorClass: "text-muted-foreground bg-muted" },
  withdrawal: { icon: ArrowUpFromLine, label: "Withdrawal", colorClass: "text-muted-foreground bg-muted" },
  commission: { icon: BarChart3, label: "Commission", colorClass: "text-amber-500 bg-amber-500/10" },
  payout: { icon: Gift, label: "Payout", colorClass: "text-green-500 bg-green-500/10" },
  refund: { icon: Repeat, label: "Refund", colorClass: "text-blue-500 bg-blue-500/10" },
  initial_liquidity: { icon: Sparkles, label: "Market Liquidity", colorClass: "text-amber-500 bg-amber-500/10" },
  qt_one_sided_bonus: { icon: Zap, label: "Quick Trade Bonus", colorClass: "text-green-500 bg-green-500/10" },
  clawback: { icon: Undo2, label: "Clawback", colorClass: "text-orange-500 bg-orange-500/10" },
};

const formatTimeAgo = (date: string) => {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

type FilterType = "all" | "trades" | "deposits" | "withdrawals" | "quick_trades" | "payouts" | "refunds" | "sells";
type StatusFilter = "all" | "confirmed" | "pending" | "failed";

const TX_PER_PAGE = 20;

const TransactionHistory = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [txFilter, setTxFilter] = useState<FilterType>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [txPage, setTxPage] = useState(1);
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<"deposit" | "withdraw">("deposit");
  const [resumePaymentId, setResumePaymentId] = useState<string | null>(null);
  const [resumeProvider, setResumeProvider] = useState<string | null>(null);

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("transactions")
        .select("*, markets(title), market_options(label)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  const { data: quickBets = [] } = useQuery({
    queryKey: ["quick-bets-profile", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("quick_bets")
        .select("*, quick_rounds(*)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  const filteredTx = useMemo(() => {
    if (txFilter === "quick_trades") {
      let result = quickBets.map((qb: any) => ({
        id: qb.id,
        type: "quick_trade" as const,
        side: qb.side,
        amount: qb.amount,
        payout: qb.payout,
        status: qb.status === "won" ? "confirmed" : qb.status === "lost" ? "failed" : "pending",
        qtStatus: qb.status,
        created_at: qb.created_at,
        asset: qb.quick_rounds?.asset || "BTC",
        streak: qb.streak,
      }));
      if (statusFilter !== "all") {
        result = result.filter((t: any) =>
          statusFilter === "failed" ? (t.status === "failed") : t.status === statusFilter
        );
      }
      return result;
    }
    let result = transactions;
    result = result.filter((t: any) => t.type !== "commission");
    result = result.filter((t: any) => !((t.type === "withdraw" || t.type === "withdrawal") && t.status === "failed"));
    
    if (txFilter === "trades") result = result.filter((t: any) => t.type === "buy" || t.type === "sell");
    else if (txFilter === "deposits") result = result.filter((t: any) => t.type === "deposit");
    else if (txFilter === "withdrawals") result = result.filter((t: any) => t.type === "withdraw" || t.type === "withdrawal");
    else if (txFilter === "payouts") result = result.filter((t: any) => t.type === "payout");
    else if (txFilter === "refunds") result = result.filter((t: any) => t.type === "refund" || t.type === "one_sided_refund");
    else if (txFilter === "sells") result = result.filter((t: any) => t.type === "sell");

    if (statusFilter !== "failed") {
      result = result.filter((t: any) => !(t.type === "deposit" && t.status === "expired"));
    }

    if (statusFilter !== "all") {
      result = result.filter((t: any) =>
        statusFilter === "failed" ? (t.status === "failed" || t.status === "expired") : t.status === statusFilter
      );
    }
    return result;
  }, [transactions, quickBets, txFilter, statusFilter]);

  const txTotalPages = Math.max(1, Math.ceil(filteredTx.length / TX_PER_PAGE));
  const paginatedTx = useMemo(() => {
    const start = (txPage - 1) * TX_PER_PAGE;
    return filteredTx.slice(start, start + TX_PER_PAGE);
  }, [filteredTx, txPage]);

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <div className="max-w-lg mx-auto px-4 pb-28" style={{ paddingTop: 'calc(var(--content-top) + 0.75rem)' }}>
        <div className="flex items-center gap-3 mb-5">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg hover:bg-muted transition-colors -ml-2"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold">Transaction History</h1>
        </div>
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full glass flex items-center justify-center">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-lg font-bold">Transaction History</h1>
          <div className="flex-1" />
          <motion.button
            onClick={async () => {
              await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["transactions", user?.id] }),
                queryClient.invalidateQueries({ queryKey: ["quick-bets-profile", user?.id] }),
              ]);
              toast.success("Transactions refreshed");
            }}
            whileTap={{ rotate: 360 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
            className="w-8 h-8 rounded-full glass flex items-center justify-center hover:bg-muted transition-colors"
          >
            <Repeat className="w-4 h-4 text-muted-foreground" />
          </motion.button>
        </div>

        {/* Outstanding deposit debt — auto-settles on next deposit */}
        <OutstandingDebtBanner
          className="mb-4"
          onDeposit={() => {
            setModalTab("deposit");
            setModalOpen(true);
          }}
        />

        {/* Filters */}
        <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-hide flex-nowrap whitespace-nowrap">
          {(["all", "trades", "quick_trades", "deposits", "withdrawals", "payouts", "refunds", "sells"] as FilterType[]).map((f) => (
            <button key={f} onClick={() => { setTxFilter(f); setTxPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize shrink-0 ${txFilter === f ? "bg-primary text-primary-foreground" : "glass text-muted-foreground hover:text-foreground"}`}>
              {f === "deposits" ? "Deposits" : f === "withdrawals" ? "Withdrawals" : f === "quick_trades" ? "Quick Trades" : f === "trades" ? "Predictions" : f === "payouts" ? "Payouts" : f === "refunds" ? "Refunds" : f === "sells" ? "Sells" : f}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 mb-4">
          {(["all", "confirmed", "pending", "failed"] as StatusFilter[]).map((s) => (
            <button key={s} onClick={() => { setStatusFilter(s); setTxPage(1); }}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all capitalize ${
                statusFilter === s
                  ? s === "confirmed" ? "bg-green-500/20 text-green-500 ring-1 ring-green-500/30"
                  : s === "pending" ? "bg-yellow-500/20 text-yellow-500 ring-1 ring-yellow-500/30"
                  : s === "failed" ? "bg-destructive/20 text-destructive ring-1 ring-destructive/30"
                  : "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:text-foreground"
              }`}>
              {s === "confirmed" ? "✓ Confirmed" : s === "pending" ? "⏳ Pending" : s === "failed" ? "✗ Failed" : "All Status"}
            </button>
          ))}
        </div>

        {/* Transaction list */}
        <div className="space-y-2">
          {paginatedTx.map((tx: any, i: number) => {
            if (tx.type === "quick_trade") {
              const won = tx.qtStatus === "won";
              const lost = tx.qtStatus === "lost";
              const pnl = won ? Number(tx.payout) - Number(tx.amount) : lost ? -Number(tx.amount) : 0;
              const isExpanded = expandedTxId === tx.id;
              return (
                <motion.div key={tx.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  onClick={() => setExpandedTxId(isExpanded ? null : tx.id)}
                  className="glass rounded-xl p-3.5 cursor-pointer hover:ring-1 hover:ring-border transition-all">
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${won ? "bg-green-500/10 text-green-500" : lost ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>
                      {tx.side === "up" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold flex items-center gap-1">
                            <Zap className="w-3 h-3" /> {tx.side.toUpperCase()}
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{tx.asset}</span>
                          {tx.streak > 1 && <span className="text-[10px] text-amber-500 font-bold">🔥{tx.streak}</span>}
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${won ? "bg-green-500/10 text-green-500" : lost ? "bg-destructive/10 text-destructive" : "bg-yellow-500/10 text-yellow-500"}`}>
                            {won ? "✓ Won" : lost ? "✗ Lost" : "⏳ Pending"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-sm font-bold ${won ? "text-green-500" : lost ? "text-destructive" : "text-muted-foreground"}`}>
                            {won ? `+$${pnl.toFixed(2)}` : lost ? `-$${Number(tx.amount).toFixed(2)}` : `$${Number(tx.amount).toFixed(2)}`}
                          </span>
                          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">{formatTimeAgo(tx.created_at)}</span>
                        {won && tx.payout && <span className="text-[10px] text-muted-foreground">Payout: ${Number(tx.payout).toFixed(2)}</span>}
                      </div>
                    </div>
                  </div>
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                        <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-2 gap-2 text-[11px]">
                          <div><span className="text-muted-foreground">Asset</span><p className="font-semibold">{tx.asset}</p></div>
                          <div><span className="text-muted-foreground">Side</span><p className="font-semibold">{tx.side.toUpperCase()}</p></div>
                          <div><span className="text-muted-foreground">Wagered</span><p className="font-semibold">${Number(tx.amount).toFixed(2)}</p></div>
                          {won && tx.payout && <div><span className="text-muted-foreground">Payout</span><p className="font-semibold text-green-500">${Number(tx.payout).toFixed(2)}</p></div>}
                          {tx.streak > 0 && <div><span className="text-muted-foreground">Streak</span><p className="font-semibold">{tx.streak}x</p></div>}
                          <div className="col-span-2"><span className="text-muted-foreground">Date</span><p className="font-semibold">{new Date(tx.created_at).toLocaleString()}</p></div>
                          <div className="col-span-2"><span className="text-muted-foreground">Transaction ID</span><p className="font-mono text-[10px] text-muted-foreground truncate">{tx.id}</p></div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            }

            const isAiTx = tx.side?.startsWith("ai_");
            const aiSideLabels: Record<string, string> = {
              ai_generation: "Description/Details",
              ai_description: "Description",
              ai_details: "Details",
              ai_image: "Image",
              ai_market_creation: "AI Agent",
              ai_social_caption: "Social Caption",
              ai_social_image: "Social Image",
            };
            const txKey: TxType = (tx.type === "buy" && tx.side === "initial_liquidity") ? "initial_liquidity" : (tx.type as TxType);
            const cfg = isAiTx
              ? { icon: Sparkles, label: "AI Generation", colorClass: "text-violet-500 bg-violet-500/10" }
              : txConfig[txKey] || txConfig.buy;
            const Icon = cfg.icon;
            const isPendingDeposit = tx.type === "deposit" && (tx.status === "pending" || tx.status === "partial") && tx.nowpayments_payment_id;
            const isExpanded = expandedTxId === tx.id;
            const marketTitle = (tx as any).markets?.title;
            return (
              <motion.div key={tx.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                onClick={() => {
                  if (isPendingDeposit) {
                    setResumePaymentId(tx.nowpayments_payment_id);
                    setResumeProvider((tx as any).payment_provider || null);
                    setModalTab("deposit");
                    setModalOpen(true);
                    return;
                  }
                  setExpandedTxId(isExpanded ? null : tx.id);
                }}
                className="glass rounded-xl p-3.5 cursor-pointer hover:ring-1 hover:ring-border transition-all">
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${cfg.colorClass}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{cfg.label}</span>
                        {tx.is_copy_trade && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-accent text-accent-foreground border border-border">📋 Copied</span>
                        )}
                        {isAiTx && tx.side && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-500">
                            {aiSideLabels[tx.side] || tx.side}
                          </span>
                        )}
                        {!isAiTx && tx.side && tx.side !== "initial_liquidity" && (tx.type === "buy" || tx.type === "sell") && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${(tx as any).market_options?.label ? "bg-primary/15 text-primary" : tx.side === "yes" ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}`}>
                            {(tx as any).market_options?.label || tx.side.toUpperCase()}
                          </span>
                        )}
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          tx.status === "confirmed" ? "bg-green-500/10 text-green-500"
                          : tx.status === "pending" ? "bg-yellow-500/10 text-yellow-500"
                          : tx.status === "failed" || tx.status === "expired" ? "bg-destructive/10 text-destructive"
                          : "bg-muted text-muted-foreground"
                        }`}>
                          {tx.status === "confirmed" ? "✓ Confirmed" : tx.status === "pending" ? "⏳ Pending" : tx.status === "failed" ? "✗ Failed" : tx.status === "expired" ? "✗ Expired" : tx.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-sm font-bold ${tx.type === "clawback" ? "text-orange-500" : ["sell", "deposit", "payout", "refund", "commission", "qt_one_sided_bonus"].includes(tx.type) ? "text-green-500" : "text-destructive"}`}>
                          {tx.type === "clawback" ? "" : ["sell", "deposit", "payout", "refund", "commission", "qt_one_sided_bonus"].includes(tx.type) ? "+" : "-"}${Math.abs(Number(tx.amount)).toFixed(2)}
                        </span>
                        {isPendingDeposit ? (
                          <ChevronRight className="w-3.5 h-3.5 text-primary" />
                        ) : (
                          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground">{formatTimeAgo(tx.created_at)}</span>
                        {tx.type === "commission" && tx.side && tx.side !== "yes" && tx.side !== "no" && (
                          <span className="text-[10px] text-amber-500">from {tx.side}</span>
                        )}
                      </div>
                      {tx.shares && <span className="text-[10px] text-muted-foreground">{Number(tx.shares).toFixed(1)} shares</span>}
                      {isPendingDeposit && <span className="text-[10px] text-primary font-semibold">Tap to view →</span>}
                    </div>
                  </div>
                </div>
                {!isPendingDeposit && (
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                        {(tx.type === "withdraw" || tx.type === "withdrawal") && (
                          <div className="mt-3">
                            <TransactionStatusTracker
                              kind="withdrawal"
                              stages={buildWithdrawalStages({
                                status: tx.status,
                                created_at: tx.created_at,
                                updated_at: (tx as any).updated_at,
                                tx_hash: tx.tx_hash,
                                nowpayments_id: tx.nowpayments_payment_id,
                              })}
                              txHash={tx.tx_hash}
                              externalId={tx.nowpayments_payment_id}
                              network={(tx as any).crypto_currency || (tx as any).payment_provider}
                              failed={tx.status === "failed" || tx.status === "rejected"}
                              failedReason={(tx as any).admin_note || undefined}
                            />
                          </div>
                        )}
                        {(tx.type === "payout" || tx.type === "refund" || tx.type === "one_sided_refund") && (
                          <div className="mt-3">
                            <TransactionStatusTracker
                              kind="payout"
                              stages={buildPayoutStages(
                                { status: tx.status, created_at: tx.created_at, type: tx.type },
                                { resolved_at: (tx as any).markets?.resolved_at, status: (tx as any).markets?.status },
                              )}
                              externalId={tx.id}
                            />
                          </div>
                        )}
                        <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-2 gap-2 text-[11px]">
                          {marketTitle && (
                            <div className="col-span-2"><span className="text-muted-foreground">Market</span><p className="font-semibold truncate">{tx.market_id ? <span className="text-primary underline cursor-pointer" onClick={(e) => { e.stopPropagation(); navigate(`/market/${tx.market_id}`); }}>{marketTitle}</span> : marketTitle}</p></div>
                          )}
                          {tx.type === "commission" && tx.side && tx.side !== "yes" && tx.side !== "no" && (
                            <div className="col-span-2"><span className="text-muted-foreground">Copier</span><p className="font-semibold">{tx.side}</p></div>
                          )}
                          {(tx.type === "buy" || tx.type === "sell") && tx.side && tx.side !== "initial_liquidity" && (
                            <div><span className="text-muted-foreground">Side</span><p className="font-semibold">{tx.side.toUpperCase()}</p></div>
                          )}
                          {tx.price && (
                            <div><span className="text-muted-foreground">Price/Share</span><p className="font-semibold">${Number(tx.price).toFixed(2)}</p></div>
                          )}
                          {tx.shares && (
                            <div><span className="text-muted-foreground">Shares</span><p className="font-semibold">{Number(tx.shares).toFixed(2)}</p></div>
                          )}
                          <div><span className="text-muted-foreground">Amount</span><p className="font-semibold">${Number(tx.amount).toFixed(2)}</p></div>
                          {tx.nowpayments_payment_id && (
                            <div className="col-span-2"><span className="text-muted-foreground">Payment ID</span><div className="flex items-center gap-1"><p className="font-mono text-[10px] text-muted-foreground truncate">{tx.nowpayments_payment_id}</p><button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(tx.nowpayments_payment_id); toast.success("Payment ID copied"); }} className="shrink-0 p-0.5 rounded hover:bg-muted/50"><Copy className="w-3 h-3 text-muted-foreground" /></button></div></div>
                          )}
                          {tx.tx_hash && (
                            <div className="col-span-2"><span className="text-muted-foreground">Tx Hash</span><div className="flex items-center gap-1"><p className="font-mono text-[10px] text-muted-foreground truncate">{tx.tx_hash}</p><button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(tx.tx_hash); toast.success("Tx hash copied"); }} className="shrink-0 p-0.5 rounded hover:bg-muted/50"><Copy className="w-3 h-3 text-muted-foreground" /></button></div></div>
                          )}
                          <div className="col-span-2"><span className="text-muted-foreground">Date</span><p className="font-semibold">{new Date(tx.created_at).toLocaleString()}</p></div>
                          <div className="col-span-2"><span className="text-muted-foreground">Transaction ID</span><div className="flex items-center gap-1"><p className="font-mono text-[10px] text-muted-foreground truncate">{tx.id}</p><button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(tx.id); toast.success("Transaction ID copied"); }} className="shrink-0 p-0.5 rounded hover:bg-muted/50"><Copy className="w-3 h-3 text-muted-foreground" /></button></div></div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Pagination */}
        {filteredTx.length > TX_PER_PAGE && (
          <div className="flex items-center justify-center gap-3 mt-4">
            <button
              onClick={() => setTxPage((p) => Math.max(1, p - 1))}
              disabled={txPage === 1}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold glass text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="text-xs text-muted-foreground">Page {txPage} of {txTotalPages}</span>
            <button
              onClick={() => setTxPage((p) => Math.min(txTotalPages, p + 1))}
              disabled={txPage === txTotalPages}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold glass text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        )}

        {filteredTx.length === 0 && (
          <div className="glass rounded-xl p-8 text-center">
            <p className="text-sm text-muted-foreground">No transactions yet</p>
          </div>
        )}
      </div>

      <DepositWithdrawModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initialTab={modalTab}
        resumePaymentId={resumePaymentId}
        resumeProvider={resumeProvider}
      />
      <BottomNav />
    </div>
  );
};

export default TransactionHistory;
