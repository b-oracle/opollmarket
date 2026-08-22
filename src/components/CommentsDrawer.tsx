import { resolveAvatarUrl } from "@/lib/avatarUrl";
import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getAvatarInitials } from "@/lib/utils";
import BottomSheet from "@/components/BottomSheet";
import { X, Send, ChevronDown, Heart, CornerDownRight, Loader2, Pencil, Trash2, Check } from "lucide-react";
import NftBadge, { type VerificationLevel } from "@/components/NftBadge";
import { supabase } from "@/integrations/supabase/client";

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
  avatar_url?: string | null;
  verification_level?: VerificationLevel;
}

interface CommentsDrawerProps {
  open: boolean;
  onClose: () => void;
  marketId: string;
  marketTitle: string;
  /** When true, hides the composer and blocks posting (e.g. market closed). */
  disabled?: boolean;
  disabledLabel?: string;
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

// Module-level cache for prefetched comment threads. Keyed by `${marketId}|${identityId}`
// so per-user "liked" state is correct. TTL keeps stale data from sticking around.
const PRIMED_COMMENTS_CACHE = new Map<string, { topLevel: Comment[]; ts: number }>();
const PRIMED_TTL_MS = 15_000;

const loadCommentsThread = async (marketId: string, identityId: string): Promise<Comment[]> => {
  const { data: allComments, error } = await supabase
    .from("comments")
    .select("*")
    .eq("market_id", marketId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  let likedIds = new Set<string>();
  if (identityId) {
    const { data: userLikes } = await supabase
      .from("comment_likes")
      .select("comment_id")
      .eq("wallet_address", identityId);
    likedIds = new Set(userLikes?.map((l) => l.comment_id) || []);
  }

  const authorIds = [...new Set((allComments || []).map((c) => c.author_wallet).filter(Boolean))] as string[];
  const profileMap = new Map<string, { avatar_url: string | null; verification_level: string }>();
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, avatar_url, verification_level")
      .in("id", authorIds);
    for (const p of profiles || []) {
      profileMap.set(p.id, { avatar_url: p.avatar_url, verification_level: p.verification_level });
    }
  }

  const commentMap = new Map<string, Comment>();
  const topLevel: Comment[] = [];
  for (const c of allComments || []) {
    const profile = c.author_wallet ? profileMap.get(c.author_wallet) : null;
    commentMap.set(c.id, {
      ...c,
      liked: likedIds.has(c.id),
      replies: [],
      avatar_url: profile?.avatar_url || null,
      verification_level: (profile?.verification_level || "none") as VerificationLevel,
    });
  }
  for (const c of allComments || []) {
    const comment = commentMap.get(c.id)!;
    if (c.parent_id && commentMap.has(c.parent_id)) {
      commentMap.get(c.parent_id)!.replies!.push(comment);
    } else if (!c.parent_id) {
      topLevel.push(comment);
    }
  }
  for (const c of commentMap.values()) {
    c.replies?.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }
  return topLevel;
};

/**
 * Prefetch and cache the comments thread for a market so that when the user
 * subsequently opens the drawer it renders instantly without a loading spinner.
 * Safe to call repeatedly — fire-and-forget.
 */
export const primeMarketCommentsCache = async (marketId: string, identityId = "") => {
  if (!marketId) return;
  try {
    const topLevel = await loadCommentsThread(marketId, identityId);
    PRIMED_COMMENTS_CACHE.set(`${marketId}|${identityId}`, { topLevel, ts: Date.now() });
  } catch (e) {
    // best-effort prefetch; ignore failures
  }
};

const CommentItem = ({
  comment,
  isReply = false,
  onReply,
  onLike,
  onEdit,
  onDelete,
  currentUserId,
}: {
  comment: Comment;
  isReply?: boolean;
  onReply: (commentId: string, author: string) => void;
  onLike: (commentId: string, liked: boolean) => void;
  onEdit: (commentId: string, newContent: string) => void;
  onDelete: (commentId: string) => void;
  currentUserId: string;
}) => {
  const [showReplies, setShowReplies] = useState(!isReply);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.content);
  const isOwner = !!currentUserId && comment.author_wallet === currentUserId;
  const replies = comment.replies || [];

