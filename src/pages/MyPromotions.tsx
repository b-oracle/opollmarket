import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { Loader2, Zap, Megaphone, Eye, MousePointerClick, BarChart3, ArrowLeft, Timer, Crown, Flame, Radio } from "lucide-react";
import { format, formatDistanceToNow, isPast, differenceInHours } from "date-fns";
import BoostCountdown from "@/components/BoostCountdown";

type TabKey = "boosts" | "social_ads" | "broadcasts";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  active: "bg-green-500/10 text-green-500 border-green-500/20",
  sent: "bg-green-500/10 text-green-500 border-green-500/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  expired: "bg-muted text-muted-foreground border-border",
  payment_expired: "bg-orange-500/10 text-orange-500 border-orange-500/20",
};

function getResolvedBroadcastStatus(bc: any): { display: string; key: string } {
  if (bc.status === "sent" || bc.status === "active") return { display: "Sent", key: "sent" };
  if (bc.status === "expired") {
    return (bc.tx_hash || bc.nowpayments_payment_id)
      ? { display: "Sent", key: "sent" }
      : { display: "Payment Expired", key: "payment_expired" };
  }
  if (bc.status === "pending") {
    if (differenceInHours(new Date(), new Date(bc.created_at)) >= 2) {
      return { display: "Payment Expired", key: "payment_expired" };
    }
    return { display: "Pending Payment", key: "pending" };
  }
  return { display: bc.status, key: bc.status };
}

type BroadcastFilter = "all" | "sent" | "pending" | "payment_expired";

const tierIcons: Record<string, typeof Zap> = { flash: Zap, standard: Flame, whale: Crown };

