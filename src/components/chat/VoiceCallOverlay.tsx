import { useState, useEffect, useRef, useCallback } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import { playDialTone } from "@/lib/sounds";
import { supabase } from "@/integrations/supabase/client";
import { PhoneOff, Mic, MicOff, Volume2, Lock, X, Minimize2 } from "lucide-react";
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
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose: () => void;
}

type CallStatus = "connecting" | "ringing" | "active" | "ended";

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
  onMinimize,
  onMaximize,
  onClose,
}: VoiceCallOverlayProps) => {
  const [status, setStatus] = useState<CallStatus>(
    isOutgoing ? "ringing" : "connecting"
  );
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(false);
  const [duration, setDuration] = useState(0);

  const roomRef = useRef<Room | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const autoTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inactivityTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const stopToneRef = useRef<(() => void) | null>(null);
  const intentionalDisconnectRef = useRef(false);
  const endingRef = useRef(false); // guard double-end
  const statusRef = useRef<CallStatus>(isOutgoing ? "ringing" : "connecting");
  const remoteTrackReceivedRef = useRef(false);

  // Keep statusRef in sync
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
    });
    roomRef.current = room;

    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Audio) {
        remoteTrackReceivedRef.current = true;
        const el = track.attach();
        el.id = `remote-audio-${track.sid}`;
        document.body.appendChild(el);
        // Clear inactivity timeout once we receive audio
        if (inactivityTimeoutRef.current) {
          clearTimeout(inactivityTimeoutRef.current);
          inactivityTimeoutRef.current = null;
        }
      }
    });

    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      track.detach().forEach((el) => el.remove());
    });

    room.on(RoomEvent.ParticipantConnected, () => {
      setStatus("active");
      startTimeRef.current = Date.now();
      if (stopToneRef.current) { stopToneRef.current(); stopToneRef.current = null; }
      if (autoTimeoutRef.current) {
        clearTimeout(autoTimeoutRef.current);
        autoTimeoutRef.current = null;
      }
      // Start 60s inactivity timeout — auto-end if no remote audio received
      inactivityTimeoutRef.current = setTimeout(() => {
        if (statusRef.current === "active" && !remoteTrackReceivedRef.current) {
          handleEnd();
        }
      }, 60_000);
    });

    room.on(RoomEvent.ParticipantDisconnected, () => {
      handleEnd();
    });

    room.on(RoomEvent.Disconnected, () => {
      if (!endingRef.current) handleEnd();
    });

    room
      .connect(livekitUrl, token)
      .then(async () => {
        await room.localParticipant.setMicrophoneEnabled(true);
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

    // Auto-timeout for unanswered outgoing calls (60s)
    if (isOutgoing) {
      autoTimeoutRef.current = setTimeout(() => {
        if (statusRef.current === "ringing") {
          handleCancel();
        }
      }, 60000);
    }

    return () => {
      if (autoTimeoutRef.current) clearTimeout(autoTimeoutRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
      if (stopToneRef.current) { stopToneRef.current(); stopToneRef.current = null; }
      // Ensure call is ended on unmount
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
            // Stop dial/ring tone when call becomes active
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
          <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center overflow-hidden shrink-0">
            {otherUserAvatar ? (
              <img src={otherUserAvatar} className="w-full h-full object-cover" alt="" />
            ) : (
              <span className="text-[10px] font-bold">{otherUserName.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <span className="text-sm font-medium truncate">{otherUserName}</span>
          <span className="text-xs opacity-80">
            {status === "active" ? formatTime(duration) : status === "ringing" ? "Calling..." : "Connecting..."}
          </span>
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
    <div className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-xl flex flex-col items-center justify-center">
      {/* E2EE indicator + minimize */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6" style={{ paddingTop: "max(1.5rem, calc(var(--safe-top) + 0.5rem))" }}>
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
        <button onClick={onClose} className="absolute right-6 text-muted-foreground" style={{ top: "max(1.5rem, calc(var(--safe-top) + 0.5rem))" }}>
          <X className="w-5 h-5" />
        </button>
      )}

      {/* Avatar */}
      <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden mb-4">
        {otherUserAvatar ? (
          <img src={otherUserAvatar} className="w-full h-full object-cover" alt="" />
        ) : (
          <span className="text-3xl font-bold text-primary">
            {otherUserName.charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      <h2 className="text-xl font-semibold text-foreground mb-1">{otherUserName}</h2>

      <p className="text-sm text-muted-foreground mb-8">
        {status === "ringing" && "Calling..."}
        {status === "connecting" && "Connecting..."}
        {status === "active" && formatTime(duration)}
        {status === "ended" && "Call ended"}
      </p>

      {/* Controls */}
      <div className="flex items-center gap-6">
        {status === "active" && (
          <button
            onClick={toggleMute}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
              muted
                ? "bg-destructive/20 text-destructive"
                : "bg-muted text-foreground"
            }`}
          >
            {muted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>
        )}

        {(status === "ringing" || status === "connecting" || status === "active") && (
          <button
            onClick={status === "ringing" && isOutgoing ? handleCancel : handleEnd}
            className="w-16 h-16 rounded-full bg-destructive flex items-center justify-center text-destructive-foreground active:scale-95 transition-transform"
          >
            <PhoneOff className="w-7 h-7" />
          </button>
        )}

        {status === "active" && (
          <button
            onClick={toggleSpeaker}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
              speakerOn
                ? "bg-primary/20 text-primary ring-2 ring-primary"
                : "bg-muted text-foreground"
            }`}
          >
            <Volume2 className="w-6 h-6" />
          </button>
        )}
      </div>
    </div>
  );
};

export default VoiceCallOverlay;
