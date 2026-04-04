import { useState, useEffect, useRef, useCallback } from "react";
import { Room, RoomEvent, Track, ConnectionState } from "livekit-client";
import { playDialTone, playRingtone } from "@/lib/sounds";
import { supabase } from "@/integrations/supabase/client";
import { Phone, PhoneOff, Mic, MicOff, Volume2, Lock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  onClose: () => void;
}

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
  onClose,
}: VoiceCallOverlayProps) => {
  const [status, setStatus] = useState<"connecting" | "ringing" | "active" | "ended">(
    isOutgoing ? "ringing" : "connecting"
  );
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const roomRef = useRef<Room | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const autoTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const stopToneRef = useRef<(() => void) | null>(null);

  // Connect to LiveKit room
  useEffect(() => {
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
    });
    roomRef.current = room;

    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Audio) {
        const el = track.attach();
        el.id = `remote-audio-${track.sid}`;
        document.body.appendChild(el);
      }
    });

    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      track.detach().forEach((el) => el.remove());
    });

    room.on(RoomEvent.ParticipantConnected, () => {
      setStatus("active");
      startTimeRef.current = Date.now();
      if (autoTimeoutRef.current) {
        clearTimeout(autoTimeoutRef.current);
        autoTimeoutRef.current = null;
      }
    });

    room.on(RoomEvent.ParticipantDisconnected, () => {
      handleEnd();
    });

    room.on(RoomEvent.Disconnected, () => {
      handleEnd();
    });

    room
      .connect(livekitUrl, token)
      .then(async () => {
        await room.localParticipant.setMicrophoneEnabled(true);
        if (!isOutgoing) {
          setStatus("active");
          startTimeRef.current = Date.now();
        }
      })
      .catch((err) => {
        console.error("Failed to connect to call:", err);
        toast.error("Failed to connect to call");
        handleEnd();
      });

    // Auto-timeout for outgoing calls (60s)
    if (isOutgoing) {
      autoTimeoutRef.current = setTimeout(() => {
        if (status === "ringing") {
          handleCancel();
        }
      }, 60000);
    }

    return () => {
      if (autoTimeoutRef.current) clearTimeout(autoTimeoutRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
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
            setStatus("ended");
            roomRef.current?.disconnect();
            setTimeout(onClose, 1500);
          } else if (newStatus === "active") {
            setStatus("active");
            startTimeRef.current = Date.now();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [callId, onClose]);

  const handleEnd = useCallback(async () => {
    setStatus("ended");
    if (timerRef.current) clearInterval(timerRef.current);
    roomRef.current?.disconnect();

    try {
      await supabase.functions.invoke("dm-call-token", {
        body: { action: "end", call_id: callId },
      });
    } catch { /* ignore */ }

    setTimeout(onClose, 1000);
  }, [callId, onClose]);

  const handleCancel = useCallback(async () => {
    setStatus("ended");
    roomRef.current?.disconnect();

    try {
      await supabase.functions.invoke("dm-call-token", {
        body: { action: "cancel", call_id: callId },
      });
    } catch { /* ignore */ }

    setTimeout(onClose, 500);
  }, [callId, onClose]);

  const toggleMute = async () => {
    if (!roomRef.current) return;
    const newMuted = !muted;
    await roomRef.current.localParticipant.setMicrophoneEnabled(!newMuted);
    setMuted(newMuted);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-xl flex flex-col items-center justify-center">
      {/* E2EE indicator */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-xs text-emerald-500">
        <Lock className="w-3 h-3" />
        <span>End-to-end encrypted</span>
      </div>

      {/* Close / back */}
      {status === "ended" && (
        <button onClick={onClose} className="absolute top-6 right-6 text-muted-foreground">
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
          <button className="w-14 h-14 rounded-full bg-muted flex items-center justify-center text-foreground">
            <Volume2 className="w-6 h-6" />
          </button>
        )}
      </div>
    </div>
  );
};

export default VoiceCallOverlay;
