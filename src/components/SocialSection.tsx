import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import FollowButton from "@/components/FollowButton";
import ActivityFeed from "@/components/ActivityFeed";
import NftBadge, { type VerificationLevel } from "@/components/NftBadge";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, UserCheck, Heart, Sparkles, Loader2, ChevronDown, Search, X,
} from "lucide-react";

interface SocialSectionProps {
  userId: string;
  isOwnProfile: boolean;
  isPublic: boolean;
}

const SocialSection = ({ userId, isOwnProfile, isPublic }: SocialSectionProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"activity" | "followers" | "following" | "suggestions">("activity");

  const { data: followers = [], isLoading: loadingFollowers } = useQuery({
    queryKey: ["social-followers", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("follows")
        .select("id, follower_id, created_at")
        .eq("following_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (!data || data.length === 0) return [];
      const ids = data.map((f: any) => f.follower_id);
      const { data: profiles } = await supabase.from("profiles").select("id, display_name, avatar_url, bio, verification_level").in("id", ids);
      const map = new Map((profiles || []).map((p: any) => [p.id, p]));
      return data.map((f: any) => ({ ...f, profile: map.get(f.follower_id) }));
    },
    enabled: expanded,
  });

  const { data: following = [], isLoading: loadingFollowing } = useQuery({
    queryKey: ["social-following", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("follows")
        .select("id, following_id, created_at")
        .eq("follower_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (!data || data.length === 0) return [];
      const ids = data.map((f: any) => f.following_id);
      const { data: profiles } = await supabase.from("profiles").select("id, display_name, avatar_url, bio, verification_level").in("id", ids);
      const map = new Map((profiles || []).map((p: any) => [p.id, p]));
      return data.map((f: any) => ({ ...f, profile: map.get(f.following_id) }));
    },
    enabled: expanded,
  });

  const { data: suggestions = [], isLoading: loadingSuggestions } = useQuery({
    queryKey: ["follow-suggestions", userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_follow_suggestions", {
        _user_id: userId,
        _limit: 15,
      });
      if (error) { console.error("follow suggestions error:", error); return []; }
      return data || [];
    },
    enabled: expanded && activeTab === "suggestions",
  });

  const renderUserRow = (uid: string, prof: any, index: number) => {
    const name = prof?.display_name || "Anonymous";
    const vLevel = (prof?.verification_level || "none") as VerificationLevel;
    return (
      <motion.div
        key={uid}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.03 }}
        className="glass rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:bg-accent/30 transition-colors"
        onClick={() => navigate(`/user/${uid}`)}
      >
        <div className="relative shrink-0">
          <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 overflow-hidden flex items-center justify-center">
            {prof?.avatar_url ? (
              <img src={prof.avatar_url} alt={name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-sm font-bold text-primary">{name.charAt(0).toUpperCase()}</span>
            )}
          </div>
          
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate flex items-center gap-1">
            {name}
            {vLevel !== "none" && <NftBadge level={vLevel} size={14} />}
          </p>
          {prof?.bio && <p className="text-[10px] text-muted-foreground truncate">{prof.bio}</p>}
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <FollowButton userId={uid} size="sm" />
        </div>
      </motion.div>
    );
  };

  return (
    <div className="mb-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full glass rounded-xl px-4 py-3 flex items-center justify-between hover:bg-accent/30 transition-colors"
      >
        <span className="text-sm font-semibold flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          Social
        </span>
        <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </motion.div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="pt-3 space-y-3">
              {/* Tabs */}
              <div className="flex gap-1 p-1 rounded-xl bg-muted/50">
                {([
                  { key: "activity" as const, label: "Activity", icon: Heart },
                  { key: "followers" as const, label: `${followers.length}`, icon: Users },
                  { key: "following" as const, label: `${following.length}`, icon: UserCheck },
                  { key: "suggestions" as const, label: "For You", icon: Sparkles },
                ]).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key)}
                    className={`flex-1 py-2 rounded-lg text-[10px] font-semibold transition-all flex flex-col items-center gap-0.5 ${
                      activeTab === t.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                    }`}
                  >
                    <t.icon className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Content */}
              {activeTab === "activity" && (
                <ActivityFeed userId={userId} isOwnProfile={isOwnProfile} isPublic={isPublic} />
              )}

              {activeTab === "followers" && (
                <div className="space-y-1.5">
                  {loadingFollowers ? (
                    <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
                  ) : followers.length === 0 ? (
                    <div className="text-center py-12">
                      <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No followers yet</p>
                    </div>
                  ) : (
                    followers.map((f: any, i: number) => renderUserRow(f.follower_id, f.profile, i))
                  )}
                </div>
              )}

              {activeTab === "following" && (
                <div className="space-y-1.5">
                  {loadingFollowing ? (
                    <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
                  ) : following.length === 0 ? (
                    <div className="text-center py-12">
                      <UserCheck className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Not following anyone yet</p>
                      <button onClick={() => setActiveTab("suggestions")} className="mt-3 text-xs text-primary font-semibold hover:underline">
                        Discover people to follow →
                      </button>
                    </div>
                  ) : (
                    following.map((f: any, i: number) => renderUserRow(f.following_id, f.profile, i))
                  )}
                </div>
              )}

              {activeTab === "suggestions" && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground px-1 mb-2">Active traders you might want to follow</p>
                  {loadingSuggestions ? (
                    <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
                  ) : suggestions.length === 0 ? (
                    <div className="text-center py-12">
                      <Sparkles className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No suggestions right now</p>
                    </div>
                  ) : (
                    suggestions.map((s: any, i: number) => renderUserRow(s.id, s, i))
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SocialSection;
