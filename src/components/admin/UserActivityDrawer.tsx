import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Loader2, Receipt, BarChart3, MessageSquare, Bookmark, Gift, TrendingUp, TrendingDown,
  ArrowUpFromLine, ArrowDownToLine, Zap, Banknote, Lock, Shield, ShieldOff, RotateCcw,
  Wallet, DollarSign, Trophy, Skull, Flame, ClipboardList, Store, Droplets, AlertCircle, Calculator
} from "lucide-react";
import { format } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import BalanceBreakdown from "./BalanceBreakdown";

interface UserActivityDrawerProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
}

type Tab = "breakdown" | "transactions" | "deposits" | "positions" | "quick_bets" | "comments" | "bookmarks" | "referrals" | "withdrawals" | "boosts" | "audit_log";

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: "breakdown", label: "Balance Breakdown", icon: Calculator },
  { key: "transactions", label: "Transactions", icon: Receipt },
  { key: "deposits", label: "Deposits", icon: ArrowDownToLine },
  { key: "positions", label: "Positions", icon: BarChart3 },
  { key: "quick_bets", label: "Quick Trades", icon: Zap },
  { key: "withdrawals", label: "Withdrawals", icon: Banknote },
  { key: "boosts", label: "Boosts", icon: Flame },
  { key: "comments", label: "Comments", icon: MessageSquare },
  { key: "bookmarks", label: "Bookmarks", icon: Bookmark },
  { key: "referrals", label: "Referrals", icon: Gift },
  { key: "audit_log", label: "Activity Log", icon: ClipboardList },
];

const SecuritySummary = ({ userId }: { userId: string }) => {
  const queryClient = useQueryClient();
  const [resetting, setResetting] = useState<string | null>(null);

  const { data: sec, isLoading } = useQuery({
    queryKey: ["admin-user-security", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_security_settings" as any)
        .select("pin_enabled, totp_enabled, require_pin_login, require_totp_login, require_pin_withdrawal, require_totp_withdrawal")
        .eq("user_id", userId)
        .maybeSingle();
      return data as any;
    },
    enabled: !!userId,
  });

  const handleReset = async (type: "pin" | "totp") => {
    const label = type === "pin" ? "PIN" : "2FA";
    if (!confirm(`Are you sure you want to reset this user's ${label}? They will need to set it up again.`)) return;
    setResetting(type);
    try {
      const { data, error } = await supabase.functions.invoke("admin-reset-security", {
        body: { target_user_id: userId, reset_type: type },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`${label} reset successfully`);
      queryClient.invalidateQueries({ queryKey: ["admin-user-security", userId] });
    } catch (err: any) {
      toast.error(err.message || `Failed to reset ${label}`);
    } finally {
      setResetting(null);
    }
  };

  if (isLoading || !sec) return null;

  const pinOn = sec.pin_enabled;
  const totpOn = sec.totp_enabled;
  const loginProtected = sec.require_pin_login || sec.require_totp_login;
  const withdrawProtected = sec.require_pin_withdrawal || sec.require_totp_withdrawal;

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
      {pinOn ? (
        <button
          onClick={() => handleReset("pin")}
          disabled={resetting === "pin"}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold hover:bg-primary/20 transition-colors cursor-pointer"
          title="Click to reset PIN"
        >
          {resetting === "pin" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Lock className="w-3 h-3" />}
          PIN
          <RotateCcw className="w-2.5 h-2.5 opacity-60" />
        </button>
      ) : (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-semibold">
          <Lock className="w-3 h-3" /> No PIN
        </span>
      )}
      {totpOn ? (
        <button
          onClick={() => handleReset("totp")}
          disabled={resetting === "totp"}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold hover:bg-primary/20 transition-colors cursor-pointer"
          title="Click to reset 2FA"
        >
          {resetting === "totp" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Shield className="w-3 h-3" />}
          2FA
          <RotateCcw className="w-2.5 h-2.5 opacity-60" />
        </button>
      ) : (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-semibold">
          <ShieldOff className="w-3 h-3" /> No 2FA
        </span>
      )}
      {loginProtected && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold">
          Login Protected
        </span>
      )}
      {withdrawProtected && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold">
          Withdrawal Protected
        </span>
      )}
      {!pinOn && !totpOn && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/10 text-destructive text-[10px] font-semibold">
          No Security
        </span>
      )}
    </div>
  );
};

