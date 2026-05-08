import SEOHead from "@/components/SEOHead";
import YouTubeEmbed, { isYouTubeUrl } from "@/components/YouTubeEmbed";
import { useParams, useNavigate } from "react-router-dom";
import watermarkLogo from "@/assets/watermark-logo.png";
import blueLogo from "@/assets/blue-opoll-logo.png";
import { ArrowLeft, Share2, Heart, Bookmark, TrendingUp, Users, Clock, Droplets, BarChart3, Zap, Send, CornerDownRight, ChevronDown, Loader2, Wallet, FileText, ExternalLink, CheckCircle2, XCircle, Pencil, Trash2, Check, X, Info } from "lucide-react";
import NftBadge, { type VerificationLevel } from "@/components/NftBadge";
// LogoLoader removed for faster load
import { useMarket, fetchMarketDetail, mapDbToMarket } from "@/hooks/useMarkets";
import { fetchCryptoPrice } from "@/lib/cryptoPriceProvider";
import { useActiveBoosts } from "@/hooks/useActiveBoosts";
import BoostCountdown from "@/components/BoostCountdown";
import CategoryIcon from "@/components/CategoryIcon";
import BottomNav from "@/components/BottomNav";

import BetModal from "@/components/BetModal";
import AddLiquidityModal from "@/components/AddLiquidityModal";
import BoostMarketModal from "@/components/BoostMarketModal";
import ShareModal from "@/components/ShareModal";
import OrderBook from "@/components/OrderBook";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePriceHistory } from "@/hooks/usePriceHistory";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import CryptoPriceTicker from "@/components/CryptoPriceTicker";
import SportsMatchTicker from "@/components/SportsMatchTicker";
import TwitterEngagementTracker from "@/components/TwitterEngagementTracker";
import { useAuth } from "@/hooks/useAuth";
import { useBookmark } from "@/hooks/useBookmark";
import { toast } from "sonner";
import useAnalytics from "@/hooks/useAnalytics";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import ResolutionSummary from "@/components/ResolutionSummary";
import MarketStreamControls from "@/components/MarketStreamControls";
import MarketStreamPlayer from "@/components/MarketStreamPlayer";
import CryptoRoundLiveChart, { primeCryptoRoundCache } from "@/components/CryptoRoundLiveChart";
import { primeMarketCommentsCache } from "@/components/CommentsDrawer";
import { subscribeToPriceStream } from "@/lib/cryptoPriceProvider";
import CryptoRoundStatusTimeline from "@/components/CryptoRoundStatusTimeline";
import ChartSkeleton from "@/components/ChartSkeleton";

const truncateAddr = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

// Module-level set of resolved-market ids we have already navigated away from.
// Survives component re-mounts (e.g. StrictMode) within the same session so we
// never trigger the spawn-redirect twice for the same round.
const REDIRECTED_FROM = new Set<string>();

const CreatorCard = ({ creatorName, creatorUserId }: { creatorName: string; creatorUserId: string }) => {
  const navigate = useNavigate();
  const { data: profile } = useQuery({
    queryKey: ["creator-profile", creatorUserId],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("wallet_address, display_name, avatar_url, verification_level")
        .eq("id", creatorUserId)
        .maybeSingle();
      return data;
    },
    enabled: !!creatorUserId,
  });

  const displayName = profile?.display_name || creatorName;
  const primaryAddr = profile?.wallet_address
    ? truncateAddr(profile.wallet_address)
    : truncateAddr(creatorUserId);

  return (
    <div
      onClick={() => navigate(`/user/${creatorUserId}`)}
      className="glass rounded-xl p-4 mb-4 flex items-center gap-3 cursor-pointer active:scale-[0.98] transition-transform"
    >
      <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center overflow-hidden">
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt={displayName} className="w-full h-full object-cover" />
        ) : (
          <span className="font-bold text-primary">{displayName.charAt(0)}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold font-mono">{primaryAddr}</p>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          @{displayName}
          {profile?.verification_level && profile.verification_level !== "none" && (
            <NftBadge level={profile.verification_level as VerificationLevel} size={14} />
          )}
        </p>
      </div>
    </div>
  );
};

