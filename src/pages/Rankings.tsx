import { useState, useEffect, useMemo, useCallback } from "react";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { Trophy, TrendingUp, TrendingDown, Medal, Crown, Award, Users, Star, Calendar, Share2, ArrowLeft, Zap, Flame } from "lucide-react";
import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import useAnalytics from "@/hooks/useAnalytics";
import RankShareModal from "@/components/RankShareModal";
import NftBadge, { isNftAvatar } from "@/components/NftBadge";


interface Referrer {
  userId: string;
  name: string;
  avatar: string | null;
  totalReferrals: number;
  totalEarned: number;
}

interface Trader {
  userId: string;
  name: string;
  avatar: string | null;
  pnl: number;
  trades: number;
  volume: number;
}

type Tab = "referrers" | "traders" | "quick";
type QuickSubTab = "profit" | "streaks";
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

const AvatarCircle = ({ avatar, name, size = "w-10 h-10" }: { avatar: string | null; name: string; size?: string }) => (
  <div className="relative shrink-0">
    <div className={`${size} rounded-full bg-secondary flex items-center justify-center text-lg overflow-hidden`}>
      {avatar ? (
        <img src={avatar} alt={name} className="w-full h-full object-cover" />
      ) : (
        <span>👤</span>
      )}
    </div>
    {isNftAvatar(avatar) && <NftBadge className="absolute -bottom-0.5 -right-0.5" />}
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
      let query = supabase.from("referral_rewards").select("referrer_id, amount, created_at");
      const cutoff = getCutoffDate(period);
      if (cutoff) query = query.gte("created_at", cutoff);

      const { data: rewards } = await query;

      if (!rewards || rewards.length === 0) {
        setReferrers([]);
        setLoading(false);
        return;
      }

      const map = new Map<string, { total: number; count: number }>();
      for (const r of rewards) {
        const e = map.get(r.referrer_id) || { total: 0, count: 0 };
        e.total += Number(r.amount);
        e.count += 1;
        map.set(r.referrer_id, e);
      }

      const ids = Array.from(map.keys());
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", ids);

      const pMap = new Map((profiles || []).map((p) => [p.id, p]));

      setReferrers(
        ids.map((id) => {
          const s = map.get(id)!;
          const p = pMap.get(id);
          return { userId: id, name: p?.display_name || "Anonymous", avatar: p?.avatar_url || null, totalReferrals: s.count, totalEarned: s.total };
        })
      );
      setLoading(false);
    })();
  }, [period]);

  return { referrers, loading };
};

// ── Trading Leaderboard ───────────────────────────────────────────────
const useTradingLeaderboard = (period: TimePeriod) => {
  const [traders, setTraders] = useState<Trader[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    (async () => {
      let query = supabase.from("positions").select("user_id, side, shares, avg_price, market_id, created_at");
      const cutoff = getCutoffDate(period);
      if (cutoff) query = query.gte("created_at", cutoff);

      const { data: positions } = await query;
      const { data: markets } = await supabase.from("markets").select("id, yes_price, no_price");

      if (!positions || positions.length === 0) {
        setTraders([]);
        setLoading(false);
        return;
      }

      const mMap = new Map((markets || []).map((m) => [m.id, m]));

      const userMap = new Map<string, { pnl: number; trades: number; volume: number }>();
      for (const pos of positions) {
        const market = mMap.get(pos.market_id);
        if (!market) continue;
        const currentPrice = pos.side === "yes" ? market.yes_price : market.no_price;
        const pnl = pos.shares * (currentPrice - pos.avg_price);
        const volume = pos.shares * pos.avg_price;

        const e = userMap.get(pos.user_id) || { pnl: 0, trades: 0, volume: 0 };
        e.pnl += pnl;
        e.trades += 1;
        e.volume += volume;
        userMap.set(pos.user_id, e);
      }

      const ids = Array.from(userMap.keys());
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", ids);

      const pMap = new Map((profiles || []).map((p) => [p.id, p]));

      setTraders(
        ids.map((id) => {
          const s = userMap.get(id)!;
          const p = pMap.get(id);
          return { userId: id, name: p?.display_name || "Anonymous", avatar: p?.avatar_url || null, ...s };
        })
      );
      setLoading(false);
    })();
  }, [period]);

  return { traders, loading };
};

