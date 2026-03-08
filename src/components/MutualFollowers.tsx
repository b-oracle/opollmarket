import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Users } from "lucide-react";

interface MutualFollowersProps {
  targetUserId: string;
}

const MutualFollowers = ({ targetUserId }: MutualFollowersProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: mutuals = [], isLoading } = useQuery({
    queryKey: ["mutual-followers", user?.id, targetUserId],
    queryFn: async () => {
      if (!user) return [];

      // Get people the current user follows
      const { data: myFollowing } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", user.id);

      // Get people the target user follows
      const { data: theirFollowing } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", targetUserId);

      if (!myFollowing || !theirFollowing) return [];

      const mySet = new Set(myFollowing.map((f) => f.following_id));
      const mutualIds = theirFollowing
        .map((f) => f.following_id)
        .filter((id) => mySet.has(id) && id !== user.id && id !== targetUserId);

      if (mutualIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", mutualIds.slice(0, 5));

      return (profiles || []).map((p) => ({
        ...p,
        totalCount: mutualIds.length,
      }));
    },
    enabled: !!user && user.id !== targetUserId,
  });

  if (!user || user.id === targetUserId || isLoading || mutuals.length === 0) return null;

  const totalCount = (mutuals[0] as any)?.totalCount || mutuals.length;
  const displayProfiles = mutuals.slice(0, 3);
  const remaining = totalCount - displayProfiles.length;

  return (
    <div
      className="flex items-center gap-2 mt-3 px-1 cursor-pointer hover:opacity-80 transition-opacity"
      onClick={() => navigate(`/followers`)}
    >
      {/* Stacked avatars */}
      <div className="flex -space-x-2">
        {displayProfiles.map((p, i) => (
          <div
            key={p.id}
            className="w-6 h-6 rounded-full border-2 border-background bg-primary/20 overflow-hidden flex items-center justify-center"
            style={{ zIndex: displayProfiles.length - i }}
          >
            {p.avatar_url ? (
              <img src={p.avatar_url} alt={p.display_name || ""} className="w-full h-full object-cover" />
            ) : (
              <span className="text-[8px] font-bold text-primary">
                {(p.display_name || "?").charAt(0).toUpperCase()}
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground leading-tight">
        <span className="font-semibold text-foreground">
          {displayProfiles.map((p) => p.display_name || "Anonymous").join(", ")}
        </span>
        {remaining > 0 && (
          <span> and <span className="font-semibold text-foreground">{remaining} other{remaining > 1 ? "s" : ""}</span></span>
        )}
        {" "}you both follow
      </p>
    </div>
  );
};

export default MutualFollowers;
