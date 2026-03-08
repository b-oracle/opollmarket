import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, MessageCircle, Users, Bookmark, ArrowRight, Sparkles, UserPlus, SwatchBook } from "lucide-react";

const TUTORIAL_KEY = "social_tutorial_seen";

const steps = [
  {
    icon: Sparkles,
    title: "Welcome to Social!",
    description: "We've added social features so you can connect with other traders. Let us show you around!",
    color: "from-primary to-primary/60",
  },
  {
    icon: Heart,
    title: "Like Markets",
    description: "Tap the heart icon on any market to show your support. See what's popular based on community likes.",
    color: "from-rose-500 to-pink-400",
  },
  {
    icon: MessageCircle,
    title: "Comment & Discuss",
    description: "Share your thoughts on any market. Reply to others and build threaded conversations.",
    color: "from-blue-500 to-cyan-400",
  },
  {
    icon: UserPlus,
    title: "Follow Traders",
    description: "Follow other users to keep up with their predictions. See mutual connections on profiles.",
    color: "from-emerald-500 to-green-400",
  },
  {
    icon: Users,
    title: "Social Profiles",
    description: "Swipe right on your Profile page to visit your public profile — see followers, activity, and more.",
    color: "from-violet-500 to-purple-400",
  },
  {
    icon: Bookmark,
    title: "Watchlist",
    description: "Bookmark markets you want to track. Access your watchlist anytime from your profile.",
    color: "from-amber-500 to-yellow-400",
  },
];

export const shouldShowTutorial = (): boolean => {
  return localStorage.getItem(TUTORIAL_KEY) !== "1";
};

export const markTutorialSeen = () => {
  localStorage.setItem(TUTORIAL_KEY, "1");
};

interface SocialTutorialProps {
  onComplete: () => void;
}

const SocialTutorial = ({ onComplete }: SocialTutorialProps) => {
  const [step, setStep] = useState(0);
  const current = steps[step];
  const isLast = step === steps.length - 1;

  const handleNext = useCallback(() => {
    if (isLast) {
      markTutorialSeen();
      onComplete();
    } else {
      setStep((s) => s + 1);
    }
  }, [isLast, onComplete]);

  const handleSkip = useCallback(() => {
    markTutorialSeen();
    onComplete();
  }, [onComplete]);

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleSkip} />

      {/* Card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.25 }}
          className="relative w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
        >
          {/* Gradient header */}
          <div className={`bg-gradient-to-br ${current.color} p-8 flex flex-col items-center gap-3`}>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.15, type: "spring", stiffness: 200 }}
              className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center"
            >
              <current.icon className="w-8 h-8 text-white" />
            </motion.div>
            <h2 className="text-xl font-bold text-white text-center">{current.title}</h2>
          </div>

          {/* Body */}
          <div className="p-6">
            <p className="text-sm text-muted-foreground text-center leading-relaxed">
              {current.description}
            </p>

            {/* Progress dots */}
            <div className="flex items-center justify-center gap-1.5 mt-5">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === step
                      ? "w-6 bg-primary"
                      : i < step
                        ? "w-1.5 bg-primary/40"
                        : "w-1.5 bg-muted"
                  }`}
                />
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between mt-6">
              <button
                onClick={handleSkip}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip
              </button>
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
