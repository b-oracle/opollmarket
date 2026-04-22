import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import OnboardingSlide, { type OnboardingSlideData } from "@/components/onboarding/OnboardingSlide";
import { markOnboardingComplete } from "@/hooks/useFirstRun";
import { lightHaptic } from "@/lib/nativeUI";
import SEOHead from "@/components/SEOHead";

const SLIDES: OnboardingSlideData[] = [
  {
    title: "Predict anything",
    subtitle: "From politics to crypto to sports — back what you believe will happen.",
    image: "/onboarding/slide-1.webp",
    gradient: "bg-[radial-gradient(circle_at_50%_50%,hsl(var(--primary)/0.45),transparent_70%)]",
  },
  {
    title: "Trade in seconds",
    subtitle: "Lightning-fast parimutuel rounds. Tap, predict, win.",
    image: "/onboarding/slide-2.webp",
    gradient: "bg-[radial-gradient(circle_at_50%_50%,hsl(var(--neon-yes)/0.4),transparent_70%)]",
  },
  {
    title: "Earn with your circle",
    subtitle: "Copy top traders, refer friends, and stack rewards together.",
    image: "/onboarding/slide-3.webp",
    gradient: "bg-[radial-gradient(circle_at_50%_50%,hsl(var(--neon-yes)/0.35),transparent_70%)]",
  },
  {
    title: "Go social",
    subtitle: "Spaces, DMs, and stories — predictions are better with people.",
    image: "/onboarding/slide-4.webp",
    gradient: "bg-[radial-gradient(circle_at_50%_50%,hsl(var(--primary)/0.4),transparent_70%)]",
  },
];

const SWIPE_THRESHOLD = 60;

const Welcome = () => {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const isLast = index === SLIDES.length - 1;

  // Preload all images so transitions are instant.
  useEffect(() => {
    SLIDES.forEach((s) => {
      const img = new Image();
      img.src = s.image;
    });
  }, []);

  const finish = useMemo(
    () => () => {
      markOnboardingComplete();
      navigate("/auth", { replace: true });
    },
    [navigate],
  );

  const skip = () => {
    markOnboardingComplete();
    navigate("/", { replace: true });
  };

  const advance = () => {
    if (isLast) {
      finish();
      return;
    }
    void lightHaptic();
    setIndex((i) => Math.min(i + 1, SLIDES.length - 1));
  };

  const back = () => {
    void lightHaptic();
    setIndex((i) => Math.max(i - 1, 0));
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-background text-foreground"
      style={{
        paddingTop: "max(env(safe-area-inset-top), 0.5rem)",
        paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)",
      }}
    >
      <SEOHead title="Welcome to OPOLL" description="Predict, trade, and socialize on the world's most fun prediction market." />

      {/* Skip */}
      <div className="flex justify-end px-4 pt-2">
        <button
          onClick={skip}
          className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Skip
        </button>
      </div>

      {/* Slide */}
      <div
        className="relative flex-1 overflow-hidden"
        onTouchStart={(e) => {
          (e.currentTarget as any)._sx = e.touches[0].clientX;
        }}
        onTouchEnd={(e) => {
          const sx = (e.currentTarget as any)._sx as number | undefined;
          if (sx == null) return;
          const dx = e.changedTouches[0].clientX - sx;
          if (dx < -SWIPE_THRESHOLD) advance();
          else if (dx > SWIPE_THRESHOLD) back();
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={index}
            className="absolute inset-0"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.x < -SWIPE_THRESHOLD) advance();
              else if (info.offset.x > SWIPE_THRESHOLD) back();
            }}
          >
            <OnboardingSlide slide={SLIDES[index]} />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Dots */}
      <div className="flex justify-center gap-2 pb-4">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => {
              void lightHaptic();
              setIndex(i);
            }}
            aria-label={`Go to slide ${i + 1}`}
            className={`h-2 rounded-full transition-all duration-300 ${
              i === index ? "w-8 bg-primary" : "w-2 bg-muted"
            }`}
          />
        ))}
      </div>

      {/* CTA */}
      <div className="px-6 pb-6">
        <Button
          onClick={advance}
          size="lg"
          className="h-14 w-full rounded-2xl text-base font-semibold shadow-lg shadow-primary/30"
        >
          {isLast ? "Get Started" : "Next"}
          {!isLast && <ChevronRight className="ml-1 h-5 w-5" />}
        </Button>
      </div>
    </div>
  );
};

export default Welcome;
