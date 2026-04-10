import { useState, useCallback, useEffect, useRef } from "react";
import { useConfetti } from "@/hooks/useConfetti";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, MessageCircle, Users, Bookmark, ArrowRight, ArrowLeft, Sparkles, UserPlus, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/** Haptic patterns matching the project standard */
const haptic = {
  light: () => navigator.vibrate?.(10),
  medium: () => navigator.vibrate?.(30),
  success: () => navigator.vibrate?.([30, 50, 30]),
};

/** Subtle tick sound via Web Audio API */
function playTickSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.06);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {
    // silent
  }
}

function playCompleteSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.1, now);
    master.gain.linearRampToValueAtTime(0, now + 0.5);
    master.connect(ctx.destination);

    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + i * 0.1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, now + i * 0.1);
      g.gain.linearRampToValueAtTime(0.2, now + i * 0.1 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.2);
      osc.connect(g);
      g.connect(master);
      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 0.25);
    });
  } catch {
    // silent
  }
}

interface TutorialStep {
  icon: typeof Sparkles;
  title: string;
  description: string;
  color: string;
}

const steps: TutorialStep[] = [
  {
    icon: Sparkles,
    title: "Welcome to Social!",
    description: "Connect with traders, share insights, and stay ahead of the market. Let us show you around!",
    color: "from-primary to-primary/60",
  },
  {
    icon: Heart,
    title: "Like & React",
    description: "Tap the heart on any market or post to show your support. See what's trending based on community likes.",
    color: "from-rose-500 to-pink-400",
  },
  {
    icon: MessageCircle,
    title: "Posts & Stories",
    description: "Share updates, images, and market tags in your feed. Post Stories that disappear after 24 hours — tap the ring on any avatar to view them.",
    color: "from-blue-500 to-cyan-400",
  },
  {
    icon: UserPlus,
    title: "Follow & Copy Trade",
    description: "Follow top traders and enable Copy Trading to automatically mirror their positions. Track performance before you subscribe.",
    color: "from-emerald-500 to-green-400",
  },
  {
    icon: Users,
    title: "Live Spaces",
    description: "Join or host live audio rooms to discuss markets in real time. React with sounds, send gifts, and listen to replays later.",
    color: "from-violet-500 to-purple-400",
  },
  {
    icon: Globe,
    title: "Messages & Calls",
    description: "Chat privately with any trader, send emoji gifts, and make voice or video calls — all built right in.",
    color: "from-sky-500 to-indigo-400",
  },
  {
    icon: Bookmark,
    title: "Watchlist & Profile",
    description: "Bookmark markets to your watchlist and build your public profile — followers, activity, and stats all in one place. You're all set!",
    color: "from-amber-500 to-yellow-400",
  },
];

export const checkTutorialSeenFromDB = async (userId: string): Promise<boolean> => {
  const { data } = await supabase
    .from("profiles")
    .select("social_tutorial_seen")
    .eq("id", userId)
    .single();
  return !!data?.social_tutorial_seen;
};

export const markTutorialSeen = async (userId?: string) => {
  if (userId) {
    await supabase
      .from("profiles")
      .update({ social_tutorial_seen: true })
      .eq("id", userId);
  }
};

export const resetTutorial = async (userId?: string) => {
  if (userId) {
    await supabase
      .from("profiles")
      .update({ social_tutorial_seen: false })
      .eq("id", userId);
  }
};

interface SocialTutorialProps {
  onComplete: () => void;
  userId?: string;
}

const SocialTutorial = ({ onComplete, userId }: SocialTutorialProps) => {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const { fireWinConfetti } = useConfetti();
  const current = steps[step];
  const isLast = step === steps.length - 1;

  const handleNext = useCallback(() => {
    if (isLast) {
      haptic.success();
      playCompleteSound();
      fireWinConfetti();
      markTutorialSeen(userId);
      navigate("/", { replace: true });
      onComplete();
    } else {
      haptic.light();
      playTickSound();
      setStep((s) => s + 1);
    }
  }, [isLast, onComplete, navigate, fireWinConfetti, userId]);

  const handleBack = useCallback(() => {
    if (step > 0) {
      haptic.light();
      playTickSound();
      setStep((s) => s - 1);
    }
  }, [step]);

  const handleSkip = useCallback(() => {
    haptic.light();
    markTutorialSeen(userId);
    navigate("/", { replace: true });
    onComplete();
  }, [onComplete, navigate, userId]);

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Backdrop — semi-transparent so the page behind is visible */}
      <div className="absolute inset-0 bg-black/60" onClick={handleSkip} />

      {/* Card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, scale: 0.9, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -15 }}
          transition={{ duration: 0.25 }}
          className="relative w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
        >
          {/* Gradient header */}
          <div className={`bg-gradient-to-br ${current.color} p-7 flex flex-col items-center gap-3`}>
            <motion.div
              initial={{ scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.15, type: "spring", stiffness: 200 }}
              className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center"
            >
              <current.icon className="w-7 h-7 text-white" />
            </motion.div>
            <h2 className="text-lg font-bold text-white text-center">{current.title}</h2>
          </div>

          {/* Body */}
          <div className="p-5">
            <p className="text-sm text-muted-foreground text-center leading-relaxed">
              {current.description}
            </p>

            {/* Step counter */}
            <p className="text-[10px] text-muted-foreground/60 text-center mt-3 font-medium tracking-wide">
              {step + 1} of {steps.length}
            </p>

            {/* Progress dots */}
            <div className="flex items-center justify-center gap-1.5 mt-2">
              {steps.map((_, i) => (
                <motion.div
                  key={i}
                  animate={{
                    width: i === step ? 24 : 6,
                    opacity: i === step ? 1 : i < step ? 0.6 : 0.3,
                  }}
                  className={`h-1.5 rounded-full ${
                    i <= step ? "bg-primary" : "bg-muted"
                  }`}
                />
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between mt-5">
              <div className="flex items-center gap-2">
                {step > 0 ? (
                  <button
                    onClick={handleBack}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
                  >
                    <ArrowLeft className="w-3 h-3" /> Back
                  </button>
                ) : (
                  <button
                    onClick={handleSkip}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
                  >
                    Skip tour
                  </button>
                )}
              </div>
              <button
                onClick={handleNext}
                className="flex items-center gap-1.5 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-all active:scale-[0.97]"
              >
                {isLast ? "Get Started" : "Next"}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
};

export default SocialTutorial;
