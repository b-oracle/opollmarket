import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import { useCommissionSettings } from "@/hooks/useCommissionSettings";
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
  Pencil,
  Check,
  Video,
  VideoOff,
  Monitor,
  MonitorOff,
  SwitchCamera,
  CornerDownRight,
} from "lucide-react";
import NftBadge, { VerificationLevel } from "@/components/NftBadge";
import { useActiveSpace } from "@/hooks/useActiveSpace";
import SpaceMiniPlayer from "./SpaceMiniPlayer";
import SpaceVideoGrid from "./SpaceVideoGrid";
import TaggedMarketsCarousel from "./TaggedMarketsCarousel";
import { SOUND_REACTIONS, playSoundById, AMBIENT_TRACKS, startAmbient, stopAmbient, isAmbientPlaying, warmAudioContext } from "@/lib/spaceSounds";
import { Music, ChevronDown, Upload, Square, Play, Pause, Search, Tv, Library } from "lucide-react";
import { optimizedImageUrl as optimizedImg } from "@/lib/optimizedImage";
import YouTubeEmbed, { isStreamUrl } from "@/components/YouTubeEmbed";
import JamendoMusicBrowser from "./JamendoMusicBrowser";

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
  hasVideo?: boolean;
  hasScreenShare?: boolean;
  videoTrack?: any;
  screenShareTrack?: any;
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
  reactions?: Record<string, string[]>; // emoji -> array of user ids
  replyToId?: string;
  replyToContent?: string;
  replyToName?: string;
}

const REACTIONS = ["🙏🏽", "👎🏽", "✌🏽", "👌🏽", "🌹", "💝", "🔥", "🕺", "💃", "👏", "👍", "❤️", "😂", "💯", "🎯"];
const GIFT_EMOJIS = ["💸", "🤑", "💰", "💵", "🌹", "💝", "🔥", "🕺", "💃", "👏", "👍", "❤️", "😂", "💯", "🎯", "👱🏼‍♀️"];
const EMOJI_PRICES: Record<string, number> = {
  "💸": 0.10, "🤑": 0.25, "💰": 0.50, "💵": 0.05, "🌹": 0.10, "💝": 0.25, "🔥": 0.05, "👱🏼‍♀️": 50.00,
};
const CHAT_REACTIONS = ["👍", "❤️", "😂", "🔥", "👏", "🕺", "💃"];

