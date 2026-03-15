import { useRef, useCallback, useEffect, type ReactNode } from "react";

interface ChartZoomWrapperProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Initial zoom level – e.g. 3 means only 1/3 of data is visible (latest portion) */
  defaultZoom?: number;
}

/**
 * Wraps native SVG charts and provides pinch-zoom / pan by manipulating
 * the child SVG's viewBox. This zooms into the *chart data* (fewer candles
 * visible at larger size) rather than scaling the screen.
 * Supports single-finger horizontal panning at any zoom level.
 */
export default function ChartZoomWrapper({ children, className = "", style, defaultZoom = 1 }: ChartZoomWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Zoom state stored in refs to avoid re-renders during gestures
  const zoomRef = useRef(defaultZoom);
  const panXRef = useRef(0); // 0 = rightmost / latest data

  // Track whether we've initialized the viewBox
  const initializedRef = useRef(false);

  // Pinch tracking
  const initialDistRef = useRef(0);
  const initialZoomRef = useRef(defaultZoom);
  const initialPanRef = useRef(0);
  const initialMidXRef = useRef(0);
  const isPanningRef = useRef(false);
  const panStartXRef = useRef(0);
  const panStartOffsetRef = useRef(0);

  const getSvg = (): SVGSVGElement | null => {
    return containerRef.current?.querySelector("svg") ?? null;
  };

  const applyViewBox = useCallback(() => {
    const svg = getSvg();
    if (!svg) return;

    const origVB = svg.getAttribute("data-orig-vb");
    if (!origVB) return;
    const [, , fullW, fullH] = origVB.split(" ").map(Number);

    const zoom = zoomRef.current;
    const visibleW = fullW / zoom;

    // Pan: panX=0 means showing the rightmost (latest) data
    const maxOffset = fullW - visibleW;
    const offset = maxOffset - panXRef.current * maxOffset;
    const clampedOffset = Math.max(0, Math.min(maxOffset, offset));

    svg.setAttribute("viewBox", `${clampedOffset} 0 ${visibleW} ${fullH}`);
  }, []);

  const ensureOrigVB = useCallback(() => {
    const svg = getSvg();
    if (!svg) return;
    if (!svg.getAttribute("data-orig-vb")) {
      svg.setAttribute("data-orig-vb", svg.getAttribute("viewBox") || "0 0 100 100");
    }
  }, []);

  // Apply default zoom on mount / when SVG appears
  useEffect(() => {
    if (initializedRef.current) return;
    const tryInit = () => {
      const svg = getSvg();
      if (!svg) return false;
      ensureOrigVB();
      zoomRef.current = defaultZoom;
      panXRef.current = 0;
      applyViewBox();
      initializedRef.current = true;
      return true;
    };
    if (tryInit()) return;
    // Retry until SVG is rendered
    const id = setInterval(() => { if (tryInit()) clearInterval(id); }, 100);
    return () => clearInterval(id);
  }, [defaultZoom, applyViewBox, ensureOrigVB]);

  const getDist = (t1: React.Touch, t2: React.Touch) =>
    Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    ensureOrigVB();

    if (e.touches.length === 2) {
      e.preventDefault();
      initialDistRef.current = getDist(e.touches[0], e.touches[1]);
      initialZoomRef.current = zoomRef.current;
      initialPanRef.current = panXRef.current;
      initialMidXRef.current = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      isPanningRef.current = false;
    } else if (e.touches.length === 1 && zoomRef.current > 1.05) {
      // Pan when zoomed in (including default zoom > 1)
      isPanningRef.current = true;
      panStartXRef.current = e.touches[0].clientX;
      panStartOffsetRef.current = panXRef.current;
    }
  }, [ensureOrigVB]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const d = getDist(e.touches[0], e.touches[1]);
      const ratio = d / initialDistRef.current;
      zoomRef.current = Math.max(1, Math.min(8, initialZoomRef.current * ratio));

      const container = containerRef.current;
      if (container) {
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const dx = midX - initialMidXRef.current;
        const containerW = container.clientWidth;
        panXRef.current = Math.max(0, Math.min(1, initialPanRef.current + dx / containerW));
      }

      applyViewBox();
    } else if (e.touches.length === 1 && isPanningRef.current && zoomRef.current > 1.05) {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;
      const dx = e.touches[0].clientX - panStartXRef.current;
      const containerW = container.clientWidth;
      const sensitivity = zoomRef.current;
      panXRef.current = Math.max(0, Math.min(1, panStartOffsetRef.current + (dx / containerW) * sensitivity));
      applyViewBox();
    }
  }, [applyViewBox]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      isPanningRef.current = false;
      // Snap back to defaultZoom minimum instead of 1
      if (zoomRef.current < defaultZoom * 0.95) {
        zoomRef.current = defaultZoom;
        panXRef.current = 0;
        applyViewBox();
      }
    }
    if (e.touches.length === 1 && zoomRef.current > 1.05) {
      isPanningRef.current = true;
      panStartXRef.current = e.touches[0].clientX;
      panStartOffsetRef.current = panXRef.current;
    }
  }, [applyViewBox, defaultZoom]);

  // Mouse wheel zoom for desktop
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    ensureOrigVB();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    zoomRef.current = Math.max(defaultZoom, Math.min(8, zoomRef.current * factor));
    applyViewBox();
  }, [applyViewBox, ensureOrigVB, defaultZoom]);

  // Mouse drag for desktop panning
  const isMouseDragging = useRef(false);
  const mouseStartX = useRef(0);
  const mousePanStart = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoomRef.current <= 1.05) return;
    ensureOrigVB();
    isMouseDragging.current = true;
    mouseStartX.current = e.clientX;
    mousePanStart.current = panXRef.current;
    e.preventDefault();
  }, [ensureOrigVB]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isMouseDragging.current) return;
    const container = containerRef.current;
    if (!container) return;
    const dx = e.clientX - mouseStartX.current;
    const containerW = container.clientWidth;
    const sensitivity = zoomRef.current;
    panXRef.current = Math.max(0, Math.min(1, mousePanStart.current + (dx / containerW) * sensitivity));
    applyViewBox();
  }, [applyViewBox]);

  const onMouseUp = useCallback(() => {
    isMouseDragging.current = false;
  }, []);

  // Double-tap to reset / toggle 2x
  const lastTapRef = useRef(0);
  const onDoubleTap = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      ensureOrigVB();
      if (zoomRef.current > defaultZoom * 1.1) {
        zoomRef.current = defaultZoom;
        panXRef.current = 0;
      } else {
        zoomRef.current = defaultZoom * 2;
        panXRef.current = 0;
      }
      applyViewBox();
    }
    lastTapRef.current = now;
  }, [applyViewBox, ensureOrigVB, defaultZoom]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ touchAction: "none", cursor: zoomRef.current > 1.05 ? "grab" : "default", ...style }}
      onTouchStart={(e) => { onDoubleTap(e); onTouchStart(e); }}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {children}
    </div>
  );
}
