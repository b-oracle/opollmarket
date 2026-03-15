import { useRef, useCallback, useState, type ReactNode } from "react";

interface ChartZoomWrapperProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Wraps an SVG chart to provide pinch-zoom and pan via touch/wheel gestures.
 * Uses CSS transform for smooth, GPU-accelerated zoom without re-rendering the chart.
 */
export default function ChartZoomWrapper({ children, className = "", style }: ChartZoomWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  // Transform state
  const scaleRef = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);
  const [, forceRender] = useState(0);

  // Pinch state
  const initialDistRef = useRef(0);
  const initialScaleRef = useRef(1);
  const initialMidRef = useRef({ x: 0, y: 0 });

  // Pan state
  const panStartRef = useRef({ x: 0, y: 0 });
  const panTxRef = useRef(0);
  const panTyRef = useRef(0);
  const isPanningRef = useRef(false);
  const touchCountRef = useRef(0);

  const applyTransform = useCallback(() => {
    if (!innerRef.current) return;
    const s = scaleRef.current;
    const tx = txRef.current;
    const ty = tyRef.current;
    innerRef.current.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
  }, []);

  const clampTransform = useCallback(() => {
    const s = scaleRef.current;
    if (s <= 1) {
      scaleRef.current = 1;
      txRef.current = 0;
      tyRef.current = 0;
      return;
    }
    const container = containerRef.current;
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    const maxTx = (w * (s - 1)) / 2;
    const maxTy = (h * (s - 1)) / 2;
    txRef.current = Math.max(-maxTx, Math.min(maxTx, txRef.current));
    tyRef.current = Math.max(-maxTy, Math.min(maxTy, tyRef.current));
  }, []);

  const getDist = (t1: React.Touch, t2: React.Touch) =>
    Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchCountRef.current = e.touches.length;

    if (e.touches.length === 2) {
      e.preventDefault();
      const d = getDist(e.touches[0], e.touches[1]);
      initialDistRef.current = d;
      initialScaleRef.current = scaleRef.current;
      initialMidRef.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
      isPanningRef.current = false;
    } else if (e.touches.length === 1 && scaleRef.current > 1) {
      // Pan only when zoomed in
      e.preventDefault();
      isPanningRef.current = true;
      panStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      panTxRef.current = txRef.current;
      panTyRef.current = tyRef.current;
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const d = getDist(e.touches[0], e.touches[1]);
      const newScale = Math.max(1, Math.min(5, initialScaleRef.current * (d / initialDistRef.current)));
      scaleRef.current = newScale;

      // Pan toward pinch midpoint
      const mid = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
      txRef.current += (mid.x - initialMidRef.current.x) * 0.5;
      tyRef.current += (mid.y - initialMidRef.current.y) * 0.5;
      initialMidRef.current = mid;

      clampTransform();
      applyTransform();
    } else if (e.touches.length === 1 && isPanningRef.current && scaleRef.current > 1) {
      e.preventDefault();
      const dx = e.touches[0].clientX - panStartRef.current.x;
      const dy = e.touches[0].clientY - panStartRef.current.y;
      txRef.current = panTxRef.current + dx;
      tyRef.current = panTyRef.current + dy;
      clampTransform();
      applyTransform();
    }
  }, [applyTransform, clampTransform]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    touchCountRef.current = e.touches.length;
    if (e.touches.length === 0) {
      isPanningRef.current = false;
      // Snap back if scale ~1
      if (scaleRef.current < 1.05) {
        scaleRef.current = 1;
        txRef.current = 0;
        tyRef.current = 0;
        applyTransform();
      }
    }
    if (e.touches.length === 1 && scaleRef.current > 1) {
      // Switch to panning with remaining finger
      isPanningRef.current = true;
      panStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      panTxRef.current = txRef.current;
      panTyRef.current = tyRef.current;
    }
  }, [applyTransform]);

  // Mouse wheel zoom for desktop
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    scaleRef.current = Math.max(1, Math.min(5, scaleRef.current * delta));
    if (scaleRef.current <= 1.05) {
      scaleRef.current = 1;
      txRef.current = 0;
      tyRef.current = 0;
    }
    clampTransform();
    applyTransform();
  }, [applyTransform, clampTransform]);

  // Double-tap to reset
  const lastTapRef = useRef(0);
  const onDoubleTap = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      scaleRef.current = scaleRef.current > 1 ? 1 : 2;
      if (scaleRef.current === 1) {
        txRef.current = 0;
        tyRef.current = 0;
      }
      clampTransform();
      applyTransform();
    }
    lastTapRef.current = now;
  }, [applyTransform, clampTransform]);

  return (
    <div
      ref={containerRef}
      className={`overflow-hidden ${className}`}
      style={{ touchAction: "none", ...style }}
      onTouchStart={(e) => { onDoubleTap(e); onTouchStart(e); }}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onWheel={onWheel}
    >
      <div
        ref={innerRef}
        style={{ transformOrigin: "center center", willChange: "transform" }}
      >
        {children}
      </div>
    </div>
  );
}
