import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import BottomSheet from "@/components/BottomSheet";
import { X, Send, ChevronDown, Heart, CornerDownRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "wagmi";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useRateLimit } from "@/hooks/useRateLimit";

interface Comment {
  id: string;
  market_id: string;
  parent_id: string | null;
  author_name: string;
  author_wallet: string | null;
  content: string;
  likes_count: number;
  created_at: string;
  liked?: boolean;
  replies?: Comment[];
}

interface CommentsDrawerProps {
  open: boolean;
  onClose: () => void;
  marketId: string;
  marketTitle: string;
}

const formatTimeAgo = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
};

const CommentItem = ({
  comment,
  isReply = false,
  onReply,
  onLike,
}: {
  comment: Comment;
  isReply?: boolean;
  onReply: (commentId: string, author: string) => void;
  onLike: (commentId: string, liked: boolean) => void;
}) => {
  const [showReplies, setShowReplies] = useState(!isReply);
  const replies = comment.replies || [];

  return (
    <div className={`${isReply ? "ml-8 border-l border-border/30 pl-3" : ""}`}>
      <div className="flex gap-2.5 py-2.5">
        <div className="w-8 h-8 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
          <span className="text-xs font-bold text-primary">
            {comment.author_name.charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-semibold">@{comment.author_name}</span>
            <span className="text-[10px] text-muted-foreground">{formatTimeAgo(comment.created_at)}</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed break-words">{comment.content}</p>
          <div className="flex items-center gap-4 mt-1.5">
            <button
              onClick={() => onLike(comment.id, !!comment.liked)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive transition-colors"
            >
              <Heart className={`w-3 h-3 ${comment.liked ? "text-destructive fill-destructive" : ""}`} />
              {comment.likes_count}
            </button>
            {!isReply && (
              <button
                onClick={() => onReply(comment.id, comment.author_name)}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
              >
                <CornerDownRight className="w-3 h-3" />
                Reply
              </button>
            )}
          </div>
        </div>
      </div>

      {replies.length > 0 && (
        <div>
          {replies.length > 1 && (
            <button
              onClick={() => setShowReplies(!showReplies)}
              className="flex items-center gap-1 ml-10 text-[10px] text-primary font-semibold py-1"
            >
              <ChevronDown className={`w-3 h-3 transition-transform ${showReplies ? "rotate-180" : ""}`} />
              {showReplies ? "Hide" : "View"} {replies.length} replies
            </button>
          )}
          {showReplies &&
            replies.map((reply) => (
              <CommentItem
                key={reply.id}
                comment={reply}
                isReply
                onReply={onReply}
                onLike={onLike}
              />
            ))}
        </div>
      )}
    </div>
  );
};

const CommentsDrawer = ({ open, onClose, marketId, marketTitle }: CommentsDrawerProps) => {
  const { address } = useAccount();
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; author: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { checkLimit: checkCommentLimit } = useRateLimit(3, 30000);

  // Use user ID for identity (requires supabase auth)
  const identityId = user?.id || "";
  const isSignedIn = !!user;

  const fetchComments = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all comments for this market
      const { data: allComments, error } = await supabase
        .from("comments")
        .select("*")
        .eq("market_id", marketId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch user's likes
      const { data: userLikes } = await supabase
        .from("comment_likes")
        .select("comment_id")
        .eq("wallet_address", identityId);

      const likedIds = new Set(userLikes?.map((l) => l.comment_id) || []);

      // Build threaded structure
      const commentMap = new Map<string, Comment>();
      const topLevel: Comment[] = [];

      for (const c of allComments || []) {
        const comment: Comment = {
          ...c,
          liked: likedIds.has(c.id),
          replies: [],
        };
        commentMap.set(c.id, comment);
      }

      for (const c of allComments || []) {
        const comment = commentMap.get(c.id)!;
        if (c.parent_id && commentMap.has(c.parent_id)) {
          commentMap.get(c.parent_id)!.replies!.push(comment);
        } else if (!c.parent_id) {
          topLevel.push(comment);
        }
      }

      // Sort replies chronologically
      for (const c of commentMap.values()) {
        c.replies?.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      }

      setComments(topLevel);
    } catch (err) {
      console.error("Failed to fetch comments:", err);
    } finally {
      setLoading(false);
    }
  }, [marketId, identityId]);

  useEffect(() => {
    if (!open) return;
    fetchComments();
    setReplyTo(null);
    setInputValue("");

    // Subscribe to realtime
    const channel = supabase
      .channel(`comments-${marketId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comments", filter: `market_id=eq.${marketId}` },
        () => {
          fetchComments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [open, marketId, fetchComments]);

  useEffect(() => {
    if (replyTo && inputRef.current) {
      inputRef.current.focus();
    }
  }, [replyTo]);

  const totalComments = comments.reduce((acc, c) => acc + 1 + (c.replies?.length || 0), 0);

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || submitting) return;
    if (!checkCommentLimit()) {
      toast.error("Slow down! Wait a moment before commenting again.");
      return;
    }
    // Strip @mention prefix if replying
    const cleanText = replyTo ? text.replace(new RegExp(`^@${replyTo.author}\\s*`), "").trim() || text : text;

    setSubmitting(true);
    try {
      // Derive author name from auth user or wallet
      const authorName = user?.email
        ? user.email.split("@")[0]
        : address
        ? `${address.slice(0, 6)}...${address.slice(-4)}`
        : "Anonymous";

      const { error } = await supabase.from("comments").insert({
        market_id: marketId,
        parent_id: replyTo?.id || null,
        author_name: authorName,
        author_wallet: address || user?.id || null,
        content: cleanText,
      });

      if (error) throw error;

      setInputValue("");
      setReplyTo(null);

      if (!replyTo && scrollRef.current) {
        scrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (err) {
      console.error("Failed to post comment:", err);
      toast.error("Failed to post comment. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLike = async (commentId: string, alreadyLiked: boolean) => {
    try {
      if (alreadyLiked) {
        await supabase
          .from("comment_likes")
          .delete()
          .eq("comment_id", commentId)
          .eq("wallet_address", identityId);
      } else {
        await supabase.from("comment_likes").insert({
          comment_id: commentId,
          wallet_address: identityId,
        });
      }
      // Optimistic update
      const updateLike = (arr: Comment[]): Comment[] =>
        arr.map((c) => ({
          ...c,
          liked: c.id === commentId ? !alreadyLiked : c.liked,
          likes_count: c.id === commentId ? (alreadyLiked ? c.likes_count - 1 : c.likes_count + 1) : c.likes_count,
          replies: updateLike(c.replies || []),
        }));
      setComments(updateLike);
    } catch (err) {
      console.error("Failed to toggle like:", err);
    }
  };

  const handleReply = (commentId: string, author: string) => {
    setReplyTo({ id: commentId, author });
    setInputValue(`@${author} `);
  };

  if (!open) return null;

  return (
    <BottomSheet open={open} onClose={onClose} maxHeight="70dvh">
            <div className="flex flex-col" style={{ maxHeight: "70dvh" }}>
              {/* Handle */}
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto mt-3 mb-2" />

              {/* Header */}
              <div className="flex items-center justify-between px-5 pb-3 border-b border-border/30">
                <div>
                  <h3 className="text-sm font-bold">{totalComments} Comments</h3>
                  <p className="text-[10px] text-muted-foreground truncate max-w-[250px]">{marketTitle}</p>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full glass flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Comments list */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-2">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 text-primary animate-spin" />
                  </div>
                ) : comments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <p className="text-sm">No comments yet</p>
                    <p className="text-xs">Be the first to share your thoughts!</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/20">
                    {comments.map((comment) => (
                      <CommentItem
                        key={comment.id}
                        comment={comment}
                        onReply={handleReply}
                        onLike={handleLike}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="border-t border-border/30 px-4 py-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
                {replyTo && (
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-[10px] text-primary">
                      Replying to @{replyTo.author}
                    </span>
                    <button
                      onClick={() => {
                        setReplyTo(null);
                        setInputValue("");
                      }}
                      className="text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-primary">
                      {user?.email ? user.email.charAt(0).toUpperCase() : address ? address.charAt(2).toUpperCase() : "A"}
                    </span>
                  </div>
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    placeholder={replyTo ? `Reply to @${replyTo.author}...` : "Add a comment..."}
                    className="flex-1 bg-muted/50 border border-border rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    disabled={submitting}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!inputValue.trim() || submitting}
                    className="w-9 h-9 rounded-full bg-primary flex items-center justify-center transition-all active:scale-90 disabled:opacity-40"
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 text-primary-foreground animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 text-primary-foreground" />
                    )}
                  </button>
                </div>
              </div>
            </div>
    </BottomSheet>
  );
};

export default CommentsDrawer;
