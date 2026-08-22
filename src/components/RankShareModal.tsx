import { useState, useRef, useCallback, useEffect } from "react";
import { X, Download, Copy, Share2, Loader2, Twitter, MessageCircle, Send, Trophy, TrendingUp, Crown, Medal, Award, PenSquare, BookOpen } from "lucide-react";
import { toast } from "sonner";
const loadHtml2Canvas = () => import("html2canvas").then(m => m.default);
import watermarkLogo from "@/assets/watermark-logo.png";
import blueLogo from "@/assets/blue-opoll-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import StoryCreator from "@/components/social/StoryCreator";
import { resolveAvatarUrl } from "@/lib/avatarUrl";

interface RankShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rank: number;
  name: string;
  avatar: string | null;
  valueLine: string;
  valuePositive: boolean;
  statLine: string;
  category: string;
  totalCount: number;
}

const rankBadge = (rank: number) => {
  if (rank === 1) return <Crown className="w-8 h-8" style={{ color: "hsl(45, 93%, 58%)" }} />;
  if (rank === 2) return <Medal className="w-8 h-8" style={{ color: "hsl(0, 0%, 78%)" }} />;
  if (rank === 3) return <Award className="w-8 h-8" style={{ color: "hsl(30, 75%, 40%)" }} />;
  return null;
};

