import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { X, Download, Smartphone } from "lucide-react";
import InstallAppModal from "@/components/InstallAppModal";

const VISIT_KEY = "opoll_visit_count";
const DISMISSED_KEY = "opoll_install_dismissed";
const THRESHOLD = 3;

const InstallBanner = () => {
  const { canInstall, isInstalled } = useInstallPrompt();
  const [show, setShow] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (isInstalled) return;

    const dismissed = localStorage.getItem(DISMISSED_KEY);
    if (dismissed) {
      const dismissedAt = Number(dismissed);
      // Re-show after 7 days
      if (Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) return;
    }

    const count = Number(localStorage.getItem(VISIT_KEY) || 0) + 1;
    localStorage.setItem(VISIT_KEY, String(count));

    if (count >= THRESHOLD) {
      // Delay showing for a smoother UX
      const timer = setTimeout(() => setShow(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [isInstalled]);

  const dismiss = () => {
    setShow(false);
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
  };

  if (isInstalled || !show) return <InstallAppModal open={modalOpen} onClose={() => setModalOpen(false)} />;

  return (
    <>
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: 80 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 80 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-20 left-3 right-3 z-40 max-w-lg mx-auto"
          >
            <div className="glass-strong rounded-2xl p-4 border border-primary/20 shadow-lg shadow-primary/5">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold leading-tight">Get the OPOLL App</p>
                  <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                    Faster access, push notifications & offline mode
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShow(false);
                    setModalOpen(true);
                  }}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold shrink-0 active:scale-95 transition-transform flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Install
                </button>
                <button
                  onClick={dismiss}
                  className="w-7 h-7 rounded-full glass flex items-center justify-center shrink-0"
                >
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <InstallAppModal open={modalOpen} onClose={() => { setModalOpen(false); dismiss(); }} />
    </>
  );
};

export default InstallBanner;
