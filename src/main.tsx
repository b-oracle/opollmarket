import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Prevent browser edge-swipe navigation (back/forward)
const EDGE_THRESHOLD = 30;
document.addEventListener('touchstart', (e) => {
  const touch = e.touches[0];
  if (touch.clientX < EDGE_THRESHOLD || touch.clientX > window.innerWidth - EDGE_THRESHOLD) {
    const onMove = (ev: TouchEvent) => ev.preventDefault();
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
