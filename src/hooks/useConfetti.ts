import { useCallback } from "react";

const loadConfetti = () => import("canvas-confetti").then(m => m.default);

export const useConfetti = () => {
  const fireWinConfetti = useCallback(async () => {
    const confetti = await loadConfetti();
    const duration = 3000;
    const end = Date.now() + duration;

    const colors = ["hsl(193,98%,50%)", "#ffffff", "hsl(45,93%,58%)"];

    // Initial big burst
    confetti({
      particleCount: 100,
      spread: 80,
      origin: { y: 0.6 },
      colors,
      zIndex: 9999,
    });

    // Continuous side cannons
    const frame = () => {
      if (Date.now() > end) return;

      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors,
        zIndex: 9999,
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors,
        zIndex: 9999,
      });

      requestAnimationFrame(frame);
    };
    frame();
  }, []);

  const fireSubtleConfetti = useCallback(async () => {
    const confetti = await loadConfetti();
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.7 },
      colors: ["hsl(193,98%,50%)", "#ffffff"],
      zIndex: 9999,
      gravity: 1.2,
      scalar: 0.8,
    });
  }, []);

  return { fireWinConfetti, fireSubtleConfetti };
};
