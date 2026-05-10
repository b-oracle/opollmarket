import { useSpaceReplay } from "@/hooks/useSpaceReplay";
import { Play, Pause, X, Maximize2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

const SpaceReplayMiniPlayer = () => {
  const { space, hostProfile, isExpanded, isPlaying, progress, currentTime, duration, togglePlay, expand, closeReplay } = useSpaceReplay();

  if (!space || isExpanded) return null;

  const hostName = hostProfile?.display_name || "Anonymous";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        className="fixed inset-x-0 z-[55] px-2"
        style={{ bottom: "calc(var(--content-bottom, 4rem) + 0.25rem)" }}
      >
        <div className="bg-card border border-border rounded-xl shadow-lg flex items-center gap-2 px-3 py-2">
          {/* Avatar */}
          <Avatar className="w-8 h-8 shrink-0 border border-primary/30">
            {hostProfile?.avatar_url ? <AvatarImage src={hostProfile.avatar_url} /> : null}
            <AvatarFallback className="text-[9px] bg-primary/20 text-primary">
              {(hostName || "?").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          {/* Title & progress */}
          <button onClick={expand} className="flex-1 min-w-0 text-left">
            <p className="text-xs font-semibold truncate">{space.title}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-[9px] text-muted-foreground tabular-nums shrink-0">
                {formatTime(currentTime)}/{formatTime(duration)}
              </span>
            </div>
          </button>

          {/* Controls */}
          <button
            onClick={togglePlay}
            className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
          </button>
          <button
            onClick={expand}
            className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 hover:bg-accent transition-colors"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
          <button
            onClick={closeReplay}
            className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 hover:bg-accent transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default SpaceReplayMiniPlayer;
