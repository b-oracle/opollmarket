import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Copy, Share2, BookOpen, Camera } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import SocialIcon from "@/components/SocialIcon";
import StoryCreator from "@/components/social/StoryCreator";

interface SpaceShareSheetProps {
  open: boolean;
  onClose: () => void;
  spaceId: string;
  spaceTitle: string;
  hostName: string;
  isLive: boolean;
  scheduledAt?: string;
}

const SpaceShareSheet = ({ open, onClose, spaceId, spaceTitle, hostName, isLive, scheduledAt }: SpaceShareSheetProps) => {
  const { user } = useAuth();
  const [posting, setPosting] = useState(false);
  const [storyOpen, setStoryOpen] = useState(false);

  const shareOrigin = typeof window !== "undefined" ? window.location.origin : "https://opoll.org";
  const shareUrl = `${shareOrigin}/feed?space=${spaceId}&ref=${encodeURIComponent(hostName)}`;

  const formattedTime = scheduledAt
    ? format(new Date(scheduledAt), "MMM d, yyyy 'at' h:mm a")
    : format(new Date(), "MMM d, yyyy 'at' h:mm a");

  const shareText = isLive
    ? `🎙️ Join me LIVE on "${spaceTitle}" — ${formattedTime} — Let's discuss your OPinion, JOIN NOW 👇🏽`
    : `🗓️ Set your reminder for my upcoming space "${spaceTitle}" on ${formattedTime} on OPollmarket — Let's discuss your OPinion, JOIN NOW 👇🏽`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      toast.success("Link copied!");
    } catch {
      toast.error("Failed to copy");
    }
    onClose();
  };

  const handlePostToTimeline = async () => {
    if (!user) { toast.error("Sign in to post"); return; }
    setPosting(true);
    try {
      const content = `${shareText}\n${shareUrl}`;
      await supabase.from("status_updates").insert({
        user_id: user.id,
        content,
      });
      toast.success("Posted to your timeline! 🎙️");
      onClose();
    } catch {
      toast.error("Failed to post");
    } finally {
      setPosting(false);
    }
  };

  const handleShareExternal = (platform: string) => {
    const encoded = encodeURIComponent(shareText);
    const encodedUrl = encodeURIComponent(shareUrl);
    let url = "";
    switch (platform) {
      case "twitter":
        url = `https://twitter.com/intent/tweet?text=${encoded}&url=${encodedUrl}`;
        break;
      case "whatsapp":
        url = `https://wa.me/?text=${encoded}%20${encodedUrl}`;
        break;
      case "telegram":
        url = `https://t.me/share/url?url=${encodedUrl}&text=${encoded}`;
        break;
      case "facebook":
        url = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encoded}`;
        break;
    }
    if (url) window.open(url, "_blank");
    onClose();
  };

  const handleStory = () => {
    onClose();
    setStoryOpen(true);
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="share-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-[100]"
              onClick={onClose}
            />
            <motion.div
              key="share-sheet"
              initial={{ y: 300, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 300, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed z-[101] bg-card border border-border p-5 space-y-4 max-h-[70vh] overflow-y-auto bottom-0 inset-x-0 rounded-t-2xl border-t lg:bottom-auto lg:inset-0 lg:m-auto lg:w-full lg:max-w-md lg:h-fit lg:rounded-2xl"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">Share Space</h3>
                <button onClick={onClose} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Post to timeline */}
              <button
                onClick={handlePostToTimeline}
                disabled={posting}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
              >
                <BookOpen className="w-5 h-5" />
                <span className="text-sm font-medium">Post to Timeline</span>
              </button>

              {/* Add to Story */}
              <button
                onClick={handleStory}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-muted hover:bg-muted/80 text-foreground transition-colors"
              >
                <Camera className="w-5 h-5" />
                <span className="text-sm font-medium">Share to Story</span>
              </button>

              {/* External shares */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { id: "twitter", label: "X" },
                  { id: "whatsapp", label: "WhatsApp" },
                  { id: "telegram", label: "Telegram" },
                  { id: "facebook", label: "Facebook" },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleShareExternal(p.id)}
                    className="flex flex-col items-center gap-1.5 py-2 rounded-xl hover:bg-muted/50 transition-colors"
                  >
                    <SocialIcon iconKey={p.id} className="w-8 h-8" />
                    <span className="text-[9px] text-muted-foreground">{p.label}</span>
                  </button>
                ))}
              </div>

              {/* Copy link */}
              <button
                onClick={handleCopy}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-muted hover:bg-muted/80 text-foreground transition-colors"
              >
                <Copy className="w-5 h-5" />
                <span className="text-sm font-medium">Copy Link</span>
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <StoryCreator
        open={storyOpen}
        onClose={() => setStoryOpen(false)}
        preContent={`${shareText}\n${shareUrl}`}
      />
    </>
  );
};

export default SpaceShareSheet;
