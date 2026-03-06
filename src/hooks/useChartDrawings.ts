import { useRef, useState, useCallback, useEffect } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";

export type DrawingTool = "none" | "trendline" | "hline";

interface Point {
  time: number; // logical index or timestamp
  price: number;
}

interface TrendlineDrawing {
  type: "trendline";
  id: string;
  p1: Point;
  p2: Point;
}

interface HLineDrawing {
  type: "hline";
  id: string;
  price: number;
}

type Drawing = TrendlineDrawing | HLineDrawing;

let drawingIdCounter = 0;

export function useChartDrawings(
  chartRef: React.MutableRefObject<IChartApi | null>,
  candleSeriesRef: React.MutableRefObject<ISeriesApi<"Candlestick"> | null>,
  containerRef: React.RefObject<HTMLDivElement | null>
) {
  const [activeTool, setActiveTool] = useState<DrawingTool>("none");
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pendingPointRef = useRef<Point | null>(null);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;
  const drawingsRef = useRef(drawings);
  drawingsRef.current = drawings;

  // Create overlay canvas
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let canvas = canvasRef.current;
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.style.position = "absolute";
      canvas.style.top = "0";
      canvas.style.left = "0";
      canvas.style.pointerEvents = "none";
      canvas.style.zIndex = "10";
      container.style.position = "relative";
      container.appendChild(canvas);
      canvasRef.current = canvas;
    }

    const resize = () => {
      if (!canvas || !container) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = container.clientWidth * dpr;
      canvas.height = container.clientHeight * dpr;
      canvas.style.width = container.clientWidth + "px";
      canvas.style.height = container.clientHeight + "px";
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    return () => {
      ro.disconnect();
    };
  }, [containerRef]);

  // Coordinate conversion helpers
  const getChartPoint = useCallback(
    (clientX: number, clientY: number): Point | null => {
      const chart = chartRef.current;
      const series = candleSeriesRef.current;
      const container = containerRef.current;
      if (!chart || !series || !container) return null;

      const rect = container.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;

      const timeCoord = chart.timeScale().coordinateToTime(x);
      const priceCoord = series.coordinateToPrice(y);

      if (timeCoord == null || priceCoord == null) return null;
      return { time: timeCoord as number, price: priceCoord as number };
    },
    [chartRef, candleSeriesRef, containerRef]
  );

  const toPixel = useCallback(
    (point: Point): { x: number; y: number } | null => {
      const chart = chartRef.current;
      const series = candleSeriesRef.current;
      if (!chart || !series) return null;

      const x = chart.timeScale().timeToCoordinate(point.time as any);
      const y = series.priceToCoordinate(point.price);
      if (x == null || y == null) return null;
      return { x: x as number, y: y as number };
    },
    [chartRef, candleSeriesRef]
  );

  // Render all drawings
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    for (const d of drawingsRef.current) {
      if (d.type === "hline") {
        const series = candleSeriesRef.current;
        if (!series) continue;
        const y = series.priceToCoordinate(d.price);
        if (y == null) continue;

        ctx.beginPath();
        ctx.strokeStyle = "hsl(45, 93%, 58%)";
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 3]);
        ctx.moveTo(0, y as number);
        ctx.lineTo(w, y as number);
        ctx.stroke();
        ctx.setLineDash([]);

        // Price label
        ctx.fillStyle = "hsl(45, 93%, 58%)";
        ctx.font = "bold 9px sans-serif";
        ctx.fillText(d.price.toFixed(2), 4, (y as number) - 3);
      } else if (d.type === "trendline") {
        const px1 = toPixel(d.p1);
        const px2 = toPixel(d.p2);
        if (!px1 || !px2) continue;

        // Extend the line beyond the two points
        const dx = px2.x - px1.x;
        const dy = px2.y - px1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) continue;
        const ext = 2000;
        const nx = dx / len;
        const ny = dy / len;

        ctx.beginPath();
        ctx.strokeStyle = "hsl(210, 90%, 60%)";
        ctx.lineWidth = 1.5;
        ctx.moveTo(px1.x - nx * ext, px1.y - ny * ext);
        ctx.lineTo(px2.x + nx * ext, px2.y + ny * ext);
        ctx.stroke();

        // Anchor dots
        ctx.fillStyle = "hsl(210, 90%, 60%)";
        for (const p of [px1, px2]) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Preview line while drawing
    const pending = pendingPointRef.current;
    const mouse = mouseRef.current;
    if (pending && mouse && activeToolRef.current === "trendline") {
      const px1 = toPixel(pending);
      if (px1) {
        ctx.beginPath();
        ctx.strokeStyle = "hsl(210, 90%, 60%)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.moveTo(px1.x, px1.y);
        ctx.lineTo(mouse.x, mouse.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }, [toPixel, candleSeriesRef]);

  // Subscribe to chart updates for re-rendering
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const ts = chart.timeScale();
    const handler = () => render();
    ts.subscribeVisibleLogicalRangeChange(handler);

    // Also render on animation frames when drawing
    let raf: number;
    const loop = () => {
      render();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      ts.unsubscribeVisibleLogicalRangeChange(handler);
      cancelAnimationFrame(raf);
    };
  }, [chartRef, render]);

  // Mouse event handlers
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseDown = (e: MouseEvent) => {
      const tool = activeToolRef.current;
      if (tool === "none") return;

      const pt = getChartPoint(e.clientX, e.clientY);
      if (!pt) return;

      if (tool === "hline") {
        const id = `drawing-${++drawingIdCounter}`;
        setDrawings((prev) => [...prev, { type: "hline", id, price: pt.price }]);
        setActiveTool("none");
      } else if (tool === "trendline") {
        if (!pendingPointRef.current) {
          pendingPointRef.current = pt;
        } else {
          const id = `drawing-${++drawingIdCounter}`;
          setDrawings((prev) => [
            ...prev,
            { type: "trendline", id, p1: pendingPointRef.current!, p2: pt },
          ]);
          pendingPointRef.current = null;
          setActiveTool("none");
        }
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (activeToolRef.current !== "none") {
        e.preventDefault();
        pendingPointRef.current = null;
        setActiveTool("none");
      }
    };

    // Use a transparent overlay for pointer events when tool is active
    container.addEventListener("mousedown", handleMouseDown, true);
    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("contextmenu", handleContextMenu);

    return () => {
      container.removeEventListener("mousedown", handleMouseDown, true);
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [containerRef, getChartPoint]);

  const clearDrawings = useCallback(() => {
    setDrawings([]);
    pendingPointRef.current = null;
  }, []);

  const removeLastDrawing = useCallback(() => {
    setDrawings((prev) => prev.slice(0, -1));
  }, []);

  return {
    activeTool,
    setActiveTool,
    drawings,
    clearDrawings,
    removeLastDrawing,
  };
}
