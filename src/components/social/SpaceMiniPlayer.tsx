import { motion } from "framer-motion";
import { Mic, MicOff, PhoneOff, Maximize2, Users, Tv } from "lucide-react";
import { useActiveSpace } from "@/hooks/useActiveSpace";

interface SpaceMiniPlayerProps {
  title: string;
  participantCount: number;
  isMuted: boolean;
  hasStream?: boolean;
  onToggleMute: () => void;
  onLeave: () => void;
}

const SpaceMiniPlayer = ({ title, participantCount, isMuted, hasStream, onToggleMute, onLeave }: SpaceMiniPlayerProps) => {
  const { maximize } = useActiveSpace();

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className="fixed bottom-20 lg:bottom-4 left-3 right-3 lg:left-auto lg:right-4 lg:w-80 z-[70] rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-xl"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Live indicator + title */}
        <div className="flex-1 min-w-0 cursor-pointer" onClick={maximize}>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-destructive/20 text-destructive shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
              LIVE
            </span>
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <Users className="w-2.5 h-2.5" />{participantCount}
            </span>
            {hasStream && (
              <span className="text-[10px] text-primary flex items-center gap-0.5">
                <Tv className="w-2.5 h-2.5" />
              </span>
            )}
          </div>
          <p className="text-xs font-semibold truncate mt-0.5">{title}</p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={maximize}
            className="w-8 h-8 rounded-full bg-muted/80 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            title="Expand"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onToggleMute}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
              isMuted ? "bg-muted/80 text-muted-foreground" : "bg-primary/20 text-primary"
            }`}
          >
            {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onLeave}
            className="w-8 h-8 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
          >
            <PhoneOff className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default SpaceMiniPlayer;
