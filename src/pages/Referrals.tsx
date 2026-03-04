import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Gift, Copy, Check, Users, DollarSign, ArrowLeft, Share2, LogIn,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import useAnalytics from "@/hooks/useAnalytics";

const Referrals = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const { track } = useAnalytics();

  useEffect(() => { track("page_view", { page: "referrals" }); }, []);

  const referralLink = user ? `${window.location.origin}/?ref=${user.id}` : "";

  // Fetch referral rewards
  const { data: rewards = [] } = useQuery({
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
  });

  // Fetch bonus balance
  const { data: bonusBalance = 0 } = useQuery({
    queryKey: ["bonus_balance", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { data } = await supabase
        .from("balances")
        .select("bonus_balance")
        .eq("user_id", user.id)
        .single();
      return Number(data?.bonus_balance ?? 0);
    },
    enabled: !!user,
  });

  // Fetch referral reward amount setting
  const { data: rewardAmount = 5 } = useQuery({
    queryKey: ["referral_reward_amount"],
    queryFn: async () => {
      const { data } = await supabase
        .from("commission_settings")
        .select("referral_reward_amount")
        .limit(1)
        .single();
      return Number(data?.referral_reward_amount ?? 5);
    },
  });

  // Fetch referred user profiles
  const { data: referredProfiles = [] } = useQuery({
    queryKey: ["referred_profiles", rewards],
    queryFn: async () => {
      if (rewards.length === 0) return [];
      const ids = rewards.map((r: any) => r.referred_id);
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, email, created_at")
        .in("id", ids);
      return data || [];
    },
    enabled: rewards.length > 0,
  });

  const totalEarned = rewards.reduce((sum: number, r: any) => sum + Number(r.amount), 0);
  const totalReferrals = rewards.length;

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

  if (!authLoading && !user) {
    return (
      <div className="min-h-dvh bg-background pb-20">
        <TopBar />
        <div className="max-w-lg mx-auto px-4 pt-20 flex flex-col items-center justify-center" style={{ minHeight: "60vh" }}>
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
    <div className="min-h-dvh bg-background" style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}>
      <TopBar />
      <div className="max-w-lg mx-auto px-3 sm:px-4 pt-20">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate("/profile")} className="p-2 rounded-lg glass hover:bg-accent/50 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold">Referral Program</h1>
            <p className="text-xs text-muted-foreground">Earn ${rewardAmount} for each referral's first prediction</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}
            className="glass rounded-xl p-4 text-center">
            <Users className="w-5 h-5 text-primary mx-auto mb-1" />
            <p className="text-xl font-bold">{totalReferrals}</p>
            <p className="text-[10px] text-muted-foreground">Referrals</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="glass rounded-xl p-4 text-center">
            <DollarSign className="w-5 h-5 text-primary mx-auto mb-1" />
            <p className="text-xl font-bold">${totalEarned.toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground">Total Earned</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="glass rounded-xl p-4 text-center">
            <Gift className="w-5 h-5 text-primary mx-auto mb-1" />
            <p className="text-xl font-bold">${bonusBalance.toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground">Bonus Balance</p>
          </motion.div>
        </div>

        {/* Referral Link */}
        <div className="glass rounded-xl p-5 mb-6">
          <h3 className="text-sm font-semibold mb-3">Your Referral Link</h3>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-muted/50 rounded-lg px-3 py-2.5 text-xs text-muted-foreground truncate font-mono">
              {referralLink}
            </div>
            <button
              onClick={handleCopy}
              className="shrink-0 p-2.5 rounded-lg bg-primary text-primary-foreground transition-all active:scale-95"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              onClick={handleShare}
              className="shrink-0 p-2.5 rounded-lg glass hover:bg-accent/50 transition-all active:scale-95"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Share this link. When someone signs up and makes their first prediction, you earn <span className="text-primary font-bold">${rewardAmount}</span> in bonus balance.
          </p>
        </div>

        {/* How it works */}
        <div className="glass rounded-xl p-5 mb-6">
          <h3 className="text-sm font-semibold mb-3">How It Works</h3>
          <div className="space-y-3">
            {[
              { step: "1", text: "Share your unique referral link with friends" },
              { step: "2", text: "They sign up using your link" },
              { step: "3", text: `When they place their first prediction, you earn $${rewardAmount}` },
              { step: "4", text: "Bonus balance can be used to make predictions (non-withdrawable)" },
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
          {rewards.length === 0 ? (
            <div className="glass rounded-xl p-8 text-center">
              <Gift className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No referrals yet. Share your link to start earning!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rewards.map((reward: any, i: number) => {
                const profile = referredProfiles.find((p: any) => p.id === reward.referred_id);
                const name = profile?.display_name || profile?.email?.split("@")[0] || "User";
                return (
                  <motion.div
                    key={reward.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="glass rounded-xl p-3.5 flex items-center gap-3"
                  >
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Gift className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold truncate block">{name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(reward.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <span className="text-sm font-bold text-primary">+${Number(reward.amount).toFixed(2)}</span>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <BottomNav />
    </div>
  );
};

export default Referrals;
