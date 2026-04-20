import { motion } from "framer-motion";

export interface OnboardingSlideData {
  title: string;
  subtitle: string;
  image: string;
  /** Tailwind gradient classes applied behind the illustration */
  gradient: string;
}

interface Props {
  slide: OnboardingSlideData;
}

const OnboardingSlide = ({ slide }: Props) => {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
      {/* Illustration */}
      <div className="relative mb-10 flex h-[44vh] w-full max-w-md items-center justify-center">
        <div
          className={`absolute inset-0 rounded-[2.5rem] opacity-70 blur-2xl ${slide.gradient}`}
          aria-hidden
        />
        <motion.img
          key={slide.image}
          src={slide.image}
          alt=""
          width={1024}
          height={1024}
          loading="eager"
          decoding="async"
          className="relative z-10 max-h-full w-auto rounded-3xl object-contain"
          initial={{ opacity: 0, scale: 0.92, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>

      {/* Copy */}
      <motion.h1
        key={`${slide.title}-h`}
        className="mb-3 text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        {slide.title}
      </motion.h1>
      <motion.p
        key={`${slide.title}-p`}
        className="max-w-md text-base text-muted-foreground sm:text-lg"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.18 }}
      >
        {slide.subtitle}
      </motion.p>
    </div>
  );
};

export default OnboardingSlide;
