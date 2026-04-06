import { useState, useEffect, useRef, useCallback } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import { playDialTone } from "@/lib/sounds";
import { supabase } from "@/integrations/supabase/client";
import { PhoneOff, Phone, Mic, MicOff, Volume2, Lock, X, Minimize2, Video, VideoOff, Monitor, MonitorOff, SwitchCamera } from "lucide-react";
import { toast } from "sonner";

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
  const [status, setStatus] = useState<CallStatus>(
    isOutgoing ? "ringing" : "connecting"
  );
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(false);
  const [cameraOn, setCameraOn] = useState(startWithVideo);
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

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const handleEnd = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    intentionalDisconnectRef.current = true;
    setStatus("ended");
    if (timerRef.current) clearInterval(timerRef.current);
    if (inactivityTimeoutRef.current) { clearTimeout(inactivityTimeoutRef.current); inactivityTimeoutRef.current = null; }
    if (stopToneRef.current) { stopToneRef.current(); stopToneRef.current = null; }
    roomRef.current?.disconnect();

    try {
      await supabase.functions.invoke("dm-call-token", {
        body: { action: "end", call_id: callId },
      });
    } catch { /* ignore */ }

    setTimeout(onClose, 1000);
  }, [callId, onClose]);

  const handleCancel = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    intentionalDisconnectRef.current = true;
    setStatus("ended");
    if (inactivityTimeoutRef.current) { clearTimeout(inactivityTimeoutRef.current); inactivityTimeoutRef.current = null; }
    if (stopToneRef.current) { stopToneRef.current(); stopToneRef.current = null; }
    roomRef.current?.disconnect();

    try {
      await supabase.functions.invoke("dm-call-token", {
        body: { action: "cancel", call_id: callId },
      });
    } catch { /* ignore */ }

    setTimeout(onClose, 500);
  }, [callId, onClose]);

  // Connect to LiveKit room
  useEffect(() => {
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: { resolution: { width: 640, height: 480, frameRate: 24 } },
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
          setHasRemoteScreenShare(true);
          if (screenShareRef.current) track.attach(screenShareRef.current);
        } else {
          setHasRemoteVideo(true);
          if (remoteVideoRef.current) track.attach(remoteVideoRef.current);
        }
      }
    });

    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      if (track.kind === Track.Kind.Video) {
        const source = (track as any).source;
        if (source === Track.Source.ScreenShare) {
          setHasRemoteScreenShare(false);
        } else {
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
      inactivityTimeoutRef.current = setTimeout(() => {
        if (statusRef.current === "active" && !remoteTrackReceivedRef.current) {
          handleEnd();
        }
      }, 60_000);
    });

    room.on(RoomEvent.ParticipantDisconnected, () => {
      if (statusRef.current === "active" && !endingRef.current) {
        setWaitingReconnect(true);
        gracePeriodRef.current = setTimeout(() => {
          if (!endingRef.current) handleEnd();
        }, GRACE_PERIOD_MS);
      } else {
        handleEnd();
      }
    });

    room.on(RoomEvent.Disconnected, () => {
      if (!endingRef.current && !intentionalDisconnectRef.current && statusRef.current === "active") {
        setReconnecting(true);
        // Try auto-reconnect once
        room.connect(livekitUrl, token)
          .then(async () => {
            await room.localParticipant.setMicrophoneEnabled(!muted);
            if (cameraOn) await room.localParticipant.setCameraEnabled(true);
            setReconnecting(false);
          })
          .catch(() => {
            // Auto-reconnect failed — show manual rejoin button instead of ending
            setReconnecting(false);
            setShowRejoin(true);
          });
      } else if (!endingRef.current) {
        handleEnd();
      }
    });

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

    room
      .connect(livekitUrl, token)
      .then(async () => {
        await room.localParticipant.setMicrophoneEnabled(true);
        // Enable camera if starting with video
        if (startWithVideo) {
          try {
            await room.localParticipant.setCameraEnabled(true);
          } catch (e) {
            console.warn("Failed to enable camera:", e);
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
          stopToneRef.current = playDialTone();
        }
      })
      .catch((err) => {
        if (!intentionalDisconnectRef.current) {
          console.error("Failed to connect to call:", err);
          toast.error("Failed to connect to call");
          handleEnd();
        }
      });

    if (isOutgoing) {
      autoTimeoutRef.current = setTimeout(() => {
        if (statusRef.current === "ringing") {
          handleCancel();
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
    await roomRef.current.localParticipant.setMicrophoneEnabled(!newMuted);
    setMuted(newMuted);
  };

  const toggleCamera = async () => {
    if (!roomRef.current) return;
    try {
      const newState = !cameraOn;
      await roomRef.current.localParticipant.setCameraEnabled(newState);
      setCameraOn(newState);
      // Re-attach track to ref after a tick
      if (newState) {
        setTimeout(() => {
          const camPub = roomRef.current?.localParticipant.getTrackPublication(Track.Source.Camera);
          if (camPub?.track && localVideoRef.current) {
            camPub.track.attach(localVideoRef.current);
          }
        }, 200);
      }
    } catch (err) {
      toast.error("Failed to toggle camera");
    }
  };

  const flipCamera = async () => {
    if (!roomRef.current) return;
    try {
      const newFacing = facingMode === "user" ? "environment" : "user";
      // Restart camera with new facing mode
      await roomRef.current.localParticipant.setCameraEnabled(false);
      await roomRef.current.localParticipant.setCameraEnabled(true, {
        facingMode: newFacing,
        resolution: { width: 640, height: 480, frameRate: 24 },
      });
      setFacingMode(newFacing);
      // Re-attach
      setTimeout(() => {
        const camPub = roomRef.current?.localParticipant.getTrackPublication(Track.Source.Camera);
        if (camPub?.track && localVideoRef.current) {
          camPub.track.attach(localVideoRef.current);
        }
      }, 200);
    } catch (err) {
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
      });
      roomRef.current?.disconnect();
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
            setHasRemoteScreenShare(true);
            if (screenShareRef.current) track.attach(screenShareRef.current);
          } else {
            setHasRemoteVideo(true);
            if (remoteVideoRef.current) track.attach(remoteVideoRef.current);
          }
        }
      });
      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        if (track.kind === Track.Kind.Video) {
          const src = (track as any).source;
          if (src === Track.Source.ScreenShare) setHasRemoteScreenShare(false);
          else setHasRemoteVideo(false);
        }
        track.detach().forEach((el) => el.remove());
      });
      room.on(RoomEvent.ParticipantDisconnected, () => {
        if (!endingRef.current) {
          setWaitingReconnect(true);
          gracePeriodRef.current = setTimeout(() => {
            if (!endingRef.current) handleEnd();
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
      handleEnd();
    }
  }, [callId, conversationId, muted, cameraOn, handleEnd]);

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
    const audioEls = document.querySelectorAll<HTMLAudioElement>('[id^="remote-audio-"]');
    const newSpeaker = !speakerOn;
    audioEls.forEach((el) => {
      // Volume fallback: earpiece = 0.4, speaker = 1.0
      el.volume = newSpeaker ? 1.0 : 0.4;
      if (typeof (el as any).setSinkId === "function") {
        (el as any).setSinkId(newSpeaker ? "default" : "communications").catch(() => {});
      }
    });
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
        onClick={onMaximize}
        className="fixed top-0 left-0 right-0 z-[9999] bg-emerald-600 text-white px-4 py-2 flex items-center gap-3 cursor-pointer animate-in slide-in-from-top active:bg-emerald-700 transition-colors"
        style={{ paddingTop: "max(0.5rem, var(--safe-top))" }}
      >
        <div className="w-2 h-2 rounded-full bg-white animate-pulse shrink-0" />
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div
            className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center overflow-hidden shrink-0 transition-shadow duration-150"
            style={{
              boxShadow: remoteAudioLevel > 0.05
                ? `0 0 ${4 + remoteAudioLevel * 8}px ${1 + remoteAudioLevel * 3}px rgba(59,130,246,${0.4 + remoteAudioLevel * 0.5})`
                : "none",
            }}
          >
            {otherUserAvatar ? (
              <img src={otherUserAvatar} className="w-full h-full object-cover" alt="" />
            ) : (
              <span className="text-[10px] font-bold">{otherUserName.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <span className="text-sm font-medium truncate">{otherUserName}</span>
          <span className="text-xs opacity-80">
            {status === "active" && (waitingReconnect || reconnecting) ? "Reconnecting..." : status === "active" ? formatTime(duration) : status === "ringing" ? "Calling..." : "Connecting..."}
          </span>
          {(cameraOn || hasRemoteVideo) && <Video className="w-3.5 h-3.5 opacity-70" />}
        </div>
        <span className="text-xs opacity-80">Tap to return</span>
        <button
          onClick={(e) => { e.stopPropagation(); status === "ringing" && isOutgoing ? handleCancel() : handleEnd(); }}
          className="w-7 h-7 rounded-full bg-destructive flex items-center justify-center shrink-0"
        >
          <PhoneOff className="w-3.5 h-3.5" />
        </button>
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
    <div className="fixed inset-0 z-[9999] flex flex-col overflow-hidden" style={{ background: "radial-gradient(ellipse at center, hsl(var(--background) / 0.97) 0%, hsl(var(--background)) 70%)" }}>
      {/* Doodle pattern layer */}
      <div className="absolute inset-0 opacity-[0.04] dark:opacity-[0.05]" style={{ backgroundImage: doodleBgUrl, backgroundSize: "200px 200px", backgroundRepeat: "repeat" }} />
      {/* E2EE indicator + minimize */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 z-10" style={{ paddingTop: "max(1.5rem, calc(var(--safe-top) + 0.5rem))" }}>
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
        <button onClick={onClose} className="absolute right-6 text-muted-foreground z-10" style={{ top: "max(1.5rem, calc(var(--safe-top) + 0.5rem))" }}>
          <X className="w-5 h-5" />
        </button>
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col items-center justify-center relative">
        {/* Video feeds — shown when any video is active */}
        {hasAnyVideo && status === "active" ? (
          <div className="w-full h-full relative">
            {/* Remote screen share — full screen */}
            {hasRemoteScreenShare && (
              <video
                ref={screenShareRef}
                autoPlay
                playsInline
                className="w-full h-full object-contain bg-black"
              />
            )}

            {/* Remote camera — full screen or inset if screen share is active */}
            {hasRemoteVideo && (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className={hasRemoteScreenShare
                  ? "absolute top-16 right-4 w-32 h-24 rounded-xl object-cover border-2 border-border shadow-lg z-10"
                  : "w-full h-full object-cover"
                }
                style={!hasRemoteScreenShare ? {} : {}}
              />
            )}

            {/* No remote video but we have local — show avatar centered */}
            {!hasRemoteVideo && !hasRemoteScreenShare && (
              <div className="w-full h-full flex items-center justify-center">
                <div
                  className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden transition-shadow duration-150"
                  style={{
                    boxShadow: remoteAudioLevel > 0.05
                      ? `0 0 ${12 + remoteAudioLevel * 30}px ${4 + remoteAudioLevel * 10}px hsl(var(--primary) / ${0.35 + remoteAudioLevel * 0.55})`
                      : "none",
                  }}
                >
                  {otherUserAvatar ? (
                    <img src={otherUserAvatar} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <span className="text-3xl font-bold text-primary">{otherUserName.charAt(0).toUpperCase()}</span>
                  )}
                </div>
              </div>
            )}

            {/* Local camera PiP — bottom right corner */}
            {cameraOn && (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="absolute bottom-28 right-4 w-28 h-36 rounded-xl object-cover border-2 border-border shadow-lg z-10"
                style={{ transform: facingMode === "user" ? "scaleX(-1)" : "none" }}
              />
            )}

            {/* Name + duration overlay */}
            <div className="absolute bottom-20 left-0 right-0 text-center z-10">
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
                className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden shrink-0 transition-shadow duration-150"
                style={{
                  boxShadow: status === "active" && remoteAudioLevel > 0.05
                    ? `0 0 ${12 + remoteAudioLevel * 30}px ${4 + remoteAudioLevel * 10}px hsl(var(--primary) / ${0.35 + remoteAudioLevel * 0.55})`
                    : "none",
                }}
              >
                {otherUserAvatar ? (
                  <img src={otherUserAvatar} className="w-full h-full object-cover" alt="" />
                ) : (
                  <span className="text-3xl font-bold text-primary">{otherUserName.charAt(0).toUpperCase()}</span>
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

      {/* Controls */}
      <div className="flex items-center justify-center gap-3 pb-8 px-4 shrink-0 flex-wrap" style={{ paddingBottom: "max(2rem, calc(var(--safe-bottom) + 1rem))" }}>
        {status === "active" && !showRejoin && (
          <>
            <button
              onClick={toggleMute}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                muted ? "bg-destructive/20 text-destructive" : "bg-muted text-foreground"
              }`}
            >
              {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            <button
              onClick={toggleCamera}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                cameraOn ? "bg-primary/20 text-primary ring-2 ring-primary" : "bg-muted text-foreground"
              }`}
            >
              {cameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
            </button>

            {cameraOn && (
              <button
                onClick={flipCamera}
                className="w-12 h-12 rounded-full flex items-center justify-center bg-muted text-foreground transition-colors"
                aria-label="Flip camera"
              >
                <SwitchCamera className="w-5 h-5" />
              </button>
            )}
          </>
        )}

        {(status === "ringing" || status === "connecting" || status === "active") && !showRejoin && (
          <button
            onClick={status === "ringing" && isOutgoing ? handleCancel : handleEnd}
            className="w-14 h-14 rounded-full bg-destructive flex items-center justify-center text-destructive-foreground active:scale-95 transition-transform"
          >
            <PhoneOff className="w-6 h-6" />
          </button>
        )}

        {status === "active" && !showRejoin && (
          <>
            <button
              onClick={toggleScreenShare}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                screenShareOn ? "bg-primary/20 text-primary ring-2 ring-primary" : "bg-muted text-foreground"
              }`}
            >
              {screenShareOn ? <Monitor className="w-5 h-5" /> : <MonitorOff className="w-5 h-5" />}
            </button>

            <button
              onClick={toggleSpeaker}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                speakerOn ? "bg-primary/20 text-primary ring-2 ring-primary" : "bg-muted text-foreground"
              }`}
            >
              <Volume2 className="w-5 h-5" />
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
