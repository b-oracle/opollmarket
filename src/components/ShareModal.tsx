import { useState, useRef, useCallback, useEffect } from "react";
import { X, Download, Copy, Share2, Loader2, Twitter, Facebook, MessageCircle, Send, Code } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import html2canvas from "html2canvas";
import watermarkLogo from "@/assets/watermark-logo.png";
import blueLogo from "@/assets/blue-opoll-logo.png";

interface ShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  marketUrl: string;
  captureRef?: React.RefObject<HTMLElement | null>;
}

const captureElement = async (target: HTMLElement): Promise<HTMLCanvasElement> => {
  // Temporarily position the element on-screen for html2canvas
  const orig = {
    left: target.style.left,
    top: target.style.top,
    position: target.style.position,
    zIndex: target.style.zIndex,
    opacity: target.style.opacity,
    pointerEvents: target.style.pointerEvents,
  };
  const isOffscreen = target.style.left === "-9999px";
  if (isOffscreen) {
    Object.assign(target.style, {
      left: "0px",
      top: "0px",
      position: "fixed",
      zIndex: "-1",
      opacity: "1",
      pointerEvents: "none",
    });
  }

  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  try {
    const canvas = await Promise.race([
      html2canvas(target, {
        useCORS: true,
        allowTaint: true,
        scale: 2,
        backgroundColor: null,
        logging: false,
        width: target.scrollWidth,
        height: target.scrollHeight,
      }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000)),
    ]);
    return canvas;
  } finally {
    if (isOffscreen) {
      Object.assign(target.style, orig);
    }
  }
};

const addWatermark = async (canvas: HTMLCanvasElement) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { width: w, height: h } = canvas;

  // Logo watermark
  const isDark = document.documentElement.classList.contains("dark");
  const logo = new Image();
  logo.crossOrigin = "anonymous";
  logo.src = isDark ? watermarkLogo : blueLogo;
  await new Promise<void>((resolve) => {
    logo.onload = () => {
      const sz = Math.min(w, h) * 0.15;
      const aspect = logo.naturalWidth / logo.naturalHeight;
      const lw = sz * aspect;
      const lh = sz;
      ctx.globalAlpha = 0.4;
      ctx.drawImage(logo, w - lw - 20, h - lh - 20, lw, lh);
      ctx.globalAlpha = 1;
      resolve();
    };
    logo.onerror = () => resolve();
    setTimeout(resolve, 2000);
  });
};