  const handleSaveEdit = () => {
    const trimmed = editText.trim();
    if (!trimmed || trimmed === comment.content) { setEditing(false); return; }
    onEdit(comment.id, trimmed);
    setEditing(false);
  };

  return (
    <div className={`${isReply ? "ml-8 border-l border-border/30 pl-3" : ""}`}>
      <div className="flex gap-2.5 py-2.5">
        <div className="relative shrink-0">
          <div className="w-8 h-8 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center overflow-hidden">
            {comment.avatar_url ? (
              <img src={resolveAvatarUrl(comment.avatar_url)} alt={comment.author_name} className="w-full h-full object-cover" />
            ) : (
                <span className="text-xs font-bold text-primary">
                  {getAvatarInitials(comment.author_name)}
                </span>
            )}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 mb-0.5">
            <span className="text-xs font-semibold">@{comment.author_name}</span>
            {comment.verification_level && comment.verification_level !== "none" && (
              <NftBadge level={comment.verification_level} size={14} />
            )}
            <span className="text-[10px] text-muted-foreground">{formatTimeAgo(comment.created_at)}</span>
          </div>
          {editing ? (
            <div className="flex items-center gap-1.5 mt-1">
              <input
                type="text"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveEdit()}
                className="flex-1 text-sm bg-muted/50 border border-border rounded-md px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                autoFocus
              />
              <button onClick={handleSaveEdit} className="p-1 text-primary hover:text-primary/80"><Check className="w-3.5 h-3.5" /></button>
              <button onClick={() => { setEditing(false); setEditText(comment.content); }} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <p className="text-sm text-foreground/90 leading-relaxed break-words">{comment.content}</p>
          )}
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
            {isOwner && !editing && (
              <>
                <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors">
                  <Pencil className="w-3 h-3" /> Edit
                </button>
                <button onClick={() => onDelete(comment.id)} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              </>
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
                onEdit={onEdit}
                onDelete={onDelete}
                currentUserId={currentUserId}
              />
            ))}
        </div>
      )}
    </div>
  );
};