const MyPromotions = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>("boosts");

  // Fetch boosts
  const { data: boosts = [], isLoading: boostsLoading } = useQuery({
    queryKey: ["my-boosts", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("market_boosts")
        .select("*, markets(title, image_url)")
        .eq("payer_wallet", user!.id)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Fetch social ads
  const { data: socialAds = [], isLoading: adsLoading } = useQuery({
    queryKey: ["my-social-ads", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("social_ads")
        .select("*, markets(title, image_url)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Fetch broadcasts
  const { data: broadcasts = [], isLoading: broadcastsLoading } = useQuery({
    queryKey: ["my-broadcasts", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("market_broadcasts")
        .select("*, markets(title, image_url)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!user?.id,
  });

  const isLoading = boostsLoading || adsLoading || broadcastsLoading;

  // Summary stats
  const boostStats = useMemo(() => {
    const active = boosts.filter((b: any) => b.status === "active" && !isPast(new Date(b.ends_at)));
    const total = boosts.length;
    const spent = boosts.filter((b: any) => b.status === "active" || (b.status === "expired" && b.tx_hash)).reduce((s: number, b: any) => s + b.amount, 0);
    return { active: active.length, total, spent };
  }, [boosts]);

  const adStats = useMemo(() => {
    const active = socialAds.filter((a: any) => a.status === "active" && !isPast(new Date(a.ends_at)));
    const totalImpressions = socialAds.reduce((s: number, a: any) => s + (a.impressions || 0), 0);
    const totalClicks = socialAds.reduce((s: number, a: any) => s + (a.clicks || 0), 0);
    const spent = socialAds.reduce((s: number, a: any) => s + a.amount, 0);
    return { active: active.length, total: socialAds.length, totalImpressions, totalClicks, spent };
  }, [socialAds]);

  const [bcFilter, setBcFilter] = useState<BroadcastFilter>("all");

  const broadcastStats = useMemo(() => {
    const total = broadcasts.length;
    const sent = broadcasts.filter((b: any) => getResolvedBroadcastStatus(b).key === "sent").length;
    const pending = broadcasts.filter((b: any) => getResolvedBroadcastStatus(b).key === "pending").length;
    const paymentExpired = broadcasts.filter((b: any) => getResolvedBroadcastStatus(b).key === "payment_expired").length;
    const spent = broadcasts.filter((b: any) => getResolvedBroadcastStatus(b).key === "sent").reduce((s: number, b: any) => s + b.amount, 0);
    return { total, sent, pending, paymentExpired, spent };
  }, [broadcasts]);

  const filteredBroadcasts = useMemo(() => {
    if (bcFilter === "all") return broadcasts;
    return broadcasts.filter((b: any) => getResolvedBroadcastStatus(b).key === bcFilter);
  }, [broadcasts, bcFilter]);

  const tabs: { key: TabKey; label: string; icon: typeof Zap; count: number }[] = [
    { key: "boosts", label: "Boosts", icon: Zap, count: boosts.length },
    { key: "social_ads", label: "Social Ads", icon: Eye, count: socialAds.length },
    { key: "broadcasts", label: "Broadcasts", icon: Megaphone, count: broadcasts.length },
  ];

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Please sign in to view your promotions.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <div className="max-w-3xl mx-auto px-4 pt-[calc(3.5rem+env(safe-area-inset-top)+1rem)] pb-24">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold">My Promotions</h1>
            <p className="text-xs text-muted-foreground">Track your boosts, ads & broadcasts</p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium block mb-0.5">Active Boosts</span>
            <p className="text-xl font-bold text-primary">{boostStats.active}</p>
            <p className="text-[9px] text-muted-foreground">${boostStats.spent.toFixed(2)} spent</p>
          </div>
          <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-3">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium block mb-0.5">Ad Impressions</span>
            <p className="text-xl font-bold text-green-500">{adStats.totalImpressions.toLocaleString()}</p>
            <p className="text-[9px] text-muted-foreground">{adStats.totalClicks} clicks</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium block mb-0.5">Total Ads</span>
            <p className="text-xl font-bold">{adStats.total}</p>
            <p className="text-[9px] text-muted-foreground">${adStats.spent.toFixed(2)} spent</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium block mb-0.5">Broadcasts</span>
            <p className="text-xl font-bold">{broadcastStats.total}</p>
            <p className="text-[9px] text-muted-foreground">${broadcastStats.spent.toFixed(2)} spent</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 mb-4 overflow-x-auto">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  tab === t.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
                {t.count > 0 && (
                  <span className={`text-[10px] font-bold ${tab === t.key ? "text-primary" : ""}`}>{t.count}</span>
                )}
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        ) : (
          <>
            {/* Boosts Tab */}
            {tab === "boosts" && (
              <div className="space-y-2">
                {boosts.length === 0 ? (
                  <EmptyState icon={Zap} label="No boosts yet" description="Boost a market to increase its visibility" />
                ) : boosts.map((boost: any) => {
                  const isActive = boost.status === "active" && !isPast(new Date(boost.ends_at));
                  const TierIcon = tierIcons[boost.tier] || Zap;
                  return (
                    <div key={boost.id} className="bg-card border border-border rounded-xl p-4 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <TierIcon className="w-4 h-4 text-primary" />
                        <span className="text-sm font-bold truncate max-w-[250px] cursor-pointer hover:text-primary" onClick={() => navigate(`/market/${boost.market_id}`)}>
                          {(boost as any).markets?.title || "Unknown Market"}
                        </span>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                          isActive ? statusColors.active : statusColors[boost.status] || statusColors.expired
                        }`}>
                          {isActive ? "Active" : boost.status}
                        </span>
                        <span className="text-xs font-semibold text-muted-foreground ml-auto">${boost.amount}</span>
                      </div>
                      {isActive && <BoostCountdown endsAt={boost.ends_at} tier={boost.tier} />}
                      <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                        <span>Created {format(new Date(boost.created_at), "MMM d, HH:mm")}</span>
                        {boost.ends_at && !isPast(new Date(boost.ends_at)) && (
                          <span className="text-green-500 font-medium">{formatDistanceToNow(new Date(boost.ends_at))} left</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Social Ads Tab */}
            {tab === "social_ads" && (
              <div className="space-y-2">
                {socialAds.length === 0 ? (
                  <EmptyState icon={Eye} label="No social ads yet" description="Create a social ad to appear in users' feeds" />
                ) : socialAds.map((ad: any) => {
                  const isActive = ad.status === "active" && !isPast(new Date(ad.ends_at));
                  const ctr = ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(1) : "0.0";
                  return (
                    <div key={ad.id} className="bg-card border border-border rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Radio className="w-4 h-4 text-primary" />
                        <span className="text-sm font-bold truncate max-w-[250px] cursor-pointer hover:text-primary" onClick={() => navigate(`/market/${ad.market_id}`)}>
                          {ad.markets?.title || "Unknown Market"}
                        </span>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                          isActive ? statusColors.active : statusColors[ad.status] || statusColors.expired
                        }`}>
                          {isActive ? "Active" : ad.status}
                        </span>
                        <span className="text-xs font-semibold text-muted-foreground ml-auto">${ad.amount}</span>
                      </div>
                      {ad.headline && (
                        <p className="text-xs text-muted-foreground italic">"{ad.headline}"</p>
                      )}
                      {/* Metrics */}
                      <div className="grid grid-cols-3 gap-2">
                        <MetricCard icon={Eye} label="Impressions" value={ad.impressions?.toLocaleString() || "0"} />
                        <MetricCard icon={MousePointerClick} label="Clicks" value={ad.clicks?.toLocaleString() || "0"} />
                        <MetricCard icon={BarChart3} label="CTR" value={`${ctr}%`} />
                      </div>
                      <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                        <span>Created {format(new Date(ad.created_at), "MMM d, HH:mm")}</span>
                        {isActive && (
                          <span className="text-green-500 font-medium">{formatDistanceToNow(new Date(ad.ends_at))} left</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Broadcasts Tab */}
            {tab === "broadcasts" && (
              <div className="space-y-3">
                {/* Broadcast Filters */}
                <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 overflow-x-auto">
                  {([
                    { key: "all" as BroadcastFilter, label: "All", count: broadcastStats.total },
                    { key: "sent" as BroadcastFilter, label: "Sent", count: broadcastStats.sent },
                    { key: "pending" as BroadcastFilter, label: "Pending", count: broadcastStats.pending },
                    { key: "payment_expired" as BroadcastFilter, label: "Expired", count: broadcastStats.paymentExpired },
                  ]).map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setBcFilter(f.key)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                        bcFilter === f.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {f.label}
                      {f.count > 0 && (
                        <span className={`ml-1.5 text-[10px] font-bold ${bcFilter === f.key ? "text-primary" : "text-muted-foreground"}`}>
                          {f.count}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {filteredBroadcasts.length === 0 ? (
                  <EmptyState icon={Megaphone} label="No broadcasts yet" description="Send a broadcast alert to notify all users about a market" />
                ) : filteredBroadcasts.map((bc: any) => {
                  const { display, key } = getResolvedBroadcastStatus(bc);
                  return (
                    <div key={bc.id} className="bg-card border border-border rounded-xl p-4 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Megaphone className="w-4 h-4 text-primary" />
                        <span className="text-sm font-bold truncate max-w-[250px] cursor-pointer hover:text-primary" onClick={() => navigate(`/market/${bc.market_id}`)}>
                          {bc.markets?.title || "Unknown Market"}
                        </span>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                          statusColors[key] || statusColors.expired
                        }`}>
                          {display}
                        </span>
                        <span className="text-xs font-semibold text-muted-foreground ml-auto">${bc.amount}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Created {format(new Date(bc.created_at), "MMM d, yyyy HH:mm")}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
      <BottomNav />
    </div>
  );
};

const EmptyState = ({ icon: Icon, label, description }: { icon: typeof Zap; label: string; description: string }) => (
  <div className="bg-card border border-border rounded-xl p-8 text-center">
    <Icon className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
    <p className="text-sm font-semibold text-muted-foreground">{label}</p>
    <p className="text-xs text-muted-foreground/60 mt-1">{description}</p>
  </div>
);

const MetricCard = ({ icon: Icon, label, value }: { icon: typeof Eye; label: string; value: string }) => (
  <div className="rounded-lg bg-muted/30 border border-border p-2 text-center">
    <Icon className="w-3.5 h-3.5 text-muted-foreground mx-auto mb-1" />
    <p className="text-sm font-bold">{value}</p>
    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</p>
  </div>
);

export default MyPromotions;
