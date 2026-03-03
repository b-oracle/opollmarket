import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, ChevronDown, Heart, CornerDownRight } from "lucide-react";

interface Comment {
  id: string;
  author: string;
  avatar: string;
  text: string;
  timestamp: Date;
  likes: number;
  liked: boolean;
  replies: Comment[];
}

interface CommentsDrawerProps {
  open: boolean;
  onClose: () => void;
  marketId: string;
  marketTitle: string;
}

// Seed deterministic mock comments per market
const generateMockComments = (marketId: string): Comment[] => {
  const seed = parseInt(marketId, 10) || 1;
  const comments: Comment[] = [
    {
      id: `${marketId}-c1`,
      author: "CryptoWhale",
      avatar: "C",
      text: "This is going to be a huge market. I'm all in on YES!",
      timestamp: new Date(Date.now() - 3600000 * 2),
      likes: 24,
      liked: false,
      replies: [
        {
          id: `${marketId}-c1r1`,
          author: "BearishTrader",
          avatar: "B",
          text: "Careful, the odds are priced in already. Don't FOMO.",
          timestamp: new Date(Date.now() - 3600000),
          likes: 8,
          liked: false,
          replies: [],
        },
        {
          id: `${marketId}-c1r2`,
          author: "DataNerd",
          avatar: "D",
          text: "Historical data supports the YES side here. Check the resolution source.",
          timestamp: new Date(Date.now() - 1800000),
          likes: 12,
          liked: false,
          replies: [],
        },
      ],
    },
    {
      id: `${marketId}-c2`,
      author: "MarketMaker",
      avatar: "M",
      text: "Interesting odds. The volume is picking up fast.",
      timestamp: new Date(Date.now() - 7200000),
      likes: 15,
      liked: false,
      replies: [
        {
          id: `${marketId}-c2r1`,
          author: "NewTrader",
          avatar: "N",
          text: "What does volume mean for the odds?",
          timestamp: new Date(Date.now() - 5400000),
          likes: 3,
          liked: false,
          replies: [],
        },
      ],
    },
    {
      id: `${marketId}-c3`,
      author: "AlphaSeeker",
      avatar: "A",
      text: "I've been tracking this for weeks. The fundamentals are solid. 🚀",
      timestamp: new Date(Date.now() - 86400000),
      likes: 31,
      liked: false,
      replies: [],
    },
  ];
  // Vary slightly by market
  if (seed % 2 === 0) {
    comments.push({
      id: `${marketId}-c4`,
      author: "SkepticalSam",
      avatar: "S",
      text: "Everyone's too bullish. Contrarian play could be profitable here.",
      timestamp: new Date(Date.now() - 43200000),
      likes: 9,
      liked: false,
      replies: [],
    });
  }
  return comments;
};

const formatTimeAgo = (date: Date) => {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
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
  onLike: (commentId: string) => void;
}) => {
  const [showReplies, setShowReplies] = useState(!isReply);

  return (
    <div className={`${isReply ? "ml-8 border-l border-border/30 pl-3" : ""}`}>
      <div className="flex gap-2.5 py-2.5">
        <div className="w-8 h-8 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
          <span className="text-xs font-bold text-primary">{comment.avatar}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-semibold">@{comment.author}</span>
            <span className="text-[10px] text-muted-foreground">{formatTimeAgo(comment.timestamp)}</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">{comment.text}</p>
          <div className="flex items-center gap-4 mt-1.5">
            <button
              onClick={() => onLike(comment.id)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive transition-colors"
            >
              <Heart className={`w-3 h-3 ${comment.liked ? "text-destructive fill-destructive" : ""}`} />
              {comment.likes}
            </button>
            <button
              onClick={() => onReply(comment.id, comment.author)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
            >
              <CornerDownRight className="w-3 h-3" />
              Reply
            </button>
          </div>
        </div>
      </div>

      {/* Replies */}
      {comment.replies.length > 0 && (
        <div>
          {!isReply && comment.replies.length > 1 && (
            <button
              onClick={() => setShowReplies(!showReplies)}
              className="flex items-center gap-1 ml-10 text-[10px] text-primary font-semibold py-1"
            >
              <ChevronDown className={`w-3 h-3 transition-transform ${showReplies ? "rotate-180" : ""}`} />
              {showReplies ? "Hide" : "View"} {comment.replies.length} replies
            </button>
          )}
          {showReplies &&
            comment.replies.map((reply) => (
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
  const [comments, setComments] = useState<Comment[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; author: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setComments(generateMockComments(marketId));
      setReplyTo(null);
      setInputValue("");
    }
  }, [open, marketId]);

  useEffect(() => {
    if (replyTo && inputRef.current) {
      inputRef.current.focus();
    }
  }, [replyTo]);

  const totalComments = comments.reduce((acc, c) => acc + 1 + c.replies.length, 0);

  const handleSend = () => {
    const text = inputValue.trim();
    if (!text) return;

    const newComment: Comment = {
      id: `${marketId}-new-${Date.now()}`,
      author: "You",
      avatar: "Y",
      text,
      timestamp: new Date(),
      likes: 0,
      liked: false,
      replies: [],
    };

    if (replyTo) {
      setComments((prev) =>
        prev.map((c) => {
          if (c.id === replyTo.id) {
            return { ...c, replies: [...c.replies, newComment] };
          }
          // Check nested replies
          const updatedReplies = c.replies.map((r) =>
            r.id === replyTo.id ? c : r
          );
          if (c.replies.some((r) => r.id === replyTo.id)) {
            return { ...c, replies: [...c.replies, newComment] };
          }
          return c;
        })
      );
      setReplyTo(null);
    } else {
      setComments((prev) => [newComment, ...prev]);
    }

    setInputValue("");

    // Scroll to top for new comments, or stay for replies
    if (!replyTo && scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleLike = (commentId: string) => {
    const toggleLike = (arr: Comment[]): Comment[] =>
      arr.map((c) => ({
        ...c,
        liked: c.id === commentId ? !c.liked : c.liked,
        likes: c.id === commentId ? (c.liked ? c.likes - 1 : c.likes + 1) : c.likes,
        replies: toggleLike(c.replies),
      }));
    setComments(toggleLike);
  };

  const handleReply = (commentId: string, author: string) => {
    setReplyTo({ id: commentId, author });
    setInputValue(`@${author} `);
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-background/60 backdrop-blur-sm z-50"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 max-w-lg mx-auto"
          >
            <div className="glass-strong rounded-t-3xl flex flex-col" style={{ maxHeight: "70dvh" }}>
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
                {comments.length === 0 ? (
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
                    <span className="text-xs font-bold text-primary">Y</span>
                  </div>
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    placeholder={replyTo ? `Reply to @${replyTo.author}...` : "Add a comment..."}
                    className="flex-1 bg-muted/50 border border-border rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!inputValue.trim()}
                    className="w-9 h-9 rounded-full bg-primary flex items-center justify-center transition-all active:scale-90 disabled:opacity-40"
                  >
                    <Send className="w-4 h-4 text-primary-foreground" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default CommentsDrawer;
