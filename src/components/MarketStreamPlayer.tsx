import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Volume2, VolumeX, Maximize } from "lucide-react";

interface MarketStreamPlayerProps {
  marketId: string;
}

const MarketStreamPlayer = ({ marketId }: MarketStreamPlayerProps) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [LiveKitRoom, setLiveKitRoom] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;

    const loadAndConnect = async () => {
      try {
        // Dynamic import to avoid loading LiveKit for non-streaming markets
        const lk = await import("@livekit/components-react");
        const { Room } = await import("livekit-client");

        const { data, error: fnErr } = await supabase.functions.invoke("market-stream-token", {
          body: { market_id: marketId, action: "join" },
        });

        if (fnErr || data?.error) {
          setError(data?.error || "Failed to join stream");
          setLoading(false);
          return;
        }

        if (cancelled) return;

        const room = new Room();
        await room.connect(data.url, data.token);

        if (cancelled) {
          room.disconnect();
          return;
        }

        // Build a simple viewer component
        setLiveKitRoom({ lk, room, token: data.token, url: data.url });
        setLoading(false);
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "Failed to connect to stream");
          setLoading(false);
        }
      }
    };

    loadAndConnect();
    return () => { cancelled = true; };
  }, [marketId]);

  if (error) {
    return (
      <div className="w-full aspect-video rounded-xl bg-muted/50 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (loading || !LiveKitRoom) {
    return (
      <div className="w-full aspect-video rounded-xl bg-muted/50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Connecting to stream...</span>
      </div>
    );
  }

  const { lk, room, token, url } = LiveKitRoom;

  return (
    <lk.LiveKitRoom
      room={room}
      token={token}
      serverUrl={url}
      connectOptions={{ autoSubscribe: true }}
      className="w-full aspect-video rounded-xl overflow-hidden bg-black"
    >
      <lk.VideoConference />
    </lk.LiveKitRoom>
  );
};

export default MarketStreamPlayer;
