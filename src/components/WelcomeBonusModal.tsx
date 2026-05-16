import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Gift, Sparkles, X, ArrowRight } from "lucide-react";
import { useConfetti } from "@/hooks/useConfetti";
import { hapticSuccess } from "@/lib/haptics";

interface WelcomeBonusModalProps {
  open: boolean;
  amount?: number;
  onClose: () => void;
}

const WelcomeBonusModal = ({ open, amount = 20, onClose }: WelcomeBonusModalProps) => {
  const { fireWinConfetti } = useConfetti();
  const navigate = useNavigate();

  useEffect(() => {
    if (open) void hapticSuccess();
  }, [open]);

  const goToBalance = () => {
    onClose();
    navigate("/commissions");
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] flex items-center justify-center px-4"
        >
          <div className="absolute inset-0 bg-background/80 backdrop-blur-md" onClick={onClose} />

          <motion.button
            type="button"
            onClick={goToBalance}
            initial={{ scale: 0.7, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 18, stiffness: 280 }}
            onAnimationComplete={() => fireWinConfetti()}
            className="relative w-full max-w-sm text-left z-10 rounded-3xl overflow-hidden border border-primary/30 bg-card p-6 active:scale-[0.99] transition-transform"
          >
            {/* Animated glow */}
            <motion.div
              animate={{ scale: [1, 1.25, 1], opacity: [0.2, 0.4, 0.2] }}
              transition={{ duration: 2.4, repeat: Infinity }}
              className="absolute inset-0 bg-gradient-to-br from-primary/25 via-transparent to-amber-400/25 pointer-events-none"
            />

            <div
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onClose();
                }
              }}
              className="absolute top-3 right-3 z-20 p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </div>

            {/* Floating sparkles */}
            {[...Array(8)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0, y: 0, x: 0 }}
                animate={{
                  opacity: [0, 1, 0],
                  scale: [0, 1, 0.4],
                  y: [0, -80 - Math.random() * 60],
                  x: [(Math.random() - 0.5) * 160],
                }}
                transition={{
                  delay: 0.2 + i * 0.08,
                  duration: 1.4 + Math.random() * 0.6,
                  repeat: 1,
                  repeatDelay: 0.8,
                }}
                className="absolute top-1/3 left-1/2 pointer-events-none z-0"
              >
                <Sparkles className="w-4 h-4 text-amber-400 fill-amber-400/40" />
              </motion.div>
            ))}

            {/* Gift icon */}
            <motion.div
              initial={{ scale: 0, rotateZ: -15 }}
              animate={{ scale: 1, rotateZ: 0 }}
              transition={{ delay: 0.15, type: "spring", stiffness: 400, damping: 12 }}
              className="relative z-10 mx-auto mb-4 w-20 h-20"
            >
              <motion.div
                animate={{ scale: [1, 1.08, 1] }}
                transition={{ duration: 1.8, repeat: Infinity }}
                className="w-20 h-20 rounded-full bg-primary/20 border-2 border-primary/60 flex items-center justify-center mx-auto shadow-lg shadow-primary/30"
              >
                <Gift className="w-10 h-10 text-primary" />
              </motion.div>
            </motion.div>

            {/* Title */}
            <motion.h3
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="relative z-10 text-center text-xl font-bold mb-1"
            >
              Congratulations! 🎉
            </motion.h3>

            {/* Amount */}
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.4, type: "spring", stiffness: 400 }}
              className="relative z-10 text-center my-3"
            >
              <span className="text-5xl font-black bg-gradient-to-br from-primary via-primary to-amber-400 bg-clip-text text-transparent">
                ${amount}
              </span>
              <div className="text-xs uppercase tracking-widest text-muted-foreground mt-1 font-semibold">
                Welcome Bonus
              </div>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="relative z-10 text-center text-sm text-muted-foreground mb-5 px-2"
            >
              Added to your bonus balance — tap to view the breakdown.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="relative z-10 w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2"
            >
              View Balance Breakdown
              <ArrowRight className="w-4 h-4" />
            </motion.div>
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default WelcomeBonusModal;