const RankShareModal = ({ open, onOpenChange, rank, name, avatar, valueLine, valuePositive, statLine, category, totalCount }: RankShareModalProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [postingToFeed, setPostingToFeed] = useState(false);
  const [sharingToStory, setSharingToStory] = useState(false);
  const [storyCreatorOpen, setStoryCreatorOpen] = useState(false);
  const [storyImageUrl, setStoryImageUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const shareUrl = window.location.href;
  const shareText = `🏆 I'm ranked #${rank} on the ${category} leaderboard with ${valueLine}! Top ${Math.round((rank / totalCount) * 100)}% — Can you beat me?\n\n${shareUrl}`;
  const storyText = `🏆 #${rank} on ${category}\n${valueLine} • Top ${Math.round((rank / totalCount) * 100)}%`;

  useEffect(() => {
    if (!open) {
      setScreenshot(null);
      setStoryImageUrl(null);
      return;
    }

    const capture = async () => {
      setCapturing(true);
      await new Promise((r) => setTimeout(r, 400));
      try {
        if (!cardRef.current) throw new Error("Card not ready");
        const html2canvas = await loadHtml2Canvas();
        const canvas = await html2canvas(cardRef.current, {
          useCORS: true,
          allowTaint: true,
          scale: 2,
          backgroundColor: null,
          logging: false,
        });

        const ctx = canvas.getContext("2d");
        if (ctx) {
          const logo = new Image();
          logo.src = document.documentElement.classList.contains('dark') ? watermarkLogo : blueLogo;
          await new Promise<void>((resolve) => {
            logo.onload = () => {
              const logoSize = Math.min(canvas.width, canvas.height) * 0.12;
              const aspect = logo.naturalWidth / logo.naturalHeight;
              const w = logoSize * aspect;
              const h = logoSize;
              ctx.globalAlpha = 0.4;
              ctx.drawImage(logo, canvas.width - w - 16, canvas.height - h - 16, w, h);
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
      } finally {
        setCapturing(false);
      }
    };

    capture();
  }, [open]);

  const getBlob = useCallback(async (): Promise<Blob | null> => {
    if (!canvasRef.current) return null;
    return new Promise((resolve) => {
      canvasRef.current!.toBlob((blob) => resolve(blob), "image/png");
    });
  }, []);

  const uploadRankImage = useCallback(async () => {
    if (!user) return null;
    const blob = await getBlob();
    if (!blob) return null;

    const path = `${user.id}/rank-share-${Date.now()}.png`;
    const { error: uploadError } = await supabase.storage
      .from("social-media")
      .upload(path, blob, { upsert: true, contentType: "image/png" });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from("social-media").getPublicUrl(path);
    return urlData.publicUrl;
  }, [getBlob, user]);

  const handleCopy = async () => {
    try {
      const blob = await getBlob();
      if (blob) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        toast.success("Screenshot copied!");
      } else {
        await navigator.clipboard.writeText(shareText);
        toast.success("Text copied!");
      }
    } catch {
      await navigator.clipboard.writeText(shareText);
      toast.success("Text copied!");
    }
  };

  const handleDownload = async () => {
    const blob = await getBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rank-${rank}-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded!");
  };

  const handleNativeShare = async () => {
    try {
      const blob = await getBlob();
      const shareData: ShareData = { title: "My Leaderboard Rank", text: shareText };
      if (blob && navigator.canShare?.({ files: [new File([blob], "rank.png", { type: "image/png" })] })) {
        shareData.files = [new File([blob], "rank.png", { type: "image/png" })];
      }
      await navigator.share(shareData);
    } catch { /* cancelled */ }
  };

  const handleTwitter = () => {
    const text = encodeURIComponent(`🏆 I'm ranked #${rank} on the ${category} leaderboard with ${valueLine}! Can you beat me?\n\n${shareUrl}`);
    window.open(`https://twitter.com/intent/tweet?text=${text}`, "_blank");
  };

  const handleWhatsApp = () => {
    const text = encodeURIComponent(`🏆 I'm ranked #${rank} on the ${category} leaderboard with ${valueLine}!\n\n${shareUrl}`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const handleTelegram = () => {
    const text = encodeURIComponent(`🏆 I'm ranked #${rank} on the ${category} leaderboard with ${valueLine}!`);
    const url = encodeURIComponent(shareUrl);
    window.open(`https://t.me/share/url?url=${url}&text=${text}`, "_blank");
  };

  const handlePostToFeed = async () => {
    if (!user) { toast.error("Sign in to post to feed"); return; }
    setPostingToFeed(true);
    try {
      const image_url = await uploadRankImage();
      if (!image_url) throw new Error("Image is still generating. Please try again in a second.");

      const { error } = await supabase.from("status_updates").insert({
        user_id: user.id,
        content: shareText,
        image_url,
      });
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["status-feed"] });
      queryClient.invalidateQueries({ queryKey: ["social-posts"] });
      toast.success("Posted to feed!");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to post");
    } finally {
      setPostingToFeed(false);
    }
  };

  const handleShareToStory = async () => {
    if (!user) { toast.error("Sign in to share to story"); return; }
    setSharingToStory(true);
    try {
      const image_url = await uploadRankImage();
      if (!image_url) throw new Error("Image is still generating. Please try again in a second.");
      setStoryImageUrl(image_url);
      setStoryCreatorOpen(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to prepare story");
    } finally {
      setSharingToStory(false);
    }
  };

  const topPercent = Math.round((rank / totalCount) * 100);

  const rankTheme = rank === 1
    ? { gradient: "from-yellow-900/40 via-card to-yellow-500/15", border: "border-yellow-500/50", accent: "#EAB308", accentBg: "bg-yellow-500/20", ring: "ring-yellow-500/30" }
    : rank === 2
    ? { gradient: "from-slate-400/20 via-card to-slate-300/10", border: "border-slate-400/50", accent: "#94A3B8", accentBg: "bg-slate-400/20", ring: "ring-slate-400/30" }
    : rank === 3
    ? { gradient: "from-orange-900/30 via-card to-orange-500/10", border: "border-orange-700/50", accent: "#B45309", accentBg: "bg-orange-700/20", ring: "ring-orange-700/30" }
    : { gradient: "from-card via-card to-primary/10", border: "border-border/30", accent: "hsl(var(--primary))", accentBg: "bg-primary/20", ring: "ring-primary/30" };

  if (!open && !storyCreatorOpen) return null;

  return (
    <>
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
          />

          {/* Modal */}
          <div
            className="fixed inset-x-0 z-50 flex items-center justify-center pointer-events-none"
            style={{ top: "var(--safe-top)", bottom: "var(--content-bottom)", padding: "1rem" }}
          >
            <div
              className="pointer-events-auto w-full max-w-sm md:max-w-lg bg-card border border-border rounded-2xl shadow-xl overflow-hidden flex flex-col"
              style={{ maxHeight: "100%" }}
            >
              {/* Sticky header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 shrink-0">
                <h3 className="text-sm font-bold">Share Your Rank</h3>
                <button
                  onClick={() => onOpenChange(false)}
                  className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y", willChange: "scroll-position" } as React.CSSProperties}>
                {/* The share card to be screenshotted */}
                <div className="px-4 py-3">
                  <div ref={cardRef} className={`rounded-2xl overflow-hidden bg-gradient-to-br ${rankTheme.gradient} border ${rankTheme.border} p-5`}>
                    <div className="flex items-center gap-2 mb-4">
                      <Trophy className="w-5 h-5" style={{ color: rankTheme.accent }} />
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{category} Leaderboard</span>
                    </div>

                    <div className="flex items-center gap-4 mb-4">
                      <div className={`w-16 h-16 rounded-full bg-secondary flex items-center justify-center text-2xl shrink-0 overflow-hidden border-2 ${rankTheme.ring}`} style={{ borderColor: rankTheme.accent }}>
                        {avatar ? (
                          <img src={resolveAvatarUrl(avatar)} alt={name} className="w-full h-full object-cover" />
                        ) : (
                          <span>👤</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-lg font-bold truncate">{name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {rankBadge(rank)}
                          <span className="text-3xl font-black" style={{ color: rankTheme.accent }}>#{rank}</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div className="glass rounded-xl p-3 text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Performance</p>
                        <p className={`text-lg font-bold flex items-center justify-center gap-1 ${valuePositive ? "text-primary" : "text-destructive"}`}>
                          {valuePositive ? <TrendingUp className="w-4 h-4" /> : null}
                          {valueLine}
                        </p>
                      </div>
                      <div className="glass rounded-xl p-3 text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Percentile</p>
                        <p className="text-lg font-bold" style={{ color: rankTheme.accent }}>Top {topPercent}%</p>
                      </div>
                    </div>

                    <p className="text-[10px] text-muted-foreground text-center">{statLine}</p>
                  </div>
                </div>

                {/* Screenshot preview */}
                {capturing && (
                  <div className="px-4 pb-3 flex justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                )}

                {/* Action buttons */}
                <div className="px-4 pb-3 grid grid-cols-3 gap-2">
                  <button onClick={handlePostToFeed} disabled={postingToFeed || capturing} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary/10 border border-primary/20 text-xs font-semibold hover:bg-primary/20 transition-colors disabled:opacity-50 text-primary">
                    {postingToFeed ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PenSquare className="w-3.5 h-3.5" />} Feed
                  </button>
                  <button onClick={handleShareToStory} disabled={sharingToStory || capturing} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary/10 border border-primary/20 text-xs font-semibold hover:bg-primary/20 transition-colors text-primary disabled:opacity-50">
                    {sharingToStory ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookOpen className="w-3.5 h-3.5" />} Story
                  </button>
                  <button onClick={handleCopy} disabled={capturing} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-muted/50 border border-border/20 text-xs font-semibold hover:bg-muted transition-colors disabled:opacity-50">
                    <Copy className="w-3.5 h-3.5" /> Copy
                  </button>
                  <button onClick={handleDownload} disabled={capturing || !screenshot} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-muted/50 border border-border/20 text-xs font-semibold hover:bg-muted transition-colors disabled:opacity-50">
                    <Download className="w-3.5 h-3.5" /> Save
                  </button>
                  <button onClick={handleTwitter} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-muted/50 border border-border/20 text-xs font-semibold hover:bg-muted transition-colors">
                    <Twitter className="w-3.5 h-3.5" /> Twitter
                  </button>
                  <button onClick={handleWhatsApp} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-muted/50 border border-border/20 text-xs font-semibold hover:bg-muted transition-colors">
                    <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                  </button>
                  <button onClick={handleTelegram} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-muted/50 border border-border/20 text-xs font-semibold hover:bg-muted transition-colors">
                    <Send className="w-3.5 h-3.5" /> Telegram
                  </button>
                </div>
              </div>

              {/* Sticky footer: native share */}
              {typeof navigator !== "undefined" && navigator.share && (
                <div className="px-4 py-3 border-t border-border/30 shrink-0" style={{ paddingBottom: "calc(0.75rem + var(--safe-bottom))" }}>
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
      )}

      {/* Story creator */}
      <StoryCreator
        open={storyCreatorOpen}
        onClose={() => {
          setStoryCreatorOpen(false);
          onOpenChange(false);
        }}
        preContent={storyText}
        preImageUrl={storyImageUrl || undefined}
      />
    </>
  );
};

export default RankShareModal;
