import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Video, VideoOff, Mic, MicOff, PhoneOff, Radio, Link2, Loader2, X, SwitchCamera } from "lucide-react";
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
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Attach local video track whenever the room or camera state changes
  useEffect(() => {
    if (!liveRoom || !videoRef.current) return;
    const attachLocal = async () => {
      try {
        const { Track } = await import("livekit-client");
        const pub = liveRoom.localParticipant.getTrackPublication(Track.Source.Camera);
        if (pub?.track && videoRef.current) {
          pub.track.attach(videoRef.current);
        }
      } catch { /* ignore */ }
    };
    attachLocal();
  }, [liveRoom, cameraOn]);

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

      const { Room, RoomEvent } = await import("livekit-client");
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });

      // Wait for full engine connection before publishing
      await room.connect(data.url, data.token);

      // Ensure engine is connected; if not yet, wait for the event
      if (room.state !== "connected") {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Room connection timed out")), 15000);
          room.once(RoomEvent.Connected, () => { clearTimeout(timeout); resolve(); });
        });
      }

      await room.localParticipant.setCameraEnabled(true);
      await room.localParticipant.setMicrophoneEnabled(true);

      setLiveRoom(room);
      setCameraOn(true);
      setMicOn(true);
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

  const toggleCamera = useCallback(async () => {
    if (!liveRoom) return;
    const next = !cameraOn;
    await liveRoom.localParticipant.setCameraEnabled(next);
    setCameraOn(next);
  }, [liveRoom, cameraOn]);

  const toggleMic = useCallback(async () => {
    if (!liveRoom) return;
    const next = !micOn;
    await liveRoom.localParticipant.setMicrophoneEnabled(next);
    setMicOn(next);
  }, [liveRoom, micOn]);

  const switchCamera = useCallback(async () => {
    if (!liveRoom) return;
    try {
      const { Track, facingModeFromLocalTrack } = await import("livekit-client");
      const pub = liveRoom.localParticipant.getTrackPublication(Track.Source.Camera);
      if (!pub?.track) return;
      const facing = facingModeFromLocalTrack(pub.track);
      const newFacing = facing?.facingMode === "environment" ? "user" : "environment";
      await pub.track.restartTrack({ facingMode: newFacing });
      if (videoRef.current) pub.track.attach(videoRef.current);
    } catch {
      // fallback: just restart with toggled facing mode
      try {
        await liveRoom.localParticipant.setCameraEnabled(false);
        await liveRoom.localParticipant.setCameraEnabled(true);
      } catch { /* ignore */ }
    }
  }, [liveRoom]);

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

  // If actively broadcasting, show local preview + broadcast controls
  if (liveRoom) {
    return (
      <div className="glass rounded-xl p-4 mb-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
          <span className="text-sm font-bold text-destructive">LIVE — You are broadcasting</span>
        </div>

        {/* Local video preview */}
        <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
          {!cameraOn && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/80">
              <VideoOff className="w-8 h-8 text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Camera off</span>
            </div>
          )}
          <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-2 py-1 rounded-full bg-destructive/90 text-destructive-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-wider">LIVE</span>
          </div>
        </div>

        {/* Control buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleCamera}
            className="gap-1.5"
          >
            {cameraOn ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
            {cameraOn ? "Cam" : "Cam Off"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleMic}
            className="gap-1.5"
          >
            {micOn ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
            {micOn ? "Mic" : "Muted"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={switchCamera}
            className="gap-1.5"
          >
            <SwitchCamera className="w-3.5 h-3.5" />
            Flip
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleStopStream}
            disabled={stopping}
            className="gap-1.5 ml-auto"
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
