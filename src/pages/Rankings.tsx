import { resolveAvatarUrl } from "@/lib/avatarUrl";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { Trophy, TrendingUp, TrendingDown, Medal, Crown, Award, Users, Star, Calendar, Share2, ArrowLeft, Zap, Flame, ChevronLeft, ChevronRight, LogIn } from "lucide-react";
import { Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import useAnalytics from "@/hooks/useAnalytics";
import RankShareModal from "@/components/RankShareModal";
import NftBadge, { type VerificationLevel } from "@/components/NftBadge";
import FollowButton from "@/components/FollowButton";
import { Button } from "@/components/ui/button";


interface Referrer {
  userId: string;
  name: string;
  avatar: string | null;
  verificationLevel: VerificationLevel;
  totalReferrals: number;
  totalEarned: number;
}

interface Trader {
  userId: string;
  name: string;
  avatar: string | null;
  verificationLevel: VerificationLevel;
  pnl: number;
  trades: number;
  volume: number;
}

type Tab = "referrers" | "traders" | "quick";
type QuickSubTab = "profit" | "streaks" | "volume";
type ReferralSort = "totalEarned" | "totalReferrals";
type TraderSort = "pnl" | "volume" | "trades";
type TimePeriod = "week" | "month" | "all";

const TIME_PERIODS: { key: TimePeriod; label: string }[] = [
  { key: "week", label: "Weekly" },
  { key: "month", label: "Monthly" },
  { key: "all", label: "All Time" },
];

const getCutoffDate = (period: TimePeriod): string | null => {
  if (period === "all") return null;
  const d = new Date();
  if (period === "week") d.setDate(d.getDate() - 7);
  else d.setMonth(d.getMonth() - 1);
  return d.toISOString();
};

const rankBadge = (rank: number) => {
  if (rank === 1) return <Crown className="w-5 h-5" style={{ color: "hsl(45, 93%, 58%)" }} />;
  if (rank === 2) return <Medal className="w-5 h-5" style={{ color: "hsl(0, 0%, 78%)" }} />;
  if (rank === 3) return <Award className="w-5 h-5" style={{ color: "hsl(30, 75%, 40%)" }} />;
  return <span className="text-sm font-bold text-muted-foreground w-5 text-center">#{rank}</span>;
};

const formatDollar = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(0)}K`;
  return `$${abs.toFixed(0)}`;
};

const AvatarCircle = ({ avatar, name, size = "w-10 h-10", verificationLevel }: { avatar: string | null; name: string; size?: string; verificationLevel?: VerificationLevel }) => (
  <div className="relative shrink-0">
    <div className={`${size} rounded-full bg-secondary flex items-center justify-center text-lg overflow-hidden`}>
      {avatar ? (
        <img src={resolveAvatarUrl(avatar)} alt={name} className="w-full h-full object-cover" />
      ) : (
        <span>👤</span>
      )}
    </div>
    
  </div>
);

const EmptyState = ({ message, sub }: { message: string; sub: string }) => (
  <div className="text-center py-16">
    <Users className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
    <p className="text-sm text-muted-foreground">{message}</p>
    <p className="text-xs text-muted-foreground mt-1">{sub}</p>
  </div>
);

// ── Your Rank Card ────────────────────────────────────────────────────
const VISIBLE_COUNT = 10;
const ITEMS_PER_PAGE = 10;

const LeaderboardPagination = ({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (p: number) => void }) => {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 mt-4 mb-2">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        className="w-8 h-8 rounded-lg glass flex items-center justify-center disabled:opacity-30 hover:bg-muted transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-xs font-medium text-muted-foreground px-2">
        {page} / {totalPages}
      </span>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
        className="w-8 h-8 rounded-lg glass flex items-center justify-center disabled:opacity-30 hover:bg-muted transition-colors"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
};

const YourRankCard = ({
  rank,
  name,
  avatar,
  statLine,
  valueLine,
  valuePositive,
  totalCount,
  onShare,
}: {
  rank: number;
  name: string;
  avatar: string | null;
  statLine: string;
  valueLine: string;
  valuePositive: boolean;
  totalCount: number;
  onShare?: () => void;
}) => (
  <motion.div
    initial={{ opacity: 0, y: -8 }}
    animate={{ opacity: 1, y: 0 }}
    className="glass rounded-xl p-3.5 flex items-center gap-3 mb-4 ring-1 ring-primary/40 bg-primary/5 relative overflow-hidden"
  >
    <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent pointer-events-none" />
    <div className="w-8 flex justify-center shrink-0">
      <span className="text-sm font-bold text-primary">#{rank}</span>
    </div>
    <AvatarCircle avatar={avatar} name={name} />
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-bold text-primary truncate">You</span>
        <Star className="w-3 h-3 text-primary fill-primary shrink-0" />
      </div>
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
        <span>{statLine}</span>
        <span>·</span>
        <span>Top {Math.round((rank / totalCount) * 100)}%</span>
      </div>
    </div>
    <div className="flex items-center gap-2 shrink-0">
      <p className={`text-sm font-bold flex items-center gap-1 ${valuePositive ? "text-primary" : "text-destructive"}`}>
        {valuePositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
        {valueLine}
      </p>
      {onShare && (
        <button onClick={onShare} className="w-8 h-8 rounded-full glass flex items-center justify-center hover:bg-primary/20 transition-colors">
          <Share2 className="w-4 h-4 text-primary" />
        </button>
      )}
    </div>
  </motion.div>
);

// ── Referral Leaderboard ──────────────────────────────────────────────
const useReferralLeaderboard = (period: TimePeriod) => {
  const [referrers, setReferrers] = useState<Referrer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    (async () => {
      const cutoff = getCutoffDate(period);

      // 1. Fetch referral_rewards (signup bonuses)
      let rewardsQuery = supabase.from("referral_rewards").select("referrer_id, amount, created_at");
      if (cutoff) rewardsQuery = rewardsQuery.gte("created_at", cutoff);

      // 2. Fetch referral commissions from pending_commissions (type=referral, status=released)
      let commissionsQuery = supabase.from("pending_commissions").select("user_id, amount, created_at").eq("type", "referral").eq("status", "released");
      if (cutoff) commissionsQuery = commissionsQuery.gte("created_at", cutoff);

      // 3. Fetch actual referral signup counts via SECURITY DEFINER RPC
      const referralCountsQuery = supabase.rpc("get_referrer_counts" as any);

      const [{ data: rewards }, { data: commissions }, { data: referralProfiles }] = await Promise.all([
        rewardsQuery,
        commissionsQuery,
        referralCountsQuery,
      ]);

      // Build a map: userId -> { earned, referralCount }
      const map = new Map<string, { earned: number; referralCount: number }>();

      const ensureEntry = (id: string) => {
        if (!map.has(id)) map.set(id, { earned: 0, referralCount: 0 });
        return map.get(id)!;
      };

      // Sum signup bonuses
      for (const r of rewards || []) {
        ensureEntry(r.referrer_id).earned += Number(r.amount);
      }

      // Sum referral commissions
      for (const c of commissions || []) {
        ensureEntry(c.user_id).earned += Number(c.amount);
      }

      // Count actual signups via RPC result
      for (const row of (referralProfiles as any[] | null) || []) {
        if (row?.referrer_id) ensureEntry(row.referrer_id).referralCount += Number(row.referred_count || 0);
      }


      if (map.size === 0) {
        setReferrers([]);
        setLoading(false);
        return;
      }

      const ids = Array.from(map.keys());
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, verification_level")
        .in("id", ids);

      const pMap = new Map((profiles || []).map((p) => [p.id, p]));

      setReferrers(
        ids
          .map((id) => {
            const s = map.get(id)!;
            const p = pMap.get(id);
            return {
              userId: id,
              name: p?.display_name || "Anonymous",
              avatar: p?.avatar_url || null,
              verificationLevel: (p?.verification_level || "none") as VerificationLevel,
              totalReferrals: s.referralCount,
              totalEarned: s.earned,
            };
          })
          .filter((r) => r.totalReferrals > 0 || r.totalEarned > 0)
      );
      setLoading(false);
    })();
  }, [period]);

  return { referrers, loading };
};

// ── Trading Leaderboard (settled transactions) ───────────────────────
const useTradingLeaderboard = (period: TimePeriod, sort: TraderSort = "pnl") => {
  const [traders, setTraders] = useState<Trader[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    (async () => {
      const cutoff = getCutoffDate(period);
      const sortMap: Record<TraderSort, string> = { pnl: "pnl", volume: "volume", trades: "trades" };
      const { data } = await supabase.rpc("get_prediction_leaderboard", {
        _limit: 50,
        _sort: sortMap[sort],
        ...(cutoff ? { _cutoff: cutoff } : {}),
      } as any);

      if (!data || (data as any[]).length === 0) {
        setTraders([]);
        setLoading(false);
        return;
      }

      setTraders(
        (data as any[]).map((d) => ({
          userId: d.user_id,
          name: d.display_name || "Anonymous",
          avatar: d.avatar_url || null,
          verificationLevel: (d.verification_level || "none") as VerificationLevel,
          pnl: Number(d.pnl),
          volume: Number(d.volume),
          trades: Number(d.trades),
        }))
      );
      setLoading(false);
    })();
  }, [period, sort]);

  return { traders, loading };
};

// ── Quick Trade Leaderboard ───────────────────────────────────────────
interface QuickTrader {
  userId: string;
  name: string;
  avatar: string | null;
  verificationLevel: VerificationLevel;
  profit: number;
  wins: number;
  totalBets: number;
  totalWagered: number;
}

const useQuickTradeLeaderboard = (period: TimePeriod) => {
  const [quickTraders, setQuickTraders] = useState<QuickTrader[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setQuickTraders([]);
    (async () => {
      const cutoff = getCutoffDate(period);
      const { data, error } = await supabase.rpc("get_quick_trade_leaderboard", {
        _limit: 50,
        _cutoff: cutoff,
      } as any);
      if (data && (data as any[]).length > 0) {
        const userIds = (data as any[]).map((d) => d.user_id);
        const { data: profiles } = await supabase.from("profiles").select("id, verification_level").in("id", userIds);
        const vMap = new Map((profiles || []).map((p: any) => [p.id, p.verification_level]));
        setQuickTraders(
          (data as any[]).map((d) => ({
            userId: d.user_id,
            name: d.display_name || "Anonymous",
            avatar: d.avatar_url,
            verificationLevel: (vMap.get(d.user_id) || "none") as VerificationLevel,
            profit: Number(d.profit),
            wins: Number(d.wins),
            totalBets: Number(d.total_bets),
            totalWagered: Number(d.total_wagered),
          }))
        );
      }
      setLoading(false);
    })();
  }, [period]);

  return { quickTraders, loading };
};

// ── Streak Leaderboard ────────────────────────────────────────────────
interface StreakUser {
  userId: string;
  name: string;
  avatar: string | null;
  verificationLevel: VerificationLevel;
  currentStreak: number;
  bestStreak: number;
}

const useStreakLeaderboard = () => {
  const [streakUsers, setStreakUsers] = useState<StreakUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    (async () => {
      const { data } = await supabase.rpc("get_streak_leaderboard", { _limit: 20 } as any);
      if (data && (data as any[]).length > 0) {
        const userIds = (data as any[]).map((d) => d.user_id);
        const { data: profiles } = await supabase.from("profiles").select("id, verification_level").in("id", userIds);
        const vMap = new Map((profiles || []).map((p: any) => [p.id, p.verification_level]));
        setStreakUsers(
          (data as any[]).map((d) => ({
            userId: d.user_id,
            name: d.display_name || "Anonymous",
            avatar: d.avatar_url,
            verificationLevel: (vMap.get(d.user_id) || "none") as VerificationLevel,
            currentStreak: Number(d.current_streak),
            bestStreak: Number(d.best_streak),
          }))
        );
      }
      setLoading(false);
    })();
  }, []);

  return { streakUsers, loading };
};

// ── Podium Component ──────────────────────────────────────────────────
const Podium = <T extends { userId: string; name: string; avatar: string | null }>({
  items,
  valueLabel,
  currentUserId,
  onUserClick,
}: {
  items: T[];
  valueLabel: (item: T) => { text: string; positive: boolean };
  currentUserId?: string;
  onUserClick?: (userId: string) => void;
}) => {
  if (items.length < 3) return null;
  const order = [items[1], items[0], items[2]];
  const heights = ["h-24", "h-32", "h-20"];
  const sizes = ["w-12 h-12", "w-16 h-16", "w-12 h-12"];
  const ranks = [2, 1, 3];

  return (
    <div className="flex items-end justify-center gap-3 mb-6">
      {order.map((item, i) => {
        const v = valueLabel(item);
        const isMe = currentUserId === item.userId;
        return (
          <motion.div
            key={item.userId}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className={`flex flex-col items-center ${!isMe ? "cursor-pointer" : ""}`}
            onClick={() => !isMe && onUserClick?.(item.userId)}
          >
            <div className="relative">
              <div className={`${sizes[i]} rounded-full glass border-2 ${isMe ? "border-primary ring-2 ring-primary/30" : i === 1 ? "border-primary" : "border-border"} flex items-center justify-center overflow-hidden`}>
                <AvatarCircle avatar={item.avatar} name={item.name} size={sizes[i]} />
              </div>
              {isMe && (
                <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                  <Star className="w-3 h-3 text-primary-foreground fill-primary-foreground" />
                </div>
              )}
            </div>
            <p className={`text-xs font-bold mb-0.5 truncate max-w-[80px] mt-2 ${isMe ? "text-primary" : ""}`}>{isMe ? "You" : item.name}</p>
            <p className={`text-[11px] font-bold ${v.positive ? "text-primary" : "text-destructive"}`}>{v.text}</p>
            <div className={`${heights[i]} w-20 glass rounded-t-xl mt-2 flex items-center justify-center ${isMe ? "ring-1 ring-primary/20" : ""}`}>
              {rankBadge(ranks[i])}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};

// ── Time Period Selector ──────────────────────────────────────────────
const TimePeriodSelector = ({ value, onChange }: { value: TimePeriod; onChange: (v: TimePeriod) => void }) => (
  <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/50 mb-4">
    {TIME_PERIODS.map(({ key, label }) => (
      <button
        key={key}
        onClick={() => onChange(key)}
        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-semibold transition-all ${
          value === key
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {value === key && <Calendar className="w-3 h-3" />}
        {label}
      </button>
    ))}
  </div>
);

// ── Main Component ────────────────────────────────────────────────────
const Rankings = () => {
  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) || "traders";
  const initialSubTab = (searchParams.get("sub") as QuickSubTab) || "profit";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [quickSubTab, setQuickSubTab] = useState<QuickSubTab>(initialSubTab);
  const [referralSort, setReferralSort] = useState<ReferralSort>("totalEarned");
  const [traderSort, setTraderSort] = useState<TraderSort>("pnl");
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("all");
  const [page, setPage] = useState(1);
  const { user } = useAuth();
  const navigate = useNavigate();
  const currentUserId = user?.id;
  const { track } = useAnalytics();

  useEffect(() => { track("page_view", { page: "rankings" }); }, []);
  useEffect(() => { setPage(1); }, [tab, quickSubTab, referralSort, traderSort, timePeriod]);

  const [shareModal, setShareModal] = useState<{
    rank: number; name: string; avatar: string | null;
    valueLine: string; valuePositive: boolean; statLine: string;
    category: string; totalCount: number;
  } | null>(null);

  const shareRank = useCallback((rank: number, name: string, avatar: string | null, valueLine: string, valuePositive: boolean, statLine: string, category: string, totalCount: number) => {
    setShareModal({ rank, name, avatar, valueLine, valuePositive, statLine, category, totalCount });
  }, []);

  const { referrers, loading: refLoading } = useReferralLeaderboard(timePeriod);
  const { traders, loading: tradeLoading } = useTradingLeaderboard(timePeriod, traderSort);
  const { quickTraders, loading: quickLoading } = useQuickTradeLeaderboard(timePeriod);
  const { streakUsers, loading: streakLoading } = useStreakLeaderboard();

  const sortedReferrers = [...referrers].sort((a, b) =>
    referralSort === "totalEarned" ? b.totalEarned - a.totalEarned : b.totalReferrals - a.totalReferrals
  );

  // Sorting is now handled server-side by the RPC
  const sortedTraders = traders;

  const loading = tab === "referrers" ? refLoading : tab === "quick" ? (quickSubTab === "streaks" ? streakLoading : quickLoading) : tradeLoading;

  // Compute user's rank index in the current active list
  const myRankIndex = useMemo(() => {
    if (!currentUserId) return -1;
    if (tab === "traders") return sortedTraders.findIndex((t) => t.userId === currentUserId);
    if (tab === "quick" && quickSubTab === "profit") return quickTraders.findIndex((t) => t.userId === currentUserId);
    if (tab === "quick" && quickSubTab === "volume") return [...quickTraders].sort((a, b) => b.totalWagered - a.totalWagered).findIndex((t) => t.userId === currentUserId);
    if (tab === "quick" && quickSubTab === "streaks") return streakUsers.findIndex((t) => t.userId === currentUserId);
    if (tab === "referrers") return sortedReferrers.findIndex((r) => r.userId === currentUserId);
    return -1;
  }, [currentUserId, tab, quickSubTab, sortedTraders, quickTraders, streakUsers, sortedReferrers]);

  const myRankPage = myRankIndex >= 0 ? Math.ceil((myRankIndex + 1) / ITEMS_PER_PAGE) : -1;
  const isOnMyPage = myRankPage === page;

  const scrollToMyRank = useCallback(() => {
    if (myRankPage < 1) return;
    setPage(myRankPage);
    // Scroll to list area after a tick
    setTimeout(() => {
      const el = document.querySelector(`[data-user-rank="${currentUserId}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }, [myRankPage, currentUserId]);

  return (
    <div className="h-dvh bg-background overflow-y-auto overscroll-contain" style={{ paddingBottom: 'calc(1rem + var(--content-bottom))' }}>
      <TopBar />
      <div className="max-w-lg md:max-w-4xl mx-auto px-3 sm:px-4" style={{ paddingTop: 'calc(var(--content-top) + 0.75rem)' }}>
        <div className="flex items-center gap-3 mb-1">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full glass flex items-center justify-center hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" /> Leaderboard
          </h2>
        </div>
        <p className="text-xs text-muted-foreground mb-5 ml-12">Top performers on the platform</p>

        {!user ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Trophy className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Sign in to view the Leaderboard</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs">
              See how you rank against other traders. Sign in to access the full leaderboard.
            </p>
            <Button onClick={() => navigate("/auth")} className="gap-2">
              <LogIn className="w-4 h-4" />
              Sign In
            </Button>
          </div>
        ) : (
        <>
        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {([
            { key: "traders" as Tab, label: "Predictions" },
            { key: "quick" as Tab, label: "Quick Trade", icon: Zap },
            { key: "referrers" as Tab, label: "Referrals" },
          ]).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                tab === t.key ? "bg-primary text-primary-foreground" : "glass text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.icon && <t.icon className="w-3.5 h-3.5" />}
              {t.label}
            </button>
          ))}
        </div>

        {/* Time Period Filter */}
        <TimePeriodSelector value={timePeriod} onChange={setTimePeriod} />

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* ── Trading Tab ── */}
            {tab === "traders" && (
              <>
                <div className="flex gap-2 mb-4">
                  {([
                    { key: "pnl" as TraderSort, label: "PnL" },
                    { key: "volume" as TraderSort, label: "Volume" },
                    { key: "trades" as TraderSort, label: "Trades" },
                  ]).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setTraderSort(key)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                        traderSort === key ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {sortedTraders.length === 0 ? (
                  <EmptyState message="No prediction data yet" sub="Start predicting to appear on the leaderboard!" />
                ) : (
                  <>
                    <Podium
                      items={sortedTraders}
                      currentUserId={currentUserId}
                      onUserClick={(id) => navigate(`/user/${id}`)}
                      valueLabel={(t) => {
                        if (traderSort === "volume") return { text: formatDollar(t.volume), positive: true };
                        if (traderSort === "trades") return { text: `${t.trades} trades`, positive: true };
                        return { text: `${t.pnl >= 0 ? "+" : "-"}${formatDollar(t.pnl)}`, positive: t.pnl >= 0 };
                      }}
                    />
                    {(() => {
                      if (!currentUserId) return null;
                      const idx = sortedTraders.findIndex((t) => t.userId === currentUserId);
                      if (idx === -1 || idx < VISIBLE_COUNT) return null;
                      const me = sortedTraders[idx];
                      const mainValue = traderSort === "volume" ? formatDollar(me.volume) : traderSort === "trades" ? `${me.trades} trades` : `${me.pnl >= 0 ? "+" : "-"}${formatDollar(me.pnl)}`;
                      const mainPositive = traderSort === "pnl" ? me.pnl >= 0 : true;
                      return (
                        <YourRankCard
                          rank={idx + 1}
                          name={me.name}
                          avatar={me.avatar}
                          statLine={`${me.trades} prediction${me.trades !== 1 ? "s" : ""} · ${formatDollar(me.volume)} vol`}
                          valueLine={mainValue}
                          valuePositive={mainPositive}
                          totalCount={sortedTraders.length}
                          onShare={() => shareRank(idx + 1, me.name, me.avatar, mainValue, mainPositive, `${me.trades} prediction${me.trades !== 1 ? "s" : ""} · ${formatDollar(me.volume)} vol`, "Predictions", sortedTraders.length)}
                        />
                      );
                    })()}
                    {(() => {
                      const totalPages = Math.ceil(sortedTraders.length / ITEMS_PER_PAGE);
                      const start = (page - 1) * ITEMS_PER_PAGE;
                      const pageItems = sortedTraders.slice(start, start + ITEMS_PER_PAGE);
                      return (
                        <>
                          <div className="space-y-2">
                            {pageItems.map((trader, i) => {
                              const rank = start + i + 1;
                              const isMe = currentUserId === trader.userId;
                              return (
                                <motion.div
                                  key={trader.userId}
                                  data-user-rank={trader.userId}
                                  initial={{ opacity: 0, x: -12 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: i * 0.04 }}
                                  onClick={() => !isMe && navigate(`/user/${trader.userId}`)}
                                  className={`glass rounded-xl p-3.5 flex items-center gap-3 ${isMe ? "ring-1 ring-primary/40 bg-primary/5" : "cursor-pointer hover:bg-accent/30"}`}
                                >
                                  <div className="w-8 flex justify-center shrink-0">{rankBadge(rank)}</div>
                                  <AvatarCircle avatar={trader.avatar} name={trader.name} verificationLevel={trader.verificationLevel} />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className={`text-sm font-bold truncate ${isMe ? "text-primary" : ""}`}>{isMe ? "You" : trader.name}</span>
                                      {isMe && <Star className="w-3 h-3 text-primary fill-primary shrink-0" />}
                                      {!isMe && trader.verificationLevel !== "none" && <NftBadge level={trader.verificationLevel} size={14} />}
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                                      <span>{trader.trades} trade{trader.trades !== 1 ? "s" : ""}</span>
                                      <span>·</span>
                                      <span>{formatDollar(trader.volume)} vol</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {(() => {
                                      const isVol = traderSort === "volume";
                                      const isTrades = traderSort === "trades";
                                      const displayText = isVol ? formatDollar(trader.volume) : isTrades ? `${trader.trades}` : `${trader.pnl >= 0 ? "+" : "-"}${formatDollar(trader.pnl)}`;
                                      const positive = isVol || isTrades ? true : trader.pnl >= 0;
                                      return (
                                        <p className={`text-sm font-bold flex items-center gap-1 ${positive ? "text-primary" : "text-destructive"}`}>
                                          {positive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                                          {displayText}
                                        </p>
                                      );
                                    })()}
                                    {isMe ? (
                                      <button onClick={(e) => { e.stopPropagation(); shareRank(rank, trader.name, trader.avatar, `${trader.pnl >= 0 ? "+" : "-"}${formatDollar(trader.pnl)}`, trader.pnl >= 0, `${trader.trades} prediction${trader.trades !== 1 ? "s" : ""} · ${formatDollar(trader.volume)} vol`, "Predictions", sortedTraders.length); }} className="w-7 h-7 rounded-full glass flex items-center justify-center hover:bg-primary/20 transition-colors">
                                        <Share2 className="w-3.5 h-3.5 text-primary" />
                                      </button>
                                    ) : (
                                      <FollowButton userId={trader.userId} />
                                    )}
                                  </div>
                                </motion.div>
                              );
                            })}
                          </div>
                          <LeaderboardPagination page={page} totalPages={totalPages} onPageChange={setPage} />
                        </>
                      );
                    })()}
                  </>
                )}
              </>
            )}

            {/* ── Quick Trade Tab ── */}
            {tab === "quick" && (
              <>
                {/* Sub-tabs: Profit vs Streaks */}
                <div className="flex gap-2 mb-4">
                  {([
                    { key: "profit" as QuickSubTab, label: "Profit", icon: TrendingUp },
                    { key: "volume" as QuickSubTab, label: "Volume", icon: Zap },
                    { key: "streaks" as QuickSubTab, label: "Win Streaks", icon: Flame },
                  ]).map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      onClick={() => setQuickSubTab(key)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all ${
                        quickSubTab === key ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                    </button>
                  ))}
                </div>

                {(quickSubTab === "profit" || quickSubTab === "volume") && (
                  (() => {
                    const isVolume = quickSubTab === "volume";
                    const sorted = [...quickTraders].sort((a, b) =>
                      isVolume ? b.totalWagered - a.totalWagered : b.profit - a.profit
                    );
                    const getValue = (t: QuickTrader) => isVolume ? t.totalWagered : t.profit;
                    const formatValue = (t: QuickTrader) => {
                      const v = getValue(t);
                      return isVolume ? formatDollar(v) : `${v >= 0 ? "+" : "-"}${formatDollar(v)}`;
                    };
                    const isPositive = (t: QuickTrader) => isVolume ? true : t.profit >= 0;

                    return sorted.length === 0 ? (
                      <EmptyState message={isVolume ? "No quick trade volume yet" : "No quick trade winners yet"} sub="Be the first to win a quick trade round!" />
                    ) : (
                      <>
                        <Podium
                          items={sorted}
                          currentUserId={currentUserId}
                          onUserClick={(id) => navigate(`/user/${id}`)}
                          valueLabel={(t) => ({
                            text: formatValue(t as QuickTrader),
                            positive: isPositive(t as QuickTrader),
                          })}
                        />
                        {(() => {
                          if (!currentUserId) return null;
                          const idx = sorted.findIndex((t) => t.userId === currentUserId);
                          if (idx === -1 || idx < VISIBLE_COUNT) return null;
                          const me = sorted[idx];
                          const winRate = me.totalBets > 0 ? Math.round((me.wins / me.totalBets) * 100) : 0;
                          return (
                            <YourRankCard
                              rank={idx + 1}
                              name={me.name}
                              avatar={me.avatar}
                              statLine={`${me.wins}W/${me.totalBets - me.wins}L · ${winRate}% WR`}
                              valueLine={formatValue(me)}
                              valuePositive={isPositive(me)}
                              totalCount={sorted.length}
                              onShare={() => shareRank(idx + 1, me.name, me.avatar, formatValue(me), isPositive(me), `${me.wins}W/${me.totalBets - me.wins}L · ${winRate}% WR`, isVolume ? "QT Volume" : "Quick Trade", sorted.length)}
                            />
                          );
                        })()}
                        {(() => {
                          const totalPages = Math.ceil(sorted.length / ITEMS_PER_PAGE);
                          const start = (page - 1) * ITEMS_PER_PAGE;
                          const pageItems = sorted.slice(start, start + ITEMS_PER_PAGE);
                          return (
                            <>
                              <div className="space-y-2">
                                {pageItems.map((qt, i) => {
                                  const rank = start + i + 1;
                                  const isMe = currentUserId === qt.userId;
                                  const winRate = qt.totalBets > 0 ? Math.round((qt.wins / qt.totalBets) * 100) : 0;
                                  return (
                                    <motion.div
                                      data-user-rank={qt.userId}
                                      key={qt.userId}
                                      initial={{ opacity: 0, x: -12 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      transition={{ delay: i * 0.04 }}
                                      onClick={() => !isMe && navigate(`/user/${qt.userId}`)}
                                      className={`glass rounded-xl p-3.5 flex items-center gap-3 ${isMe ? "ring-1 ring-primary/40 bg-primary/5" : "cursor-pointer hover:bg-accent/30"}`}
                                    >
                                      <div className="w-8 flex justify-center shrink-0">{rankBadge(rank)}</div>
                                      <AvatarCircle avatar={qt.avatar} name={qt.name} verificationLevel={qt.verificationLevel} />
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                          <span className={`text-sm font-bold truncate ${isMe ? "text-primary" : ""}`}>{isMe ? "You" : qt.name}</span>
                                          {isMe && <Star className="w-3 h-3 text-primary fill-primary shrink-0" />}
                                          {!isMe && qt.verificationLevel !== "none" && <NftBadge level={qt.verificationLevel} size={14} />}
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                                          <span>{qt.wins}W/{qt.totalBets - qt.wins}L</span>
                                          <span>·</span>
                                          <span>{winRate}% WR</span>
                                          <span>·</span>
                                          <span>{formatDollar(qt.totalWagered)} vol</span>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <p className={`text-sm font-bold flex items-center gap-1 ${isPositive(qt) ? "text-primary" : "text-destructive"}`}>
                                          {isPositive(qt) ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                                          {formatValue(qt)}
                                        </p>
                                        {isMe ? (
                                          <button onClick={(e) => { e.stopPropagation(); shareRank(rank, qt.name, qt.avatar, formatValue(qt), isPositive(qt), `${qt.wins}W/${qt.totalBets - qt.wins}L · ${winRate}% WR`, isVolume ? "QT Volume" : "Quick Trade", sorted.length); }} className="w-7 h-7 rounded-full glass flex items-center justify-center hover:bg-primary/20 transition-colors">
                                            <Share2 className="w-3.5 h-3.5 text-primary" />
                                          </button>
                                        ) : (
                                          <FollowButton userId={qt.userId} />
                                        )}
                                      </div>
                                    </motion.div>
                                  );
                                })}
                              </div>
                              <LeaderboardPagination page={page} totalPages={totalPages} onPageChange={setPage} />
                            </>
                          );
                        })()}
                      </>
                    );
                  })()
                )}

                {quickSubTab === "streaks" && (
                  <>
                    {streakUsers.length === 0 ? (
                      <EmptyState message="No active win streaks" sub="Win consecutive quick trades to appear here!" />
                    ) : (
                      <>
                        {(() => {
                          const totalPages = Math.ceil(streakUsers.length / ITEMS_PER_PAGE);
                          const start = (page - 1) * ITEMS_PER_PAGE;
                          const pageItems = streakUsers.slice(start, start + ITEMS_PER_PAGE);
                          return (
                            <>
                              <div className="space-y-2">
                                {pageItems.map((su, i) => {
                                  const rank = start + i + 1;
                                  const isMe = currentUserId === su.userId;
                                  const streakMultiplier = su.currentStreak >= 5 ? "1.25x" : su.currentStreak >= 4 ? "1.15x" : su.currentStreak >= 3 ? "1.10x" : su.currentStreak >= 2 ? "1.05x" : "1.0x";
                                  return (
                                    <motion.div
                                      data-user-rank={su.userId}
                                      key={su.userId}
                                      initial={{ opacity: 0, x: -12 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      transition={{ delay: i * 0.04 }}
                                      onClick={() => !isMe && navigate(`/user/${su.userId}`)}
                                      className={`glass rounded-xl p-3.5 flex items-center gap-3 ${isMe ? "ring-1 ring-primary/40 bg-primary/5" : "cursor-pointer hover:bg-accent/30"}`}
                                    >
                                      <div className="w-8 flex justify-center shrink-0">{rankBadge(rank)}</div>
                                      <AvatarCircle avatar={su.avatar} name={su.name} verificationLevel={su.verificationLevel} />
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                          <span className={`text-sm font-bold truncate ${isMe ? "text-primary" : ""}`}>{isMe ? "You" : su.name}</span>
                                          {isMe && <Star className="w-3 h-3 text-primary fill-primary shrink-0" />}
                                          {!isMe && su.verificationLevel !== "none" && <NftBadge level={su.verificationLevel} size={14} />}
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                                          <span>Best: {su.bestStreak} 🏆</span>
                                          <span>·</span>
                                          <span>{streakMultiplier} bonus</span>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30">
                                          <Flame className="w-4 h-4 text-amber-500" />
                                          <span className="text-sm font-bold text-amber-500">{su.currentStreak}</span>
                                        </div>
                                        {isMe ? (
                                          <button onClick={(e) => { e.stopPropagation(); shareRank(rank, su.name, su.avatar, `🔥 ${su.currentStreak} streak`, true, `Best: ${su.bestStreak} · ${streakMultiplier} bonus`, "Win Streaks", streakUsers.length); }} className="w-7 h-7 rounded-full glass flex items-center justify-center hover:bg-primary/20 transition-colors">
                                            <Share2 className="w-3.5 h-3.5 text-primary" />
                                          </button>
                                        ) : (
                                          <FollowButton userId={su.userId} />
                                        )}
                                      </div>
                                    </motion.div>
                                  );
                                })}
                              </div>
                              <LeaderboardPagination page={page} totalPages={totalPages} onPageChange={setPage} />
                            </>
                          );
                        })()}
                      </>
                    )}
                  </>
                )}
              </>
            )}

            {/* ── Referrals Tab ── */}
            {tab === "referrers" && (
              <>
                <div className="flex gap-2 mb-4">
                  {([
                    { key: "totalEarned" as ReferralSort, label: "Total Earned" },
                    { key: "totalReferrals" as ReferralSort, label: "Referrals" },
                  ]).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setReferralSort(key)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                        referralSort === key ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {sortedReferrers.length === 0 ? (
                  <EmptyState message="No referral data yet" sub="Invite friends to climb the leaderboard!" />
                ) : (
                  <>
                    <Podium
                      items={sortedReferrers}
                      currentUserId={currentUserId}
                      onUserClick={(id) => navigate(`/user/${id}`)}
                      valueLabel={(r) => referralSort === "totalReferrals" ? ({
                        text: `${r.totalReferrals} referral${r.totalReferrals !== 1 ? "s" : ""}`,
                        positive: true,
                      }) : ({
                        text: `+${formatDollar(r.totalEarned)}`,
                        positive: true,
                      })}
                    />
                    {(() => {
                      if (!currentUserId) return null;
                      const idx = sortedReferrers.findIndex((r) => r.userId === currentUserId);
                      if (idx === -1 || idx < VISIBLE_COUNT) return null;
                      const me = sortedReferrers[idx];
                      return (
                        <YourRankCard
                          rank={idx + 1}
                          name={me.name}
                          avatar={me.avatar}
                          statLine={`${me.totalReferrals} referral${me.totalReferrals !== 1 ? "s" : ""}`}
                          valueLine={`+${formatDollar(me.totalEarned)}`}
                          valuePositive={true}
                          totalCount={sortedReferrers.length}
                          onShare={() => shareRank(idx + 1, me.name, me.avatar, `+${formatDollar(me.totalEarned)}`, true, `${me.totalReferrals} referral${me.totalReferrals !== 1 ? "s" : ""}`, "Referrals", sortedReferrers.length)}
                        />
                      );
                    })()}
                    {(() => {
                      const totalPages = Math.ceil(sortedReferrers.length / ITEMS_PER_PAGE);
                      const start = (page - 1) * ITEMS_PER_PAGE;
                      const pageItems = sortedReferrers.slice(start, start + ITEMS_PER_PAGE);
                      return (
                        <>
                          <div className="space-y-2">
                            {pageItems.map((ref, i) => {
                              const rank = start + i + 1;
                              const isMe = currentUserId === ref.userId;
                              return (
                                <motion.div
                                  data-user-rank={ref.userId}
                                  key={ref.userId}
                                  initial={{ opacity: 0, x: -12 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: i * 0.04 }}
                                  onClick={() => !isMe && navigate(`/user/${ref.userId}`)}
                                  className={`glass rounded-xl p-3.5 flex items-center gap-3 ${isMe ? "ring-1 ring-primary/40 bg-primary/5" : "cursor-pointer hover:bg-accent/30"}`}
                                >
                                  <div className="w-8 flex justify-center shrink-0">{rankBadge(rank)}</div>
                                  <AvatarCircle avatar={ref.avatar} name={ref.name} verificationLevel={ref.verificationLevel} />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className={`text-sm font-bold truncate ${isMe ? "text-primary" : ""}`}>{isMe ? "You" : ref.name}</span>
                                      {isMe && <Star className="w-3 h-3 text-primary fill-primary shrink-0" />}
                                      {!isMe && ref.verificationLevel !== "none" && <NftBadge level={ref.verificationLevel} size={14} />}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground mt-0.5">
                                      {ref.totalReferrals} referral{ref.totalReferrals !== 1 ? "s" : ""}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <p className="text-sm font-bold text-primary flex items-center gap-1">
                                      {referralSort === "totalReferrals" ? (
                                        <><Users className="w-3.5 h-3.5" />{ref.totalReferrals}</>
                                      ) : (
                                        <><TrendingUp className="w-3.5 h-3.5" />+{formatDollar(ref.totalEarned)}</>
                                      )}
                                    </p>
                                    {isMe ? (
                                      <button onClick={(e) => { e.stopPropagation(); shareRank(rank, ref.name, ref.avatar, `+${formatDollar(ref.totalEarned)}`, true, `${ref.totalReferrals} referral${ref.totalReferrals !== 1 ? "s" : ""}`, "Referrals", sortedReferrers.length); }} className="w-7 h-7 rounded-full glass flex items-center justify-center hover:bg-primary/20 transition-colors">
                                        <Share2 className="w-3.5 h-3.5 text-primary" />
                                      </button>
                                    ) : (
                                      <FollowButton userId={ref.userId} />
                                    )}
                                  </div>
                                </motion.div>
                              );
                            })}
                          </div>
                          <LeaderboardPagination page={page} totalPages={totalPages} onPageChange={setPage} />
                        </>
                      );
                    })()}
                  </>
                )}
              </>
            )}
          </>
        )}
        </>
        )}
      </div>
      {user && (
        <AnimatePresence>
          {currentUserId && myRankIndex >= 0 && !isOnMyPage && !loading && (
            <motion.button
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              onClick={scrollToMyRank}
              className="fixed bottom-24 right-4 z-40 flex items-center gap-2 px-4 py-2.5 rounded-full bg-primary text-primary-foreground shadow-lg hover:opacity-90 transition-opacity text-xs font-semibold"
              style={{ marginBottom: 'var(--safe-bottom)' }}
            >
              <Star className="w-3.5 h-3.5 fill-current" />
              Your Rank: #{myRankIndex + 1}
            </motion.button>
          )}
        </AnimatePresence>
      )}
      <BottomNav />
      {shareModal && (
        <RankShareModal
          open={!!shareModal}
          onOpenChange={(v) => { if (!v) setShareModal(null); }}
          {...shareModal}
        />
      )}
    </div>
  );
};

export default Rankings;
