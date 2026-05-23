import { useState } from "react";
import { motion } from "framer-motion";
import BottomSheet from "@/components/BottomSheet";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import {
  Download,
  X,
  Smartphone,
  Zap,
  Bell,
  Wifi,
  CheckCircle2,
  Share,
} from "lucide-react";

interface InstallAppModalProps {
  open: boolean;
  onClose: () => void;
}

const features = [
  { icon: Zap, label: "Instant access", desc: "Open directly from your home screen" },
  { icon: Bell, label: "Push notifications", desc: "Never miss a market resolution" },
  { icon: Wifi, label: "Works offline", desc: "Browse markets even without internet" },
];

const InstallAppModal = ({ open, onClose }: InstallAppModalProps) => {
  const { canInstall, isInstalled, promptInstall } = useInstallPrompt();
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  const handleInstall = async () => {
    if (canInstall) {
      setInstalling(true);
      const accepted = await promptInstall();
      setInstalling(false);
      if (accepted) {
        setInstalled(true);
        setTimeout(onClose, 2000);
      }
    }
  };

  if (!open) return null;

  return (
    <BottomSheet open={open} onClose={onClose} className="p-5">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto mb-4" />

              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold">Get the App</h2>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full glass flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Success state */}
              {(installed || isInstalled) ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center py-8"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", damping: 10 }}
                    className="w-16 h-16 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center mb-4"
                  >
                    <CheckCircle2 className="w-8 h-8 text-primary" />
                  </motion.div>
                  <h3 className="text-lg font-bold mb-1">App Installed!</h3>
                  <p className="text-sm text-muted-foreground text-center">
                    You can now access OPollmarket directly from your home screen.
                  </p>
                </motion.div>
              ) : (
                <>
                  {/* App icon hero */}
                  <div className="flex flex-col items-center mb-6">
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.1, type: "spring" }}
                      className="w-20 h-20 rounded-2xl bg-primary/20 border-2 border-primary/30 flex items-center justify-center mb-3 shadow-lg shadow-primary/10"
                    >
                      <Smartphone className="w-10 h-10 text-primary" />
                    </motion.div>
                    <p className="text-sm text-muted-foreground text-center max-w-[280px]">
                      Install OPollmarket for the best experience — faster, smoother, and always one tap away.
                    </p>
                  </div>

                  {/* Features */}
                  <div className="space-y-3 mb-6">
                    {features.map((f, i) => (
                      <motion.div
                        key={f.label}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.15 + i * 0.1 }}
                        className="flex items-center gap-3 glass rounded-xl p-3"
                      >
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                          <f.icon className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{f.label}</p>
                          <p className="text-[10px] text-muted-foreground">{f.desc}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  {/* Install button or instructions */}
                  {canInstall ? (
                    <motion.button
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                      onClick={handleInstall}
                      disabled={installing}
                      className="w-full bg-primary text-primary-foreground py-4 rounded-xl font-bold text-base transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      {installing ? (
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                        >
                          <Download className="w-5 h-5" />
                        </motion.div>
                      ) : (
                        <Download className="w-5 h-5" />
                      )}
                      {installing ? "Installing..." : "Install App"}
                    </motion.button>
                  ) : isIOS ? (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                      className="glass rounded-xl p-4"
                    >
                      <p className="text-sm font-semibold mb-2 text-center">Install on iOS</p>
                      <div className="space-y-2">
                        <div className="flex items-center gap-3 text-sm">
                          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-primary font-bold text-xs">1</div>
                          <p className="text-muted-foreground">
                            Tap the <Share className="w-4 h-4 inline text-primary" /> <strong className="text-foreground">Share</strong> button in {isSafari ? "Safari" : "your browser"}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-primary font-bold text-xs">2</div>
                          <p className="text-muted-foreground">
                            Scroll down and tap <strong className="text-foreground">Add to Home Screen</strong>
                          </p>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-primary font-bold text-xs">3</div>
                          <p className="text-muted-foreground">
                            Tap <strong className="text-foreground">Add</strong> to confirm
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                      className="glass rounded-xl p-4"
                    >
                      <p className="text-sm font-semibold mb-2 text-center">How to Install</p>
                      <div className="space-y-2">
                        <div className="flex items-center gap-3 text-sm">
                          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-primary font-bold text-xs">1</div>
                          <p className="text-muted-foreground">
                            Open your browser's <strong className="text-foreground">menu</strong> (⋮)
                          </p>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-primary font-bold text-xs">2</div>
                          <p className="text-muted-foreground">
                            Select <strong className="text-foreground">Install App</strong> or <strong className="text-foreground">Add to Home Screen</strong>
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </>
              )}
    </BottomSheet>
  );
};

export default InstallAppModal;
