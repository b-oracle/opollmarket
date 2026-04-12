import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Volume2, VolumeX } from "lucide-react";
import type { Room, RemoteTrackPublication, RemoteParticipant } from "livekit-client";

interface MarketStreamPlayerProps {
  marketId: string;
}

const MarketStreamPlayer = ({ marketId }: MarketStreamPlayerProps) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const roomRef = useRef<Room | null>(null);

  useEffect(() => {
    let cancelled = false;

    const connect = async () => {
      try {
        const { data, error: fnErr } = await supabase.functions.invoke("market-stream-token", {
          body: { market_id: marketId, action: "join" },
        });

        if (fnErr || data?.error) {
          setError(data?.error || "Failed to join stream");
          setLoading(false);
          return;
        }

        if (cancelled) return;

        const { Room, RoomEvent, Track } = await import("livekit-client");
        const room = new Room();
        roomRef.current = room;

        const attachTrack = (publication: RemoteTrackPublication) => {
          if (!publication.track) return;
          const track = publication.track;
          if (track.kind === Track.Kind.Video && videoRef.current) {
            track.attach(videoRef.current);
          } else if (track.kind === Track.Kind.Audio && audioRef.current) {
            track.attach(audioRef.current);
          }
        };

        room.on(RoomEvent.TrackSubscribed, (_track, pub) => attachTrack(pub));
        room.on(RoomEvent.TrackUnsubscribed, (track) => {
          track.detach();
        });

        await room.connect(data.url, data.token);

        // Attach any existing tracks
        for (const p of room.remoteParticipants.values()) {
          for (const pub of p.trackPublications.values()) {
            if (pub.isSubscribed) attachTrack(pub as RemoteTrackPublication);
          }
        }

        if (!cancelled) setLoading(false);
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "Failed to connect");
          setLoading(false);
        }
      }
    };

    connect();

    return () => {
      cancelled = true;
      roomRef.current?.disconnect();
    };
  }, [marketId]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted;
  }, [muted]);

  if (error) {
    return (
      <div className="w-full aspect-video rounded-xl bg-muted/50 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="w-full aspect-video rounded-xl bg-muted/50 flex items-center justify-center gap-2">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Connecting to stream...</span>
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black">
      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-contain" />
      <audio ref={audioRef} autoPlay />
      <button
        onClick={() => setMuted(!muted)}
        className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors z-10"
      >
        {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
      </button>
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-2 py-1 rounded-full bg-destructive/90 text-destructive-foreground">
        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
        <span className="text-[10px] font-bold uppercase tracking-wider">LIVE</span>
      </div>
    </div>
  );
};

export default MarketStreamPlayer;
