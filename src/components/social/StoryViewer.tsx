import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Trash2, Eye } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Story {
  id: string;
  user_id: string;
  content?: string | null;
  image_url?: string | null;
  background_color?: string | null;
  market_id?: string | null;
  expires_at: string;
  created_at: string;
}

interface StoryViewerProps {
  stories: Story[];
  initialIndex?: number;
  profile?: { display_name?: string | null; avatar_url?: string | null } | null;
  onClose: () => void;
}

const StoryViewer = ({ stories: initialStories, initialIndex = 0, profile, onClose }: StoryViewerProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [stories, setStories] = useState(initialStories);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const story = stories[currentIndex];
  const isOwnStory = user?.id === story?.user_id;
  const DURATION = 5000;

  // Fetch market details if story has a market_id
  const { data: market } = useQuery({
    queryKey: ["story-market", story?.market_id],
    queryFn: async () => {
      if (!story?.market_id) return null;
      const { data } = await supabase
        .from("markets")
        .select("id, title, image_url, yes_price, no_price, category")
        .eq("id", story.market_id)
        .maybeSingle();
      return data;
    },
    enabled: !!story?.market_id,
  });

  // Fetch view count for current story (own stories)
  const { data: viewCount = 0 } = useQuery({
    queryKey: ["story-view-count", story?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("story_views")
        .select("*", { count: "exact", head: true })
        .eq("story_id", story!.id);
      return count || 0;
    },
    enabled: !!story && isOwnStory,
    refetchInterval: 10000,
  });

  // Record view
  useEffect(() => {
    if (!user || !story || user.id === story.user_id) return;
    supabase.from("story_views").insert({ story_id: story.id, viewer_id: user.id }).then(() => {
      queryClient.invalidateQueries({ queryKey: ["story-views"] });
    });
  }, [story?.id, user?.id]);

  // Auto-advance timer — pause during delete confirmation
  useEffect(() => {
    if (showDeleteConfirm) return;
    setProgress(0);
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          if (currentIndex < stories.length - 1) {
            setCurrentIndex((i) => i + 1);
            return 0;
          } else {
            onClose();
            return 100;
          }
        }
        return p + (100 / (DURATION / 50));
      });
    }, 50);
    return () => clearInterval(interval);
  }, [currentIndex, stories.length, showDeleteConfirm]);

  const goNext = useCallback(() => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex((i) => i + 1);
      setProgress(0);
    } else {
      onClose();
    }
  }, [currentIndex, stories.length]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setProgress(0);
    }
  }, [currentIndex]);

  const handleDelete = async () => {
    if (!story || !user) return;
    setDeleting(true);
    try {
      // Delete image from storage if present
      if (story.image_url) {
        const urlParts = story.image_url.split("/social-media/");
        if (urlParts[1]) {
          await supabase.storage.from("social-media").remove([urlParts[1]]);
        }
      }
      const { error } = await supabase
        .from("stories")
        .delete()
        .eq("id", story.id)
        .eq("user_id", user.id);
      if (error) throw error;

      toast.success("Story deleted");
      queryClient.invalidateQueries({ queryKey: ["stories"] });

      // Remove from local list and advance
      const remaining = stories.filter((s) => s.id !== story.id);
      if (remaining.length === 0) {
        onClose();
      } else {
        setStories(remaining);
        setCurrentIndex(Math.min(currentIndex, remaining.length - 1));
        setProgress(0);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to delete story");
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (!story) return null;

  const name = profile?.display_name || "Anonymous";
  const timeAgo = formatDistanceToNow(new Date(story.created_at), { addSuffix: true });

  const content = (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black flex items-center justify-center"
      >
        {/* Progress bars */}
        <div className="absolute top-3 left-3 right-3 z-20 flex gap-1">
          {stories.map((_, i) => (
            <div key={i} className="flex-1 h-0.5 rounded-full bg-white/20 overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all"
                style={{
                  width: i < currentIndex ? "100%" : i === currentIndex ? `${progress}%` : "0%",
                }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute top-6 left-3 right-3 z-20 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-white/20 overflow-hidden flex items-center justify-center">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt={name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs font-bold text-white">{name.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-semibold truncate">{name}</p>
            <p className="text-white/50 text-[9px]">{timeAgo}</p>
          </div>
          {isOwnStory && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10">
              <Eye className="w-3.5 h-3.5 text-white/70" />
              <span className="text-white/70 text-[10px] font-semibold">{viewCount}</span>
            </div>
          )}
          {isOwnStory && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
            >
              <Trash2 className="w-4 h-4 text-destructive" />
            </button>
          )}
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Story content */}
        <div
          className="w-full h-full flex items-center justify-center"
          style={{ backgroundColor: story.image_url ? "#000" : (story.background_color || "#1a1a2e") }}
        >
          {story.image_url && (
            <img src={story.image_url} alt="" className="w-full h-full object-contain" />
          )}
          {story.content && (
            <p
              className="absolute text-white text-center text-lg font-bold px-8 max-w-sm"
              style={{ textShadow: "0 2px 8px rgba(0,0,0,0.7)" }}
            >
              {story.content}
            </p>
          )}
        </div>

        {/* Market card overlay */}
        {market && (
          <button
            onClick={() => { onClose(); navigate(`/market/${market.id}`); }}
            className="absolute bottom-16 left-4 right-4 z-20 bg-black/60 backdrop-blur-md rounded-xl p-3 flex items-center gap-3 border border-white/10"
          >
            {market.image_url && (
              <img src={market.image_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
            )}
            <div className="flex-1 min-w-0 text-left">
              <p className="text-white text-xs font-semibold truncate">{market.title}</p>
              <div className="flex gap-2 mt-1">
                <span className="text-emerald-400 text-[10px] font-bold">Yes {Math.round(Number(market.yes_price) * 100)}¢</span>
                <span className="text-red-400 text-[10px] font-bold">No {Math.round(Number(market.no_price) * 100)}¢</span>
              </div>
            </div>
            <span className="text-white/50 text-[9px] shrink-0">View →</span>
          </button>
        )}

        {/* Tap zones */}
        <div className="absolute inset-0 z-10 flex">
          <div className="w-1/3 h-full cursor-pointer" onClick={goPrev} />
          <div className="w-1/3 h-full" />
          <div className="w-1/3 h-full cursor-pointer" onClick={goNext} />
        </div>
      </motion.div>

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="z-[90]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Story</AlertDialogTitle>
            <AlertDialogDescription>
              This story will be permanently deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AnimatePresence>
  );

  if (typeof document === "undefined") return content;

  return createPortal(content, document.body);
};

export default StoryViewer;
