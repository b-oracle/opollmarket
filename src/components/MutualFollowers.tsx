import { resolveAvatarUrl } from "@/lib/avatarUrl";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Users } from "lucide-react";
import { getAvatarInitials } from "@/lib/utils";

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
    <div className="flex items-center gap-2 mt-3 px-1">
      {/* Stacked avatars — each clickable */}
      <div className="flex -space-x-2">
        {displayProfiles.map((p, i) => (
          <button
            key={p.id}
            onClick={(e) => { e.stopPropagation(); navigate(`/user/${p.id}`); }}
            className="w-6 h-6 rounded-full border-2 border-background bg-primary/20 overflow-hidden flex items-center justify-center hover:ring-2 hover:ring-primary/40 transition-all cursor-pointer"
            style={{ zIndex: displayProfiles.length - i }}
            aria-label={`View ${p.display_name || "user"}'s profile`}
          >
            {p.avatar_url ? (
              <img src={resolveAvatarUrl(p.avatar_url)} alt={p.display_name || ""} className="w-full h-full object-cover" />
            ) : (
              <span className="text-[8px] font-bold text-primary">
                {getAvatarInitials(p.display_name)}
              </span>
            )}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground leading-tight">
        {displayProfiles.map((p, i) => (
          <span key={p.id}>
            {i > 0 && ", "}
            <button
              onClick={() => navigate(`/user/${p.id}`)}
              className="font-semibold text-foreground hover:text-primary transition-colors cursor-pointer"
            >
              {p.display_name || "Anonymous"}
            </button>
          </span>
        ))}
        {remaining > 0 && (
          <span> and <button onClick={() => navigate("/followers")} className="font-semibold text-foreground hover:text-primary transition-colors cursor-pointer">{remaining} other{remaining > 1 ? "s" : ""}</button></span>
        )}
        {" "}you both follow
      </p>
    </div>
  );
};

export default MutualFollowers;
