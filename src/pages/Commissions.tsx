import { useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, DollarSign, Users, Gift, Copy, Clock, Sparkles, PieChart as PieChartIcon, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Wallet, ArrowDownToLine, ArrowUpFromLine, Gem, Shield } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from "recharts";
import { AnimatePresence, motion } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useUserBalance } from "@/hooks/useUserBalance";
import { useCommissionSettings } from "@/hooks/useCommissionSettings";
import { resolveAvatarUrl } from "@/lib/avatarUrl";

type TabKey = "all" | "creator" | "referral" | "copy_trade" | "signup_bonus" | "pending" | "gift_sent" | "gift_received" | "bonus" | "osure";

const tabs: { key: TabKey; label: string; icon: typeof DollarSign }[] = [
  { key: "all", label: "All", icon: DollarSign },
  { key: "creator", label: "Creator", icon: Sparkles },
  { key: "referral", label: "Referral", icon: Users },
  { key: "copy_trade", label: "Copy Trade", icon: Copy },
  { key: "signup_bonus", label: "Signup Bonus", icon: Gift },
  { key: "gift_sent", label: "Gifts Sent", icon: Gift },
  { key: "gift_received", label: "Gifts Received", icon: Gift },
  { key: "bonus", label: "Bonus", icon: Sparkles },
  { key: "osure", label: "oSURE", icon: Shield },
  { key: "pending", label: "Pending", icon: Clock },
];

