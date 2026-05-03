import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, Radio, Loader2, Calendar, Clock, ShieldAlert, Lock, Search, UserPlus, UserMinus, Tv } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import MarketTagSelector, { type MarketTag } from "./MarketTagSelector";
import { optimizedImageUrl } from "@/lib/optimizedImage";
import { isYouTubeUrl, isStreamYardUrl } from "@/components/YouTubeEmbed";

interface CreateSpaceModalProps {
  open: boolean;
  onClose: () => void;
}

interface InviteUser {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

const CreateSpaceModal = ({ open, onClose }: CreateSpaceModalProps) => {
  const { user } = useAuth();
  const { isFeatureEnabled } = useFeatureToggles();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [mode, setMode] = useState<"live" | "scheduled">("live");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [taggedMarkets, setTaggedMarkets] = useState<MarketTag[]>([]);
  const [verificationLevel, setVerificationLevel] = useState<string | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [invitees, setInvitees] = useState<InviteUser[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<InviteUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [streamUrl, setStreamUrl] = useState("");
  const [enableStream, setEnableStream] = useState(false);
  const [streamPlatform, setStreamPlatform] = useState<"youtube" | "streamyard">("youtube");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("verification_level")
      .eq("id", user.id)
      .single()
      .then(({ data }) => setVerificationLevel(data?.verification_level ?? "none"));
  }, [user]);

