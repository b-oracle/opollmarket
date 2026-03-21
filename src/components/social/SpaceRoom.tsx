import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Room,
  RoomEvent,
  Track,
  RemoteTrackPublication,
  Participant,
} from "livekit-client";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic,
  MicOff,
  PhoneOff,
  Hand,
  Users,
  Loader2,
  X,
  Volume2,
  UserPlus,
  UserMinus,
} from "lucide-react";
import NftBadge, { VerificationLevel } from "@/components/NftBadge";

interface SpaceRoomProps {
  spaceId: string;
  spaceTitle: string;
  hostId: string;
  onClose: () => void;
}

interface ParticipantInfo {
  identity: string;
  name: string;
  isSpeaking: boolean;
  isMuted: boolean;
  audioTrack: boolean;
  canPublish: boolean;
}

interface ProfileInfo {
  avatar_url: string | null;
  verification_level: VerificationLevel;
}

const SpaceRoom = ({ spaceId, spaceTitle, hostId, onClose }: SpaceRoomProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const roomRef = useRef<Room | null>(null);
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const [connecting, setConnecting] = useState(true);
  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(true);
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileInfo>>({});
  const [isHost, setIsHost] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [canPublish, setCanPublish] = useState(false);
  const [promoting, setPromoting] = useState<string | null>(null);

  // Attach audio for remote tracks
  const attachAudio = useCallback((publication: RemoteTrackPublication) => {
    if (publication.kind !== Track.Kind.Audio || !publication.track) return;
    const participantId = publication.track.sid;
    if (audioElementsRef.current.has(participantId)) return;

    const el = publication.track.attach();
    el.id = `audio-${participantId}`;
    el.style.display = "none";
    document.body.appendChild(el);
    audioElementsRef.current.set(participantId, el);
  }, []);

  const detachAudio = useCallback((publication: RemoteTrackPublication) => {
    if (publication.kind !== Track.Kind.Audio || !publication.track) return;
    const participantId = publication.track.sid;
    const el = audioElementsRef.current.get(participantId);
    if (el) {
      publication.track.detach(el);
      el.remove();
      audioElementsRef.current.delete(participantId);
    }
  }, []);

  // Cleanup all audio on unmount
  useEffect(() => {
    return () => {
      audioElementsRef.current.forEach((el) => el.remove());
      audioElementsRef.current.clear();
    };
  }, []);

  const updateParticipants = useCallback((room: Room) => {
    const all: ParticipantInfo[] = [];

    const addParticipant = (p: Participant) => {
      all.push({
        identity: p.identity,
        name: p.name || p.identity.slice(0, 8),
        isSpeaking: p.isSpeaking,
        isMuted: !p.isMicrophoneEnabled,
        audioTrack: p.audioTrackPublications.size > 0,
        canPublish: (p as any).permissions?.canPublish ?? false,
      });
    };

    addParticipant(room.localParticipant);
    room.remoteParticipants.forEach((p) => addParticipant(p));
    setParticipants(all);

    // Update local canPublish state
    const localPerms = (room.localParticipant as any).permissions;
    if (localPerms) {
      setCanPublish(localPerms.canPublish ?? false);
    }
  }, []);

  // Fetch profiles for all participants
  useEffect(() => {
    if (participants.length === 0) return;
    const ids = participants.map((p) => p.identity).filter((id) => !profiles[id]);
    if (ids.length === 0) return;

    const fetchProfiles = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, avatar_url, verification_level")
        .in("id", ids);
      if (data) {
        setProfiles((prev) => {
          const next = { ...prev };
          data.forEach((p) => {
            next[p.id] = {
              avatar_url: p.avatar_url,
              verification_level: (p.verification_level as VerificationLevel) || "none",
            };
          });
          return next;
        });
      }
    };
    fetchProfiles();
  }, [participants]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true },
    });
    roomRef.current = room;

    const normalizeLivekitUrl = (url: string) => {
      try {
        const parsed = new URL(url);
        if (parsed.protocol === "https:") parsed.protocol = "wss:";
        if (parsed.protocol === "http:") parsed.protocol = "ws:";
        return parsed.toString();
      } catch {
        return url;
      }
    };

    const connect = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("livekit-token", {
          body: { space_id: spaceId },
        });

        if (error || data?.error) {
          toast.error(data?.error || "Failed to get voice token");
          onClose();
          return;
        }

        if (cancelled) return;

        setIsHost(data.isHost);
        setCanPublish(data.isHost);

        // Audio track handling
        room.on(RoomEvent.TrackSubscribed, (track, pub) => {
          if (track.kind === Track.Kind.Audio) {
            const el = track.attach();
            el.style.display = "none";
            document.body.appendChild(el);
            audioElementsRef.current.set(track.sid, el);
          }
          updateParticipants(room);
        });

        room.on(RoomEvent.TrackUnsubscribed, (track) => {
          if (track.kind === Track.Kind.Audio) {
            const el = audioElementsRef.current.get(track.sid);
            if (el) {
              track.detach(el);
              el.remove();
              audioElementsRef.current.delete(track.sid);
            }
          }
          updateParticipants(room);
        });

        room.on(RoomEvent.ParticipantConnected, () => updateParticipants(room));
        room.on(RoomEvent.ParticipantDisconnected, () => updateParticipants(room));
        room.on(RoomEvent.TrackMuted, () => updateParticipants(room));
        room.on(RoomEvent.TrackUnmuted, () => updateParticipants(room));
        room.on(RoomEvent.ActiveSpeakersChanged, () => updateParticipants(room));
        room.on(RoomEvent.ParticipantPermissionsChanged, () => {
          updateParticipants(room);
          // If we just got publish permission, notify
          const perms = (room.localParticipant as any).permissions;
          if (perms?.canPublish && !canPublish) {
            setCanPublish(true);
            toast.success("You've been promoted to speaker! 🎙️");
          }
        });
        room.on(RoomEvent.Disconnected, () => {
          if (!cancelled) {
            setConnected(false);
            toast.info("Disconnected from space");
            onClose();
          }
        });

        const livekitUrl = normalizeLivekitUrl(data.url);
        await room.connect(livekitUrl, data.token);

        if (cancelled) {
          room.disconnect();
          return;
        }

        setConnected(true);
        setConnecting(false);

        // If host, enable mic
        if (data.isHost) {
          try {
            await room.localParticipant.setMicrophoneEnabled(true);
            setMuted(false);
          } catch {
            setMuted(true);
            toast.info("Joined muted. Enable microphone when ready.");
          }
        }

        updateParticipants(room);

        await supabase.from("space_participants").upsert(
          {
            space_id: spaceId,
            user_id: user.id,
            role: data.isHost ? "host" : "listener",
            left_at: null,
          },
          { onConflict: "space_id,user_id" }
        );
        queryClient.invalidateQueries({ queryKey: ["spaces"] });
      } catch (err: any) {
        if (!cancelled) {
          toast.error(err?.message || "Failed to connect to voice room");
          console.error("LiveKit connect error:", err);
          onClose();
        }
      }
    };

    connect();

    return () => {
      cancelled = true;
      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
      }
    };
  }, [user, spaceId]);

  const toggleMute = async () => {
    if (!roomRef.current) return;
    const newMuted = !muted;
    try {
      await roomRef.current.localParticipant.setMicrophoneEnabled(!newMuted);
      setMuted(newMuted);
    } catch {
      toast.error("Microphone access denied");
    }
  };

  const handleLeave = async () => {
    if (roomRef.current) roomRef.current.disconnect();
    if (user) {
      await supabase
        .from("space_participants")
        .update({ left_at: new Date().toISOString() })
        .eq("space_id", spaceId)
        .eq("user_id", user.id)
        .is("left_at", null);

      if (isHost) {
        await supabase
          .from("spaces")
          .update({ status: "ended", ended_at: new Date().toISOString() })
          .eq("id", spaceId);
      }
    }
    queryClient.invalidateQueries({ queryKey: ["spaces"] });
    onClose();
  };

  const toggleHand = () => {
    setHandRaised(!handRaised);
    toast.info(handRaised ? "Hand lowered" : "Hand raised ✋");
  };

  const handlePromote = async (targetUserId: string) => {
    setPromoting(targetUserId);
    try {
      const { data, error } = await supabase.functions.invoke("livekit-token", {
        body: { space_id: spaceId, action: "promote", target_user_id: targetUserId },
      });
      if (error || data?.error) {
        toast.error(data?.error || "Failed to promote");
      } else {
        toast.success("Participant promoted to speaker");
      }
    } catch {
      toast.error("Failed to promote participant");
    } finally {
      setPromoting(null);
    }
  };

  const handleDemote = async (targetUserId: string) => {
    setPromoting(targetUserId);
    try {
      const { data, error } = await supabase.functions.invoke("livekit-token", {
        body: { space_id: spaceId, action: "demote", target_user_id: targetUserId },
      });
      if (error || data?.error) {
        toast.error(data?.error || "Failed to demote");
      } else {
        toast.success("Participant moved to listeners");
      }
    } catch {
      toast.error("Failed to demote participant");
    } finally {
      setPromoting(null);
    }
  };

  const speakers = participants.filter(
    (p) => p.audioTrack || p.canPublish || p.identity === hostId
  );
  const listeners = participants.filter(
    (p) => !p.audioTrack && !p.canPublish && p.identity !== hostId
  );

  const renderAvatar = (p: ParticipantInfo, size: "lg" | "sm") => {
    const prof = profiles[p.identity];
    const vLevel = prof?.verification_level || "none";
    const dim = size === "lg" ? "w-14 h-14" : "w-10 h-10";
    const badgeSize = size === "lg" ? 14 : 12;

    return (
      <div className="relative">
        <div
          className={`${dim} rounded-full flex items-center justify-center font-bold transition-all overflow-hidden ${
            p.isSpeaking
              ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
              : "border border-border"
          } ${!prof?.avatar_url ? (p.isSpeaking ? "bg-primary/30" : "bg-muted/50") : ""}`}
        >
          {prof?.avatar_url ? (
            <img src={prof.avatar_url} alt={p.name} className="w-full h-full object-cover" />
          ) : (
            <span className={size === "lg" ? "text-lg" : "text-sm"}>
              {p.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        {vLevel !== "none" && (
          <div className="absolute -bottom-0.5 -right-0.5">
            <NftBadge level={vLevel} size={badgeSize} />
          </div>
        )}
      </div>
    );
  };

  return (
    <AnimatePresence>
      <motion.div
        key="space-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-background/80 backdrop-blur-md z-[80]"
      />
      <motion.div
        key="space-panel"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        className="fixed inset-x-0 bottom-0 top-16 z-[81] bg-background rounded-t-3xl border-t border-border flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-destructive/20 text-destructive">
                <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
                LIVE
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Users className="w-3 h-3" />
                {participants.length}
              </span>
            </div>
            <h3 className="text-base font-bold mt-1 truncate">{spaceTitle}</h3>
          </div>
          <button
            onClick={handleLeave}
            className="w-9 h-9 rounded-full bg-destructive/10 text-destructive flex items-center justify-center hover:bg-destructive/20 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {connecting ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
              <p className="text-sm text-muted-foreground">Connecting to voice room…</p>
            </div>
          ) : (
            <>
              {/* Speakers grid */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1">
                  <Volume2 className="w-3 h-3" /> Speakers
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {speakers.map((p) => (
                    <motion.div
                      key={p.identity}
                      layout
                      className="flex flex-col items-center gap-1.5"
                    >
                      {renderAvatar(p, "lg")}
                      <p className="text-[10px] font-medium truncate max-w-[80px] text-center">
                        {p.name}
                        {p.identity === hostId && " 🎙️"}
                      </p>
                      <div className="flex items-center gap-1">
                        {p.isMuted && <MicOff className="w-3 h-3 text-muted-foreground" />}
                        {/* Host can demote non-host speakers */}
                        {isHost && p.identity !== hostId && p.identity !== user?.id && (
                          <button
                            onClick={() => handleDemote(p.identity)}
                            disabled={promoting === p.identity}
                            className="p-0.5 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                            title="Move to listeners"
                          >
                            <UserMinus className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Listeners */}
              {listeners.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1">
                    <Users className="w-3 h-3" /> Listeners
                  </p>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {listeners.map((p) => (
                      <div
                        key={p.identity}
                        className="flex flex-col items-center gap-1"
                      >
                        {renderAvatar(p, "sm")}
                        <p className="text-[9px] text-muted-foreground truncate max-w-[60px]">
                          {p.name}
                        </p>
                        {/* Host can promote listeners */}
                        {isHost && (
                          <button
                            onClick={() => handlePromote(p.identity)}
                            disabled={promoting === p.identity}
                            className="p-0.5 rounded-full hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                            title="Promote to speaker"
                          >
                            {promoting === p.identity ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <UserPlus className="w-3 h-3" />
                            )}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Controls bar */}
        {connected && (
          <div className="border-t border-border px-5 py-4 flex items-center justify-center gap-4">
            {/* Show mic toggle if host or has publish permission */}
            {(isHost || canPublish) && (
              <button
                onClick={toggleMute}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                  muted
                    ? "bg-muted text-muted-foreground"
                    : "bg-primary/20 text-primary"
                }`}
              >
                {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
            )}

            {/* Non-speakers can raise hand */}
            {!isHost && !canPublish && (
              <button
                onClick={toggleHand}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                  handRaised
                    ? "bg-yellow-500/20 text-yellow-500"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <Hand className="w-5 h-5" />
              </button>
            )}

            <button
              onClick={handleLeave}
              className="w-12 h-12 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default SpaceRoom;
