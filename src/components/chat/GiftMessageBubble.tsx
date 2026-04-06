import { useState, useCallback, useRef, useMemo } from "react";
import { motion, useAnimation, AnimatePresence } from "framer-motion";
import { Check, CheckCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useConfetti } from "@/hooks/useConfetti";

interface GiftMessageBubbleProps {
  content: string;
  giftAmount: number;
  isMine: boolean;
  createdAt: string;
  readAt: string | null;
  reactionBadges: React.ReactNode;
  reactionBar: React.ReactNode;
  bubbleRef: React.RefObject<HTMLDivElement>;
  pointerProps: Record<string, any>;
}

const PARTICLE_COUNT = 7;

// Emoji gift prices — if a 💵 message has a different amount, it's a direct transfer
const EMOJI_PRICES: Record<string, number> = {
  "💵": 0.05,
};

const isDirectTransfer = (content: string, amount: number) =>
  content === "💵" && amount !== 0.05;

const GiftMessageBubble = ({
  content,
  giftAmount,
  isMine,
  createdAt,
  readAt,
  reactionBadges,
  reactionBar,
  bubbleRef,
  pointerProps,
}: GiftMessageBubbleProps) => {
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; r: number }[]>([]);
  const [shimmer, setShimmer] = useState(false);
  const cooldownRef = useRef(false);
  const emojiControls = useAnimation();
  const { fireSubtleConfetti } = useConfetti();

  const particleOffsets = useMemo(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, i) => {
        const angle = (Math.PI * 2 * i) / PARTICLE_COUNT + (Math.random() - 0.5) * 0.5;
        const dist = 40 + Math.random() * 30;
        return {
          id: i,
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist,
          r: Math.random() * 180 - 90,
        };
      }),
    []
  );

  const handleGiftTap = useCallback(() => {
    if (cooldownRef.current) return;
    cooldownRef.current = true;
    setTimeout(() => (cooldownRef.current = false), 3000);

    // Emoji bounce
    emojiControls.start({
      scale: [1, 1.6, 0.9, 1.15, 1],
      transition: { duration: 0.6, ease: "easeOut" },
    });

    // Shimmer on amount
    setShimmer(true);
    setTimeout(() => setShimmer(false), 1200);

    // Particles
    setParticles(particleOffsets);
    setTimeout(() => setParticles([]), 900);

    // Confetti
    fireSubtleConfetti();
  }, [emojiControls, fireSubtleConfetti, particleOffsets]);

  return (
    <div className="relative" ref={bubbleRef}>
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 18 }}
        className={`w-fit rounded-2xl select-none touch-manipulation cursor-pointer ${
          isMine ? "bg-primary/15 rounded-br-md" : "bg-accent/20 rounded-bl-md"
        }`}
        onClick={handleGiftTap}
        {...pointerProps}
      >
        <div className="px-4 py-3 text-center relative overflow-visible">
          {/* Emoji with bounce animation */}
          <motion.p className="text-2xl mb-1" animate={emojiControls}>
            {content}
          </motion.p>

          {/* Floating emoji particles */}
          <AnimatePresence>
            {particles.map((p) => (
              <motion.span
                key={p.id}
                initial={{ opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 }}
                animate={{ opacity: 0, x: p.x, y: p.y, scale: 0.4, rotate: p.r }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="absolute left-1/2 top-4 text-lg pointer-events-none -translate-x-1/2"
              >
                {content}
              </motion.span>
            ))}
          </AnimatePresence>

          {/* Gift amount with shimmer */}
          <motion.p
            className={`text-lg font-bold text-primary transition-all duration-300 ${
              shimmer ? "gift-shimmer" : ""
            }`}
            initial={{ scale: 0.7 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 12, delay: 0.1 }}
          >
            ${giftAmount}
          </motion.p>

          <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center justify-center gap-1">
            {isMine ? "Gift sent" : "Gift received"} ·{" "}
            {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
            {isMine &&
              (readAt ? (
                <CheckCheck className="w-3 h-3 text-blue-500" />
              ) : (
                <Check className="w-3 h-3 text-muted-foreground" />
              ))}
          </p>
          {reactionBadges}
        </div>
      </motion.div>
      {reactionBar}
    </div>
  );
};

export default GiftMessageBubble;