  // Search users for invite
  useEffect(() => {
    if (!searchQuery.trim() || !user) { setSearchResults([]); return; }
    const timeout = setTimeout(async () => {
      setSearching(true);
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .neq("id", user.id)
        .ilike("display_name", `%${searchQuery.trim()}%`)
        .limit(10);
      setSearchResults((data || []).filter((u) => !invitees.some((i) => i.id === u.id)));
      setSearching(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, user, invitees]);

  if (!user) return null;

  const isVerified = verificationLevel === "blue" || verificationLevel === "gold";

  const handleCreate = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;

    if (mode === "scheduled") {
      if (!scheduledDate || !scheduledTime) {
        toast.error("Please set a date and time");
        return;
      }
      const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`);
      if (scheduledAt <= new Date()) {
        toast.error("Scheduled time must be in the future");
        return;
      }
    }

    setCreating(true);
    try {
      const insertData: any = {
        host_id: user.id,
        title: trimmed,
        tagged_market_ids: taggedMarkets.map((m) => m.id),
        is_private: isPrivate,
        stream_url: streamUrl.trim() || null,
      };

      if (mode === "scheduled") {
        insertData.status = "scheduled";
        insertData.scheduled_at = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
      }

      const { data: space, error } = await supabase
        .from("spaces" as any)
        .insert(insertData)
        .select("id")
        .single();
      if (error) throw error;

      const spaceId = (space as any).id;

      // Insert invites for private space
      if (isPrivate && invitees.length > 0) {
        const inviteRows = invitees.map((u) => ({
          space_id: spaceId,
          inviter_id: user.id,
          invitee_id: u.id,
        }));
        await supabase.from("space_invites" as any).insert(inviteRows);

        // Notifications are now handled automatically by a database trigger on space_invites
      }

      if (mode === "live") {
        await supabase.from("space_participants").insert({
          space_id: spaceId,
          user_id: user.id,
          role: "host",
        });
        toast.success("Space started! 🎙️");
      } else {
        toast.success("Space scheduled! 📅");
      }

      queryClient.invalidateQueries({ queryKey: ["spaces"] });
      setTitle("");
      setScheduledDate("");
      setScheduledTime("");
      setTaggedMarkets([]);
      setMode("live");
      setIsPrivate(false);
      setInvitees([]);
      setSearchQuery("");
      setStreamUrl("");
      setEnableStream(false);
      setStreamPlatform("youtube");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to create space");
    } finally {
      setCreating(false);
    }
  };

  const now = new Date();
  const minDate = now.toISOString().split("T")[0];
  const minTime = scheduledDate === minDate
    ? `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
    : "00:00";

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/60 backdrop-blur-sm z-[70]"
            onClick={onClose}
          />
          <div className="fixed inset-0 z-[71] flex items-end lg:items-center lg:justify-center pointer-events-none">
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.98 }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="pointer-events-auto w-full bg-background p-6 space-y-4 rounded-t-2xl border-t border-border lg:max-w-md lg:rounded-2xl lg:border lg:shadow-2xl max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Radio className="w-5 h-5 text-primary" />
                  {mode === "live" ? "Start a Space" : "Schedule a Space"}
                </h3>
                <button onClick={onClose} className="w-8 h-8 rounded-full glass flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Mode toggle */}
              <div className="flex gap-2 p-1 bg-muted/50 rounded-lg">
                <button
                  onClick={() => setMode("live")}
                  className={`flex-1 py-2 rounded-md text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                    mode === "live" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Radio className="w-3.5 h-3.5" />
                  Go Live Now
                </button>
                <button
                  onClick={() => setMode("scheduled")}
                  className={`flex-1 py-2 rounded-md text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                    mode === "scheduled" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  Schedule
                </button>
              </div>

              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What do you want to talk about?"
                maxLength={100}
                className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
              />

              <MarketTagSelector selected={taggedMarkets} onChange={setTaggedMarkets} max={10} />

              {/* Enable Live Stream toggle */}
              <button
                onClick={() => { setEnableStream(!enableStream); if (enableStream) { setStreamUrl(""); } }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                  enableStream ? "bg-primary/10 border-primary/30 text-primary" : "bg-muted/50 border-border text-muted-foreground"
                }`}
              >
                <Tv className={`w-4 h-4 ${enableStream ? "text-primary" : ""}`} />
                <div className="text-left flex-1">
                  <p className="text-sm font-semibold">Enable Live Stream</p>
                  <p className="text-[10px] opacity-70">Embed a YouTube or StreamYard broadcast</p>
                </div>
                <div className={`w-10 h-6 rounded-full transition-colors relative ${enableStream ? "bg-primary" : "bg-muted"}`}>
                  <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${enableStream ? "translate-x-5" : "translate-x-1"}`} />
                </div>
              </button>

              {enableStream && (
                <div className="space-y-3">
                  {/* Platform picker */}
                  <div className="flex gap-2 p-1 bg-muted/50 rounded-lg">
                    <button
                      onClick={() => { setStreamPlatform("youtube"); setStreamUrl(""); }}
                      className={`flex-1 py-2 rounded-md text-xs font-semibold transition-colors ${
                        streamPlatform === "youtube" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      YouTube
                    </button>
                    <button
                      onClick={() => { setStreamPlatform("streamyard"); setStreamUrl(""); }}
                      className={`flex-1 py-2 rounded-md text-xs font-semibold transition-colors ${
                        streamPlatform === "streamyard" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      StreamYard
                    </button>
                  </div>

                  {/* Contextual URL input */}
                  <input
                    value={streamUrl}
                    onChange={(e) => setStreamUrl(e.target.value)}
                    placeholder={streamPlatform === "youtube" ? "https://youtube.com/watch?v=..." : "https://streamyard.com/watch/..."}
                    className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
                  />
                  {streamUrl.trim() && streamPlatform === "youtube" && !isYouTubeUrl(streamUrl) && (
                    <p className="text-[10px] text-destructive">Please enter a valid YouTube URL</p>
                  )}
                  {streamUrl.trim() && streamPlatform === "streamyard" && !isStreamYardUrl(streamUrl) && (
                    <p className="text-[10px] text-destructive">Please enter a valid StreamYard URL</p>
                  )}
                </div>
              )}

              {/* Private Space toggle */}
              <button
                onClick={() => setIsPrivate(!isPrivate)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                  isPrivate ? "bg-primary/10 border-primary/30 text-primary" : "bg-muted/50 border-border text-muted-foreground"
                }`}
              >
                <Lock className={`w-4 h-4 ${isPrivate ? "text-primary" : ""}`} />
                <div className="text-left flex-1">
                  <p className="text-sm font-semibold">Private Space</p>
                  <p className="text-[10px] opacity-70">Invite-only — only invited users can join</p>
                </div>
                <div className={`w-10 h-6 rounded-full transition-colors relative ${isPrivate ? "bg-primary" : "bg-muted"}`}>
                  <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${isPrivate ? "translate-x-5" : "translate-x-1"}`} />
                </div>
              </button>

              {/* Invite picker */}
              {isPrivate && (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search users to invite…"
                      className="w-full bg-muted/50 border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
                    />
                  </div>
                  {/* Search results */}
                  {searchQuery.trim() && (
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {searching && <p className="text-xs text-muted-foreground text-center py-2"><Loader2 className="w-3 h-3 animate-spin inline mr-1" />Searching…</p>}
                      {!searching && searchResults.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No users found</p>}
                      {searchResults.map((u) => (
                        <button
                          key={u.id}
                          onClick={() => {
                            setInvitees((prev) => [...prev, u]);
                            setSearchQuery("");
                            setSearchResults([]);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <div className="w-7 h-7 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0">
                            {u.avatar_url ? (
                              <img src={optimizedImageUrl(u.avatar_url, "avatar-sm")} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-xs font-bold">{(u.display_name || "?").charAt(0).toUpperCase()}</span>
                            )}
                          </div>
                          <span className="text-sm truncate flex-1 text-left">{u.display_name}</span>
                          <UserPlus className="w-3.5 h-3.5 text-primary shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Invited list */}
                  {invitees.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {invitees.map((u) => (
                        <span key={u.id} className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-full text-xs">
                          {u.display_name}
                          <button onClick={() => setInvitees((prev) => prev.filter((i) => i.id !== u.id))} className="hover:text-destructive">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {!isVerified && verificationLevel !== null && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>Only verified members (Blue or Gold tick) can host Spaces.</span>
                </div>
              )}

              {mode === "scheduled" && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
                      <Calendar className="w-3 h-3 shrink-0" /> Date
                    </label>
                    <input
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      min={minDate}
                      className="block w-full appearance-none bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
                      <Clock className="w-3 h-3 shrink-0" /> Time
                    </label>
                    <input
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      min={minTime}
                      className="block w-full appearance-none bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>
              )}

              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleCreate}
                disabled={creating || !title.trim() || !isVerified || (mode === "scheduled" && (!scheduledDate || !scheduledTime))}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {creating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : mode === "live" ? (
                  <Radio className="w-4 h-4" />
                ) : (
                  <Calendar className="w-4 h-4" />
                )}
                {mode === "live" ? "Go Live" : "Schedule Space"}
              </motion.button>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

export default CreateSpaceModal;
