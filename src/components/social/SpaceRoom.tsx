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
import { optimizedImageUrl } from "@/lib/optimizedImage";
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
  Lock,
  Unlock,
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
  const [reconnecting, setReconnecting] = useState(false);
  const intentionalLeaveRef = useRef(false);
  const [muted, setMuted] = useState(true);
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileInfo>>({});
  const [isHost, setIsHost] = useState(false);
  const [isCoHost, setIsCoHost] = useState(false);
  const [spaceCoHostIds, setSpaceCoHostIds] = useState<string[]>([]);
  const [handRaised, setHandRaised] = useState(false);
  const [canPublish, setCanPublish] = useState(false);
  const [promoting, setPromoting] = useState<string | null>(null);

  // Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [floatingReactions, setFloatingReactions] = useState<{ id: string; emoji: string }[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Recording state (client-side)
  const [recording, setRecording] = useState(false);
  const [recordingLoading, setRecordingLoading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  // Remote hand raises tracked by identity
  const [remoteHandRaises, setRemoteHandRaises] = useState<Set<string>>(new Set());

  // Participant action sheet state
  const [actionTarget, setActionTarget] = useState<ParticipantInfo | null>(null);
  const [actionType, setActionType] = useState<"speaker" | "listener" | null>(null);

  // Speaker request state
  const [speakRequests, setSpeakRequests] = useState<Set<string>>(new Set());
  // Force-mute state
  const [forceMuted, setForceMuted] = useState(false);
  const [forceMutedUsers, setForceMutedUsers] = useState<Set<string>>(new Set());
  const [allForceMuted, setAllForceMuted] = useState(false);
  const [requestPending, setRequestPending] = useState(false);

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

  // Wake lock ref
  const wakeLockRef = useRef<any>(null);
  // Track whether mic was on before backgrounding
  const wasMicOnRef = useRef(false);

  // ============ Session persistence on background / calls ============
  useEffect(() => {
    const acquireWakeLock = async () => {
      try {
        if ("wakeLock" in navigator && !wakeLockRef.current) {
          wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
          wakeLockRef.current.addEventListener("release", () => {
            wakeLockRef.current = null;
          });
        }
      } catch {
        // Wake Lock not supported or failed — ignore
      }
    };

    const handleVisibility = async () => {
      const room = roomRef.current;
      if (!room) return;

      if (document.visibilityState === "visible") {
        // Re-acquire wake lock (it's released on hide by some browsers)
        acquireWakeLock();

        // Resume AudioContext if suspended
        try {
          const ctx = audioContextRef.current;
          if (ctx && ctx.state === "suspended") {
            await ctx.resume();
          }
        } catch {}

        // Re-enable audio tracks that may have been suspended
        room.localParticipant.audioTrackPublications.forEach((pub) => {
          if (pub.track) {
            pub.track.mediaStreamTrack.enabled = !muted;
          }
        });

        // If the user had mic on before backgrounding, re-enable it
        if (wasMicOnRef.current && canPublish && !forceMuted) {
          try {
            await room.localParticipant.setMicrophoneEnabled(true);
            setMuted(false);
          } catch {}
        }
      } else {
        // Going to background — track mic state
        wasMicOnRef.current = !muted;
      }
    };

    // Prevent the page from being frozen on mobile
    const handleFreeze = () => {
      // Acquire wake lock to keep connection alive
      acquireWakeLock();
    };

    // Acquire wake lock on mount if connected
    if (connected) acquireWakeLock();

    document.addEventListener("visibilitychange", handleVisibility);
    document.addEventListener("freeze", handleFreeze);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      document.removeEventListener("freeze", handleFreeze);
      // Release wake lock on cleanup
      if (wakeLockRef.current) {
        try { wakeLockRef.current.release(); } catch {}
        wakeLockRef.current = null;
      }
    };
  }, [muted, connected, canPublish, forceMuted]);

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
    }, 8000); // every 8 seconds — aggressive to prevent mobile timeout
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
      } else if (data.type === "speak_request") {
        const identity = participant?.identity;
        if (identity) {
          setSpeakRequests((prev) => new Set(prev).add(identity));
          toast.info(`${data.senderName || "Someone"} wants to speak 🎙️`);
        }
      } else if (data.type === "speak_request_accepted") {
        setRequestPending(false);
    } else if (data.type === "speak_request_declined") {
        setRequestPending(false);
        toast.info("Your speak request was declined");
      } else if (data.type === "cohost_update") {
        const newCoHostIds: string[] = data.coHostIds || [];
        setSpaceCoHostIds(newCoHostIds);
        if (user) {
          const wasCoHost = newCoHostIds.includes(user.id);
          setIsCoHost(wasCoHost);
        }
      } else if (data.type === "force_mute") {
        if (user) {
          const targets = data.targets;
          const isTargeted = targets === "all" || (Array.isArray(targets) && targets.includes(user.id));
          // Hosts and co-hosts are immune
          const isMod = user.id === hostId || spaceCoHostIds.includes(user.id);
          if (isTargeted && !isMod) {
            setForceMuted(true);
            setMuted(true);
            // Actually mute the mic
            if (roomRef.current) {
              try { roomRef.current.localParticipant.setMicrophoneEnabled(false); } catch {}
            }
            toast.info("You've been muted by the host 🔇");
          }
          // Track force-muted users for moderator UI
          if (targets === "all") {
            setAllForceMuted(true);
            // Add all non-mod speakers to force-muted set
            const allIds = new Set<string>();
            participants.forEach(p => {
              if (p.identity !== hostId && !spaceCoHostIds.includes(p.identity)) {
                allIds.add(p.identity);
              }
            });
            setForceMutedUsers(allIds);
          } else if (Array.isArray(targets)) {
            setForceMutedUsers(prev => {
              const next = new Set(prev);
              targets.forEach((id: string) => next.add(id));
              return next;
            });
          }
        }
      } else if (data.type === "force_unmute") {
        if (user) {
          const targets = data.targets;
          const isTargeted = targets === "all" || (Array.isArray(targets) && targets.includes(user.id));
          if (isTargeted) {
            setForceMuted(false);
            toast.success("You can now unmute 🎙️");
          }
          if (targets === "all") {
            setAllForceMuted(false);
            setForceMutedUsers(new Set());
          } else if (Array.isArray(targets)) {
            setForceMutedUsers(prev => {
              const next = new Set(prev);
              targets.forEach((id: string) => next.delete(id));
              return next;
            });
          }
        }
      }
    } catch {
      // ignore malformed
    }
  }, [user]);

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

        console.log("[SpaceRoom] livekit-token response:", { data: data ? { ...data, token: data.token ? "[SET]" : undefined } : null, error });

        // Extract error message from various response shapes
        const errMsg = error?.message || error?.context?.body?.error || data?.error;
        if (errMsg || (!data?.token)) {
          const msg = errMsg || "Failed to get voice token";
          if (typeof msg === "string" && (msg.includes("ended") || msg.includes("isn't live"))) {
            toast.info("This Space isn't live yet or has already ended");
          } else if (msg === "LiveKit not configured") {
            toast.error("Voice is not available right now");
          } else {
            toast.error(typeof msg === "string" ? msg : "Failed to get voice token");
          }
          onClose();
          return;
        }
        if (cancelled) return;

        setIsHost(data.isHost);
        setIsCoHost(data.isCoHost || false);
        setCanPublish(data.isHost || data.isCoHost);

        // Audio handling
        room.on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === Track.Kind.Audio) {
            const el = track.attach();
            el.style.display = "none";
            document.body.appendChild(el);
            audioElementsRef.current.set(track.sid, el);
            // Dynamically connect new audio to active recording
            const ctx = audioContextRef.current;
            const dest = recordingDestRef.current;
            if (ctx && dest && ctx.state !== "closed" && el.srcObject instanceof MediaStream) {
              try {
                const src = ctx.createMediaStreamSource(el.srcObject);
                src.connect(dest);
              } catch { /* stream may not be active yet */ }
            }
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
            setRequestPending(false);
            toast.success("You've been promoted to speaker! 🎙️");
          }
        });
        room.on(RoomEvent.DataReceived, handleDataReceived);
        room.on(RoomEvent.Disconnected, async () => {
          if (cancelled || intentionalLeaveRef.current) {
            if (!cancelled) {
              setConnected(false);
              onClose();
            }
            return;
          }
          // Attempt reconnection for ALL participants (speakers + listeners)
          {
            setReconnecting(true);
            toast.info("Connection lost — reconnecting…", { id: "space-reconnect" });
            for (let attempt = 0; attempt < 3; attempt++) {
              await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
              try {
                const { data: reconData } = await supabase.functions.invoke("livekit-token", {
                  body: { space_id: spaceId },
                });
                if (reconData?.error) {
                  // Space ended or not live
                  if (typeof reconData.error === "string" && (reconData.error.includes("ended") || reconData.error.includes("isn't live"))) {
                    toast.info("This Space has ended");
                    setReconnecting(false);
                    onClose();
                    return;
                  }
                  continue;
                }
                if (reconData?.token && reconData?.url) {
                  await room.connect(normUrl(reconData.url), reconData.token);
                  setConnected(true);
                  setReconnecting(false);
                  toast.success("Reconnected! ✅", { id: "space-reconnect" });
                  updateParticipants(room);
                  return;
                }
              } catch {
                // retry
              }
            }
            setReconnecting(false);
            toast.error("Could not reconnect to space");
          }
          setConnected(false);
          onClose();
        });

        // Auto-reconnect on transient failures
        room.on(RoomEvent.Reconnecting, () => {
          toast.info("Reconnecting to space…", { id: "space-reconnect" });
        });
        room.on(RoomEvent.Reconnected, async () => {
          toast.success("Reconnected! ✅", { id: "space-reconnect" });
          updateParticipants(room);
          // Re-acquire mic if user was unmuted before disconnect
          if (wasMicOnRef.current && room.localParticipant.permissions?.canPublish) {
            try {
              await room.localParticipant.setMicrophoneEnabled(true);
              setMuted(false);
            } catch {}
          }
        });

        await room.connect(normUrl(data.url), data.token);
        if (cancelled) { room.disconnect(); return; }

        setConnected(true);
        setConnecting(false);

        // Fetch co_host_ids from space
        const { data: spaceData } = await supabase
          .from("spaces")
          .select("co_host_ids")
          .eq("id", spaceId)
          .single();
        if (spaceData?.co_host_ids) {
          setSpaceCoHostIds(spaceData.co_host_ids as string[]);
        }

        if (data.isHost || data.isCoHost) {
          try {
            await room.localParticipant.setMicrophoneEnabled(true);
            setMuted(false);
          } catch { setMuted(true); }
        }

        updateParticipants(room);

        await supabase.from("space_participants").upsert(
          { space_id: spaceId, user_id: user.id, role: (data.isHost ? "host" : data.isCoHost ? "co_host" : "listener") as any, left_at: null },
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
      const r = roomRef.current;
      roomRef.current = null;
      if (r) {
        try { r.disconnect(); } catch { /* ignore */ }
      }
      // Cleanup any lingering audio elements
      audioElementsRef.current.forEach((el) => { try { el.remove(); } catch {} });
      audioElementsRef.current.clear();
    };
  }, [user, spaceId]);

  // --- Actions ---
  const toggleMute = async () => {
    if (!roomRef.current) return;
    if (forceMuted && muted) {
      toast.error("You've been muted by the host. Wait for permission to unmute.");
      return;
    }
    try {
      await roomRef.current.localParticipant.setMicrophoneEnabled(muted);
      setMuted(!muted);
    } catch { toast.error("Microphone access denied"); }
  };

  const handleMuteAll = async () => {
    await invokeAction("mute_all");
    // Broadcast force-mute to all via data channel
    if (roomRef.current) {
      const msg = JSON.stringify({ type: "force_mute", targets: "all" });
      roomRef.current.localParticipant.publishData(new TextEncoder().encode(msg), { reliable: true });
    }
    setAllForceMuted(true);
    // Track all non-mod speakers as force-muted
    const allIds = new Set<string>();
    participants.forEach(p => {
      if (p.identity !== hostId && !spaceCoHostIds.includes(p.identity) && (p.canPublish || p.audioTrack)) {
        allIds.add(p.identity);
      }
    });
    setForceMutedUsers(allIds);
  };

  const handleUnmuteAll = () => {
    if (roomRef.current) {
      const msg = JSON.stringify({ type: "force_unmute", targets: "all" });
      roomRef.current.localParticipant.publishData(new TextEncoder().encode(msg), { reliable: true });
    }
    setAllForceMuted(false);
    setForceMutedUsers(new Set());
    toast.success("All speakers can now unmute");
  };

  const handleForceUnmuteSingle = (targetId: string) => {
    if (roomRef.current) {
      const msg = JSON.stringify({ type: "force_unmute", targets: [targetId] });
      roomRef.current.localParticipant.publishData(new TextEncoder().encode(msg), { reliable: true });
    }
    setForceMutedUsers(prev => {
      const next = new Set(prev);
      next.delete(targetId);
      return next;
    });
    setActionTarget(null);
    setActionType(null);
    toast.success("Allowed to unmute");
  };

  const handleLeave = async () => {
    // If recording is active, stop and upload BEFORE disconnecting
    if (recording && mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      toast.info("Saving recording before ending...");
      await stopClientRecording();
    }

    intentionalLeaveRef.current = true;
    try { roomRef.current?.disconnect(); } catch { /* ignore */ }
    roomRef.current = null;
    // Clean up audio elements immediately
    audioElementsRef.current.forEach((el) => { try { el.remove(); } catch {} });
    audioElementsRef.current.clear();
    // Mark self as left in DB — don't end space
    if (user) {
      supabase.from("space_participants").update({ left_at: new Date().toISOString() })
        .eq("space_id", spaceId).eq("user_id", user.id).is("left_at", null)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["spaces"] });
        });
    }
    onClose();
  };

  const handleEndSpace = async () => {
    if (!isHost) return;
    // If recording is active, stop and upload BEFORE ending
    if (recording && mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      toast.info("Saving recording before ending...");
      await stopClientRecording();
    }

    intentionalLeaveRef.current = true;
    try { roomRef.current?.disconnect(); } catch { /* ignore */ }
    roomRef.current = null;
    audioElementsRef.current.forEach((el) => { try { el.remove(); } catch {} });
    audioElementsRef.current.clear();
    if (user) {
      supabase.functions.invoke("livekit-token", {
        body: { space_id: spaceId, action: "end_space" },
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["spaces"] });
      });
    }
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

  const requestToSpeak = () => {
    if (!roomRef.current || requestPending) return;
    setRequestPending(true);
    const data = JSON.stringify({
      type: "speak_request",
      senderName: roomRef.current.localParticipant.name || "Someone",
    });
    roomRef.current.localParticipant.publishData(new TextEncoder().encode(data), { reliable: true });
    toast.success("Speak request sent!");
  };

  const acceptSpeakRequest = async (targetIdentity: string) => {
    await invokeAction("promote", targetIdentity);
    setSpeakRequests((prev) => {
      const next = new Set(prev);
      next.delete(targetIdentity);
      return next;
    });
    // Notify the requester
    if (roomRef.current) {
      const data = JSON.stringify({ type: "speak_request_accepted" });
      roomRef.current.localParticipant.publishData(new TextEncoder().encode(data), { reliable: true });
    }
  };

  const declineSpeakRequest = (targetIdentity: string) => {
    setSpeakRequests((prev) => {
      const next = new Set(prev);
      next.delete(targetIdentity);
      return next;
    });
    if (roomRef.current) {
      const data = JSON.stringify({ type: "speak_request_declined" });
      roomRef.current.localParticipant.publishData(new TextEncoder().encode(data), { reliable: true });
    }
    setActionTarget(null);
    setActionType(null);
    toast.info("Request declined");
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
        action === "make_cohost" ? "Made co-host 👑" :
        action === "remove_cohost" ? "Co-host removed" :
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
      // After individual mute, broadcast force-mute lock
      if (action === "mute" && target_user_id) {
        if (roomRef.current) {
          const msg = JSON.stringify({ type: "force_mute", targets: [target_user_id] });
          roomRef.current.localParticipant.publishData(new TextEncoder().encode(msg), { reliable: true });
        }
        setForceMutedUsers(prev => new Set(prev).add(target_user_id));
      }
      // Refresh co_host_ids after co-host changes and broadcast to all participants
      if (action === "make_cohost" || action === "remove_cohost") {
        const { data: spaceData } = await supabase
          .from("spaces")
          .select("co_host_ids")
          .eq("id", spaceId)
          .single();
        const updatedIds = (spaceData?.co_host_ids as string[]) || [];
        setSpaceCoHostIds(updatedIds);
        // Broadcast co-host update so all participants sync their local state
        if (roomRef.current) {
          const msg = JSON.stringify({ type: "cohost_update", coHostIds: updatedIds });
          roomRef.current.localParticipant.publishData(new TextEncoder().encode(msg), { reliable: true });
        }
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

  const startClientRecording = async () => {
    try {
      setRecordingLoading(true);
      const room = roomRef.current;
      if (!room) throw new Error("Not connected");

      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const destination = ctx.createMediaStreamDestination();
      recordingDestRef.current = destination;

      // Mix local mic if unmuted
      room.localParticipant.audioTrackPublications.forEach((pub) => {
        if (pub.track?.mediaStream) {
          const src = ctx.createMediaStreamSource(pub.track.mediaStream);
          src.connect(destination);
        }
      });

      // Mix all remote audio
      audioElementsRef.current.forEach((el) => {
        if (el.srcObject instanceof MediaStream) {
          const src = ctx.createMediaStreamSource(el.srcObject);
          src.connect(destination);
        }
      });

      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(destination.stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.start(1000); // collect chunks every second
      mediaRecorderRef.current = recorder;
      setRecording(true);
      toast.success("Recording started 🔴");
    } catch (err: any) {
      toast.error(err.message || "Failed to start recording");
    } finally {
      setRecordingLoading(false);
    }
  };

  const stopClientRecording = async () => {
    try {
      setRecordingLoading(true);
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") return;

      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.stop();
      });

      audioContextRef.current?.close();
      audioContextRef.current = null;
      mediaRecorderRef.current = null;
      recordingDestRef.current = null;

      const blob = new Blob(recordedChunksRef.current, { type: "audio/webm" });
      recordedChunksRef.current = [];

      if (blob.size < 1000) {
        toast.error("Recording too short");
        setRecording(false);
        setRecordingLoading(false);
        return;
      }

      // Upload to storage
      const fileName = `${user!.id}/space-${spaceId}-${Date.now()}.webm`;
      const { error: uploadErr } = await supabase.storage
        .from("space-recordings")
        .upload(fileName, blob, { contentType: "audio/webm" });

      if (uploadErr) throw uploadErr;

      // Get public URL and mark space as recorded
      const { data: urlData } = supabase.storage.from("space-recordings").getPublicUrl(fileName);
      await supabase.from("spaces").update({
        is_recorded: true,
        recording_url: urlData.publicUrl,
      } as any).eq("id", spaceId);

      toast.success("Recording saved ✅");
      setRecording(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save recording");
    } finally {
      setRecordingLoading(false);
    }
  };

  const toggleRecording = () => {
    if (recording) stopClientRecording();
    else startClientRecording();
  };

  const hasModPowers = isHost || isCoHost;
  const coHostIds = spaceCoHostIds;
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
            <img src={optimizedImageUrl(prof.avatar_url, "avatar-md")} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
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
          <div className="absolute -top-1 -right-1 text-base animate-bounce drop-shadow-md">
            ✋
          </div>
        )}
        {speakRequests.has(p.identity) && !hasHandUp && (
          <div className="absolute -top-1 -right-1 text-base animate-pulse drop-shadow-md">
            🎙️
          </div>
        )}
        {forceMutedUsers.has(p.identity) && !hasHandUp && !speakRequests.has(p.identity) && (
          <div className="absolute -top-1 -right-1 text-base drop-shadow-md">
            🔇
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
            {/* Chat toggle with unread badge */}
            <button onClick={() => setChatOpen(!chatOpen)}
              className={`relative w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                chatOpen ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
              }`}>
              {chatOpen ? <X className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />}
              {!chatOpen && unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
            {/* Minimize button */}
            <button onClick={toggleMinimize}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Minimize">
              <Minimize2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {reconnecting ? (
            <div className="flex flex-col items-center justify-center py-20 flex-1">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
              <p className="text-sm text-muted-foreground">Reconnecting…</p>
            </div>
          ) : connecting ? (
            <div className="flex flex-col items-center justify-center py-20 flex-1">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
              <p className="text-sm text-muted-foreground">Connecting to voice room…</p>
            </div>
          ) : chatOpen ? (
            /* Chat panel - fills available space with input pinned at bottom */
            <div className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
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
              <div className="shrink-0 px-5 py-3 border-t border-border flex gap-2 items-center">
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
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4">
              {/* Speakers */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                  <Volume2 className="w-3 h-3" /> Speakers
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {speakers.map((p) => (
                    <motion.div key={p.identity} layout className="flex flex-col items-center gap-1"
                      onClick={() => {
                        if (hasModPowers && p.identity !== hostId && p.identity !== user?.id) {
                          setActionTarget(p);
                          setActionType("speaker");
                        }
                      }}>
                      {renderAvatar(p, "lg")}
                      <p className="text-[10px] font-medium truncate max-w-[80px] text-center">
                        {p.name}
                      </p>
                      {p.identity === hostId && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">Host</span>
                      )}
                      {p.identity !== hostId && coHostIds.includes(p.identity) && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-accent/15 text-accent-foreground border border-accent/30">Co-host</span>
                      )}
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
                    {hasModPowers && speakRequests.size > 0 && (
                      <span className="ml-1 min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center px-1">
                        {speakRequests.size}
                      </span>
                    )}
                  </p>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {listeners.map((p) => (
                      <div key={p.identity} className="flex flex-col items-center gap-1 cursor-pointer"
                        onClick={() => {
                          if (hasModPowers) {
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
            </div>
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
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors relative ${
                  forceMuted ? "bg-destructive/20 text-destructive" :
                  muted ? "bg-muted text-muted-foreground" : "bg-primary/20 text-primary"
                }`}
                title={forceMuted ? "Muted by host" : undefined}>
                {forceMuted ? <Lock className="w-5 h-5" /> : muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
            )}

            {/* Mute All / Unmute All — for moderators */}
            {hasModPowers && (
              allForceMuted ? (
                <button onClick={handleUnmuteAll}
                  className="h-11 px-4 rounded-full flex items-center justify-center gap-2 text-sm font-medium bg-primary/20 text-primary transition-colors">
                  <Unlock className="w-4 h-4" />
                  Unmute All
                </button>
              ) : (
                <button onClick={handleMuteAll}
                  className="h-11 px-4 rounded-full flex items-center justify-center gap-2 text-sm font-medium bg-muted text-muted-foreground transition-colors">
                  <VolumeX className="w-4 h-4" />
                  Mute All
                </button>
              )
            )}

            {/* Request to Speak — for listeners without publish permission */}
            {!isHost && !canPublish && (
              <button onClick={requestToSpeak} disabled={requestPending}
                className={`h-11 px-4 rounded-full flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
                  requestPending ? "bg-primary/20 text-primary animate-pulse" : "bg-accent text-accent-foreground"
                }`}>
                <Mic className="w-4 h-4" />
                {requestPending ? "Request Sent" : "Request to Speak"}
              </button>
            )}

            <button onClick={toggleHand}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                handRaised ? "bg-yellow-500/20 text-yellow-500" : "bg-muted text-muted-foreground"
              }`}>
              <Hand className="w-5 h-5" />
            </button>

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
              className="w-11 h-11 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
              title="Leave Space">
              <PhoneOff className="w-5 h-5" />
            </button>

            {isHost && (
              <button onClick={handleEndSpace}
                className="h-11 px-4 rounded-full flex items-center justify-center gap-2 text-sm font-medium bg-destructive text-destructive-foreground transition-colors">
                End Space
              </button>
            )}
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
                      {coHostIds.includes(actionTarget.identity) ? "Co-Host 👑" : actionType === "speaker" ? "Speaker" : "Listener"}
                      {remoteHandRaises.has(actionTarget.identity) && " · ✋ Hand raised"}
                      {speakRequests.has(actionTarget.identity) && " · 🎙️ Wants to speak"}
                    </p>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="space-y-2">
                  {actionType === "listener" && speakRequests.has(actionTarget.identity) && (
                    <>
                      <button
                        onClick={() => acceptSpeakRequest(actionTarget.identity)}
                        disabled={promoting === actionTarget.identity}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                      >
                        {promoting === actionTarget.identity ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
                        <span className="text-sm font-medium">Accept — Promote to Speaker</span>
                      </button>
                      <button
                        onClick={() => declineSpeakRequest(actionTarget.identity)}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-muted hover:bg-muted/80 text-foreground transition-colors"
                      >
                        <X className="w-5 h-5" />
                        <span className="text-sm font-medium">Decline Request</span>
                      </button>
                    </>
                  )}
                  {actionType === "listener" && !speakRequests.has(actionTarget.identity) && (
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
                      {forceMutedUsers.has(actionTarget.identity) && (
                        <button
                          onClick={() => handleForceUnmuteSingle(actionTarget.identity)}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                        >
                          <Unlock className="w-5 h-5" />
                          <span className="text-sm font-medium">Allow to Unmute</span>
                        </button>
                      )}
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
                  {/* Make / Remove Co-Host — host only */}
                  {isHost && actionTarget.identity !== hostId && (
                    coHostIds.includes(actionTarget.identity) ? (
                      <button
                        onClick={() => invokeAction("remove_cohost", actionTarget.identity)}
                        disabled={promoting === actionTarget.identity}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-muted hover:bg-muted/80 text-foreground transition-colors"
                      >
                        <UserMinus className="w-5 h-5" />
                        <span className="text-sm font-medium">Remove Co-Host</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => invokeAction("make_cohost", actionTarget.identity)}
                        disabled={promoting === actionTarget.identity}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-accent hover:bg-accent/80 text-accent-foreground transition-colors"
                      >
                        <UserPlus className="w-5 h-5" />
                        <span className="text-sm font-medium">Make Co-Host 👑</span>
                      </button>
                    )
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
