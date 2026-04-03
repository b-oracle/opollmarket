import { useEffect, useRef } from "react";
import { Track } from "livekit-client";
import { motion } from "framer-motion";
import { Mic, MicOff, Monitor } from "lucide-react";
import NftBadge, { VerificationLevel } from "@/components/NftBadge";
import { optimizedImageUrl } from "@/lib/optimizedImage";

interface VideoParticipant {
  identity: string;
  name: string;
  isMuted: boolean;
  isScreenShare: boolean;
  track: any; // LiveKit Track
  verificationLevel?: VerificationLevel;
  avatarUrl?: string | null;
  isHost?: boolean;
  isCoHost?: boolean;
}

interface SpaceVideoGridProps {
  videoParticipants: VideoParticipant[];
  hostId: string;
}

const VideoTile = ({ participant }: { participant: VideoParticipant }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !participant.track) return;
    participant.track.attach(el);
    return () => {
      participant.track.detach(el);
    };
  }, [participant.track]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="relative rounded-xl overflow-hidden bg-muted/30 border border-border aspect-video"
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
        style={participant.isScreenShare ? {} : { transform: "scaleX(-1)" }}
      />
      {/* Overlay info */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-2 flex items-center gap-1.5">
        <span className="text-[10px] font-semibold text-white truncate flex items-center gap-1">
          {participant.isScreenShare && <Monitor className="w-3 h-3" />}
          {participant.name}
          {participant.isHost && (
            <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-primary/30 text-primary-foreground">Host</span>
          )}
          {participant.isCoHost && (
            <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-accent/30 text-accent-foreground">Co-host</span>
          )}
        </span>
        {participant.verificationLevel && participant.verificationLevel !== "none" && (
          <NftBadge level={participant.verificationLevel} size={12} />
        )}
        <span className="ml-auto">
          {participant.isMuted ? (
            <MicOff className="w-3 h-3 text-red-400" />
          ) : (
            <Mic className="w-3 h-3 text-green-400" />
          )}
        </span>
      </div>
    </motion.div>
  );
};

const SpaceVideoGrid = ({ videoParticipants, hostId }: SpaceVideoGridProps) => {
  if (videoParticipants.length === 0) return null;

  // Screen shares get full width, cameras are in a grid
  const screenShares = videoParticipants.filter((p) => p.isScreenShare);
  const cameras = videoParticipants.filter((p) => !p.isScreenShare);

  const gridCols = cameras.length <= 1 ? "grid-cols-1" : cameras.length <= 4 ? "grid-cols-2" : "grid-cols-3";

  return (
    <div className="px-3 py-2 space-y-2">
      {/* Screen shares — full width */}
      {screenShares.map((p) => (
        <div key={`screen-${p.identity}`} className="w-full">
          <VideoTile participant={p} />
        </div>
      ))}
      {/* Camera grid */}
      {cameras.length > 0 && (
        <div className={`grid ${gridCols} gap-2`}>
          {cameras.map((p) => (
            <VideoTile key={`cam-${p.identity}`} participant={p} />
          ))}
        </div>
      )}
    </div>
  );
};

export default SpaceVideoGrid;
