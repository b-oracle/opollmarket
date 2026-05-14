import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Gift, Copy, Check, Users, DollarSign, ArrowLeft, Share2, LogIn, ChevronLeft, ChevronRight, Coins,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import useAnalytics from "@/hooks/useAnalytics";
import { Skeleton } from "@/components/ui/skeleton";

const ITEMS_PER_PAGE = 10;

const Referrals = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [page, setPage] = useState(1);
  const { track } = useAnalytics();

  useEffect(() => { track("page_view", { page: "referrals" }); }, []);

  // Fetch profile username for referral link
  const { data: profileUsername, isLoading: profileLoading } = useQuery({
    queryKey: ["profile_username", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .single();
      return data?.username || null;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const profileName = profileUsername;
  const referralLink = user && profileUsername ? `${window.location.origin}/?ref=${encodeURIComponent(profileUsername)}` : "";

  // Fetch ALL referred signups (profiles where referred_by = current user)
  const { data: referredSignups = [], isLoading: signupsLoading } = useQuery({
    queryKey: ["referred_signups", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.rpc("get_user_referral_signups" as any, {
        _user_id: user.id,
      } as any);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  // Fetch referral rewards (only created after first prediction)
  const { data: rewards = [], isLoading: rewardsLoading } = useQuery({
    queryKey: ["referral_rewards", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("referral_rewards")
        .select("*")
        .eq("referrer_id", user.id)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Fetch referral commissions from pending_commissions (released)
  const { data: referralCommissions = [] } = useQuery({
    queryKey: ["referral_commissions", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("pending_commissions")
        .select("amount")
        .eq("user_id", user.id)
        .eq("type", "referral")
        .eq("status", "released");
      return data || [];
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  // Fetch actual bonus balance from balances table
  const { data: bonusBalance = 0 } = useQuery({
    queryKey: ["bonus_balance", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { data } = await supabase
        .from("balances")
        .select("bonus_balance")
        .eq("user_id", user.id)
        .eq("currency", "USDT")
        .maybeSingle();
      return Number(data?.bonus_balance ?? 0);
    },
    enabled: !!user,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  // Fetch referral reward amount setting
  const { data: rewardAmount = 2 } = useQuery({
    queryKey: ["referral_reward_amount"],
    queryFn: async () => {
      const { data } = await supabase
        .from("public_commission_settings" as any)
        .select("referral_reward_amount")
        .limit(1)
        .single();
      return Number((data as any)?.referral_reward_amount ?? 2);
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });

  // Build a set of rewarded user IDs for quick lookup
  const rewardedUserIds = new Set(rewards.map((r: any) => r.referred_id));
  const rewardByUserId = new Map(rewards.map((r: any) => [r.referred_id, r]));

  const signupBonusTotal = rewards.reduce((sum: number, r: any) => sum + Number(r.amount), 0);
  const referralCommissionTotal = referralCommissions.reduce((sum: number, r: any) => sum + Number(r.amount), 0);
  const totalEarned = signupBonusTotal + referralCommissionTotal;
  const totalSignups = referredSignups.length;
  const totalRewarded = rewards.length;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      toast.success("Referral link copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join me on the platform!",
          text: `Sign up and start predicting! You'll get started right away.`,
          url: referralLink,
        });
      } catch { /* user cancelled */ }
    } else {
      handleCopy();
    }
  };

  const isDataLoading = authLoading || profileLoading || signupsLoading || rewardsLoading;

  if (!authLoading && !user) {
    return (
      <div className="min-h-dvh bg-background" style={{ paddingBottom: 'calc(1rem + var(--content-bottom))' }}>
        <TopBar />
        <div className="max-w-lg md:max-w-3xl mx-auto px-4 flex flex-col items-center justify-center" style={{ minHeight: "60vh", paddingTop: 'calc(1.5rem + var(--content-top))' }}>
          <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mb-4">
            <Gift className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-bold mb-2">Sign in to access referrals</h2>
          <p className="text-sm text-muted-foreground mb-6 text-center">
            Create an account to get your unique referral link and start earning rewards.
          </p>
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
    <div className="h-dvh bg-background overflow-y-auto overscroll-contain" style={{ paddingBottom: 'calc(1rem + var(--content-bottom))' }}>
      <TopBar />
      <div className="max-w-lg md:max-w-3xl mx-auto px-3 sm:px-4" style={{ paddingTop: 'calc(1.5rem + var(--content-top))' }}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate("/profile")} className="p-2 rounded-lg glass hover:bg-accent/50 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold">Referral Program</h1>
            <p className="text-xs text-muted-foreground">Earn ${rewardAmount} instantly for each referral signup</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {isDataLoading ? (
            <>
              {[0, 1, 2].map((i) => (
                <div key={i} className="glass rounded-xl p-4 text-center space-y-2">
                  <Skeleton className="w-5 h-5 rounded-full mx-auto" />
                  <Skeleton className="h-6 w-12 mx-auto" />
                  <Skeleton className="h-3 w-14 mx-auto" />
                </div>
              ))}
            </>
          ) : (
            <>
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}
                className="glass rounded-xl p-4 text-center">
                <Users className="w-5 h-5 text-primary mx-auto mb-1" />
                <p className="text-xl font-bold">{totalSignups}</p>
                <p className="text-[10px] text-muted-foreground">Signups</p>
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
                className="glass rounded-xl p-4 text-center">
                <Coins className="w-5 h-5 text-primary mx-auto mb-1" />
                <p className="text-xl font-bold">${totalEarned.toFixed(2)}</p>
                <p className="text-[10px] text-muted-foreground">Bonus</p>
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                className="glass rounded-xl p-4 text-center">
                <Gift className="w-5 h-5 text-primary mx-auto mb-1" />
                <p className="text-xl font-bold">${bonusBalance.toFixed(2)}</p>
                <p className="text-[10px] text-muted-foreground">Bonus Balance</p>
              </motion.div>
            </>
          )}
        </div>

        {/* See Commissions Breakdown */}
        <button
          onClick={() => navigate("/commissions")}
          className="w-full glass rounded-xl p-4 mb-6 flex items-center justify-center gap-2 text-sm font-semibold text-primary hover:bg-accent/50 transition-colors active:scale-[0.98]"
        >
          <DollarSign className="w-4 h-4" />
          See Commissions Breakdown
        </button>

        {/* Username Warning - only show after loading */}
        {!isDataLoading && !profileName && (
          <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 mb-4 flex items-start gap-3">
            <Gift className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-yellow-500">Username not found</p>
              <p className="text-xs text-muted-foreground mt-1">
                Your referral link and code use your username. Set one in your profile to start sharing.
              </p>
              <button
                onClick={() => navigate("/profile")}
                className="mt-2 text-xs font-semibold text-primary hover:underline"
              >
                Go to Profile →
              </button>
            </div>
          </div>
        )}

        {/* Referral Code */}
        <div className="glass rounded-xl p-5 mb-4">
          <h3 className="text-sm font-semibold mb-3">Your Referral Code</h3>
          <div className="flex items-center gap-2">
            {profileLoading ? (
              <Skeleton className="h-10 w-32 rounded-lg" />
            ) : (
              <div className="bg-muted/50 rounded-lg px-4 py-2.5 text-sm text-foreground font-mono select-all min-w-[3rem] max-w-full truncate">
                {profileName || "—"}
              </div>
            )}
            <button
              disabled={!profileName || profileLoading}
              onClick={async () => {
                if (!profileName) return;
                try {
                  await navigator.clipboard.writeText(profileName);
                  toast.success("Referral code copied!");
                } catch { toast.error("Failed to copy"); }
              }}
              className="shrink-0 p-2.5 rounded-lg bg-primary text-primary-foreground transition-all active:scale-95 disabled:opacity-50"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Friends can paste this code during sign-up in the referral code field.
          </p>
        </div>

        {/* Referral Link */}
        <div className="glass rounded-xl p-5 mb-6">
          <h3 className="text-sm font-semibold mb-3">Your Referral Link</h3>
          <div className="flex items-center gap-2">
            {profileLoading ? (
              <Skeleton className="h-10 flex-1 rounded-lg" />
            ) : (
              <div className="flex-1 bg-muted/50 rounded-lg px-3 py-2.5 text-xs text-muted-foreground truncate font-mono">
                {referralLink || "Set a display name to generate your link"}
              </div>
            )}
            <button
              disabled={!referralLink || profileLoading}
              onClick={handleCopy}
              className="shrink-0 p-2.5 rounded-lg bg-primary text-primary-foreground transition-all active:scale-95 disabled:opacity-50"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              disabled={profileLoading}
              onClick={handleShare}
              className="shrink-0 p-2.5 rounded-lg glass hover:bg-accent/50 transition-all active:scale-95 disabled:opacity-50"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Share this link. When someone signs up, you instantly earn <span className="text-primary font-bold">${rewardAmount}</span> in bonus balance.
          </p>
        </div>

        {/* How it works */}
        <div className="glass rounded-xl p-5 mb-6">
          <h3 className="text-sm font-semibold mb-3">How It Works</h3>
          <div className="space-y-3">
            {[
              { step: "1", text: "Share your referral link or username code with friends" },
              { step: "2", text: "Your friend signs up — they appear instantly in your referral list as 'Pending'" },
              { step: "3", text: `When they sign up, you instantly earn a $${rewardAmount} bonus credit` },
              { step: "4", text: "You also earn a commission on every prediction your referral makes" },
              { step: "5", text: "Bonus credits cover prediction fees, market creation, AI content, boosts, and more" },
            ].map((item) => (
              <div key={item.step} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-bold text-primary">{item.step}</span>
                </div>
                <p className="text-xs text-muted-foreground">{item.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Referral History */}
        <div className="mb-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Referral History</h3>
          {signupsLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="glass rounded-xl p-3.5 flex items-center gap-3">
                  <Skeleton className="w-9 h-9 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <Skeleton className="h-4 w-14" />
                </div>
              ))}
            </div>
          ) : referredSignups.length === 0 ? (
            <div className="glass rounded-xl p-8 text-center">
              <Gift className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No referrals yet. Share your link to start earning!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(() => {
                const totalPages = Math.max(1, Math.ceil(referredSignups.length / ITEMS_PER_PAGE));
                const paginated = referredSignups.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
                return (
                  <>
                    {paginated.map((signup: any, i: number) => {
                      const isRewarded = rewardedUserIds.has(signup.id);
                      const reward = rewardByUserId.get(signup.id);
                      const name = signup.display_name || "User";
                      return (
                        <motion.div
                          key={signup.id}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="glass rounded-xl p-3.5 flex items-center gap-3"
                        >
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isRewarded ? 'bg-primary/10' : 'bg-muted/50'}`}>
                            <Gift className={`w-4 h-4 ${isRewarded ? 'text-primary' : 'text-muted-foreground'}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-semibold truncate block">{name}</span>
                            <span className="text-[10px] text-muted-foreground">
                              Joined {new Date(signup.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          {isRewarded ? (
                            <span className="text-sm font-bold text-primary">+${Number(reward.amount).toFixed(2)}</span>
                          ) : (
                            <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-muted text-muted-foreground">
                              Pending
                            </span>
                          )}
                        </motion.div>
                      );
                    })}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-center gap-3 py-3">
                        <button
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={page === 1}
                          className="w-8 h-8 rounded-lg glass flex items-center justify-center disabled:opacity-30 hover:bg-muted transition-colors"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-xs font-medium text-muted-foreground">
                          {page} / {totalPages}
                        </span>
                        <button
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                          disabled={page === totalPages}
                          className="w-8 h-8 rounded-lg glass flex items-center justify-center disabled:opacity-30 hover:bg-muted transition-colors"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>
      <BottomNav />
    </div>
  );
};

export default Referrals;
