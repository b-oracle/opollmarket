import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { X, Eye, ChevronLeft, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Story {
  id: string;
  user_id: string;
  content?: string | null;
  image_url?: string | null;
  background_color?: string | null;
  expires_at: string;
  created_at: string;
}

interface StoryViewerProps {
  stories: Story[];
  initialIndex?: number;
  profile?: { display_name?: string | null; avatar_url?: string | null } | null;
  onClose: () => void;
}

const StoryViewer = ({ stories, initialIndex = 0, profile, onClose }: StoryViewerProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);

  const story = stories[currentIndex];
  const DURATION = 5000; // 5 seconds per story

  // Record view
  useEffect(() => {
    if (!user || !story || user.id === story.user_id) return;
    supabase.from("story_views").insert({ story_id: story.id, viewer_id: user.id }).then(() => {
      queryClient.invalidateQueries({ queryKey: ["story-views"] });
    });
  }, [story?.id, user?.id]);

  // Auto-advance timer
  useEffect(() => {
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
  }, [currentIndex, stories.length]);

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

  if (!story) return null;

  const name = profile?.display_name || "Anonymous";
  const timeAgo = formatDistanceToNow(new Date(story.created_at), { addSuffix: true });

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[80] bg-black flex items-center justify-center"
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

        {/* Tap zones */}
        <div className="absolute inset-0 z-10 flex">
          <div className="w-1/3 h-full cursor-pointer" onClick={goPrev} />
          <div className="w-1/3 h-full" />
          <div className="w-1/3 h-full cursor-pointer" onClick={goNext} />
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default StoryViewer;
