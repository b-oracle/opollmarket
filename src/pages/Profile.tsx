import { useState, useMemo, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import DepositWithdrawModal from "@/components/DepositWithdrawModal";
import InstallAppModal from "@/components/InstallAppModal";
import { useAuth } from "@/hooks/useAuth";
import { useUserBalance } from "@/hooks/useUserBalance";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { bsc } from "wagmi/chains";
import {
  Wallet, Gift, ArrowDownToLine, ArrowUpFromLine, ArrowUpRight, ArrowDownLeft,
  Repeat, LogIn, Send, MessageCircle, ExternalLink, ChevronRight,
  Video, HelpCircle, Shield, ClipboardCheck, Lock, Trophy, Pencil, Download, Copy, Link2, Unlink,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";


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
  const { toast } = useToast();
  const { user, loading: authLoading, isAdmin } = useAuth();
  const { balance, bonusBalance } = useUserBalance();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<"deposit" | "withdraw">("deposit");
  const [txFilter, setTxFilter] = useState<FilterType>("all");
  const [editingProfile, setEditingProfile] = useState(false);
  const [editName, setEditName] = useState(user?.user_metadata?.display_name || "");
  const [installOpen, setInstallOpen] = useState(false);
  const [walletCopied, setWalletCopied] = useState(false);

  // Fetch profile wallet address
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("wallet_address")
        .eq("id", user.id)
        .single();
      return data;
    },
    enabled: !!user,
  });

  // Save wallet to profile when connected
  useEffect(() => {
    if (user && isConnected && address && profile && !profile.wallet_address) {
      (async () => {
        await supabase
          .from("profiles")
          .update({ wallet_address: address })
          .eq("id", user.id);
        queryClient.invalidateQueries({ queryKey: ["profile", user.id] });
      })();
    }
  }, [user, isConnected, address, profile]);

  const savedWallet = profile?.wallet_address;

  const handleDisconnectWallet = async () => {
    disconnect();
    if (user) {
      await supabase
        .from("profiles")
        .update({ wallet_address: null })
        .eq("id", user.id);
      queryClient.invalidateQueries({ queryKey: ["profile", user.id] });
    }
    toast({ title: "Wallet disconnected" });
  };

  const copyWalletAddress = () => {
    const addr = savedWallet || address;
    if (addr) {
      navigator.clipboard.writeText(addr);
      setWalletCopied(true);
      setTimeout(() => setWalletCopied(false), 2000);
    }
  };

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
        <div className="max-w-lg md:max-w-4xl mx-auto px-4 pt-20 flex flex-col items-center justify-center" style={{ minHeight: "60vh" }}>
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
    <div className="min-h-dvh bg-background" style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}>
      <TopBar />
      <div className="max-w-lg md:max-w-4xl mx-auto px-3 sm:px-4 pt-20">
        {/* Avatar & Profile Edit */}
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
          <button
            onClick={() => setEditingProfile(true)}
            className="mt-2 text-xs text-primary font-semibold hover:underline flex items-center gap-1"
          >
            <Pencil className="w-3 h-3" /> Edit Profile
          </button>
        </div>

        {/* Profile Edit Modal */}
        <AnimatePresence>
          {editingProfile && (
            <>
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setEditingProfile(false)}
                className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-sm mx-auto glass-strong rounded-2xl p-5 z-50"
              >
                <h3 className="text-sm font-bold mb-4">Edit Profile</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Display Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="Your name"
                      maxLength={50}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingProfile(false)}
                      className="flex-1 glass py-2.5 rounded-xl font-semibold text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        if (!editName.trim()) { toast({ title: "Name cannot be empty" }); return; }
                        const { error: authError } = await supabase.auth.updateUser({
                          data: { display_name: editName.trim() },
                        });
                        if (authError) { toast({ title: "Failed to update", description: authError.message }); return; }
                        await supabase.from("profiles").update({ display_name: editName.trim() }).eq("id", user!.id);
                        toast({ title: "Profile updated!" });
                        setEditingProfile(false);
                      }}
                      className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-xl font-semibold text-sm"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Balance + Stats */}
        <div className="glass rounded-xl p-4 mb-6 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Balance</p>
          <p className="text-3xl font-bold text-primary">${balance.toFixed(2)}</p>
          <p className="text-[10px] text-muted-foreground">USDT</p>
          {bonusBalance > 0 && (
            <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/50 border border-border">
              <Gift className="w-3 h-3 text-primary" />
              <span className="text-[10px] font-semibold text-primary">${bonusBalance.toFixed(2)} bonus</span>
              <span className="text-[10px] text-muted-foreground">(non-withdrawable)</span>
            </div>
          )}
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

        {/* Wallet Management */}
        <div className="mb-6">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">BSC Wallet</h3>
          <div className="glass rounded-xl p-4">
            {isConnected || savedWallet ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Wallet className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold flex items-center gap-1.5">
                      {isConnected && <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />}
                      {isConnected ? "Connected" : "Linked"}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {(savedWallet || address)?.slice(0, 6)}...{(savedWallet || address)?.slice(-4)}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={copyWalletAddress}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-muted/50 border border-border text-xs font-semibold hover:bg-accent/50 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {walletCopied ? "Copied!" : "Copy"}
                  </button>
                  <a
                    href={`https://bscscan.com/address/${savedWallet || address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-muted/50 border border-border text-xs font-semibold hover:bg-accent/50 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    BscScan
                  </a>
                  <button
                    onClick={handleDisconnectWallet}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-xs font-semibold text-destructive hover:bg-destructive/20 transition-colors"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    Disconnect
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center shrink-0">
                    <Link2 className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">No wallet linked</p>
                    <p className="text-xs text-muted-foreground">Connect a BSC wallet to create markets</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {connectors.map((c) => (
                    <button
                      key={c.uid}
                      onClick={() => connect({ connector: c, chainId: bsc.id })}
                      disabled={isPending}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm transition-all active:scale-95 disabled:opacity-50"
                    >
                      <Wallet className="w-4 h-4" />
                      {isPending ? "Connecting..." : `Connect ${c.name}`}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

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
            <a href="https://t.me/opoll_predict_bot" target="_blank" rel="noopener noreferrer" className="w-full glass rounded-xl p-4 flex items-center gap-3 hover:bg-accent/50 transition-colors active:scale-[0.98]">
              <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center shrink-0 text-sky-400">
                <Send className="w-5 h-5" />
              </div>
              <span className="text-sm font-medium flex-1">Predict via Telegram</span>
              <ExternalLink className="w-4 h-4 text-muted-foreground" />
            </a>
            <button onClick={() => toast({ title: "Coming Soon", description: "Predict via WhatsApp will be available soon!" })} className="w-full glass rounded-xl p-4 flex items-center gap-3 hover:bg-accent/50 transition-colors active:scale-[0.98] text-left">
              <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center shrink-0 text-green-500">
                <MessageCircle className="w-5 h-5" />
              </div>
              <span className="text-sm font-medium flex-1">Predict via WhatsApp</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
            <a href="https://x.com/opollmarket" target="_blank" rel="noopener noreferrer" className="w-full glass rounded-xl p-4 flex items-center gap-3 hover:bg-accent/50 transition-colors active:scale-[0.98]">
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
              { icon: Video, label: "How-to Video Tutorials", href: "#", comingSoon: true },
              { icon: HelpCircle, label: "Frequently Asked Questions", href: "/faq" },
              { icon: Download, label: "Download App", href: "__install__" },
            ].map((item) => (
              item.comingSoon || item.href === "__install__" ? (
                <button
                  key={item.label}
                  onClick={() => {
                    if (item.href === "__install__") {
                      setInstallOpen(true);
                    } else {
                      toast({ title: "Coming Soon", description: `${item.label} will be available soon!` });
                    }
                  }}
                  className="w-full glass rounded-xl p-4 flex items-center gap-3 hover:bg-accent/50 transition-colors active:scale-[0.98] text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center shrink-0 text-muted-foreground">
                    <item.icon className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-medium flex-1">{item.label}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              ) : (
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
              )
            ))}
          </div>
        </div>

        {/* Legal */}
        <div className="mb-6">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Legal</h3>
          <div className="space-y-2">
            {[
              { icon: Shield, label: "Disclaimer", href: "/disclaimer" },
              { icon: ClipboardCheck, label: "Terms & Conditions", href: "/terms" },
              { icon: Lock, label: "Privacy Policy", href: "/privacy" },
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
      <InstallAppModal open={installOpen} onClose={() => setInstallOpen(false)} />
      
      <BottomNav />
    </div>
  );
};

export default Profile;