const CommentsDrawer = ({ open, onClose, marketId, marketTitle, disabled = false, disabledLabel = "Comments are disabled while the market is closed" }: CommentsDrawerProps) => {
  
  const { user, displayName } = useAuth();
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

  // Fetch current user's avatar
  const [currentUserAvatar, setCurrentUserAvatar] = useState<string | null>(null);
  useEffect(() => {
    if (!user?.id) return;
    supabase.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle().then(({ data }) => {
      setCurrentUserAvatar(data?.avatar_url || null);
    });
  }, [user?.id]);

  // Seed initial state from any prefetched cache so the drawer renders instantly.
  useEffect(() => {
    const cached = PRIMED_COMMENTS_CACHE.get(`${marketId}|${identityId}`);
    if (cached && Date.now() - cached.ts < PRIMED_TTL_MS) {
      setComments(cached.topLevel);
    }
  }, [marketId, identityId]);

  const fetchComments = useCallback(async () => {
    // If we have a fresh primed cache, paint it immediately and skip the spinner.
    const cached = PRIMED_COMMENTS_CACHE.get(`${marketId}|${identityId}`);
    const hasFreshCache = cached && Date.now() - cached.ts < PRIMED_TTL_MS;
    if (hasFreshCache) {
      setComments(cached!.topLevel);
    } else {
      setLoading(true);
    }
    try {
      const topLevel = await loadCommentsThread(marketId, identityId);
      setComments(topLevel);
      PRIMED_COMMENTS_CACHE.set(`${marketId}|${identityId}`, { topLevel, ts: Date.now() });
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
    if (disabled) { toast.error(disabledLabel); return; }
    if (!user) {
      toast.error("Sign in to comment", {
        action: { label: "Sign In", onClick: () => window.location.href = "/auth" },
      });
      return;
    }
    if (!checkCommentLimit()) {
      toast.error("Slow down! Wait a moment before commenting again.");
      return;
    }
    // Strip @mention prefix if replying
    const cleanText = replyTo ? text.replace(new RegExp(`^@${replyTo.author}\\s*`), "").trim() || text : text;

    setSubmitting(true);
    try {
      const authorName = displayName || "Anonymous";

      // Insert comment immediately for instant feedback
      const { data: inserted, error } = await supabase.from("comments").insert({
        market_id: marketId,
        parent_id: replyTo?.id || null,
        author_name: authorName,
        author_wallet: user.id,
        content: cleanText,
      }).select("id").single();

      if (error) throw error;

      setInputValue("");
      setReplyTo(null);

      if (!replyTo && scrollRef.current) {
        scrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
      }

      // Run AI moderation asynchronously — delete if flagged
      const commentId = inserted.id;
      supabase.functions.invoke("moderate-comment", {
        body: { content: cleanText },
      }).then(({ data: modData }) => {
        if (modData?.flagged) {
          supabase.from("comments").delete().eq("id", commentId).then(() => {
            supabase.from("moderation_logs").insert({
              content_type: "comment",
              content_id: marketId,
              user_id: user!.id,
              flagged_content: cleanText,
              reason: modData.reason || "Flagged by AI",
              category: "profanity",
            });
            toast.error("Comment removed", {
              description: modData.reason || "Your comment contained inappropriate content.",
              duration: 6000,
            });
            fetchComments();
          });
        }
      }).catch(() => {
        // Moderation failed silently — comment stays
      });
    } catch (err) {
      console.error("Failed to post comment:", err);
      toast.error("Failed to post comment. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLike = async (commentId: string, alreadyLiked: boolean) => {
    if (!user) {
      toast.error("Sign in to like comments", {
        action: { label: "Sign In", onClick: () => window.location.href = "/auth" },
      });
      return;
    }
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
    if (!user) {
      toast.error("Sign in to reply to comments", {
        action: { label: "Sign In", onClick: () => window.location.href = "/auth" },
      });
      return;
    }
    setReplyTo({ id: commentId, author });
    setInputValue(`@${author} `);
  };

  const handleEdit = async (commentId: string, newContent: string) => {
    try {
      const { error } = await supabase.from("comments").update({ content: newContent }).eq("id", commentId);
      if (error) throw error;
      const updateContent = (arr: Comment[]): Comment[] =>
        arr.map((c) => ({
          ...c,
          content: c.id === commentId ? newContent : c.content,
          replies: updateContent(c.replies || []),
        }));
      setComments(updateContent);
      toast.success("Comment updated");
    } catch { toast.error("Failed to update comment"); }
  };

  const handleDelete = async (commentId: string) => {
    try {
      const { error } = await supabase.from("comments").delete().eq("id", commentId);
      if (error) throw error;
      const removeComment = (arr: Comment[]): Comment[] =>
        arr.filter((c) => c.id !== commentId).map((c) => ({ ...c, replies: removeComment(c.replies || []) }));
      setComments(removeComment);
      toast.success("Comment deleted");
    } catch { toast.error("Failed to delete comment"); }
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
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-2" style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y", overscrollBehavior: "contain", willChange: "scroll-position" } as React.CSSProperties}>
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
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        currentUserId={identityId}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="border-t border-border/30 px-4 py-3" style={{ paddingBottom: "max(0.75rem, var(--safe-bottom))" }}>
                {disabled ? (
                  <div className="text-center text-xs font-semibold text-muted-foreground bg-muted/40 border border-border rounded-lg py-2 px-3">
                    {disabledLabel}
                  </div>
                ) : (<>
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
                  <div className="w-8 h-8 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0 overflow-hidden">
                    {currentUserAvatar ? (
                      <img src={currentUserAvatar} alt={displayName} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs font-bold text-primary">
                        {getAvatarInitials(displayName)}
                      </span>
                    )}
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
                </>)}
              </div>
            </div>
    </BottomSheet>
  );
};

export default CommentsDrawer;
