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
  Video, HelpCircle, Shield, ClipboardCheck, Lock, Trophy, Pencil, Download, Copy, Link2, Unlink, Loader2, Camera, Image, BarChart3, Globe, EyeOff, Users, Sparkles, Zap, ArrowUp, ArrowDown, DollarSign, Bell,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import NftBadge, { isNftAvatar } from "@/components/NftBadge";
import { AnimatePresence, motion } from "framer-motion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import CopyTradeStats from "@/components/CopyTradeStats";
import { useCommissionSettings } from "@/hooks/useCommissionSettings";

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

type FilterType = "all" | "trades" | "deposits" | "withdrawals" | "quick_trades" | "earnings";
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
              <button
                type="button"
                role="switch"
                aria-checked={prefs[key]}
                onClick={() => togglePref(key)}
                className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${prefs[key] ? "bg-green-500" : "bg-muted-foreground/30"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${prefs[key] ? "translate-x-4" : ""}`} />
              </button>
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

const SecuritySettingsSection = ({ userId }: { userId?: string }) => {
  const queryClient = useQueryClient();
  const { data: secSettings, isLoading } = useQuery({
    queryKey: ["security_settings", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await supabase
        .from("user_security_settings" as any)
        .select("pin_enabled, totp_enabled, require_pin_withdrawal, require_totp_withdrawal, require_pin_login, require_totp_login")
        .eq("user_id", userId)
        .maybeSingle();
      return data as unknown as { pin_enabled: boolean; totp_enabled: boolean; require_pin_withdrawal: boolean; require_totp_withdrawal: boolean; require_pin_login: boolean; require_totp_login: boolean } | null;
    },
    enabled: !!userId,
  });

  const updateToggle = async (field: string, value: boolean) => {
    if (!userId) return;
    const { error } = await supabase
      .from("user_security_settings" as any)
      .update({ [field]: value, updated_at: new Date().toISOString() } as any)
      .eq("user_id", userId);
    if (error) { toast.error("Failed to update"); return; }
    queryClient.invalidateQueries({ queryKey: ["security_settings", userId] });
    toast.success("Updated");
  };

  if (isLoading) return null;

  const pinActive = secSettings?.pin_enabled ?? false;
  const totpActive = secSettings?.totp_enabled ?? false;
  const anyLoginSec = (secSettings?.require_pin_login ?? false) || (secSettings?.require_totp_login ?? false);

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Security</h3>
        {pinActive && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold">
            <Lock className="w-3 h-3" /> PIN
          </span>
        )}
        {totpActive && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold">
            <Shield className="w-3 h-3" /> 2FA
          </span>
        )}
        {anyLoginSec && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold">
            Login Protected
          </span>
        )}
      </div>
      <div className="space-y-2">
        {secSettings?.pin_enabled && (
          <>
            <div className="glass rounded-xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">PIN for Login</p>
                <p className="text-xs text-muted-foreground">Require PIN after signing in</p>
              </div>
              <Switch
                checked={secSettings?.require_pin_login ?? false}
                onCheckedChange={(v) => updateToggle("require_pin_login", v)}
              />
            </div>
            <div className="glass rounded-xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">PIN for Withdrawals</p>
                <p className="text-xs text-muted-foreground">Require PIN before withdrawing</p>
              </div>
              <Switch
                checked={secSettings?.require_pin_withdrawal ?? false}
                onCheckedChange={(v) => updateToggle("require_pin_withdrawal", v)}
              />
            </div>
          </>
        )}
        {secSettings?.totp_enabled && (
          <>
            <div className="glass rounded-xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Shield className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">2FA for Login</p>
                <p className="text-xs text-muted-foreground">Require authenticator code after signing in</p>
              </div>
              <Switch
                checked={secSettings?.require_totp_login ?? false}
                onCheckedChange={(v) => updateToggle("require_totp_login", v)}
              />
            </div>
            <div className="glass rounded-xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Shield className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">2FA for Withdrawals</p>
                <p className="text-xs text-muted-foreground">Require Google Authenticator code</p>
              </div>
              <Switch
                checked={secSettings?.require_totp_withdrawal ?? false}
                onCheckedChange={(v) => updateToggle("require_totp_withdrawal", v)}
              />
            </div>
          </>
        )}
        {!secSettings?.pin_enabled && !secSettings?.totp_enabled && (
          <div className="glass rounded-xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">No security methods set up</p>
              <p className="text-xs text-muted-foreground">Set up a PIN or 2FA to secure withdrawals</p>
            </div>
            <a href="/setup-security" className="text-xs text-primary font-semibold">Set Up</a>
          </div>
        )}
      </div>
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
  const queryClient = useQueryClient();
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useFilteredConnectors();
  const { disconnect } = useDisconnect();
  const { open } = useAppKit();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<"deposit" | "withdraw">("deposit");
  const [resumePaymentId, setResumePaymentId] = useState<string | null>(null);
  const [resumeProvider, setResumeProvider] = useState<string | null>(null);
  const [txFilter, setTxFilter] = useState<FilterType>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [txPage, setTxPage] = useState(1);
  const TX_PER_PAGE = 10;
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
  const [editIsPublic, setEditIsPublic] = useState(true);
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
      const { data } = await supabase
        .from("profiles")
        .select("wallet_address, avatar_url, display_name, is_public, bio, verification_level")
        .eq("id", user.id)
        .single();
      return data;
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
    const ext = avatarFile.name.split(".").pop();
    const path = `${user.id}/avatar.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, avatarFile, { upsert: true });
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

  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("transactions")
        .select("*, markets(title)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
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
        .order("created_at", { ascending: false });
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
        .select("*, markets(yes_price, no_price, status)")
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
        .in("status", ["active", "pending"]);
      return count || 0;
    },
    enabled: !!user,
  });

  const openDeposit = () => { setResumePaymentId(null); setResumeProvider(null); setModalTab("deposit"); setModalOpen(true); };
  const openWithdraw = () => { setResumePaymentId(null); setResumeProvider(null); setModalTab("withdraw"); setModalOpen(true); };

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
    if (txFilter === "trades") result = result.filter((t: any) => t.type === "buy" || t.type === "sell");
    else if (txFilter === "deposits") result = result.filter((t: any) => t.type === "deposit");
    else if (txFilter === "withdrawals") result = result.filter((t: any) => t.type === "withdraw" || t.type === "withdrawal");
    else if (txFilter === "earnings") result = result.filter((t: any) => t.type === "commission" || t.type === "payout" || t.type === "refund");

    // Hide expired deposits everywhere except the "failed" status filter
    if (statusFilter !== "failed") {
      result = result.filter((t: any) => !(t.type === "deposit" && t.status === "expired"));
    }

    // Hide zero-amount commission transactions
    result = result.filter((t: any) => !(t.type === "commission" && Number(t.amount) === 0));

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

  const displayName = authDisplayName;

  if (!authLoading && !user) {
    return (
      <div className="min-h-dvh bg-background" style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}>
        <TopBar />
        <div className="max-w-lg md:max-w-4xl mx-auto px-4 flex flex-col items-center justify-center" style={{ minHeight: "60vh", paddingTop: 'calc(5rem + env(safe-area-inset-top))' }}>
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
      style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))', touchAction: 'pan-y', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', willChange: 'scroll-position' } as React.CSSProperties}
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
                    <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl font-bold text-primary">{displayName.charAt(0).toUpperCase()}</span>
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
      <div className="max-w-lg md:max-w-4xl mx-auto px-3 sm:px-4" style={{ paddingTop: 'calc(5rem + env(safe-area-inset-top))' }}>
        {/* Avatar & Profile Edit */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative mb-3">
            <div className="w-20 h-20 rounded-full bg-primary/20 border-2 border-primary/30 flex items-center justify-center overflow-hidden">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-primary">{displayName.charAt(0).toUpperCase()}</span>
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
          <p className="text-xs text-muted-foreground">
            {user?.email ? `${user.email.slice(0, 3)}***@${user.email.split("@")[1]}` : ""}
          </p>
          <div className="mt-3 flex items-center justify-center gap-3">
            <button
              onClick={() => {
                setEditName(profile?.display_name || authDisplayName);
                setEditBio((profile as any)?.bio || "");
                setEditIsPublic((profile as any)?.is_public ?? true);
                setAvatarPreview(null);
                setAvatarFile(null);
                setSelectedNftUrl(null);
                setEditingProfile(true);
              }}
              className="text-xs text-primary font-semibold hover:underline flex items-center gap-1"
            >
              <Pencil className="w-3 h-3" /> Edit Profile
            </button>
            <div className="w-1 h-1 rounded-full bg-muted-foreground/30"></div>
            <button
              onClick={() => navigate(`/user/${user?.id}`)}
              className="text-xs text-muted-foreground font-semibold hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <Users className="w-3 h-3" /> Social
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
                className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="fixed inset-4 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-md glass-strong rounded-2xl p-5 z-50 overflow-y-auto flex flex-col"
                style={{ maxHeight: "calc(100dvh - 2rem)" }}
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
                          <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xl font-bold text-primary">{displayName.charAt(0).toUpperCase()}</span>
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
                          // Moderate display name
                          try {
                            const { data: nameModData } = await supabase.functions.invoke("moderate-display-name", {
                              body: { name: editName.trim() },
                            });
                            if (nameModData?.flagged) {
                              await supabase.from("moderation_logs").insert({
                                content_type: "display_name",
                                user_id: user!.id,
                                flagged_content: editName.trim(),
                                reason: nameModData.reason || "Flagged by AI",
                                category: "profanity",
                              });
              toast.error("Display name not allowed", {
                description: nameModData.reason || "This display name contains inappropriate content. Please choose another.",
                duration: 6000,
              });
                              setSavingProfile(false);
                              return;
                            }
                          } catch (err) {
                            console.error("Name moderation check failed, proceeding:", err);
                          }

                          let avatarUrl: string | null = null;
                          if (selectedNftUrl) {
                            avatarUrl = selectedNftUrl;
                          } else if (avatarFile) {
                            avatarUrl = await uploadAvatar();
                            if (!avatarUrl && avatarFile) { setSavingProfile(false); return; }
                          }

                          // Moderate uploaded image
                          if (avatarUrl) {
                            try {
                              const { data: imgModData } = await supabase.functions.invoke("moderate-image", {
                                body: { image_url: avatarUrl },
                              });
                              if (imgModData?.flagged) {
                                await supabase.from("moderation_logs").insert({
                                  content_type: "image",
                                  user_id: user!.id,
                                  flagged_content: avatarUrl,
                                  reason: imgModData.reason || "Flagged by AI",
                                  category: imgModData.category || "nsfw",
                                });
                                toast.error(imgModData.reason || "This image is not allowed");
                                setSavingProfile(false);
                                return;
                              }
                            } catch (err) {
                              console.error("Image moderation check failed, proceeding:", err);
                            }
                          }

                          // Update profile table first (more reliable)
                          const { error: profileError } = await supabase.from("profiles").update({
                            display_name: editName.trim(),
                            bio: editBio.trim(),
                            is_public: editIsPublic,
                            ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
                          } as any).eq("id", user!.id);
                          if (profileError) {
                            if (profileError.message?.includes("unique_display_name") || profileError.code === "23505") {
                              toast.error("This username is already taken. Please choose a different one.");
                            } else {
                              toast.error("Failed to update profile");
                            }
                            setSavingProfile(false);
                            return;
                          }

                          // Update auth metadata (fire-and-forget with timeout)
                          const authUpdatePromise = supabase.auth.updateUser({
                            data: { display_name: editName.trim(), ...(avatarUrl ? { avatar_url: avatarUrl } : {}) },
                          });
                          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000));
                          try {
                            await Promise.race([authUpdatePromise, timeoutPromise]);
                          } catch {
                            // Auth metadata update timed out or failed — profile is already saved, continue
                          }

                          queryClient.invalidateQueries({ queryKey: ["profile", user!.id] });
                          queryClient.invalidateQueries({ queryKey: ["profile_display_name", user!.id] });
                          setAvatarFile(null);
                          setAvatarPreview(null);
                          setSelectedNftUrl(null);
                          setShowNftPicker(false);
                          toast.success("Profile updated!");
                          setEditingProfile(false);

                          // Refresh verification level in background
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
        <div className="glass rounded-xl p-4 mb-6 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Balance</p>
          <p className="text-3xl font-bold text-primary">${balance.toFixed(2)}</p>
          <p className="text-[10px] text-muted-foreground">USD</p>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-3">
          {(() => {
            const predictionBuyTxns = transactions.filter(
              (t: any) =>
                t.type === "buy" &&
                t.status === "confirmed" &&
                (t.side === "yes" || t.side === "no")
            );
            const sellTxns = transactions.filter((t: any) => t.type === "sell" && t.status === "confirmed");
            const totalBought = predictionBuyTxns.reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
            const totalSold = sellTxns.reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
            const payoutTxns = transactions.filter((t: any) => t.type === "payout" && t.status === "confirmed");
            const totalPayouts = payoutTxns.reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
            // Unrealized P&L from open positions
            const unrealizedPnl = positions
              .filter((p: any) => p.shares > 0 && p.markets && p.markets.status === "active")
              .reduce((sum: number, p: any) => {
                const currentPrice = p.side === "yes" ? p.markets.yes_price : p.markets.no_price;
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
            const pnl = totalPayouts + totalSold - totalBought + unrealizedPnl + qtPnl;
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
                <p className={`text-lg font-bold ${label === "PnL" && pnl > 0 ? "text-primary" : label === "PnL" && pnl < 0 ? "text-destructive" : ""}`}>{value}</p>
                <p className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5">
                  {label}
                  {label === "PnL" && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help inline-block" />
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[220px] text-xs">
                        Payouts + Sells − Wagers + Unrealized P&L from open positions + Quick Trade wins/losses.
                      </TooltipContent>
                    </Tooltip>
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
                {activeMarketCount} / {profile.verification_level === "gold" ? (commissionSettings as any)?.gold_max_free_markets ?? 20 : (commissionSettings as any)?.blue_max_free_markets ?? 5}
              </span>
            </div>
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
            <p className="text-[10px] text-muted-foreground mt-1">
              Free markets remaining: {Math.max(0, (profile.verification_level === "gold" ? (commissionSettings as any)?.gold_max_free_markets ?? 20 : (commissionSettings as any)?.blue_max_free_markets ?? 5) - activeMarketCount)}
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
          <button onClick={() => navigate("/commissions")} className="w-full glass rounded-xl p-4 flex items-center gap-3 hover:bg-accent/50 transition-colors active:scale-[0.98]">
            <DollarSign className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium flex-1 text-left">Commission Breakdown</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Wallet Management */}
        <div ref={walletSectionRef} className="mb-6">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Wallet Connection</h3>
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
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Transaction History</h3>
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
          <div className="flex gap-2 mb-3 flex-wrap">
            {(["all", "trades", "quick_trades", "deposits", "withdrawals", "earnings"] as FilterType[]).map((f) => (
              <button key={f} onClick={() => { setTxFilter(f); setTxPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize ${txFilter === f ? "bg-primary text-primary-foreground" : "glass text-muted-foreground hover:text-foreground"}`}>
                {f === "deposits" ? "Deposits" : f === "withdrawals" ? "Withdrawals" : f === "quick_trades" ? "Quick Trades" : f === "trades" ? "Predictions" : f === "earnings" ? "Earnings" : f}
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

          <div className="space-y-2">
            {paginatedTx.map((tx: any, i: number) => {
              // Quick trade rendering
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
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              {tx.asset}
                            </span>
                            {tx.streak > 1 && <span className="text-[10px] text-amber-500 font-bold">🔥{tx.streak}</span>}
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                              won ? "bg-green-500/10 text-green-500"
                              : lost ? "bg-destructive/10 text-destructive"
                              : "bg-yellow-500/10 text-yellow-500"
                            }`}>
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
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
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

              const txKey: TxType = (tx.type === "buy" && tx.side === "initial_liquidity") ? "initial_liquidity" : (tx.type as TxType);
              const cfg = txConfig[txKey] || txConfig.buy;
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
                  className={`glass rounded-xl p-3.5 cursor-pointer hover:ring-1 hover:ring-border transition-all`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${cfg.colorClass}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{cfg.label}</span>
                          {tx.is_copy_trade && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-accent text-accent-foreground border border-border">
                              📋 Copied
                            </span>
                          )}
                          {tx.side && tx.side !== "initial_liquidity" && (tx.type === "buy" || tx.type === "sell") && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${tx.side === "yes" ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}`}>
                              {tx.side.toUpperCase()}
                            </span>
                          )}
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                            tx.status === "confirmed"
                              ? "bg-green-500/10 text-green-500"
                              : tx.status === "pending"
                              ? "bg-yellow-500/10 text-yellow-500"
                              : tx.status === "failed" || tx.status === "expired"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-muted text-muted-foreground"
                          }`}>
                            {tx.status === "confirmed" ? "✓ Confirmed" : tx.status === "pending" ? "⏳ Pending" : tx.status === "failed" ? "✗ Failed" : tx.status === "expired" ? "✗ Expired" : tx.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-sm font-bold ${["sell", "deposit", "payout", "refund", "commission", "qt_one_sided_bonus"].includes(tx.type) ? "text-green-500" : "text-destructive"}`}>
                            {["sell", "deposit", "payout", "refund", "commission", "qt_one_sided_bonus"].includes(tx.type) ? "+" : "-"}${Number(tx.amount).toFixed(2)}
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
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
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

          {/* Pagination controls */}
          {filteredTx.length > TX_PER_PAGE && (
            <div className="flex items-center justify-center gap-3 mt-4">
              <button
                onClick={() => setTxPage((p) => Math.max(1, p - 1))}
                disabled={txPage === 1}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold glass text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <span className="text-xs text-muted-foreground">
                Page {txPage} of {txTotalPages}
              </span>
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

        {/* Security Settings */}
        <SecuritySettingsSection userId={user?.id} />

        {/* Telegram & Connect */}
        <div className="mb-6">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Connect</h3>
          <div className="space-y-2">
            {/* Telegram Section */}
            {isFeatureEnabled("predict_via_telegram") && <TelegramSection userId={user?.id} />}
            {isFeatureEnabled("predict_via_whatsapp") && <WhatsAppSection userId={user?.id} />}
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

      <DepositWithdrawModal open={modalOpen} onClose={() => { setModalOpen(false); setResumePaymentId(null); setResumeProvider(null); }} initialTab={modalTab} resumePaymentId={resumePaymentId} resumeProvider={resumeProvider} />
      <InstallAppModal open={installOpen} onClose={() => setInstallOpen(false)} />
      
      <BottomNav />
      
    </div>
  );
};

export default Profile;
