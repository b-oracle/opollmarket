import { ReactNode, useRef } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  PanInfo,
} from "framer-motion";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Max height of the panel, e.g. "80dvh" or "70dvh". Default: "85dvh" */
  maxHeight?: string;
  /** Extra classes on the inner glass panel */
  className?: string;
  /** Disable swipe-to-dismiss. Default: false */
  disableSwipe?: boolean;
}

const DISMISS_THRESHOLD = 80;

const BottomSheet = ({
  open,
  onClose,
  children,
  maxHeight = "85dvh",
  className = "",
  disableSwipe = false,
}: BottomSheetProps) => {
  const dragY = useMotionValue(0);
  const backdropOpacity = useTransform(dragY, [0, 300], [1, 0.2]);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > DISMISS_THRESHOLD || info.velocity.y > 500) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ opacity: backdropOpacity }}
            onClick={onClose}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[60]"
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[60] max-w-lg mx-auto"
            drag={disableSwipe ? false : "y"}
            dragConstraints={{ top: 0 }}
            dragElastic={0.3}
            onDragEnd={handleDragEnd}
            style={{ y: dragY }}
            onDragStart={(_, info) => {
              // Prevent drag if content is scrolled (only allow from top)
              if (contentRef.current && contentRef.current.scrollTop > 0 && info.offset.y < 0) {
                return;
              }
            }}
          >
            <div
              ref={contentRef}
              className={`glass-strong rounded-t-3xl overflow-y-auto ${className}`}
              style={{
                maxHeight,
                paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)",
              }}
            >
              {/* Drag handle indicator */}
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto mt-3 mb-1 shrink-0" />
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default BottomSheet;
