import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import DepositWithdrawModal from "@/components/DepositWithdrawModal";
import { useAuth } from "@/hooks/useAuth";
import { useUserBalance } from "@/hooks/useUserBalance";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Wallet, Gift, ArrowDownToLine, ArrowUpFromLine, ArrowUpRight, ArrowDownLeft,
  Repeat, LogIn, Send, MessageCircle, ExternalLink, ChevronRight,
  Video, FileText, HelpCircle, Shield, ClipboardCheck, Lock, Trophy,
} from "lucide-react";
import { motion } from "framer-motion";

type TxType = "buy" | "sell" | "deposit" | "withdraw";

const txConfig: Record<TxType, { icon: typeof ArrowUpRight; label: string; colorClass: string }> = {
  buy: { icon: ArrowDownLeft, label: "Buy", colorClass: "text-primary bg-primary/10" },
  sell: { icon: ArrowUpRight, label: "Sell", colorClass: "text-destructive bg-destructive/10" },
  deposit: { icon: ArrowDownToLine, label: "Deposit", colorClass: "text-primary bg-primary/10" },
  withdraw: { icon: ArrowUpFromLine, label: "Withdraw", colorClass: "text-muted-foreground bg-muted" },
};

const formatTimeAgo = (date: string) => {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

type FilterType = "all" | "trades" | "deposits";

const Profile = () => {
  const { user, loading: authLoading, isAdmin } = useAuth();
  const { balance } = useUserBalance();
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<"deposit" | "withdraw">("deposit");
  const [txFilter, setTxFilter] = useState<FilterType>("all");

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!user,
  });

  const { data: positions = [] } = useQuery({
    queryKey: ["positions", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("positions")
        .select("*")
        .eq("user_id", user.id);
      return data || [];
    },
    enabled: !!user,
  });

  const openDeposit = () => { setModalTab("deposit"); setModalOpen(true); };
  const openWithdraw = () => { setModalTab("withdraw"); setModalOpen(true); };

  const filteredTx = useMemo(() => {
    if (txFilter === "all") return transactions;
    if (txFilter === "trades") return transactions.filter((t: any) => t.type === "buy" || t.type === "sell");
    return transactions.filter((t: any) => t.type === "deposit" || t.type === "withdraw");
  }, [transactions, txFilter]);

  const displayName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "User";

  if (!authLoading && !user) {
    return (
      <div className="min-h-dvh bg-background pb-20">
        <TopBar />
        <div className="max-w-lg mx-auto px-4 pt-20 flex flex-col items-center justify-center" style={{ minHeight: "60vh" }}>
          <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mb-4">
            <Wallet className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-bold mb-2">Sign in to view your profile</h2>
          <p className="text-sm text-muted-foreground mb-6 text-center">Create an account or sign in to track your predictions, balances, and transaction history.</p>
          <button
            onClick={() => navigate("/auth")}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm transition-all active:scale-95"
          >
            <LogIn className="w-4 h-4" /> Sign In
          </button>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background pb-20">
      <TopBar />
      <div className="max-w-lg mx-auto px-4 pt-20">
        {/* Avatar */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 rounded-full bg-primary/20 border-2 border-primary/30 flex items-center justify-center mb-3">
            <span className="text-2xl font-bold text-primary">{displayName.charAt(0).toUpperCase()}</span>
          </div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold">{displayName}</h2>
            {isAdmin && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-bold uppercase tracking-wider border border-primary/20">
                <Shield className="w-3 h-3" />
                Admin
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{user?.email}</p>
        </div>

        {/* Balance + Stats */}
        <div className="glass rounded-xl p-4 mb-6 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Balance</p>
          <p className="text-3xl font-bold text-primary">${balance.toFixed(2)}</p>
          <p className="text-[10px] text-muted-foreground">USDT</p>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: "Predictions", value: positions.length.toString() },
            { label: "Win Rate", value: "—" },
            { label: "PnL", value: "—" },
          ].map(({ label, value }) => (
            <div key={label} className="glass rounded-xl p-3 text-center">
              <p className="text-lg font-bold">{value}</p>
              <p className="text-[10px] text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="space-y-3 mb-8">
          <button onClick={openDeposit} className="w-full glass rounded-xl p-4 flex items-center gap-3 hover:bg-accent/50 transition-colors active:scale-[0.98]">
            <ArrowDownToLine className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium">Deposit Funds</span>
          </button>
          <button onClick={openWithdraw} className="w-full glass rounded-xl p-4 flex items-center gap-3 hover:bg-accent/50 transition-colors active:scale-[0.98]">
            <ArrowUpFromLine className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium">Withdraw</span>
          </button>
          <button onClick={() => navigate("/rankings")} className="w-full glass rounded-xl p-4 flex items-center gap-3 hover:bg-accent/50 transition-colors active:scale-[0.98]">
            <Trophy className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium flex-1 text-left">Leaderboard</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
          <button onClick={() => navigate("/referrals")} className="w-full glass rounded-xl p-4 flex items-center gap-3 hover:bg-accent/50 transition-colors active:scale-[0.98]">
            <Gift className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium flex-1 text-left">Referral Program</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Transaction History */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Transaction History</h3>
            <Repeat className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex gap-2 mb-4">
            {(["all", "trades", "deposits"] as FilterType[]).map((f) => (
              <button key={f} onClick={() => setTxFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize ${txFilter === f ? "bg-primary text-primary-foreground" : "glass text-muted-foreground hover:text-foreground"}`}>
                {f === "deposits" ? "Deposits & Withdrawals" : f}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {filteredTx.map((tx: any, i: number) => {
              const cfg = txConfig[tx.type as TxType] || txConfig.buy;
              const Icon = cfg.icon;
              return (
                <motion.div key={tx.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className="glass rounded-xl p-3.5 flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${cfg.colorClass}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{cfg.label}</span>
                        {tx.side && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${tx.side === "yes" ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}`}>
                            {tx.side.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <span className={`text-sm font-bold ${tx.type === "buy" || tx.type === "withdraw" ? "text-destructive" : "text-primary"}`}>
                        {tx.type === "sell" || tx.type === "deposit" ? "+" : "-"}${Number(tx.amount).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">{formatTimeAgo(tx.created_at)}</span>
                      {tx.shares && <span className="text-[10px] text-muted-foreground">{Number(tx.shares).toFixed(1)} shares</span>}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {filteredTx.length === 0 && (
            <div className="glass rounded-xl p-8 text-center">
              <p className="text-sm text-muted-foreground">No transactions yet</p>
            </div>
          )}
        </div>

        {/* Social / Predict via */}
        <div className="mb-6">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Connect</h3>
          <div className="space-y-2">
            <a href="#" target="_blank" rel="noopener noreferrer" className="w-full glass rounded-xl p-4 flex items-center gap-3 hover:bg-accent/50 transition-colors active:scale-[0.98]">
              <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center shrink-0 text-sky-400">
                <Send className="w-5 h-5" />
              </div>
              <span className="text-sm font-medium flex-1">Predict via Telegram</span>
              <ExternalLink className="w-4 h-4 text-muted-foreground" />
            </a>
            <a href="#" target="_blank" rel="noopener noreferrer" className="w-full glass rounded-xl p-4 flex items-center gap-3 hover:bg-accent/50 transition-colors active:scale-[0.98]">
              <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center shrink-0 text-green-500">
                <MessageCircle className="w-5 h-5" />
              </div>
              <span className="text-sm font-medium flex-1">Predict via WhatsApp</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </a>
            <a href="#" target="_blank" rel="noopener noreferrer" className="w-full glass rounded-xl p-4 flex items-center gap-3 hover:bg-accent/50 transition-colors active:scale-[0.98]">
              <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center shrink-0 text-foreground">
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              </div>
              <span className="text-sm font-medium flex-1">Follow on X</span>
              <ExternalLink className="w-4 h-4 text-muted-foreground" />
            </a>
          </div>
        </div>

        {/* Resources */}
        <div className="mb-6">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Resources</h3>
          <div className="space-y-2">
            {[
              { icon: Video, label: "How-to Video Tutorials", href: "#" },
              { icon: FileText, label: "Documentation", href: "#" },
              { icon: HelpCircle, label: "Frequently Asked Questions", href: "#" },
            ].map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="w-full glass rounded-xl p-4 flex items-center gap-3 hover:bg-accent/50 transition-colors active:scale-[0.98]"
              >
                <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center shrink-0 text-muted-foreground">
                  <item.icon className="w-5 h-5" />
                </div>
                <span className="text-sm font-medium flex-1">{item.label}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </a>
            ))}
          </div>
        </div>

        {/* Legal */}
        <div className="mb-6">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Legal</h3>
          <div className="space-y-2">
            {[
              { icon: Shield, label: "Disclaimer", href: "#" },
              { icon: ClipboardCheck, label: "Terms & Conditions", href: "#" },
              { icon: Lock, label: "Privacy Policy", href: "#" },
            ].map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="w-full glass rounded-xl p-4 flex items-center gap-3 hover:bg-accent/50 transition-colors active:scale-[0.98]"
              >
                <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center shrink-0 text-muted-foreground">
                  <item.icon className="w-5 h-5" />
                </div>
                <span className="text-sm font-medium flex-1">{item.label}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </a>
            ))}
          </div>
        </div>
      </div>

      <DepositWithdrawModal open={modalOpen} onClose={() => setModalOpen(false)} initialTab={modalTab} />
      <BottomNav />
    </div>
  );
};

export default Profile;
