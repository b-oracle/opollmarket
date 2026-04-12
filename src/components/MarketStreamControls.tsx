import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Video, VideoOff, Mic, MicOff, PhoneOff, Radio, Link2, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface MarketStreamControlsProps {
  marketId: string;
  streamUrl?: string;
  isStreaming?: boolean;
  onStreamStateChange: () => void;
}

const MarketStreamControls = ({ marketId, streamUrl, isStreaming, onStreamStateChange }: MarketStreamControlsProps) => {
  const [goingLive, setGoingLive] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlValue, setUrlValue] = useState(streamUrl || "");
  const [savingUrl, setSavingUrl] = useState(false);
  const [liveRoom, setLiveRoom] = useState<any>(null);

  const handleGoLive = useCallback(async () => {
    setGoingLive(true);
    try {
      const { data, error } = await supabase.functions.invoke("market-stream-token", {
        body: { market_id: marketId, action: "start_stream" },
      });

      if (error || data?.error) {
        toast.error(data?.error || "Failed to start stream");
        return;
      }

      // Connect to LiveKit
      const { Room } = await import("livekit-client");
      const room = new Room();
      await room.connect(data.url, data.token);

      // Enable camera and mic
      await room.localParticipant.setCameraEnabled(true);
      await room.localParticipant.setMicrophoneEnabled(true);

      setLiveRoom(room);
      onStreamStateChange();
      toast.success("You're live! 🔴");
    } catch (err: any) {
      toast.error(err.message || "Failed to go live");
    } finally {
      setGoingLive(false);
    }
  }, [marketId, onStreamStateChange]);

  const handleStopStream = useCallback(async () => {
    setStopping(true);
    try {
      if (liveRoom) {
        liveRoom.disconnect();
        setLiveRoom(null);
      }

      const { data, error } = await supabase.functions.invoke("market-stream-token", {
        body: { market_id: marketId, action: "stop_stream" },
      });

      if (error || data?.error) {
        toast.error(data?.error || "Failed to stop stream");
        return;
      }

      onStreamStateChange();
      toast.success("Stream ended");
    } catch (err: any) {
      toast.error(err.message || "Failed to stop stream");
    } finally {
      setStopping(false);
    }
  }, [marketId, liveRoom, onStreamStateChange]);

  const handleSaveUrl = useCallback(async () => {
    setSavingUrl(true);
    try {
      const { data, error } = await supabase.functions.invoke("market-stream-token", {
        body: { market_id: marketId, action: "set_stream_url", stream_url: urlValue.trim() || null },
      });

      if (error || data?.error) {
        toast.error(data?.error || "Failed to save stream URL");
        return;
      }

      onStreamStateChange();
      setShowUrlInput(false);
      toast.success(urlValue.trim() ? "Stream URL saved" : "Stream URL removed");
    } catch (err: any) {
      toast.error(err.message || "Failed to save stream URL");
    } finally {
      setSavingUrl(false);
    }
  }, [marketId, urlValue, onStreamStateChange]);

  // If actively broadcasting, show broadcast controls
  if (liveRoom) {
    return (
      <div className="glass rounded-xl p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
          <span className="text-sm font-bold text-destructive">LIVE — You are broadcasting</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={handleStopStream}
            disabled={stopping}
            className="gap-1.5"
          >
            {stopping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PhoneOff className="w-3.5 h-3.5" />}
            End Stream
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="glass rounded-xl p-4 mb-4">
      <p className="text-xs font-semibold text-muted-foreground mb-3">CREATOR STREAM CONTROLS</p>
      <div className="flex flex-wrap items-center gap-2">
        {!isStreaming && (
          <Button
            size="sm"
            onClick={handleGoLive}
            disabled={goingLive}
            className="gap-1.5 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          >
            {goingLive ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Radio className="w-3.5 h-3.5" />}
            Go Live
          </Button>
        )}

        {isStreaming && (
          <Button
            variant="destructive"
            size="sm"
            onClick={handleStopStream}
            disabled={stopping}
            className="gap-1.5"
          >
            {stopping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PhoneOff className="w-3.5 h-3.5" />}
            End Stream
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowUrlInput(!showUrlInput)}
          className="gap-1.5"
        >
          <Link2 className="w-3.5 h-3.5" />
          {streamUrl ? "Edit Stream URL" : "Share Stream"}
        </Button>
      </div>

      {showUrlInput && (
        <div className="mt-3 flex items-center gap-2">
          <Input
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            placeholder="Paste YouTube Live or StreamYard URL..."
            className="text-xs h-8"
          />
          <Button size="sm" onClick={handleSaveUrl} disabled={savingUrl} className="h-8 shrink-0">
            {savingUrl ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
          </Button>
          {streamUrl && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setUrlValue(""); }}
              className="h-8 shrink-0 text-destructive"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default MarketStreamControls;
