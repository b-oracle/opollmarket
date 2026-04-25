import { useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { hapticMedium } from "@/lib/haptics";

interface HoldToConfirmButtonProps {
  onConfirm: () => void;
  label?: string;
  duration?: number;
}

const HoldToConfirmButton = ({ onConfirm, label = "Hold to Confirm", duration = 1500 }: HoldToConfirmButtonProps) => {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const confirmedRef = useRef(false);

  const TICK = 30;

  const start = useCallback(() => {
    if (confirmedRef.current) return;
    setHolding(true);
    setProgress(0);
    let elapsed = 0;
    intervalRef.current = setInterval(() => {
      elapsed += TICK;
      const p = Math.min(elapsed / duration, 1);
      setProgress(p);
      if (p >= 1) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        confirmedRef.current = true;
        setHolding(false);
        void hapticMedium();
        onConfirm();
      }
    }, TICK);
  }, [duration, onConfirm]);

  const cancel = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setHolding(false);
    setProgress(0);
  }, []);

  return (
    <button
      onMouseDown={start}
      onMouseUp={cancel}
      onMouseLeave={cancel}
      onTouchStart={start}
      onTouchEnd={cancel}
      onTouchCancel={cancel}
      className="relative w-full overflow-hidden rounded-xl py-4 font-bold text-base text-primary-foreground select-none touch-none"
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      {/* Background */}
      <div className="absolute inset-0 bg-primary/40" />
      {/* Fill */}
      <motion.div
        className="absolute inset-0 bg-primary origin-left"
        animate={{ scaleX: progress }}
        transition={{ duration: 0, ease: "linear" }}
        style={{ transformOrigin: "left" }}
      />
      <span className="relative z-10 flex items-center justify-center gap-2">
        {holding ? `${Math.round(progress * 100)}%` : label}
      </span>
    </button>
  );
};

export default HoldToConfirmButton;
