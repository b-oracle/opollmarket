import { useState, useRef, useCallback, useEffect } from "react";
import { motion, useMotionValue, useTransform, PanInfo, animate } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";

interface SlideToConfirmProps {
  onConfirm: () => void;
  label?: string;
  className?: string;
  color?: "yes" | "no";
}

const SlideToConfirm = ({ onConfirm, label = "Slide to Confirm", className = "", color = "yes" }: SlideToConfirmProps) => {
  const [confirmed, setConfirmed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hapticFired = useRef(false);
  const x = useMotionValue(0);

  const thumbSize = 52;

  const getMaxX = () => {
    if (!containerRef.current) return 200;
    return containerRef.current.offsetWidth - thumbSize - 8; // 8 for padding
  };

  // Fire haptic when crossing the 85% threshold during drag
  useEffect(() => {
    const unsubscribe = x.on("change", (latest) => {
      const maxX = getMaxX();
      if (latest >= maxX * 0.85 && !hapticFired.current && !confirmed) {
        navigator.vibrate?.(15);
        hapticFired.current = true;
      } else if (latest < maxX * 0.85) {
        hapticFired.current = false;
      }
    });
    return unsubscribe;
  }, [x, confirmed]);

  const bgOpacity = useTransform(x, [0, 150], [0.15, 0.4]);
  const textOpacity = useTransform(x, [0, 100], [1, 0]);

  const bgColor = color === "yes" ? "hsl(var(--neon-yes))" : "hsl(var(--neon-no))";
  const bgClass = color === "yes" ? "bg-[hsl(var(--neon-yes))]" : "bg-[hsl(var(--neon-no))]";

  const handleDragEnd = useCallback((_: unknown, info: PanInfo) => {
    const maxX = getMaxX();
    if (info.point.x === 0 && info.offset.x === 0) return;
    
    const currentX = x.get();
    if (currentX >= maxX * 0.85) {
      setConfirmed(true);
      navigator.vibrate?.(30);
      animate(x, maxX, { type: "spring", stiffness: 300, damping: 30 });
      setTimeout(() => onConfirm(), 300);
    } else {
      animate(x, 0, { type: "spring", stiffness: 400, damping: 30 });
    }
  }, [onConfirm, x]);

  return (
    <div
      ref={containerRef}
      className={`relative h-14 rounded-2xl overflow-hidden border border-border ${className}`}
      style={{ background: `${bgColor}10` }}
    >
      {/* Filled track */}
      <motion.div
        className="absolute inset-y-0 left-0 rounded-2xl"
        style={{
          width: useTransform(x, (v) => `${v + thumbSize + 8}px`),
          backgroundColor: bgColor,
          opacity: bgOpacity,
        }}
      />

      {/* Label */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{ opacity: textOpacity }}
      >
        <span className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
          {label}
          <ArrowRight className="w-4 h-4" />
        </span>
      </motion.div>

      {/* Thumb */}
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: getMaxX() }}
        dragElastic={0}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        style={{ x }}
        className={`absolute top-1 left-1 w-12 h-12 rounded-xl flex items-center justify-center cursor-grab active:cursor-grabbing shadow-lg ${
          confirmed ? "bg-primary" : ""
        }`}
        whileTap={{ scale: 0.95 }}
      >
        {confirmed ? (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", damping: 10 }}
          >
            <Check className="w-5 h-5 text-primary-foreground" />
          </motion.div>
        ) : (
          <div
            className="w-full h-full rounded-xl flex items-center justify-center"
            style={{ backgroundColor: bgColor }}
          >
            <ArrowRight className="w-5 h-5 text-background" />
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default SlideToConfirm;
