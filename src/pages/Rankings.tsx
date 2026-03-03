import { useState, useEffect } from "react";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { mockMarkets } from "@/data/markets";
import { Trophy, TrendingUp, Medal, Crown, Award, Users, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";

const formatVolume = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
};

interface Referrer {
  userId: string;
  name: string;
  avatar: string | null;
  totalReferrals: number;
  totalEarned: number;
}

type Tab = "referrers" | "markets";
type SortBy = "totalEarned" | "totalReferrals";

const rankBadge = (rank: number) => {
  if (rank === 1) return <Crown className="w-5 h-5" style={{ color: "hsl(45, 93%, 58%)" }} />;
  if (rank === 2) return <Medal className="w-5 h-5" style={{ color: "hsl(0, 0%, 78%)" }} />;
  if (rank === 3) return <Award className="w-5 h-5" style={{ color: "hsl(30, 75%, 40%)" }} />;
  return <span className="text-sm font-bold text-muted-foreground w-5 text-center">#{rank}</span>;
};

const Rankings = () => {
  const [tab, setTab] = useState<Tab>("referrers");
  const [sortBy, setSortBy] = useState<SortBy>("totalEarned");
  const [referrers, setReferrers] = useState<Referrer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      setLoading(true);
      const { data: rewards } = await supabase
        .from("referral_rewards")
        .select("referrer_id, amount");

      if (!rewards || rewards.length === 0) {
        setReferrers([]);
        setLoading(false);
        return;
      }

      // Aggregate by referrer
      const map = new Map<string, { total: number; count: number }>();
      for (const r of rewards) {
        const existing = map.get(r.referrer_id) || { total: 0, count: 0 };
        existing.total += Number(r.amount);
        existing.count += 1;
        map.set(r.referrer_id, existing);
      }

      const referrerIds = Array.from(map.keys());

      // Fetch profiles for these referrers
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", referrerIds);

      const profileMap = new Map(
        (profiles || []).map((p) => [p.id, p])
      );

      const result: Referrer[] = referrerIds.map((id) => {
        const stats = map.get(id)!;
        const profile = profileMap.get(id);
        return {
          userId: id,
          name: profile?.display_name || "Anonymous",
          avatar: profile?.avatar_url || null,
          totalReferrals: stats.count,
          totalEarned: stats.total,
        };
      });

      setReferrers(result);
      setLoading(false);
    };

    fetchLeaderboard();
  }, []);

  const sorted = [...referrers].sort((a, b) =>
    sortBy === "totalEarned"
      ? b.totalEarned - a.totalEarned
      : b.totalReferrals - a.totalReferrals
  );

  const sortedMarkets = [...mockMarkets].sort((a, b) => b.volume - a.volume);

  return (
    <div className="min-h-dvh bg-background pb-20">
      <TopBar />
      <div className="max-w-lg mx-auto px-4 pt-20">
        <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" /> Leaderboard
        </h2>
        <p className="text-xs text-muted-foreground mb-5">Top performers on the platform</p>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {(["referrers", "markets"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold capitalize transition-all ${
                tab === t ? "bg-primary text-primary-foreground" : "glass text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "referrers" && (
          <>
            {/* Sort options */}
            <div className="flex gap-2 mb-4">
              {([
                { key: "totalEarned" as SortBy, label: "Total Earned" },
                { key: "totalReferrals" as SortBy, label: "Referrals" },
              ]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setSortBy(key)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                    sortBy === key
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : sorted.length === 0 ? (
              <div className="text-center py-16">
                <Users className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No referral data yet</p>
                <p className="text-xs text-muted-foreground mt-1">Invite friends to climb the leaderboard!</p>
              </div>
            ) : (
              <>
                {/* Top 3 Podium */}
                {sorted.length >= 3 && (
                  <div className="flex items-end justify-center gap-3 mb-6">
                    {[sorted[1], sorted[0], sorted[2]].map((ref, i) => {
                      const heights = ["h-24", "h-32", "h-20"];
                      const sizes = ["w-12 h-12", "w-16 h-16", "w-12 h-12"];
                      const podiumRank = [2, 1, 3][i];
                      return (
                        <motion.div
                          key={ref.userId}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.1 }}
                          className="flex flex-col items-center"
                        >
                          <div className={`${sizes[i]} rounded-full glass border-2 ${i === 1 ? "border-primary" : "border-border"} flex items-center justify-center text-xl mb-2 overflow-hidden`}>
                            {ref.avatar ? (
                              <img src={ref.avatar} alt={ref.name} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-lg">👤</span>
                            )}
                          </div>
                          <p className="text-xs font-bold mb-0.5 truncate max-w-[80px]">{ref.name}</p>
                          <p className="text-[11px] font-bold text-primary">
                            +${ref.totalEarned.toFixed(0)}
                          </p>
                          <div className={`${heights[i]} w-20 glass rounded-t-xl mt-2 flex items-center justify-center`}>
                            {rankBadge(podiumRank)}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}

                {/* Full list */}
                <div className="space-y-2">
                  {sorted.map((ref, i) => (
                    <motion.div
                      key={ref.userId}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="glass rounded-xl p-3.5 flex items-center gap-3"
                    >
                      <div className="w-8 flex justify-center shrink-0">
                        {rankBadge(i + 1)}
                      </div>

                      <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-lg shrink-0 overflow-hidden">
                        {ref.avatar ? (
                          <img src={ref.avatar} alt={ref.name} className="w-full h-full object-cover" />
                        ) : (
                          <span>👤</span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-bold truncate block">{ref.name}</span>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                          <span>{ref.totalReferrals} referral{ref.totalReferrals !== 1 ? "s" : ""}</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-primary flex items-center gap-1 justify-end">
                          <TrendingUp className="w-3.5 h-3.5" />
                          +${ref.totalEarned.toFixed(0)}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {tab === "markets" && (
          <div className="space-y-3">
            {sortedMarkets.map((market, i) => (
              <motion.div
                key={market.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="glass rounded-xl p-4 flex items-center gap-4"
              >
                <span className={`text-lg font-bold w-8 text-center ${i < 3 ? "text-primary" : "text-muted-foreground"}`}>
                  #{i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold truncate">{market.title}</h4>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                    <span>@{market.creatorName}</span>
                    <span>•</span>
                    <span className="flex items-center gap-0.5">
                      <TrendingUp className="w-3 h-3" /> {formatVolume(market.volume)}
                    </span>
                  </div>
                </div>
                <span className="neon-yes text-lg font-bold">{Math.round(market.yesPrice * 100)}%</span>
              </motion.div>
            ))}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
};

export default Rankings;
