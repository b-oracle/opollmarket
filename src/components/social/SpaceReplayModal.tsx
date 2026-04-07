import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { X, Play, Pause, RotateCcw, RotateCw, Users, MessageCircle, Headphones, Mic, Crown, Shield, Trash2, Loader2, Share2, Minimize2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { useSpaceReplay } from "@/hooks/useSpaceReplay";

const formatTime = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

const SPEEDS = [1, 1.5, 2];

const SpaceReplayModal = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const {
    space,
    hostProfile,
    isExpanded,
    isPlaying,
    currentTime,
    duration,
    progress,
    togglePlay,
    seek,
    skip,
    setSpeed,
    closeReplay,
    minimize,
    audioRef,
  } = useSpaceReplay();

  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [activeTab, setActiveTab] = useState("chat");
  const [deleting, setDeleting] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState<{ id: string; emoji: string; x: number }[]>([]);

  const isHost = user?.id === space?.host_id;

  // Fetch participants
  const { data: participants = [] } = useQuery({
    queryKey: ["space-replay-participants", space?.id],
    queryFn: async () => {
      if (!space) return [];
      const { data, error } = await supabase
        .from("space_participants")
        .select("user_id, role, joined_at, left_at")
        .eq("space_id", space.id);
      if (error) throw error;
      if (!data || data.length === 0) return [];
      const userIds = [...new Set(data.map((p: any) => p.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, verification_level")
        .in("id", userIds);
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
      return data.map((p: any) => ({ ...p, profile: profileMap.get(p.user_id) || null }));
    },
    enabled: !!space && isExpanded,
  });

  // Fetch messages
  const { data: messages = [] } = useQuery({
    queryKey: ["space-replay-messages", space?.id],
    queryFn: async () => {
      if (!space) return [];
      const { data, error } = await supabase
        .from("space_messages")
        .select("*")
        .eq("space_id", space.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      if (!data || data.length === 0) return [];
      const userIds = [...new Set(data.map((m: any) => m.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", userIds);
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
      return data.map((m: any) => ({ ...m, profile: profileMap.get(m.user_id) || null }));
    },
    enabled: !!space && isExpanded,
  });

  const spaceStartMs = space ? new Date(space.started_at).getTime() : 0;

  const cycleSpeed = useCallback(() => {
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    setSpeed(SPEEDS[next]);
  }, [speedIdx, setSpeed]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seek(pct);
  }, [seek]);

  // Auto-scroll chat to current playback position
  useEffect(() => {
    if (activeTab !== "chat" || !isPlaying || messages.length === 0) return;
    const playbackMs = spaceStartMs + currentTime * 1000;
    let lastIdx = -1;
    for (let i = 0; i < messages.length; i++) {
      if (new Date(messages[i].created_at).getTime() <= playbackMs) lastIdx = i;
      else break;
    }
    if (lastIdx >= 0 && chatScrollRef.current) {
      const el = chatScrollRef.current.querySelector(`[data-msg-idx="${lastIdx}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentTime, activeTab, isPlaying, messages, spaceStartMs]);

  // Floating reactions
  useEffect(() => {
    if (!isPlaying || messages.length === 0) return;
    const playbackMs = spaceStartMs + currentTime * 1000;
    const window = 1500;
    messages.forEach((msg: any) => {
      const msgMs = new Date(msg.created_at).getTime();
      if (msgMs > playbackMs - window && msgMs <= playbackMs) {
        const reactions = msg.reactions;
        if (reactions && typeof reactions === "object") {
          Object.keys(reactions).forEach((emoji) => {
            const id = `${msg.id}-${emoji}-${Math.floor(playbackMs / 1000)}`;
            setFloatingReactions((prev) => {
              if (prev.find((r) => r.id === id)) return prev;
              return [...prev.slice(-8), { id, emoji, x: Math.random() * 80 + 10 }];
            });
          });
        }
      }
    });
  }, [currentTime, isPlaying, messages, spaceStartMs]);

  // Clear old reactions
  useEffect(() => {
    if (floatingReactions.length === 0) return;
    const timer = setTimeout(() => setFloatingReactions((prev) => prev.slice(1)), 2000);
    return () => clearTimeout(timer);
  }, [floatingReactions]);

  const handleDelete = async () => {
    if (!user || !space || user.id !== space.host_id) return;
    if (!confirm("Delete this recording?")) return;
    setDeleting(true);
    try {
      if (audioRef.current) { audioRef.current.pause(); }
      const { error } = await supabase
        .from("spaces")
        .update({ is_recorded: false, recording_url: null } as any)
        .eq("id", space.id)
        .eq("host_id", user.id);
      if (error) {
        console.error("Delete recording error:", error);
        toast.error("Failed to delete: " + error.message);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["spaces"] });
      queryClient.invalidateQueries({ queryKey: ["space-replay-participants"] });
      toast.success("Recording deleted");
      closeReplay();
    } catch (e: any) { toast.error("Failed to delete: " + (e?.message || "Unknown error")); }
    finally { setDeleting(false); }
  };

  const getRoleIcon = (role: string) => {
    if (role === "host") return <Crown className="w-3 h-3 text-yellow-500" />;
    if (role === "co_host") return <Shield className="w-3 h-3 text-primary" />;
    if (role === "speaker") return <Mic className="w-3 h-3 text-green-500" />;
    return <Headphones className="w-3 h-3 text-muted-foreground" />;
  };

  const getRoleLabel = (role: string) => {
    if (role === "host") return "Host";
    if (role === "co_host") return "Co-host";
    if (role === "speaker") return "Speaker";
    return "Listener";
  };

  // Deduplicate participants
  const roleOrder: Record<string, number> = { host: 0, co_host: 1, speaker: 2, listener: 3 };
  const uniqueParticipants = Object.values(
    participants.reduce((acc: any, p: any) => {
      if (!acc[p.user_id] || (roleOrder[p.role] || 9) < (roleOrder[acc[p.user_id].role] || 9)) {
        acc[p.user_id] = p;
      }
      return acc;
    }, {} as Record<string, any>)
  ).sort((a: any, b: any) => (roleOrder[a.role] || 9) - (roleOrder[b.role] || 9));

  const handleShare = useCallback(async () => {
    if (!space) return;
    const url = `${window.location.origin}/feed?space=${space.id}`;
    if (navigator.share) {
      try { await navigator.share({ title: space.title, url }); } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied!");
    }
  }, [space]);

  if (!space || !isExpanded) return null;

  const hostName = hostProfile?.display_name || "Anonymous";
  const playbackMs = spaceStartMs + currentTime * 1000;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-x-0 top-0 z-[60] bg-background/95 backdrop-blur-sm flex flex-col overflow-hidden"
        style={{ paddingTop: "var(--safe-top, 0px)", bottom: "var(--content-bottom, 4rem)", overscrollBehavior: "contain", touchAction: "none" }}
      >
        {/* Floating reactions */}
        <AnimatePresence>
          {floatingReactions.map((r) => (
            <motion.span
              key={r.id}
              initial={{ opacity: 1, y: 0 }}
              animate={{ opacity: 0, y: -120 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2 }}
              className="fixed text-2xl pointer-events-none z-[60]"
              style={{ bottom: "160px", left: `${r.x}%` }}
            >
              {r.emoji}
            </motion.span>
          ))}
        </AnimatePresence>

        {/* Header */}
        <div className="flex items-center gap-3 px-3 py-2.5 border-b border-border shrink-0">
          <button onClick={minimize} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-accent transition-colors shrink-0">
            <Minimize2 className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[9px] px-1.5 py-0 shrink-0">
                <Play className="w-2.5 h-2.5 mr-0.5" /> REPLAY
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                {uniqueParticipants.length} participant{uniqueParticipants.length !== 1 ? "s" : ""}
              </span>
            </div>
            <h3 className="text-sm font-bold mt-0.5 line-clamp-1">{space.title}</h3>
            <p className="text-[10px] text-muted-foreground">Hosted by {hostName}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={handleShare} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-accent transition-colors">
              <Share2 className="w-3.5 h-3.5" />
            </button>
            {isHost && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="w-8 h-8 rounded-full bg-destructive/10 text-destructive flex items-center justify-center hover:bg-destructive/20 transition-colors"
              >
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            )}
            <button onClick={closeReplay} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-accent transition-colors shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabbed content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden min-h-0">
          <TabsList className="mx-3 mt-2 shrink-0">
            <TabsTrigger value="chat" className="text-xs gap-1">
              <MessageCircle className="w-3 h-3" /> Chat ({messages.length})
            </TabsTrigger>
            <TabsTrigger value="participants" className="text-xs gap-1">
              <Users className="w-3 h-3" /> People ({uniqueParticipants.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chat" className="flex-1 overflow-hidden m-0 p-0 min-h-0">
            <ScrollArea className="h-full">
              <div ref={chatScrollRef} className="px-3 py-2 space-y-1.5">
                {messages.length === 0 ? (
                  <p className="text-center text-muted-foreground text-xs py-8">No chat messages in this space</p>
                ) : (
                  messages.map((msg: any, idx: number) => {
                    const msgMs = new Date(msg.created_at).getTime();
                    const offsetSec = Math.max(0, (msgMs - spaceStartMs) / 1000);
                    const isPast = msgMs <= playbackMs;
                    const isHighlight = isPast && msgMs > playbackMs - 3000;
                    const profile = msg.profile;
                    const name = profile?.display_name || "Anonymous";
                    return (
                      <div
                        key={msg.id}
                        data-msg-idx={idx}
                        className={`flex items-start gap-2 rounded-lg px-2 py-1.5 transition-colors ${
                          isHighlight ? "bg-primary/10" : isPast ? "opacity-70" : "opacity-30"
                        }`}
                      >
                        <Avatar className="w-6 h-6 shrink-0">
                          {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} /> : null}
                          <AvatarFallback className="text-[9px]">{name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-semibold truncate">{name}</span>
                            <span className="text-[9px] text-muted-foreground shrink-0">{formatTime(offsetSec)}</span>
                          </div>
                          <p className="text-xs break-words">{msg.content}</p>
                          {msg.reactions && typeof msg.reactions === "object" && Object.keys(msg.reactions).length > 0 && (
                            <div className="flex gap-1 mt-0.5 flex-wrap">
                              {Object.entries(msg.reactions).map(([emoji, users]: any) => (
                                <span key={emoji} className="text-[10px] bg-muted rounded px-1 py-0.5">
                                  {emoji} {Array.isArray(users) ? users.length : ""}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="participants" className="flex-1 overflow-hidden m-0 p-0 min-h-0">
            <ScrollArea className="h-full">
              <div className="px-3 py-2 space-y-1">
                {uniqueParticipants.map((p: any) => {
                  const profile = p.profile;
                  const name = profile?.display_name || "Anonymous";
                  return (
                    <div key={p.user_id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-accent/30 transition-colors">
                      <Avatar className="w-7 h-7">
                        {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} /> : null}
                        <AvatarFallback className="text-[10px]">{name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">{name}</p>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          {getRoleIcon(p.role)}
                          <span>{getRoleLabel(p.role)}</span>
                        </div>
                      </div>
                      {profile?.verification_level && profile.verification_level !== "none" && (
                        <Badge variant="outline" className="text-[8px] px-1 py-0">
                          {profile.verification_level === "gold" ? "🥇" : "✓"}
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        {/* Audio Player */}
        <div className="border-t border-border bg-card px-3 py-2 pb-3 shrink-0">
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="w-9 text-right tabular-nums">{formatTime(currentTime)}</span>
            <div className="flex-1 h-1.5 rounded-full bg-muted cursor-pointer relative group" onClick={handleSeek}>
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-primary border-2 border-background shadow opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ left: `${progress}%`, transform: `translate(-50%, -50%)` }}
              />
            </div>
            <span className="w-9 tabular-nums">{formatTime(duration)}</span>
          </div>

          <div className="flex items-center justify-between mt-1.5">
            <div className="w-10 flex justify-center">
              <button
                onClick={cycleSpeed}
                className="w-8 h-8 rounded-full bg-muted text-foreground text-[10px] font-bold flex items-center justify-center hover:bg-accent transition-colors"
              >
                {SPEEDS[speedIdx]}x
              </button>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={() => skip(-15)} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center hover:bg-accent transition-colors">
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={togglePlay}
                className="w-11 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:opacity-90 transition-opacity"
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
              </button>
              <button onClick={() => skip(15)} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center hover:bg-accent transition-colors">
                <RotateCw className="w-4 h-4" />
              </button>
            </div>
            <div className="w-10" />
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default SpaceReplayModal;
