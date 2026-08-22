import { resolveAvatarUrl } from "@/lib/avatarUrl";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import useAnalytics from "@/hooks/useAnalytics";
import { useNavigate, useSearchParams } from "react-router-dom";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import DepositWithdrawModal from "@/components/DepositWithdrawModal";
import InstallAppModal from "@/components/InstallAppModal";
import { useAuth } from "@/hooks/useAuth";
import { useUserBalance } from "@/hooks/useUserBalance";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAccount, useDisconnect } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import { useFilteredConnectors } from "@/hooks/useFilteredConnectors";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import { bsc } from "wagmi/chains";
import {
  Wallet, Gift, ArrowDownToLine, ArrowUpFromLine, ArrowUpRight, ArrowDownLeft,
  Repeat, LogIn, Send, MessageCircle, ExternalLink, ChevronRight, ChevronDown,
  Video, HelpCircle, Shield, ClipboardCheck, Lock, Trophy, Pencil, Download, Copy, Link2, Unlink, Loader2, Camera, Image, BarChart3, Globe, Eye, EyeOff, Users, Sparkles, Zap, ArrowUp, ArrowDown, DollarSign, Bell, Check, CalendarIcon, KeyRound,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import NftBadge, { isNftAvatar } from "@/components/NftBadge";
import { AnimatePresence, motion } from "framer-motion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn, getAvatarInitials } from "@/lib/utils";
import { format, parseISO } from "date-fns";

import CopyTradeStats from "@/components/CopyTradeStats";
import { useCommissionSettings } from "@/hooks/useCommissionSettings";
import LocationAutocomplete from "@/components/LocationAutocomplete";


type TxType = "buy" | "sell" | "deposit" | "withdraw" | "withdrawal" | "commission" | "payout" | "refund" | "initial_liquidity" | "qt_one_sided_bonus";

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

const TelegramSection = ({ userId }: { userId?: string }) => {
  const [unlinking, setUnlinking] = useState(false);
  const queryClient = useQueryClient();

  const { data: telegramLink, isLoading } = useQuery({
    queryKey: ["telegram-link", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await supabase
        .from("telegram_users")
        .select("telegram_username, linked_at")
        .eq("user_id", userId)
        .maybeSingle();
      return data;
    },
    enabled: !!userId,
  });

  const handleUnlink = async () => {
    if (!userId) return;
    setUnlinking(true);
    try {
      const { error } = await supabase
        .from("telegram_users")
        .delete()
        .eq("user_id", userId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["telegram-link", userId] });
      toast.success("Telegram account unlinked");
    } catch {
      toast.error("Failed to unlink Telegram");
    } finally {
      setUnlinking(false);
    }
  };

  if (isLoading) {
    return (
      <div className="glass rounded-xl p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center shrink-0 text-sky-400">
          <Send className="w-5 h-5" />
        </div>
        <span className="text-sm font-medium flex-1">Telegram</span>
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (telegramLink) {
    return (
      <div className="glass rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-sky-500/10 flex items-center justify-center shrink-0 text-sky-400">
            <Send className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
              Telegram Linked
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {telegramLink.telegram_username ? `@${telegramLink.telegram_username}` : "Linked account"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <a
            href="https://t.me/OPoll_market_bot"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-muted/50 border border-border text-xs font-semibold hover:bg-accent/50 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open Bot
          </a>
          <button
            onClick={handleUnlink}
            disabled={unlinking}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-xs font-semibold text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
          >
            {unlinking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlink className="w-3.5 h-3.5" />}
            Unlink
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center shrink-0 text-sky-400">
          <Send className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Predict via Telegram</p>
          <p className="text-xs text-muted-foreground">Link your account to trade from Telegram</p>
        </div>
      </div>
      <div className="bg-muted/30 rounded-lg p-3">
        <p className="text-xs text-muted-foreground leading-relaxed mb-2">
          1. Open <a href="https://t.me/OPoll_market_bot" target="_blank" rel="noopener noreferrer" className="text-primary font-semibold hover:underline">@OPoll_market_bot</a> on Telegram
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed mb-2">
          2. Send <code className="px-1.5 py-0.5 rounded bg-muted text-foreground text-[11px] font-mono">/link</code> and follow the secure prompts
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          3. Start browsing markets and placing predictions! 🎯
        </p>
      </div>
      <a
        href="https://t.me/OPoll_market_bot"
        target="_blank"
        rel="noopener noreferrer"
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sm font-semibold text-sky-400 hover:bg-sky-500/20 transition-colors"
      >
        <Send className="w-4 h-4" />
        Open Telegram Bot
      </a>
    </div>
  );
};

const NOTIF_PREFS_KEYS = [
  { key: "market_resolution", label: "Market Resolutions", desc: "When markets you bet on resolve" },
  { key: "market_cancelled", label: "Market Cancelled", desc: "When markets are cancelled & refunded" },
  { key: "payout", label: "Payouts & Wins", desc: "Winning notifications and payouts" },
  { key: "new_follower", label: "New Followers", desc: "When someone follows you" },
  { key: "copy_trade", label: "Copy Trades", desc: "Copy trade alerts and commissions" },
  { key: "referral", label: "Referrals", desc: "Referral reward notifications" },
  { key: "price_alert", label: "Price Alerts", desc: "Auto-resolve price proximity alerts" },
  { key: "sports_score", label: "Sports Scores", desc: "Live score and kickoff updates" },
  { key: "general", label: "General", desc: "All other notifications" },
] as const;

type PrefKey = typeof NOTIF_PREFS_KEYS[number]["key"];
type PrefsRecord = Record<PrefKey, boolean>;

const DEFAULT_PREFS: PrefsRecord = Object.fromEntries(NOTIF_PREFS_KEYS.map(k => [k.key, true])) as PrefsRecord;

const WhatsAppNotifPrefs = ({ userId }: { userId?: string }) => {
  const [expanded, setExpanded] = useState(false);
  const [prefs, setPrefs] = useState<PrefsRecord>(DEFAULT_PREFS);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("whatsapp_notification_prefs")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const p = { ...DEFAULT_PREFS };
          for (const k of NOTIF_PREFS_KEYS) {
            if (k.key in data) p[k.key] = (data as any)[k.key] ?? true;
          }
          setPrefs(p);
        }
        setLoaded(true);
      });
  }, [userId]);

  const togglePref = async (key: PrefKey) => {
    if (!userId || saving) return;
    const newVal = !prefs[key];
    setPrefs(prev => ({ ...prev, [key]: newVal }));
    setSaving(true);
    try {
      const updates = { ...prefs, [key]: newVal, user_id: userId, updated_at: new Date().toISOString() };
      const { error } = await supabase
        .from("whatsapp_notification_prefs")
        .upsert(updates, { onConflict: "user_id" });
      if (error) throw error;
    } catch {
      setPrefs(prev => ({ ...prev, [key]: !newVal }));
      toast.error("Failed to update preference");
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  return (
    <div className="space-y-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors w-full"
      >
        <Bell className="w-3.5 h-3.5" />
        Notification Preferences
        <ChevronDown className={`w-3.5 h-3.5 ml-auto transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <div className="bg-muted/30 rounded-lg p-3 space-y-2">
          {NOTIF_PREFS_KEYS.map(({ key, label, desc }) => (
            <label key={key} className="flex items-center gap-3 cursor-pointer py-1">
               <Switch
                checked={prefs[key]}
                onCheckedChange={() => togglePref(key)}
              />
              <div className="min-w-0">
                <span className="text-xs font-medium block">{label}</span>
                <span className="text-[10px] text-muted-foreground">{desc}</span>
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

const WhatsAppSection = ({ userId }: { userId?: string }) => {
  const [unlinking, setUnlinking] = useState(false);
  const queryClient = useQueryClient();

  const { data: whatsappLink, isLoading } = useQuery({
    queryKey: ["whatsapp-link", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await supabase
        .from("whatsapp_users")
        .select("whatsapp_phone, linked_at")
        .eq("user_id", userId)
        .maybeSingle();
      return data;
    },
    enabled: !!userId,
  });

  const handleUnlink = async () => {
    if (!userId) return;
    setUnlinking(true);
    try {
      const { error } = await supabase
        .from("whatsapp_users")
        .delete()
        .eq("user_id", userId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["whatsapp-link", userId] });
      toast.success("WhatsApp account unlinked");
    } catch {
      toast.error("Failed to unlink WhatsApp");
    } finally {
      setUnlinking(false);
    }
  };

  if (isLoading) {
    return (
      <div className="glass rounded-xl p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center shrink-0 text-green-500">
          <MessageCircle className="w-5 h-5" />
        </div>
        <span className="text-sm font-medium flex-1">WhatsApp</span>
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (whatsappLink) {
    const maskedPhone = whatsappLink.whatsapp_phone.replace(/(\+\d{1,3})\d+(\d{4})/, "$1****$2");
    return (
      <div className="glass rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center shrink-0 text-green-500">
            <MessageCircle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              WhatsApp Linked
            </p>
            <p className="text-xs text-muted-foreground truncate">{maskedPhone}</p>
          </div>
        </div>
        <WhatsAppNotifPrefs userId={userId} />
        <div className="flex gap-2">
          <button
            onClick={handleUnlink}
            disabled={unlinking}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-xs font-semibold text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
          >
            {unlinking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlink className="w-3.5 h-3.5" />}
            Unlink
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center shrink-0 text-green-500">
          <MessageCircle className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Predict via WhatsApp</p>
          <p className="text-xs text-muted-foreground">Link your account to trade from WhatsApp</p>
        </div>
      </div>
      <div className="bg-muted/30 rounded-lg p-3">
        <p className="text-xs text-muted-foreground leading-relaxed mb-2">
          1. Save our WhatsApp number and send <code className="px-1.5 py-0.5 rounded bg-muted text-foreground text-[11px] font-mono">start</code>
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed mb-2">
          2. Type <code className="px-1.5 py-0.5 rounded bg-muted text-foreground text-[11px] font-mono">link</code> and follow the secure prompts
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          3. Start browsing markets and placing predictions! 🎯
        </p>
      </div>
    </div>
  );
};

const TwitterSection = ({ userId }: { userId?: string }) => {
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const queryClient = useQueryClient();

  const { data: twitterData, isLoading } = useQuery({
    queryKey: ["twitter-link", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await supabase
        .from("profiles")
        .select("twitter_username, twitter_id, twitter_avatar_url, twitter_linked_at")
        .eq("id", userId)
        .maybeSingle();
      return data?.twitter_id ? data : null;
    },
    enabled: !!userId,
  });

  const handleLink = async () => {
    setLinking(true);
    try {
      const { data, error } = await supabase.functions.invoke("twitter-auth-start", {
        body: { redirect_url: window.location.origin + "/profile" },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.url) throw new Error("Missing X authorization URL");

      const authUrl = data.url as string;
      const inIframe = window.self !== window.top;

      if (inIframe) {
        const popup = window.open(authUrl, "_blank", "noopener,noreferrer");
        if (!popup) {
          throw new Error("Popup blocked. Please allow popups and try again.");
        }
        toast.success("X authorization opened in a new tab");
        setLinking(false);
        return;
      }

      window.location.href = authUrl;
    } catch (err: any) {
      toast.error(err.message || "Failed to start X link");
      setLinking(false);
    }
  };

  const handleUnlink = async () => {
    setUnlinking(true);
    try {
      const { data, error } = await supabase.functions.invoke("twitter-unlink");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      queryClient.invalidateQueries({ queryKey: ["twitter-link", userId] });
      toast.success("X account unlinked");
    } catch {
      toast.error("Failed to unlink X account");
    } finally {
      setUnlinking(false);
    }
  };

  if (isLoading) {
    return (
      <div className="glass rounded-xl p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center shrink-0 text-foreground">
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        </div>
        <span className="text-sm font-medium flex-1">X (Twitter)</span>
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (twitterData) {
    return (
      <div className="glass rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-foreground/10 flex items-center justify-center shrink-0 overflow-hidden">
            {twitterData.twitter_avatar_url ? (
              <img src={twitterData.twitter_avatar_url} alt={twitterData.twitter_username} className="w-full h-full object-cover rounded-full" />
            ) : (
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              X Linked
            </p>
            <p className="text-xs text-muted-foreground truncate">@{twitterData.twitter_username}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <a
            href={`https://x.com/${twitterData.twitter_username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-muted/50 border border-border text-xs font-semibold hover:bg-accent/50 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            View Profile
          </a>
          <button
            onClick={handleUnlink}
            disabled={unlinking}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-xs font-semibold text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
          >
            {unlinking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlink className="w-3.5 h-3.5" />}
            Unlink
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center shrink-0 text-foreground">
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Link X Account</p>
          <p className="text-xs text-muted-foreground">Verify your identity & auto-share predictions</p>
        </div>
      </div>
      <button
        onClick={handleLink}
        disabled={linking}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-foreground/10 border border-foreground/20 text-sm font-semibold hover:bg-foreground/20 transition-colors disabled:opacity-50"
      >
        {linking ? <Loader2 className="w-4 h-4 animate-spin" /> : (
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        )}
        {linking ? "Connecting..." : "Connect X Account"}
      </button>
    </div>
  );
};

const Profile = () => {
  
  const { user, loading: authLoading, isAdmin, displayName: authDisplayName } = useAuth();
  const { balance, bonusBalance } = useUserBalance();
  const { isFeatureEnabled } = useFeatureToggles();
  const { data: commissionSettings } = useCommissionSettings();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { track } = useAnalytics();
  const walletSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => { track("page_view", { page: "profile" }); }, []);

  // Handle Twitter link callback
  useEffect(() => {
    const twitterStatus = searchParams.get("twitter");
    if (twitterStatus === "linked") {
      toast.success("X account linked successfully! ✓");
      // Clean up URL
      const url = new URL(window.location.href);
      url.searchParams.delete("twitter");
      window.history.replaceState({}, "", url.toString());
    } else if (twitterStatus === "error") {
      const msg = searchParams.get("msg") || "Failed to link X account";
      toast.error(msg);
      const url = new URL(window.location.href);
      url.searchParams.delete("twitter");
      url.searchParams.delete("msg");
      window.history.replaceState({}, "", url.toString());
    }
  }, [searchParams]);
  const queryClient = useQueryClient();
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useFilteredConnectors();
  const { disconnect } = useDisconnect();
  const { open } = useAppKit();
  const [modalOpen, setModalOpen] = useState(false);
  const [balanceHidden, setBalanceHidden] = useState(() => localStorage.getItem("hide_balance") === "1");
  const [modalTab, setModalTab] = useState<"deposit" | "withdraw">("deposit");
  const [resumePaymentId, setResumePaymentId] = useState<string | null>(null);
  const [resumeProvider, setResumeProvider] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editName, setEditName] = useState(user?.user_metadata?.display_name || "");
  const [installOpen, setInstallOpen] = useState(false);
  const [walletCopied, setWalletCopied] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [showNftPicker, setShowNftPicker] = useState(false);
  const [loadingNfts, setLoadingNfts] = useState(false);
  const [walletNfts, setWalletNfts] = useState<Array<{ token_address: string; token_id: string; name: string; image_url: string; collection_name: string }>>([]);
  const [selectedNftUrl, setSelectedNftUrl] = useState<string | null>(null);
  const [editBio, setEditBio] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editIsPublic, setEditIsPublic] = useState(true);
  const [editDob, setEditDob] = useState<Date | undefined>(undefined);
  const [editGender, setEditGender] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editInterests, setEditInterests] = useState<string[]>([]);
  const [swipeHintDismissed, setSwipeHintDismissed] = useState(() => localStorage.getItem("social_swipe_used") === "1");
  const [revealX, setRevealX] = useState(0);
  const revealAnimating = useRef(false);

  // Slide-to-reveal from right edge — reveals social profile panel
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchStartedInEdge = useRef(false);
  const touchLockedDir = useRef<"horizontal" | "vertical" | null>(null);
  const isDragging = useRef(false);
  const screenW = typeof window !== "undefined" ? window.innerWidth : 400;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (revealAnimating.current) return;
    const x = e.touches[0].clientX;
    touchStartX.current = x;
    touchStartY.current = e.touches[0].clientY;
    touchStartedInEdge.current = x > window.innerWidth - 40;
    touchLockedDir.current = null;
    isDragging.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartedInEdge.current || !user || revealAnimating.current) return;
    const dx = touchStartX.current - e.touches[0].clientX; // positive = swiped left
    const dy = Math.abs(e.touches[0].clientY - touchStartY.current);
    if (!touchLockedDir.current) {
      if (Math.abs(dx) > 10 || dy > 10) {
        touchLockedDir.current = Math.abs(dx) > dy ? "horizontal" : "vertical";
      }
      return;
    }
    if (touchLockedDir.current !== "horizontal") return;
    if (dx > 0) {
      isDragging.current = true;
      setRevealX(Math.min(dx, window.innerWidth));
    }
  }, [user]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) {
      touchStartedInEdge.current = false;
      return;
    }
    const endX = e.changedTouches[0].clientX;
    const dx = touchStartX.current - endX;
    if (dx > 100) {
      // Commit: animate panel fully open, then navigate
      if (!swipeHintDismissed) {
        localStorage.setItem("social_swipe_used", "1");
        setSwipeHintDismissed(true);
      }
      revealAnimating.current = true;
      setRevealX(window.innerWidth);
      setTimeout(() => {
        navigate(`/user/${user!.id}`);
        setRevealX(0);
        revealAnimating.current = false;
      }, 250);
    } else {
      // Snap back
      setRevealX(0);
    }
    isDragging.current = false;
    touchStartedInEdge.current = false;
  }, [swipeHintDismissed, user, navigate]);

  // Fetch profile data
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      // Sensitive PII (age, date_of_birth, gender, location, email) is no longer
      // directly selectable on profiles — use the owner-scoped RPC instead.
      const { data } = await supabase.rpc("get_my_full_profile").maybeSingle();
      return data as any;
    },
    enabled: !!user,
  });

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be under 2MB");
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const uploadAvatar = async (): Promise<string | null> => {
    if (!avatarFile || !user) return null;
    const { compressImage, webpExtension } = await import("@/lib/imageCompression");
    const compressed = await compressImage(avatarFile, "avatar");
    const ext = webpExtension();
    const path = `${user.id}/avatar.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, compressed, { upsert: true });
    if (error) { toast.error("Avatar upload failed"); return null; }
    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
    return `${urlData.publicUrl}?t=${Date.now()}`;
  };

  // Save wallet to profile when connected
  useEffect(() => {
    if (user && isConnected && address && profile && !profile.wallet_address) {
      (async () => {
        await supabase
          .from("profiles")
          .update({ wallet_address: address })
          .eq("id", user.id);
        queryClient.invalidateQueries({ queryKey: ["profile", user.id] });
        // Refresh verification level
        supabase.functions.invoke("update-verification").catch(() => {});
      })();
    }
  }, [user, isConnected, address, profile]);

  // Auto-scroll to wallet section when coming from /create
  useEffect(() => {
    if (searchParams.get("section") === "wallet" && walletSectionRef.current) {
      setTimeout(() => {
        walletSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 500);
    }
  }, [searchParams, profile]);

  const fetchWalletNfts = async () => {
    const walletAddr = savedWallet || address;
    if (!walletAddr) { toast.error("Connect a wallet first"); return; }
    setLoadingNfts(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-wallet-nfts", {
        body: { wallet_address: walletAddr },
      });
      if (error) throw error;
      setWalletNfts(data.nfts || []);
      if ((data.nfts || []).length === 0) toast.info("No NFTs found in this wallet");
    } catch (err: any) {
      console.error("NFT fetch error:", err);
      toast.error("Failed to load NFTs");
    } finally {
      setLoadingNfts(false);
    }
  };

  const handleSelectNft = (imageUrl: string) => {
    setSelectedNftUrl(imageUrl);
    setAvatarPreview(imageUrl);
    setAvatarFile(null); // clear file upload if NFT selected
    setShowNftPicker(false);
  };

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
    toast.success("Wallet disconnected");
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
        .select("*, markets(title), market_options(label)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200);
      return data || [];
    },
    enabled: !!user,
  });

  // Fetch quick trade bets
  const { data: quickBets = [] } = useQuery({
    queryKey: ["quick-bets-profile", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("quick_bets")
        .select("*, quick_rounds(*)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200);
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
        .select("*, markets(yes_price, no_price, status), market_options(price, label)")
        .eq("user_id", user.id);
      return data || [];
    },
    enabled: !!user,
  });

  // Active market count for verified users
  const { data: activeMarketCount = 0 } = useQuery({
    queryKey: ["active-market-count", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { count } = await supabase
        .from("markets")
        .select("id", { count: "exact", head: true })
        .eq("creator_wallet", user.id)
        .or("is_crypto_round.is.null,is_crypto_round.eq.false")
        .in("status", ["active", "pending"]);
      return count || 0;
    },
    enabled: !!user,
  });

  const openDeposit = () => { setResumePaymentId(null); setResumeProvider(null); setModalTab("deposit"); setModalOpen(true); };
  const openWithdraw = () => { setResumePaymentId(null); setResumeProvider(null); setModalTab("withdraw"); setModalOpen(true); };




  const displayName = authDisplayName;

  if (!authLoading && !user) {
    return (
      <div className="min-h-dvh bg-background" style={{ paddingBottom: 'calc(1rem + var(--content-bottom))' }}>
        <TopBar />
        <div className="max-w-lg md:max-w-4xl mx-auto px-4 flex flex-col items-center justify-center" style={{ minHeight: "60vh", paddingTop: 'calc(1.5rem + var(--content-top))' }}>
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
    <div
      className="h-dvh bg-background overflow-y-auto overscroll-contain"
      style={{ paddingBottom: 'calc(1rem + var(--content-bottom))', touchAction: 'pan-y', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', willChange: 'scroll-position' } as React.CSSProperties}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Swipe hint glow on right edge */}
      {!swipeHintDismissed && (
        <motion.div
          className="fixed right-0 top-1/3 bottom-1/3 z-30 pointer-events-none w-12"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.7, 0.3, 0.7, 0] }}
          transition={{ delay: 1.2, duration: 3, repeat: 2, repeatDelay: 2 }}
        >
          <div className="w-full h-full rounded-l-full bg-gradient-to-l from-primary/40 via-primary/15 to-transparent blur-md" />
          <motion.div
            className="absolute right-1 top-1/2 -translate-y-1/2"
            animate={{ x: [0, 6, 0] }}
            transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
          >
            <svg width="14" height="24" viewBox="0 0 14 24" fill="none" className="text-primary opacity-60">
              <path d="M2 2L12 12L2 22" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </motion.div>
        </motion.div>
      )}

      {/* Slide-to-reveal overlay panel */}
      {revealX > 0 && (
        <div
          className="fixed inset-0 z-40 pointer-events-none"
          style={{ backgroundColor: `rgba(0,0,0,${Math.min(revealX / screenW * 0.5, 0.5)})` }}
        />
      )}
      {revealX > 0 && (
        <div
          className="fixed inset-y-0 right-0 z-50 bg-background/95 backdrop-blur-xl shadow-2xl border-l border-border/50"
          style={{
            width: '100%',
            maxWidth: '100vw',
            transform: `translateX(${Math.max(screenW - revealX, 0)}px)`,
            transition: isDragging.current ? 'none' : 'transform 0.25s ease-out',
          }}
        >
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-4 text-center px-8">
              {/* Glow ring behind avatar */}
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl scale-150" />
                <div className="relative w-20 h-20 rounded-full bg-primary/20 border-2 border-primary/40 flex items-center justify-center overflow-hidden ring-4 ring-primary/10">
                  {profile?.avatar_url ? (
                    <img src={resolveAvatarUrl(profile.avatar_url)} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl font-bold text-primary">{getAvatarInitials(displayName, { maxChars: 2 })}</span>
                  )}
                </div>
                {(profile as any)?.verification_level && (profile as any).verification_level !== "none" && <NftBadge className="absolute -bottom-0.5 -right-0.5" level={(profile as any).verification_level} />}
              </div>
              <div className="space-y-1">
                <p className="text-base font-bold">{displayName}</p>
                <p className="text-xs text-muted-foreground font-medium tracking-wide uppercase">Social Profile</p>
              </div>
              <div className="flex items-center gap-1.5 text-primary">
                <Users className="w-4 h-4" />
                <ChevronRight className="w-3.5 h-3.5 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      )}

      <TopBar />
      <div className="max-w-lg md:max-w-4xl mx-auto px-4" style={{ paddingTop: 'calc(1.5rem + var(--content-top))', paddingBottom: 'calc(1rem + var(--content-bottom))' }}>
        {/* Avatar & Profile Edit */}
        <div className="flex flex-col items-center mb-8 relative">
          <button
            onClick={() => {
              setEditName(profile?.display_name || authDisplayName);
              setEditUsername((profile as any)?.username || "");
              setEditBio((profile as any)?.bio || "");
              setEditIsPublic((profile as any)?.is_public ?? true);
              setEditDob((profile as any)?.date_of_birth ? parseISO((profile as any).date_of_birth) : undefined);
              setEditGender((profile as any)?.gender || "");
              setEditLocation((profile as any)?.location || "");
              setEditInterests((profile as any)?.interests || []);
              setAvatarPreview(null);
              setAvatarFile(null);
              setSelectedNftUrl(null);
              setEditingProfile(true);
            }}
            className="absolute top-0 right-0 text-xs text-primary font-semibold hover:underline flex items-center gap-1.5"
          >
            <Pencil className="w-3.5 h-3.5" /> Edit Profile
          </button>
          <div className="relative mb-3">
            <div className="w-20 h-20 rounded-full bg-primary/20 border-2 border-primary/30 flex items-center justify-center overflow-hidden">
              {profile?.avatar_url ? (
                <img src={resolveAvatarUrl(profile.avatar_url)} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-primary">{getAvatarInitials(displayName, { maxChars: 2 })}</span>
              )}
            </div>
            {(profile as any)?.verification_level && (profile as any).verification_level !== "none" && <NftBadge className="absolute -bottom-0.5 -right-0.5" level={(profile as any).verification_level} />}
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
          {(profile as any)?.username && (
            <p className="text-xs text-muted-foreground font-medium">@{(profile as any).username}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {user?.email ? `${user.email.slice(0, 3)}***@${user.email.split("@")[1]}` : ""}
          </p>
          <div className="mt-4 w-full flex justify-center">
            <button
              onClick={() => navigate(`/user/${user?.id}`)}
              className="text-xs font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-all animate-pulse-glow"
            >
              <Users className="w-3.5 h-3.5" /> My Social
            </button>
          </div>
        </div>

        {/* Profile Edit Modal */}
        <AnimatePresence>
          {editingProfile && (
            <>
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setEditingProfile(false)}
                className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[90]"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="fixed z-[90] inset-0 m-auto w-[calc(100%-2rem)] max-w-md lg:max-w-lg h-fit glass-strong rounded-2xl p-5 overflow-y-auto flex flex-col"
                style={{ maxHeight: "calc(100dvh - var(--safe-top) - var(--safe-bottom) - 6rem)", paddingBottom: "1.5rem" }}
              >
                <h3 className="text-sm font-bold mb-4">Edit Profile</h3>
                <div className="space-y-3">
                  {/* Avatar Upload */}
                  <div className="flex flex-col items-center gap-2">
                    <label htmlFor="avatar-upload" className="relative cursor-pointer group">
                      <div className="w-16 h-16 rounded-full bg-primary/20 border-2 border-primary/30 flex items-center justify-center overflow-hidden">
                        {avatarPreview ? (
                          <img src={avatarPreview} alt="Preview" className="w-full h-full object-cover" />
                        ) : profile?.avatar_url ? (
                          <img src={resolveAvatarUrl(profile.avatar_url)} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xl font-bold text-primary">{getAvatarInitials(displayName, { maxChars: 2 })}</span>
                        )}
                      </div>
                      <div className="absolute inset-0 rounded-full bg-background/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Camera className="w-5 h-5 text-foreground" />
                      </div>
                    </label>
                    <input id="avatar-upload" type="file" accept="image/*" className="hidden" onChange={(e) => { handleAvatarSelect(e); setSelectedNftUrl(null); }} />
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">Tap to upload photo</span>
                      {(isConnected || savedWallet) && (
                        <>
                          <span className="text-[10px] text-muted-foreground">or</span>
                          <button
                            type="button"
                            onClick={() => { setShowNftPicker(true); fetchWalletNfts(); }}
                            className="text-[10px] font-semibold text-primary hover:underline flex items-center gap-1"
                          >
                            <Image className="w-3 h-3" /> Use NFT
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* NFT Picker */}
                  <AnimatePresence>
                    {showNftPicker && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="border border-border rounded-xl p-3 bg-muted/30">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold">Your NFTs</span>
                            <button type="button" onClick={() => setShowNftPicker(false)} className="text-[10px] text-muted-foreground hover:text-foreground">Close</button>
                          </div>
                          {loadingNfts ? (
                            <div className="flex items-center justify-center py-6">
                              <Loader2 className="w-5 h-5 animate-spin text-primary" />
                            </div>
                          ) : walletNfts.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-4">No NFTs found</p>
                          ) : (
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-36 overflow-y-auto">
                              {walletNfts.map((nft) => (
                                <Tooltip key={`${nft.token_address}-${nft.token_id}`}>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={() => handleSelectNft(nft.image_url)}
                                      className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all hover:scale-105 ${
                                        selectedNftUrl === nft.image_url ? "border-primary ring-2 ring-primary/30" : "border-border"
                                      }`}
                                    >
                                      <img src={nft.image_url} alt={nft.name} className="w-full h-full object-cover" loading="lazy" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-[180px] text-center">
                                    <p className="text-xs font-semibold truncate">{nft.name}</p>
                                    <p className="text-[10px] text-muted-foreground truncate">{nft.collection_name}</p>
                                  </TooltipContent>
                                </Tooltip>
                              ))}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
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
                  {/* Username */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Username</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">@</span>
                      <input
                        type="text"
                        value={editUsername}
                        onChange={(e) => setEditUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                        className="w-full bg-muted/50 border border-border rounded-xl pl-8 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        placeholder="your_username"
                        maxLength={25}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Only lowercase letters, numbers, and underscores</p>
                  </div>
                  {/* Bio */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Bio</label>
                    <textarea
                      value={editBio}
                      onChange={(e) => setEditBio(e.target.value)}
                      className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                      placeholder="Tell people about yourself..."
                      maxLength={160}
                      rows={2}
                    />
                    <p className="text-[10px] text-muted-foreground text-right mt-0.5">{editBio.length}/160</p>
                  </div>
                  {/* Profile Visibility */}
                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                      {editIsPublic ? <Globe className="w-4 h-4 text-primary" /> : <EyeOff className="w-4 h-4 text-muted-foreground" />}
                      <div>
                        <p className="text-sm font-medium">{editIsPublic ? "Public Profile" : "Private Profile"}</p>
                        <p className="text-[10px] text-muted-foreground">{editIsPublic ? "Anyone can view your profile" : "Only you can see your profile"}</p>
                      </div>
                    </div>
                    <Switch checked={editIsPublic} onCheckedChange={setEditIsPublic} />
                  </div>

                  {/* Personal Info (Private) */}
                  <div className="border-t border-border pt-3 mt-1">
                    <div className="flex items-center gap-2 mb-3">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Personal Info</h4>
                      <span className="text-[9px] text-muted-foreground/60 px-1.5 py-0.5 rounded bg-muted/50">Private</span>
                    </div>
                    {/* Date of Birth */}
                    <div className="space-y-1.5 mb-3">
                      <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">Date of Birth</label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className={cn(
                              "w-full px-3 py-2.5 rounded-lg border border-border bg-muted/30 text-sm text-left focus:outline-none focus:ring-1 focus:ring-primary/50 flex items-center gap-2",
                              !editDob && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="w-4 h-4" />
                            {editDob ? format(editDob, "PPP") : "Select your date of birth"}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 z-[100]" align="start" side="top" sideOffset={8}>
                          <Calendar
                            mode="single"
                            selected={editDob}
                            onSelect={setEditDob}
                            disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                            defaultMonth={editDob || new Date(2000, 0)}
                            captionLayout="dropdown-buttons"
                            fromYear={1920}
                            toYear={new Date().getFullYear()}
                            initialFocus
                            className={cn("p-3 pointer-events-auto")}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    {/* Gender */}
                    <div className="space-y-1.5 mb-3">
                      <label className="text-xs font-medium text-muted-foreground">Gender</label>
                      <div className="flex flex-wrap gap-2">
                        {["Male", "Female"].map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setEditGender(editGender === opt ? "" : opt)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                              editGender === opt
                                ? "border-primary/50 bg-primary/10 text-primary"
                                : "border-border bg-muted/30 text-muted-foreground hover:border-muted-foreground/30"
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Location */}
                    <div className="space-y-1.5 mb-3">
                      <label className="text-xs font-medium text-muted-foreground">Location</label>
                      <LocationAutocomplete value={editLocation} onChange={setEditLocation} />
                    </div>
                    {/* Interests */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Interests</label>
                      <div className="flex flex-wrap gap-2">
                        {["Politics", "Entertainment", "Sports", "Crypto", "Finance", "Technology", "Science", "Gaming", "Music", "Fashion", "Health", "Education", "News", "Culture", "Business"].map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setEditInterests((prev) => prev.includes(opt) ? prev.filter((i) => i !== opt) : [...prev, opt])}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1 ${
                              editInterests.includes(opt)
                                ? "border-primary/50 bg-primary/10 text-primary"
                                : "border-border bg-muted/30 text-muted-foreground hover:border-muted-foreground/30"
                            }`}
                          >
                            {editInterests.includes(opt) && <Check className="w-3 h-3" />}
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingProfile(false)}
                      className="flex-1 glass py-2.5 rounded-xl font-semibold text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      disabled={savingProfile}
                      onClick={async () => {
                        if (!editName.trim()) { toast.error("Name cannot be empty"); return; }
                        setSavingProfile(true);
                        try {
                          // Fire moderation check in background (non-blocking)
                          const nameModPromise = supabase.functions.invoke("moderate-display-name", {
                            body: { name: editName.trim() },
                          }).catch(() => ({ data: null }));

                          // Validate DOB early (no async needed)
                          if (editDob) {
                            const ageDiff = new Date().getFullYear() - editDob.getFullYear();
                            const monthDiff = new Date().getMonth() - editDob.getMonth();
                            const calculatedAge = monthDiff < 0 || (monthDiff === 0 && new Date().getDate() < editDob.getDate()) ? ageDiff - 1 : ageDiff;
                            if (calculatedAge < 13) {
                              toast.error("You must be at least 13 years old");
                              setSavingProfile(false);
                              return;
                            }
                          }

                          // Upload avatar if needed (parallel with name moderation)
                          let avatarUrl: string | null = null;
                          if (selectedNftUrl) {
                            avatarUrl = selectedNftUrl;
                          } else if (avatarFile) {
                            avatarUrl = await uploadAvatar();
                            if (!avatarUrl && avatarFile) { setSavingProfile(false); return; }
                          }

                          // Check name moderation result with a hard timeout (fail-open)
                          const modTimeout = new Promise<{ data: null }>((resolve) =>
                            setTimeout(() => resolve({ data: null }), 4000)
                          );
                          const { data: nameModData } = (await Promise.race([nameModPromise, modTimeout])) as any;
                          if (nameModData?.flagged) {
                            supabase.from("moderation_logs").insert({
                              content_type: "display_name",
                              user_id: user!.id,
                              flagged_content: editName.trim(),
                              reason: nameModData.reason || "Flagged by AI",
                              category: "profanity",
                            }).then(() => {});
                            toast.error("Display name not allowed", {
                              description: nameModData.reason || "This display name contains inappropriate content.",
                              duration: 6000,
                            });
                            setSavingProfile(false);
                            return;
                          }

                          // Validate username
                          const cleanUsername = editUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
                          if (cleanUsername && cleanUsername.length < 3) {
                            toast.error("Username must be at least 3 characters");
                            setSavingProfile(false);
                            return;
                          }

                          // Update profile table
                          const { error: profileError } = await supabase.from("profiles").update({
                            display_name: editName.trim(),
                            username: cleanUsername || undefined,
                            bio: editBio.trim(),
                            is_public: editIsPublic,
                            date_of_birth: editDob ? format(editDob, "yyyy-MM-dd") : null,
                            age: editDob ? Math.floor((Date.now() - editDob.getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null,
                            gender: editGender || null,
                            location: editLocation.trim().slice(0, 100) || null,
                            interests: editInterests,
                            ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
                          } as any).eq("id", user!.id);
                          if (profileError) {
                            if (profileError.message?.includes("idx_profiles_username_unique") || profileError.code === "23505") {
                              toast.error("This username is already taken. Please choose a different one.");
                            } else {
                              toast.error("Failed to update profile");
                            }
                            setSavingProfile(false);
                            return;
                          }

                          // Fire-and-forget: auth metadata, image moderation, verification
                          supabase.auth.updateUser({
                            data: { display_name: editName.trim(), ...(avatarUrl ? { avatar_url: avatarUrl } : {}) },
                          }).catch(() => {});

                          if (avatarUrl) {
                            supabase.functions.invoke("moderate-image", {
                              body: { image_url: avatarUrl },
                            }).then(({ data: imgModData }) => {
                              if (imgModData?.flagged) {
                                supabase.from("moderation_logs").insert({
                                  content_type: "image",
                                  user_id: user!.id,
                                  flagged_content: avatarUrl!,
                                  reason: imgModData.reason || "Flagged by AI",
                                  category: imgModData.category || "nsfw",
                                }).then(() => {});
                                toast.error(imgModData.reason || "Image flagged — it may be reverted");
                              }
                            }).catch(() => {});
                          }

                          await queryClient.invalidateQueries({ queryKey: ["profile", user!.id] });
                          await queryClient.invalidateQueries({ queryKey: ["profile_display_name", user!.id] });
                          setAvatarFile(null);
                          setAvatarPreview(null);
                          setSelectedNftUrl(null);
                          setShowNftPicker(false);
                          toast.success("Profile updated!");
                          setEditingProfile(false);

                          supabase.functions.invoke("update-verification").catch(() => {});
                          setTimeout(() => queryClient.invalidateQueries({ queryKey: ["profile", user!.id] }), 1500);
                        } catch (err) {
                          toast.error("Something went wrong");
                        } finally {
                          setSavingProfile(false);
                        }
                      }}
                      className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {savingProfile && <Loader2 className="w-4 h-4 animate-spin" />}
                      {savingProfile ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Balance + Stats */}
        <div
          role="button"
          aria-labelledby="balance-label"
          className="glass rounded-xl p-4 mb-3 text-center cursor-pointer active:scale-[0.98] transition-transform select-none"
          onClick={() => {
            const next = !balanceHidden;
            setBalanceHidden(next);
            localStorage.setItem("hide_balance", next ? "1" : "");
          }}
        >
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1" id="balance-label">Main Balance</p>
          <p className="text-3xl font-bold text-primary">
            {balanceHidden ? "••••••" : `$${balance.toFixed(2)}`}
          </p>
          <p className="text-[10px] text-muted-foreground">USD</p>
        </div>

        <button onClick={() => navigate("/commissions")} className="w-full glass rounded-xl p-4 flex items-center justify-center gap-2 hover:bg-accent/50 transition-colors active:scale-[0.98] mb-6">
          <DollarSign className="w-5 h-5 text-primary" />
          <span className="text-sm font-medium">Balance Breakdown</span>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>

        <div className="grid grid-cols-3 gap-3 mb-6">
          {(() => {
            const predictionBuyTxns = transactions.filter(
              (t: any) =>
                t.type === "buy" &&
                t.status === "confirmed" &&
                (t.side === "yes" || t.side === "no")
            );
            const sellTxns = transactions.filter((t: any) => t.type === "sell" && t.status === "confirmed");
            const totalSold = sellTxns.reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
            const payoutTxns = transactions.filter((t: any) => t.type === "payout" && t.status === "confirmed");
            const totalPayouts = payoutTxns.reduce((s: number, t: any) => s + Number(t.amount || 0), 0);

            // Only count wagers for resolved/closed positions as costs (not open wagers)
            const openPositionMarketIds = new Set(
              positions
                .filter((p: any) => p.shares > 0 && p.markets && p.markets.status === "active")
                .map((p: any) => p.market_id)
            );
            const resolvedBought = predictionBuyTxns
              .filter((t: any) => !openPositionMarketIds.has(t.market_id))
              .reduce((s: number, t: any) => s + Number(t.amount || 0), 0);

            // Unrealized P&L from open positions (price movement only)
            const unrealizedPnl = positions
              .filter((p: any) => p.shares > 0 && p.markets && p.markets.status === "active")
              .reduce((sum: number, p: any) => {
                const optPrice = p.market_options?.price;
                const currentPrice = optPrice != null ? Number(optPrice) : (p.side === "yes" ? p.markets.yes_price : p.markets.no_price);
                const invested = p.shares * p.avg_price;
                const currentValue = p.shares * currentPrice;
                return sum + (currentValue - invested);
              }, 0);
            // Quick Trade P&L
            const qtPnl = quickBets
              .filter((qb: any) => qb.status === "won" || qb.status === "lost")
              .reduce((sum: number, qb: any) => {
                if (qb.status === "won") return sum + (Number(qb.payout || 0) - Number(qb.amount));
                return sum - Number(qb.amount);
              }, 0);
            const pnl = totalPayouts + totalSold - resolvedBought + unrealizedPnl;
            const totalPredictions = predictionBuyTxns.length;
            const refundTxns = transactions.filter((t: any) => t.type === "refund" && t.status === "confirmed");
            const resolvedCount = payoutTxns.length + Math.max(0, totalPredictions - payoutTxns.length - refundTxns.length);
            const wins = payoutTxns.length;
            const winRate = resolvedCount > 0 && wins > 0 ? Math.round((wins / resolvedCount) * 100) : (totalPredictions > 0 && resolvedCount > 0 ? 0 : null);

            return [
              { label: "Predictions", value: totalPredictions.toString() },
              { label: "Win Rate", value: winRate !== null ? `${winRate}%` : "—" },
              { label: "PnL", value: pnl !== 0 ? `${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}` : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="glass rounded-xl p-3 text-center relative">
                <p className={`text-lg font-bold ${label === "PnL" && pnl > 0 ? "text-green-500" : label === "PnL" && pnl < 0 ? "text-destructive" : ""}`}>{value}</p>
                <p className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5">
                  {label}
                  {label === "PnL" && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help inline-block" />
                      </PopoverTrigger>
                      <PopoverContent side="bottom" className="max-w-[240px] text-xs p-3 space-y-1.5">
                        <p className="font-medium">Prediction PnL Breakdown</p>
                        <p className="text-muted-foreground">Settled payouts + sells − resolved wagers + unrealized P&L from open positions.</p>
                        {qtPnl !== 0 && (
                          <p className={`pt-1 border-t border-border ${qtPnl > 0 ? "text-green-500" : "text-destructive"}`}>
                            Quick Trade P&L: {qtPnl >= 0 ? "+" : ""}${qtPnl.toFixed(2)}
                          </p>
                        )}
                      </PopoverContent>
                    </Popover>
                  )}
                </p>
              </div>
            ));
          })()}
        </div>

        {/* Active Markets Usage (for verified creators) */}
        {profile?.verification_level && profile.verification_level !== "none" && (
          <div className="glass rounded-xl p-3 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                <span className="text-xs font-semibold">Active Markets</span>
              </div>
              <span className="text-sm font-bold">
                {(profile as any)?.unlimited_markets
                  ? <>{activeMarketCount} / <span className="text-primary">∞</span></>
                  : <>{activeMarketCount} / {profile.verification_level === "gold" ? (commissionSettings as any)?.gold_max_free_markets ?? 20 : (commissionSettings as any)?.blue_max_free_markets ?? 5}</>
                }
              </span>
            </div>
            {!(profile as any)?.unlimited_markets && (
              <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: `${Math.min(
                      (activeMarketCount / (profile.verification_level === "gold" ? (commissionSettings as any)?.gold_max_free_markets ?? 20 : (commissionSettings as any)?.blue_max_free_markets ?? 5)) * 100,
                      100
                    )}%`,
                  }}
                />
              </div>
            )}
            <p className="text-[10px] text-muted-foreground mt-1">
              {(profile as any)?.unlimited_markets
                ? "Unlimited — no free market cap applies"
                : `Free markets remaining: ${Math.max(0, (profile.verification_level === "gold" ? (commissionSettings as any)?.gold_max_free_markets ?? 20 : (commissionSettings as any)?.blue_max_free_markets ?? 5) - activeMarketCount)}`
              }
            </p>
          </div>
        )}

        {/* Copy Trade Stats */}
        <CopyTradeStats userId={user?.id} />

        {/* Actions */}
        <div className="space-y-3 mb-8">
          <button onClick={() => navigate("/portfolio")} className="w-full glass rounded-xl p-4 flex items-center gap-3 hover:bg-accent/50 transition-colors active:scale-[0.98]">
            <BarChart3 className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium">Portfolio</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
          </button>
          <button onClick={openDeposit} className="w-full glass rounded-xl p-4 flex items-center gap-3 hover:bg-accent/50 transition-colors active:scale-[0.98]">
            <ArrowDownToLine className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium flex-1 text-left">Deposit Funds</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
          <button onClick={openWithdraw} className="w-full glass rounded-xl p-4 flex items-center gap-3 hover:bg-accent/50 transition-colors active:scale-[0.98]">
            <ArrowUpFromLine className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium flex-1 text-left">Withdraw</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
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
          <button onClick={() => navigate("/my-promotions")} className="w-full glass rounded-xl p-4 flex items-center gap-3 hover:bg-accent/50 transition-colors active:scale-[0.98]">
            <Zap className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium flex-1 text-left">My Promotions</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>




        <div className="mb-6">
          <button
            onClick={() => navigate("/transactions")}
            className="w-full glass rounded-xl p-4 flex items-center gap-3 hover:bg-muted/50 transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Repeat className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-semibold">Transaction History</p>
              <p className="text-xs text-muted-foreground">View all deposits, withdrawals & trades</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
          </button>
        </div>

        {/* Security & KYC */}
        <div className="mb-6">
          <button
            onClick={() => navigate("/setup-security")}
            className="w-full glass rounded-xl p-4 flex items-center gap-3 hover:bg-muted/50 transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-semibold">Security & KYC</p>
              <p className="text-xs text-muted-foreground">Manage PIN, 2FA, password & identity verification</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Personal Info moved to Edit Profile modal */}

        {/* Telegram & Connect */}
        <div className="mb-6">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Connect</h3>
          <div className="space-y-2">
            {/* Wallet Connection */}
            <div ref={walletSectionRef} className="glass rounded-xl p-4">
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
              ) : connectors.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Wallet className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-semibold">Wallet detected</p>
                      <p className="text-xs text-muted-foreground">
                        {connectors.map(c => c.name).filter((v, i, a) => a.indexOf(v) === i).join(", ")}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => open()}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold bg-primary text-primary-foreground shadow-[0_0_20px_hsl(var(--neon-yes)/0.3)] transition-all active:scale-95"
                  >
                    <Wallet className="w-4 h-4" />
                    Connect Wallet
                  </button>
                </div>
              ) : (
                <div className="space-y-3 text-center">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center shrink-0">
                      <Link2 className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-semibold">No wallet linked</p>
                      <p className="text-xs text-muted-foreground">Use a wallet browser or desktop to connect</p>
                    </div>
                  </div>
                  <div className="bg-muted/30 rounded-xl p-3">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Open this page in a{" "}
                      <span className="font-semibold text-foreground">wallet browser</span> (MetaMask, Trust Wallet, SafePal, Coinbase Wallet, Rabby, Binance Wallet, Bitget Wallet) or use a{" "}
                      <span className="font-semibold text-foreground">desktop browser</span> with a Web3 wallet extension installed.
                    </p>
                    <div className="flex flex-wrap justify-center gap-1.5 mt-2">
                      {[
                        { name: "MetaMask", emoji: "🦊" },
                        { name: "Trust Wallet", emoji: "🛡️" },
                        { name: "SafePal", emoji: "🔐" },
                        { name: "Coinbase", emoji: "🔵" },
                        { name: "Rabby", emoji: "🐰" },
                        { name: "Binance", emoji: "🟡" },
                      ].map((w) => (
                        <span key={w.name} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/50 border border-border text-[10px] font-medium text-muted-foreground">
                          <span>{w.emoji}</span> {w.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            {/* Telegram Section */}
            {isFeatureEnabled("predict_via_telegram") && <TelegramSection userId={user?.id} />}
            {isFeatureEnabled("predict_via_whatsapp") && <WhatsAppSection userId={user?.id} />}
            <TwitterSection userId={user?.id} />
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
              { icon: Sparkles, label: "Replay Social Tour", href: "__social_tour__" },
              { icon: Video, label: "How-to Video Tutorials", href: "#", comingSoon: true },
              { icon: HelpCircle, label: "Frequently Asked Questions", href: "/faq" },
              { icon: Download, label: "Download App", href: "__install__" },
              ...(isFeatureEnabled("sales_deck") ? [{ icon: Users, label: "Sales Deck (Share & Recruit)", href: "/sales-deck" }] : []),
            ].map((item) => (
              item.comingSoon || item.href === "__install__" || item.href === "__social_tour__" ? (
                <button
                  key={item.label}
                  onClick={() => {
                    if (item.href === "__install__") {
                      setInstallOpen(true);
                    } else if (item.href === "__social_tour__") {
                      import("@/components/SocialTutorial").then(async ({ resetTutorial }) => {
                        await resetTutorial(user?.id);
                        navigate("/");
                        toast.success("Social tour will start momentarily!");
                      });
                    } else {
                      toast.info(`${item.label} — Coming Soon!`);
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
                <button
                  key={item.label}
                  onClick={() => navigate(item.href)}
                  className="w-full glass rounded-xl p-4 flex items-center gap-3 hover:bg-accent/50 transition-colors active:scale-[0.98] text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center shrink-0 text-muted-foreground">
                    <item.icon className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-medium flex-1">{item.label}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
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
              <button
                key={item.label}
                onClick={() => navigate(item.href)}
                className="w-full glass rounded-xl p-4 flex items-center gap-3 hover:bg-accent/50 transition-colors active:scale-[0.98]"
              >
                <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center shrink-0 text-muted-foreground">
                  <item.icon className="w-5 h-5" />
                </div>
                <span className="text-sm font-medium flex-1 text-left">{item.label}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      </div>

      <DepositWithdrawModal open={modalOpen} onClose={() => { setModalOpen(false); setResumePaymentId(null); setResumeProvider(null); }} initialTab={modalTab} resumePaymentId={resumePaymentId} resumeProvider={resumeProvider} />
      <InstallAppModal open={installOpen} onClose={() => setInstallOpen(false)} />
      
      <BottomNav />
      
    </div>
  );
};

export default Profile;
