import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Gift, Users, DollarSign, TrendingUp, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface ReferralRow {
  id: string;
  referrer_id: string;
  referred_id: string;
  amount: number;
  created_at: string;
  referrer_name?: string;
  referred_name?: string;
}

interface ReferralStats {
  totalRewards: number;
  totalAmount: number;
  uniqueReferrers: number;
  avgRewardAmount: number;
  topReferrers: { id: string; name: string; count: number; totalEarned: number }[];
}

const AdminReferrals = () => {
  const [loading, setLoading] = useState(true);
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [stats, setStats] = useState<ReferralStats>({
    totalRewards: 0, totalAmount: 0, uniqueReferrers: 0, avgRewardAmount: 0, topReferrers: [],
  });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      // Fetch all referral rewards
      let allRewards: any[] = [];
      let p = 0;
      let hasMore = true;
      while (hasMore) {
        const { data } = await supabase
          .from("referral_rewards")
          .select("id, referrer_id, referred_id, amount, created_at")
          .order("created_at", { ascending: false })
          .range(p * 1000, (p + 1) * 1000 - 1);
        if (data && data.length > 0) {
          allRewards = [...allRewards, ...data];
          p++;
          if (data.length < 1000) hasMore = false;
        } else {
          hasMore = false;
        }
      }

      // Get unique user IDs for profile lookup
      const userIds = [...new Set([
        ...allRewards.map(r => r.referrer_id),
        ...allRewards.map(r => r.referred_id),
      ])];

      const profileMap = new Map<string, string>();
      if (userIds.length > 0) {
        const batchSize = 100;
        for (let i = 0; i < userIds.length; i += batchSize) {
          const batch = userIds.slice(i, i + batchSize);
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, display_name, email")
            .in("id", batch);
          if (profiles) {
            profiles.forEach(p => profileMap.set(p.id, p.display_name || p.email || p.id.slice(0, 8)));
          }
        }
      }

      const enriched: ReferralRow[] = allRewards.map(r => ({
        ...r,
        referrer_name: profileMap.get(r.referrer_id) || r.referrer_id.slice(0, 8),
        referred_name: profileMap.get(r.referred_id) || r.referred_id.slice(0, 8),
      }));

      // Compute stats
      const totalAmount = allRewards.reduce((s, r) => s + Number(r.amount), 0);
      const referrerMap = new Map<string, { count: number; totalEarned: number }>();
      allRewards.forEach(r => {
        const entry = referrerMap.get(r.referrer_id) || { count: 0, totalEarned: 0 };
        entry.count++;
        entry.totalEarned += Number(r.amount);
        referrerMap.set(r.referrer_id, entry);
      });

      const topReferrers = Array.from(referrerMap.entries())
        .map(([id, v]) => ({ id, name: profileMap.get(id) || id.slice(0, 8), ...v }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      setStats({
        totalRewards: allRewards.length,
        totalAmount,
        uniqueReferrers: referrerMap.size,
        avgRewardAmount: allRewards.length > 0 ? totalAmount / allRewards.length : 0,
        topReferrers,
      });

      setReferrals(enriched);
      setLoading(false);
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  const filtered = search.trim()
    ? referrals.filter(r =>
        r.referrer_name?.toLowerCase().includes(search.toLowerCase()) ||
        r.referred_name?.toLowerCase().includes(search.toLowerCase()) ||
        r.referrer_id.includes(search) ||
        r.referred_id.includes(search)
      )
    : referrals;

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const statCards = [
    { label: "Total Referrals", value: stats.totalRewards.toLocaleString(), icon: Gift, color: "text-primary" },
    { label: "Total Paid Out", value: `$${stats.totalAmount.toFixed(2)}`, icon: DollarSign, color: "text-green-500" },
    { label: "Unique Referrers", value: stats.uniqueReferrers.toLocaleString(), icon: Users, color: "text-blue-500" },
    { label: "Avg Reward", value: `$${stats.avgRewardAmount.toFixed(2)}`, icon: TrendingUp, color: "text-purple-500" },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Referrals</h2>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map(card => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{card.label}</span>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </div>
            <span className="text-xl font-bold">{card.value}</span>
          </div>
        ))}
      </div>

      {/* Top Referrers */}
      {stats.topReferrers.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4">Top Referrers</h3>
          <div className="space-y-3">
            {stats.topReferrers.map((r, i) => (
              <div key={r.id} className="flex items-center gap-3">
                <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium truncate">{r.name}</span>
                    <span className="text-xs text-muted-foreground">{r.count} referrals · ${r.totalEarned.toFixed(2)}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(r.count / (stats.topReferrers[0]?.count || 1)) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Referral History */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">Referral History ({filtered.length})</h3>
          <div className="relative w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by name or ID..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
              className="pl-8 h-8 text-xs"
            />
          </div>
        </div>

        {paginated.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-2 text-muted-foreground font-medium">Referrer</th>
                    <th className="text-left py-2 px-2 text-muted-foreground font-medium">Referred User</th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">Reward</th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(r => (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-2 font-medium">{r.referrer_name}</td>
                      <td className="py-2.5 px-2 text-muted-foreground">{r.referred_name}</td>
                      <td className="py-2.5 px-2 text-right text-green-500 font-medium">${Number(r.amount).toFixed(2)}</td>
                      <td className="py-2.5 px-2 text-right text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <span className="text-xs text-muted-foreground">
                  Page {page + 1} of {totalPages}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-muted hover:bg-muted/80 disabled:opacity-40 transition-colors"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-muted hover:bg-muted/80 disabled:opacity-40 transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">
            {search ? "No referrals matching your search" : "No referral rewards recorded yet"}
          </p>
        )}
      </div>

      {/* Pending Referrals (users referred but haven't made first bet) */}
      <PendingReferrals />
    </div>
  );
};

/** Shows users who were referred but haven't earned a reward yet */
const PendingReferrals = () => {
  const [pending, setPending] = useState<{ id: string; name: string; referrer: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      // Get profiles with referred_by set
      const { data: referred } = await supabase
        .from("profiles")
        .select("id, display_name, email, referred_by, created_at")
        .not("referred_by", "is", null)
        .order("created_at", { ascending: false })
        .limit(500);

      if (!referred || referred.length === 0) { setLoading(false); return; }

      // Get which ones already have rewards
      const referredIds = referred.map(r => r.id);
      const { data: rewarded } = await supabase
        .from("referral_rewards")
        .select("referred_id")
        .in("referred_id", referredIds.slice(0, 100));

      const rewardedSet = new Set((rewarded || []).map(r => r.referred_id));

      // Get referrer names
      const referrerIds = [...new Set(referred.map(r => r.referred_by).filter(Boolean))] as string[];
      const referrerMap = new Map<string, string>();
      if (referrerIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", referrerIds.slice(0, 100));
        if (profiles) profiles.forEach(p => referrerMap.set(p.id, p.display_name || p.id.slice(0, 8)));
      }

      const pendingList = referred
        .filter(r => !rewardedSet.has(r.id))
        .slice(0, 20)
        .map(r => ({
          id: r.id,
          name: r.display_name || r.email || r.id.slice(0, 8),
          referrer: referrerMap.get(r.referred_by!) || r.referred_by!.slice(0, 8),
          created_at: r.created_at,
        }));

      setPending(pendingList);
      setLoading(false);
    };
    fetch();
  }, []);

  if (loading || pending.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="text-sm font-semibold mb-4">Pending Referrals (awaiting first prediction)</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 px-2 text-muted-foreground font-medium">Referred User</th>
              <th className="text-left py-2 px-2 text-muted-foreground font-medium">Referred By</th>
              <th className="text-right py-2 px-2 text-muted-foreground font-medium">Signed Up</th>
            </tr>
          </thead>
          <tbody>
            {pending.map(p => (
              <tr key={p.id} className="border-b border-border/50">
                <td className="py-2.5 px-2 font-medium">{p.name}</td>
                <td className="py-2.5 px-2 text-muted-foreground">{p.referrer}</td>
                <td className="py-2.5 px-2 text-right text-muted-foreground">
                  {new Date(p.created_at).toLocaleDateString("en", { month: "short", day: "numeric" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminReferrals;
