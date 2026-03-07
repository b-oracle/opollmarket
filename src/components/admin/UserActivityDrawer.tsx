import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Loader2, Receipt, BarChart3, MessageSquare, Bookmark, Gift, TrendingUp, TrendingDown,
  ArrowUpFromLine, ArrowDownToLine, Zap, Banknote
} from "lucide-react";
import { format } from "date-fns";

interface UserActivityDrawerProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
}

type Tab = "transactions" | "positions" | "quick_bets" | "comments" | "bookmarks" | "referrals" | "withdrawals";

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: "transactions", label: "Transactions", icon: Receipt },
  { key: "positions", label: "Positions", icon: BarChart3 },
  { key: "quick_bets", label: "Quick Trades", icon: Zap },
  { key: "withdrawals", label: "Withdrawals", icon: Banknote },
  { key: "comments", label: "Comments", icon: MessageSquare },
  { key: "bookmarks", label: "Bookmarks", icon: Bookmark },
  { key: "referrals", label: "Referrals", icon: Gift },
];

const UserActivityDrawer = ({ open, onClose, userId, userName }: UserActivityDrawerProps) => {
  const [activeTab, setActiveTab] = useState<Tab>("transactions");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    if (!open) return;
    setActiveTab("transactions");
  }, [open, userId]);

  useEffect(() => {
    if (!open) return;
    fetchTabData(activeTab);
  }, [open, activeTab, userId]);

  const fetchTabData = async (tab: Tab) => {
    setLoading(true);
    setData([]);
    let result: any[] = [];

    switch (tab) {
      case "transactions": {
        const { data: txns } = await supabase
          .from("transactions")
          .select("*, markets(title)")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(50);
        result = txns || [];
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
    };
    return map[type] || { cls: "text-muted-foreground", icon: Receipt };
  };

  const getStatusCls = (s: string) => {
    switch (s) {
      case "confirmed": case "won": return "text-neon-yes";
      case "pending": return "text-amber-500";
      case "lost": case "expired": case "cancelled": return "text-neon-no";
      default: return "text-muted-foreground";
    }
  };

  const renderContent = () => {
    if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 text-primary animate-spin" /></div>;
    if (data.length === 0) return <p className="text-center text-muted-foreground py-12 text-sm">No {TABS.find(t => t.key === activeTab)?.label.toLowerCase()} found</p>;

    switch (activeTab) {
      case "transactions":
        return (
          <div className="space-y-2">
            {data.map((tx: any) => {
              const badge = getTypeBadge(tx.type);
              const Icon = badge.icon;
              return (
                <div key={tx.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/50">
                  <div className={`p-2 rounded-lg bg-muted ${badge.cls}`}><Icon className="w-4 h-4" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase">{tx.type}</span>
                      <span className={`text-[10px] font-semibold uppercase ${getStatusCls(tx.status)}`}>{tx.status}</span>
                    </div>
                    {tx.markets?.title && <p className="text-xs text-muted-foreground truncate mt-0.5">{tx.markets.title}</p>}
                    <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(tx.created_at)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold">${Number(tx.amount).toLocaleString()}</p>
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
                  <p className="text-sm font-bold">${Number(qb.amount).toLocaleString()}</p>
                  {qb.payout > 0 && <p className="text-[10px] text-neon-yes font-medium">+${Number(qb.payout).toLocaleString()}</p>}
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
                <Gift className={`w-4 h-4 shrink-0 ${r.referrer_id === userId ? "text-primary" : "text-neon-yes"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold">{r.referrer_id === userId ? "Referred someone" : "Was referred"}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(r.created_at)}</p>
                </div>
                <p className="text-sm font-bold text-neon-yes shrink-0">+${Number(r.amount).toLocaleString()}</p>
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
            <div className="flex-1 overflow-y-auto p-4">
              {renderContent()}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default UserActivityDrawer;
