import { useState, useRef, useCallback, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { X, Download, Copy, Share2, Loader2, Twitter, Facebook, MessageCircle, Send } from "lucide-react";
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
  /** The DOM element to screenshot. If null, falls back to text-only sharing. */
  captureRef?: React.RefObject<HTMLElement | null>;
}

const ShareModal = ({ open, onOpenChange, title, description, marketUrl, captureRef }: ShareModalProps) => {
  const { user } = useAuth();
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const referralLink = user
    ? `${marketUrl}${marketUrl.includes("?") ? "&" : "?"}ref=${user.id}`
    : marketUrl;

  const salesMessage = `🔥 Check out "${title}" on our prediction market! Make your prediction now 👇\n\n${referralLink}`;

  // Capture screenshot when modal opens
  useEffect(() => {
    if (!open) {
      setScreenshot(null);
      return;
    }

    const capture = async () => {
      setCapturing(true);
      try {
        const target = captureRef?.current || document.querySelector("main") || document.body;
        const canvas = await html2canvas(target as HTMLElement, {
          useCORS: true,
          allowTaint: true,
          scale: 2,
          backgroundColor: null,
          logging: false,
          windowWidth: target.scrollWidth,
          windowHeight: target.scrollHeight,
        });

        const ctx = canvas.getContext("2d");
        if (ctx) {
          // Draw branded gradient border
          const borderWidth = 8;
          const w = canvas.width;
          const h = canvas.height;
          const gradient = ctx.createLinearGradient(0, 0, w, h);
          gradient.addColorStop(0, "#02C7FC");
          gradient.addColorStop(0.5, "#A855F7");
          gradient.addColorStop(1, "#02C7FC");
          ctx.strokeStyle = gradient;
          ctx.lineWidth = borderWidth;
          const r = 24;
          ctx.beginPath();
          ctx.moveTo(r, 0);
          ctx.lineTo(w - r, 0);
          ctx.quadraticCurveTo(w, 0, w, r);
          ctx.lineTo(w, h - r);
          ctx.quadraticCurveTo(w, h, w - r, h);
          ctx.lineTo(r, h);
          ctx.quadraticCurveTo(0, h, 0, h - r);
          ctx.lineTo(0, r);
          ctx.quadraticCurveTo(0, 0, r, 0);
          ctx.closePath();
          ctx.stroke();

          // Draw watermark logo
          const logo = new Image();
          logo.src = document.documentElement.classList.contains('dark') ? watermarkLogo : blueLogo;
          await new Promise<void>((resolve) => {
            logo.onload = () => {
              const logoSize = Math.min(canvas.width, canvas.height) * 0.15;
              const aspect = logo.naturalWidth / logo.naturalHeight;
              const w = logoSize * aspect;
              const h = logoSize;
              const x = canvas.width - w - 20;
              const y = canvas.height - h - 20;
              ctx.globalAlpha = 0.4;
              ctx.drawImage(logo, x, y, w, h);
              ctx.globalAlpha = 1;
              resolve();
            };
            logo.onerror = () => resolve();
          });
        }

        canvasRef.current = canvas;
        setScreenshot(canvas.toDataURL("image/png"));
      } catch (err) {
        console.error("Screenshot failed:", err);
        toast.error("Could not capture screenshot");
      } finally {
        setCapturing(false);
      }
    };

    // Small delay to let the UI settle
    const timer = setTimeout(capture, 300);
    return () => clearTimeout(timer);
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
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        toast.success("Screenshot copied to clipboard!");
      } else {
        await navigator.clipboard.writeText(salesMessage);
        toast.success("Message copied to clipboard!");
      }
    } catch {
      await navigator.clipboard.writeText(salesMessage);
      toast.success("Message copied to clipboard!");
    }
  };

  const handleDownload = async () => {
    const blob = await getBlob();
    if (!blob) {
      toast.error("No screenshot to download");
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prediction-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Screenshot downloaded!");
  };

  const handleNativeShare = async () => {
    try {
      const blob = await getBlob();
      const shareData: ShareData = {
        title,
        text: salesMessage,
      };

      if (blob && navigator.canShare?.({ files: [new File([blob], "prediction.png", { type: "image/png" })] })) {
        shareData.files = [new File([blob], "prediction.png", { type: "image/png" })];
      }

      await navigator.share(shareData);
    } catch {
      // User cancelled or share not supported
    }
  };

  const handleTwitter = () => {
    const text = encodeURIComponent(`🔥 "${title}" - Make your prediction now!\n\n${referralLink}`);
    window.open(`https://twitter.com/intent/tweet?text=${text}`, "_blank");
  };

  const handleFacebook = () => {
    const url = encodeURIComponent(referralLink);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, "_blank");
  };

  const handleWhatsApp = () => {
    const text = encodeURIComponent(`🔥 "${title}" - Make your prediction now!\n\n${referralLink}`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const handleTelegram = () => {
    const text = encodeURIComponent(`🔥 "${title}" - Make your prediction now!`);
    const url = encodeURIComponent(referralLink);
    window.open(`https://t.me/share/url?url=${url}&text=${text}`, "_blank");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-0 gap-0 glass border-border/50 rounded-2xl overflow-hidden [&>button]:hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
          <h3 className="text-sm font-bold">Share</h3>
          <button onClick={() => onOpenChange(false)} className="w-8 h-8 rounded-full glass flex items-center justify-center hover:bg-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Screenshot preview */}
        <div className="px-4 py-3">
          <div className="rounded-xl overflow-hidden bg-muted/30 border border-border/20 aspect-video flex items-center justify-center">
            {capturing ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Capturing...</span>
              </div>
            ) : screenshot ? (
              <img src={screenshot} alt="Screenshot" className="w-full h-full object-contain" />
            ) : (
              <span className="text-xs text-muted-foreground">No preview available</span>
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
        <div className="px-4 pb-4 grid grid-cols-3 gap-2">
          <button
            onClick={handleCopy}
            disabled={capturing}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl glass text-xs font-semibold hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Copy className="w-4 h-4" /> Copy
          </button>
          <button
            onClick={handleDownload}
            disabled={capturing || !screenshot}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl glass text-xs font-semibold hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" /> Download
          </button>
          <button
            onClick={handleTwitter}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl glass text-xs font-semibold hover:bg-muted transition-colors"
          >
            <Twitter className="w-4 h-4" /> Twitter
          </button>
          <button
            onClick={handleFacebook}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl glass text-xs font-semibold hover:bg-muted transition-colors"
          >
            <Facebook className="w-4 h-4" /> Facebook
          </button>
          <button
            onClick={handleWhatsApp}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl glass text-xs font-semibold hover:bg-muted transition-colors"
          >
            <MessageCircle className="w-4 h-4" /> WhatsApp
          </button>
          <button
            onClick={handleTelegram}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl glass text-xs font-semibold hover:bg-muted transition-colors"
          >
            <Send className="w-4 h-4" /> Telegram
          </button>
        </div>

        {/* Native share (if available) */}
        {typeof navigator !== "undefined" && navigator.share && (
          <div className="px-4 pb-4">
            <button
              onClick={handleNativeShare}
              disabled={capturing}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Share2 className="w-4 h-4" /> Share via...
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ShareModal;
