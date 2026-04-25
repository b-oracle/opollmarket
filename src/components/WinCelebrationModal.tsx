import { useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, X, Star } from "lucide-react";
import { useConfetti } from "@/hooks/useConfetti";
import { useAuth } from "@/hooks/useAuth";
import ProfitShareCard from "@/components/ProfitShareCard";
import ShareModal from "@/components/ShareModal";
import { hapticSuccess } from "@/lib/haptics";

interface WinCelebrationModalProps {
  open: boolean;
  onClose: () => void;
  market: string;
  side: string;
  payout: number;
  profit: number;
}

const WinCelebrationModal = ({ open, onClose, market, side, payout, profit }: WinCelebrationModalProps) => {
  const { fireWinConfetti } = useConfetti();
  const { user } = useAuth();
  const [shareOpen, setShareOpen] = useState(false);
  const profitCardRef = useRef<HTMLDivElement>(null);

  // Fire celebratory haptic when the modal opens
  useEffect(() => {
    if (open) void hapticSuccess();
  }, [open]);

  const displayName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "Trader";
  const referralCode = user?.user_metadata?.display_name || user?.id || "";
  const referralLink = `https://opoll.org${referralCode ? `?ref=${referralCode}` : ""}`;

  const handleShare = () => {
    setShareOpen(true);
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center px-4"
          >
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
            <motion.div
              initial={{ scale: 0.7, opacity: 0, y: 40 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
              onAnimationComplete={() => fireWinConfetti()}
              className="relative glass-strong rounded-2xl p-6 w-full max-w-sm text-center z-10"
            >
              <button onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>

              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 400 }}
                className="w-20 h-20 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center mx-auto mb-4"
              >
                <Trophy className="w-10 h-10 text-primary" />
              </motion.div>

              <motion.h3
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-xl font-bold mb-1"
              >
                You Won! 🎉
              </motion.h3>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-sm text-muted-foreground mb-5 line-clamp-2"
              >
                {market}
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="glass rounded-xl p-4 mb-5 space-y-3"
              >
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Your Position</span>
                  <span className={`font-bold ${side === "YES" ? "text-primary" : side === "NO" ? "text-destructive" : "text-primary"}`}>{side}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Payout</span>
                  <span className="font-bold">${payout.toFixed(2)}</span>
                </div>
                <div className="border-t border-border pt-3 flex justify-between">
                  <span className="text-sm text-muted-foreground">Profit</span>
                  <span className="text-lg font-bold text-primary">+${profit.toFixed(2)}</span>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="flex gap-2"
              >
                <button
                  onClick={onClose}
                  className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm transition-all active:scale-95"
                >
                  Claim Winnings
                </button>
                <button
                  onClick={handleShare}
                  className="py-3 px-4 rounded-xl glass text-sm font-medium text-muted-foreground hover:text-foreground transition-all active:scale-95"
                >
                  Share
                </button>
              </motion.div>

              {/* Floating stars */}
              {[...Array(5)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{
                    opacity: [0, 1, 0],
                    scale: [0, 1, 0.5],
                    y: [0, -60 - i * 15],
                    x: [(i - 2) * 30, (i - 2) * 50],
                  }}
                  transition={{ delay: 0.3 + i * 0.1, duration: 1.5 }}
                  className="absolute top-20 left-1/2 pointer-events-none"
                >
                  <Star className="w-4 h-4 text-primary fill-primary" />
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Off-screen profit share card for screenshot capture */}
      {open && (
        <ProfitShareCard
          ref={profitCardRef}
          market={market}
          side={side}
          profit={profit}
          payout={payout}
          displayName={displayName}
          referralCode={referralCode}
        />
      )}

      {/* Share modal */}
      <ShareModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        title={`I just won +$${profit.toFixed(2)} on oPoll! 🔥`}
        description={market}
        marketUrl={referralLink}
        captureRef={profitCardRef}
      />
    </>
  );
};

export default WinCelebrationModal;