const UserSummaryCards = ({ userId }: { userId: string }) => {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin-user-summary", userId],
    queryFn: async () => {
      const [txRes, qbRes, balRes, refRes, mktRes, liqRes, debtRes] = await Promise.all([
        supabase
          .from("transactions")
          .select("type, status, amount, side")
          .eq("user_id", userId)
          .eq("status", "confirmed"),
        supabase
          .from("quick_bets")
          .select("status, amount, payout")
          .eq("user_id", userId)
          .in("status", ["won", "lost"]),
        supabase
          .from("balances")
          .select("amount, bonus_balance")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("referral_rewards")
          .select("amount")
          .eq("referrer_id", userId),
        supabase
          .from("markets")
          .select("id", { count: "exact", head: true })
          .eq("creator_wallet", userId)
          .eq("status", "active"),
        supabase
          .from("transactions")
          .select("amount")
          .eq("user_id", userId)
          .eq("status", "confirmed")
          .eq("side", "initial_liquidity"),
        supabase
          .from("balance_debts")
          .select("amount")
          .eq("user_id", userId)
          .eq("status", "pending"),
      ]);

      const txns = txRes.data || [];
      const qbs = qbRes.data || [];
      const bal = balRes.data;
      const refs = refRes.data || [];
      const liqRows = liqRes.data || [];
      const debtRows = debtRes.data || [];

      const deposited = txns.filter(t => t.type === "deposit").reduce((s, t) => s + Number(t.amount), 0);
      const withdrawn = txns.filter(t => t.type === "withdrawal").reduce((s, t) => s + Number(t.amount), 0);
      const balance = bal ? Number(bal.amount) + Number(bal.bonus_balance ?? 0) : 0;

      const payouts = txns.filter(t => t.type === "payout").reduce((s, t) => s + Number(t.amount), 0);
      const refunds = txns.filter(t => t.type === "refund").reduce((s, t) => s + Number(t.amount), 0);
      const qtWins = qbs.filter(q => q.status === "won").reduce((s, q) => s + Number(q.payout || 0), 0);
      const refRewards = refs.reduce((s, r) => s + Number(r.amount), 0);
      const totalWins = payouts + refunds + qtWins + refRewards;

      const buys = txns.filter(t => t.type === "buy" && t.amount && (t as any).side !== "initial_liquidity" && (t as any).side !== "broadcast_fee").reduce((s, t) => s + Number(t.amount), 0);
      const qtLosses = qbs.filter(q => q.status === "lost").reduce((s, q) => s + Number(q.amount), 0);
      const totalLosses = Math.max(0, buys - payouts - refunds) + qtLosses;

      const activeMarkets = mktRes.count || 0;
      const liquidityAdded = liqRows.reduce((s, r: any) => s + Number(r.amount), 0);
      const outstandingDebt = debtRows.reduce((s, r: any) => s + Number(r.amount), 0);

      return { deposited, withdrawn, balance, totalWins, totalLosses, activeMarkets, liquidityAdded, outstandingDebt };
    },
    enabled: !!userId,
  });

  if (isLoading || !stats) return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />
      ))}
    </div>
  );

  const cards = [
    { label: "Deposited", value: stats.deposited, icon: ArrowDownToLine, cls: "text-primary", isCount: false },
    { label: "Withdrawn", value: stats.withdrawn, icon: ArrowUpFromLine, cls: "text-amber-500", isCount: false },
    { label: "Balance", value: stats.balance, icon: Wallet, cls: "text-foreground", isCount: false },
    { label: "Total Wins", value: stats.totalWins, icon: Trophy, cls: "text-green-500", isCount: false },
    { label: "Total Losses", value: stats.totalLosses, icon: Skull, cls: "text-red-500", isCount: false, negative: true },
    { label: "Active Markets", value: stats.activeMarkets, icon: Store, cls: "text-cyan-500", isCount: true },
    { label: "Liquidity Added", value: stats.liquidityAdded, icon: Droplets, cls: "text-blue-500", isCount: false },
    { label: "Outstanding Debt", value: stats.outstandingDebt, icon: AlertCircle, cls: stats.outstandingDebt > 0 ? "text-red-500" : "text-muted-foreground", isCount: false },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
      {cards.map((c: any) => (
        <div key={c.label} className="p-2.5 rounded-xl bg-muted/30 border border-border/50">
          <div className="flex items-center gap-1.5 mb-1">
            <c.icon className={`w-3.5 h-3.5 ${c.cls}`} />
            <span className="text-[10px] text-muted-foreground font-medium">{c.label}</span>
          </div>
          <p className={`text-sm font-bold ${c.cls}`}>
            {c.isCount
              ? c.value.toLocaleString()
              : `${c.negative ? "-" : ""}$${Number(c.value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </p>
        </div>
      ))}
    </div>
  );
};

const UserActivityDrawer = ({ open, onClose, userId, userName }: UserActivityDrawerProps) => {
  const [activeTab, setActiveTab] = useState<Tab>("breakdown");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    if (!open) return;
    setActiveTab("breakdown");
  }, [open, userId]);

  useEffect(() => {
    if (!open) return;
    if (activeTab === "breakdown") return; // handled by sub-component
    fetchTabData(activeTab);
  }, [open, activeTab, userId]);

  const fetchTabData = async (tab: Tab) => {
    setLoading(true);
    setData([]);
    let result: any[] = [];

    switch (tab) {
      case "transactions": {
        // Pull every recorded transaction (debit + credit) — admin needs full visibility
        const [{ data: txns }, { data: createdMarkets }] = await Promise.all([
          supabase
            .from("transactions")
            .select("*, markets(title)")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(500),
          // Synthesize creator-side debits (initial liquidity + creation fee) for markets
          // that were created before those rows were logged into the transactions table.
          supabase
            .from("markets")
            .select("id, title, liquidity, created_at, status")
            .eq("creator_wallet", userId)
            .neq("status", "draft")
            .order("created_at", { ascending: false })
            .limit(200),
        ]);

        const txList = (txns || []) as any[];

        // Build a set of market_ids that already have a logged liquidity_lock / market_creation_fee tx
        const loggedLiqMarkets = new Set(
          txList
            .filter((t) => t.market_id && (t.type === "liquidity_lock" || t.type === "market_creation_fee"))
            .map((t) => t.market_id),
        );

        const synthetic: any[] = [];
        for (const m of createdMarkets || []) {
          if (loggedLiqMarkets.has(m.id)) continue;
          if (Number(m.liquidity) > 0) {
            synthetic.push({
              id: `synthetic-liq-${m.id}`,
              type: "liquidity_lock",
              amount: Number(m.liquidity),
              status: "confirmed",
              created_at: m.created_at,
              market_id: m.id,
              markets: { title: m.title },
              description: "Initial liquidity locked at market creation (historical, reconstructed)",
              _synthetic: true,
            });
          }
        }

        // Re-classify generic "buy" rows that have no market_id — typically AI agent
        // generation fees ($0.50) and other platform fees. Keeps the original type but
        // tags a virtual sub-type for display.
        for (const t of txList) {
          if (t.type === "buy" && !t.market_id) {
            const amt = Number(t.amount);
            if (Math.abs(amt - 0.5) < 0.001) {
              t._virtualType = "ai_generation_fee";
            } else {
              t._virtualType = "platform_fee";
            }
          }
        }

        const merged = [...txList, ...synthetic].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        result = merged;
        break;
      }
      case "positions": {
        const { data: pos } = await supabase
          .from("positions")
          .select("*, markets(title)")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(50);
        result = pos || [];
        break;
      }
      case "quick_bets": {
        const { data: qb } = await supabase
          .from("quick_bets")
          .select("*, quick_rounds(asset, duration_seconds, result)")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(50);
        result = qb || [];
        break;
      }
      case "comments": {
        const { data: cmts } = await supabase
          .from("comments")
          .select("*")
          .eq("author_wallet", userId)
          .order("created_at", { ascending: false })
          .limit(50);
        result = cmts || [];
        break;
      }
      case "bookmarks": {
        const { data: bm } = await supabase
          .from("bookmarks")
          .select("*, markets(title)")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(50);
        result = bm || [];
        break;
      }
      case "referrals": {
        const { data: refs } = await supabase
          .from("referral_rewards")
          .select("*")
          .or(`referrer_id.eq.${userId},referred_id.eq.${userId}`)
          .order("created_at", { ascending: false })
          .limit(50);
        result = refs || [];
        break;
      }
      case "withdrawals": {
        const { data: wd } = await supabase
          .from("withdrawal_requests")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(50);
        result = wd || [];
        break;
      }
      case "deposits": {
        const { data: deps } = await supabase
          .from("transactions")
          .select("*, markets(title)")
          .eq("user_id", userId)
          .eq("type", "deposit")
          .order("created_at", { ascending: false })
          .limit(50);
        result = deps || [];
        break;
      }
      case "boosts": {
        const { data: bsts } = await supabase
          .from("market_boosts")
          .select("*, markets(title)")
          .eq("payer_wallet", userId)
          .order("created_at", { ascending: false })
          .limit(50);
        result = bsts || [];
        break;
      }
      case "audit_log": {
        const { data: events } = await supabase
          .from("analytics_events")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(100);
        result = events || [];
        break;
      }
    }

    setData(result);
    setLoading(false);
  };

  const formatDate = (d: string) => {
    try { return format(new Date(d), "MMM d, yyyy HH:mm"); } catch { return d; }
  };

  const getTypeBadge = (type: string) => {
    const map: Record<string, { cls: string; icon: any }> = {
      buy: { cls: "text-neon-yes", icon: TrendingUp },
      sell: { cls: "text-neon-no", icon: TrendingDown },
      deposit: { cls: "text-primary", icon: ArrowDownToLine },
      withdrawal: { cls: "text-amber-500", icon: ArrowUpFromLine },
      bet: { cls: "text-primary", icon: Zap },
      payout: { cls: "text-neon-yes", icon: Trophy },
      commission: { cls: "text-emerald-500", icon: DollarSign },
      refund: { cls: "text-blue-400", icon: RotateCcw },
      gift_sent: { cls: "text-pink-400", icon: Gift },
      gift_received: { cls: "text-pink-300", icon: Gift },
      qt_one_sided_bonus: { cls: "text-amber-400", icon: Zap },
      clawback: { cls: "text-red-500", icon: ShieldOff },
      liquidity_lock: { cls: "text-cyan-400", icon: Droplets },
      liquidity_unlock: { cls: "text-cyan-300", icon: Droplets },
      market_creation_fee: { cls: "text-orange-400", icon: Store },
      ai_generation_fee: { cls: "text-violet-400", icon: Zap },
      platform_fee: { cls: "text-slate-400", icon: Receipt },
      boost: { cls: "text-orange-500", icon: Flame },
      broadcast: { cls: "text-orange-500", icon: Flame },
      debt_settlement: { cls: "text-red-400", icon: AlertCircle },
    };
    return map[type] || { cls: "text-muted-foreground", icon: Receipt };
  };

  // Treat these types as outflows (debits) for the +/- sign rendering
  const DEBIT_TYPES = new Set([
    "buy", "withdrawal", "bet", "gift_sent", "clawback", "liquidity_lock",
    "market_creation_fee", "ai_generation_fee", "platform_fee", "boost",
    "broadcast", "debt_settlement",
  ]);

  const getStatusCls = (s: string) => {
    switch (s) {
      case "confirmed": case "won": return "text-neon-yes";
      case "pending": return "text-amber-500";
      case "lost": case "expired": case "cancelled": return "text-neon-no";
      default: return "text-muted-foreground";
    }
  };

  const renderContent = () => {
    if (activeTab === "breakdown") return <BalanceBreakdown userId={userId} />;
    if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 text-primary animate-spin" /></div>;
    if (data.length === 0) return <p className="text-center text-muted-foreground py-12 text-sm">No {TABS.find(t => t.key === activeTab)?.label.toLowerCase()} found</p>;

    switch (activeTab) {
      case "transactions":
        return (
          <div className="space-y-2">
            <p className="text-[10px] text-muted-foreground px-1">
              Showing {data.length} entries — every debit & credit, including AI fees and creator liquidity locks.
            </p>
            {data.map((tx: any) => {
              const effectiveType = tx._virtualType || tx.type;
              const badge = getTypeBadge(effectiveType);
              const Icon = badge.icon;
              const isDebit = DEBIT_TYPES.has(effectiveType);
              const sign = isDebit ? "-" : "+";
              const amountCls = isDebit ? "text-neon-no" : "text-neon-yes";
              const label = effectiveType.replace(/_/g, " ");
              return (
                <div key={tx.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/50">
                  <div className={`p-2 rounded-lg bg-muted ${badge.cls}`}><Icon className="w-4 h-4" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold uppercase">{label}</span>
                      <span className={`text-[10px] font-semibold uppercase ${getStatusCls(tx.status)}`}>{tx.status}</span>
                      {tx._synthetic && (
                        <span className="text-[9px] font-semibold uppercase text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
                          Reconstructed
                        </span>
                      )}
                      {tx._virtualType && !tx._synthetic && (
                        <span className="text-[9px] font-semibold uppercase text-violet-300 bg-violet-400/10 px-1.5 py-0.5 rounded">
                          inferred
                        </span>
                      )}
                    </div>
                    {tx.markets?.title && <p className="text-xs text-muted-foreground truncate mt-0.5">{tx.markets.title}</p>}
                    {tx.description && <p className="text-[10px] text-muted-foreground/80 mt-0.5 line-clamp-2">{tx.description}</p>}
                    <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(tx.created_at)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold ${amountCls}`}>{sign}${Number(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    {tx.shares != null && <p className="text-[10px] text-muted-foreground">{Number(tx.shares).toFixed(2)} shares</p>}
                  </div>
                </div>
              );
            })}
          </div>
        );

      case "positions":
        return (
          <div className="space-y-2">
            {data.map((p: any) => (
              <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/50">
                <div className={`p-2 rounded-lg bg-muted ${p.side === "yes" ? "text-neon-yes" : "text-neon-no"}`}>
                  {p.side === "yes" ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold uppercase">{p.side}</p>
                  {p.markets?.title && <p className="text-xs text-muted-foreground truncate mt-0.5">{p.markets.title}</p>}
                  <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(p.updated_at)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold">{Number(p.shares).toFixed(2)} shares</p>
                  <p className="text-[10px] text-muted-foreground">Avg ${Number(p.avg_price).toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        );

      case "quick_bets":
        return (
          <div className="space-y-2">
            {data.map((qb: any) => (
              <div key={qb.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/50">
                <div className={`p-2 rounded-lg bg-muted ${qb.side === "up" ? "text-neon-yes" : "text-neon-no"}`}>
                  {qb.side === "up" ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold">{qb.quick_rounds?.asset || "—"}</span>
                    <span className="text-[10px] uppercase font-semibold">{qb.side}</span>
                    <span className={`text-[10px] font-semibold uppercase ${getStatusCls(qb.status)}`}>{qb.status}</span>
                  </div>
                  {qb.streak > 0 && <p className="text-[10px] text-primary font-medium mt-0.5">🔥 Streak: {qb.streak}</p>}
                  <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(qb.created_at)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-bold ${qb.status === "lost" ? "text-neon-no" : ""}`}>
                    {qb.status === "lost" ? "-" : ""}${Number(qb.amount).toLocaleString()}
                  </p>
                  {qb.status === "won" && qb.payout > 0 && <p className="text-[10px] text-neon-yes font-medium">+${Number(qb.payout).toLocaleString()}</p>}
                </div>
              </div>
            ))}
          </div>
        );

      case "comments":
        return (
          <div className="space-y-2">
            {data.map((c: any) => (
              <div key={c.id} className="p-3 rounded-xl bg-muted/30 border border-border/50">
                <p className="text-sm">{c.content}</p>
                <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                  <span>{formatDate(c.created_at)}</span>
                  <span>❤️ {c.likes_count}</span>
                  <span className="truncate">Market: {c.market_id}</span>
                </div>
              </div>
            ))}
          </div>
        );

      case "bookmarks":
        return (
          <div className="space-y-2">
            {data.map((b: any) => (
              <div key={b.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/50">
                <Bookmark className="w-4 h-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{b.markets?.title || b.market_id}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(b.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        );

      case "referrals":
        return (
          <div className="space-y-2">
            {data.map((r: any) => (
              <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/50">
                <Gift className={`w-4 h-4 shrink-0 ${r.referrer_id === userId ? "text-neon-yes" : "text-primary"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold">{r.referrer_id === userId ? "Referred someone" : "Was referred by someone"}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(r.created_at)}</p>
                </div>
                {r.referrer_id === userId ? (
                  <p className="text-sm font-bold text-neon-yes shrink-0">+${Number(r.amount).toLocaleString()}</p>
                ) : (
                  <p className="text-sm font-bold text-muted-foreground shrink-0">${Number(r.amount).toLocaleString()}</p>
                )}
              </div>
            ))}
          </div>
        );

      case "withdrawals":
        return (
          <div className="space-y-2">
            {data.map((w: any) => {
              const statusCls = getStatusCls(w.status === "approved" ? "confirmed" : w.status === "rejected" ? "cancelled" : w.status);
              return (
                <div key={w.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/50">
                  <div className={`p-2 rounded-lg bg-muted text-amber-500`}><ArrowUpFromLine className="w-4 h-4" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase">{w.crypto_currency}</span>
                      <span className={`text-[10px] font-semibold uppercase ${statusCls}`}>{w.status}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">{w.wallet_address}</p>
                    {w.admin_note && <p className="text-[10px] text-muted-foreground mt-0.5">Note: {w.admin_note}</p>}
                    <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(w.created_at)}</p>
                  </div>
                  <p className="text-sm font-bold shrink-0">${Number(w.amount).toLocaleString()}</p>
                </div>
              );
            })}
          </div>
        );

      case "deposits":
        return (
          <div className="space-y-2">
            {data.map((tx: any) => {
              const statusCls = getStatusCls(tx.status);
              return (
                <div key={tx.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/50">
                  <div className="p-2 rounded-lg bg-muted text-primary"><ArrowDownToLine className="w-4 h-4" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase">Deposit</span>
                      <span className={`text-[10px] font-semibold uppercase ${statusCls}`}>{tx.status}</span>
                      {tx.payment_provider && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">{tx.payment_provider}</span>
                      )}
                    </div>
                    {tx.nowpayments_payment_id && <p className="text-[10px] text-muted-foreground truncate mt-0.5">NP: {tx.nowpayments_payment_id}</p>}
                    <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(tx.created_at)}</p>
                  </div>
                  <p className={`text-sm font-bold shrink-0 ${tx.status === "confirmed" ? "text-green-500" : ""}`}>
                    {tx.status === "confirmed" ? "+" : ""}${Number(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              );
            })}
          </div>
        );

      case "boosts":
        return (
          <div className="space-y-2">
            {data.map((b: any) => {
              const tierLabel: Record<string, string> = { flash: "⚡ Flash", standard: "🔥 Standard", whale: "👑 Whale" };
              const statusMap: Record<string, string> = {
                active: "text-green-500",
                pending: "text-amber-500",
                expired: "text-muted-foreground",
                cancelled: "text-destructive",
              };
              return (
                <div key={b.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/50">
                  <div className="p-2 rounded-lg bg-muted text-amber-500"><Flame className="w-4 h-4" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold">{tierLabel[b.tier] || b.tier}</span>
                      <span className={`text-[10px] font-semibold uppercase ${statusMap[b.status] || "text-muted-foreground"}`}>{b.status}</span>
                    </div>
                    {b.markets?.title && <p className="text-xs text-muted-foreground truncate mt-0.5">{b.markets.title}</p>}
                    <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(b.created_at)}</p>
                  </div>
                  <p className="text-sm font-bold shrink-0">${Number(b.amount).toFixed(2)}</p>
                </div>
              );
            })}
          </div>
        );

      case "audit_log":
        return (
          <div className="space-y-1.5">
            {data.map((e: any) => (
              <div key={e.id} className="flex items-start gap-3 p-2.5 rounded-xl bg-muted/30 border border-border/50">
                <ClipboardList className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold">{e.event_name?.replace(/_/g, " ")}</p>
                  {e.properties && Object.keys(e.properties).length > 0 && (
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                      {Object.entries(e.properties).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(e.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="relative w-full max-w-lg bg-background border-l border-border h-full flex flex-col z-10"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <div>
                <h3 className="text-lg font-bold">User Activities</h3>
                <p className="text-sm text-muted-foreground">{userName}</p>
                <SecuritySummary userId={userId} />
              </div>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-3 border-b border-border overflow-x-auto scrollbar-hide shrink-0">
              {TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    activeTab === key
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4" style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y", overscrollBehavior: "contain", willChange: "scroll-position" } as React.CSSProperties}>
              <UserSummaryCards userId={userId} />
              {renderContent()}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default UserActivityDrawer;
