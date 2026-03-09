import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Prevent browser edge-swipe navigation (back/forward) while preserving vertical scroll
const EDGE_THRESHOLD = 30;
document.addEventListener('touchstart', (e) => {
  const touch = e.touches[0];
  if (touch.clientX < EDGE_THRESHOLD || touch.clientX > window.innerWidth - EDGE_THRESHOLD) {
    const startX = touch.clientX;
    const startY = touch.clientY;
    let decided = false;
    let shouldBlock = false;
    const onMove = (ev: TouchEvent) => {
      if (!decided) {
        const dx = Math.abs(ev.touches[0].clientX - startX);
        const dy = Math.abs(ev.touches[0].clientY - startY);
        if (dx > 5 || dy > 5) {
          decided = true;
          shouldBlock = dx > dy; // only block horizontal swipes
        }
      }
      if (shouldBlock) ev.preventDefault();
    };
    const cleanup = () => {
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', cleanup);
      document.removeEventListener('touchcancel', cleanup);
    };
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', cleanup);
    document.addEventListener('touchcancel', cleanup);
  }
}, { passive: true });

createRoot(document.getElementById("root")!).render(<App />);
