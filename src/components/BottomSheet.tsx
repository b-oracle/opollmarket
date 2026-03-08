import { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";

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
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[60]"
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed left-0 right-0 z-[60] max-w-lg mx-auto md:left-60 md:bottom-0"
            style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <div
              className={`glass-strong rounded-t-3xl overflow-y-auto md:pb-0 ${className}`}
              style={{
                maxHeight,
                paddingBottom: "0.75rem",
              }}
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
