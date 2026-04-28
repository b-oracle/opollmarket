import { useState, useEffect, useRef, useCallback } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import { useQuery } from "@tanstack/react-query";
import { playDialTone } from "@/lib/sounds";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import { PhoneOff, Phone, Mic, MicOff, Volume2, VolumeX, Lock, X, Minimize2, Maximize2, Video, VideoOff, Monitor, MonitorOff, SwitchCamera } from "lucide-react";
import { toast } from "sonner";
import { logCallEvent } from "@/lib/callEvents";
import { recordCallLifecycle } from "@/lib/callLifecycleLog";
import { loadCallPreferences, saveCallPreferences, clearCallPreferences } from "@/lib/callPreferences";
import CallDebugOverlay from "./CallDebugOverlay";

interface VoiceCallOverlayProps {
  callId: string;
  conversationId: string;
  token: string;
  livekitUrl: string;
  roomName: string;
  e2eePassphrase: string;
  isOutgoing: boolean;
  otherUserName: string;
  otherUserAvatar?: string;
  minimized?: boolean;
  startWithVideo?: boolean;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose: () => void;
}

type CallStatus = "connecting" | "ringing" | "active" | "ended";
const GRACE_PERIOD_MS = 120_000;

const VoiceCallOverlay = ({
  callId,
  conversationId,
  token,
  livekitUrl,
  roomName,
  e2eePassphrase,
  isOutgoing,
  otherUserName,
  otherUserAvatar,
  minimized = false,
  startWithVideo = false,
  onMinimize,
  onMaximize,
  onClose,
}: VoiceCallOverlayProps) => {
  const { user } = useAuth();
  const { isFeatureEnabled } = useFeatureToggles();
  const globalScreenShareEnabled = isFeatureEnabled("dm_screen_sharing");

  // Check per-user allow_screen_sharing setting
  const { data: userScreenShareAllowed = true } = useQuery({
    queryKey: ["user-screen-share-setting", user?.id],
    queryFn: async () => {
      if (!user) return true;
      const { data } = await supabase
        .from("user_settings" as any)
        .select("allow_screen_sharing")
        .eq("user_id", user.id)
        .maybeSingle();
      return (data as any)?.allow_screen_sharing ?? true;
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const screenShareEnabled = globalScreenShareEnabled && userScreenShareAllowed;
  // Hydrate from any persisted preferences for this call so reloads /
  // overlay remounts retain the last mic/camera intent.
  const persistedPrefs = loadCallPreferences(callId);
  const [status, setStatus] = useState<CallStatus>(
    isOutgoing ? "ringing" : "connecting"
  );
  const [muted, setMuted] = useState(persistedPrefs?.muted ?? false);
  const [speakerOn, setSpeakerOn] = useState(false);
  const [cameraOn, setCameraOn] = useState(persistedPrefs?.cameraOn ?? startWithVideo);
  const [screenShareOn, setScreenShareOn] = useState(false);
  const [duration, setDuration] = useState(0);
  const [remoteAudioLevel, setRemoteAudioLevel] = useState(0);
  const [localAudioLevel, setLocalAudioLevel] = useState(0);
  const remoteAnalyserRef = useRef<{ ctx: AudioContext; analyser: AnalyserNode; source: MediaStreamAudioSourceNode } | null>(null);
  const localAnalyserRef = useRef<{ ctx: AudioContext; analyser: AnalyserNode; source: MediaStreamAudioSourceNode } | null>(null);
  const audioLevelRafRef = useRef<number | null>(null);

  // Video refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const screenShareRef = useRef<HTMLVideoElement>(null);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [hasRemoteScreenShare, setHasRemoteScreenShare] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [pipPos, setPipPos] = useState({ x: 16, y: 112 });
  const [pipDragging, setPipDragging] = useState(false);
  const pipDragStart = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);

  // Store pending remote tracks so we can attach after video element renders
  const pendingRemoteVideoTrackRef = useRef<any>(null);
  const pendingScreenShareTrackRef = useRef<any>(null);

  const roomRef = useRef<Room | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const autoTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inactivityTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const stopToneRef = useRef<(() => void) | null>(null);
  const intentionalDisconnectRef = useRef(false);
  const endingRef = useRef(false);
  const statusRef = useRef<CallStatus>(isOutgoing ? "ringing" : "connecting");
  const remoteTrackReceivedRef = useRef(false);
  const gracePeriodRef = useRef<NodeJS.Timeout | null>(null);
  const [waitingReconnect, setWaitingReconnect] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [showRejoin, setShowRejoin] = useState(false);
  // Mutable token/url so auto-reconnect can swap in a fresh one when the original expires.
  const currentTokenRef = useRef(token);
  const currentUrlRef = useRef(livekitUrl);
  const reconnectAttemptsRef = useRef(0);
  const reconnectInFlightRef = useRef(false);
  const MAX_AUTO_RECONNECT = 3;

  const markRecoverableDisconnect = useCallback((
    stage: string,
    message: string,
    data: Record<string, unknown> = {},
  ) => {
    if (endingRef.current || intentionalDisconnectRef.current || statusRef.current === "ended") return;
    if (stopToneRef.current) { stopToneRef.current(); stopToneRef.current = null; }
    if (autoTimeoutRef.current) { clearTimeout(autoTimeoutRef.current); autoTimeoutRef.current = null; }
    if (gracePeriodRef.current) { clearTimeout(gracePeriodRef.current); gracePeriodRef.current = null; }
    setWaitingReconnect(false);
    setReconnecting(false);
    setShowRejoin(true);
    if (statusRef.current === "connecting") setStatus("active");
    logCallEvent(callId, "failed", { stage, recoverable: true, ...data });
    recordCallLifecycle(callId, "show_rejoin", {
      status: statusRef.current,
      message,
      data: { stage, ...data },
      level: "warn",
    });
  }, [callId]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const handleEnd = useCallback(() => {
    // Allow re-entry: if a previous end attempt started but didn't close,
    // the user should still be able to force-end.
    if (endingRef.current) {
      // Force close immediately on repeated tap
      try { roomRef.current?.disconnect(); } catch {}
      onClose();
      return;
    }
    endingRef.current = true;
    intentionalDisconnectRef.current = true;
    setStatus("ended");
    if (timerRef.current) clearInterval(timerRef.current);
    if (inactivityTimeoutRef.current) { clearTimeout(inactivityTimeoutRef.current); inactivityTimeoutRef.current = null; }
    if (gracePeriodRef.current) { clearTimeout(gracePeriodRef.current); gracePeriodRef.current = null; }
    if (stopToneRef.current) { stopToneRef.current(); stopToneRef.current = null; }
    setWaitingReconnect(false);
    setReconnecting(false);
    setShowRejoin(false);
    try { roomRef.current?.disconnect(); } catch {}

    const durationSec = startTimeRef.current
      ? Math.round((Date.now() - startTimeRef.current) / 1000)
      : 0;
    logCallEvent(callId, "ended", { duration_seconds: durationSec, via: "user_end" });
    recordCallLifecycle(callId, "user_end", { status: statusRef.current, data: { duration_seconds: durationSec } });

    // Fire-and-forget — don't block close on network
    supabase.functions.invoke("dm-call-token", {
      body: { action: "end", call_id: callId },
    }).catch(() => {});

    // Close after brief delay, with hard failsafe
    setTimeout(onClose, 800);
  }, [callId, onClose]);

  const handleCancel = useCallback(() => {
    if (endingRef.current) {
      try { roomRef.current?.disconnect(); } catch {}
      onClose();
      return;
    }
    endingRef.current = true;
    intentionalDisconnectRef.current = true;
    setStatus("ended");
    if (inactivityTimeoutRef.current) { clearTimeout(inactivityTimeoutRef.current); inactivityTimeoutRef.current = null; }
    if (gracePeriodRef.current) { clearTimeout(gracePeriodRef.current); gracePeriodRef.current = null; }
    if (stopToneRef.current) { stopToneRef.current(); stopToneRef.current = null; }
    try { roomRef.current?.disconnect(); } catch {}

    logCallEvent(callId, "cancelled", { via: "caller_cancel" });
    recordCallLifecycle(callId, "user_cancel", { status: statusRef.current });

    // Fire-and-forget
    supabase.functions.invoke("dm-call-token", {
      body: { action: "cancel", call_id: callId },
    }).catch(() => {});

    setTimeout(onClose, 500);
  }, [callId, onClose]);

  // Auto-fired when the callee never answers within the ringing timeout.
  // Logged distinctly from a manual caller-cancel so the dashboard can tell
  // unanswered calls apart from genuine hang-ups.
  const handleTimeout = useCallback(() => {
    if (endingRef.current) {
      try { roomRef.current?.disconnect(); } catch {}
      onClose();
      return;
    }
    endingRef.current = true;
    intentionalDisconnectRef.current = true;
    setStatus("ended");
    if (inactivityTimeoutRef.current) { clearTimeout(inactivityTimeoutRef.current); inactivityTimeoutRef.current = null; }
    if (gracePeriodRef.current) { clearTimeout(gracePeriodRef.current); gracePeriodRef.current = null; }
    if (stopToneRef.current) { stopToneRef.current(); stopToneRef.current = null; }
    try { roomRef.current?.disconnect(); } catch {}

    logCallEvent(callId, "timeout", { via: "no_answer", timeout_seconds: 90 });
    recordCallLifecycle(callId, "no_answer_timeout", { status: statusRef.current, level: "warn" });

    // Fire-and-forget — server still needs to clean up the call row
    supabase.functions.invoke("dm-call-token", {
      body: { action: "cancel", call_id: callId, reason: "no_answer" },
    }).catch(() => {});

    setTimeout(onClose, 500);
  }, [callId, onClose]);

  // Track whether the user intentionally muted, so we can auto-restore on app switch
  const userIntentMutedRef = useRef(false);

  // Connect to LiveKit room
  useEffect(() => {
    recordCallLifecycle(callId, "overlay_mount", {
      status: statusRef.current,
      data: { isOutgoing, room: roomName, url: livekitUrl },
    });
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: { resolution: { width: 640, height: 480, frameRate: 24 } },
      // Keep connection alive when page is hidden (app switch / minimize)
      disconnectOnPageLeave: false,
    });
    roomRef.current = room;

    room.on(RoomEvent.TrackSubscribed, (track) => {
      // Any remote track means the other party joined — stop ringing
      if (stopToneRef.current) { stopToneRef.current(); stopToneRef.current = null; }
      if (statusRef.current === "ringing") {
        setStatus("active");
        if (!startTimeRef.current) startTimeRef.current = Date.now();
        if (autoTimeoutRef.current) { clearTimeout(autoTimeoutRef.current); autoTimeoutRef.current = null; }
      }

      recordCallLifecycle(callId, "track_subscribed", {
        status: statusRef.current,
        data: { kind: String(track.kind), source: String((track as any).source ?? "") },
      });
      if (track.kind === Track.Kind.Audio) {
        remoteTrackReceivedRef.current = true;
        const el = track.attach();
        el.id = `remote-audio-${track.sid}`;
        // Default to earpiece mode (lower volume, communications sink)
        el.volume = 0.4;
        if (typeof (el as any).setSinkId === "function") {
          (el as any).setSinkId("communications").catch(() => {});
        }
        document.body.appendChild(el);
        try {
          // Get the underlying MediaStreamTrack and build a stream for the analyser
          const mediaTrack = track.mediaStreamTrack;
          if (mediaTrack) {
            const stream = new MediaStream([mediaTrack]);
            const ctx = new AudioContext();
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.3;
            source.connect(analyser);
            // Close previous analyser if any
            try { remoteAnalyserRef.current?.ctx.close(); } catch {}
            remoteAnalyserRef.current = { ctx, analyser, source };
          }
        } catch {}
        if (inactivityTimeoutRef.current) {
          clearTimeout(inactivityTimeoutRef.current);
          inactivityTimeoutRef.current = null;
        }
      }
      if (track.kind === Track.Kind.Video) {
        const source = (track as any).source;
        if (source === Track.Source.ScreenShare) {
          pendingScreenShareTrackRef.current = track;
          setHasRemoteScreenShare(true);
        } else {
          pendingRemoteVideoTrackRef.current = track;
          setHasRemoteVideo(true);
        }
      }
    });

    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      recordCallLifecycle(callId, "track_unsubscribed", {
        status: statusRef.current,
        data: { kind: String(track.kind), source: String((track as any).source ?? "") },
        level: "warn",
      });
      if (track.kind === Track.Kind.Video) {
        const source = (track as any).source;
        if (source === Track.Source.ScreenShare) {
          pendingScreenShareTrackRef.current = null;
          setHasRemoteScreenShare(false);
        } else {
          pendingRemoteVideoTrackRef.current = null;
          setHasRemoteVideo(false);
        }
      }
      track.detach().forEach((el) => el.remove());
    });

    room.on(RoomEvent.ParticipantConnected, () => {
      setStatus("active");
      if (!startTimeRef.current) startTimeRef.current = Date.now();
      if (stopToneRef.current) { stopToneRef.current(); stopToneRef.current = null; }
      if (autoTimeoutRef.current) {
        clearTimeout(autoTimeoutRef.current);
        autoTimeoutRef.current = null;
      }
      if (gracePeriodRef.current) {
        clearTimeout(gracePeriodRef.current);
        gracePeriodRef.current = null;
        setWaitingReconnect(false);
      }
      logCallEvent(callId, "joined", { role: isOutgoing ? "caller" : "callee" });
      recordCallLifecycle(callId, "participant_connected", { status: statusRef.current, data: { role: isOutgoing ? "caller" : "callee" } });
      inactivityTimeoutRef.current = setTimeout(() => {
        if (statusRef.current === "active" && !remoteTrackReceivedRef.current) {
          logCallEvent(callId, "timeout", { reason: "no_remote_track_60s" });
          recordCallLifecycle(callId, "inactivity_timeout", {
            status: statusRef.current,
            message: "No remote audio track within 60s",
            level: "error",
          });
          handleEnd();
        }
      }, 60_000);
    });

    room.on(RoomEvent.ParticipantDisconnected, () => {
      // Only react if we were actually in an active call. During
      // "connecting"/"ringing" LiveKit can emit transient
      // ParticipantDisconnected events as the room state reconciles
      // (e.g. the caller's pre-answer presence syncs after the callee
      // joins). Treating those as a hang-up was killing calls the
      // instant the callee picked up.
      if (statusRef.current !== "active" || endingRef.current) {
        logCallEvent(callId, "failed", {
          stage: "participant_disconnected_ignored",
          status: statusRef.current,
        });
        recordCallLifecycle(callId, "participant_disconnected_ignored", {
          status: statusRef.current,
          message: "Ignored — call not yet active or already ending",
          level: "warn",
        });
        return;
      }
      recordCallLifecycle(callId, "participant_disconnected", {
        status: statusRef.current,
        message: `Grace period started (${GRACE_PERIOD_MS / 1000}s)`,
        level: "warn",
      });
      setWaitingReconnect(true);
      gracePeriodRef.current = setTimeout(() => {
        if (!endingRef.current) {
          recordCallLifecycle(callId, "grace_period_expired", { status: statusRef.current, level: "error" });
          markRecoverableDisconnect("participant_grace_expired", "Remote participant did not reconnect within the grace period");
        }
      }, GRACE_PERIOD_MS);
    });

    room.on(RoomEvent.Disconnected, (reason?: any) => {
      recordCallLifecycle(callId, "room_disconnected", {
        status: statusRef.current,
        data: {
          reason: reason !== undefined ? String(reason) : undefined,
          intentional: intentionalDisconnectRef.current,
          ending: endingRef.current,
        },
        level: endingRef.current || intentionalDisconnectRef.current ? "info" : "warn",
      });
      if (endingRef.current || intentionalDisconnectRef.current) return;
      // Always attempt one auto-reconnect before tearing the call down,
      // regardless of whether status flipped to "active" yet. Ending the
      // call on a transient Disconnected during the connect/answer
      // handshake was making calls drop the instant they were picked up.
      recordCallLifecycle(callId, "auto_reconnect_start", { status: statusRef.current });
      setReconnecting(true);
      void attemptAutoReconnect();
    });

    // Exponential-backoff reconnect with fresh-token fallback. Tries up to
    // MAX_AUTO_RECONNECT times: first the cached token, then on each retry
    // it asks the edge function for a new token (in case the original
    // expired or the LiveKit room was rotated). On Android, transient
    // backgrounding kills the WSS, so this loop is what keeps the call alive.
    const fetchFreshToken = async (): Promise<{ url: string; token: string } | null> => {
      try {
        const { data, error } = await supabase.functions.invoke("dm-call-token", {
          body: { action: "rejoin", call_id: callId },
        });
        if (error || data?.error || !data?.token || !data?.url) return null;
        return { url: data.url, token: data.token };
      } catch {
        return null;
      }
    };

    const attemptAutoReconnect = async () => {
      if (reconnectInFlightRef.current) return;
      if (endingRef.current || intentionalDisconnectRef.current) return;
      reconnectInFlightRef.current = true;
      try {
        while (
          reconnectAttemptsRef.current < MAX_AUTO_RECONNECT &&
          !endingRef.current &&
          !intentionalDisconnectRef.current
        ) {
          const attempt = reconnectAttemptsRef.current + 1;
          reconnectAttemptsRef.current = attempt;
          // Backoff: 0ms, 1500ms, 3500ms
          const delay = attempt === 1 ? 0 : attempt === 2 ? 1500 : 3500;
          if (delay > 0) await new Promise((r) => setTimeout(r, delay));
          if (endingRef.current || intentionalDisconnectRef.current) break;

          // On retries (attempt >= 2) request a brand-new token in case the
          // current one has expired (common cause of "ended right after pickup").
          if (attempt >= 2) {
            const fresh = await fetchFreshToken();
            if (fresh) {
              currentTokenRef.current = fresh.token;
              currentUrlRef.current = fresh.url;
              recordCallLifecycle(callId, "auto_reconnect_fresh_token", {
                status: statusRef.current,
                data: { attempt },
              });
            } else {
              recordCallLifecycle(callId, "auto_reconnect_fresh_token_failed", {
                status: statusRef.current,
                data: { attempt },
                level: "warn",
              });
            }
          }

          try {
            recordCallLifecycle(callId, "auto_reconnect_attempt", {
              status: statusRef.current,
              data: { attempt },
            });
            await room.connect(currentUrlRef.current, currentTokenRef.current);
            try { await room.localParticipant.setMicrophoneEnabled(!muted); } catch {}
            if (cameraOn) {
              try { await room.localParticipant.setCameraEnabled(true); } catch {}
            }
            setReconnecting(false);
            reconnectAttemptsRef.current = 0;
            recordCallLifecycle(callId, "auto_reconnect_ok", {
              status: statusRef.current,
              data: { attempt },
            });
            reconnectInFlightRef.current = false;
            return;
          } catch (err: any) {
            logCallEvent(callId, "failed", {
              stage: "auto_reconnect",
              attempt,
              error: err?.message,
            });
            recordCallLifecycle(callId, "auto_reconnect_failed", {
              status: statusRef.current,
              message: err?.message,
              data: { error_name: err?.name, attempt },
              level: "warn",
            });
            // Loop continues to the next attempt
          }
        }
        // All attempts exhausted — surface the manual rejoin UI.
        if (!endingRef.current && !intentionalDisconnectRef.current) {
          setReconnecting(false);
          markRecoverableDisconnect("auto_reconnect_exhausted", "Auto-reconnect failed after retries", {
            attempts: reconnectAttemptsRef.current,
          });
        }
      } finally {
        reconnectInFlightRef.current = false;
      }
    };

    // Track local video publication to attach to ref
    room.on(RoomEvent.LocalTrackPublished, (pub) => {
      if (pub.track?.kind === Track.Kind.Video) {
        // Defer attachment so the video element renders first
        setTimeout(() => {
          if (localVideoRef.current && pub.track) {
            pub.track.attach(localVideoRef.current);
          }
        }, 100);
      }
    });

    room.on(RoomEvent.LocalTrackUnpublished, (pub) => {
      if (pub.track?.kind === Track.Kind.Video) {
        pub.track.detach().forEach((el) => el.remove());
      }
    });

    // Auto-restore mic when browser mutes it on app switch / minimize
    room.on(RoomEvent.TrackMuted, (pub, participant) => {
      if (
        participant.identity === room.localParticipant.identity &&
        pub.source === Track.Source.Microphone &&
        !userIntentMutedRef.current
      ) {
        setTimeout(async () => {
          try {
            if (roomRef.current && !userIntentMutedRef.current) {
              await room.localParticipant.setMicrophoneEnabled(true);
            }
          } catch {}
        }, 500);
      }
    });

    // Also restore mic when page becomes visible again (returning from app switch)
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible" && roomRef.current && !userIntentMutedRef.current) {
        try {
          const micPub = roomRef.current.localParticipant.getTrackPublication(Track.Source.Microphone);
          if (micPub?.isMuted) {
            await roomRef.current.localParticipant.setMicrophoneEnabled(true);
          }
        } catch {}
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    recordCallLifecycle(callId, "livekit_connect_start", {
      status: statusRef.current,
      data: { url: livekitUrl, room: roomName },
    });
    room
      .connect(livekitUrl, token)
      .then(async () => {
        recordCallLifecycle(callId, "livekit_connected", { status: statusRef.current });
        // Mic enable can fail independently (permission denied, no device).
        // Don't tear down the whole call for that — let the user join muted
        // and surface a targeted toast instead.
        try {
          await room.localParticipant.setMicrophoneEnabled(true);
          recordCallLifecycle(callId, "mic_enable_ok", { status: statusRef.current });
        } catch (micErr: any) {
          console.warn("Microphone enable failed:", micErr);
          logCallEvent(callId, "failed", { stage: "mic_enable", error: micErr?.message });
          recordCallLifecycle(callId, "mic_enable_failed", {
            status: statusRef.current,
            message: micErr?.message,
            data: { error_name: micErr?.name },
            level: "error",
          });
          setMuted(true);
          userIntentMutedRef.current = true;
          const name = micErr?.name || "";
          if (name === "NotAllowedError" || name === "SecurityError") {
            toast.error("Microphone permission denied", {
              description: "Enable mic access in your browser/app settings to talk.",
            });
          } else if (name === "NotFoundError" || name === "OverconstrainedError") {
            toast.error("No microphone found", { description: "Connect a mic and retry." });
          } else {
            toast.warning("Joined muted — mic unavailable");
          }
        }
        // Enable camera if starting with video
        if (startWithVideo) {
          try {
            await room.localParticipant.setCameraEnabled(true);
          } catch (e: any) {
            console.warn("Failed to enable camera:", e);
            recordCallLifecycle(callId, "camera_enable_failed", {
              status: statusRef.current,
              message: e?.message,
              level: "warn",
            });
            setCameraOn(false);
          }
        }
        try {
          const localTrack = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
          const mediaTrack = localTrack?.mediaStreamTrack;
          if (mediaTrack) {
            const stream = new MediaStream([mediaTrack]);
            const ctx = new AudioContext();
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.3;
            source.connect(analyser);
            localAnalyserRef.current = { ctx, analyser, source };
          }
        } catch {}
        if (!isOutgoing) {
          setStatus("active");
          startTimeRef.current = Date.now();
        } else {
          // Kill any existing dial tone before starting a new one (prevents orphaned tones on reconnect)
          if (stopToneRef.current) { stopToneRef.current(); stopToneRef.current = null; }
          stopToneRef.current = playDialTone();
        }
      })
      .catch((err) => {
        if (!intentionalDisconnectRef.current) {
          console.error("Failed to connect to call:", err);
          logCallEvent(callId, "failed", {
            stage: "livekit_connect",
            error: err?.message,
            error_name: err?.name,
            url: livekitUrl,
          });
          recordCallLifecycle(callId, "livekit_connect_failed", {
            status: statusRef.current,
            message: err?.message,
            data: { error_name: err?.name, url: livekitUrl },
            level: "error",
          });
          // Surface a more specific message so we can actually debug. Common
          // causes: expired token, wrong region, network blocking WSS, or
          // browser blocking insecure WebSocket on a non-HTTPS context.
          const reason = err?.message || err?.name || "Unknown error";
          toast.error("Failed to connect to call", { description: reason });
          markRecoverableDisconnect("livekit_connect", "LiveKit connect failed without ending the call", {
            error: err?.message,
            error_name: err?.name,
          });
        }
      });

    if (isOutgoing) {
      autoTimeoutRef.current = setTimeout(() => {
        if (statusRef.current === "ringing") {
          handleTimeout();
        }
      }, 90_000);
    }

    return () => {
      if (autoTimeoutRef.current) clearTimeout(autoTimeoutRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
      if (gracePeriodRef.current) clearTimeout(gracePeriodRef.current);
      if (stopToneRef.current) { stopToneRef.current(); stopToneRef.current = null; }
      try { remoteAnalyserRef.current?.ctx.close(); } catch {} remoteAnalyserRef.current = null;
      try { localAnalyserRef.current?.ctx.close(); } catch {} localAnalyserRef.current = null;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      room.disconnect();
      roomRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Audio level polling
  useEffect(() => {
    if (status !== "active") return;
    const remoteBuf = new Uint8Array(128);
    const localBuf = new Uint8Array(128);
    const poll = () => {
      if (remoteAnalyserRef.current) {
        remoteAnalyserRef.current.analyser.getByteFrequencyData(remoteBuf);
        const avg = remoteBuf.reduce((s, v) => s + v, 0) / remoteBuf.length;
        setRemoteAudioLevel(Math.min(avg / 60, 1));
      } else {
        setRemoteAudioLevel(0);
      }
      if (localAnalyserRef.current) {
        localAnalyserRef.current.analyser.getByteFrequencyData(localBuf);
        const avg = localBuf.reduce((s, v) => s + v, 0) / localBuf.length;
        setLocalAudioLevel(Math.min(avg / 60, 1));
      } else {
        setLocalAudioLevel(0);
      }
      audioLevelRafRef.current = requestAnimationFrame(poll);
    };
    audioLevelRafRef.current = requestAnimationFrame(poll);
    return () => {
      if (audioLevelRafRef.current) cancelAnimationFrame(audioLevelRafRef.current);
    };
  }, [status]);

  // Attach pending remote video track once the <video> element renders
  // Uses retry because the ref may not be set in the same render cycle
  useEffect(() => {
    if (!hasRemoteVideo || !pendingRemoteVideoTrackRef.current) return;
    const track = pendingRemoteVideoTrackRef.current;
    const tryAttach = (attempt: number) => {
      if (remoteVideoRef.current) {
        track.attach(remoteVideoRef.current);
      } else if (attempt < 10) {
        setTimeout(() => tryAttach(attempt + 1), 100);
      }
    };
    tryAttach(0);
  }, [hasRemoteVideo, status]);

  // Attach pending screen share track once the <video> element renders
  useEffect(() => {
    if (!hasRemoteScreenShare || !pendingScreenShareTrackRef.current) return;
    const track = pendingScreenShareTrackRef.current;
    const tryAttach = (attempt: number) => {
      if (screenShareRef.current) {
        track.attach(screenShareRef.current);
      } else if (attempt < 10) {
        setTimeout(() => tryAttach(attempt + 1), 100);
      }
    };
    tryAttach(0);
  }, [hasRemoteScreenShare, status]);

  // Re-attach all video tracks when returning from minimized state
  useEffect(() => {
    if (minimized) return;
    // Re-attach local camera
    if (cameraOn) {
      const room = roomRef.current;
      if (room) {
        const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
        if (camPub?.track) {
          const tryAttachLocal = (attempt: number) => {
            if (localVideoRef.current) {
              camPub.track!.attach(localVideoRef.current);
            } else if (attempt < 10) {
              setTimeout(() => tryAttachLocal(attempt + 1), 100);
            }
          };
          tryAttachLocal(0);
        }
      }
    }
    // Re-attach remote video
    if (hasRemoteVideo && pendingRemoteVideoTrackRef.current) {
      const track = pendingRemoteVideoTrackRef.current;
      const tryAttach = (attempt: number) => {
        if (remoteVideoRef.current) {
          track.attach(remoteVideoRef.current);
        } else if (attempt < 10) {
          setTimeout(() => tryAttach(attempt + 1), 100);
        }
      };
      tryAttach(0);
    }
    // Re-attach remote screen share
    if (hasRemoteScreenShare && pendingScreenShareTrackRef.current) {
      const track = pendingScreenShareTrackRef.current;
      const tryAttach = (attempt: number) => {
        if (screenShareRef.current) {
          track.attach(screenShareRef.current);
        } else if (attempt < 10) {
          setTimeout(() => tryAttach(attempt + 1), 100);
        }
      };
      tryAttach(0);
    }
  }, [minimized, cameraOn, hasRemoteVideo, hasRemoteScreenShare]);

  // Ensure dial tone is killed the moment status leaves "ringing"
  useEffect(() => {
    if (status !== "ringing" && stopToneRef.current) {
      stopToneRef.current();
      stopToneRef.current = null;
    }
  }, [status]);

  // Duration timer
  useEffect(() => {
    if (status === "active") {
      timerRef.current = setInterval(() => {
        if (startTimeRef.current) {
          setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status]);

  // Listen for call status changes via realtime
  useEffect(() => {
    const channel = supabase
      .channel(`dm-call-${callId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "dm_calls",
          filter: `id=eq.${callId}`,
        },
        (payload: any) => {
          const newStatus = payload.new?.status;
          recordCallLifecycle(callId, "remote_status_change", {
            status: statusRef.current,
            data: { db_status: newStatus },
            level: newStatus === "ended" || newStatus === "declined" || newStatus === "missed" ? "warn" : "info",
          });
          if (newStatus === "declined" || newStatus === "missed" || newStatus === "ended") {
            if (stopToneRef.current) { stopToneRef.current(); stopToneRef.current = null; }
            setStatus("ended");
            roomRef.current?.disconnect();
            setTimeout(onClose, 1500);
          } else if (newStatus === "active") {
            if (stopToneRef.current) { stopToneRef.current(); stopToneRef.current = null; }
            if (autoTimeoutRef.current) { clearTimeout(autoTimeoutRef.current); autoTimeoutRef.current = null; }
            setStatus("active");
            if (!startTimeRef.current) startTimeRef.current = Date.now();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [callId, onClose]);

  const toggleMute = async () => {
    if (!roomRef.current) return;
    const newMuted = !muted;
    userIntentMutedRef.current = newMuted;
    await roomRef.current.localParticipant.setMicrophoneEnabled(!newMuted);
    setMuted(newMuted);
  };

  const toggleCamera = async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      const newState = !cameraOn;
      await room.localParticipant.setCameraEnabled(newState);
      setCameraOn(newState);
      if (newState) {
        // Retry attachment up to 3 times with increasing delay
        const attachLocal = (attempt: number) => {
          setTimeout(() => {
            const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
            if (camPub?.track && localVideoRef.current) {
              camPub.track.attach(localVideoRef.current);
            } else if (attempt < 3) {
              attachLocal(attempt + 1);
            }
          }, 200 * (attempt + 1));
        };
        attachLocal(0);
      }
    } catch (err) {
      console.error("Camera toggle error:", err);
      toast.error("Failed to toggle camera");
    }
  };

  const flipCamera = async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      const newFacing = facingMode === "user" ? "environment" : "user";
      
      // Get the current camera track and use restartTrack with new constraints
      const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
      if (camPub?.track) {
        // restartTrack applies new constraints to the existing track
        await (camPub.track as any).restartTrack({
          facingMode: newFacing,
          resolution: { width: 640, height: 480, frameRate: 24 },
        });
        setFacingMode(newFacing);
        // Re-attach after restart
        setTimeout(() => {
          if (localVideoRef.current && camPub.track) {
            camPub.track.attach(localVideoRef.current);
          }
        }, 100);
      } else {
        // Fallback: disable then re-enable with new facing mode
        await room.localParticipant.setCameraEnabled(false);
        await room.localParticipant.setCameraEnabled(true, {
          facingMode: newFacing,
          resolution: { width: 640, height: 480, frameRate: 24 },
        });
        setFacingMode(newFacing);
        setTimeout(() => {
          const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
          if (pub?.track && localVideoRef.current) {
            pub.track.attach(localVideoRef.current);
          }
        }, 200);
      }
    } catch (err) {
      console.error("Flip camera error:", err);
      toast.error("Failed to flip camera");
    }
  };

  const handleRejoin = useCallback(async () => {
    if (!conversationId || !callId) return;
    setShowRejoin(false);
    setReconnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("dm-call-token", {
        body: { action: "rejoin", call_id: callId },
      });
      if (error || data?.error) throw new Error(data?.error || "Failed to rejoin");
      // Reconnect room with fresh token
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: { resolution: { width: 640, height: 480, frameRate: 24 } },
        disconnectOnPageLeave: false,
      });
      const previousRoom = roomRef.current;
      intentionalDisconnectRef.current = true;
      previousRoom?.disconnect();
      intentionalDisconnectRef.current = false;
      roomRef.current = room;
      // Re-bind events
      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          remoteTrackReceivedRef.current = true;
          const el = track.attach();
          el.id = `remote-audio-${track.sid}`;
          el.volume = 0.4;
          if (typeof (el as any).setSinkId === "function") {
            (el as any).setSinkId("communications").catch(() => {});
          }
          document.body.appendChild(el);
        }
        if (track.kind === Track.Kind.Video) {
          const src = (track as any).source;
          if (src === Track.Source.ScreenShare) {
            pendingScreenShareTrackRef.current = track;
            setHasRemoteScreenShare(true);
          } else {
            pendingRemoteVideoTrackRef.current = track;
            setHasRemoteVideo(true);
          }
        }
      });
      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        if (track.kind === Track.Kind.Video) {
          const src = (track as any).source;
          if (src === Track.Source.ScreenShare) {
            pendingScreenShareTrackRef.current = null;
            setHasRemoteScreenShare(false);
          } else {
            pendingRemoteVideoTrackRef.current = null;
            setHasRemoteVideo(false);
          }
        }
        track.detach().forEach((el) => el.remove());
      });
      room.on(RoomEvent.ParticipantDisconnected, () => {
        if (!endingRef.current) {
          setWaitingReconnect(true);
          gracePeriodRef.current = setTimeout(() => {
            if (!endingRef.current) {
              markRecoverableDisconnect("participant_grace_expired", "Remote participant did not reconnect after manual rejoin");
            }
          }, GRACE_PERIOD_MS);
        }
      });
      room.on(RoomEvent.ParticipantConnected, () => {
        setWaitingReconnect(false);
        if (gracePeriodRef.current) { clearTimeout(gracePeriodRef.current); gracePeriodRef.current = null; }
      });

      await room.connect(data.url, data.token);
      await room.localParticipant.setMicrophoneEnabled(!muted);
      if (cameraOn) {
        await room.localParticipant.setCameraEnabled(true);
        setTimeout(() => {
          const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
          if (camPub?.track && localVideoRef.current) camPub.track.attach(localVideoRef.current);
        }, 200);
      }
      setReconnecting(false);
      setStatus("active");
      if (!startTimeRef.current) startTimeRef.current = Date.now();
      endingRef.current = false;
      intentionalDisconnectRef.current = false;
    } catch (err: any) {
      setReconnecting(false);
      toast.error(err.message || "Failed to rejoin call");
      recordCallLifecycle(callId, "rejoin_failed", {
        status: statusRef.current,
        message: err?.message,
        data: { error_name: err?.name },
        level: "error",
      });
      markRecoverableDisconnect("manual_rejoin", "Manual rejoin failed without ending the call", {
        error: err?.message,
        error_name: err?.name,
      });
    }
  }, [callId, conversationId, muted, cameraOn, markRecoverableDisconnect]);

  const toggleScreenShare = async () => {
    if (!roomRef.current) return;
    try {
      const newState = !screenShareOn;
      await roomRef.current.localParticipant.setScreenShareEnabled(newState);
      setScreenShareOn(newState);
    } catch (err: any) {
      // User cancelled the screen share picker
      if (err?.name !== "NotAllowedError") {
        toast.error("Failed to share screen");
      }
    }
  };

  const toggleSpeaker = useCallback(() => {
    const newSpeaker = !speakerOn;
    const room = roomRef.current;

    // Approach 1: setSinkId (works on desktop Chrome, some Android Chrome)
    const audioEls = document.querySelectorAll<HTMLAudioElement>('[id^="remote-audio-"]');
    let sinkIdWorked = false;
    audioEls.forEach((el) => {
      el.volume = newSpeaker ? 1.0 : 0.4;
      if (typeof (el as any).setSinkId === "function") {
        try {
          (el as any).setSinkId(newSpeaker ? "default" : "communications").catch(() => {});
          sinkIdWorked = true;
        } catch {}
      }
    });

    // Approach 2: Detach and re-attach remote audio tracks to force new audio routing
    // This helps on mobile where setSinkId is unsupported
    if (!sinkIdWorked && room) {
      room.remoteParticipants.forEach((p) => {
        p.audioTrackPublications.forEach((pub) => {
          const track = pub.track;
          if (!track) return;
          // Remove old audio elements
          const oldEls = track.detach();
          oldEls.forEach((el) => el.remove());
          // Re-attach with fresh element
          const newEl = track.attach();
          newEl.id = `remote-audio-${track.sid}`;
          newEl.volume = newSpeaker ? 1.0 : 0.4;
          // On mobile, autoplay with different volume hints at routing
          newEl.setAttribute("playsinline", "true");
          document.body.appendChild(newEl);
          newEl.play().catch(() => {});
        });
      });
    }

    setSpeakerOn(newSpeaker);
  }, [speakerOn]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const hasAnyVideo = cameraOn || hasRemoteVideo || hasRemoteScreenShare || screenShareOn;

  // ── Mini call bar ──
  if (minimized) {
    return (
      <div
        className="fixed bottom-20 lg:bottom-4 left-3 right-3 lg:left-auto lg:right-4 lg:w-80 z-[9999] rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-xl animate-in slide-in-from-bottom"
      >
        <div className="flex items-center gap-3 px-4 py-3">
          {/* Live indicator + info */}
          <div className="flex-1 min-w-0 cursor-pointer" onClick={onMaximize}>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-500 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                CALL
              </span>
              <span className="text-[10px] text-muted-foreground">
                {status === "active" && (waitingReconnect || reconnecting) ? "Reconnecting..." : status === "active" ? formatTime(duration) : status === "ringing" ? "Calling..." : "Connecting..."}
              </span>
              {(cameraOn || hasRemoteVideo) && <Video className="w-2.5 h-2.5 text-primary" />}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <div
                className="w-5 h-5 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0 transition-shadow duration-150"
                style={{
                  boxShadow: remoteAudioLevel > 0.05
                    ? `0 0 ${4 + remoteAudioLevel * 8}px ${1 + remoteAudioLevel * 3}px rgba(59,130,246,${0.4 + remoteAudioLevel * 0.5})`
                    : "none",
                }}
              >
                {otherUserAvatar ? (
                  <img src={otherUserAvatar} className="w-full h-full object-cover" alt="" />
                ) : (
                  <span className="text-[8px] font-bold text-foreground">{otherUserName.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <p className="text-xs font-semibold truncate">{otherUserName}</p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={onMaximize}
              className="w-8 h-8 rounded-full bg-muted/80 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              title="Expand"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setMuted(!muted); }}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                muted ? "bg-muted/80 text-muted-foreground" : "bg-primary/20 text-primary"
              }`}
            >
              {muted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); status === "ringing" && isOutgoing ? handleCancel() : handleEnd(); }}
              className="w-8 h-8 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
            >
              <PhoneOff className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── SVG doodle pattern for call background ──
  const doodlePatternSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'>
    <g fill='none' stroke='white' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round' opacity='0.35'>
      <!-- Phone -->
      <g transform='translate(20,25) rotate(-15,12,12)'><rect x='2' y='0' width='20' height='24' rx='3'/><circle cx='12' cy='18' r='2'/><line x1='8' y1='4' x2='16' y2='4'/></g>
      <!-- Mic -->
      <g transform='translate(80,15) rotate(10,8,14)'><rect x='3' y='0' width='10' height='16' rx='5'/><path d='M0,12 Q0,22 8,22 Q16,22 16,12'/><line x1='8' y1='22' x2='8' y2='28'/><line x1='4' y1='28' x2='12' y2='28'/></g>
      <!-- Chat bubble -->
      <g transform='translate(140,20) rotate(5,14,12)'><path d='M2,2 h20 a2,2 0 0 1 2,2 v12 a2,2 0 0 1 -2,2 h-12 l-6,6 v-6 h-2 a2,2 0 0 1 -2,-2 v-12 a2,2 0 0 1 2,-2z'/><line x1='7' y1='8' x2='19' y2='8'/><line x1='7' y1='12' x2='15' y2='12'/></g>
      <!-- Headphones -->
      <g transform='translate(30,80) rotate(-8,12,14)'><path d='M4,16 v-4 a8,8 0 0 1 16,0 v4'/><rect x='2' y='14' width='5' height='8' rx='2'/><rect x='17' y='14' width='5' height='8' rx='2'/></g>
      <!-- Music note -->
      <g transform='translate(100,75) rotate(12,8,14)'><circle cx='4' cy='22' r='4'/><circle cx='16' cy='18' r='4'/><line x1='8' y1='22' x2='8' y2='4'/><line x1='20' y1='18' x2='20' y2='0'/><line x1='8' y1='4' x2='20' y2='0'/></g>
      <!-- Signal wave -->
      <g transform='translate(155,80) rotate(-5,12,12)'><path d='M0,12 Q3,6 6,12 Q9,18 12,12 Q15,6 18,12 Q21,18 24,12'/></g>
      <!-- Heart -->
      <g transform='translate(25,145) rotate(8,10,10)'><path d='M10,18 Q0,12 0,6 A4,4 0 0 1 10,4 A4,4 0 0 1 20,6 Q20,12 10,18z'/></g>
      <!-- Thumbs up -->
      <g transform='translate(85,140) rotate(-10,10,12)'><path d='M6,24 v-10 h-4 v10z'/><path d='M6,14 Q8,6 12,4 Q14,6 13,10 h6 a2,2 0 0 1 2,2 v8 a2,2 0 0 1 -2,2 h-13'/></g>
      <!-- Video camera -->
      <g transform='translate(145,140) rotate(6,14,10)'><rect x='0' y='2' width='18' height='14' rx='2'/><polygon points='18,6 26,2 26,18 18,14'/></g>
      <!-- Star -->
      <g transform='translate(55,50) rotate(-12,8,8)'><polygon points='8,0 10,6 16,6 11,10 13,16 8,12 3,16 5,10 0,6 6,6'/></g>
      <!-- Globe -->
      <g transform='translate(170,50) rotate(3,10,10)'><circle cx='10' cy='10' r='10'/><ellipse cx='10' cy='10' rx='4' ry='10'/><line x1='0' y1='10' x2='20' y2='10'/></g>
      <!-- Lightning bolt -->
      <g transform='translate(120,110) rotate(-6,6,12)'><polyline points='6,0 2,10 7,10 4,24 10,12 5,12 8,0'/></g>
    </g>
  </svg>`;

  const doodleBgUrl = `url("data:image/svg+xml,${encodeURIComponent(doodlePatternSvg)}")`;

  // ── Full-screen overlay ──
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col overflow-hidden" style={{ background: "radial-gradient(ellipse at center, hsl(var(--background)) 0%, hsl(var(--background)) 70%)" }}>
      <CallDebugOverlay callId={callId} />
      {/* Doodle pattern layer */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.08] dark:opacity-[0.10]" style={{ backgroundImage: doodleBgUrl, backgroundSize: "200px 200px", backgroundRepeat: "repeat" }} />
      {/* E2EE indicator + minimize */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 z-20" style={{ paddingTop: "max(1.5rem, calc(var(--safe-top) + 0.5rem))" }}>
        <div className="flex items-center gap-1.5 text-xs text-emerald-500">
          <Lock className="w-3 h-3" />
          <span>End-to-end encrypted</span>
        </div>
        {status !== "ended" && onMinimize && (
          <button onClick={onMinimize} className="text-muted-foreground hover:text-foreground transition-colors p-1">
            <Minimize2 className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Close / back */}
      {status === "ended" && (
        <button onClick={onClose} className="absolute right-6 text-muted-foreground z-20" style={{ top: "max(1.5rem, calc(var(--safe-top) + 0.5rem))" }}>
          <X className="w-5 h-5" />
        </button>
      )}

      {/* Main content area — on desktop use a centered constrained layout */}
      <div className="flex-1 flex flex-col items-center justify-center relative min-h-0">
        {/* Video feeds — shown when any video is active */}
        {hasAnyVideo && status === "active" ? (
          <div className="w-full h-full relative flex items-center justify-center">
            {/* Remote screen share — full screen with contain */}
            {hasRemoteScreenShare && (
              <video
                ref={screenShareRef}
                autoPlay
                playsInline
                className="w-full h-full object-contain bg-black"
              />
            )}

            {/* Remote camera — contained on desktop, cover on mobile */}
            {hasRemoteVideo && (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className={hasRemoteScreenShare
                  ? "absolute top-16 right-4 w-32 h-24 lg:w-48 lg:h-36 rounded-xl object-cover border-2 border-border shadow-lg z-10"
                  : "w-full h-full object-cover sm:object-contain sm:max-h-[calc(100vh-10rem)] sm:max-w-[calc(100vw-2rem)]"
                }
              />
            )}

            {/* No remote video but we have local — show avatar centered */}
            {!hasRemoteVideo && !hasRemoteScreenShare && (
              <div className="w-full h-full flex items-center justify-center">
                <div
                  className="w-24 h-24 lg:w-32 lg:h-32 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden transition-shadow duration-150"
                  style={{
                    boxShadow: remoteAudioLevel > 0.05
                      ? `0 0 ${12 + remoteAudioLevel * 30}px ${4 + remoteAudioLevel * 10}px hsl(var(--primary) / ${0.35 + remoteAudioLevel * 0.55})`
                      : "none",
                  }}
                >
                  {otherUserAvatar ? (
                    <img src={otherUserAvatar} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <span className="text-3xl lg:text-4xl font-bold text-primary">{otherUserName.charAt(0).toUpperCase()}</span>
                  )}
                </div>
              </div>
            )}

            {/* Local camera PiP — draggable, larger on desktop */}
            {cameraOn && (
              <div
                className="absolute w-28 h-36 sm:w-36 sm:h-48 lg:w-44 lg:h-56 rounded-xl overflow-hidden border-2 border-border shadow-lg z-10 touch-none cursor-grab active:cursor-grabbing"
                style={{
                  bottom: `${pipPos.y}px`,
                  right: `${pipPos.x}px`,
                  transition: pipDragging ? "none" : "bottom 0.2s, right 0.2s",
                }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  (e.target as HTMLElement).setPointerCapture(e.pointerId);
                  setPipDragging(true);
                  pipDragStart.current = { x: e.clientX, y: e.clientY, startX: pipPos.x, startY: pipPos.y };
                }}
                onPointerMove={(e) => {
                  if (!pipDragging || !pipDragStart.current) return;
                  const dx = pipDragStart.current.x - e.clientX;
                  const dy = pipDragStart.current.y - e.clientY;
                  const maxX = window.innerWidth - 128;
                  const maxY = window.innerHeight - 160;
                  setPipPos({
                    x: Math.max(4, Math.min(maxX, pipDragStart.current.startX + dx)),
                    y: Math.max(4, Math.min(maxY, pipDragStart.current.startY + dy)),
                  });
                }}
                onPointerUp={() => setPipDragging(false)}
                onPointerCancel={() => setPipDragging(false)}
              >
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  style={{ transform: facingMode === "user" ? "scaleX(-1)" : "none" }}
                />
              </div>
            )}

            {/* Name + duration overlay — positioned above controls */}
            <div className="absolute bottom-0 left-0 right-0 text-center z-10 pb-2">
              <h2 className="text-lg font-semibold text-foreground drop-shadow-md">{otherUserName}</h2>
              <p className="text-sm text-muted-foreground">
                {reconnecting ? "Reconnecting..." : waitingReconnect ? `Waiting for ${otherUserName}...` : formatTime(duration)}
              </p>
            </div>
          </div>
        ) : (
          /* Audio-only view — avatars with glow */
          <>
            <div className="flex items-center gap-6 mb-4">
              <div
                className="w-24 h-24 lg:w-32 lg:h-32 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden shrink-0 transition-shadow duration-150"
                style={{
                  boxShadow: status === "active" && remoteAudioLevel > 0.05
                    ? `0 0 ${12 + remoteAudioLevel * 30}px ${4 + remoteAudioLevel * 10}px hsl(var(--primary) / ${0.35 + remoteAudioLevel * 0.55})`
                    : "none",
                }}
              >
                {otherUserAvatar ? (
                  <img src={otherUserAvatar} className="w-full h-full object-cover" alt="" />
                ) : (
                  <span className="text-3xl lg:text-4xl font-bold text-primary">{otherUserName.charAt(0).toUpperCase()}</span>
                )}
              </div>
            </div>

            <h2 className="text-xl font-semibold text-foreground mb-1">{otherUserName}</h2>

            <p className="text-sm text-muted-foreground mb-8">
              {status === "ringing" && "Calling..."}
              {status === "connecting" && "Connecting..."}
              {status === "active" && reconnecting && "Reconnecting..."}
              {status === "active" && !reconnecting && showRejoin && "Disconnected — tap Rejoin"}
              {status === "active" && !reconnecting && !showRejoin && waitingReconnect && `Waiting for ${otherUserName} to reconnect...`}
              {status === "active" && !reconnecting && !showRejoin && !waitingReconnect && formatTime(duration)}
              {status === "ended" && "Call ended"}
            </p>
          </>
        )}
      </div>

      {/* Rejoin banner */}
      {showRejoin && (
        <div className="shrink-0 px-4 py-3 flex items-center justify-center gap-3">
          <p className="text-sm text-muted-foreground">Call disconnected</p>
          <button
            onClick={handleRejoin}
            className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium active:scale-95 transition-transform"
          >
            <Phone className="w-4 h-4 inline mr-1.5" />
            Rejoin Call
          </button>
        </div>
      )}

      {/* Controls — always visible, never pushed off-screen */}
      <div className="shrink-0 flex items-center justify-center gap-3 px-4 py-4 lg:gap-4" style={{ paddingBottom: "max(1.5rem, calc(var(--safe-bottom) + 1rem))" }}>
        {status === "active" && !showRejoin && (
          <>
            <button
              onClick={toggleMute}
              className={`w-12 h-12 lg:w-14 lg:h-14 rounded-full flex items-center justify-center transition-colors ${
                muted ? "bg-destructive/20 text-destructive" : "bg-muted text-foreground"
              }`}
            >
              {muted ? <MicOff className="w-5 h-5 lg:w-6 lg:h-6" /> : <Mic className="w-5 h-5 lg:w-6 lg:h-6" />}
            </button>

            <button
              onClick={toggleCamera}
              className={`w-12 h-12 lg:w-14 lg:h-14 rounded-full flex items-center justify-center transition-colors ${
                cameraOn ? "bg-primary/20 text-primary ring-2 ring-primary" : "bg-muted text-foreground"
              }`}
            >
              {cameraOn ? <Video className="w-5 h-5 lg:w-6 lg:h-6" /> : <VideoOff className="w-5 h-5 lg:w-6 lg:h-6" />}
            </button>

            {cameraOn && (
              <button
                onClick={flipCamera}
                className="w-12 h-12 lg:w-14 lg:h-14 rounded-full flex items-center justify-center bg-muted text-foreground transition-colors"
                aria-label="Flip camera"
              >
                <SwitchCamera className="w-5 h-5 lg:w-6 lg:h-6" />
              </button>
            )}

            {screenShareEnabled && (
              <button
                onClick={toggleScreenShare}
                className={`w-12 h-12 lg:w-14 lg:h-14 rounded-full flex items-center justify-center transition-colors ${
                  screenShareOn ? "bg-primary/20 text-primary ring-2 ring-primary" : "bg-muted text-foreground"
                }`}
                aria-label="Screen share"
              >
                {screenShareOn ? <MonitorOff className="w-5 h-5 lg:w-6 lg:h-6" /> : <Monitor className="w-5 h-5 lg:w-6 lg:h-6" />}
              </button>
            )}
          </>
        )}

        {(status === "ringing" || status === "connecting" || status === "active") && !showRejoin && (
          <button
            onClick={status === "ringing" && isOutgoing ? handleCancel : handleEnd}
            className="w-14 h-14 lg:w-16 lg:h-16 rounded-full bg-destructive flex items-center justify-center text-destructive-foreground active:scale-95 transition-transform"
          >
            <PhoneOff className="w-6 h-6 lg:w-7 lg:h-7" />
          </button>
        )}

        {status === "active" && !showRejoin && (
          <>
            <button
              onClick={toggleSpeaker}
              className={`w-12 h-12 lg:w-14 lg:h-14 rounded-full flex items-center justify-center transition-colors ${
                speakerOn ? "bg-primary/20 text-primary ring-2 ring-primary" : "bg-muted text-foreground"
              }`}
            >
              {speakerOn ? <Volume2 className="w-5 h-5 lg:w-6 lg:h-6" /> : <VolumeX className="w-5 h-5 lg:w-6 lg:h-6" />}
            </button>
          </>
        )}

        {showRejoin && (
          <button
            onClick={handleEnd}
            className="w-12 h-12 rounded-full bg-destructive/20 text-destructive flex items-center justify-center"
          >
            <PhoneOff className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
};

export default VoiceCallOverlay;
