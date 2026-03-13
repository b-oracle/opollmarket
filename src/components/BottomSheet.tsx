import { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSidebarState } from "@/hooks/useSidebarState";
import { useIsMobile } from "@/hooks/use-mobile";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Max height of the panel, e.g. "80dvh" or "70dvh". Default: "85dvh" */
  maxHeight?: string;
  /** Extra classes on the inner glass panel */
  className?: string;
}

const BottomSheet = ({ open, onClose, children, maxHeight = "85dvh", className = "" }: BottomSheetProps) => {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[80]"
          />

          {/* Panel — centered on all viewports */}
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className={`glass-strong rounded-2xl overflow-y-auto w-full max-w-lg pointer-events-auto ${className}`}
              style={{
                maxHeight,
                WebkitOverflowScrolling: "touch",
                touchAction: "pan-y",
                overscrollBehavior: "contain",
                willChange: "scroll-position",
              } as React.CSSProperties}
            >
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default BottomSheet;
