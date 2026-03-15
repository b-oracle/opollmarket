import { useRef, useCallback, useEffect, type ReactNode } from "react";

interface ChartZoomWrapperProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  defaultZoom?: number;
}

/**
 * Wraps native SVG charts and provides pinch-zoom / pan by manipulating
 * the child SVG's viewBox.
 *
 * Key fix: we store the *natural* viewBox dimensions once on first sight
 * and never re-read from the DOM, so React re-renders (new candles) don't
 * cause the wrapper to reset or fight the SVG.
 */
export default function ChartZoomWrapper({ children, className = "", style, defaultZoom = 1 }: ChartZoomWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const zoomRef = useRef(defaultZoom);
  const panXRef = useRef(0); // 0 = rightmost / latest data

  // Store the natural full viewBox dimensions (never changes for a given chart type)
  const origVBRef = useRef<{ w: number; h: number } | null>(null);

  const initialDistRef = useRef(0);
  const initialZoomRef = useRef(defaultZoom);
  const initialPanRef = useRef(0);
  const initialMidXRef = useRef(0);
  const isPanningRef = useRef(false);
  const panStartXRef = useRef(0);
  const panStartOffsetRef = useRef(0);

  const getSvg = (): SVGSVGElement | null =>
    containerRef.current?.querySelector("svg") ?? null;

  /** Capture the natural viewBox once. Returns true if we have it. */
  const captureOrigVB = useCallback((): boolean => {
    if (origVBRef.current) return true;
    const svg = getSvg();
    if (!svg) return false;
    const vb = svg.getAttribute("viewBox");
    if (!vb) return false;
    const parts = vb.split(" ").map(Number);
    if (parts.length < 4 || parts[2] === 0) return false;
    origVBRef.current = { w: parts[2], h: parts[3] };
    return true;
  }, []);

  const applyViewBox = useCallback(() => {
    const svg = getSvg();
    const orig = origVBRef.current;
    if (!svg || !orig) return;

    const zoom = zoomRef.current;
    const visibleW = orig.w / zoom;
    const maxOffset = orig.w - visibleW;
    // panX 0 = rightmost (latest), 1 = leftmost (oldest)
    const offset = maxOffset - panXRef.current * maxOffset;
    const clamped = Math.max(0, Math.min(maxOffset, offset));

    svg.setAttribute("viewBox", `${clamped} 0 ${visibleW} ${orig.h}`);
  }, []);

  // Re-apply the current zoom/pan after every React render so new candles
  // don't reset the viewBox to the default "0 0 W H".
  useEffect(() => {
    if (!captureOrigVB()) {
      // SVG not yet in DOM — poll briefly
      const id = setInterval(() => {
        if (captureOrigVB()) {
          clearInterval(id);
          applyViewBox();
        }
      }, 80);
      return () => clearInterval(id);
    }
    // Always re-stamp the viewBox after children re-render
    applyViewBox();
  });

  const getDist = (t1: React.Touch, t2: React.Touch) =>
    Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    captureOrigVB();
    if (e.touches.length === 2) {
      e.preventDefault();
      initialDistRef.current = getDist(e.touches[0], e.touches[1]);
      initialZoomRef.current = zoomRef.current;
      initialPanRef.current = panXRef.current;
      initialMidXRef.current = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      isPanningRef.current = false;
    } else if (e.touches.length === 1 && zoomRef.current > 1.05) {
      isPanningRef.current = true;
      panStartXRef.current = e.touches[0].clientX;
      panStartOffsetRef.current = panXRef.current;
    }
  }, [captureOrigVB]);

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

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    captureOrigVB();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    zoomRef.current = Math.max(defaultZoom, Math.min(8, zoomRef.current * factor));
    applyViewBox();
  }, [applyViewBox, captureOrigVB, defaultZoom]);

  const isMouseDragging = useRef(false);
  const mouseStartX = useRef(0);
  const mousePanStart = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoomRef.current <= 1.05) return;
    captureOrigVB();
    isMouseDragging.current = true;
    mouseStartX.current = e.clientX;
    mousePanStart.current = panXRef.current;
    e.preventDefault();
  }, [captureOrigVB]);

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

  const lastTapRef = useRef(0);
  const onDoubleTap = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      captureOrigVB();
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
  }, [applyViewBox, captureOrigVB, defaultZoom]);

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
