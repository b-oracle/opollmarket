import { useState, useEffect, useRef, useCallback } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import { playDialTone } from "@/lib/sounds";
import { supabase } from "@/integrations/supabase/client";
import { PhoneOff, Mic, MicOff, Volume2, Lock, X, Minimize2, Video, VideoOff, Monitor, MonitorOff, SwitchCamera } from "lucide-react";
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
      if (track.kind === Track.Kind.Audio) {
        remoteTrackReceivedRef.current = true;
        const el = track.attach();
        el.id = `remote-audio-${track.sid}`;
        document.body.appendChild(el);
        try {
          const stream = (track as any).mediaStream as MediaStream | undefined;
          if (stream) {
            const ctx = new AudioContext();
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
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
        room.connect(livekitUrl, token)
          .then(async () => {
            await room.localParticipant.setMicrophoneEnabled(!muted);
            if (cameraOn) await room.localParticipant.setCameraEnabled(true);
            setReconnecting(false);
          })
          .catch(() => {
            setReconnecting(false);
            if (!endingRef.current) handleEnd();
          });
      } else if (!endingRef.current) {
        handleEnd();
      }
    });

    // Track local video publication to attach to ref
    room.on(RoomEvent.LocalTrackPublished, (pub) => {
      if (pub.track?.kind === Track.Kind.Video && localVideoRef.current) {
        pub.track.attach(localVideoRef.current);
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
          const stream = (localTrack as any)?.mediaStream as MediaStream | undefined;
          if (stream) {
            const ctx = new AudioContext();
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
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
      if (!endingRef.current && statusRef.current !== "ended") {
        const s = statusRef.current;
        if (s === "ringing" && isOutgoing) {
          handleCancel();
        } else if (s === "active" || s === "connecting") {
          handleEnd();
        }
      }
      room.disconnect();
      roomRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Audio level polling
  useEffect(() => {
    if (status !== "active") return;
    const buf = new Uint8Array(128);
    const poll = () => {
      if (remoteAnalyserRef.current) {
        remoteAnalyserRef.current.analyser.getByteFrequencyData(buf);
        const avg = buf.reduce((s, v) => s + v, 0) / buf.length;
        setRemoteAudioLevel(Math.min(avg / 80, 1));
      }
      if (localAnalyserRef.current) {
        localAnalyserRef.current.analyser.getByteFrequencyData(buf);
        const avg = buf.reduce((s, v) => s + v, 0) / buf.length;
        setLocalAudioLevel(Math.min(avg / 80, 1));
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
    } catch (err) {
      toast.error("Failed to toggle camera");
    }
  };

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

  // ── Full-screen overlay ──
  return (
    <div className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-xl flex flex-col">
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
                style={{ transform: "scaleX(-1)" }}
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
              {status === "active" && !reconnecting && waitingReconnect && `Waiting for ${otherUserName} to reconnect...`}
              {status === "active" && !reconnecting && !waitingReconnect && formatTime(duration)}
              {status === "ended" && "Call ended"}
            </p>
          </>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4 pb-8 px-4 shrink-0" style={{ paddingBottom: "max(2rem, calc(var(--safe-bottom) + 1rem))" }}>
        {status === "active" && (
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
          </>
        )}

        {(status === "ringing" || status === "connecting" || status === "active") && (
          <button
            onClick={status === "ringing" && isOutgoing ? handleCancel : handleEnd}
            className="w-14 h-14 rounded-full bg-destructive flex items-center justify-center text-destructive-foreground active:scale-95 transition-transform"
          >
            <PhoneOff className="w-6 h-6" />
          </button>
        )}

        {status === "active" && (
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
      </div>
    </div>
  );
};

export default VoiceCallOverlay;
