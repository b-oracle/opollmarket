import { getAvatarInitials } from "@/lib/utils";
import NftBadge, { type VerificationLevel } from "@/components/NftBadge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useActiveSpace } from "@/hooks/useActiveSpace";
import { useSpacePresence } from "@/hooks/useSpacePresence";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Radio, Headphones, LogIn, LogOut, Loader2, Bell, BellOff, Calendar, Share2, Play, Pause, Trash2, RotateCcw, RotateCw, Users, TrendingUp, MessageCircle, Clock, Pencil, Check, X, Lock, Megaphone, XCircle } from "lucide-react";
import BroadcastSpaceModal from "./BroadcastSpaceModal";
import { useSpaceReplay } from "@/hooks/useSpaceReplay";
import { formatDistanceToNow, format } from "date-fns";
import { useState, useRef, useEffect } from "react";
import SpaceShareSheet from "./SpaceShareSheet";
import { resolveAvatarUrl } from "@/lib/avatarUrl";

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
    is_recorded?: boolean;
    recording_url?: string | null;
    is_private?: boolean;
  };
  hostProfile?: { display_name?: string | null; avatar_url?: string | null; verification_level?: string | null } | null;
  index?: number;
  onJoinRoom?: (spaceId: string) => void;
}

const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

const SpaceCard = ({ space, hostProfile, index = 0, onJoinRoom }: SpaceCardProps) => {
  const { user } = useAuth();
  const { activeSpace, maximize } = useActiveSpace();
  const queryClient = useQueryClient();
  const [joining, setJoining] = useState(false);
  const [togglingReminder, setTogglingReminder] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState(space.title);
  const [savingTitle, setSavingTitle] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const { openReplay } = useSpaceReplay();
  const [cancelling, setCancelling] = useState(false);
  const isHost = user?.id === space.host_id;
  const isLive = space.status === "live";
  const isScheduled = space.status === "scheduled";
  const isEnded = space.status === "ended";
  const isActiveRoom = activeSpace?.id === space.id;
  const { data: livePresence } = useSpacePresence(space.id, isLive && !!user);
  const isParticipant = isActiveRoom || livePresence?.joined === true;
  const listenerCount = livePresence?.participantCount ?? space.listener_count;

  const handleSaveCardTitle = async () => {
    const trimmed = editTitleValue.trim();
    if (!trimmed || trimmed === space.title) { setEditingTitle(false); return; }
    setSavingTitle(true);
    const { error } = await supabase.rpc("host_update_space_title" as any, {
      _space_id: space.id,
      _new_title: trimmed,
    });
    if (error) { toast.error(error.message || "Failed to update title"); }
    else { queryClient.invalidateQueries({ queryKey: ["spaces"] }); toast.success("Title updated"); }
    setSavingTitle(false);
    setEditingTitle(false);
  };

  const handleCancelSpace = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || user.id !== space.host_id) return;
    if (!confirm("Cancel this scheduled space? Users with reminders will be notified.")) return;
    setCancelling(true);
    try {
      const { error } = await supabase.rpc("host_cancel_scheduled_space" as any, {
        _space_id: space.id,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["spaces"] });
      toast.success("Space cancelled");
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel");
    } finally {
      setCancelling(false);
    }
  };

  const isRecorded = space.status === "ended" && space.is_recorded && space.recording_url;

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handlePlayPause = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!space.recording_url) {
      toast.error("Recording URL not available");
      return;
    }

    if (!audioRef.current) {
      const { getPlayableRecordingUrl } = await import("@/lib/spaceRecordingUrl");
      const playable = await getPlayableRecordingUrl(space.recording_url);
      if (!playable) {
        toast.error("Recording is unavailable");
        return;
      }
      const audio = new Audio();
      audio.crossOrigin = "anonymous";
      audio.preload = "metadata";
      audio.src = playable;
      audioRef.current = audio;
      audio.addEventListener("timeupdate", () => {
        if (audio.duration && isFinite(audio.duration)) {
          setProgress((audio.currentTime / audio.duration) * 100);
          setCurrentTime(audio.currentTime);
        }
      });
      audio.addEventListener("loadedmetadata", () => {
        if (isFinite(audio.duration)) setDuration(audio.duration);
      });
      audio.addEventListener("ended", () => {
        setIsPlaying(false);
        setProgress(0);
        setCurrentTime(0);
      });
      audio.addEventListener("error", () => {
        const code = audio.error?.code;
        const msg = audio.error?.message || "Unknown error";
        console.error("Recording playback error:", code, msg, space.recording_url);
        if (code === 4) {
          toast.error("This recording format is not supported on your browser");
        } else {
          toast.error("Failed to load recording");
        }
        setIsPlaying(false);
      });
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch((err) => {
        console.error("Recording play() error:", err);
        toast.error("Failed to play recording");
      });
      setIsPlaying(true);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!audioRef.current || !audioRef.current.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioRef.current.currentTime = pct * audioRef.current.duration;
    setProgress(pct * 100);
  };

  const handleDeleteRecording = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || user.id !== space.host_id) return;
    setDeleting(true);
    try {
      // Stop playback
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
        setIsPlaying(false);
      }
      const { error } = await supabase.rpc("host_clear_space_recording" as any, {
        _space_id: space.id,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["spaces"] });
      toast.success("Recording deleted");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

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
    if (isActiveRoom) {
      maximize();
      return;
    }
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
    if (!user || user.id !== space.host_id) return;
    if (!confirm("End this space for everyone?")) return;
    try {
      const { data, error } = await supabase.functions.invoke("livekit-token", {
        body: { space_id: space.id, action: "end_space" },
      });
      if (error || (data as any)?.error) {
        toast.error((data as any)?.error || error?.message || "Failed to end");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["spaces"] });
      queryClient.invalidateQueries({ queryKey: ["space-participant", space.id] });
      toast.success("Space ended");
    } catch (err: any) {
      toast.error(err?.message || "Failed to end");
    }
  };

  const handleCardClick = () => {
    if (space.status === "scheduled") return;
    if (isRecorded) {
      openReplay(space, hostProfile);
      return;
    }
    if (!user) { toast.error("Sign in to join spaces"); return; }
    if (isActiveRoom) {
      maximize();
      return;
    }
    if (onJoinRoom) onJoinRoom(space.id);
  };

  const hostName = hostProfile?.display_name || "Anonymous";
  const hostVerification = ((hostProfile?.verification_level as VerificationLevel) || "none") as VerificationLevel;

  const { data: analytics } = useQuery({
    queryKey: ["space-analytics", space.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_space_analytics", { _space_id: space.id });
      if (error) throw error;
      return data?.[0] || null;
    },
    enabled: isHost && (isLive || isEnded),
    staleTime: 30000,
  });

  return (
    <>
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className={`glass rounded-xl p-3.5 space-y-2 transition-colors ${
        isScheduled ? "cursor-default border border-primary/10" : isRecorded ? "cursor-pointer border border-primary/10 hover:bg-accent/20" : "cursor-pointer hover:bg-accent/20"
      }`}
      onClick={handleCardClick}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 overflow-hidden flex items-center justify-center shrink-0">
          {hostProfile?.avatar_url ? (
            <img src={resolveAvatarUrl(hostProfile.avatar_url)} alt={hostName} className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm font-bold text-primary">{getAvatarInitials(hostName)}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
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
            {isRecorded && (
              <span className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-accent text-accent-foreground">
                <Play className="w-2.5 h-2.5" />
                REPLAY
              </span>
            )}
            {space.is_private && (
              <span className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                <Lock className="w-2.5 h-2.5" />
                PRIVATE
              </span>
            )}
            <p className="text-[9px] text-muted-foreground">
              {isScheduled && space.scheduled_at
                ? format(new Date(space.scheduled_at), "MMM d, h:mm a")
                : formatDistanceToNow(new Date(space.started_at), { addSuffix: true })}
            </p>
          </div>
          {editingTitle ? (
            <div className="flex items-center gap-1.5 mt-0.5" onClick={(e) => e.stopPropagation()}>
              <input
                autoFocus
                value={editTitleValue}
                onChange={(e) => setEditTitleValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveCardTitle(); if (e.key === "Escape") setEditingTitle(false); }}
                className="text-sm font-bold bg-muted/50 border border-border rounded px-2 py-0.5 flex-1 min-w-0 outline-none focus:ring-1 focus:ring-primary"
                maxLength={120}
              />
              <button onClick={handleSaveCardTitle} disabled={savingTitle} className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => { setEditingTitle(false); setEditTitleValue(space.title); }} className="w-6 h-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center hover:bg-muted/80">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <h4 className="text-sm font-bold mt-0.5 line-clamp-2 flex items-center gap-1.5">
              {space.title}
              {isHost && isScheduled && (
                <button onClick={(e) => { e.stopPropagation(); setEditTitleValue(space.title); setEditingTitle(true); }} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                  <Pencil className="w-3 h-3" />
                </button>
              )}
            </h4>
          )}
          <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
            <span>Hosted by {hostName}</span>
            {hostVerification !== "none" && <NftBadge level={hostVerification} size={11} />}
          </p>
        </div>
      </div>

      {/* Recorded badge - tap to expand */}
      {isRecorded && (
        <div className="flex items-center gap-2 text-[10px] text-primary pt-1">
          <Play className="w-3 h-3" />
          <span className="font-medium">Tap to expand replay</span>
        </div>
      )}

      {/* Footer */}
      <div className="flex flex-col gap-2">
        {/* Stats row */}
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          {isLive && (
            <span className="flex items-center gap-1">
              <Headphones className="w-3 h-3" />
              {listenerCount} listening
            </span>
          )}
          {isScheduled && (
            <span className="flex items-center gap-1">
              <Bell className="w-3 h-3" />
              {space.reminder_count || 0} reminder{(space.reminder_count || 0) !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {/* Actions row - wraps on small screens */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Share button */}
          <button
            onClick={(e) => { e.stopPropagation(); setShareOpen(true); }}
            className="px-2.5 py-1.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground text-[10px] font-semibold flex items-center gap-1 transition-colors"
          >
            <Share2 className="w-3 h-3" />
          </button>
          {/* Broadcast button */}
          {(isScheduled || isLive) && (
            <button
              onClick={(e) => { e.stopPropagation(); setBroadcastOpen(true); }}
              className="px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 text-[10px] font-semibold flex items-center gap-1 transition-colors"
              title="Broadcast to all users"
            >
              <Megaphone className="w-3 h-3" />
            </button>
          )}
          {isScheduled && (
            <button
              onClick={handleToggleReminder}
              disabled={togglingReminder}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-colors whitespace-nowrap ${
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
                <><Bell className="w-3 h-3" /> Remind Me</>
              )}
            </button>
          )}
          {isHost && isScheduled && (
            <>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  const { error } = await supabase.rpc("host_go_live_scheduled_space" as any, {
                    _space_id: space.id,
                  });
                  if (error) { toast.error(error.message || "Failed to go live"); return; }
                  queryClient.invalidateQueries({ queryKey: ["spaces"] });
                  toast.success("Space is now live! 🎙️");
                }}
                className="px-2.5 py-1.5 rounded-lg bg-destructive/10 text-destructive text-[10px] font-semibold hover:bg-destructive/20 transition-colors flex items-center gap-1 whitespace-nowrap"
              >
                <Radio className="w-3 h-3" /> Go Live
              </button>
              <button
                onClick={handleCancelSpace}
                disabled={cancelling}
                className="px-2.5 py-1.5 rounded-lg bg-muted text-muted-foreground text-[10px] font-semibold hover:bg-destructive/10 hover:text-destructive transition-colors flex items-center gap-1 whitespace-nowrap"
              >
                {cancelling ? <Loader2 className="w-3 h-3 animate-spin" /> : <><XCircle className="w-3 h-3" /> Cancel</>}
              </button>
            </>
          )}
          {isHost && isLive && (
            <button
              onClick={handleEndSpace}
              className="px-2.5 py-1.5 rounded-lg bg-destructive/10 text-destructive text-[10px] font-semibold hover:bg-destructive/20 transition-colors whitespace-nowrap"
            >
              End Space
            </button>
          )}
          {isLive && !isHost && (
            <button
              onClick={handleJoinLeave}
              disabled={joining}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-colors whitespace-nowrap ${
                isParticipant
                  ? "bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  : "bg-primary text-primary-foreground"
              }`}
            >
              {joining ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : isActiveRoom ? (
                <><Headphones className="w-3 h-3" /> In Room</>
              ) : isParticipant ? (
                <><LogOut className="w-3 h-3" /> Leave</>
              ) : (
                <><LogIn className="w-3 h-3" /> Join</>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Host Analytics */}
      {isHost && (isLive || isEnded) && analytics && (
        <div className="flex items-center gap-3 pt-1 border-t border-border/50 text-[9px] text-muted-foreground">
          <span className="flex items-center gap-1" title="Unique listeners">
            <Users className="w-3 h-3" />
            {analytics.total_unique_listeners}
          </span>
          <span className="flex items-center gap-1" title="Peak concurrent">
            <TrendingUp className="w-3 h-3" />
            {analytics.peak_listeners}
          </span>
          <span className="flex items-center gap-1" title="Messages">
            <MessageCircle className="w-3 h-3" />
            {analytics.total_messages}
          </span>
          <span className="flex items-center gap-1" title="Duration">
            <Clock className="w-3 h-3" />
            {Number(analytics.duration_minutes) >= 60
              ? `${Math.floor(Number(analytics.duration_minutes) / 60)}h ${Math.round(Number(analytics.duration_minutes) % 60)}m`
              : `${Math.round(Number(analytics.duration_minutes))}m`}
          </span>
        </div>
      )}
    </motion.div>

    <SpaceShareSheet
      open={shareOpen}
      onClose={() => setShareOpen(false)}
      spaceId={space.id}
      spaceTitle={space.title}
      hostName={hostName}
      isLive={isLive}
      scheduledAt={space.scheduled_at || space.started_at}
    />
    <BroadcastSpaceModal
      open={broadcastOpen}
      onClose={() => setBroadcastOpen(false)}
      spaceId={space.id}
      spaceTitle={space.title}
    />
    </>
  );
};

export default SpaceCard;
