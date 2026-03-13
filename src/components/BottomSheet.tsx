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
  const { collapsed } = useSidebarState();
  const isMobile = useIsMobile();
  const sidebarLeft = isMobile ? 0 : collapsed ? '4.5rem' : '15rem';
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
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[60]"
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed right-0 z-[60] max-w-lg mx-auto"
            style={{ left: sidebarLeft, bottom: undefined }}
            style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <div
              className={`glass-strong rounded-t-3xl overflow-y-auto md:pb-0 ${className}`}
              style={{
                maxHeight,
                paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))",
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