const formatVolume = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${Number(v.toFixed(2))}`;
};

const getTimeRemaining = (endDate: string) => {
  const diff = new Date(endDate).getTime() - Date.now();
  if (diff <= 0) return "Ended";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (days > 365) return `${Math.floor(days / 365)}y left`;
  if (days > 30) return `${Math.floor(days / 30)}mo left`;
  if (days >= 1) return `${days}d left`;
  if (hours >= 1) return `${hours}h left`;
  return "< 1h left";
};

import { optionColors } from "@/lib/optionColors";

const colorAlpha = (hex: string, alpha: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

interface DbComment {
  id: string;
  market_id: string;
  parent_id: string | null;
  author_name: string;
  author_wallet: string | null;
  content: string;
  likes_count: number;
  created_at: string;
  liked?: boolean;
  replies?: DbComment[];
  avatar_url?: string | null;
  verification_level?: VerificationLevel;
}

const formatCommentTime = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

const InlineCommentItem = ({
  comment, isReply = false, onReply, onLike, onEdit, onDelete, currentUserId,
}: { comment: DbComment; isReply?: boolean; onReply: (id: string, author: string) => void; onLike: (id: string, liked: boolean) => void; onEdit: (id: string, content: string) => void; onDelete: (id: string) => void; currentUserId: string; }) => {
  const [showReplies, setShowReplies] = useState(true);
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
    <div className={isReply ? "ml-8 border-l border-border/30 pl-3" : ""}>
      <div className="flex gap-2.5 py-2.5">
        <div className="w-7 h-7 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0 overflow-hidden">
          {comment.avatar_url ? (
            <img src={comment.avatar_url} alt={comment.author_name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-[10px] font-bold text-primary">{comment.author_name.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-semibold">@{comment.author_name}</span>
            {comment.verification_level && comment.verification_level !== "none" && (
              <NftBadge level={comment.verification_level} size={14} />
            )}
            <span className="text-[10px] text-muted-foreground">{formatCommentTime(comment.created_at)}</span>
          </div>
          {editing ? (
            <div className="flex items-center gap-1.5 mt-1">
              <input type="text" value={editText} onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveEdit()}
                className="flex-1 text-xs bg-muted/50 border border-border rounded-md px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-ring" autoFocus />
              <button onClick={handleSaveEdit} className="p-1 text-primary hover:text-primary/80"><Check className="w-3.5 h-3.5" /></button>
              <button onClick={() => { setEditing(false); setEditText(comment.content); }} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <p className="text-xs text-foreground/80 leading-relaxed break-words">{comment.content}</p>
          )}
          <div className="flex items-center gap-4 mt-1">
            <button onClick={() => onLike(comment.id, !!comment.liked)} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive transition-colors">
              <Heart className={`w-3 h-3 ${comment.liked ? "text-destructive fill-destructive" : ""}`} />
              {comment.likes_count}
            </button>
            {!isReply && (
              <button onClick={() => onReply(comment.id, comment.author_name)} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors">
                <CornerDownRight className="w-3 h-3" /> Reply
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
            <button onClick={() => setShowReplies(!showReplies)} className="flex items-center gap-1 ml-9 text-[10px] text-primary font-semibold py-0.5">
              <ChevronDown className={`w-3 h-3 transition-transform ${showReplies ? "rotate-180" : ""}`} />
              {showReplies ? "Hide" : "View"} {replies.length} replies
            </button>
          )}
          {showReplies && replies.map((r) => <InlineCommentItem key={r.id} comment={r} isReply onReply={onReply} onLike={onLike} onEdit={onEdit} onDelete={onDelete} currentUserId={currentUserId} />)}
        </div>
      )}
    </div>
  );
};

const InlineComments = ({ marketId }: { marketId: string }) => {
  const { user, displayName: authDisplayName } = useAuth();
  const [comments, setComments] = useState<DbComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; author: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const walletId = user?.id || `anon-${Math.random().toString(36).slice(2, 10)}`;

  const fetchComments = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("comments").select("*").eq("market_id", marketId).order("created_at", { ascending: false });
      if (error) throw error;
      const { data: userLikes } = await supabase.from("comment_likes").select("comment_id").eq("wallet_address", walletId);
      const likedIds = new Set(userLikes?.map((l) => l.comment_id) || []);

      // Fetch avatars for comment authors
      const authorIds = [...new Set((data || []).map(c => c.author_wallet).filter(Boolean))] as string[];
      const profileMap = new Map<string, { avatar_url: string | null; verification_level: string }>();
      if (authorIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("id, avatar_url, verification_level").in("id", authorIds);
        for (const p of profiles || []) profileMap.set(p.id, { avatar_url: p.avatar_url, verification_level: p.verification_level });
      }

      const map = new Map<string, DbComment>();
      const topLevel: DbComment[] = [];
      for (const c of data || []) {
        const profile = c.author_wallet ? profileMap.get(c.author_wallet) : null;
        map.set(c.id, { ...c, liked: likedIds.has(c.id), replies: [], avatar_url: profile?.avatar_url || null, verification_level: (profile?.verification_level || "none") as VerificationLevel });
      }
      for (const c of data || []) {
        const comment = map.get(c.id)!;
        if (c.parent_id && map.has(c.parent_id)) { map.get(c.parent_id)!.replies!.push(comment); }
        else if (!c.parent_id) { topLevel.push(comment); }
      }
      for (const c of map.values()) { c.replies?.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()); }
      setComments(topLevel);
    } catch (err) { console.error("Failed to fetch comments:", err); }
    finally { setLoading(false); }
  }, [marketId, walletId]);

  useEffect(() => {
    fetchComments();
    const channel = supabase.channel(`detail-comments-${marketId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments", filter: `market_id=eq.${marketId}` }, () => fetchComments())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [marketId, fetchComments]);

  useEffect(() => { if (replyTo && inputRef.current) inputRef.current.focus(); }, [replyTo]);

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || submitting) return;
    if (!user) {
      toast.error("Sign in to comment", {
        action: { label: "Sign In", onClick: () => window.location.href = "/auth" },
      });
      return;
    }
    const cleanText = replyTo ? text.replace(new RegExp(`^@${replyTo.author}\\s*`), "").trim() || text : text;
    setSubmitting(true);
    try {
      // AI moderation check
      const { data: modData } = await supabase.functions.invoke("moderate-comment", {
        body: { content: cleanText },
      });
      if (modData?.flagged) {
        await supabase.from("moderation_logs").insert({
          content_type: "comment",
          content_id: marketId,
          user_id: user.id,
          flagged_content: cleanText,
          reason: modData.reason || "Flagged by AI",
          category: "profanity",
        });
        toast.error("Comment blocked", {
          description: modData.reason || "Your comment contains inappropriate content. Please revise it.",
          duration: 6000,
        });
        setSubmitting(false);
        return;
      }

      const authorName = authDisplayName || "Anonymous";
      const { error } = await supabase.from("comments").insert({
        market_id: marketId, parent_id: replyTo?.id || null,
        author_name: authorName, author_wallet: user?.id || null, content: cleanText,
      });
      if (error) throw error;
      setInputValue(""); setReplyTo(null);
    } catch { toast.error("Failed to post comment"); }
    finally { setSubmitting(false); }
  };

  const handleLike = async (commentId: string, alreadyLiked: boolean) => {
    if (!user) {
      toast.error("Sign in to like comments", {
        action: { label: "Sign In", onClick: () => window.location.href = "/auth" },
      });
      return;
    }
    try {
      if (alreadyLiked) { await supabase.from("comment_likes").delete().eq("comment_id", commentId).eq("wallet_address", walletId); }
      else { await supabase.from("comment_likes").insert({ comment_id: commentId, wallet_address: walletId }); }
      const updateLike = (arr: DbComment[]): DbComment[] =>
        arr.map((c) => ({ ...c, liked: c.id === commentId ? !alreadyLiked : c.liked, likes_count: c.id === commentId ? (alreadyLiked ? c.likes_count - 1 : c.likes_count + 1) : c.likes_count, replies: updateLike(c.replies || []) }));
      setComments(updateLike);
    } catch (err) { console.error("Failed to toggle like:", err); }
  };

  const handleReply = (commentId: string, author: string) => {
    if (!user) {
      toast.error("Sign in to reply", {
        action: { label: "Sign In", onClick: () => window.location.href = "/auth" },
      });
      return;
    }
    setReplyTo({ id: commentId, author }); setInputValue(`@${author} `);
  };

  const handleEdit = async (commentId: string, newContent: string) => {
    try {
      const { error } = await supabase.from("comments").update({ content: newContent }).eq("id", commentId);
      if (error) throw error;
      const updateContent = (arr: DbComment[]): DbComment[] =>
        arr.map((c) => ({ ...c, content: c.id === commentId ? newContent : c.content, replies: updateContent(c.replies || []) }));
      setComments(updateContent);
      toast.success("Comment updated");
    } catch { toast.error("Failed to update comment"); }
  };

  const handleDelete = async (commentId: string) => {
    try {
      const { error } = await supabase.from("comments").delete().eq("id", commentId);
      if (error) throw error;
      const removeComment = (arr: DbComment[]): DbComment[] =>
        arr.filter((c) => c.id !== commentId).map((c) => ({ ...c, replies: removeComment(c.replies || []) }));
      setComments(removeComment);
      toast.success("Comment deleted");
    } catch { toast.error("Failed to delete comment"); }
  };

  const totalComments = comments.reduce((acc, c) => acc + 1 + (c.replies?.length || 0), 0);

  return (
    <div className="glass rounded-xl p-4 mb-6">
      <h3 className="text-sm font-semibold mb-3">💬 Discussion ({totalComments})</h3>
      <div className="mb-4">
        {replyTo && (
          <div className="flex items-center justify-between mb-1.5 px-1">
            <span className="text-[10px] text-primary">Replying to @{replyTo.author}</span>
            <button onClick={() => { setReplyTo(null); setInputValue(""); }} className="text-[10px] text-muted-foreground hover:text-foreground">Cancel</button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <input ref={inputRef} type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={replyTo ? `Reply to @${replyTo.author}...` : "Add a comment..."}
            className="flex-1 bg-muted/50 border border-border rounded-full px-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" disabled={submitting} />
          <button onClick={handleSend} disabled={!inputValue.trim() || submitting}
            className="w-8 h-8 rounded-full bg-primary flex items-center justify-center transition-all active:scale-90 disabled:opacity-40">
            {submitting ? <Loader2 className="w-3.5 h-3.5 text-primary-foreground animate-spin" /> : <Send className="w-3.5 h-3.5 text-primary-foreground" />}
          </button>
        </div>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 text-primary animate-spin" /></div>
      ) : comments.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground"><p className="text-xs">No comments yet. Be the first!</p></div>
      ) : (
        <div className="divide-y divide-border/20">
          {comments.map((c) => <InlineCommentItem key={c.id} comment={c} onReply={handleReply} onLike={handleLike} onEdit={handleEdit} onDelete={handleDelete} currentUserId={walletId} />)}
        </div>
      )}
    </div>
  );
};

