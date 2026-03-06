import { motion, AnimatePresence } from "framer-motion";
import { X, Flame, Crown, Zap } from "lucide-react";
import { useConfetti } from "@/hooks/useConfetti";
import { useEffect } from "react";

interface StreakMilestoneModalProps {
  open: boolean;
  onClose: () => void;
  streak: number;
  multiplier: number;
}

const milestoneConfig: Record<number, { emoji: string; title: string; subtitle: string; color: string }> = {
  3: {
    emoji: "🔥",
    title: "On Fire!",
    subtitle: "3 wins in a row — 1.10x bonus unlocked!",
    color: "text-amber-500",
  },
  5: {
    emoji: "👑",
    title: "Unstoppable!",
    subtitle: "5 win streak — MAX 1.25x bonus!",
    color: "text-amber-400",
  },
};

const StreakMilestoneModal = ({ open, onClose, streak, multiplier }: StreakMilestoneModalProps) => {
  const { fireWinConfetti } = useConfetti();
  const config = milestoneConfig[streak] || milestoneConfig[3];
  const isMega = streak >= 5;

  useEffect(() => {
    if (open) {
      const timer = setTimeout(onClose, 5000);
      return () => clearTimeout(timer);
    }
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[110] flex items-center justify-center px-4"
        >
          <div className="absolute inset-0 bg-background/70 backdrop-blur-md" onClick={onClose} />

          <motion.div
            initial={{ scale: 0.3, opacity: 0, rotateZ: -8 }}
            animate={{ scale: 1, opacity: 1, rotateZ: 0 }}
            exit={{ scale: 0.5, opacity: 0, y: 60 }}
            transition={{ type: "spring", damping: 14, stiffness: 250 }}
            onAnimationComplete={() => fireWinConfetti()}
            className="relative rounded-2xl p-6 w-full max-w-xs text-center z-10 overflow-hidden border border-amber-500/30 bg-card"
          >
            {/* Animated glow background */}
            <motion.div
              animate={{
                scale: [1, 1.3, 1],
                opacity: [0.15, 0.3, 0.15],
              }}
              transition={{ duration: 2, repeat: Infinity }}
              className={`absolute inset-0 rounded-2xl ${
                isMega
                  ? "bg-gradient-to-br from-amber-500/20 via-primary/10 to-amber-600/20"
                  : "bg-gradient-to-br from-amber-500/15 via-transparent to-amber-400/15"
              }`}
            />

            <button onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground z-10">
              <X className="w-4 h-4" />
            </button>

            {/* Fire particles */}
            {[...Array(isMega ? 12 : 8)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 0, x: 0, scale: 0 }}
                animate={{
                  opacity: [0, 1, 0],
                  y: [0, -80 - Math.random() * 60],
                  x: [(Math.random() - 0.5) * 120],
                  scale: [0, 0.8 + Math.random() * 0.4, 0],
                }}
                transition={{
                  delay: 0.2 + i * 0.08,
                  duration: 1.2 + Math.random() * 0.6,
                  repeat: 1,
                  repeatDelay: 0.5,
                }}
                className="absolute bottom-1/3 left-1/2 pointer-events-none z-0"
              >
                {i % 3 === 0 ? (
                  <Flame className="w-5 h-5 text-amber-500 fill-amber-500/50" />
                ) : i % 3 === 1 ? (
                  <Zap className="w-4 h-4 text-amber-400 fill-amber-400/50" />
                ) : (
                  <span className="text-lg">{isMega ? "👑" : "🔥"}</span>
                )}
              </motion.div>
            ))}

            {/* Main icon */}
            <motion.div
              initial={{ scale: 0, rotateZ: -20 }}
              animate={{ scale: 1, rotateZ: 0 }}
              transition={{ delay: 0.15, type: "spring", stiffness: 400, damping: 12 }}
              className="relative z-10 w-20 h-20 mx-auto mb-4"
            >
              <motion.div
                animate={{ scale: [1, 1.08, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="w-20 h-20 rounded-full bg-amber-500/20 border-2 border-amber-500/50 flex items-center justify-center"
              >
                {isMega ? (
                  <Crown className="w-10 h-10 text-amber-400" />
                ) : (
                  <Flame className="w-10 h-10 text-amber-500" />
                )}
              </motion.div>
            </motion.div>

            {/* Streak count */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.25, type: "spring", stiffness: 500 }}
              className="relative z-10 text-5xl font-black mb-1"
            >
              <span className={config.color}>{streak}</span>
            </motion.div>

            <motion.h3
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className={`relative z-10 text-xl font-bold mb-1 ${config.color}`}
            >
              {config.emoji} {config.title}
            </motion.h3>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.45 }}
              className="relative z-10 text-sm text-muted-foreground mb-5"
            >
              {config.subtitle}
            </motion.p>

            {/* Multiplier badge */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55 }}
              className="relative z-10 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/15 border border-amber-500/30 mb-4"
            >
              <Zap className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-bold text-amber-500">{multiplier}x Payout Bonus Active</span>
            </motion.div>

            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.65 }}
              onClick={onClose}
              className="relative z-10 w-full py-3 rounded-xl bg-amber-500 text-background font-semibold text-sm transition-all active:scale-95"
            >
              Keep Winning! 🚀
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default StreakMilestoneModal;
