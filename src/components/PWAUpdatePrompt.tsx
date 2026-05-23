import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, X } from "lucide-react";
import { usePWAUpdate } from "@/hooks/usePWAUpdate";

const PWAUpdatePrompt = () => {
  const { showUpdate, update, dismiss } = usePWAUpdate();

  return (
    <AnimatePresence>
      {showUpdate && (
        <motion.div
          initial={{ opacity: 0, y: 80 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 80 }}
          className="fixed bottom-20 md:bottom-6 left-0 right-0 z-[200] flex justify-center px-4"
        >
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-4 shadow-xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <RefreshCw className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Update Available</p>
              <p className="text-xs text-muted-foreground">A new version of OPollmarket is ready.</p>
            </div>
            <button
              onClick={update}
              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold shrink-0 active:scale-95 transition-transform"
            >
              Update
            </button>
            <button
              onClick={dismiss}
              className="p-1 rounded-lg hover:bg-muted/50 text-muted-foreground shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PWAUpdatePrompt;
