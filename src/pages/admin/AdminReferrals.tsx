import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Gift, Users, DollarSign, TrendingUp, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import AdminPagination from "@/components/admin/AdminPagination";

const TIME_RANGES = [
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
  { label: "All", days: 0 },
];

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
  const [page, setPage] = useState(1);
  const [range, setRange] = useState(1); // index into TIME_RANGES
  const PAGE_SIZE = 20;

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setPage(1);

      const sinceISO = TIME_RANGES[range].days > 0
        ? new Date(Date.now() - TIME_RANGES[range].days * 86400000).toISOString()
        : null;

      // Fetch referral rewards (paginated to handle >1000)
      let allRewards: any[] = [];
      let p = 0;
      let hasMore = true;
      while (hasMore) {
        let q = supabase
          .from("referral_rewards")
          .select("id, referrer_id, referred_id, amount, created_at")
          .order("created_at", { ascending: false })
          .range(p * 1000, (p + 1) * 1000 - 1);
        if (sinceISO) q = q.gte("created_at", sinceISO);
        const { data } = await q;
        if (data && data.length > 0) {
          allRewards = [...allRewards, ...data];
          p++;
          if (data.length < 1000) hasMore = false;
        } else {
          hasMore = false;
        }
      }

      // Profile lookup
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
  }, [range]);

  const filtered = search.trim()
    ? referrals.filter(r =>
        r.referrer_name?.toLowerCase().includes(search.toLowerCase()) ||
        r.referred_name?.toLowerCase().includes(search.toLowerCase()) ||
        r.referrer_id.includes(search) ||
        r.referred_id.includes(search)
      )
    : referrals;

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const statCards = [
    { label: "Total Referrals", value: stats.totalRewards.toLocaleString(), icon: Gift, color: "text-primary" },
    { label: "Total Paid Out", value: `$${stats.totalAmount.toFixed(2)}`, icon: DollarSign, color: "text-green-500" },
    { label: "Unique Referrers", value: stats.uniqueReferrers.toLocaleString(), icon: Users, color: "text-blue-500" },
    { label: "Avg Reward", value: `$${stats.avgRewardAmount.toFixed(2)}`, icon: TrendingUp, color: "text-purple-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Referrals</h2>
        <div className="flex gap-1 bg-muted rounded-lg p-0.5">
          {TIME_RANGES.map((tr, i) => (
            <button
              key={tr.label}
              onClick={() => setRange(i)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                range === i ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tr.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : (
        <>
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
          <div className="bg-card border border-border rounded-xl">
            <div className="flex items-center justify-between p-5 pb-3">
              <h3 className="text-sm font-semibold">Referral History ({filtered.length})</h3>
              <div className="relative w-56">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search by name or ID..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  className="pl-8 h-8 text-xs"
                />
              </div>
            </div>

            {paginated.length > 0 ? (
              <>
                <div className="overflow-x-auto px-5">
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
                <AdminPagination
                  page={page}
                  totalItems={filtered.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setPage}
                />
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                {search ? "No referrals matching your search" : "No referral rewards recorded yet"}
              </p>
            )}
          </div>

          {/* Pending Referrals */}
          <PendingReferrals range={range} />
        </>
      )}
    </div>
  );
};

const PendingReferrals = ({ range }: { range: number }) => {
  const [pending, setPending] = useState<{ id: string; name: string; referrer: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  useEffect(() => {
    const fetchPending = async () => {
      setLoading(true);
      setPage(1);

      const sinceISO = TIME_RANGES[range].days > 0
        ? new Date(Date.now() - TIME_RANGES[range].days * 86400000).toISOString()
        : null;

      let q = supabase
        .from("profiles")
        .select("id, display_name, email, referred_by, created_at")
        .not("referred_by", "is", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (sinceISO) q = q.gte("created_at", sinceISO);

      const { data: referred } = await q;
      if (!referred || referred.length === 0) { setLoading(false); setPending([]); return; }

      const referredIds = referred.map(r => r.id);
      const { data: rewarded } = await supabase
        .from("referral_rewards")
        .select("referred_id")
        .in("referred_id", referredIds.slice(0, 100));

      const rewardedSet = new Set((rewarded || []).map(r => r.referred_id));

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
        .map(r => ({
          id: r.id,
          name: r.display_name || r.email || r.id.slice(0, 8),
          referrer: referrerMap.get(r.referred_by!) || r.referred_by!.slice(0, 8),
          created_at: r.created_at,
        }));

      setPending(pendingList);
      setLoading(false);
    };
    fetchPending();
  }, [range]);

  if (loading || pending.length === 0) return null;

  const paginated = pending.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="bg-card border border-border rounded-xl">
      <div className="p-5 pb-3">
        <h3 className="text-sm font-semibold">Pending Referrals ({pending.length}) — awaiting first prediction</h3>
      </div>
      <div className="overflow-x-auto px-5">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 px-2 text-muted-foreground font-medium">Referred User</th>
              <th className="text-left py-2 px-2 text-muted-foreground font-medium">Referred By</th>
              <th className="text-right py-2 px-2 text-muted-foreground font-medium">Signed Up</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map(p => (
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
      <AdminPagination
        page={page}
        totalItems={pending.length}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />
    </div>
  );
};

export default AdminReferrals;
