import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Send, Trash2, Heart, CornerDownRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import NftBadge, { type VerificationLevel } from "@/components/NftBadge";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface StatusCommentsProps {
  statusId: string;
}

interface Comment {
  id: string;
  status_id: string;
  user_id: string;
  content: string;
  created_at: string;
  parent_id: string | null;
  likes_count: number;
}

const StatusComments = ({ statusId }: StatusCommentsProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ["status-comments", statusId],
    queryFn: async () => {
      const { data } = await supabase
        .from("status_comments")
        .select("*")
        .eq("status_id", statusId)
        .order("created_at", { ascending: true })
        .limit(100);
      return (data || []) as Comment[];
    },
  });

  const authorIds = [...new Set(comments.map((c) => c.user_id))];
  const { data: profileMap = new Map() } = useQuery({
    queryKey: ["status-comment-profiles", authorIds.join(",")],
    queryFn: async () => {
      if (authorIds.length === 0) return new Map();
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, verification_level")
        .in("id", authorIds.slice(0, 50));
      return new Map((data || []).map((p: any) => [p.id, p]));
    },
    enabled: authorIds.length > 0,
  });

  // Fetch user's liked comment IDs
  const { data: likedIds = new Set() } = useQuery({
    queryKey: ["status-comment-likes", statusId, user?.id],
    queryFn: async () => {
      if (!user) return new Set<string>();
      const commentIds = comments.map((c) => c.id);
      if (commentIds.length === 0) return new Set<string>();
      const { data } = await supabase
        .from("status_comment_likes")
        .select("comment_id")
        .eq("user_id", user.id)
        .in("comment_id", commentIds);
      return new Set((data || []).map((d: any) => d.comment_id));
    },
    enabled: !!user && comments.length > 0,
  });

  const handleSubmit = async () => {
    if (!user || !text.trim()) return;
    setSubmitting(true);
    try {
      const payload: any = {
        status_id: statusId,
        user_id: user.id,
        content: text.trim(),
      };
      if (replyTo) payload.parent_id = replyTo.id;
      const { error } = await supabase.from("status_comments").insert(payload);
      if (error) throw error;
      setText("");
      setReplyTo(null);
      queryClient.invalidateQueries({ queryKey: ["status-comments", statusId] });
      queryClient.invalidateQueries({ queryKey: ["status-feed"] });
    } catch {
      toast.error("Failed to post comment");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    const { error } = await supabase.from("status_comments").delete().eq("id", commentId);
    if (error) { toast.error("Failed to delete"); return; }
    queryClient.invalidateQueries({ queryKey: ["status-comments", statusId] });
    queryClient.invalidateQueries({ queryKey: ["status-feed"] });
  };

  const handleLike = async (commentId: string) => {
    if (!user) { toast.error("Sign in to like"); return; }
    const isLiked = (likedIds as Set<string>).has(commentId);
    try {
      if (isLiked) {
        await supabase.from("status_comment_likes").delete().eq("comment_id", commentId).eq("user_id", user.id);
      } else {
        await supabase.from("status_comment_likes").insert({ comment_id: commentId, user_id: user.id });
      }
      queryClient.invalidateQueries({ queryKey: ["status-comment-likes", statusId] });
      queryClient.invalidateQueries({ queryKey: ["status-comments", statusId] });
    } catch {
      toast.error("Failed");
    }
  };

  // Build threaded structure: top-level + replies grouped by parent_id
  const topLevel = comments.filter((c) => !c.parent_id);
  const repliesMap = new Map<string, Comment[]>();
  comments.forEach((c) => {
    if (c.parent_id) {
      const arr = repliesMap.get(c.parent_id) || [];
      arr.push(c);
      repliesMap.set(c.parent_id, arr);
    }
  });

  const renderComment = (c: Comment, isReply = false, i = 0) => {
    const prof = (profileMap as Map<string, any>).get(c.user_id);
    const name = prof?.display_name || "Anonymous";
    const vLevel = (prof?.verification_level || "none") as VerificationLevel;
    const liked = (likedIds as Set<string>).has(c.id);
    const replies = repliesMap.get(c.id) || [];

    return (
      <div key={c.id} className={isReply ? "ml-6" : ""}>
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.02 }}
          className="flex gap-2 group"
        >
          <div
            className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 overflow-hidden flex items-center justify-center shrink-0 cursor-pointer"
            onClick={() => navigate(`/user/${c.user_id}`)}
          >
            {prof?.avatar_url ? (
              <img src={prof.avatar_url} alt={name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-[10px] font-bold text-primary">{name.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="bg-muted/50 rounded-lg px-2.5 py-1.5">
              <span
                className="text-[11px] font-semibold cursor-pointer hover:underline inline-flex items-center gap-0.5"
                onClick={() => navigate(`/user/${c.user_id}`)}
              >
                {name}
                {vLevel !== "none" && <NftBadge level={vLevel} size={11} />}
              </span>
              {isReply && c.parent_id && (
                <span className="text-[10px] text-muted-foreground ml-1">
                  <CornerDownRight className="w-2.5 h-2.5 inline mr-0.5" />
                  reply
                </span>
              )}
              <p className="text-xs whitespace-pre-wrap break-words">{c.content}</p>
            </div>
            <div className="flex items-center gap-3 mt-0.5 px-1">
              <p className="text-[9px] text-muted-foreground">
                {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
              </p>
              <button
                onClick={() => handleLike(c.id)}
                className={`flex items-center gap-0.5 text-[10px] transition-colors ${liked ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
              >
                <Heart className={`w-3 h-3 ${liked ? "fill-current" : ""}`} />
                {c.likes_count > 0 && c.likes_count}
              </button>
              {user && !isReply && (
                <button
                  onClick={() => setReplyTo({ id: c.id, name })}
                  className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
                >
                  Reply
                </button>
              )}
            </div>
          </div>
          {user?.id === c.user_id && (
            <button
              onClick={() => handleDelete(c.id)}
              className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </motion.div>

        {/* Render replies */}
        {replies.length > 0 && (
          <div className="space-y-1.5 mt-1.5">
            {replies.map((r, ri) => renderComment(r, true, ri))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2 pt-1">
      {isLoading ? (
        <div className="flex justify-center py-3">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        topLevel.map((c, i) => renderComment(c, false, i))
      )}

      {/* Reply indicator */}
      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-1 text-[10px] text-muted-foreground px-1"
          >
            <CornerDownRight className="w-3 h-3" />
            Replying to <span className="font-semibold text-foreground">{replyTo.name}</span>
            <button onClick={() => setReplyTo(null)} className="ml-1 text-destructive hover:underline">Cancel</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Comment input */}
      {user && (
        <div className="flex gap-2 items-center pt-1">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSubmit()}
            placeholder={replyTo ? `Reply to ${replyTo.name}...` : "Write a comment..."}
            maxLength={280}
            className="flex-1 bg-muted/50 border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          <button
            onClick={handleSubmit}
            disabled={submitting || !text.trim()}
            className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40"
          >
            {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
          </button>
        </div>
      )}
    </div>
  );
};

export default StatusComments;
