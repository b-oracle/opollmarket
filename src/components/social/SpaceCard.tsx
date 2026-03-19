import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Radio, Users, Headphones, LogIn, LogOut, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";

interface SpaceCardProps {
  space: {
    id: string;
    host_id: string;
    title: string;
    status: string;
    listener_count: number;
    started_at: string;
  };
  hostProfile?: { display_name?: string | null; avatar_url?: string | null } | null;
  index?: number;
}

const SpaceCard = ({ space, hostProfile, index = 0 }: SpaceCardProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [joining, setJoining] = useState(false);

  const { data: isParticipant = false } = useQuery({
    queryKey: ["space-participant", space.id, user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { count } = await supabase
        .from("space_participants")
        .select("id", { count: "exact", head: true })
        .eq("space_id", space.id)
        .eq("user_id", user.id)
        .is("left_at", null);
      return (count || 0) > 0;
    },
    enabled: !!user,
  });

  const handleJoinLeave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) { toast.error("Sign in to join spaces"); return; }
    setJoining(true);
    try {
      if (isParticipant) {
        // Leave
        await supabase
          .from("space_participants")
          .update({ left_at: new Date().toISOString() })
          .eq("space_id", space.id)
          .eq("user_id", user.id)
          .is("left_at", null);
        toast.success("Left the space");
      } else {
        // Join
        await supabase.from("space_participants").upsert({
          space_id: space.id,
          user_id: user.id,
          role: "listener",
          left_at: null,
        }, { onConflict: "space_id,user_id" });
        toast.success("Joined the space! 🎧");
      }
      queryClient.invalidateQueries({ queryKey: ["space-participant", space.id] });
      queryClient.invalidateQueries({ queryKey: ["spaces"] });
    } catch (err: any) {
      toast.error(err.message || "Failed");
    } finally {
      setJoining(false);
    }
  };

  const handleEndSpace = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const { error } = await supabase
      .from("spaces")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", space.id);
    if (error) { toast.error("Failed to end"); return; }
    queryClient.invalidateQueries({ queryKey: ["spaces"] });
    toast.success("Space ended");
  };

  const hostName = hostProfile?.display_name || "Anonymous";
  const isHost = user?.id === space.host_id;
  const isLive = space.status === "live";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="glass rounded-xl p-3.5 space-y-2"
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 overflow-hidden flex items-center justify-center shrink-0">
          {hostProfile?.avatar_url ? (
            <img src={hostProfile.avatar_url} alt={hostName} className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm font-bold text-primary">{hostName.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {isLive && (
              <span className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-destructive/20 text-destructive">
                <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
                LIVE
              </span>
            )}
            <p className="text-[9px] text-muted-foreground">
              {formatDistanceToNow(new Date(space.started_at), { addSuffix: true })}
            </p>
          </div>
          <h4 className="text-sm font-bold mt-0.5 line-clamp-2">{space.title}</h4>
          <p className="text-[10px] text-muted-foreground mt-0.5">Hosted by {hostName}</p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Headphones className="w-3 h-3" />
            {space.listener_count} listening
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isHost && isLive && (
            <button
              onClick={handleEndSpace}
              className="px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-[10px] font-semibold hover:bg-destructive/20 transition-colors"
            >
              End Space
            </button>
          )}
          {isLive && !isHost && (
            <button
              onClick={handleJoinLeave}
              disabled={joining}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-colors ${
                isParticipant
                  ? "bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  : "bg-primary text-primary-foreground"
              }`}
            >
              {joining ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : isParticipant ? (
                <><LogOut className="w-3 h-3" /> Leave</>
              ) : (
                <><LogIn className="w-3 h-3" /> Join</>
              )}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default SpaceCard;
