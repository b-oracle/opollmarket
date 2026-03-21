import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Room,
  RoomEvent,
  Track,
  DataPacket_Kind,
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
  MessageCircle,
  Send,
  VolumeX,
  UserX,
  Circle,
  CircleStop,
  Bell,
  Minimize2,
} from "lucide-react";
import NftBadge, { VerificationLevel } from "@/components/NftBadge";
import { useActiveSpace } from "@/hooks/useActiveSpace";
import SpaceMiniPlayer from "./SpaceMiniPlayer";

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
  handRaised?: boolean;
}

interface ProfileInfo {
  avatar_url: string | null;
  verification_level: VerificationLevel;
}

interface ChatMessage {
  id: string;
  sender: string;
  senderName: string;
  text: string;
  type: "message" | "reaction";
  timestamp: number;
}

const REACTIONS = ["🔥", "👏", "❤️", "😂", "💯", "🎯"];

const SpaceRoom = ({ spaceId, spaceTitle, hostId, onClose }: SpaceRoomProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { minimized, toggleMinimize } = useActiveSpace();
  const roomRef = useRef<Room | null>(null);
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [connecting, setConnecting] = useState(true);
  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(true);
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileInfo>>({});
  const [isHost, setIsHost] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [canPublish, setCanPublish] = useState(false);
  const [promoting, setPromoting] = useState<string | null>(null);

  // Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [floatingReactions, setFloatingReactions] = useState<{ id: string; emoji: string }[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Recording state
  const [recording, setRecording] = useState(false);
  const [recordingLoading, setRecordingLoading] = useState(false);

  // Remote hand raises tracked by identity
  const [remoteHandRaises, setRemoteHandRaises] = useState<Set<string>>(new Set());

  // Participant action sheet state
  const [actionTarget, setActionTarget] = useState<ParticipantInfo | null>(null);
  const [actionType, setActionType] = useState<"speaker" | "listener" | null>(null);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      audioElementsRef.current.forEach((el) => el.remove());
      audioElementsRef.current.clear();
    };
  }, []);

  // Reset unread when chat opens
  useEffect(() => {
    if (chatOpen) setUnreadCount(0);
  }, [chatOpen]);

  // ============ Session persistence on background / calls ============
  useEffect(() => {
    const handleVisibility = () => {
      const room = roomRef.current;
      if (!room) return;

      if (document.visibilityState === "visible") {
        // Re-enable audio tracks that may have been suspended
        room.localParticipant.audioTrackPublications.forEach((pub) => {
          if (pub.track) {
            pub.track.mediaStreamTrack.enabled = !muted;
          }
        });
      }
    };

    // Prevent the page from being frozen on mobile
    const handleFreeze = (e: Event) => {
      // Request a wake lock if available to keep the connection alive
    };

    document.addEventListener("visibilitychange", handleVisibility);
    document.addEventListener("freeze", handleFreeze);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      document.removeEventListener("freeze", handleFreeze);
    };
  }, [muted]);

  // Keep-alive ping to prevent WebSocket timeout when backgrounded
  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(() => {
      const room = roomRef.current;
      if (room && room.state === "connected") {
        // Sending a small data packet keeps the connection alive
        try {
          const ping = JSON.stringify({ type: "ping", ts: Date.now() });
          room.localParticipant.publishData(new TextEncoder().encode(ping), { reliable: false });
        } catch {
          // ignore
        }
      }
    }, 15000); // every 15 seconds
    return () => clearInterval(interval);
  }, [connected]);

  const updateParticipants = useCallback((room: Room) => {
    const all: ParticipantInfo[] = [];
    const addP = (p: any) => {
      all.push({
        identity: p.identity,
        name: p.name || p.identity.slice(0, 8),
        isSpeaking: p.isSpeaking,
        isMuted: !p.isMicrophoneEnabled,
        audioTrack: p.audioTrackPublications.size > 0,
        canPublish: p.permissions?.canPublish ?? false,
      });
    };
    addP(room.localParticipant);
    room.remoteParticipants.forEach((p) => addP(p));
    setParticipants(all);
    setCanPublish(room.localParticipant.permissions?.canPublish ?? false);
  }, []);

  // Handle incoming data messages (chat + reactions + hand raises)
  const handleDataReceived = useCallback((payload: Uint8Array, participant: any) => {
    try {
      const decoded = new TextDecoder().decode(payload);
      const data = JSON.parse(decoded);
      // Ignore keep-alive pings
      if (data.type === "ping") return;
      if (data.type === "reaction") {
        const id = `${Date.now()}-${Math.random()}`;
        setFloatingReactions((prev) => [...prev, { id, emoji: data.emoji }]);
        setTimeout(() => setFloatingReactions((prev) => prev.filter((r) => r.id !== id)), 2000);
      } else if (data.type === "message") {
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${Math.random()}`,
            sender: participant?.identity || "unknown",
            senderName: data.senderName || participant?.name || "Unknown",
            text: data.text,
            type: "message",
            timestamp: Date.now(),
          },
        ]);
        // Increment unread if chat is closed
        setChatOpen((open) => {
          if (!open) setUnreadCount((c) => c + 1);
          return open;
        });
      } else if (data.type === "hand_raise") {
        const identity = participant?.identity;
        if (identity) {
          if (data.raised) {
            setRemoteHandRaises((prev) => new Set(prev).add(identity));
            toast.info(`${data.senderName || "Someone"} raised their hand ✋`);
          } else {
            setRemoteHandRaises((prev) => {
              const next = new Set(prev);
              next.delete(identity);
              return next;
            });
          }
        }
      }
    } catch {
      // ignore malformed
    }
  }, []);

  // Fetch profiles
  useEffect(() => {
    if (participants.length === 0) return;
    const ids = participants.map((p) => p.identity).filter((id) => !profiles[id]);
    if (ids.length === 0) return;
    (async () => {
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
    })();
  }, [participants]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Connect to LiveKit
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true },
      // Keep connection alive when page is hidden
      disconnectOnPageLeave: false,
    });
    roomRef.current = room;

    const normUrl = (url: string) => {
      try {
        const p = new URL(url);
        if (p.protocol === "https:") p.protocol = "wss:";
        if (p.protocol === "http:") p.protocol = "ws:";
        return p.toString();
      } catch { return url; }
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

        // Audio handling
        room.on(RoomEvent.TrackSubscribed, (track) => {
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
            if (el) { track.detach(el); el.remove(); audioElementsRef.current.delete(track.sid); }
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
          const perms = room.localParticipant.permissions;
          if (perms?.canPublish) {
            setCanPublish(true);
            toast.success("You've been promoted to speaker! 🎙️");
          }
        });
        room.on(RoomEvent.DataReceived, handleDataReceived);
        room.on(RoomEvent.Disconnected, () => {
          if (!cancelled) {
            setConnected(false);
            toast.info("Disconnected from space");
            onClose();
          }
        });

        // Auto-reconnect on transient failures
        room.on(RoomEvent.Reconnecting, () => {
          toast.info("Reconnecting to space…", { id: "space-reconnect" });
        });
        room.on(RoomEvent.Reconnected, () => {
          toast.success("Reconnected! ✅", { id: "space-reconnect" });
          updateParticipants(room);
        });

        await room.connect(normUrl(data.url), data.token);
        if (cancelled) { room.disconnect(); return; }

        setConnected(true);
        setConnecting(false);

        if (data.isHost) {
          try {
            await room.localParticipant.setMicrophoneEnabled(true);
            setMuted(false);
          } catch { setMuted(true); }
        }

        updateParticipants(room);

        await supabase.from("space_participants").upsert(
          { space_id: spaceId, user_id: user.id, role: data.isHost ? "host" : "listener", left_at: null },
          { onConflict: "space_id,user_id" }
        );
        queryClient.invalidateQueries({ queryKey: ["spaces"] });
      } catch (err: any) {
        if (!cancelled) {
          toast.error(err?.message || "Failed to connect");
          onClose();
        }
      }
    };

    connect();
    return () => {
      cancelled = true;
      roomRef.current?.disconnect();
      roomRef.current = null;
    };
  }, [user, spaceId]);

  // --- Actions ---
  const toggleMute = async () => {
    if (!roomRef.current) return;
    try {
      await roomRef.current.localParticipant.setMicrophoneEnabled(muted);
      setMuted(!muted);
    } catch { toast.error("Microphone access denied"); }
  };

  const handleLeave = async () => {
    roomRef.current?.disconnect();
    if (user) {
      await supabase.from("space_participants").update({ left_at: new Date().toISOString() })
        .eq("space_id", spaceId).eq("user_id", user.id).is("left_at", null);
      if (isHost) {
        await supabase.from("spaces").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", spaceId);
      }
    }
    queryClient.invalidateQueries({ queryKey: ["spaces"] });
    onClose();
  };

  const toggleHand = () => {
    const newRaised = !handRaised;
    setHandRaised(newRaised);
    toast.info(newRaised ? "Hand raised ✋" : "Hand lowered");
    if (roomRef.current) {
      const data = JSON.stringify({
        type: "hand_raise",
        raised: newRaised,
        senderName: roomRef.current.localParticipant.name || "Someone",
      });
      roomRef.current.localParticipant.publishData(new TextEncoder().encode(data), { reliable: true });
    }
  };

  const invokeAction = async (action: string, target_user_id?: string) => {
    setPromoting(target_user_id || action);
    try {
      const { data, error } = await supabase.functions.invoke("livekit-token", {
        body: { space_id: spaceId, action, target_user_id },
      });
      if (error || data?.error) toast.error(data?.error || `Failed to ${action}`);
      else toast.success(
        action === "promote" ? "Promoted to speaker" :
        action === "demote" ? "Moved to listeners" :
        action === "mute" ? "Participant muted" :
        action === "kick" ? "Participant removed" :
        action === "start_recording" ? "Recording started 🔴" :
        action === "stop_recording" ? "Recording stopped" : "Done"
      );
      if (action === "start_recording") setRecording(true);
      if (action === "stop_recording") setRecording(false);
      if (action === "promote" && target_user_id) {
        setRemoteHandRaises((prev) => {
          const next = new Set(prev);
          next.delete(target_user_id);
          return next;
        });
      }
    } catch { toast.error(`Failed to ${action}`); }
    finally { setPromoting(null); setRecordingLoading(false); setActionTarget(null); setActionType(null); }
  };

  const sendChat = () => {
    if (!chatInput.trim() || !roomRef.current) return;
    const data = JSON.stringify({
      type: "message",
      text: chatInput.trim(),
      senderName: roomRef.current.localParticipant.name || "You",
    });
    roomRef.current.localParticipant.publishData(new TextEncoder().encode(data), { reliable: true });
    setMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-local`,
        sender: user?.id || "",
        senderName: "You",
        text: chatInput.trim(),
        type: "message",
        timestamp: Date.now(),
      },
    ]);
    setChatInput("");
  };

  const sendReaction = (emoji: string) => {
    if (!roomRef.current) return;
    const data = JSON.stringify({ type: "reaction", emoji });
    roomRef.current.localParticipant.publishData(new TextEncoder().encode(data), { reliable: false });
    const id = `${Date.now()}-${Math.random()}`;
    setFloatingReactions((prev) => [...prev, { id, emoji }]);
    setTimeout(() => setFloatingReactions((prev) => prev.filter((r) => r.id !== id)), 2000);
  };

  const toggleRecording = () => {
    setRecordingLoading(true);
    invokeAction(recording ? "stop_recording" : "start_recording");
  };

  const speakers = participants.filter((p) => p.audioTrack || p.canPublish || p.identity === hostId);
  const listeners = participants.filter((p) => !p.audioTrack && !p.canPublish && p.identity !== hostId);

  const renderAvatar = (p: ParticipantInfo, size: "lg" | "sm") => {
    const prof = profiles[p.identity];
    const vLevel = prof?.verification_level || "none";
    const dim = size === "lg" ? "w-14 h-14" : "w-10 h-10";
    const badgeSize = size === "lg" ? 14 : 12;
    const hasHandUp = remoteHandRaises.has(p.identity);
    return (
      <div className="relative">
        <div className={`${dim} rounded-full flex items-center justify-center font-bold transition-all overflow-hidden ${
          p.isSpeaking ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "border border-border"
        } ${!prof?.avatar_url ? (p.isSpeaking ? "bg-primary/30" : "bg-muted/50") : ""}`}>
          {prof?.avatar_url ? (
            <img src={prof.avatar_url} alt={p.name} className="w-full h-full object-cover" />
          ) : (
            <span className={size === "lg" ? "text-lg" : "text-sm"}>{p.name.charAt(0).toUpperCase()}</span>
          )}
        </div>
        {vLevel !== "none" && (
          <div className="absolute -bottom-0.5 -right-0.5">
            <NftBadge level={vLevel} size={badgeSize} />
          </div>
        )}
        {hasHandUp && (
          <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center text-[10px] animate-bounce">
            ✋
          </div>
        )}
      </div>
    );
  };

  // ============ MINIMIZED MODE ============
  if (minimized) {
    return (
      <SpaceMiniPlayer
        title={spaceTitle}
        participantCount={participants.length}
        isMuted={muted}
        onToggleMute={toggleMute}
        onLeave={handleLeave}
      />
    );
  }

  // ============ FULL MODE ============
  return (
    <AnimatePresence>
      <motion.div key="space-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-background/80 backdrop-blur-md z-[80]" />
      <motion.div key="space-panel" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        className="fixed inset-x-0 bottom-0 top-16 z-[81] bg-background rounded-t-3xl border-t border-border flex flex-col overflow-hidden">

        {/* Floating reactions */}
        <div className="absolute top-20 right-4 z-[90] pointer-events-none">
          <AnimatePresence>
            {floatingReactions.map((r) => (
              <motion.div key={r.id}
                initial={{ opacity: 1, y: 0, scale: 1 }}
                animate={{ opacity: 0, y: -120, scale: 1.5 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 2 }}
                className="text-2xl absolute right-0"
              >
                {r.emoji}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Header */}
        <div className="px-5 py-3 border-b border-border flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-destructive/20 text-destructive">
                <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
                LIVE
              </span>
              {recording && (
                <span className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-500">
                  <Circle className="w-2 h-2 fill-red-500" /> REC
                </span>
              )}
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Users className="w-3 h-3" />{participants.length}
              </span>
            </div>
            <h3 className="text-sm font-bold mt-0.5 truncate">{spaceTitle}</h3>
          </div>
          <div className="flex items-center gap-1">
            {/* Minimize button */}
            <button onClick={toggleMinimize}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Minimize">
              <Minimize2 className="w-4 h-4" />
            </button>
            {/* Chat / close toggle with unread badge */}
            <button onClick={() => setChatOpen(!chatOpen)}
              className={`relative w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                chatOpen ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
              }`}>
              {chatOpen ? <X className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />}
              {!chatOpen && unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center px-1">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4">
          {connecting ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
              <p className="text-sm text-muted-foreground">Connecting to voice room…</p>
            </div>
          ) : chatOpen ? (
            /* Chat panel */
            <div className="flex flex-col h-full">
              <div className="flex-1 overflow-y-auto space-y-2 mb-3 max-h-[50vh]">
                {messages.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-8">No messages yet. Say something!</p>
                )}
                {messages.map((m) => (
                  <div key={m.id} className={`flex gap-2 ${m.sender === user?.id ? "justify-end" : ""}`}>
                    <div className={`max-w-[80%] rounded-xl px-3 py-1.5 text-xs ${
                      m.sender === user?.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}>
                      {m.sender !== user?.id && (
                        <p className="font-semibold text-[10px] opacity-70 mb-0.5">{m.senderName}</p>
                      )}
                      <p>{m.text}</p>
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className="flex gap-2 items-center">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendChat()}
                  placeholder="Send a message..."
                  className="flex-1 bg-muted rounded-full px-4 py-2 text-xs outline-none border border-border focus:border-primary"
                />
                <button onClick={sendChat} disabled={!chatInput.trim()}
                  className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50">
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Speakers */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                  <Volume2 className="w-3 h-3" /> Speakers
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {speakers.map((p) => (
                    <motion.div key={p.identity} layout className="flex flex-col items-center gap-1"
                      onClick={() => {
                        if (isHost && p.identity !== hostId && p.identity !== user?.id) {
                          setActionTarget(p);
                          setActionType("speaker");
                        }
                      }}>
                      {renderAvatar(p, "lg")}
                      <p className="text-[10px] font-medium truncate max-w-[80px] text-center">
                        {p.name}{p.identity === hostId && " 🎙️"}
                      </p>
                      <div className="flex items-center gap-0.5">
                        {p.isMuted && <MicOff className="w-3 h-3 text-muted-foreground" />}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Listeners */}
              {listeners.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                    <Users className="w-3 h-3" /> Listeners
                  </p>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {listeners.map((p) => (
                      <div key={p.identity} className="flex flex-col items-center gap-1 cursor-pointer"
                        onClick={() => {
                          if (isHost) {
                            setActionTarget(p);
                            setActionType("listener");
                          }
                        }}>
                        {renderAvatar(p, "sm")}
                        <p className="text-[9px] text-muted-foreground truncate max-w-[60px]">{p.name}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Reaction bar */}
        {connected && !chatOpen && (
          <div className="px-5 py-2 flex items-center justify-center gap-2">
            {REACTIONS.map((emoji) => (
              <button key={emoji} onClick={() => sendReaction(emoji)}
                className="w-9 h-9 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center text-base transition-transform active:scale-125">
                {emoji}
              </button>
            ))}
          </div>
        )}

        {/* Controls bar */}
        {connected && (
          <div className="border-t border-border px-5 py-3 flex items-center justify-center gap-3">
            {(isHost || canPublish) && (
              <button onClick={toggleMute}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                  muted ? "bg-muted text-muted-foreground" : "bg-primary/20 text-primary"
                }`}>
                {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
            )}

            {!isHost && !canPublish && (
              <button onClick={toggleHand}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                  handRaised ? "bg-yellow-500/20 text-yellow-500" : "bg-muted text-muted-foreground"
                }`}>
                <Hand className="w-5 h-5" />
              </button>
            )}

            {/* Recording toggle for host */}
            {isHost && (
              <button onClick={toggleRecording} disabled={recordingLoading}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                  recording ? "bg-red-500/20 text-red-500" : "bg-muted text-muted-foreground"
                }`}
                title={recording ? "Stop recording" : "Start recording"}>
                {recordingLoading ? <Loader2 className="w-5 h-5 animate-spin" /> :
                  recording ? <CircleStop className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
              </button>
            )}

            <button onClick={handleLeave}
              className="w-11 h-11 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center">
              <PhoneOff className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Participant action sheet (overlay) */}
        <AnimatePresence>
          {actionTarget && actionType && (
            <>
              <motion.div
                key="action-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/40 z-[95]"
                onClick={() => { setActionTarget(null); setActionType(null); }}
              />
              <motion.div
                key="action-sheet"
                initial={{ y: 200, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 200, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="absolute bottom-0 inset-x-0 z-[96] bg-card rounded-t-2xl border-t border-border p-5 space-y-4"
              >
                {/* Participant info */}
                <div className="flex items-center gap-3">
                  {renderAvatar(actionTarget, "lg")}
                  <div>
                    <p className="font-semibold text-sm">{actionTarget.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {actionType === "speaker" ? "Speaker" : "Listener"}
                      {remoteHandRaises.has(actionTarget.identity) && " · ✋ Hand raised"}
                    </p>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="space-y-2">
                  {actionType === "listener" && (
                    <button
                      onClick={() => invokeAction("promote", actionTarget.identity)}
                      disabled={promoting === actionTarget.identity}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                    >
                      {promoting === actionTarget.identity ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
                      <span className="text-sm font-medium">Promote to Speaker</span>
                    </button>
                  )}
                  {actionType === "speaker" && (
                    <>
                      <button
                        onClick={() => invokeAction("mute", actionTarget.identity)}
                        disabled={promoting === actionTarget.identity}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-muted hover:bg-muted/80 text-foreground transition-colors"
                      >
                        <VolumeX className="w-5 h-5" />
                        <span className="text-sm font-medium">Force Mute</span>
                      </button>
                      <button
                        onClick={() => invokeAction("demote", actionTarget.identity)}
                        disabled={promoting === actionTarget.identity}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-muted hover:bg-muted/80 text-foreground transition-colors"
                      >
                        <UserMinus className="w-5 h-5" />
                        <span className="text-sm font-medium">Move to Listeners</span>
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => invokeAction("kick", actionTarget.identity)}
                    disabled={promoting === actionTarget.identity}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-destructive/10 hover:bg-destructive/20 text-destructive transition-colors"
                  >
                    <UserX className="w-5 h-5" />
                    <span className="text-sm font-medium">Remove from Space</span>
                  </button>
                  <button
                    onClick={() => { setActionTarget(null); setActionType(null); }}
                    className="w-full flex items-center justify-center px-4 py-3 rounded-xl bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
                  >
                    <span className="text-sm font-medium">Cancel</span>
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
};

export default SpaceRoom;