const MarketDetailsCollapsible = ({ details }: { details: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="glass rounded-xl mb-4 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">More Details</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-0">
              <div className="prose-details text-xs text-muted-foreground leading-relaxed">
                <ReactMarkdown
                  components={{
                    h1: ({ children }) => <h3 className="text-sm font-bold text-foreground mt-3 mb-1">{children}</h3>,
                    h2: ({ children }) => <h4 className="text-xs font-bold text-foreground mt-2.5 mb-1">{children}</h4>,
                    h3: ({ children }) => <h5 className="text-xs font-semibold text-foreground mt-2 mb-0.5">{children}</h5>,
                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
                    li: ({ children }) => <li>{children}</li>,
                    a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{children}</a>,
                    strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                    em: ({ children }) => <em>{children}</em>,
                    code: ({ children }) => <code className="bg-muted px-1 py-0.5 rounded text-[10px]">{children}</code>,
                  }}
                >{details}</ReactMarkdown>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const MarketDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isSuperAdmin } = useAuth();
  const { data: market, isLoading, isError } = useMarket(id);

  // Auto-redirect to the next round once a crypto Up/Down round is resolved
  // and the spawner cron creates the new market. Polls every 4s.
  // `redirectingRef` ensures we only fire the prefetch+navigate sequence ONCE
  // per resolved market, even if React re-renders, StrictMode double-mounts,
  // or the 4s interval ticks while a previous poll is still in-flight.
  const redirectingRef = useRef(false);
  useEffect(() => {
    redirectingRef.current = false;
  }, [market?.id]);
  useEffect(() => {
    if (!market?.isCryptoRound) return;
    if (market.status !== "resolved") return;
    if (!market.autoResolveAsset) return;
    if (REDIRECTED_FROM.has(market.id)) return;

    let cancelled = false;
    const poll = async () => {
      // Reentrancy guard — if a previous poll already kicked off the
      // prefetch+navigate sequence, do nothing on subsequent ticks.
      if (redirectingRef.current || REDIRECTED_FROM.has(market.id)) return;
      const { data } = await supabase
        .from("markets")
        .select("id, auto_resolve_deadline, auto_resolve_asset, yes_price, no_price")
        .eq("is_crypto_round", true)
        .eq("auto_resolve_asset", market.autoResolveAsset)
        .eq("status", "active")
        .neq("id", market.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled || !data?.id) return;
      // Re-check after the await — another tick may have won the race.
      if (redirectingRef.current || REDIRECTED_FROM.has(market.id)) return;
      redirectingRef.current = true;
      REDIRECTED_FROM.add(market.id);

      const nextId = data.id as string;
      const nextAsset = (data.auto_resolve_asset as string | null) ?? market.autoResolveAsset!;
      const nextDeadline = data.auto_resolve_deadline as string | null;

      // Preload the next round's full market detail + warm both the REST price
      // (for fetchAssetPrice consumers) and the Binance WebSocket stream (so
      // the chart's first tick lands before the user sees it). Also seed the
      // chart's per-round point cache so it never paints empty.
      // Defensive helper — never let an individual prefetch reject and short-circuit
      // the others. Each one is best-effort; navigation must always proceed.
      const safe = <T,>(p: Promise<T>, label: string): Promise<T | null> =>
        p.catch((err) => {
          console.warn(`[crypto-round] prefetch:${label} failed (non-fatal):`, err);
          return null;
        });

      const uid = user?.id;
      let livePrice: number | null = null;
      try {
        const pricePromise = new Promise<number | null>((resolve) => {
          let resolved = false;
          const finish = (p: number | null) => {
            if (resolved) return;
            resolved = true;
            resolve(p);
          };
          try {
            const unsub = subscribeToPriceStream(nextAsset, (p) => {
              finish(p);
              setTimeout(() => { try { unsub(); } catch {} }, 500);
            });
            setTimeout(async () => {
              if (resolved) return;
              try { unsub(); } catch {}
              const p = await fetchCryptoPrice(nextAsset).catch(() => null);
              finish(p);
            }, 1200);
          } catch {
            // Subscribe itself threw — fall back to REST immediately.
            fetchCryptoPrice(nextAsset).then(finish).catch(() => finish(null));
          }
        });

        const settled = await Promise.allSettled([
          safe(queryClient.prefetchQuery({
            queryKey: ["market", nextId],
            queryFn: async () => {
              const { data: detail, error } = await fetchMarketDetail(supabase, nextId);
              if (error || !detail) return null;
              return mapDbToMarket(detail as any);
            },
          }), "market-detail"),
          safe(queryClient.prefetchQuery({
            queryKey: ["orderbook-trades", nextId],
            queryFn: async () => {
              const { data } = await supabase
                .from("public_market_trades")
                .select("id, side, amount, price, shares, created_at")
                .eq("market_id", nextId)
                .in("side", ["yes", "no"])
                .order("created_at", { ascending: false })
                .limit(100);
              return data || [];
            },
          }), "orderbook-trades"),
          safe(queryClient.prefetchQuery({
            queryKey: ["resolution-meta", nextId],
            queryFn: async () => {
              const { data } = await supabase
                .from("markets")
                .select("status, end_date, moderator_reviewed_at, is_crypto_round")
                .eq("id", nextId)
                .maybeSingle();
              return data;
            },
          }), "resolution-meta"),
          uid
            ? safe(queryClient.prefetchQuery({
                queryKey: ["resolution-positions", nextId, uid],
                queryFn: async () => {
                  const { data } = await supabase
                    .from("positions")
                    .select("id, side, shares, avg_price, option_id")
                    .eq("market_id", nextId)
                    .eq("user_id", uid)
                    .gt("shares", 0);
                  return data || [];
                },
              }), "resolution-positions")
            : Promise.resolve(null),
          uid
            ? safe(queryClient.prefetchQuery({
                queryKey: ["resolution-payouts", nextId, uid],
                queryFn: async () => {
                  const { data } = await supabase
                    .from("transactions")
                    .select("amount, side, type")
                    .eq("market_id", nextId)
                    .eq("user_id", uid)
                    .in("type", ["payout", "refund", "one_sided_refund"]);
                  return data || [];
                },
              }), "resolution-payouts")
            : Promise.resolve(null),
          safe(primeMarketCommentsCache(nextId, uid || ""), "comments"),
          safe(pricePromise, "live-price"),
        ]);

        const priceResult = settled[settled.length - 1];
        if (priceResult.status === "fulfilled" && typeof priceResult.value === "number") {
          livePrice = priceResult.value;
        }
        if (livePrice != null && nextDeadline) {
          try { primeCryptoRoundCache(nextAsset, nextDeadline, livePrice); } catch {}
        }
      } catch (e) {
        // Belt-and-braces — should be unreachable since each prefetch is wrapped.
        console.warn("[crypto-round] prefetch next round failed (non-fatal):", e);
      }

      if (cancelled) return;
      // Always proceed with navigation, even if every prefetch failed.
      try { queryClient.invalidateQueries({ queryKey: ["markets"] }); } catch {}
      navigate(`/market/${nextId}`, { replace: true });
    };
    poll();
    const iv = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [market?.id, market?.isCryptoRound, market?.status, market?.autoResolveAsset, navigate, queryClient]);

  const { boostDetails } = useActiveBoosts();
  const activeBoost = id ? boostDetails.get(id) : undefined;
  const { track } = useAnalytics();
  const { toggles, isFeatureEnabled } = useFeatureToggles();
  const showPageViews = toggles.find(t => t.feature_key === "show_wagered_stats")?.enabled ?? false;
  const streamingEnabled = isFeatureEnabled("market_streaming");

  const { data: pageViewCount } = useQuery({
    queryKey: ["market-page-views", id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("analytics_events")
        .select("id", { count: "exact", head: true })
        .eq("event_name", "page_view")
        .contains("properties", { marketId: id });
      if (error) return 0;
      return count ?? 0;
    },
    enabled: !!id && showPageViews,
  });

  const isCreator = !!(user && market && market.creatorAddress === user.id);
  const needsFirstPrediction = isCreator && market && market.participants === 0 && !market.isCryptoRound;
  const isEnded = !!(market && (market.status === "ended" || market.status === "resolved" || market.status === "cancelled" || new Date(market.endDate).getTime() < Date.now()));

  useEffect(() => { if (id) track("page_view", { page: "market_detail", marketId: id }); }, [id]);

  const isMulti = market?.marketType === "multi" || market?.marketType === "range";
  const yesPercent = market ? Math.round(market.yesPrice * 100) : 0;
  const noPercent = market ? Math.round(market.noPrice * 100) : 0;

  const [timePeriod, setTimePeriod] = useState<"1D" | "1W" | "1M" | "All">("1M");
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const { bookmarked, toggleBookmark } = useBookmark(id);
  const [shareOpen, setShareOpen] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const shareRef = useRef<HTMLDivElement>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const [commentsReached, setCommentsReached] = useState(false);

  // Dynamic SEO via SEOHead — prefer the market's own image for rich social cards
  const ogImageUrl = market?.imageUrl
    ? market.imageUrl
    : id
      ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/og-image?id=${id}`
      : undefined;

  const { chartData, isLoading: chartLoading, hasTransactions } = usePriceHistory(
    id, timePeriod, yesPercent, noPercent, isMulti, market?.options
  );
  // Show skeleton only on initial load when we truly have nothing yet —
  // once any data has arrived (even stale cached buckets), keep showing
  // the chart so the UI never flashes empty if a follow-up fetch fails.
  const showChartSkeleton = chartLoading && !hasTransactions;

  const [betSide, setBetSide] = useState<"yes" | "no">("yes");
  const [betOpen, setBetOpen] = useState(false);
  const [boostOpen, setBoostOpen] = useState(false);
  const [addLiquidityOpen, setAddLiquidityOpen] = useState(false);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Detect when user has scrolled to the comments section
  useEffect(() => {
    const el = commentsEndRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setCommentsReached(entry.isIntersecting),
      { root: null, threshold: 0, rootMargin: "0px 0px 80px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [market]);

  if (isLoading) return (
    <div className="h-dvh flex flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
      <p className="text-xs">Loading round…</p>
    </div>
  );
  if (isError) return (
    <div className="h-dvh flex flex-col items-center justify-center gap-4 text-muted-foreground">
      <p>Failed to load market. Please try again.</p>
      <button onClick={() => window.location.reload()} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">Retry</button>
    </div>
  );
  if (!market) return <div className="h-dvh flex items-center justify-center text-muted-foreground">Market not found</div>;

  const selectedOptionObj = selectedOptionId
    ? market.options?.find((o) => o.id === selectedOptionId) ?? null
    : null;
  const selectedOptionIdx = selectedOptionObj
    ? market.options?.findIndex((o) => o.id === selectedOptionId) ?? -1
    : -1;
  const selectedOptionLabel = selectedOptionObj?.label ?? null;
  const selectedOptionColor = selectedOptionIdx >= 0 ? optionColors[selectedOptionIdx % optionColors.length] : undefined;

  return (
    <div ref={pageRef} className="h-dvh bg-background overflow-y-auto overscroll-contain" style={{ paddingBottom: 'calc(8rem + var(--safe-bottom))' }}>
      {market && <SEOHead title={market.title} description={market.description} path={`/market/${id}`} image={ogImageUrl} type="article" />}
      <div className="sticky top-0 z-20 glass-strong" style={{ paddingTop: 'var(--safe-top)' }}>
        <div className="flex items-center justify-between h-14 px-4 max-w-lg md:max-w-4xl mx-auto">
          <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full glass flex items-center justify-center"><ArrowLeft className="w-5 h-5" /></button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground inline-flex items-center gap-1.5"><CategoryIcon category={market.category} className="w-3.5 h-3.5" /> {market.category}</span>
            {isMulti && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary">{market.marketType === "range" ? "Range" : "Multi"}</span>}
          </div>
          <div className="flex gap-2">
            <button onClick={() => {
              if (market.status === "ended" || market.status === "resolved" || market.status === "cancelled") {
                toast.info("This market has ended and is no longer available for boosting");
                return;
              }
              setBoostOpen(true);
            }} className="w-10 h-10 rounded-full glass flex items-center justify-center hover:bg-primary/20 transition-colors" title="Boost Market">
              <Zap className="w-5 h-5 text-primary" />
            </button>
            <button onClick={toggleBookmark} className="w-10 h-10 rounded-full glass flex items-center justify-center hover:bg-primary/20 transition-colors">
              <Bookmark className={`w-5 h-5 transition-colors ${bookmarked ? "text-primary fill-primary" : ""}`} />
            </button>
            <button onClick={() => setShareOpen(true)} className="w-10 h-10 rounded-full glass flex items-center justify-center hover:bg-primary/20 transition-colors"><Share2 className="w-5 h-5" /></button>
          </div>
        </div>
      </div>

      <div className="max-w-lg md:max-w-4xl mx-auto px-3 sm:px-4">
      {/* Hidden share capture overlay - matches MarketCard style */}
      <div ref={shareRef} className="absolute -left-[9999px] w-[600px] overflow-hidden rounded-xl" style={{ height: '400px', backgroundColor: '#0a0a0a' }}>
        {market.imageUrl && (
          <div className="absolute inset-0">
            <img src={market.imageUrl} alt="" className="w-full h-full object-cover" loading="eager" />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(10,10,10,0.9) 0%, rgba(10,10,10,0.2) 40%, transparent 100%)' }} />
          </div>
        )}
        {/* Probability ring or multi indicator */}
        <div className="absolute top-6 right-6 z-10">
          {isMulti ? (
            <div className="rounded-xl px-4 py-3 flex flex-col items-center gap-1" style={{ background: 'rgba(0,0,0,0.5)' }}>
              <BarChart3 className="w-6 h-6" style={{ color: '#22c55e' }} />
              <span className="text-xs font-bold uppercase" style={{ color: '#22c55e' }}>{market.options?.length} options</span>
            </div>
          ) : (
            <div className="relative w-24 h-24">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="34" fill="none" stroke="#27272a" strokeWidth="4" />
                <circle cx="40" cy="40" r="34" fill="none" stroke="#22c55e" strokeWidth="4" strokeDasharray={`${yesPercent * 2.136} ${213.6 - yesPercent * 2.136}`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold" style={{ color: '#22c55e' }}>{yesPercent}%</span>
                <span className="text-[11px]" style={{ color: '#a1a1aa' }}>YES</span>
              </div>
            </div>
          )}
        </div>
        {/* Category badge */}
        <div className="absolute top-6 left-6 z-10">
          <span className="px-4 py-2 rounded-full text-sm font-medium inline-flex items-center gap-1.5" style={{ background: 'rgba(0,0,0,0.5)', color: 'rgba(255,255,255,0.8)' }}>
            <CategoryIcon category={market.category} className="w-3.5 h-3.5" /> {market.category}
          </span>
        </div>
        {/* Bottom overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-8" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 50%, transparent 100%)' }}>
          {isMulti && market.options?.length ? (() => {
            const leading = market.options!.reduce((a, b) => b.price > a.price ? b : a);
            return <span className="inline-block px-3 py-1 rounded-full text-lg font-bold mb-2" style={{ backgroundColor: 'rgba(0,0,0,0.4)', color: '#22c55e' }}>{Math.round(leading.price * 100)}% Chance · {leading.label}</span>;
          })() : (
            <span className="inline-block px-3 py-1 rounded-full text-lg font-bold mb-2" style={{ backgroundColor: 'rgba(0,0,0,0.4)', color: '#22c55e' }}>{yesPercent}% chance</span>
          )}
          <h3 className="text-2xl font-bold text-white mb-2 leading-tight">{market.title}</h3>
          <div className="flex items-center justify-between">
            {isMulti && market.options ? (
              <div className="flex flex-wrap gap-2">
                {market.options.slice(0, 4).map((opt, i) => (
                  <span key={opt.id} className="px-3 py-1.5 rounded-full text-xs font-bold text-white" style={{ backgroundColor: optionColors[i % optionColors.length] + '99' }}>
                    {opt.label} {Math.round(opt.price * 100)}%
                  </span>
                ))}
              </div>
            ) : (
              <div className="flex gap-3">
                <span className="px-4 py-1.5 rounded-full text-sm font-bold text-white" style={{ backgroundColor: 'hsl(145, 80%, 42%, 0.85)' }}>YES {yesPercent}%</span>
                <span className="px-4 py-1.5 rounded-full text-sm font-bold text-white" style={{ backgroundColor: 'hsl(0, 85%, 55%, 0.85)' }}>NO {noPercent}%</span>
              </div>
            )}
            <span className="text-[11px] font-mono shrink-0 ml-3 flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
              <Clock className="w-3 h-3" /> {getTimeRemaining(market.endDate)} · {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
        {/* Watermark */}
        <div className="absolute bottom-3 right-4 z-20 opacity-40">
          <img src={watermarkLogo} alt="" className="h-7 w-auto" />
        </div>
      </div>

      {/* Visible banner — always image */}
      {market.imageUrl ? (() => {
        const boostGlowColor = activeBoost
          ? activeBoost.tier === "whale" ? "hsla(45, 93%, 58%, 0.6)"
            : activeBoost.tier === "standard" ? "hsla(280, 70%, 60%, 0.6)"
            : "hsla(var(--primary), 0.6)"
          : undefined;
        const boostBorderColor = activeBoost
          ? activeBoost.tier === "whale" ? "hsl(45, 93%, 58%)"
            : activeBoost.tier === "standard" ? "hsl(280, 70%, 60%)"
            : "hsl(var(--primary))"
          : undefined;

        return (
        <div
          className="relative w-full rounded-xl overflow-hidden mt-4 transition-shadow duration-500"
          style={activeBoost ? {
            boxShadow: `0 0 20px ${boostGlowColor}, 0 0 40px ${boostGlowColor?.replace('0.6', '0.3')}, inset 0 0 20px ${boostGlowColor?.replace('0.6', '0.1')}`,
            border: `1px solid ${boostBorderColor}40`,
          } : undefined}
        >
          <div className="h-40 md:h-52 w-full overflow-hidden">
            <img src={market.imageUrl} alt={market.title} className="w-full h-full object-cover opacity-30 md:opacity-20 scale-110 will-change-transform" style={{ transform: `scale(1.1) translateY(${scrollY * 0.15}px)` }} />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/60 to-black/40 md:from-black/90 md:via-black/70 md:to-black/50" />
          <div className="absolute inset-0 pointer-events-none banner-shimmer" />
          {activeBoost && (
            <div
              className="absolute inset-0 pointer-events-none animate-pulse"
              style={{
                background: `radial-gradient(ellipse at 50% 0%, ${boostGlowColor?.replace('0.6', '0.15')} 0%, transparent 70%)`,
              }}
            />
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
            <h1 className="text-lg md:text-2xl font-bold text-white leading-snug" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8), 0 1px 3px rgba(0,0,0,0.9), 0 0 20px rgba(0,0,0,0.5)' }}>{market.title}</h1>
            <p className="text-xs md:text-sm text-white/90 mt-1.5 line-clamp-2" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8), 0 0 12px rgba(0,0,0,0.5)' }}>{market.description}</p>
            <span className="text-[10px] text-white/70 font-mono mt-2 flex items-center gap-1" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}>
              <Clock className="w-2.5 h-2.5" /> {getTimeRemaining(market.endDate)} · {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
        );
      })() : null}

      {/* Video embed below banner (if video URL exists) */}
      {market.videoUrl && isYouTubeUrl(market.videoUrl) && (
        <div className="relative w-full rounded-xl overflow-hidden mt-4">
          <div className="aspect-video w-full">
            <YouTubeEmbed url={market.videoUrl} className="w-full h-full rounded-xl" fallbackImage={market.imageUrl} fallbackAlt={market.title} autoplayMuted={false} />
          </div>
        </div>
      )}

      {/* Live Stream Section */}
      {streamingEnabled && !market.isCryptoRound && (
        <>
          {/* Creator controls */}
          {isCreator && !isEnded && !market.isCryptoRound && (
            <div className="mt-4">
              <MarketStreamControls
                marketId={market.id}
                streamUrl={market.streamUrl}
                isStreaming={market.isStreaming}
                onStreamStateChange={() => {
                  queryClient.invalidateQueries({ queryKey: ["market", id] });
                }}
              />
            </div>
          )}

          {/* LiveKit stream viewer (for non-creators when market is streaming) */}
          {/* LiveKit stream viewer (for anyone when market is streaming) */}
          {market.isStreaming && (
            <div className="mt-4">
              <MarketStreamPlayer marketId={market.id} />
            </div>
          )}

          {/* External stream embed (stream_url, separate from video_url) */}
          {market.streamUrl && !market.isStreaming && isYouTubeUrl(market.streamUrl) && (
            <div className="relative w-full rounded-xl overflow-hidden mt-4">
              <div className="aspect-video w-full">
                <YouTubeEmbed url={market.streamUrl} className="w-full h-full rounded-xl" fallbackImage={market.imageUrl} fallbackAlt={market.title} autoplayMuted={false} />
              </div>
              <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-2 py-1 rounded-full bg-destructive/90 text-destructive-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-wider">LIVE STREAM</span>
              </div>
            </div>
          )}
        </>
      )}

        <div className={`${(market.imageUrl || market.videoUrl) ? 'pt-4' : 'pt-4'}`}>
        {!market.imageUrl && !market.videoUrl && <p className="text-sm text-muted-foreground mb-6">{market.description}</p>}

        {/* Resolution Summary for resolved markets */}
        {market.status === "resolved" && (
          <ResolutionSummary
            marketId={market.id}
            marketTitle={market.title}
            resolvedSide={market.resolvedSide || null}
            winningOptionId={market.winningOptionId || null}
            options={market.options}
            marketType={market.marketType}
            sportPredictedOutcome={market.sportPredictedOutcome || null}
          />
        )}

        {market.details && <MarketDetailsCollapsible details={market.details} />}

        {market.polymarketEventSlug && (
          <a
            href={`https://polymarket.com/event/${market.polymarketEventSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="glass rounded-xl px-4 py-3 mb-4 flex items-center gap-3 group hover:border-primary/40 transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-base">🔮</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground">Resolution Source: Polymarket</p>
              <p className="text-[10px] text-muted-foreground">This market resolves based on Polymarket's final outcome</p>
            </div>
            <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
          </a>
        )}

        {/* Live Crypto Price Ticker */}
        {market.autoResolve && market.autoResolveAsset && market.autoResolveTargetPrice && market.autoResolveOperator && (
          <CryptoPriceTicker
            asset={market.autoResolveAsset}
            targetPrice={market.autoResolveTargetPrice}
            operator={market.autoResolveOperator}
            deadline={market.autoResolveDeadline}
          />
        )}

        {/* Live Sports Match Ticker */}
        {market.autoResolve && market.sportType && market.sportMatchId && market.sportPredictedOutcome && (
          <SportsMatchTicker
            sportType={market.sportType}
            matchId={market.sportMatchId}
            predictedOutcome={market.sportPredictedOutcome}
            league={market.sportLeague}
            deadline={market.autoResolveDeadline}
            marketStatus={market.status}
          />
        )}

        {/* Live Twitter Engagement Tracker */}
        {market.twitterMetricType && market.twitterResourceId && (
          <TwitterEngagementTracker
            metricType={market.twitterMetricType}
            resourceId={market.twitterResourceId}
            currentCount={market.twitterCurrentCount ?? 0}
            marketId={market.id}
            options={market.options}
            deadline={market.autoResolveDeadline}
          />
        )}

        {activeBoost && user?.id === market.creatorAddress && (
          <div className="mb-4">
            <BoostCountdown endsAt={activeBoost.ends_at} tier={activeBoost.tier} />
          </div>
        )}

        {needsFirstPrediction && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 rounded-xl border border-primary/40 bg-primary/10 p-4 flex items-start gap-3"
          >
            <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
              <TrendingUp className="w-4.5 h-4.5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Your market is almost live!</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Place your first prediction (min $5) to make this market publicly visible on the feed.
              </p>
            </div>
          </motion.div>
        )}

        {/* Chart */}
        <div className="glass rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">
              {market.isCryptoRound && market.autoResolveAsset ? `${market.autoResolveAsset} · Live Price` : "Price Chart"}
            </span>
            <span className="text-xl font-bold text-green-500">{isMulti && market.options?.length ? (() => { const leading = market.options!.reduce((a, b) => b.price > a.price ? b : a); return `${Math.round(leading.price * 100)}% Chance · ${leading.label}`; })() : `${yesPercent}% Chance`}</span>
          </div>
          {market.isCryptoRound && market.autoResolveAsset ? (
            <div className="relative">
              <CryptoRoundStatusTimeline
                endsAt={market.autoResolveDeadline || market.endDate}
                startsAt={market.createdAt}
                status={market.status}
                className="mb-3"
              />
              <CryptoRoundLiveChart
                asset={market.autoResolveAsset}
                targetPrice={market.autoResolveTargetPrice ?? null}
                operator={market.autoResolveOperator ?? null}
                endsAt={market.autoResolveDeadline || market.endDate}
                startsAt={market.createdAt}
                height={220}
              />
              <img src={watermarkLogo} alt="" className="absolute inset-0 m-auto opacity-20 pointer-events-none scale-[0.4] hidden dark:block" />
              <img src={blueLogo} alt="" className="absolute inset-0 m-auto opacity-20 pointer-events-none scale-[0.4] dark:hidden" />
            </div>
          ) : (
            <>
              <div className="flex gap-1 p-0.5 rounded-lg bg-muted/50 mb-3 w-fit">
                {(["1D", "1W", "1M", "All"] as const).map((p) => (
                  <button key={p} onClick={() => setTimePeriod(p)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${timePeriod === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    {p}
                  </button>
                ))}
              </div>
              <div className="h-40 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      {isMulti && market.options ? (
                        market.options.map((opt, i) => (
                          <linearGradient key={opt.id} id={`grad-${opt.id}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={optionColors[i % optionColors.length]} stopOpacity={0.3} />
                            <stop offset="100%" stopColor={optionColors[i % optionColors.length]} stopOpacity={0.02} />
                          </linearGradient>
                        ))
                      ) : (
                        <>
                          <linearGradient id="yesGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--neon-yes))" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="hsl(var(--neon-yes))" stopOpacity={0.05} />
                          </linearGradient>
                          <linearGradient id="noGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--neon-no))" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="hsl(var(--neon-no))" stopOpacity={0.05} />
                          </linearGradient>
                        </>
                      )}
                    </defs>
                    <XAxis dataKey="day" hide />
                    <YAxis domain={[0, 100]} hide />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.75rem", fontSize: "12px" }}
                      formatter={(value: number, name: string) => [`${value}¢`, name]} labelFormatter={(_: any, payload: any[]) => payload?.[0]?.payload?.label || ""} />
                    {isMulti && market.options ? (
                      market.options.map((opt, i) => (
                        <Area key={opt.id} type="monotone" dataKey={opt.label} stroke={optionColors[i % optionColors.length]}
                          strokeWidth={selectedOptionId === opt.id || !selectedOptionId ? 2 : 0.5}
                          fill={`url(#grad-${opt.id})`} fillOpacity={selectedOptionId === opt.id || !selectedOptionId ? 1 : 0.1}
                          animationDuration={1500 + i * 200} animationEasing="ease-in-out" />
                      ))
                    ) : (
                      <>
                        <Area type="monotone" dataKey="yes" stroke="hsl(var(--neon-yes))" strokeWidth={2} fill="url(#yesGrad)" animationDuration={1500} />
                        <Area type="monotone" dataKey="no" stroke="hsl(var(--neon-no))" strokeWidth={1.5} fill="url(#noGrad)" animationDuration={1800} />
                      </>
                    )}
                  </AreaChart>
                </ResponsiveContainer>
                <img src={watermarkLogo} alt="" className="absolute inset-0 m-auto opacity-30 pointer-events-none scale-[0.4] hidden dark:block" />
                <img src={blueLogo} alt="" className="absolute inset-0 m-auto opacity-30 pointer-events-none scale-[0.4] dark:hidden" />
              </div>
            </>
          )}
          {isMulti && market.options && (
            <div className="flex flex-wrap gap-2 mt-3">
              {market.options.map((opt, i) => (
                <button key={opt.id} onClick={() => setSelectedOptionId(selectedOptionId === opt.id ? null : opt.id)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all ${selectedOptionId === opt.id ? "bg-secondary ring-1 ring-primary/30" : "hover:bg-muted/50"}`}>
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: optionColors[i % optionColors.length] }} />
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

        {/* Multi-option pricing */}
        {isMulti && market.options && (
          <div className="space-y-2 mb-4">
            {market.options.map((opt, i) => {
              const pct = Math.round(opt.price * 100);
              const color = optionColors[i % optionColors.length];
              return (
                <motion.button key={opt.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  onClick={() => { if (!isEnded) { setSelectedOptionId(opt.id); setBetSide("yes"); setBetOpen(true); } }}
                  className={`w-full relative rounded-xl px-4 py-3.5 flex items-center justify-between transition-all overflow-hidden ${isEnded ? "opacity-50 cursor-not-allowed" : "active:scale-[0.98] cursor-pointer"}`}
                  style={{ background: colorAlpha(color, 0.1) }}>
                  <div className="absolute inset-0 rounded-xl" style={{ background: `linear-gradient(90deg, ${colorAlpha(color, 0.12)} 0%, ${colorAlpha(color, 0.04)} ${pct}%, transparent ${pct}%)` }} />
                  <div className="flex items-center gap-2.5 relative z-10">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color, boxShadow: `0 0 6px ${colorAlpha(color, 0.5)}` }} />
                    <span className="text-sm font-semibold">{opt.label}</span>
                  </div>
                  <span className="text-sm font-bold relative z-10" style={{ color }}>{pct}¢</span>
                </motion.button>
              );
            })}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-4">
          <div className="glass rounded-xl p-2.5 sm:p-3"><div className="flex items-center gap-2 text-muted-foreground mb-1"><TrendingUp className="w-3.5 h-3.5" /><span className="text-[11px] sm:text-xs">Volume</span></div><span className="text-base sm:text-lg font-bold">{formatVolume(market.volume)}</span></div>
          <div className="glass rounded-xl p-2.5 sm:p-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Droplets className="w-3.5 h-3.5" />
                <span className="text-[11px] sm:text-xs">Liquidity</span>
              </div>
              {isCreator && !isEnded && (
                <button
                  onClick={() => setAddLiquidityOpen(true)}
                  className="w-6 h-6 rounded-full bg-primary/15 hover:bg-primary/25 flex items-center justify-center text-primary transition-colors"
                  title="Add Liquidity"
                >
                  <span className="text-sm font-bold leading-none">+</span>
                </button>
              )}
            </div>
            <span className="text-base sm:text-lg font-bold">{formatVolume(market.liquidity)}</span>
          </div>
          <div className="glass rounded-xl p-2.5 sm:p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              {showPageViews ? <BarChart3 className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
              <span className="text-[11px] sm:text-xs">{showPageViews ? "Page Views" : "Traders"}</span>
            </div>
            <span className="text-base sm:text-lg font-bold">
              {showPageViews ? (pageViewCount ?? 0).toLocaleString() : market.participants.toLocaleString()}
            </span>
          </div>
          <div className="glass rounded-xl p-2.5 sm:p-3"><div className="flex items-center gap-2 text-muted-foreground mb-1"><Clock className="w-3.5 h-3.5" /><span className="text-[11px] sm:text-xs">Ends</span></div><span className="text-base sm:text-lg font-bold">{getTimeRemaining(market.endDate)}</span></div>
        </div>

        {!isEnded && (
          <div className="glass rounded-xl p-3 mb-4 flex gap-2.5 items-start">
            <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-foreground">Early predictions get better pricing</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                Prices rise as more people predict on an option. Predicting early means you pay less per share and receive more shares — resulting in a larger payout if you win.
              </p>
            </div>
          </div>
        )}

        {!isMulti && <OrderBook yesPrice={yesPercent} noPrice={noPercent} liquidity={market.liquidity} marketId={market.id} />}

        <CreatorCard creatorName={market.creatorName} creatorUserId={market.creatorAddress} />

        <InlineComments marketId={market.id} />

        {/* Anchor for detecting comments section + inline buttons when scrolled down */}
        <div ref={commentsEndRef}>
          {!isMulti && commentsReached && (
            <div className="px-0 pb-4 pt-3">
              <div className="w-full flex gap-3">
                {isEnded ? (
                  <div className={`flex-1 text-center py-3.5 sm:py-4 rounded-xl font-bold text-sm sm:text-base flex items-center justify-center gap-2 ${
                    market?.status === "resolved" ? "bg-primary/10 text-primary" : market?.status === "cancelled" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
                  }`}>
                    {market?.status === "resolved" ? <CheckCircle2 className="w-5 h-5" /> : market?.status === "cancelled" ? <XCircle className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                    {market?.status === "resolved" ? "Market Ended — Resolution Completed" : market?.status === "cancelled" ? "Market Cancelled" : (market?.isCryptoRound ? "Resolving… new round starting soon" : "Market Ended — Awaiting Resolution")}
                  </div>
                ) : (
                  <>
                    <button onClick={() => { setBetSide("yes"); setBetOpen(true); }} className="flex-1 min-w-0 btn-yes py-3.5 sm:py-4 rounded-xl font-bold text-sm sm:text-base tracking-wide transition-all active:scale-95">{market?.isCryptoRound ? `Buy Up ${yesPercent}¢` : `Buy Yes ${yesPercent}¢`}</button>
                    <button onClick={() => { setBetSide("no"); setBetOpen(true); }} className="flex-1 min-w-0 btn-no py-3.5 sm:py-4 rounded-xl font-bold text-sm sm:text-base tracking-wide transition-all active:scale-95">{market?.isCryptoRound ? `Buy Down ${noPercent}¢` : `Buy No ${noPercent}¢`}</button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {!isMulti && !commentsReached && !shareOpen && (
        <div className="fixed left-0 right-0 lg:left-60 z-[60] px-4 pb-4 pt-3 bg-gradient-to-t from-background via-background to-transparent lg:bottom-0" style={{ bottom: 'var(--content-bottom)' }}>
          <div className="w-full max-w-lg lg:max-w-4xl mx-auto flex gap-3">
            {isEnded ? (
              <div className={`flex-1 text-center py-3.5 sm:py-4 rounded-xl font-bold text-sm sm:text-base flex items-center justify-center gap-2 ${
                    market?.status === "resolved" ? "bg-primary/10 text-primary" : market?.status === "cancelled" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
                  }`}>
                    {market?.status === "resolved" ? <CheckCircle2 className="w-5 h-5" /> : market?.status === "cancelled" ? <XCircle className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                    {market?.status === "resolved" ? "Market Ended — Resolution Completed" : market?.status === "cancelled" ? "Market Cancelled" : (market?.isCryptoRound ? "Resolving… new round starting soon" : "Market Ended — Awaiting Resolution")}
                  </div>
            ) : (
              <>
                <button onClick={() => { setBetSide("yes"); setBetOpen(true); }} className="flex-1 min-w-0 btn-yes py-3.5 sm:py-4 rounded-xl font-bold text-sm sm:text-base tracking-wide transition-all active:scale-95">{market?.isCryptoRound ? `Buy Up ${yesPercent}¢` : `Buy Yes ${yesPercent}¢`}</button>
                <button onClick={() => { setBetSide("no"); setBetOpen(true); }} className="flex-1 min-w-0 btn-no py-3.5 sm:py-4 rounded-xl font-bold text-sm sm:text-base tracking-wide transition-all active:scale-95">{market?.isCryptoRound ? `Buy Down ${noPercent}¢` : `Buy No ${noPercent}¢`}</button>
              </>
            )}
          </div>
        </div>
      )}

      <BetModal
        open={betOpen}
        onClose={() => { setBetOpen(false); setSelectedOptionId(null); }}
        side={betSide}
        price={selectedOptionObj ? Math.round(selectedOptionObj.price * 100) : (betSide === "yes" ? yesPercent : noPercent)}
        marketTitle={selectedOptionLabel ? `${market.title} — ${selectedOptionLabel}` : market.title}
        marketId={market.id}
        optionId={selectedOptionObj?.id}
        optionLabel={selectedOptionLabel ?? undefined}
        optionColor={selectedOptionColor}
        marketType={market.marketType}
      />

      <BoostMarketModal open={boostOpen} onClose={() => setBoostOpen(false)} marketId={market.id} marketTitle={market.title} />
      <AddLiquidityModal
        open={addLiquidityOpen}
        onClose={() => setAddLiquidityOpen(false)}
        marketId={market.id}
        marketTitle={market.title}
        currentLiquidity={market.liquidity}
      />
      
      <ShareModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        title={market.title}
        description={market.description}
        marketId={market.id}
        marketUrl={window.location.href}
        captureRef={shareRef}
      />
      
      <BottomNav />
    </div>
  );
};

export default MarketDetail;