// ── Quick Trade Leaderboard ───────────────────────────────────────────
interface QuickTrader {
  userId: string;
  name: string;
  avatar: string | null;
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
    (async () => {
      const cutoff = getCutoffDate(period);
      const { data } = await supabase.rpc("get_quick_trade_leaderboard", {
        _limit: 20,
        ...(cutoff ? { _cutoff: cutoff } : {}),
      } as any);
      if (data) {
        setQuickTraders(
          (data as any[]).map((d) => ({
            userId: d.user_id,
            name: d.display_name || "Anonymous",
            avatar: d.avatar_url,
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
      if (data) {
        setStreakUsers(
          (data as any[]).map((d) => ({
            userId: d.user_id,
            name: d.display_name || "Anonymous",
            avatar: d.avatar_url,
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
}: {
  items: T[];
  valueLabel: (item: T) => { text: string; positive: boolean };
  currentUserId?: string;
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
            className="flex flex-col items-center"
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
  const [tab, setTab] = useState<Tab>("traders");
  const [referralSort, setReferralSort] = useState<ReferralSort>("totalEarned");
  const [traderSort, setTraderSort] = useState<TraderSort>("pnl");
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("all");
  const { user } = useAuth();
  const navigate = useNavigate();
  const currentUserId = user?.id;
  const { track } = useAnalytics();

  useEffect(() => { track("page_view", { page: "rankings" }); }, []);

  const [shareModal, setShareModal] = useState<{
    rank: number; name: string; avatar: string | null;
    valueLine: string; valuePositive: boolean; statLine: string;
    category: string; totalCount: number;
  } | null>(null);

  const shareRank = useCallback((rank: number, name: string, avatar: string | null, valueLine: string, valuePositive: boolean, statLine: string, category: string, totalCount: number) => {
    setShareModal({ rank, name, avatar, valueLine, valuePositive, statLine, category, totalCount });
  }, []);

  const { referrers, loading: refLoading } = useReferralLeaderboard(timePeriod);
  const { traders, loading: tradeLoading } = useTradingLeaderboard(timePeriod);
  const { quickTraders, loading: quickLoading } = useQuickTradeLeaderboard(timePeriod);

  const sortedReferrers = [...referrers].sort((a, b) =>
    referralSort === "totalEarned" ? b.totalEarned - a.totalEarned : b.totalReferrals - a.totalReferrals
  );

  const sortedTraders = [...traders].sort((a, b) => {
    if (traderSort === "pnl") return b.pnl - a.pnl;
    if (traderSort === "volume") return b.volume - a.volume;
    return b.trades - a.trades;
  });

  const loading = tab === "referrers" ? refLoading : tab === "quick" ? quickLoading : tradeLoading;

  return (
    <div className="min-h-dvh bg-background" style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}>
      <TopBar />
      <div className="max-w-lg md:max-w-4xl mx-auto px-3 sm:px-4" style={{ paddingTop: 'calc(5rem + env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-3 mb-1">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full glass flex items-center justify-center hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" /> Leaderboard
          </h2>
        </div>
        <p className="text-xs text-muted-foreground mb-5 ml-12">Top performers on the platform</p>

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
                      valueLabel={(t) => ({
                        text: `${t.pnl >= 0 ? "+" : "-"}${formatDollar(t.pnl)}`,
                        positive: t.pnl >= 0,
                      })}
                    />
                    {(() => {
                      if (!currentUserId) return null;
                      const idx = sortedTraders.findIndex((t) => t.userId === currentUserId);
                      if (idx === -1 || idx < VISIBLE_COUNT) return null;
                      const me = sortedTraders[idx];
                      return (
                        <YourRankCard
                          rank={idx + 1}
                          name={me.name}
                          avatar={me.avatar}
                          statLine={`${me.trades} prediction${me.trades !== 1 ? "s" : ""} · ${formatDollar(me.volume)} vol`}
                          valueLine={`${me.pnl >= 0 ? "+" : "-"}${formatDollar(me.pnl)}`}
                          valuePositive={me.pnl >= 0}
                          totalCount={sortedTraders.length}
                          onShare={() => shareRank(idx + 1, me.name, me.avatar, `${me.pnl >= 0 ? "+" : "-"}${formatDollar(me.pnl)}`, me.pnl >= 0, `${me.trades} prediction${me.trades !== 1 ? "s" : ""} · ${formatDollar(me.volume)} vol`, "Predictions", sortedTraders.length)}
                        />
                      );
                    })()}
                    <div className="space-y-2">
                      {sortedTraders.map((trader, i) => {
                        const isMe = currentUserId === trader.userId;
                        return (
                          <motion.div
                            key={trader.userId}
                            initial={{ opacity: 0, x: -12 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.04 }}
                            className={`glass rounded-xl p-3.5 flex items-center gap-3 ${isMe ? "ring-1 ring-primary/40 bg-primary/5" : ""}`}
                          >
                            <div className="w-8 flex justify-center shrink-0">{rankBadge(i + 1)}</div>
                            <AvatarCircle avatar={trader.avatar} name={trader.name} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className={`text-sm font-bold truncate ${isMe ? "text-primary" : ""}`}>{isMe ? "You" : trader.name}</span>
                                {isMe && <Star className="w-3 h-3 text-primary fill-primary shrink-0" />}
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                                <span>{trader.trades} trade{trader.trades !== 1 ? "s" : ""}</span>
                                <span>·</span>
                                <span>{formatDollar(trader.volume)} vol</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <p className={`text-sm font-bold flex items-center gap-1 ${trader.pnl >= 0 ? "text-primary" : "text-destructive"}`}>
                                {trader.pnl >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                                {trader.pnl >= 0 ? "+" : "-"}{formatDollar(trader.pnl)}
                              </p>
                              {isMe && (
                                <button onClick={() => shareRank(i + 1, trader.name, trader.avatar, `${trader.pnl >= 0 ? "+" : "-"}${formatDollar(trader.pnl)}`, trader.pnl >= 0, `${trader.trades} prediction${trader.trades !== 1 ? "s" : ""} · ${formatDollar(trader.volume)} vol`, "Predictions", sortedTraders.length)} className="w-7 h-7 rounded-full glass flex items-center justify-center hover:bg-primary/20 transition-colors">
                                  <Share2 className="w-3.5 h-3.5 text-primary" />
                                </button>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            )}

            {/* ── Quick Trade Tab ── */}
            {tab === "quick" && (
              <>
                {quickTraders.length === 0 ? (
                  <EmptyState message="No quick trade winners yet" sub="Be the first to win a quick trade round!" />
                ) : (
                  <>
                    <Podium
                      items={quickTraders}
                      currentUserId={currentUserId}
                      valueLabel={(t) => ({
                        text: `${t.profit >= 0 ? "+" : "-"}${formatDollar(t.profit)}`,
                        positive: t.profit >= 0,
                      })}
                    />
                    {(() => {
                      if (!currentUserId) return null;
                      const idx = quickTraders.findIndex((t) => t.userId === currentUserId);
                      if (idx === -1 || idx < VISIBLE_COUNT) return null;
                      const me = quickTraders[idx];
                      const winRate = me.totalBets > 0 ? Math.round((me.wins / me.totalBets) * 100) : 0;
                      return (
                        <YourRankCard
                          rank={idx + 1}
                          name={me.name}
                          avatar={me.avatar}
                          statLine={`${me.wins}W/${me.totalBets - me.wins}L · ${winRate}% WR`}
                          valueLine={`${me.profit >= 0 ? "+" : "-"}${formatDollar(me.profit)}`}
                          valuePositive={me.profit >= 0}
                          totalCount={quickTraders.length}
                          onShare={() => shareRank(idx + 1, me.name, me.avatar, `${me.profit >= 0 ? "+" : "-"}${formatDollar(me.profit)}`, me.profit >= 0, `${me.wins}W/${me.totalBets - me.wins}L · ${winRate}% WR`, "Quick Trade", quickTraders.length)}
                        />
                      );
                    })()}
                    <div className="space-y-2">
                      {quickTraders.map((qt, i) => {
                        const isMe = currentUserId === qt.userId;
                        const winRate = qt.totalBets > 0 ? Math.round((qt.wins / qt.totalBets) * 100) : 0;
                        return (
                          <motion.div
                            key={qt.userId}
                            initial={{ opacity: 0, x: -12 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.04 }}
                            className={`glass rounded-xl p-3.5 flex items-center gap-3 ${isMe ? "ring-1 ring-primary/40 bg-primary/5" : ""}`}
                          >
                            <div className="w-8 flex justify-center shrink-0">{rankBadge(i + 1)}</div>
                            <AvatarCircle avatar={qt.avatar} name={qt.name} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className={`text-sm font-bold truncate ${isMe ? "text-primary" : ""}`}>{isMe ? "You" : qt.name}</span>
                                {isMe && <Star className="w-3 h-3 text-primary fill-primary shrink-0" />}
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
                              <p className={`text-sm font-bold flex items-center gap-1 ${qt.profit >= 0 ? "text-primary" : "text-destructive"}`}>
                                {qt.profit >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                                {qt.profit >= 0 ? "+" : "-"}{formatDollar(qt.profit)}
                              </p>
                              {isMe && (
                                <button onClick={() => shareRank(i + 1, qt.name, qt.avatar, `${qt.profit >= 0 ? "+" : "-"}${formatDollar(qt.profit)}`, qt.profit >= 0, `${qt.wins}W/${qt.totalBets - qt.wins}L · ${winRate}% WR`, "Quick Trade", quickTraders.length)} className="w-7 h-7 rounded-full glass flex items-center justify-center hover:bg-primary/20 transition-colors">
                                  <Share2 className="w-3.5 h-3.5 text-primary" />
                                </button>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
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
                      valueLabel={(r) => ({
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
                    <div className="space-y-2">
                      {sortedReferrers.map((ref, i) => {
                        const isMe = currentUserId === ref.userId;
                        return (
                          <motion.div
                            key={ref.userId}
                            initial={{ opacity: 0, x: -12 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.04 }}
                            className={`glass rounded-xl p-3.5 flex items-center gap-3 ${isMe ? "ring-1 ring-primary/40 bg-primary/5" : ""}`}
                          >
                            <div className="w-8 flex justify-center shrink-0">{rankBadge(i + 1)}</div>
                            <AvatarCircle avatar={ref.avatar} name={ref.name} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className={`text-sm font-bold truncate ${isMe ? "text-primary" : ""}`}>{isMe ? "You" : ref.name}</span>
                                {isMe && <Star className="w-3 h-3 text-primary fill-primary shrink-0" />}
                              </div>
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                {ref.totalReferrals} referral{ref.totalReferrals !== 1 ? "s" : ""}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <p className="text-sm font-bold text-primary flex items-center gap-1">
                                <TrendingUp className="w-3.5 h-3.5" />+{ref.totalEarned.toFixed(0)}
                              </p>
                              {isMe && (
                                <button onClick={() => shareRank(i + 1, ref.name, ref.avatar, `+${formatDollar(ref.totalEarned)}`, true, `${ref.totalReferrals} referral${ref.totalReferrals !== 1 ? "s" : ""}`, "Referrals", sortedReferrers.length)} className="w-7 h-7 rounded-full glass flex items-center justify-center hover:bg-primary/20 transition-colors">
                                  <Share2 className="w-3.5 h-3.5 text-primary" />
                                </button>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
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