const formatAmount = (n: number) => {
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
};
const formatDate = (d: string) => {
  const date = new Date(d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

// Balance cards are now inline below

const Commissions = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [showChart, setShowChart] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [giftDetailOpen, setGiftDetailOpen] = useState(false);
  const [giftAction, setGiftAction] = useState<"topup" | "withdraw" | null>(null);
  const [withdrawDest, setWithdrawDest] = useState<"main" | "gift" | null>(null);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [processing, setProcessing] = useState(false);
  const [bonusInfoOpen, setBonusInfoOpen] = useState(false);
  const [osureInfoOpen, setOsureInfoOpen] = useState(false);
  const [summaryCardInfo, setSummaryCardInfo] = useState<{ label: string; description: string } | null>(null);
  const ITEMS_PER_PAGE = 15;
  const queryClient = useQueryClient();
  const { balance, giftBalance, bonusBalance, rewardsBalance, insuranceBalance, totalGiftBalance, isLoading: balLoading } = useUserBalance();
  const { data: commSettings } = useCommissionSettings();
  const giftFeePercent = commSettings?.gift_fee_percent ?? 2;

  const handleTopUp = async () => {
    const amt = Number(topUpAmount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (amt > balance) { toast.error("Insufficient main balance"); return; }
    setProcessing(true);
    const { data, error } = await supabase.rpc("topup_gift_balance", { _user_id: user!.id, _amount: amt } as any);
    setProcessing(false);
    if (error || !(data as any)?.success) {
      toast.error((data as any)?.error || error?.message || "Top up failed");
      return;
    }
    toast.success(`Topped up $${amt.toFixed(2)} to gift balance`);
    setGiftAction(null);
    setTopUpAmount("");
    queryClient.invalidateQueries({ queryKey: ["balance"] });
  };

  const handleWithdraw = async () => {
    const amt = Number(withdrawAmount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (Math.round(amt * 100) > Math.round(rewardsBalance * 100)) { toast.error("Insufficient rewards balance"); return; }
    setProcessing(true);
    const { data, error } = await supabase.rpc("withdraw_rewards_balance", { _user_id: user!.id, _amount: amt } as any);
    setProcessing(false);
    if (error || !(data as any)?.success) {
      toast.error((data as any)?.error || error?.message || "Withdrawal failed");
      return;
    }
    toast.success(`Withdrew $${amt.toFixed(2)} to main balance`);
    setGiftAction(null);
    setWithdrawAmount("");
    queryClient.invalidateQueries({ queryKey: ["balance"] });
  };

  const handleTransferToGift = async () => {
    const amt = Number(withdrawAmount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (Math.round(amt * 100) > Math.round(rewardsBalance * 100)) { toast.error("Insufficient rewards balance"); return; }
    setProcessing(true);
    const { data, error } = await supabase.rpc("transfer_rewards_to_gift", { _user_id: user!.id, _amount: amt } as any);
    setProcessing(false);
    if (error || !(data as any)?.success) {
      toast.error((data as any)?.error || error?.message || "Transfer failed");
      return;
    }
    toast.success(`Transferred $${amt.toFixed(2)} to gift balance`);
    setGiftAction(null);
    setWithdrawDest(null);
    setWithdrawAmount("");
    queryClient.invalidateQueries({ queryKey: ["balance"] });
  };

  // Fetch pending_commissions (creator + referral, released + pending)
  const { data: pendingCommissions, isLoading: loadingPC } = useQuery({
    queryKey: ["commissions-breakdown", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("pending_commissions")
        .select("id, amount, type, status, created_at, releases_at, market_id")
        .eq("user_id", user!.id)
        .neq("type", "bc400")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  // Fetch copy_trade_earnings
  const { data: copyEarnings, isLoading: loadingCT } = useQuery({
    queryKey: ["copy-trade-earnings", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("copy_trade_earnings")
        .select("id, commission_amount, trade_type, created_at, market_id, copier_user_id, commission_percent")
        .eq("trader_user_id", user!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  // Fetch referral_rewards (signup bonus)
  const { data: signupBonuses, isLoading: loadingSB } = useQuery({
    queryKey: ["referral-rewards-breakdown", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("referral_rewards")
        .select("id, amount, created_at, referred_id")
        .eq("referrer_id", user!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  // Fetch gift transactions (sent & received) — Space gifts + DM gifts
  const { data: giftsSent, isLoading: loadingGS } = useQuery({
    queryKey: ["gifts-sent", user?.id],
    queryFn: async () => {
      const [spaceRes, dmMsgRes] = await Promise.all([
        supabase
          .from("space_gifts")
          .select("id, amount, emoji, created_at, recipient_id, space_id")
          .eq("sender_id", user!.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("dm_messages")
          .select("id, gift_amount, created_at, conversation_id, content")
          .eq("sender_id", user!.id)
          .gt("gift_amount", 0)
          .order("created_at", { ascending: false }),
      ]);
      const spaceGifts = (spaceRes.data ?? []).map((g: any) => ({ ...g, source: "space", counterpartyId: g.recipient_id }));
      
      // For DM gifts sent, resolve counterparty from conversations
      const dmGifts: any[] = [];
      const dmData = dmMsgRes.data ?? [];
      if (dmData.length > 0) {
        const convIds = [...new Set(dmData.map((m: any) => m.conversation_id))];
        const { data: convs } = await supabase
          .from("dm_conversations")
          .select("id, user_a, user_b")
          .in("id", convIds);
        const convMap = new Map((convs ?? []).map((c: any) => [c.id, c]));
        dmData.forEach((m: any) => {
          const conv = convMap.get(m.conversation_id);
          const counterpartyId = conv ? (conv.user_a === user!.id ? conv.user_b : conv.user_a) : null;
          dmGifts.push({
            id: m.id,
            amount: Math.abs(Number(m.gift_amount)),
            emoji: m.content || "💬",
            created_at: m.created_at,
            source: "dm",
            counterpartyId,
          });
        });
      }
      return [...spaceGifts, ...dmGifts].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    },
    enabled: !!user?.id,
  });

  const { data: giftsReceived, isLoading: loadingGR } = useQuery({
    queryKey: ["gifts-received", user?.id],
    queryFn: async () => {
      const [spaceRes, dmMsgRes] = await Promise.all([
        supabase
          .from("space_gifts")
          .select("id, amount, emoji, created_at, sender_id, space_id")
          .eq("recipient_id", user!.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("dm_messages")
          .select("id, gift_amount, created_at, conversation_id, sender_id, content")
          .neq("sender_id", user!.id)
          .gt("gift_amount", 0)
          .order("created_at", { ascending: false }),
      ]);
      // For received DM gifts, need to find conversations where user is participant
      const spaceGifts = (spaceRes.data ?? []).map((g: any) => ({ ...g, source: "space", counterpartyId: g.sender_id }));
      
      const dmGifts: any[] = [];
      const dmData = dmMsgRes.data ?? [];
      if (dmData.length > 0) {
        const convIds = [...new Set(dmData.map((m: any) => m.conversation_id))];
        const { data: convs } = await supabase
          .from("dm_conversations")
          .select("id, user_a, user_b")
          .in("id", convIds);
        const convMap = new Map((convs ?? []).map((c: any) => [c.id, c]));
        dmData.forEach((m: any) => {
          const conv = convMap.get(m.conversation_id);
          // Only include if user is a participant in this conversation
          if (!conv || (conv.user_a !== user!.id && conv.user_b !== user!.id)) return;
          dmGifts.push({
            id: m.id,
            amount: Number(m.gift_amount),
            emoji: m.content || "💬",
            created_at: m.created_at,
            source: "dm",
            counterpartyId: m.sender_id,
          });
        });
      }
      return [...spaceGifts, ...dmGifts].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    },
    enabled: !!user?.id,
  });

  // Fetch bonus transactions
  const { data: bonusTxns, isLoading: loadingBT } = useQuery({
    queryKey: ["bonus-transactions", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("id, amount, created_at, type, status")
        .eq("user_id", user!.id)
        .in("type", ["bonus", "signup_bonus_credit", "registration_bonus"])
        .eq("status", "confirmed")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  // Fetch insurance (oSURE) transactions
  const { data: osureTxns, isLoading: loadingOS } = useQuery({
    queryKey: ["osure-transactions", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("insurance_claims")
        .select("id, claim_amount, premium_paid, created_at, status, tier, market_id")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!user?.id,
  });


  const allMarketIds = useMemo(() => {
    const ids = new Set<string>();
    (pendingCommissions ?? []).forEach((c) => c.market_id && ids.add(c.market_id));
    (copyEarnings ?? []).forEach((c) => c.market_id && ids.add(c.market_id));
    return Array.from(ids);
  }, [pendingCommissions, copyEarnings]);

  const { data: marketTitles } = useQuery({
    queryKey: ["commission-market-titles", allMarketIds],
    queryFn: async () => {
      if (allMarketIds.length === 0) return {};
      const { data } = await supabase
        .from("markets")
        .select("id, title")
        .in("id", allMarketIds);
      const map: Record<string, string> = {};
      (data ?? []).forEach((m) => { map[m.id] = m.title; });
      return map;
    },
    enabled: allMarketIds.length > 0,
  });

  // Fetch referred user profiles
  const allReferredIds = useMemo(() => {
    const ids = new Set<string>();
    (signupBonuses ?? []).forEach((b) => b.referred_id && ids.add(b.referred_id));
    return Array.from(ids);
  }, [signupBonuses]);

  const { data: referredProfiles } = useQuery({
    queryKey: ["referred-profiles", allReferredIds],
    queryFn: async () => {
      if (allReferredIds.length === 0) return {};
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", allReferredIds);
      const map: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
      (data ?? []).forEach((p) => { map[p.id] = { display_name: p.display_name, avatar_url: p.avatar_url }; });
      return map;
    },
    enabled: allReferredIds.length > 0,
  });

  // Fetch copier profiles for copy trade earnings
  const allCopierIds = useMemo(() => {
    const ids = new Set<string>();
    (copyEarnings ?? []).forEach((c) => c.copier_user_id && ids.add(c.copier_user_id));
    return Array.from(ids);
  }, [copyEarnings]);

  const { data: copierProfiles } = useQuery({
    queryKey: ["copier-profiles", allCopierIds],
    queryFn: async () => {
      if (allCopierIds.length === 0) return {};
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", allCopierIds);
      const map: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
      (data ?? []).forEach((p) => { map[p.id] = { display_name: p.display_name, avatar_url: p.avatar_url }; });
      return map;
    },
    enabled: allCopierIds.length > 0,
  });

  // Fetch gift counterparty profiles
  const allGiftCounterpartyIds = useMemo(() => {
    const ids = new Set<string>();
    (giftsSent ?? []).forEach((g: any) => g.counterpartyId && ids.add(g.counterpartyId));
    (giftsReceived ?? []).forEach((g: any) => g.counterpartyId && ids.add(g.counterpartyId));
    return Array.from(ids);
  }, [giftsSent, giftsReceived]);

  const { data: giftProfiles } = useQuery({
    queryKey: ["gift-profiles", allGiftCounterpartyIds],
    queryFn: async () => {
      if (allGiftCounterpartyIds.length === 0) return {};
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", allGiftCounterpartyIds);
      const map: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
      (data ?? []).forEach((p) => { map[p.id] = { display_name: p.display_name, avatar_url: p.avatar_url }; });
      return map;
    },
    enabled: allGiftCounterpartyIds.length > 0,
  });

  const isLoading = loadingPC || loadingCT || loadingSB || loadingGS || loadingGR || loadingBT || loadingOS;

  // Compute totals
  const totals = useMemo(() => {
    const creator = (pendingCommissions ?? [])
      .filter((c) => c.type === "creator")
      .reduce((s, c) => s + Number(c.amount), 0);
    const referral = (pendingCommissions ?? [])
      .filter((c) => c.type === "referral")
      .reduce((s, c) => s + Number(c.amount), 0);
    const copyTrade = (copyEarnings ?? []).reduce((s, c) => s + Number(c.commission_amount), 0);
    const signup = (signupBonuses ?? []).reduce((s, c) => s + Number(c.amount), 0);
    const pending = (pendingCommissions ?? [])
      .filter((c) => c.status === "pending")
      .reduce((s, c) => s + Number(c.amount), 0);
    return { creator, referral, copyTrade, signup, pending, total: creator + referral + copyTrade + signup };
  }, [pendingCommissions, copyEarnings, signupBonuses]);

  // Normalize all records into a unified list
  const allRecords = useMemo(() => {
    const records: {
      id: string;
      category: TabKey;
      amount: number;
      date: string;
      status: "released" | "pending";
      marketId?: string | null;
      referredId?: string | null;
      copierId?: string | null;
      commissionPercent?: number | null;
      releasesAt?: string | null;
      emoji?: string | null;
      description?: string | null;
    }[] = [];

    (pendingCommissions ?? []).forEach((c) => {
      records.push({
        id: c.id,
        category: c.type as "creator" | "referral",
        amount: Number(c.amount),
        date: c.created_at,
        status: c.status as "released" | "pending",
        marketId: c.market_id,
        releasesAt: c.releases_at,
      });
    });

    (copyEarnings ?? []).forEach((c) => {
      records.push({
        id: c.id,
        category: "copy_trade",
        amount: Number(c.commission_amount),
        date: c.created_at,
        status: "released",
        marketId: c.market_id,
        copierId: c.copier_user_id,
        commissionPercent: c.commission_percent,
      });
    });

    (signupBonuses ?? []).forEach((c) => {
      records.push({
        id: c.id,
        category: "signup_bonus",
        amount: Number(c.amount),
        date: c.created_at,
        status: "released",
        referredId: c.referred_id,
      });
    });

    (giftsSent ?? []).forEach((g: any) => {
      const counterpartyName = g.counterpartyId && giftProfiles?.[g.counterpartyId]?.display_name;
      const toLabel = counterpartyName ? ` to ${counterpartyName}` : "";
      records.push({
        id: g.id,
        category: "gift_sent",
        amount: Number(g.amount),
        date: g.created_at,
        status: "released",
        emoji: g.emoji,
        description: `Sent ${g.emoji}${toLabel}${g.source === "dm" ? " (DM)" : ""}`,
      });
    });

    (giftsReceived ?? []).forEach((g: any) => {
      const counterpartyName = g.counterpartyId && giftProfiles?.[g.counterpartyId]?.display_name;
      const fromLabel = counterpartyName ? ` from ${counterpartyName}` : "";
      records.push({
        id: g.id,
        category: "gift_received",
        amount: Number(g.amount),
        date: g.created_at,
        status: "released",
        emoji: g.emoji,
        description: `Received ${g.emoji}${fromLabel}${g.source === "dm" ? " (DM)" : ""}`,
      });
    });

    (bonusTxns ?? []).forEach((t) => {
      records.push({
        id: t.id,
        category: "bonus",
        amount: Number(t.amount),
        date: t.created_at,
        status: "released",
        description: "Bonus credit",
      });
    });

    (osureTxns ?? []).forEach((t) => {
      records.push({
        id: t.id,
        category: "osure",
        amount: Number(t.claim_amount),
        date: t.created_at,
        status: t.status as "released" | "pending",
        marketId: t.market_id,
        description: `Tier ${t.tier} claim`,
      });
    });

    records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return records;
  }, [pendingCommissions, copyEarnings, signupBonuses, giftsSent, giftsReceived, bonusTxns, osureTxns, giftProfiles]);

  const filtered = (activeTab === "all"
    ? allRecords
    : activeTab === "pending"
      ? allRecords.filter((r) => r.status === "pending")
      : allRecords.filter((r) => r.category === activeTab)
  ).filter((r) => r.amount >= 0.0001);


  const summaryCards = [
    { label: "Wallet Balance", value: balance, icon: Wallet, color: "text-primary bg-primary/10", description: "Your available main balance that can be used for predictions, withdrawals, and topping up your gift balance." },
    { label: "Creator", value: totals.creator, icon: Gem, color: "text-violet-500 bg-violet-500/10", description: "Earnings from markets you created. You earn a creator fee each time someone places a prediction on your market." },
    { label: "Referral", value: totals.referral, icon: Users, color: "text-blue-500 bg-blue-500/10", description: "Commission earned when users you referred place predictions. You earn a percentage of the platform fee from their trades." },
    { label: "Copy Trade", value: totals.copyTrade, icon: Copy, color: "text-purple-500 bg-purple-500/10", description: "Commission earned when other users copy your trades and make a profit. You receive a percentage of their gains." },
    { label: "Signup Bonus", value: totals.signup, icon: Gift, color: "text-primary bg-primary/10", description: "One-time bonus rewards credited when users you referred successfully sign up and verify their account." },
    { label: "Pending", value: totals.pending, icon: Clock, color: "text-muted-foreground bg-muted", description: "Commissions that are still within the 48-hour hold period. Once released, they will be added to your main balance." },
  ];

  const categoryBadge: Record<string, { label: string; className: string }> = {
    creator: { label: "Creator", className: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
    referral: { label: "Referral", className: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
    copy_trade: { label: "Copy Trade", className: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
    signup_bonus: { label: "Signup Bonus", className: "bg-primary/10 text-primary border-primary/20" },
    gift_sent: { label: "Gift Sent", className: "bg-pink-500/10 text-pink-500 border-pink-500/20" },
    gift_received: { label: "Gift Received", className: "bg-green-500/10 text-green-500 border-green-500/20" },
    bonus: { label: "Bonus", className: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
    osure: { label: "oSURE", className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
    pending: { label: "Pending", className: "bg-muted text-muted-foreground border-border" },
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar />
        <div className="flex items-center justify-center" style={{ paddingTop: 'calc(var(--content-top) + 2rem)' }}>
          <p className="text-muted-foreground">Please sign in to view commissions.</p>
        </div>
        <BottomNav />
      </div>
    );
  }

  const renderExpandedDetails = (record: typeof allRecords[0]) => {
    const marketTitle = record.marketId ? marketTitles?.[record.marketId] : null;
    const referredProfile = record.referredId ? referredProfiles?.[record.referredId] : null;
    const copierProfile = record.copierId ? copierProfiles?.[record.copierId] : null;

    return (
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        className="overflow-hidden"
      >
        <div className="pt-2 mt-2 border-t border-border/50 space-y-2">
          {/* Amount & Date */}
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">Amount</span>
            <span className={`font-semibold ${record.category === "gift_sent" ? "text-red-500" : "text-green-500"}`}>
              {record.category === "gift_sent" ? "-" : "+"}{formatAmount(record.amount)}
            </span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">Date</span>
            <span className="text-foreground">{formatDate(record.date)}</span>
          </div>

          {/* Status */}
          {record.status === "pending" && record.releasesAt && (
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">Releases</span>
              <span className="text-foreground">{formatDate(record.releasesAt)}</span>
            </div>
          )}

          {/* Commission percent for copy trades */}
          {record.commissionPercent != null && (
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">Commission Rate</span>
              <span className="text-foreground">{record.commissionPercent}%</span>
            </div>
          )}

          {/* Market link */}
          {marketTitle && record.marketId && (
            <div className="flex justify-between items-start gap-2 text-[11px]">
              <span className="text-muted-foreground shrink-0">Market</span>
              <Link
                to={`/market/${record.marketId}`}
                className="text-primary hover:underline text-right flex items-center gap-1 min-w-0"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="truncate">{marketTitle}</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </Link>
            </div>
          )}

          {/* Referred user for signup bonuses */}
          {record.referredId && (
            <div className="flex justify-between items-center gap-2 text-[11px]">
              <span className="text-muted-foreground">Referred User</span>
              <Link
                to={`/user/${record.referredId}`}
                className="text-primary hover:underline flex items-center gap-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                {referredProfile?.avatar_url && (
                  <img src={resolveAvatarUrl(referredProfile.avatar_url)} alt="" className="w-4 h-4 rounded-full object-cover" />
                )}
                <span>{referredProfile?.display_name || "User"}</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </Link>
            </div>
          )}

          {/* Copier for copy trade earnings */}
          {record.copierId && (
            <div className="flex justify-between items-center gap-2 text-[11px]">
              <span className="text-muted-foreground">Copier</span>
              <Link
                to={`/user/${record.copierId}`}
                className="text-primary hover:underline flex items-center gap-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                {copierProfile?.avatar_url && (
                  <img src={resolveAvatarUrl(copierProfile.avatar_url)} alt="" className="w-4 h-4 rounded-full object-cover" />
                )}
                <span>{copierProfile?.display_name || "User"}</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </Link>
            </div>
          )}

          {/* Fee breakdown for gifts */}
          {(record.category === "gift_sent" || record.category === "gift_received") && (
            <>
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">Platform Fee</span>
                <span className="text-foreground">{giftFeePercent}%</span>
              </div>
              {record.category === "gift_sent" && (
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Recipient Gets</span>
                  <span className="text-foreground">{formatAmount(record.amount * (1 - giftFeePercent / 100))}</span>
                </div>
              )}
              {record.category === "gift_received" && (
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Net (after fee)</span>
                  <span className="text-green-500 font-semibold">{formatAmount(record.amount)}</span>
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen bg-background" style={{ paddingBottom: 'calc(1rem + var(--content-bottom))' }}>
      <TopBar />
      <div className="max-w-2xl mx-auto px-4 pt-[calc(3.5rem+var(--safe-top)+0.5rem)]">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold flex-1">Balance Breakdown</h1>
          {!isLoading && (totals.total > 0 || totalGiftBalance > 0 || bonusBalance > 0 || insuranceBalance > 0) && (
            <button
              onClick={() => setShowChart(!showChart)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                showChart ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <PieChartIcon className="w-3.5 h-3.5" />
              Chart
              <ChevronDown className={`w-3 h-3 transition-transform ${showChart ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>

        {/* Pie Chart (collapsible) */}
        <AnimatePresence>
          {showChart && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="overflow-hidden mb-5"
            >
              <Card className="border-border/50">
                <CardContent className="p-4">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={(() => {
                          const colorMap: Record<string, string> = {
                            Creator: "#8b5cf6",
                            Referral: "#3b82f6",
                            "Copy Trade": "#a855f7",
                            "Signup Bonus": "#22c55e",
                            Pending: "#f59e0b",
                            Gift: "#ec4899",
                            Bonus: "#f59e0b",
                            oSURE: "#10b981",
                          };
                          return [
                            { name: "Creator", value: totals.creator, color: colorMap.Creator },
                            { name: "Referral", value: totals.referral, color: colorMap.Referral },
                            { name: "Copy Trade", value: totals.copyTrade, color: colorMap["Copy Trade"] },
                            { name: "Signup Bonus", value: totals.signup, color: colorMap["Signup Bonus"] },
                            { name: "Pending", value: totals.pending, color: colorMap.Pending },
                            { name: "Gift", value: totalGiftBalance, color: colorMap.Gift },
                            { name: "Bonus", value: bonusBalance, color: colorMap.Bonus },
                            { name: "oSURE", value: insuranceBalance, color: colorMap.oSURE },
                          ].filter((d) => d.value > 0);
                        })()}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={3}
                        dataKey="value"
                        stroke="none"
                      >
                        {(() => {
                          const colorMap: Record<string, string> = {
                            Creator: "#8b5cf6",
                            Referral: "#3b82f6",
                            "Copy Trade": "#a855f7",
                            "Signup Bonus": "#22c55e",
                            Pending: "#f59e0b",
                            Gift: "#ec4899",
                            Bonus: "#f59e0b",
                            oSURE: "#10b981",
                          };
                          return [
                            { name: "Creator", value: totals.creator },
                            { name: "Referral", value: totals.referral },
                            { name: "Copy Trade", value: totals.copyTrade },
                            { name: "Signup Bonus", value: totals.signup },
                            { name: "Pending", value: totals.pending },
                            { name: "Gift", value: totalGiftBalance },
                            { name: "Bonus", value: bonusBalance },
                            { name: "oSURE", value: insuranceBalance },
                          ]
                            .filter((d) => d.value > 0)
                            .map((d, i) => <Cell key={i} fill={colorMap[d.name]} />);
                        })()}
                      </Pie>
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "12px",
                          color: "hsl(var(--foreground))",
                        }}
                        itemStyle={{ color: "hsl(var(--foreground))" }}
                        labelStyle={{ color: "hsl(var(--foreground))" }}
                        formatter={(value: number) => [`$${value.toFixed(2)}`]}
                      />
                      <Legend iconSize={8} wrapperStyle={{ fontSize: "11px", color: "hsl(var(--foreground))" }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <p className="text-center text-xs text-muted-foreground mt-1">
                    Total: <span className="font-bold text-foreground">{formatAmount(totals.total + totalGiftBalance + bonusBalance + insuranceBalance)}</span>
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-2 mb-2">
          {summaryCards.map((card) => (
            <Card
              key={card.label}
              className="border-border/50 cursor-pointer hover:border-primary/30 transition-colors"
              onClick={() => setSummaryCardInfo({ label: card.label, description: card.description })}
            >
              <CardContent className="p-3 flex flex-col items-center text-center gap-1.5 min-h-[100px] justify-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${card.color}`}>
                  <card.icon className="w-4 h-4" />
                </div>
                <span className="text-sm font-bold h-5 flex items-center">
                  {isLoading ? <Skeleton className="h-4 w-14" /> : formatAmount(card.value)}
                </span>
                <span className="text-[10px] text-muted-foreground leading-tight">{card.label}</span>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Balance Cards */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          {/* Gift Balance (combined) */}
          <Card
            className="border-border/50 cursor-pointer hover:border-primary/30 transition-colors"
            onClick={() => setGiftDetailOpen(true)}
          >
            <CardContent className="p-3 flex flex-col items-center text-center gap-1.5 min-h-[110px] justify-center">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-pink-500 bg-pink-500/10">
                <Gift className="w-4 h-4" />
              </div>
              <span className="text-sm font-bold h-5 flex items-center">
                {balLoading ? <Skeleton className="h-4 w-14" /> : formatAmount(totalGiftBalance)}
              </span>
              <span className="text-[10px] text-muted-foreground leading-tight">Gift Balance</span>
              <span className="text-[9px] text-primary font-medium">Tap to top up ▸</span>
            </CardContent>
          </Card>

          {/* Bonus Balance */}
          <Card
            className="border-border/50 cursor-pointer hover:border-primary/30 transition-colors"
            onClick={() => setBonusInfoOpen(true)}
          >
            <CardContent className="p-3 flex flex-col items-center text-center gap-1.5 min-h-[110px] justify-center">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-amber-500 bg-amber-500/10">
                <Sparkles className="w-4 h-4" />
              </div>
              <span className="text-sm font-bold h-5 flex items-center">
                {balLoading ? <Skeleton className="h-4 w-14" /> : formatAmount(bonusBalance)}
              </span>
              <span className="text-[10px] text-muted-foreground leading-tight">Bonus Balance</span>
            </CardContent>
          </Card>

          {/* oSURE Balance */}
          <Card
            className="border-border/50 cursor-pointer hover:border-primary/30 transition-colors"
            onClick={() => setOsureInfoOpen(true)}
          >
            <CardContent className="p-3 flex flex-col items-center text-center gap-1.5 min-h-[110px] justify-center">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-emerald-500 bg-emerald-500/10">
                <Shield className="w-4 h-4" />
              </div>
              <span className="text-sm font-bold h-5 flex items-center">
                {balLoading ? <Skeleton className="h-4 w-14" /> : formatAmount(insuranceBalance)}
              </span>
              <span className="text-[10px] text-muted-foreground leading-tight">oSURE Balance</span>
            </CardContent>
          </Card>
        </div>

        {/* Gift Balance Detail Dialog */}
        <Dialog open={giftDetailOpen} onOpenChange={(open) => { setGiftDetailOpen(open); if (!open) { setGiftAction(null); setWithdrawDest(null); } }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Gift className="w-5 h-5 text-pink-500" /> Gift Balance Details
              </DialogTitle>
            </DialogHeader>

            {giftAction === null && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3">
                  <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                    <span className="text-sm text-muted-foreground">Total Balance</span>
                    <span className="text-lg font-bold">{formatAmount(totalGiftBalance)}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                    <span className="text-sm text-muted-foreground">Available to Send</span>
                    <span className="text-sm font-semibold">{formatAmount(giftBalance)}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                    <span className="text-sm text-muted-foreground">Gifts Received</span>
                    <span className="text-sm font-semibold text-green-500">{formatAmount(rewardsBalance)}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 gap-1.5" onClick={() => setGiftAction("topup")}>
                    <ArrowDownToLine className="w-4 h-4" /> Top Up
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 gap-1.5"
                    onClick={() => setGiftAction("withdraw")}
                    disabled={rewardsBalance <= 0}
                  >
                    <ArrowUpFromLine className="w-4 h-4" /> Withdraw
                  </Button>
                </div>
              </div>
            )}

            {giftAction === "topup" && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Transfer from your main balance ({formatAmount(balance)}) to your gift balance for sending emoji gifts in Spaces.
                </p>
                <Input
                  type="number"
                  placeholder="Amount"
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value)}
                  min={0.01}
                  step={0.01}
                />
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => { setGiftAction(null); setTopUpAmount(""); }}>
                    Back
                  </Button>
                  <Button onClick={handleTopUp} disabled={processing} className="flex-1">
                    {processing ? "Processing..." : "Top Up"}
                  </Button>
                </div>
              </div>
            )}

            {giftAction === "withdraw" && withdrawDest === null && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Where would you like to transfer your received gifts ({formatAmount(rewardsBalance)})?
                </p>
                <div className="grid grid-cols-1 gap-2">
                  <Button variant="outline" className="w-full justify-start gap-2 h-12" onClick={() => setWithdrawDest("main")}>
                    <Wallet className="w-4 h-4 text-primary" /> To Main Balance
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2 h-12" onClick={() => setWithdrawDest("gift")}>
                    <Gift className="w-4 h-4 text-pink-500" /> To Gift Balance
                  </Button>
                </div>
                <Button variant="ghost" className="w-full" onClick={() => { setGiftAction(null); }}>
                  ← Back
                </Button>
              </div>
            )}

            {giftAction === "withdraw" && withdrawDest !== null && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Transfer to {withdrawDest === "main" ? "main balance" : "gift balance"} — Available: {formatAmount(rewardsBalance)}
                </p>
                <Input
                  type="number"
                  placeholder="Amount"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  min={0.01}
                  step={0.01}
                />
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => { setWithdrawDest(null); setWithdrawAmount(""); }}>
                    Back
                  </Button>
                  <Button onClick={withdrawDest === "main" ? handleWithdraw : handleTransferToGift} disabled={processing} className="flex-1">
                    {processing ? "Processing..." : "Transfer"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Bonus Balance Info Dialog */}
        <Dialog open={bonusInfoOpen} onOpenChange={setBonusInfoOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" /> Bonus Balance
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                <span className="text-sm text-muted-foreground">Current Balance</span>
                <span className="text-lg font-bold">{formatAmount(bonusBalance)}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Bonus balance is earned from registration rewards and promotions. It can be used to pay for platform services like market creation fees, AI generation costs, and prediction fees. It cannot be used for direct wagers or withdrawals.
              </p>
            </div>
          </DialogContent>
        </Dialog>

        {/* oSURE Balance Info Dialog */}
        <Dialog open={osureInfoOpen} onOpenChange={setOsureInfoOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-emerald-500" /> oSURE Balance
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                <span className="text-sm text-muted-foreground">Current Balance</span>
                <span className="text-lg font-bold">{formatAmount(insuranceBalance)}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                oSURE balance is your prediction protection fund. When you lose a protected prediction, the coverage amount is credited here. Use it on future predictions — it unlocks to your main balance when you win.
              </p>
            </div>
          </DialogContent>
        </Dialog>

        {/* Summary Card Info Dialog */}
        <Dialog open={!!summaryCardInfo} onOpenChange={(open) => { if (!open) setSummaryCardInfo(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{summaryCardInfo?.label}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {summaryCardInfo?.description}
            </p>
          </DialogContent>
        </Dialog>

        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4 scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setCurrentPage(1); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="w-3 h-3" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* History */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <DollarSign className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No commission records yet</p>
          </div>
        ) : (
          <>
          <div className="space-y-2">
            {filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE).map((record) => {
              const badge = categoryBadge[record.category];
              const isExpanded = expandedId === record.id;
              return (
                <div
                  key={record.id}
                  className="glass rounded-xl p-3 cursor-pointer hover:bg-accent/30 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : record.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${badge?.className ?? ""}`}>
                          {badge?.label ?? record.category}
                        </Badge>
                        {record.status === "pending" && (
                          <span className="text-[10px] text-muted-foreground">⏳ 48h hold</span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {record.description ? `${record.description} · ` : ""}{formatDate(record.date)}
                      </p>
                    </div>
                    <span className={`text-sm font-bold ${record.category === "gift_sent" ? "text-red-500" : "text-green-500"}`}>
                      {record.category === "gift_sent" ? "-" : "+"}{formatAmount(record.amount)}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  </div>
                  <AnimatePresence>
                    {isExpanded && renderExpandedDetails(record)}
                  </AnimatePresence>
                </div>
              );
            })}
          </div><div className="mb-4" />
          {(() => {
            const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
            if (totalPages <= 1) return null;
            return (
              <div className="flex items-center justify-center gap-1.5 mt-4 mb-6">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                      page === currentPage
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted text-muted-foreground"
                    }`}
                  >
                    {page}
                  </button>
                ))}
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            );
          })()}
          </>
        )}
      </div>
      <BottomNav />
    </div>
  );
};

export default Commissions;