const ShareModal = ({ open, onOpenChange, title, description, marketUrl, captureRef }: ShareModalProps) => {
  const { user } = useAuth();
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const referralLink = user
    ? `${marketUrl}${marketUrl.includes("?") ? "&" : "?"}ref=${user.id}`
    : marketUrl;

  // Clean link for display in share text
  const cleanShareLink = (() => {
    const marketId = marketUrl.split("/market/")[1]?.split("?")[0];
    if (!marketId) return referralLink;
    const base = `https://opoll.org/market/${marketId}`;
    return user ? `${base}?ref=${user.id}` : base;
  })();

  // OG-proxy link for social platform crawlers (Twitter, Facebook) to read correct meta tags
  const ogShareLink = (() => {
    const marketId = marketUrl.split("/market/")[1]?.split("?")[0];
    if (!marketId) return referralLink;
    const base = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/og-share?id=${marketId}`;
    return user ? `${base}&ref=${user.id}` : base;
  })();

  const salesMessage = `🔥 Check out "${title}" on our prediction market! Make your OPinion count, predict now 👇🏽\n\n${cleanShareLink}`;

  // Capture screenshot when modal opens
  useEffect(() => {
    if (!open) {
      setScreenshot(null);
      setCapturing(false);
      canvasRef.current = null;
      return;
    }

    let cancelled = false;

    const run = async () => {
      const target = captureRef?.current;
      if (!target) {
        setCapturing(false);
        return;
      }

      setCapturing(true);
      try {
        const canvas = await captureElement(target);
        if (cancelled) return;
        await addWatermark(canvas);
        if (cancelled) return;
        canvasRef.current = canvas;
        setScreenshot(canvas.toDataURL("image/png"));
      } catch (err) {
        console.error("Screenshot capture failed:", err);
        if (!cancelled) {
          // Don't show error toast — just show fallback
        }
      } finally {
        if (!cancelled) setCapturing(false);
      }
    };

    const timer = setTimeout(run, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, captureRef]);

  const getBlob = useCallback(async (): Promise<Blob | null> => {
    if (!canvasRef.current) return null;
    return new Promise((resolve) => {
      canvasRef.current!.toBlob((blob) => resolve(blob), "image/png");
    });
  }, []);

  const handleCopy = async () => {
    try {
      const blob = await getBlob();
      if (blob) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        toast.success("Screenshot copied!");
      } else {
        await navigator.clipboard.writeText(salesMessage);
        toast.success("Message copied!");
      }
    } catch {
      await navigator.clipboard.writeText(salesMessage);
      toast.success("Message copied!");
    }
  };

  const handleDownload = async () => {
    const blob = await getBlob();
    if (!blob) { toast.error("No screenshot to download"); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `opoll-share-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded!");
  };

  const handleNativeShare = async () => {
    try {
      const blob = await getBlob();
      const shareData: ShareData = { title, text: salesMessage };
      if (blob && navigator.canShare?.({ files: [new File([blob], "share.png", { type: "image/png" })] })) {
        shareData.files = [new File([blob], "share.png", { type: "image/png" })];
      }
      await navigator.share(shareData);
    } catch { /* cancelled */ }
  };

  const handleTwitter = () => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`🔥 "${title}" - Make your OPinion count, predict now 👇🏽\n\n${ogShareLink}`)}`, "_blank");
  };
  const handleFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(ogShareLink)}`, "_blank");
  };
  const handleWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(`🔥 "${title}" - Make your OPinion count, predict now 👇🏽\n\n${referralLink}`)}`, "_blank");
  };
  const handleTelegram = () => {
    window.open(`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(`🔥 "${title}" - Make your OPinion count, predict now 👇🏽`)}`, "_blank");
  };

  const handleCopyEmbed = () => {
    const marketId = marketUrl.split("/market/")[1]?.split("?")[0];
    if (!marketId) { toast.error("Could not generate embed code"); return; }
    const embedCode = `<iframe src="https://opoll.org/embed/market/${marketId}" width="400" height="320" frameborder="0" style="border-radius:12px" loading="lazy"></iframe>`;
    navigator.clipboard.writeText(embedCode);
    toast.success("Embed code copied!");
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* Modal */}
      <div className="fixed inset-x-0 z-50 flex items-center justify-center pointer-events-none"
        style={{ top: "calc(3.5rem + env(safe-area-inset-top))", bottom: "calc(4rem + env(safe-area-inset-bottom))", padding: "1rem" }}>
        <div
          className="pointer-events-auto w-full max-w-sm md:max-w-lg bg-card border border-border rounded-2xl shadow-xl overflow-hidden flex flex-col"
          style={{ maxHeight: "100%" }}
        >
          {/* Sticky header with close button */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 shrink-0">
            <h3 className="text-sm font-bold">Share</h3>
            <button
              onClick={() => onOpenChange(false)}
              className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y", willChange: "scroll-position" } as React.CSSProperties}>
            {/* Screenshot preview */}
            <div className="px-4 py-3">
              <div className="rounded-xl overflow-hidden bg-muted/30 border border-border/20 flex items-center justify-center min-h-[120px]">
                {capturing ? (
                  <div className="flex flex-col items-center gap-2 py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    <span className="text-xs text-muted-foreground">Generating preview...</span>
                  </div>
                ) : screenshot ? (
                  <img src={screenshot} alt="Preview" className="w-full object-contain max-h-[40vh]" />
                ) : (
                  <div className="flex flex-col items-center gap-2 py-8">
                    <Share2 className="w-6 h-6 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Preview unavailable</span>
                  </div>
                )}
              </div>
            </div>

            {/* Sales message */}
            <div className="px-4 pb-3">
              <div className="rounded-xl bg-muted/30 border border-border/20 p-3">
                <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-line">{salesMessage}</p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="px-4 pb-3 grid grid-cols-3 gap-2">
              <button onClick={handleCopy} disabled={capturing} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-muted/50 border border-border/20 text-xs font-semibold hover:bg-muted transition-colors disabled:opacity-50">
                <Copy className="w-3.5 h-3.5" /> Copy
              </button>
              <button onClick={handleDownload} disabled={capturing || !screenshot} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-muted/50 border border-border/20 text-xs font-semibold hover:bg-muted transition-colors disabled:opacity-50">
                <Download className="w-3.5 h-3.5" /> Save
              </button>
              <button onClick={handleTwitter} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-muted/50 border border-border/20 text-xs font-semibold hover:bg-muted transition-colors">
                <Twitter className="w-3.5 h-3.5" /> Twitter
              </button>
              <button onClick={handleFacebook} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-muted/50 border border-border/20 text-xs font-semibold hover:bg-muted transition-colors">
                <Facebook className="w-3.5 h-3.5" /> Facebook
              </button>
              <button onClick={handleWhatsApp} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-muted/50 border border-border/20 text-xs font-semibold hover:bg-muted transition-colors">
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </button>
              <button onClick={handleTelegram} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-muted/50 border border-border/20 text-xs font-semibold hover:bg-muted transition-colors">
                <Send className="w-3.5 h-3.5" /> Telegram
              </button>
              <button onClick={handleCopyEmbed} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-muted/50 border border-border/20 text-xs font-semibold hover:bg-muted transition-colors col-span-3">
                <Code className="w-3.5 h-3.5" /> Copy Embed Code
              </button>
            </div>
          </div>

          {/* Sticky footer: native share */}
          {typeof navigator !== "undefined" && navigator.share && (
            <div className="px-4 py-3 border-t border-border/30 shrink-0" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
              <button
                onClick={handleNativeShare}
                disabled={capturing}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Share2 className="w-4 h-4" /> Share via...
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default ShareModal;
