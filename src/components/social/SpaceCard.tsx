import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Radio, Headphones, LogIn, LogOut, Loader2, Bell, BellOff, Calendar, Clock, Share2 } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { useState } from "react";
import SpaceShareSheet from "./SpaceShareSheet";

interface SpaceCardProps {
  space: {
    id: string;
    host_id: string;
    title: string;
    status: string;
    listener_count: number;
    started_at: string;
    scheduled_at?: string | null;
    reminder_count?: number;
  };
  hostProfile?: { display_name?: string | null; avatar_url?: string | null } | null;
  index?: number;
  onJoinRoom?: (spaceId: string) => void;
}

const SpaceCard = ({ space, hostProfile, index = 0, onJoinRoom }: SpaceCardProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [joining, setJoining] = useState(false);
  const [togglingReminder, setTogglingReminder] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

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

  const { data: hasReminder = false } = useQuery({
    queryKey: ["space-reminder", space.id, user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { count } = await supabase
        .from("space_reminders" as any)
        .select("id", { count: "exact", head: true })
        .eq("space_id", space.id)
        .eq("user_id", user.id);
      return (count || 0) > 0;
    },
    enabled: !!user && space.status === "scheduled",
  });

  const handleToggleReminder = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) { toast.error("Sign in to set reminders"); return; }
    setTogglingReminder(true);
    try {
      if (hasReminder) {
        await supabase
          .from("space_reminders" as any)
          .delete()
          .eq("space_id", space.id)
          .eq("user_id", user.id);
        toast.success("Reminder removed");
      } else {
        await supabase.from("space_reminders" as any).insert({
          space_id: space.id,
          user_id: user.id,
        });
        toast.success("Reminder set! 🔔");
      }
      queryClient.invalidateQueries({ queryKey: ["space-reminder", space.id] });
      queryClient.invalidateQueries({ queryKey: ["spaces"] });
    } catch (err: any) {
      toast.error(err.message || "Failed");
    } finally {
      setTogglingReminder(false);
    }
  };

  const handleJoinLeave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) { toast.error("Sign in to join spaces"); return; }
    if (!isParticipant && onJoinRoom) {
      onJoinRoom(space.id);
      return;
    }
    setJoining(true);
    try {
      await supabase
        .from("space_participants")
        .update({ left_at: new Date().toISOString() })
        .eq("space_id", space.id)
        .eq("user_id", user.id)
        .is("left_at", null);
      toast.success("Left the space");
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

  const handleCardClick = () => {
    if (space.status === "scheduled") return;
    if (!user) { toast.error("Sign in to join spaces"); return; }
    if (onJoinRoom) onJoinRoom(space.id);
  };

  const hostName = hostProfile?.display_name || "Anonymous";
  const isHost = user?.id === space.host_id;
  const isLive = space.status === "live";
  const isScheduled = space.status === "scheduled";

  return (
    <>
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className={`glass rounded-xl p-3.5 space-y-2 transition-colors ${
        isScheduled ? "cursor-default border border-primary/10" : "cursor-pointer hover:bg-accent/20"
      }`}
      onClick={handleCardClick}
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
            {isScheduled && (
              <span className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                <Calendar className="w-2.5 h-2.5" />
                SCHEDULED
              </span>
            )}
            <p className="text-[9px] text-muted-foreground">
              {isScheduled && space.scheduled_at
                ? format(new Date(space.scheduled_at), "MMM d, h:mm a")
                : formatDistanceToNow(new Date(space.started_at), { addSuffix: true })}
            </p>
          </div>
          <h4 className="text-sm font-bold mt-0.5 line-clamp-2">{space.title}</h4>
          <p className="text-[10px] text-muted-foreground mt-0.5">Hosted by {hostName}</p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          {isLive && (
            <span className="flex items-center gap-1">
              <Headphones className="w-3 h-3" />
              {space.listener_count} listening
            </span>
          )}
          {isScheduled && (
            <span className="flex items-center gap-1">
              <Bell className="w-3 h-3" />
              {space.reminder_count || 0} reminder{(space.reminder_count || 0) !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Share button - always visible */}
          <button
            onClick={(e) => { e.stopPropagation(); setShareOpen(true); }}
            className="px-2.5 py-1.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground text-[10px] font-semibold flex items-center gap-1 transition-colors"
          >
            <Share2 className="w-3 h-3" />
          </button>
          {isScheduled && (
            <button
              onClick={handleToggleReminder}
              disabled={togglingReminder}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-colors ${
                hasReminder
                  ? "bg-primary/10 text-primary hover:bg-destructive/10 hover:text-destructive"
                  : "bg-primary text-primary-foreground"
              }`}
            >
              {togglingReminder ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : hasReminder ? (
                <><BellOff className="w-3 h-3" /> Remove Reminder</>
              ) : (
                <><Bell className="w-3 h-3" /> Set Reminder</>
              )}
            </button>
          )}
          {isHost && isScheduled && (
            <button
              onClick={async (e) => {
                e.stopPropagation();
                // Go live now
                const { error } = await supabase
                  .from("spaces" as any)
                  .update({ status: "live", started_at: new Date().toISOString() })
                  .eq("id", space.id);
                if (error) { toast.error("Failed"); return; }
                queryClient.invalidateQueries({ queryKey: ["spaces"] });
                toast.success("Space is now live! 🎙️");
              }}
              className="px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-[10px] font-semibold hover:bg-destructive/20 transition-colors flex items-center gap-1"
            >
              <Radio className="w-3 h-3" /> Go Live Now
            </button>
          )}
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

    <SpaceShareSheet
      open={shareOpen}
      onClose={() => setShareOpen(false)}
      spaceId={space.id}
      spaceTitle={space.title}
      hostName={hostName}
      isLive={isLive}
    />
    </>
  );
};

export default SpaceCard;