const SpaceRoom = ({ spaceId, spaceTitle, hostId, onClose }: SpaceRoomProps) => {
  const { user } = useAuth();
  const { isFeatureEnabled } = useFeatureToggles();
  const queryClient = useQueryClient();
  const { minimized, toggleMinimize } = useActiveSpace();
  const { data: commissionSettings } = useCommissionSettings();
  const giftFeePercent = commissionSettings?.gift_fee_percent ?? 2;
  // Editable title state
  const [displayTitle, setDisplayTitle] = useState(spaceTitle);
  const [editingTitle, setEditingTitle] = useState(false);
   const [editTitleValue, setEditTitleValue] = useState(spaceTitle);
  const [savingTitle, setSavingTitle] = useState(false);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [showStreamInput, setShowStreamInput] = useState(false);
  const [streamInputValue, setStreamInputValue] = useState("");
  const [streamCollapsed, setStreamCollapsed] = useState(false);

  const handleSaveTitle = async () => {
    const trimmed = editTitleValue.trim();
    if (!trimmed || trimmed === displayTitle) { setEditingTitle(false); return; }
    setSavingTitle(true);
    const { error } = await supabase
      .from("spaces" as any)
      .update({ title: trimmed } as any)
      .eq("id", spaceId);
    if (error) { toast.error("Failed to update title"); }
    else { setDisplayTitle(trimmed); queryClient.invalidateQueries({ queryKey: ["spaces"] }); }
    setSavingTitle(false);
    setEditingTitle(false);
  };
  const roomRef = useRef<Room | null>(null);
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const chatEndRef = useRef<HTMLDivElement>(null);
  const avatarRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const gridContainerRef = useRef<HTMLDivElement>(null);

  const [connecting, setConnecting] = useState(true);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const intentionalLeaveRef = useRef(false);
  const [muted, setMuted] = useState(true);
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileInfo>>({});
  const [isHost, setIsHost] = useState(false);
  const [isCoHost, setIsCoHost] = useState(false);
  const isHostRef = useRef(false);
  const isCoHostRef = useRef(false);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  useEffect(() => { isCoHostRef.current = isCoHost; }, [isCoHost]);
  const [spaceCoHostIds, setSpaceCoHostIds] = useState<string[]>([]);
  const [handRaised, setHandRaised] = useState(false);
  const [canPublish, setCanPublish] = useState(false);
  const [promoting, setPromoting] = useState<string | null>(null);

  // Video & Screen Share state
  const [cameraOn, setCameraOn] = useState(false);
  const [facingBack, setFacingBack] = useState(false);
  const [screenShareOn, setScreenShareOn] = useState(false);
  const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());

  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; name: string; text: string } | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [floatingReactions, setFloatingReactions] = useState<{ id: string; emoji: string; identity: string; label?: string }[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [emojiTarget, setEmojiTarget] = useState<ParticipantInfo | null>(null);
  const [showGiftUserMenu, setShowGiftUserMenu] = useState(false);
  const navigate = useNavigate();
  const [giftBalance, setGiftBalance] = useState<number>(0);
  const [rewardsBalance, setRewardsBalance] = useState<number>(0);
  const [sendingGift, setSendingGift] = useState(false);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [convertAmount, setConvertAmount] = useState("");
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [convertLoading, setConvertLoading] = useState(false);
  const [showAudioPrompt, setShowAudioPrompt] = useState(false);
  const audioEnabledRef = useRef(false);
  const [mainBalance, setMainBalance] = useState<number>(0);
  const [showSelfStats, setShowSelfStats] = useState(false);
  const [selfSpaceStats, setSelfSpaceStats] = useState<{ sent: number; received: number; sentCount: number; receivedCount: number }>({ sent: 0, received: 0, sentCount: 0, receivedCount: 0 });
  const [giftActivities, setGiftActivities] = useState<Array<{ id: string; emoji: string; amount: number; created_at: string; direction: 'sent' | 'received'; other_name: string; other_id: string }>>([]);
  const loadedMsgIdsRef = useRef<Set<string>>(new Set());
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteSearchQuery, setInviteSearchQuery] = useState("");
  const [inviteSearchResults, setInviteSearchResults] = useState<{ id: string; display_name: string; avatar_url: string | null }[]>([]);
  const [inviteSearching, setInviteSearching] = useState(false);
  const [inviteSending, setInviteSending] = useState<string | null>(null);

  // Fetch gift balance on mount
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("balances")
        .select("gift_balance, rewards_balance")
        .eq("user_id", user.id)
        .eq("currency", "USDT")
        .maybeSingle();
      if (data) {
        setGiftBalance(Number((data as any).gift_balance ?? 0));
        setRewardsBalance(Number((data as any).rewards_balance ?? 0));
      }
    })();
  }, [user]);

  // Invite user search
  useEffect(() => {
    if (!inviteSearchQuery.trim() || !user) { setInviteSearchResults([]); return; }
    const timeout = setTimeout(async () => {
      setInviteSearching(true);
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .neq("id", user.id)
        .ilike("display_name", `%${inviteSearchQuery.trim()}%`)
        .limit(10);
      setInviteSearchResults(data || []);
      setInviteSearching(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [inviteSearchQuery, user]);

  const handleSendInvite = async (inviteeId: string, inviteeName: string) => {
    setInviteSending(inviteeId);
    try {
      const { error: inviteErr } = await supabase.from("space_invites" as any).insert({
        space_id: spaceId,
        inviter_id: user!.id,
        invitee_id: inviteeId,
      });
      if (inviteErr) {
        if (inviteErr.message?.includes("duplicate") || inviteErr.code === "23505") {
          toast.info(`${inviteeName} already invited`);
        } else {
          throw new Error(inviteErr.message);
        }
      } else {
        // Notification is handled by the DB trigger (trg_notify_space_invitee)
        toast.success(`Invited ${inviteeName}`);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to invite");
    } finally {
      setInviteSending(null);
    }
  };

  // Fetch self space stats when opening self stats sheet
  useEffect(() => {
    if (!showSelfStats || !user) return;
    (async () => {
      // Refresh balances
      const { data: balData } = await supabase
        .from("balances")
        .select("gift_balance, rewards_balance")
        .eq("user_id", user.id)
        .eq("currency", "USDT")
        .maybeSingle();
      if (balData) {
        setGiftBalance(Number((balData as any).gift_balance ?? 0));
        setRewardsBalance(Number((balData as any).rewards_balance ?? 0));
      }
      // Gifts sent in this space
      const { data: sentData } = await supabase
        .from("space_gifts")
        .select("id, amount, emoji, created_at, recipient_id")
        .eq("sender_id", user.id)
        .eq("space_id", spaceId)
        .order("created_at", { ascending: false });
      const sentTotal = (sentData || []).reduce((s, r) => s + Number(r.amount), 0);
      // Gifts received in this space
      const { data: recvData } = await supabase
        .from("space_gifts")
        .select("id, amount, emoji, created_at, sender_id")
        .eq("recipient_id", user.id)
        .eq("space_id", spaceId)
        .order("created_at", { ascending: false });
      const recvTotal = (recvData || []).reduce((s, r) => s + Number(r.amount), 0);
      setSelfSpaceStats({
        sent: sentTotal,
        received: recvTotal,
        sentCount: sentData?.length || 0,
        receivedCount: recvData?.length || 0,
      });

      // Fetch profile names for gift activities
      const sentIds = (sentData || []).map(g => g.recipient_id).filter(Boolean);
      const recvIds = (recvData || []).map(g => g.sender_id).filter(Boolean);
      const allIds = [...new Set([...sentIds, ...recvIds])];
      let profileMap: Record<string, string> = {};
      if (allIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", allIds);
        (profiles || []).forEach((p: any) => { profileMap[p.id] = p.display_name || "Anonymous"; });
      }

      const activities = [
        ...(sentData || []).map((g: any) => ({
          id: g.id,
          emoji: g.emoji,
          amount: Number(g.amount),
          created_at: g.created_at,
          direction: 'sent' as const,
          other_name: profileMap[g.recipient_id] || "Anonymous",
          other_id: g.recipient_id,
        })),
        ...(recvData || []).map((g: any) => ({
          id: g.id,
          emoji: g.emoji,
          amount: Number(g.amount),
          created_at: g.created_at,
          direction: 'received' as const,
          other_name: profileMap[g.sender_id] || "Anonymous",
          other_id: g.sender_id,
        })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setGiftActivities(activities);
    })();
  }, [showSelfStats, user, spaceId]);

  // Load persisted chat history + subscribe to realtime new messages
  useEffect(() => {
    if (!spaceId || !user) return;
    let cancelled = false;

    // Load existing messages
    (async () => {
      const { data } = await supabase
        .from("space_messages")
        .select("id, user_id, user_name, content, created_at, reactions, reply_to_id, reply_to_content, reply_to_name")
        .eq("space_id", spaceId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (cancelled || !data) return;
      const loaded: ChatMessage[] = data.map((m: any) => {
        loadedMsgIdsRef.current.add(m.id);
        return {
          id: m.id,
          sender: m.user_id,
          senderName: m.user_id === user?.id ? "You" : m.user_name,
          text: m.content,
          type: "message" as const,
          timestamp: new Date(m.created_at).getTime(),
          reactions: m.reactions && typeof m.reactions === "object" && Object.keys(m.reactions as Record<string, unknown>).length > 0 ? (m.reactions as Record<string, string[]>) : undefined,
          replyToId: m.reply_to_id || undefined,
          replyToContent: m.reply_to_content || undefined,
          replyToName: m.reply_to_name || undefined,
        };
      });
      setMessages(loaded);
    })();

    // Subscribe to new messages via realtime
    const channel = supabase
      .channel(`space-chat-${spaceId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "space_messages", filter: `space_id=eq.${spaceId}` },
        (payload: any) => {
          const m = payload.new;
          if (!m || loadedMsgIdsRef.current.has(m.id)) return;
          // Skip own messages (already added optimistically)
          if (m.user_id === user?.id) return;
          loadedMsgIdsRef.current.add(m.id);
          setMessages((prev) => [
            ...prev,
            {
              id: m.id,
              sender: m.user_id,
              senderName: m.user_name || "Unknown",
              text: m.content,
              type: "message" as const,
              timestamp: new Date(m.created_at).getTime(),
              replyToId: m.reply_to_id || undefined,
              replyToContent: m.reply_to_content || undefined,
              replyToName: m.reply_to_name || undefined,
            },
          ]);
          setChatOpen((open) => {
            if (!open) setUnreadCount((c) => c + 1);
            return open;
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "space_messages", filter: `space_id=eq.${spaceId}` },
        (payload: any) => {
          const m = payload.new;
          if (!m) return;
          // Sync reaction updates from DB to local state
          const dbReactions = m.reactions && typeof m.reactions === "object" && Object.keys(m.reactions).length > 0
            ? (m.reactions as Record<string, string[]>)
            : undefined;
          setMessages((prev) =>
            prev.map((msg) => msg.id === m.id ? { ...msg, reactions: dbReactions } : msg)
          );
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [spaceId, user]);

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
  const [taggedMarketIds, setTaggedMarketIds] = useState<string[]>([]);
  const [ambientTrack, setAmbientTrack] = useState<string | null>(null);
  const [showMusicMenu, setShowMusicMenu] = useState(false);

   // Device music state
  const [deviceMusicPlaying, setDeviceMusicPlaying] = useState(false);
  const [djIdentity, setDjIdentity] = useState<string | null>(null);
  const [deviceMusicPaused, setDeviceMusicPaused] = useState(false);
  const [deviceMusicName, setDeviceMusicName] = useState<string | null>(null);
  const [deviceMusicVolume, setDeviceMusicVolume] = useState(0.5);
  const [deviceMusicLoop, setDeviceMusicLoop] = useState(false);
  const deviceMusicCtxRef = useRef<AudioContext | null>(null);
  const deviceMusicSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const deviceMusicGainRef = useRef<GainNode | null>(null);
  const deviceMusicDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const deviceMusicTrackRef = useRef<any>(null); // published LiveKit track
  const deviceMusicBufferRef = useRef<AudioBuffer | null>(null);
  const deviceMusicOffsetRef = useRef<number>(0);
  const deviceMusicStartTimeRef = useRef<number>(0);
  const deviceFileInputRef = useRef<HTMLInputElement>(null);
  const [showJamendoBrowser, setShowJamendoBrowser] = useState(false);

  // Fetch tagged market IDs for this space + subscribe to realtime updates
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("spaces" as any)
        .select("tagged_market_ids")
        .eq("id", spaceId)
        .single();
      if (data && (data as any).tagged_market_ids) {
        setTaggedMarketIds((data as any).tagged_market_ids);
      }
    })();

    // Also fetch stream_url
    (async () => {
      const { data: sData } = await supabase
        .from("spaces" as any)
        .select("stream_url")
        .eq("id", spaceId)
        .single();
      if (sData && (sData as any).stream_url) {
        setStreamUrl((sData as any).stream_url);
      }
    })();

    const channel = supabase
      .channel(`space-tags-${spaceId}`)
      .on(
        "postgres_changes" as any,
        { event: "UPDATE", schema: "public", table: "spaces", filter: `id=eq.${spaceId}` },
        (payload: any) => {
          if (payload.new?.tagged_market_ids) {
            setTaggedMarketIds(payload.new.tagged_market_ids);
          }
          if (payload.new?.title) {
            setDisplayTitle(payload.new.title);
          }
          if (payload.new?.stream_url !== undefined) {
            setStreamUrl(payload.new.stream_url || null);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [spaceId]);
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
  const visChangeHandlerRef = useRef<(() => void) | null>(null);

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

        // Resume remote audio playback that browsers suspend on background
        try {
          await room.startAudio();
        } catch {}

        // Force-resume any suspended remote audio tracks
        try {
          room.remoteParticipants.forEach((p) => {
            p.audioTrackPublications.forEach((pub) => {
              if (pub.track && pub.track.mediaStreamTrack) {
                pub.track.mediaStreamTrack.enabled = true;
                // Re-attach to audio element if detached
                const els = pub.track.attachedElements;
                if (els && els.length > 0) {
                  els.forEach((el: HTMLMediaElement) => {
                    if (el.paused) {
                      el.play().catch(() => {});
                    }
                  });
                }
              }
            });
          });
        } catch {}

        // Restore mic state to what it was before backgrounding
        // This prevents navigation or minimize from muting speakers
        const shouldBeUnmuted = wasMicOnRef.current && canPublish && !forceMuted;

        // Re-enable audio tracks that may have been suspended by the browser
        room.localParticipant.audioTrackPublications.forEach((pub) => {
          if (pub.track) {
            pub.track.mediaStreamTrack.enabled = shouldBeUnmuted || !muted;
          }
        });

        // If the user had mic on before backgrounding, fully re-enable it
        if (shouldBeUnmuted) {
          try {
            await room.localParticipant.setMicrophoneEnabled(true);
            setMuted(false);
          } catch {
            // If re-enabling fails, don't force mute — keep the UI consistent
          }
        }

        // Restart MediaRecorder if it was interrupted while recording
        if (recording && mediaRecorderRef.current?.state === "inactive") {
          try {
            if (recordedChunksRef.current.length > 0) {
              const partialBlob = new Blob(recordedChunksRef.current, { type: "audio/webm" });
              if (partialBlob.size > 1000) {
                // Keep chunks for final upload
              }
            }
            const dest = recordingDestRef.current;
            if (dest) {
              const recMime = MediaRecorder.isTypeSupported("audio/mp4")
                ? "audio/mp4"
                : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
                  ? "audio/webm;codecs=opus"
                  : "audio/webm";
              const recorder = new MediaRecorder(dest.stream, { mimeType: recMime });
              recorder.ondataavailable = (e) => {
                if (e.data.size > 0) recordedChunksRef.current.push(e.data);
              };
              recorder.start(1000);
              mediaRecorderRef.current = recorder;
            }
          } catch {}
        }
      } else {
        // Going to background — track mic state so we can restore it
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
      let videoTrack: any = null;
      let screenShareTrack: any = null;
      p.videoTrackPublications?.forEach((pub: any) => {
        if (pub.track && pub.isSubscribed !== false) {
          if (pub.source === Track.Source.ScreenShare) {
            screenShareTrack = pub.track;
          } else if (pub.source === Track.Source.Camera) {
            videoTrack = pub.track;
          }
        }
      });
      all.push({
        identity: p.identity,
        name: p.name || p.identity.slice(0, 8),
        isSpeaking: p.isSpeaking,
        isMuted: !p.isMicrophoneEnabled,
        audioTrack: p.audioTrackPublications.size > 0,
        canPublish: p.permissions?.canPublish ?? false,
        hasVideo: !!videoTrack,
        hasScreenShare: !!screenShareTrack,
        videoTrack,
        screenShareTrack,
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
      if (data.type === "sound_reaction") {
        // Play the sound effect for all participants
        playSoundById(data.soundId);
        const id = `${Date.now()}-${Math.random()}`;
        const emoji = SOUND_REACTIONS.find(s => s.id === data.soundId)?.emoji || "🔊";
        const senderIdentity = participant?.identity || "unknown";
        setFloatingReactions((prev) => [...prev, { id, emoji, identity: senderIdentity }]);
        setTimeout(() => setFloatingReactions((prev) => prev.filter((r) => r.id !== id)), 2000);
      } else if (data.type === "reaction") {
        const id = `${Date.now()}-${Math.random()}`;
        const senderIdentity = participant?.identity || "unknown";
        setFloatingReactions((prev) => [...prev, { id, emoji: data.emoji, identity: senderIdentity }]);
        setTimeout(() => setFloatingReactions((prev) => prev.filter((r) => r.id !== id)), 2000);
      } else if (data.type === "ambient_music") {
        if (data.action === "play" && data.trackId) {
          startAmbient(data.trackId);
          setAmbientTrack(data.trackId);
        } else if (data.action === "stop") {
          stopAmbient();
          setAmbientTrack(null);
        }
      } else if (data.type === "message") {
        // Messages are delivered via Postgres realtime subscription.
        // Data channel delivery is intentionally ignored to prevent duplicates.
        // The realtime INSERT handler (line ~140) is the single source of truth.
      } else if (data.type === "msg_reaction") {
        // Someone reacted to a chat message
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== data.messageId) return m;
            const reactions = { ...(m.reactions || {}) };
            const users = reactions[data.emoji] ? [...reactions[data.emoji]] : [];
            const idx = users.indexOf(data.userId);
            if (idx >= 0) users.splice(idx, 1);
            else users.push(data.userId);
            if (users.length === 0) delete reactions[data.emoji];
            else reactions[data.emoji] = users;
            return { ...m, reactions };
          })
        );
      } else if (data.type === "hand_raise") {
        const identity = participant?.identity;
        if (identity) {
          if (data.raised) {
            setRemoteHandRaises((prev) => new Set(prev).add(identity));
            if (isHostRef.current || isCoHostRef.current) {
              toast.info(`${data.senderName || "Someone"} raised their hand ✋`);
            }
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
          if (isHostRef.current || isCoHostRef.current) {
            toast.info(`${data.senderName || "Someone"} wants to speak 🎙️`);
          }
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
      } else if (data.type === "force_lower_hand") {
        if (user && data.targetId === user.id) {
          setHandRaised(false);
          toast.info("Your hand was lowered by the host ✋");
        }
        // Also remove from remote hand raises for all participants
        if (data.targetId) {
          setRemoteHandRaises((prev) => {
            const next = new Set(prev);
            next.delete(data.targetId);
            return next;
          });
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
      } else if (data.type === "targeted_emoji") {
        // Show floating reaction from target's avatar for everyone
        const id = `${Date.now()}-${Math.random()}`;
        const label = data.targetId === user?.id
          ? `${data.senderName} gifted you`
          : `${data.senderName} gifted ${data.emoji}`;
        setFloatingReactions((prev) => [...prev, { id, emoji: data.emoji, identity: data.targetId, label }]);
        setTimeout(() => setFloatingReactions((prev) => prev.filter((r) => r.id !== id)), 2000);
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

  // Scroll to bottom when chat panel opens
  useEffect(() => {
    if (chatOpen) {
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "instant" }), 50);
    }
  }, [chatOpen]);

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

        // DJ detection: track who is playing device music
        room.on(RoomEvent.TrackPublished, (pub, participant) => {
          if (pub.source === Track.Source.ScreenShareAudio && pub.trackName === "device-music") {
            setDjIdentity(participant.identity);
          }
        });
        room.on(RoomEvent.TrackUnpublished, (pub, participant) => {
          if (pub.source === Track.Source.ScreenShareAudio && pub.trackName === "device-music") {
            setDjIdentity(prev => prev === participant.identity ? null : prev);
          }
        });

        room.on(RoomEvent.ParticipantConnected, () => updateParticipants(room));
        room.on(RoomEvent.ParticipantDisconnected, (p) => {
          setDjIdentity(prev => prev === p.identity ? null : prev);
          updateParticipants(room);
        });
        room.on(RoomEvent.TrackMuted, (pub, participant) => {
          updateParticipants(room);
          // Detect browser auto-muting the local mic (e.g. on app switch)
          // and restore it if the user didn't intentionally mute
          if (
            participant.identity === room.localParticipant.identity &&
            pub.source === Track.Source.Microphone &&
            wasMicOnRef.current &&
            !forceMuted
          ) {
            // Wait a moment then try to re-enable
            setTimeout(async () => {
              try {
                if (roomRef.current && wasMicOnRef.current && !forceMuted) {
                  await room.localParticipant.setMicrophoneEnabled(true);
                }
              } catch {}
            }, 500);
          }
        });
        room.on(RoomEvent.TrackUnmuted, () => updateParticipants(room));

        // Restore mic when returning from app switch / minimize
        const handleVisibilityChange = async () => {
          if (document.visibilityState === "visible" && roomRef.current && wasMicOnRef.current && !forceMuted) {
            try {
              const micPub = roomRef.current.localParticipant.getTrackPublication(Track.Source.Microphone);
              if (micPub?.isMuted) {
                await roomRef.current.localParticipant.setMicrophoneEnabled(true);
              }
            } catch {}
          }
        };
        visChangeHandlerRef.current = handleVisibilityChange;
        document.addEventListener("visibilitychange", handleVisibilityChange);

        room.on(RoomEvent.ActiveSpeakersChanged, () => updateParticipants(room));
        room.on(RoomEvent.ParticipantPermissionsChanged, () => {
          updateParticipants(room);
          const perms = room.localParticipant.permissions;
          if (perms?.canPublish) {
            setCanPublish((prev) => {
              if (!prev) {
                setRequestPending(false);
                toast.success("You've been promoted to speaker! 🎙️");
              }
              return true;
            });
          } else {
            setCanPublish(false);
          }
        });
        room.on(RoomEvent.DataReceived, handleDataReceived);
        room.on(RoomEvent.Disconnected, async (reason?: any) => {
          // If the host kicked this user, do NOT auto-reconnect.
          // LiveKit emits DisconnectReason.PARTICIPANT_REMOVED (numeric value 4) when removeParticipant is called.
          const wasKicked =
            reason === 4 ||
            reason === "PARTICIPANT_REMOVED" ||
            (typeof reason === "string" && reason.toUpperCase().includes("REMOVED"));

          if (cancelled || intentionalLeaveRef.current || wasKicked) {
            if (wasKicked && !cancelled) {
              toast.info("You were removed from this Space by the host");
            }
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
                  // Space ended, not live, or user was kicked
                  if (typeof reconData.error === "string" && (
                    reconData.error.includes("ended") ||
                    reconData.error.includes("isn't live") ||
                    reconData.error.toLowerCase().includes("removed") ||
                    reconData.error.toLowerCase().includes("kicked") ||
                    reconData.error.toLowerCase().includes("banned")
                  )) {
                    toast.info(reconData.error.toLowerCase().includes("removed") || reconData.error.toLowerCase().includes("kicked")
                      ? "You were removed from this Space"
                      : "This Space has ended");
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
          // Restore mic state — don't force-mute speakers on reconnect
          if (!muted && canPublish && !forceMuted) {
            try {
              await room.localParticipant.setMicrophoneEnabled(true);
            } catch {}
          }
        });

        await room.connect(normUrl(data.url), data.token);
        // Pre-warm AudioContext during this user-gesture-initiated flow
        // so that ambient music from data channel events won't be blocked
        warmAudioContext();
        if (cancelled) { room.disconnect(); return; }

        setConnected(true);
        setConnecting(false);
        if (!audioEnabledRef.current) {
          setShowAudioPrompt(true);
        }

        // Fetch co_host_ids from space
        const { data: spaceData } = await supabase
          .from("spaces")
          .select("co_host_ids")
          .eq("id", spaceId)
          .single();
        if (spaceData?.co_host_ids) {
          setSpaceCoHostIds(spaceData.co_host_ids as string[]);
        }

        // Host/co-host join muted — they must unmute manually
        setMuted(true);

        updateParticipants(room);

        await supabase.from("space_participants").upsert(
          { space_id: spaceId, user_id: user.id, role: (data.isHost ? "host" : data.isCoHost ? "co_host" : "listener") as any, left_at: null },
          { onConflict: "space_id,user_id" }
        );
        queryClient.invalidateQueries({ queryKey: ["spaces"] });

        // Auto-restart recording if it was active before host left/reconnected
        if (recording && !mediaRecorderRef.current && data.isHost) {
          try {
            const ctx = new AudioContext();
            audioContextRef.current = ctx;
            const destination = ctx.createMediaStreamDestination();
            recordingDestRef.current = destination;

            // Mix local mic
            const localStream = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStream;
            if (localStream) {
              ctx.createMediaStreamSource(localStream).connect(destination);
            }
            // Mix remote audio
            room.remoteParticipants.forEach((rp) => {
              rp.getTrackPublications().forEach((pub) => {
                if (pub.track?.kind === "audio") {
                  const els = pub.track.attachedElements;
                  if (els.length > 0 && els[0].srcObject instanceof MediaStream) {
                    try { ctx.createMediaStreamSource(els[0].srcObject).connect(destination); } catch {}
                  }
                }
              });
            });

            const recMime = MediaRecorder.isTypeSupported("audio/mp4")
              ? "audio/mp4"
              : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
                ? "audio/webm;codecs=opus"
                : "audio/webm";
            const recorder = new MediaRecorder(destination.stream, { mimeType: recMime });
            recorder.ondataavailable = (e) => {
              if (e.data.size > 0) recordedChunksRef.current.push(e.data);
            };
            recorder.start(1000);
            mediaRecorderRef.current = recorder;
            toast.success("Recording resumed 🔴");
          } catch {}
        }
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
      document.removeEventListener("visibilitychange", visChangeHandlerRef.current!);
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
      wasMicOnRef.current = muted; // muted was the old state, so if muted=true we're unmuting
    } catch { toast.error("Microphone access denied"); }
  };

  // Check if current user is verified (blue or gold)
  const myProfile = profiles[user?.id || ""];
  const isVerified = myProfile?.verification_level === "blue" || myProfile?.verification_level === "gold";
  const canUseVideo = isVerified && canPublish && isFeatureEnabled("live_streaming");

  const getScreenShareUnsupportedMessage = () => {
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      return "Screen sharing isn't available in this environment";
    }

    const ua = navigator.userAgent;
    const isIOSDevice = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const hasDisplayMedia = Boolean(navigator.mediaDevices?.getDisplayMedia);

    if (isIOSDevice) {
      return "Screen sharing isn't supported on iPhone/iPad browsers yet. Use a desktop browser for now.";
    }

    if (!hasDisplayMedia) {
      return "Screen sharing isn't supported in this browser. Try Chrome or Edge on desktop.";
    }

    return null;
  };

  const toggleCamera = async () => {
    if (!roomRef.current || !canUseVideo) {
      if (!isVerified) toast.error("Video is available for verified users only");
      return;
    }
    try {
      await roomRef.current.localParticipant.setCameraEnabled(!cameraOn);
      setCameraOn(!cameraOn);
      updateParticipants(roomRef.current);
    } catch {
      toast.error("Camera access denied");
    }
  };

  const flipCamera = async () => {
    if (!roomRef.current || !cameraOn) return;
    try {
      const newFacing = !facingBack;
      const desiredFacingMode = newFacing ? "environment" : "user";

      // Get list of video devices and pick one matching the desired facing mode
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === "videoinput");

      if (videoDevices.length < 2) {
        toast.error("No other camera found on this device");
        return;
      }

      // Try to find a device matching the desired facing mode via a temporary stream
      let targetDeviceId: string | undefined;
      try {
        const testStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { exact: desiredFacingMode } },
        });
        const track = testStream.getVideoTracks()[0];
        targetDeviceId = track.getSettings().deviceId;
        track.stop();
      } catch {
        // Fallback: just pick a different device than the current one
        const currentTrack = roomRef.current.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
        const currentDeviceId = currentTrack?.mediaStreamTrack?.getSettings()?.deviceId;
        const other = videoDevices.find((d) => d.deviceId !== currentDeviceId);
        targetDeviceId = other?.deviceId;
      }

      if (!targetDeviceId) {
        toast.error("Could not find another camera");
        return;
      }

      // Use switchActiveDevice which is the correct LiveKit API
      await roomRef.current.switchActiveDevice("videoinput", targetDeviceId);
      setFacingBack(newFacing);
      updateParticipants(roomRef.current);
    } catch (err) {
      console.error("flipCamera error:", err);
      toast.error("Failed to switch camera");
    }
  };

  const toggleScreenShare = async () => {
    if (!roomRef.current || !canUseVideo) {
      if (!isVerified) toast.error("Screen sharing is available for verified users only");
      return;
    }

    if (!screenShareOn) {
      const unsupportedMessage = getScreenShareUnsupportedMessage();
      if (unsupportedMessage) {
        toast.error(unsupportedMessage);
        return;
      }
    }

    try {
      await roomRef.current.localParticipant.setScreenShareEnabled(!screenShareOn);
      setScreenShareOn(!screenShareOn);
      updateParticipants(roomRef.current);
    } catch (err: any) {
      const errorText = `${err?.name || ""} ${err?.message || ""}`.toLowerCase();

      if (errorText.includes("cancel")) {
        return;
      }

      if (errorText.includes("denied") || errorText.includes("notallowederror")) {
        toast.error("Screen sharing permission was denied");
      } else if (
        errorText.includes("notsupported") ||
        errorText.includes("not supported") ||
        errorText.includes("getdisplaymedia") ||
        errorText.includes("notimplemented")
      ) {
        toast.error(getScreenShareUnsupportedMessage() || "Screen sharing isn't supported in this browser");
      } else {
        toast.error(err?.message || "Screen share failed");
      }

      console.error("Screen share failed:", err);
    }
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
    participants.forEach((p) => {
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

  const forceHandDown = (targetId: string) => {
    setRemoteHandRaises((prev) => {
      const next = new Set(prev);
      next.delete(targetId);
      return next;
    });
    if (roomRef.current) {
      const msg = JSON.stringify({ type: "force_lower_hand", targetId });
      roomRef.current.localParticipant.publishData(new TextEncoder().encode(msg), { reliable: true });
    }
    setActionTarget(null);
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
    // Stop ambient music if playing
    stopAmbient();
    // Stop device music if playing
    if (deviceMusicPlaying) await stopDeviceMusic();

    // If recording is active, pause the recorder but KEEP chunks for later
    if (recording && mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
      // Close audio context but keep chunks and recording flag
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        try { audioContextRef.current.close(); } catch {}
      }
      audioContextRef.current = null;
      mediaRecorderRef.current = null;
      recordingDestRef.current = null;
      // Do NOT clear recordedChunksRef — keep them for when host rejoins
      // Do NOT set recording to false — it will auto-restart on reconnect
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
    stopAmbient();
    if (deviceMusicPlaying) await stopDeviceMusic();
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
    // Client-side guard: only verified users can be made co-host (unless toggle allows unverified)
    if (action === "make_cohost" && target_user_id) {
      const allowUnverified = isFeatureEnabled("allow_unverified_spaces");
      const targetProfile = profiles[target_user_id];
      const targetVerification = targetProfile?.verification_level || "none";
      if (targetVerification === "none" && !allowUnverified) {
        toast.error("Only verified members (Blue or Gold tick) can be co-hosts");
        return;
      }
    }
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
        setSpeakRequests((prev) => {
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
      // Clear indicators when making co-host (same as promote)
      if (action === "make_cohost" && target_user_id) {
        setRemoteHandRaises((prev) => {
          const next = new Set(prev);
          next.delete(target_user_id);
          return next;
        });
        setSpeakRequests((prev) => {
          const next = new Set(prev);
          next.delete(target_user_id);
          return next;
        });
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

  // Mention helpers
  const mentionSuggestions = React.useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return participants.filter(p => p.name.toLowerCase().includes(q) && p.identity !== user?.id).slice(0, 5);
  }, [mentionQuery, participants, user?.id]);

  const handleChatInputChange = (val: string) => {
    setChatInput(val);
    const cursorPos = chatInputRef.current?.selectionStart || val.length;
    const textBeforeCursor = val.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  };

  const insertMention = (name: string) => {
    const cursorPos = chatInputRef.current?.selectionStart || chatInput.length;
    const textBefore = chatInput.slice(0, cursorPos);
    const textAfter = chatInput.slice(cursorPos);
    const newBefore = textBefore.replace(/@(\w*)$/, `@${name} `);
    setChatInput(newBefore + textAfter);
    setMentionQuery(null);
    setTimeout(() => chatInputRef.current?.focus(), 0);
  };

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (mentionQuery !== null && mentionSuggestions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, mentionSuggestions.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); return; }
      if (e.key === "Tab" || e.key === "Enter") { e.preventDefault(); insertMention(mentionSuggestions[mentionIndex].name); return; }
      if (e.key === "Escape") { e.preventDefault(); setMentionQuery(null); return; }
    }
    if (e.key === "Enter") sendChat();
  };

  const renderMessageText = (text: string) => {
    const parts = text.split(/(@\w+)/g);
    return parts.map((part, i) => {
      if (part.startsWith("@")) {
        const name = part.slice(1);
        const isParticipant = participants.some(p => p.name === name);
        return <span key={i} className={`font-semibold ${isParticipant ? "text-primary cursor-pointer hover:underline" : ""}`}>{part}</span>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  const sendChat = () => {
    if (!chatInput.trim() || !roomRef.current) return;
    setMentionQuery(null);
    const text = chatInput.trim();
    const senderName = roomRef.current.localParticipant.name || "You";
    const currentReply = replyTo;

    // Still broadcast via data channel for instant delivery to connected peers
    const data = JSON.stringify({
      type: "message",
      text,
      senderName,
      ...(currentReply ? { replyToId: currentReply.id, replyToContent: currentReply.text, replyToName: currentReply.name } : {}),
    });
    roomRef.current.localParticipant.publishData(new TextEncoder().encode(data), { reliable: true });

    // Persist to DB (optimistic local add)
    const localId = `${Date.now()}-local`;
    setMessages((prev) => [
      ...prev,
      {
        id: localId,
        sender: user?.id || "",
        senderName: "You",
        text,
        type: "message",
        timestamp: Date.now(),
        ...(currentReply ? { replyToId: currentReply.id, replyToContent: currentReply.text, replyToName: currentReply.name } : {}),
      },
    ]);

    if (user?.id) {
      const insertPayload: any = {
        space_id: spaceId,
        user_id: user.id,
        user_name: senderName === "You" ? (user.email?.split("@")[0] || "Anonymous") : senderName,
        content: text,
      };
      if (currentReply) {
        insertPayload.reply_to_id = currentReply.id;
        insertPayload.reply_to_content = currentReply.text.slice(0, 200);
        insertPayload.reply_to_name = currentReply.name;
      }
      supabase
        .from("space_messages")
        .insert(insertPayload)
        .select("id")
        .then(({ data: inserted }) => {
          // Replace local id with real DB id so reactions can be persisted
          if (inserted && (inserted as any)[0]?.id) {
            const dbId = (inserted as any)[0].id;
            loadedMsgIdsRef.current.add(dbId);
            setMessages((prev) =>
              prev.map((m) => m.id === localId ? { ...m, id: dbId } : m)
            );
          }

          // Notify mentioned users
          const mentions = text.match(/@(\w+)/g);
          if (mentions && mentions.length > 0) {
            const mentionedNames = mentions.map((m: string) => m.slice(1));
            const mentionedUsers = participants.filter(
              (p) => mentionedNames.includes(p.name) && p.identity !== user.id
            );
            const senderDisplayName = insertPayload.user_name || "Someone";
            for (const mu of mentionedUsers) {
              supabase.from("notifications").insert({
                user_id: mu.identity,
                title: "You were mentioned 🎙️",
                message: `${senderDisplayName} mentioned you in a live space: "${text.length > 80 ? text.slice(0, 80) + "…" : text}"`,
                type: "info",
                market_id: spaceId,
                actor_id: user.id,
              }).then(() => {});
            }
          }
        });
    }

    setChatInput("");
    setReplyTo(null);
  };

  const sendReaction = (emoji: string) => {
    if (!roomRef.current || !user) return;
    const data = JSON.stringify({ type: "reaction", emoji });
    roomRef.current.localParticipant.publishData(new TextEncoder().encode(data), { reliable: false });
    const id = `${Date.now()}-${Math.random()}`;
    setFloatingReactions((prev) => [...prev, { id, emoji, identity: user.id }]);
    setTimeout(() => setFloatingReactions((prev) => prev.filter((r) => r.id !== id)), 2000);
  };

  const sendTargetedEmoji = async (emoji: string) => {
    if (!roomRef.current || !user || !emojiTarget || sendingGift) return;
    const targetId = emojiTarget.identity;
    const price = EMOJI_PRICES[emoji] ?? 0.05;
    const senderName = roomRef.current.localParticipant.name || user.email?.split("@")[0] || "Someone";

    if (giftBalance < price) {
      toast.error("Insufficient gift balance. Top up in your Commissions page.");
      return;
    }

    setSendingGift(true);

    try {
      // Call edge function for atomic gift + notification
      const { data: giftResult, error: giftError } = await supabase.functions.invoke("send-space-gift", {
        body: { recipientId: targetId, spaceId, emoji, amount: price },
      });

      if (giftError || giftResult?.error) {
        toast.error(giftResult?.error || giftError?.message || "Gift failed");
        setSendingGift(false);
        return;
      }

      // Update local gift balance
      setGiftBalance(Number(giftResult?.remaining_gift_balance ?? giftBalance - price));

      // Broadcast to all peers so floating emoji shows for everyone
      const data = JSON.stringify({ type: "targeted_emoji", emoji, targetId, senderName });
      roomRef.current.localParticipant.publishData(new TextEncoder().encode(data), { reliable: true });

      // Show locally too
      const id = `${Date.now()}-${Math.random()}`;
      const label = `You gifted ${emojiTarget.name}`;
      setFloatingReactions((prev) => [...prev, { id, emoji, identity: targetId, label }]);
      setTimeout(() => setFloatingReactions((prev) => prev.filter((r) => r.id !== id)), 2000);

      toast.success(`Sent ${emoji} ($${price.toFixed(2)}) to ${emojiTarget.name}!`);
    } catch {
      toast.error("Failed to send gift");
    } finally {
      setSendingGift(false);
    }

    setEmojiTarget(null);
  };

  const sendSoundReaction = (soundId: string) => {
    if (!roomRef.current || !user || !hasModPowers) return;
    // Play locally
    playSoundById(soundId);
    // Broadcast to peers
    const data = JSON.stringify({ type: "sound_reaction", soundId });
    roomRef.current.localParticipant.publishData(new TextEncoder().encode(data), { reliable: true });
    // Show floating emoji
    const emoji = SOUND_REACTIONS.find(s => s.id === soundId)?.emoji || "🔊";
    const id = `${Date.now()}-${Math.random()}`;
    setFloatingReactions((prev) => [...prev, { id, emoji, identity: user.id }]);
    setTimeout(() => setFloatingReactions((prev) => prev.filter((r) => r.id !== id)), 2000);
  };

  const toggleAmbientMusic = (trackId: string) => {
    if (!hasModPowers) return;
    if (ambientTrack === trackId) {
      stopAmbient();
      setAmbientTrack(null);
      // Broadcast stop to all participants
      if (roomRef.current) {
        const data = JSON.stringify({ type: "ambient_music", action: "stop" });
        roomRef.current.localParticipant.publishData(new TextEncoder().encode(data), { reliable: true });
      }
    } else {
      startAmbient(trackId);
      setAmbientTrack(trackId);
      // Broadcast play to all participants
      if (roomRef.current) {
        const data = JSON.stringify({ type: "ambient_music", action: "play", trackId });
        roomRef.current.localParticipant.publishData(new TextEncoder().encode(data), { reliable: true });
      }
    }
    setShowMusicMenu(false);
  };

  // === Online Music (Jamendo) ===
  const playOnlineTrack = async (url: string, name: string) => {
    if (!hasModPowers || !roomRef.current) return;
    // Stop any currently playing device music first
    if (deviceMusicPlaying) await stopDeviceMusic();

    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error("Failed to fetch track");
      const arrayBuffer = await resp.arrayBuffer();

      const ctx = new AudioContext();
      deviceMusicCtxRef.current = ctx;

      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      deviceMusicBufferRef.current = audioBuffer;

      const destination = ctx.createMediaStreamDestination();
      deviceMusicDestRef.current = destination;

      const gain = ctx.createGain();
      gain.gain.value = deviceMusicVolume;
      gain.connect(destination);
      gain.connect(ctx.destination);
      deviceMusicGainRef.current = gain;

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.loop = deviceMusicLoop;
      source.connect(gain);
      source.onended = () => {
        if (!deviceMusicPaused && !source.loop) stopDeviceMusic();
      };
      source.start(0);
      deviceMusicSourceRef.current = source;
      deviceMusicOffsetRef.current = 0;
      deviceMusicStartTimeRef.current = ctx.currentTime;

      const mediaTrack = destination.stream.getAudioTracks()[0];
      const pub = await roomRef.current.localParticipant.publishTrack(mediaTrack, {
        name: "device-music",
        source: Track.Source.ScreenShareAudio,
      });
      deviceMusicTrackRef.current = pub;

      setDeviceMusicPlaying(true);
      setDeviceMusicPaused(false);
      setDjIdentity(user?.id ?? null);
      setDeviceMusicName(name);
      setShowMusicMenu(false);
      setShowJamendoBrowser(false);
      toast.success(`Now playing: ${name} 🎵`);
    } catch (err: any) {
      toast.error(err.message || "Failed to play track");
      cleanupDeviceMusic();
    }
  };

  // === Device Music ===
  const handleDeviceMusicFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!hasModPowers) return;
    const file = e.target.files?.[0];
    if (!file || !roomRef.current) return;
    e.target.value = ""; // reset input

    try {
      const ctx = new AudioContext();
      deviceMusicCtxRef.current = ctx;

      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      deviceMusicBufferRef.current = audioBuffer;

      const destination = ctx.createMediaStreamDestination();
      deviceMusicDestRef.current = destination;

      const gain = ctx.createGain();
      gain.gain.value = deviceMusicVolume;
      gain.connect(destination);
      gain.connect(ctx.destination); // local playback so host can hear it too
      deviceMusicGainRef.current = gain;

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.loop = deviceMusicLoop;
      source.connect(gain);
      source.onended = () => {
        if (!deviceMusicPaused && !source.loop) stopDeviceMusic();
      };
      source.start(0);
      deviceMusicSourceRef.current = source;
      deviceMusicOffsetRef.current = 0;
      deviceMusicStartTimeRef.current = ctx.currentTime;

      // Publish the stream as a secondary audio track via LiveKit
      const mediaTrack = destination.stream.getAudioTracks()[0];
      const pub = await roomRef.current.localParticipant.publishTrack(mediaTrack, {
        name: "device-music",
        source: Track.Source.ScreenShareAudio,
      });
      deviceMusicTrackRef.current = pub;

      setDeviceMusicPlaying(true);
      setDeviceMusicPaused(false);
      setDjIdentity(user?.id ?? null);
      setDeviceMusicName(file.name);
      setShowMusicMenu(false);
      toast.success(`Now playing: ${file.name} 🎵`);
    } catch (err: any) {
      toast.error(err.message || "Failed to play audio file");
      cleanupDeviceMusic();
    }
  };

  const pauseDeviceMusic = () => {
    const source = deviceMusicSourceRef.current;
    const ctx = deviceMusicCtxRef.current;
    if (!source || !ctx) return;

    const elapsed = ctx.currentTime - deviceMusicStartTimeRef.current;
    deviceMusicOffsetRef.current += elapsed;

    try { source.stop(); } catch {}
    deviceMusicSourceRef.current = null;
    setDeviceMusicPaused(true);
  };

  const resumeDeviceMusic = () => {
    const ctx = deviceMusicCtxRef.current;
    const buffer = deviceMusicBufferRef.current;
    const gain = deviceMusicGainRef.current;
    if (!ctx || !buffer || !gain) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = deviceMusicLoop;
    source.connect(gain);
    source.onended = () => {
      if (!deviceMusicPaused && !source.loop) stopDeviceMusic();
    };
    source.start(0, deviceMusicOffsetRef.current);
    deviceMusicSourceRef.current = source;
    deviceMusicStartTimeRef.current = ctx.currentTime;
    setDeviceMusicPaused(false);
  };

  const cleanupDeviceMusic = () => {
    try { deviceMusicSourceRef.current?.stop(); } catch {}
    deviceMusicSourceRef.current = null;
    deviceMusicBufferRef.current = null;
    deviceMusicGainRef.current = null;
    deviceMusicDestRef.current = null;
    deviceMusicOffsetRef.current = 0;
    if (deviceMusicCtxRef.current && deviceMusicCtxRef.current.state !== "closed") {
      try { deviceMusicCtxRef.current.close(); } catch {}
    }
    deviceMusicCtxRef.current = null;
  };

  const stopDeviceMusic = async () => {
    // Unpublish from LiveKit
    const room = roomRef.current;
    const pub = deviceMusicTrackRef.current;
    if (room && pub) {
      try {
        await room.localParticipant.unpublishTrack(pub.track || pub);
      } catch {}
    }
    deviceMusicTrackRef.current = null;
    cleanupDeviceMusic();
    setDeviceMusicPlaying(false);
    setDeviceMusicPaused(false);
    setDeviceMusicName(null);
    setDjIdentity(prev => prev === user?.id ? null : prev);
  };

  const reactToMessage = (messageId: string, emoji: string) => {
    if (!user?.id) return;

    // Compute updated reactions from current messages state BEFORE calling setMessages
    // to avoid any timing issues with React 18 batched updates
    const currentMsg = messages.find((m) => m.id === messageId);
    if (!currentMsg) return;

    const reactions = { ...(currentMsg.reactions || {}) };
    const users = reactions[emoji] ? [...reactions[emoji]] : [];
    const idx = users.indexOf(user.id);
    if (idx >= 0) users.splice(idx, 1);
    else users.push(user.id);
    if (users.length === 0) delete reactions[emoji];
    else reactions[emoji] = users;

    const updatedReactions = { ...reactions };

    // Update local state
    setMessages((prev) =>
      prev.map((m) => m.id === messageId ? { ...m, reactions: Object.keys(updatedReactions).length > 0 ? updatedReactions : undefined } : m)
    );

    // Broadcast reaction to peers
    if (roomRef.current) {
      const data = JSON.stringify({ type: "msg_reaction", messageId, emoji, userId: user.id });
      roomRef.current.localParticipant.publishData(new TextEncoder().encode(data), { reliable: true });
    }

    // Persist reaction to DB (only for DB-persisted messages, not data-channel dedup keys)
    if (!messageId.startsWith("dc-") && !messageId.endsWith("-local")) {
      supabase.rpc("toggle_message_reaction" as any, {
        _table: "space_messages",
        _message_id: messageId,
        _emoji: emoji,
      }).then(({ error }: any) => {
        if (error) console.error("[SpaceRoom] Failed to persist reaction:", error.message);
      });
    }
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
      const mimeType = MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : "";
      const recorderOptions: MediaRecorderOptions = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(destination.stream, recorderOptions);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.start(1000); // collect chunks every second
      mediaRecorderRef.current = recorder;
      setRecording(true);

      // Auto-stop after 2 hours
      const MAX_RECORDING_MS = 2 * 60 * 60 * 1000;
      setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
          toast.info("Recording reached 2-hour limit, saving...");
          stopClientRecording();
        }
      }, MAX_RECORDING_MS);

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
      if (!recorder) return;
      // If recorder is already inactive but has chunks, skip to upload
      if (recorder.state === "inactive" && recordedChunksRef.current.length > 0) {
        // Fall through to upload logic below
        audioContextRef.current?.close();
        audioContextRef.current = null;
        mediaRecorderRef.current = null;
        recordingDestRef.current = null;

        const recMime = recorder.mimeType || "audio/webm";
        const ext = recMime.includes("mp4") ? "mp4" : "webm";
        const blob = new Blob(recordedChunksRef.current, { type: recMime });
        recordedChunksRef.current = [];

        if (blob.size < 1000) {
          toast.error("Recording too short");
          setRecording(false);
          setRecordingLoading(false);
          return;
        }
        if (blob.size > 50 * 1024 * 1024) {
          toast.error("Recording exceeds 50MB limit. Try a shorter session.");
          setRecording(false);
          setRecordingLoading(false);
          return;
        }

        const fileName = `${user!.id}/space-${spaceId}-${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("space-recordings")
          .upload(fileName, blob, { contentType: recMime });
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from("space-recordings").getPublicUrl(fileName);
        await supabase.from("spaces").update({
          is_recorded: true,
          recording_url: urlData.publicUrl,
        } as any).eq("id", spaceId);
        toast.success("Recording saved ✅");
        setRecording(false);
        setRecordingLoading(false);
        return;
      }
      if (recorder.state === "inactive") return;

      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.stop();
      });

      audioContextRef.current?.close();
      audioContextRef.current = null;
      mediaRecorderRef.current = null;
      recordingDestRef.current = null;

      const recMime = recorder.mimeType || "audio/webm";
      const ext = recMime.includes("mp4") ? "mp4" : "webm";
      const blob = new Blob(recordedChunksRef.current, { type: recMime });
      recordedChunksRef.current = [];

      if (blob.size < 1000) {
        toast.error("Recording too short");
        setRecording(false);
        setRecordingLoading(false);
        return;
      }

      // Cap at 50 MB
      const MAX_RECORDING_BYTES = 50 * 1024 * 1024;
      if (blob.size > MAX_RECORDING_BYTES) {
        toast.error("Recording exceeds 50MB limit. Try a shorter session.");
        setRecording(false);
        setRecordingLoading(false);
        return;
      }

      // Upload to storage
      const fileName = `${user!.id}/space-${spaceId}-${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("space-recordings")
        .upload(fileName, blob, { contentType: recMime });

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
  const speakers = participants
    .filter((p) => p.audioTrack || p.canPublish || p.identity === hostId)
    .sort((a, b) => {
      if (a.identity === hostId) return -1;
      if (b.identity === hostId) return 1;
      const aCoHost = coHostIds.includes(a.identity);
      const bCoHost = coHostIds.includes(b.identity);
      if (aCoHost && !bCoHost) return -1;
      if (!aCoHost && bCoHost) return 1;
      return a.name.localeCompare(b.name);
    });
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
        {speakRequests.has(p.identity) && !hasHandUp && !p.canPublish && p.identity !== hostId && !coHostIds.includes(p.identity) && (
          <div className="absolute -top-1 -right-1 text-base animate-pulse drop-shadow-md">
            🎙️
          </div>
        )}
        {forceMutedUsers.has(p.identity) && !hasHandUp && !speakRequests.has(p.identity) && (
          <div className="absolute -top-1 -right-1 text-base drop-shadow-md">
            🔇
          </div>
        )}
        {djIdentity === p.identity && (
          <div className="absolute -top-1 -left-1 text-base animate-pulse drop-shadow-md">
            🎵
          </div>
        )}
      </div>
    );
  };

  // ============ MINIMIZED MODE ============
  if (minimized) {
    return (
      <SpaceMiniPlayer
        title={displayTitle}
        participantCount={participants.length}
        isMuted={muted}
        hasStream={!!streamUrl}
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

        {/* Floating reactions positioned over avatars */}
        <div ref={gridContainerRef} className="absolute inset-0 z-[90] pointer-events-none overflow-hidden">
          <AnimatePresence>
            {floatingReactions.map((r) => {
              const avatarEl = avatarRefs.current.get(r.identity);
              const containerEl = gridContainerRef.current;
              let left = "50%";
              let top = "50%";
              if (avatarEl && containerEl) {
                const avatarRect = avatarEl.getBoundingClientRect();
                const containerRect = containerEl.getBoundingClientRect();
                left = `${avatarRect.left - containerRect.left + avatarRect.width / 2}px`;
                top = `${avatarRect.top - containerRect.top}px`;
              }
              return (
                <motion.div key={r.id}
                  initial={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
                  animate={{ opacity: 0, y: -80, scale: 1.6, x: "-50%" }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 2 }}
                  className="text-2xl absolute"
                  style={{ left, top }}
                >
                  {r.emoji}
                  {r.label && (
                    <div className="text-[10px] text-white font-semibold whitespace-nowrap bg-black/50 rounded px-1 mt-0.5 text-center">
                      {r.label}
                    </div>
                  )}
                </motion.div>
              );
            })}
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
            {editingTitle ? (
              <div className="flex items-center gap-1.5 mt-0.5">
                <input
                  autoFocus
                  value={editTitleValue}
                  onChange={(e) => setEditTitleValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveTitle(); if (e.key === "Escape") setEditingTitle(false); }}
                  className="text-sm font-bold bg-muted/50 border border-border rounded px-2 py-0.5 flex-1 min-w-0 outline-none focus:ring-1 focus:ring-primary"
                  maxLength={120}
                />
                <button onClick={handleSaveTitle} disabled={savingTitle} className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20">
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => { setEditingTitle(false); setEditTitleValue(displayTitle); }} className="w-6 h-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center hover:bg-muted/80">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <h3 className="text-sm font-bold mt-0.5 truncate flex items-center gap-1.5">
                {displayTitle}
                {isHost && (
                  <button onClick={() => { setEditTitleValue(displayTitle); setEditingTitle(true); }} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                    <Pencil className="w-3 h-3" />
                  </button>
                )}
              </h3>
            )}
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

        {/* Tagged Markets Carousel */}
        <TaggedMarketsCarousel spaceId={spaceId} taggedMarketIds={taggedMarketIds} isHost={isHost} isCoHost={isCoHost} onMinimize={toggleMinimize} />

        {/* Stream URL controls (host/co-host) */}
        {hasModPowers && (
          <div className="px-5 py-2 border-b border-border">
            {showStreamInput ? (
              <div className="flex items-center gap-2">
                <input
                  value={streamInputValue}
                  onChange={(e) => setStreamInputValue(e.target.value)}
                  placeholder="Paste YouTube or StreamYard URL…"
                  className="flex-1 bg-muted/50 border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
                />
                <button
                  onClick={async () => {
                    const url = streamInputValue.trim();
                    if (url && !isStreamUrl(url)) {
                      toast.error("Please paste a valid YouTube or StreamYard URL");
                      return;
                    }
                    await supabase.from("spaces" as any).update({ stream_url: url || null } as any).eq("id", spaceId);
                    setStreamUrl(url || null);
                    setShowStreamInput(false);
                    setStreamInputValue("");
                    toast.success(url ? "Stream shared! 📺" : "Stream removed");
                  }}
                  className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold"
                >
                  {streamInputValue.trim() ? "Share" : "Clear"}
                </button>
                <button onClick={() => { setShowStreamInput(false); setStreamInputValue(""); }}
                  className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setShowStreamInput(true); setStreamInputValue(streamUrl || ""); }}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Tv className="w-3.5 h-3.5" />
                {streamUrl ? "Change Stream" : "Share Stream"}
              </button>
            )}
          </div>
        )}

        {/* Embedded Stream (YouTube / StreamYard) */}
        {streamUrl && isStreamUrl(streamUrl) && !streamCollapsed && (
          <div className="relative border-b border-border">
            <YouTubeEmbed url={streamUrl} className="w-full aspect-video" />
            <button
              onClick={() => setStreamCollapsed(true)}
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center text-muted-foreground hover:text-foreground z-10"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        )}
        {streamUrl && isStreamUrl(streamUrl) && streamCollapsed && (
          <button
            onClick={() => setStreamCollapsed(false)}
            className="flex items-center gap-2 px-5 py-2 border-b border-border text-xs text-primary hover:bg-muted/30 transition-colors"
          >
            <Tv className="w-3.5 h-3.5" />
            Show Stream 📺
          </button>
        )}

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
                  <div key={m.id} id={`chat-msg-${m.id}`} className={`group flex flex-col ${m.sender === user?.id ? "items-end" : "items-start"}`}>
                    <div className={`max-w-[80%] rounded-xl px-3 py-1.5 text-xs ${
                      m.sender === user?.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}>
                      {m.sender !== user?.id && (
                        <p className="font-semibold text-[10px] opacity-70 mb-0.5">{m.senderName}</p>
                      )}
                      {/* Quoted reply block */}
                      {m.replyToContent && (
                        <div
                          className={`rounded-md px-2 py-1 mb-1 cursor-pointer border-l-2 ${
                            m.sender === user?.id
                              ? "bg-primary-foreground/10 border-primary-foreground/40"
                              : "bg-background/60 border-primary/40"
                          }`}
                          onClick={() => {
                            const el = document.getElementById(`chat-msg-${m.replyToId}`);
                            if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.add("ring-2", "ring-primary/50"); setTimeout(() => el.classList.remove("ring-2", "ring-primary/50"), 1500); }
                          }}
                        >
                          <p className="font-semibold text-[9px] opacity-70">↩ {m.replyToName}</p>
                          <p className="text-[10px] opacity-80 truncate">{m.replyToContent.slice(0, 60)}{(m.replyToContent.length || 0) > 60 ? "…" : ""}</p>
                        </div>
                      )}
                      <p>{renderMessageText(m.text)}</p>
                      <p className={`text-[9px] mt-0.5 ${m.sender === user?.id ? "text-primary-foreground/60" : "text-muted-foreground/60"}`}>
                        {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    {/* Existing reactions with tooltip showing who reacted */}
                    {m.reactions && Object.keys(m.reactions).length > 0 && (
                      <div className="flex gap-1 mt-0.5 px-1">
                        {Object.entries(m.reactions).map(([emoji, userIds]) => (
                          <button key={emoji} onClick={() => reactToMessage(m.id, emoji)}
                            title={userIds.map((uid: string) => {
                              if (uid === user?.id) return "You";
                              const p = participants.find(pp => pp.identity === uid);
                              return p?.name || uid.slice(0, 8);
                            }).join(", ")}
                            className={`flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full border transition-colors ${
                              userIds.includes(user?.id || "") ? "border-primary/50 bg-primary/10" : "border-border bg-muted/50"
                            }`}>
                            <span>{emoji}</span>
                            <span className="font-medium">{userIds.length}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Quick reaction + reply buttons on hover/tap */}
                    <div className="flex gap-0.5 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity items-center">
                      {CHAT_REACTIONS.map((emoji) => (
                        <button key={emoji} onClick={() => reactToMessage(m.id, emoji)}
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] hover:bg-muted/80 active:scale-125 transition-transform">
                          {emoji}
                        </button>
                      ))}
                      <button
                        onClick={() => setReplyTo({ id: m.id, name: m.senderName, text: m.text })}
                        className="ml-1 px-1.5 py-0.5 rounded text-[9px] text-muted-foreground hover:text-primary hover:bg-muted/80 transition-colors"
                      >
                        Reply
                      </button>
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              {/* Reply banner */}
              {replyTo && (
                <div className="shrink-0 px-5 py-1.5 border-t border-border flex items-center gap-2 bg-muted/50">
                  <CornerDownRight className="w-3 h-3 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-muted-foreground truncate">
                      Replying to <span className="font-semibold text-foreground">{replyTo.name}</span>: {replyTo.text.slice(0, 50)}
                    </p>
                  </div>
                  <button onClick={() => setReplyTo(null)} className="text-[10px] text-destructive hover:underline shrink-0">✕</button>
                </div>
              )}
              {/* Mention suggestions dropdown */}
              {mentionQuery !== null && mentionSuggestions.length > 0 && (
                <div className="shrink-0 px-5 py-1 border-t border-border bg-card">
                  {mentionSuggestions.map((p, i) => (
                    <button key={p.identity} onClick={() => insertMention(p.name)}
                      className={`w-full text-left px-3 py-1.5 rounded text-xs flex items-center gap-2 transition-colors ${i === mentionIndex ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}>
                      <span className="font-medium">@{p.name}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="shrink-0 px-5 py-3 border-t border-border flex gap-2 items-center">
                <input
                  ref={chatInputRef}
                  value={chatInput}
                  onChange={(e) => handleChatInputChange(e.target.value)}
                  onKeyDown={handleChatKeyDown}
                  placeholder={replyTo ? `Reply to ${replyTo.name}...` : "Send a message..."}
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
              {/* Video Grid — show when anyone has video or screen share */}
              {isFeatureEnabled("live_streaming") && (() => {
                const videoParticipants = participants.flatMap((p) => {
                  const items: any[] = [];
                  if (p.hasVideo && p.videoTrack) {
                    items.push({
                      identity: p.identity,
                      name: p.name,
                      isMuted: p.isMuted,
                      isScreenShare: false,
                      track: p.videoTrack,
                      verificationLevel: profiles[p.identity]?.verification_level,
                      avatarUrl: profiles[p.identity]?.avatar_url,
                      isHost: p.identity === hostId,
                      isCoHost: spaceCoHostIds.includes(p.identity),
                    });
                  }
                  if (p.hasScreenShare && p.screenShareTrack) {
                    items.push({
                      identity: p.identity,
                      name: `${p.name}'s screen`,
                      isMuted: p.isMuted,
                      isScreenShare: true,
                      track: p.screenShareTrack,
                      verificationLevel: profiles[p.identity]?.verification_level,
                      avatarUrl: profiles[p.identity]?.avatar_url,
                      isHost: p.identity === hostId,
                      isCoHost: spaceCoHostIds.includes(p.identity),
                    });
                  }
                  return items;
                });
                return videoParticipants.length > 0 ? (
                  <SpaceVideoGrid videoParticipants={videoParticipants} hostId={hostId} />
                ) : null;
              })()}

              {/* Speakers */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                  <Volume2 className="w-3 h-3" /> Speakers
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {speakers.map((p) => (
                    <motion.div key={p.identity} layout className="flex flex-col items-center gap-1"
                      ref={(el: HTMLDivElement | null) => { if (el) avatarRefs.current.set(p.identity, el); else avatarRefs.current.delete(p.identity); }}
                      onClick={() => {
                        if (p.identity === user?.id) { setShowSelfStats(true); return; }
                        if (hasModPowers && p.identity !== hostId) {
                          setActionTarget(p);
                          setActionType("speaker");
                        } else if (!hasModPowers || p.identity === hostId) {
                          setEmojiTarget(p);
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
                      {p.identity !== hostId && !coHostIds.includes(p.identity) && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-secondary/15 text-secondary-foreground border border-secondary/30">Speaker</span>
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
                        ref={(el: HTMLDivElement | null) => { if (el) avatarRefs.current.set(p.identity, el); else avatarRefs.current.delete(p.identity); }}
                        onClick={() => {
                          if (p.identity === user?.id) { setShowSelfStats(true); return; }
                          if (hasModPowers) {
                            setActionTarget(p);
                            setActionType("listener");
                          } else {
                            setEmojiTarget(p);
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
          <div className="px-5 py-2 space-y-1.5 max-w-2xl mx-auto w-full">
            {/* Regular reactions — everyone */}
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 justify-start mx-auto max-w-2xl px-2">
              {REACTIONS.map((emoji) => (
                <button key={emoji} onClick={() => sendReaction(emoji)}
                  className="w-9 h-9 min-w-[36px] rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center text-base transition-transform active:scale-125 flex-shrink-0">
                  {emoji}
                </button>
              ))}
            </div>
            {/* Sound reactions — host & co-host only */}
            {hasModPowers && (
              <div className="flex items-center justify-center gap-1.5">
                {SOUND_REACTIONS.map((sr) => (
                  <button key={sr.id} onClick={() => sendSoundReaction(sr.id)}
                    title={sr.label}
                    className="h-7 px-2 rounded-full bg-accent/20 hover:bg-accent/40 flex items-center justify-center gap-1 text-xs transition-transform active:scale-110 border border-accent/30">
                    <span>{sr.emoji}</span>
                    <span className="text-[9px] text-accent-foreground/70 hidden sm:inline">{sr.label}</span>
                  </button>
                ))}
                {/* Ambient music toggle */}
                <div className="relative">
                  <button onClick={() => setShowMusicMenu(!showMusicMenu)}
                    className={`h-7 px-2 rounded-full flex items-center justify-center gap-1 text-xs transition-colors border ${
                      ambientTrack || deviceMusicPlaying
                        ? "bg-primary/20 text-primary border-primary/40"
                        : "bg-muted hover:bg-muted/80 text-muted-foreground border-border"
                    }`}
                    title="Background Music">
                    <Music className="w-3 h-3" />
                    <ChevronDown className="w-2.5 h-2.5" />
                  </button>
                  {showMusicMenu && (
                    <div className="absolute bottom-full right-0 mb-1 bg-card border border-border rounded-lg shadow-lg p-1.5 min-w-[160px] z-[95]">
                      {/* Device music section */}
                      <input ref={deviceFileInputRef} type="file" accept=".mp3,.m4a,.wav,.ogg,.flac,.aac,.wma,.opus,audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/flac,audio/aac" className="hidden" onChange={handleDeviceMusicFile} />
                      {!deviceMusicPlaying ? (
                        djIdentity && djIdentity !== user?.id ? (
                          <div className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-muted-foreground">
                            <Music className="w-3 h-3" />
                            <span>Someone is already playing music</span>
                          </div>
                        ) : (
                        <>
                        {isFeatureEnabled("jamendo_music") && (
                        <button onClick={() => { setShowMusicMenu(false); setShowJamendoBrowser(true); }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs hover:bg-muted text-foreground transition-colors">
                          <Library className="w-3 h-3" />
                          <span>Browse Music</span>
                        </button>
                        )}
                        <button onClick={() => deviceFileInputRef.current?.click()}
                          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs hover:bg-muted text-foreground transition-colors">
                          <Upload className="w-3 h-3" />
                          <span>Play from device</span>
                        </button>
                        </>
                        )
                      ) : (
                        <div className="px-3 py-1.5 space-y-1.5">
                          <p className="text-[10px] text-muted-foreground truncate max-w-[140px]">🎵 {deviceMusicName}</p>
                          <div className="flex items-center gap-1">
                            {deviceMusicPaused ? (
                              <button onClick={resumeDeviceMusic}
                                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-primary/15 text-primary hover:bg-primary/25 transition-colors">
                                <Play className="w-3 h-3" /> Resume
                              </button>
                            ) : (
                              <button onClick={pauseDeviceMusic}
                                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-muted hover:bg-muted/80 text-foreground transition-colors">
                                <Pause className="w-3 h-3" /> Pause
                              </button>
                            )}
                            <button onClick={() => { stopDeviceMusic(); setShowMusicMenu(false); }}
                              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-destructive hover:bg-destructive/10 transition-colors">
                              <Square className="w-3 h-3" /> Stop
                            </button>
                          </div>
                          {/* Volume slider */}
                          <div className="flex items-center gap-1.5">
                            <VolumeX className="w-3 h-3 text-muted-foreground" />
                            <input type="range" min="0" max="1" step="0.05" value={deviceMusicVolume}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                setDeviceMusicVolume(v);
                                if (deviceMusicGainRef.current) deviceMusicGainRef.current.gain.value = v;
                              }}
                              className="w-full h-1 accent-primary" />
                            <Volume2 className="w-3 h-3 text-muted-foreground" />
                          </div>
                          {/* Loop toggle */}
                          <button onClick={() => {
                            const next = !deviceMusicLoop;
                            setDeviceMusicLoop(next);
                            if (deviceMusicSourceRef.current) deviceMusicSourceRef.current.loop = next;
                            toast.success(next ? "Loop enabled 🔁" : "Loop disabled");
                          }}
                            className={`w-full flex items-center gap-2 px-2 py-1 rounded-md text-xs transition-colors ${deviceMusicLoop ? "bg-primary/15 text-primary" : "hover:bg-muted text-foreground"}`}>
                            <span>🔁</span>
                            <span>Loop {deviceMusicLoop ? "On" : "Off"}</span>
                          </button>
                        </div>
                      )}
                      <div className="border-t border-border my-1" />
                      {/* Ambient tracks */}
                      {AMBIENT_TRACKS.map((t) => (
                        <button key={t.id} onClick={() => toggleAmbientMusic(t.id)}
                          className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors ${
                            ambientTrack === t.id
                              ? "bg-primary/15 text-primary"
                              : "hover:bg-muted text-foreground"
                          }`}>
                          <span>{t.emoji}</span>
                          <span>{t.label}</span>
                          {ambientTrack === t.id && <span className="ml-auto text-[9px]">▶</span>}
                        </button>
                      ))}
                      {ambientTrack && (
                        <button onClick={() => { stopAmbient(); setAmbientTrack(null); setShowMusicMenu(false); }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-destructive hover:bg-destructive/10 transition-colors mt-0.5">
                          <span>⏹</span>
                          <span>Stop Music</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Controls bar */}
        {connected && (
          <div className="border-t border-border px-3 sm:px-5 py-3 flex items-center justify-center flex-wrap gap-2">
            {(isHost || canPublish) && (
              <button onClick={toggleMute}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors relative ${
                  forceMuted ? "bg-destructive/20 text-destructive" :
                  muted ? "bg-muted text-muted-foreground" : "bg-primary/20 text-primary"
                }`}
                title={forceMuted ? "Muted by host" : muted ? "Unmute" : "Mute"}>
                {forceMuted ? <Lock className="w-5 h-5" /> : muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
            )}

            {/* Camera toggle — verified speakers only */}
            {canUseVideo && (
              <button onClick={toggleCamera}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                  cameraOn ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                }`}
                title={cameraOn ? "Turn off camera" : "Turn on camera"}>
                {cameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
              </button>
            )}

            {/* Flip camera — only when camera is active */}
            {canUseVideo && cameraOn && (
              <button onClick={flipCamera}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-colors bg-muted text-muted-foreground hover:bg-accent"
                title={facingBack ? "Switch to front camera" : "Switch to back camera"}>
                <SwitchCamera className="w-5 h-5" />
              </button>
            )}

            {/* Screen share toggle — verified hosts/co-hosts */}
            {canUseVideo && hasModPowers && (
              <button onClick={toggleScreenShare}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                  screenShareOn ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                }`}
                title={screenShareOn ? "Stop screen share" : "Share screen"}>
                {screenShareOn ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
              </button>
            )}

            {/* Mute All / Unmute All — for moderators */}
            {hasModPowers && (
              allForceMuted ? (
                <button onClick={handleUnmuteAll}
                  className="h-10 px-3 sm:px-4 rounded-full flex items-center justify-center gap-2 text-sm font-medium bg-primary/20 text-primary transition-colors"
                  title="Unmute All">
                  <Unlock className="w-4 h-4" />
                  <span className="hidden sm:inline">Unmute All</span>
                </button>
              ) : (
                <button onClick={handleMuteAll}
                  className="h-10 px-3 sm:px-4 rounded-full flex items-center justify-center gap-2 text-sm font-medium bg-muted text-muted-foreground transition-colors"
                  title="Mute All">
                  <VolumeX className="w-4 h-4" />
                  <span className="hidden sm:inline">Mute All</span>
                </button>
              )
            )}

            {/* Request to Speak — for listeners without publish permission */}
            {!isHost && !canPublish && (
              <button onClick={requestToSpeak} disabled={requestPending}
                className={`h-10 px-3 sm:px-4 rounded-full flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
                  requestPending ? "bg-primary/20 text-primary animate-pulse" : "bg-accent text-accent-foreground"
                }`}
                title={requestPending ? "Request Sent" : "Request to Speak"}>
                <Mic className="w-4 h-4" />
                <span className="hidden sm:inline">{requestPending ? "Request Sent" : "Request to Speak"}</span>
              </button>
            )}

            {(isHost || isCoHost || canPublish) && (
              <button onClick={toggleHand}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                  handRaised ? "bg-yellow-500/20 text-yellow-500" : "bg-muted text-muted-foreground"
                }`}
                title={handRaised ? "Lower hand" : "Raise hand"}>
                <Hand className="w-5 h-5" />
              </button>
            )}

            {/* Recording toggle for host */}
            {isHost && (
              <button onClick={toggleRecording} disabled={recordingLoading}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                  recording ? "bg-red-500/20 text-red-500" : "bg-muted text-muted-foreground"
                }`}
                title={recording ? "Stop recording" : "Start recording"}>
                {recordingLoading ? <Loader2 className="w-5 h-5 animate-spin" /> :
                  recording ? <CircleStop className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
              </button>
            )}

            {/* Invite button for host/co-host */}
            {hasModPowers && (
              <button onClick={() => setShowInviteModal(true)}
                className="h-10 px-3 sm:px-4 rounded-full flex items-center justify-center gap-2 text-sm font-medium bg-accent text-accent-foreground transition-colors"
                title="Invite Users">
                <UserPlus className="w-4 h-4" />
                <span className="hidden sm:inline">Invite</span>
              </button>
            )}

            <button onClick={handleLeave}
              className="w-10 h-10 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
              title="Leave Space">
              <PhoneOff className="w-5 h-5" />
            </button>

            {isHost && (
              <button onClick={handleEndSpace}
                className="h-10 px-3 sm:px-4 rounded-full flex items-center justify-center gap-2 text-sm font-medium bg-destructive text-destructive-foreground transition-colors"
                title="End Space">
                <X className="w-4 h-4" />
                <span className="hidden sm:inline">End Space</span>
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
                      {remoteHandRaises.has(actionTarget.identity) && (
                        <button
                          onClick={() => forceHandDown(actionTarget.identity)}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-600 transition-colors"
                        >
                          <Hand className="w-5 h-5" />
                          <span className="text-sm font-medium">Lower Hand ✋</span>
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
                  {/* Send Emoji — available to mods in action sheet */}
                  <button
                    onClick={() => { setEmojiTarget(actionTarget); setActionTarget(null); setActionType(null); }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-muted hover:bg-muted/80 text-foreground transition-colors"
                  >
                    <span className="text-lg">💸</span>
                    <span className="text-sm font-medium">Send Gift Emoji</span>
                  </button>
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

        {/* Emoji picker overlay for targeted emoji */}
        <AnimatePresence>
          {emojiTarget && (
            <>
              <motion.div
                key="emoji-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/40 z-[95]"
                onClick={() => setEmojiTarget(null)}
              />
              <motion.div
                key="emoji-picker"
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 100, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="absolute bottom-0 inset-x-0 z-[96] bg-card rounded-t-2xl border-t border-border p-5"
              >
                <div className="flex items-center justify-between mb-2">
                  <div
                    className="flex items-center gap-3 cursor-pointer group"
                    onClick={() => setShowGiftUserMenu((v) => !v)}
                  >
                    <div className={`rounded-full transition-all ${showGiftUserMenu ? "ring-2 ring-primary" : "ring-2 ring-transparent group-active:ring-primary/30"}`}>
                      {renderAvatar(emojiTarget, "lg")}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Send gift to {emojiTarget.name}</p>
                      <p className="text-xs text-muted-foreground">Emoji gifts deduct from your gift balance ({giftFeePercent}% fee)</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Gift Balance</p>
                    <p className={`text-sm font-bold ${giftBalance > 0 ? "text-green-500" : "text-destructive"}`}>${giftBalance.toFixed(2)}</p>
                  </div>
                </div>
                <AnimatePresence>
                  {showGiftUserMenu && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden mb-2"
                    >
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEmojiTarget(null);
                            setShowGiftUserMenu(false);
                            navigate(`/user/${emojiTarget.identity}`);
                          }}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-secondary text-secondary-foreground text-xs font-medium hover:bg-secondary/80 transition-colors"
                        >
                          <Users className="w-3.5 h-3.5" />
                          View Profile
                        </button>
                        <button
                          onClick={async () => {
                            if (!user) return;
                            try {
                              const { data } = await supabase.rpc("start_dm_conversation" as any, {
                                other_user_id: emojiTarget.identity,
                              });
                              setEmojiTarget(null);
                              setShowGiftUserMenu(false);
                              navigate("/messages");
                            } catch {
                              toast.error("Could not start conversation");
                            }
                          }}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-secondary text-secondary-foreground text-xs font-medium hover:bg-secondary/80 transition-colors"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          Send Message
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {GIFT_EMOJIS.map((emoji) => {
                    const price = EMOJI_PRICES[emoji] ?? 0.05;
                    const canAfford = giftBalance >= price;
                    return (
                      <button
                        key={emoji}
                        onClick={() => sendTargetedEmoji(emoji)}
                        disabled={!canAfford || sendingGift}
                        className={`flex flex-col items-center gap-1 py-2.5 rounded-xl transition-all active:scale-95 ${
                          canAfford
                            ? "bg-muted hover:bg-muted/80"
                            : "bg-muted/40 opacity-50 cursor-not-allowed"
                        }`}
                      >
                        <span className="text-2xl">{emoji}</span>
                        <span className="text-[10px] font-medium text-muted-foreground">${price.toFixed(2)}</span>
                      </button>
                    );
                  })}
                </div>
                {giftBalance <= 0 && (
                  <div className="flex flex-col items-center gap-1.5 mb-2">
                    <p className="text-xs text-center text-destructive">
                      No gift balance.
                    </p>
                    <button
                      onClick={async () => {
                        if (!user) return;
                        const { data } = await supabase
                          .from("balances")
                          .select("amount, gift_balance")
                          .eq("user_id", user.id)
                          .eq("currency", "USDT")
                          .maybeSingle();
                        setMainBalance(Number((data as any)?.amount ?? 0));
                        setGiftBalance(Number((data as any)?.gift_balance ?? 0));
                        setTopUpAmount("");
                        setShowTopUpModal(true);
                      }}
                      className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
                    >
                      Top Up Gift Balance
                    </button>
                  </div>
                )}
                <button
                  onClick={() => setEmojiTarget(null)}
                  className="w-full flex items-center justify-center px-4 py-3 rounded-xl bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
                >
                  <span className="text-sm font-medium">Cancel</span>
                </button>
              </motion.div>
            </>
          )}

          {/* Self Stats Sheet */}
          {showSelfStats && (
            <>
              <motion.div
                key="self-stats-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/40 z-[95]"
                onClick={() => setShowSelfStats(false)}
              />
              <motion.div
                key="self-stats-sheet"
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 100, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="absolute bottom-0 inset-x-0 z-[96] bg-card rounded-t-2xl border-t border-border p-5"
              >
                <div className="flex items-center justify-between mb-4">
                  <p className="font-semibold text-sm">My Balances & Space Stats</p>
                  <button onClick={() => setShowSelfStats(false)} className="p-1 rounded-full hover:bg-muted">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>

                {/* Balances */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-muted rounded-xl p-3 text-center relative">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Gift Balance</p>
                    <p className={`text-lg font-bold ${giftBalance > 0 ? "text-green-500" : "text-destructive"}`}>
                      ${giftBalance.toFixed(2)}
                    </p>
                    <button
                      onClick={() => setShowTopUpModal(true)}
                      className="mt-1.5 px-3 py-1 rounded-lg bg-primary text-primary-foreground text-[10px] font-semibold hover:bg-primary/90 transition-colors"
                    >
                      Top Up
                    </button>
                  </div>
                   <div className="bg-muted rounded-xl p-3 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Rewards Balance</p>
                    <p className="text-lg font-bold text-primary">
                      ${rewardsBalance.toFixed(2)}
                    </p>
                    {rewardsBalance > 0 && (
                      <button
                        onClick={() => { setConvertAmount(rewardsBalance.toFixed(2)); setShowConvertModal(true); }}
                        className="mt-1.5 px-3 py-1 rounded-lg bg-pink-500/20 text-pink-500 text-[10px] font-semibold hover:bg-pink-500/30 transition-colors"
                      >
                        Convert to Gifts
                      </button>
                    )}
                  </div>
                </div>

                {/* Space-specific stats */}
                <p className="text-xs font-semibold text-muted-foreground mb-2">This Space</p>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-muted rounded-xl p-3 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Gifts Sent</p>
                    <p className="text-base font-bold text-foreground">{selfSpaceStats.sentCount}</p>
                    <p className="text-[10px] text-muted-foreground">${selfSpaceStats.sent.toFixed(2)} total</p>
                  </div>
                  <div className="bg-muted rounded-xl p-3 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Gifts Received</p>
                    <p className="text-base font-bold text-foreground">{selfSpaceStats.receivedCount}</p>
                    <p className="text-[10px] text-muted-foreground">${selfSpaceStats.received.toFixed(2)} total</p>
                  </div>
                </div>

                {/* Gift Activity List */}
                {giftActivities.length > 0 && (
                  <>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Gift Activity</p>
                    <div className="max-h-40 overflow-y-auto space-y-1.5 mb-4 scrollbar-thin">
                      {giftActivities.map((a) => (
                        <div key={a.id} className="flex items-center justify-between bg-muted rounded-lg px-3 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-base">{a.emoji}</span>
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-foreground truncate">
                                {a.direction === 'sent' ? `You → ${a.other_name}` : `${a.other_name} → You`}
                              </p>
                            </div>
                          </div>
                          <span className={`text-xs font-bold shrink-0 ${a.direction === 'received' ? 'text-green-500' : 'text-destructive'}`}>
                            {a.direction === 'received' ? '+' : '-'}${a.amount.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <button
                  onClick={() => setShowSelfStats(false)}
                  className="w-full flex items-center justify-center px-4 py-3 rounded-xl bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
                >
                  <span className="text-sm font-medium">Close</span>
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>
        {/* Inline Top-Up Gift Balance Modal */}
        <AnimatePresence>
          {showTopUpModal && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] bg-black/60"
                onClick={() => setShowTopUpModal(false)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[101] bg-card border border-border rounded-2xl p-5 max-w-sm mx-auto shadow-xl"
              >
                <h3 className="text-base font-bold text-foreground mb-1">Top Up Gift Balance</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Transfer from your wallet balance to gift balance.
                </p>

                <div className="space-y-3 mb-4">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Wallet Balance</span>
                    <span className="font-semibold text-foreground">${mainBalance.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Current Gift Balance</span>
                    <span className="font-semibold text-foreground">${giftBalance.toFixed(2)}</span>
                  </div>
                </div>

                <div className="mb-3">
                  <label className="text-xs text-muted-foreground mb-1 block">Amount ($)</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    max={mainBalance}
                    value={topUpAmount}
                    onChange={(e) => setTopUpAmount(e.target.value)}
                    placeholder="Enter amount"
                    className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="flex gap-2 mb-3">
                  {[1, 2, 5, 10].map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setTopUpAmount(String(Math.min(amt, mainBalance)))}
                      disabled={mainBalance < amt}
                      className="flex-1 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-xs font-semibold text-foreground border border-border disabled:opacity-40 transition-colors"
                    >
                      ${amt}
                    </button>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setShowTopUpModal(false)}
                    className="flex-1 py-2.5 rounded-xl bg-muted text-muted-foreground text-sm font-medium hover:bg-muted/80 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      const amt = parseFloat(topUpAmount);
                      if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
                      if (amt > mainBalance) { toast.error("Insufficient wallet balance"); return; }
                      setTopUpLoading(true);
                      const { data, error } = await supabase.rpc("topup_gift_balance", {
                        _user_id: user!.id,
                        _amount: amt,
                      });
                      if (error || (data as any)?.error) {
                        toast.error((data as any)?.error || error?.message || "Top-up failed");
                      } else {
                        setGiftBalance((prev) => prev + amt);
                        setMainBalance((prev) => prev - amt);
                        toast.success(`$${amt.toFixed(2)} added to gift balance`);
                        setShowTopUpModal(false);
                        queryClient.invalidateQueries({ queryKey: ["balance"] });
                      }
                      setTopUpLoading(false);
                    }}
                    disabled={topUpLoading || !topUpAmount || parseFloat(topUpAmount) <= 0}
                    className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {topUpLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Top Up"}
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Inline Convert Rewards to Gift Modal */}
        <AnimatePresence>
          {showConvertModal && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] bg-black/60"
                onClick={() => setShowConvertModal(false)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="fixed left-4 right-4 bottom-24 z-[101] bg-card rounded-2xl p-5 shadow-xl border border-border max-w-sm mx-auto"
              >
                <h3 className="text-sm font-bold text-foreground mb-1">Convert to Gift Balance</h3>
                <p className="text-[11px] text-muted-foreground mb-3">
                  Move rewards to your gift balance so you can send emoji gifts.
                </p>
                <p className="text-xs text-muted-foreground mb-2">Available: <span className="font-semibold text-primary">${rewardsBalance.toFixed(2)}</span></p>
                <input
                  type="number"
                  value={convertAmount}
                  onChange={(e) => setConvertAmount(e.target.value)}
                  placeholder="Amount"
                  min={0.01}
                  step={0.01}
                  className="w-full px-3 py-2.5 rounded-xl bg-muted text-foreground text-sm border border-border focus:outline-none focus:ring-2 focus:ring-primary mb-3"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowConvertModal(false)}
                    className="flex-1 py-2.5 rounded-xl bg-muted text-muted-foreground text-sm font-medium hover:bg-muted/80 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      const amt = parseFloat(convertAmount);
                      if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
                      if (Math.round(amt * 100) > Math.round(rewardsBalance * 100)) { toast.error("Insufficient rewards balance"); return; }
                      setConvertLoading(true);
                      const { data, error } = await supabase.rpc("transfer_rewards_to_gift", { _user_id: user!.id, _amount: amt } as any);
                      if (error || !(data as any)?.success) {
                        toast.error((data as any)?.error || error?.message || "Transfer failed");
                      } else {
                        setRewardsBalance((prev) => prev - amt);
                        setGiftBalance((prev) => prev + amt);
                        toast.success(`$${amt.toFixed(2)} converted to gift balance`);
                        setShowConvertModal(false);
                        queryClient.invalidateQueries({ queryKey: ["balance"] });
                      }
                      setConvertLoading(false);
                    }}
                    disabled={convertLoading || !convertAmount || parseFloat(convertAmount) <= 0}
                    className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {convertLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Convert"}
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Invite Users Modal */}
      <AnimatePresence>
        {showInviteModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200]"
              onClick={() => { setShowInviteModal(false); setInviteSearchQuery(""); }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="fixed inset-0 z-[200] flex items-center justify-center p-6 pointer-events-none"
            >
              <div className="glass-strong rounded-2xl p-5 w-full max-w-sm pointer-events-auto space-y-3 max-h-[70vh] overflow-y-auto">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-primary" />
                    Invite to Space
                  </h3>
                  <button onClick={() => { setShowInviteModal(false); setInviteSearchQuery(""); }} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    value={inviteSearchQuery}
                    onChange={(e) => setInviteSearchQuery(e.target.value)}
                    placeholder="Search users…"
                    className="w-full bg-muted/50 border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
                    autoFocus
                  />
                </div>
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {inviteSearching && <p className="text-xs text-muted-foreground text-center py-4"><Loader2 className="w-3 h-3 animate-spin inline mr-1" />Searching…</p>}
                  {!inviteSearching && inviteSearchQuery.trim() && inviteSearchResults.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">No users found</p>
                  )}
                  {inviteSearchResults.map((u) => (
                    <div key={u.id} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0">
                        {u.avatar_url ? (
                          <img src={optimizedImg(u.avatar_url, "avatar-sm")} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xs font-bold">{(u.display_name || "?").charAt(0).toUpperCase()}</span>
                        )}
                      </div>
                      <span className="text-sm truncate flex-1">{u.display_name}</span>
                      <button
                        onClick={() => handleSendInvite(u.id, u.display_name)}
                        disabled={inviteSending === u.id}
                        className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50 flex items-center gap-1"
                      >
                        {inviteSending === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                        Invite
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Enable Speaker Prompt */}
      <AnimatePresence>
        {showAudioPrompt && connected && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200]"
              onClick={() => { audioEnabledRef.current = true; setShowAudioPrompt(false); }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="fixed inset-0 z-[200] flex items-center justify-center p-6 pointer-events-none"
            >
              <div className="glass-strong rounded-2xl p-6 w-full max-w-xs text-center pointer-events-auto space-y-4">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <Volume2 className="w-7 h-7 text-primary" />
                </div>
                <h3 className="text-lg font-bold text-foreground">Enable Speaker</h3>
                <p className="text-sm text-muted-foreground">Tap below to hear other participants in this space</p>
                <button
                  onClick={async () => {
                    try {
                      await roomRef.current?.startAudio();
                      warmAudioContext();
                    } catch {}
                     audioEnabledRef.current = true;
                     setShowAudioPrompt(false);
                   }}
                   className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
                 >
                   Enable Speaker 🔊
                 </button>
                 <button
                   onClick={() => { audioEnabledRef.current = true; setShowAudioPrompt(false); }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Skip
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Jamendo Music Browser */}
      <AnimatePresence>
        {showJamendoBrowser && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowJamendoBrowser(false)}
              className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[90]"
            />
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed inset-0 z-[90] flex items-center justify-center p-4 pointer-events-none"
            >
              <div className="glass-strong rounded-2xl overflow-hidden w-full max-w-md pointer-events-auto" style={{ maxHeight: "75dvh" }}>
                <div className="flex items-center justify-between px-3 pt-3 pb-1">
                  <h3 className="text-sm font-semibold text-foreground">🎵 Browse Music</h3>
                  <button onClick={() => setShowJamendoBrowser(false)} className="p-1 rounded-full hover:bg-muted">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
                <JamendoMusicBrowser
                  onPlayInSpace={playOnlineTrack}
                  onClose={() => setShowJamendoBrowser(false)}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </AnimatePresence>
  );
};

export default SpaceRoom;
