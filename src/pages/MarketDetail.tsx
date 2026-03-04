import SEOHead from "@/components/SEOHead";
import { useParams, useNavigate } from "react-router-dom";
import watermarkLogo from "@/assets/watermark-logo.png";
import { ArrowLeft, Share2, Heart, Bookmark, TrendingUp, Users, Clock, Droplets, BarChart3, Zap, Send, CornerDownRight, ChevronDown, Loader2, Wallet } from "lucide-react";
import LogoLoader from "@/components/LogoLoader";
import { useMarket } from "@/hooks/useMarkets";
import { useActiveBoosts } from "@/hooks/useActiveBoosts";
import BoostCountdown from "@/components/BoostCountdown";
import { categoryIcons } from "@/data/markets";
import BottomNav from "@/components/BottomNav";

import BetModal from "@/components/BetModal";
import BoostMarketModal from "@/components/BoostMarketModal";
import ShareModal from "@/components/ShareModal";
import OrderBook from "@/components/OrderBook";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { useState, useEffect, useCallback, useRef } from "react";
import { usePriceHistory } from "@/hooks/usePriceHistory";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBookmark } from "@/hooks/useBookmark";
import { toast } from "sonner";

const formatVolume = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
};

const getTimeRemaining = (endDate: string) => {
  const diff = new Date(endDate).getTime() - Date.now();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days > 365) return `${Math.floor(days / 365)}y left`;
  if (days > 30) return `${Math.floor(days / 30)}mo left`;
  return `${days}d left`;
};

const optionColors = ["#02C7FC", "#EF4444", "#EAB308", "#A855F7", "#F97316", "#9CA3AF"];

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
  comment, isReply = false, onReply, onLike,
}: { comment: DbComment; isReply?: boolean; onReply: (id: string, author: string) => void; onLike: (id: string, liked: boolean) => void; }) => {
  const [showReplies, setShowReplies] = useState(true);
  const replies = comment.replies || [];
  return (
    <div className={isReply ? "ml-8 border-l border-border/30 pl-3" : ""}>
      <div className="flex gap-2.5 py-2.5">
        <div className="w-7 h-7 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
          <span className="text-[10px] font-bold text-primary">{comment.author_name.charAt(0).toUpperCase()}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-semibold">@{comment.author_name}</span>
            <span className="text-[10px] text-muted-foreground">{formatCommentTime(comment.created_at)}</span>
          </div>
          <p className="text-xs text-foreground/80 leading-relaxed break-words">{comment.content}</p>
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
          {showReplies && replies.map((r) => <InlineCommentItem key={r.id} comment={r} isReply onReply={onReply} onLike={onLike} />)}
        </div>
      )}
    </div>
  );
};

const InlineComments = ({ marketId }: { marketId: string }) => {
  const { user } = useAuth();
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
      const map = new Map<string, DbComment>();
      const topLevel: DbComment[] = [];
      for (const c of data || []) { map.set(c.id, { ...c, liked: likedIds.has(c.id), replies: [] }); }
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
      const authorName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "Anonymous";
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
          {comments.map((c) => <InlineCommentItem key={c.id} comment={c} onReply={handleReply} onLike={handleLike} />)}
        </div>
      )}
    </div>
  );
};

const MarketDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: market, isLoading } = useMarket(id);
  const { boostDetails } = useActiveBoosts();
  const activeBoost = id ? boostDetails.get(id) : undefined;

  const isMulti = market?.marketType === "multi" || market?.marketType === "range";
  const yesPercent = market ? Math.round(market.yesPrice * 100) : 0;
  const noPercent = market ? Math.round(market.noPrice * 100) : 0;

  const [timePeriod, setTimePeriod] = useState<"1D" | "1W" | "1M" | "All">("1M");
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const { bookmarked, toggleBookmark } = useBookmark(id);
  const [shareOpen, setShareOpen] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const shareRef = useRef<HTMLDivElement>(null);

  // Dynamic SEO via SEOHead
  const ogImageUrl = id ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/og-image?id=${id}` : undefined;

  const chartData = usePriceHistory(
    id, timePeriod, yesPercent, noPercent, isMulti, market?.options
  );

  const [betSide, setBetSide] = useState<"yes" | "no">("yes");
  const [betOpen, setBetOpen] = useState(false);
  const [boostOpen, setBoostOpen] = useState(false);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (isLoading) return <div className="h-dvh flex items-center justify-center"><LogoLoader size="lg" /></div>;
  if (!market) return <div className="h-dvh flex items-center justify-center text-muted-foreground">Market not found</div>;

  const selectedOptionIdx = selectedOption ? market.options?.findIndex(o => o.label === selectedOption) ?? -1 : -1;
  const selectedOptionObj = selectedOptionIdx >= 0 ? market.options?.[selectedOptionIdx] : null;
  const selectedOptionColor = selectedOptionIdx >= 0 ? optionColors[selectedOptionIdx % optionColors.length] : undefined;

  return (
    <div ref={pageRef} className="h-dvh bg-background overflow-y-auto" style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}>
      {market && <SEOHead title={market.title} description={market.description} path={`/market/${id}`} image={ogImageUrl} type="article" />}
      <div className="sticky top-0 z-20 glass-strong">
        <div className="flex items-center justify-between h-14 px-4 max-w-lg md:max-w-4xl mx-auto">
          <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full glass flex items-center justify-center"><ArrowLeft className="w-5 h-5" /></button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">{categoryIcons[market.category]} {market.category}</span>
            {isMulti && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary">{market.marketType === "range" ? "Range" : "Multi"}</span>}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setBoostOpen(true)} className="w-10 h-10 rounded-full glass flex items-center justify-center hover:bg-primary/20 transition-colors" title="Boost Market">
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
      <div ref={shareRef} className="absolute -left-[9999px] w-[600px] overflow-hidden rounded-xl bg-background" style={{ height: '400px' }}>
        {market.imageUrl && (
          <div className="absolute inset-0">
            <img src={market.imageUrl} alt="" className="w-full h-full object-cover opacity-30" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/85 to-background/50" />
          </div>
        )}
        {/* Probability ring or multi indicator */}
        <div className="absolute top-6 right-6 z-10">
          {isMulti ? (
            <div className="glass rounded-xl px-4 py-3 flex flex-col items-center gap-1">
              <BarChart3 className="w-6 h-6 text-primary" />
              <span className="text-xs font-bold text-primary uppercase">{market.options?.length} options</span>
            </div>
          ) : (
            <div className="relative w-24 h-24">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="34" fill="none" stroke="hsl(var(--muted))" strokeWidth="4" />
                <circle cx="40" cy="40" r="34" fill="none" stroke="hsl(var(--neon-yes))" strokeWidth="4" strokeDasharray={`${yesPercent * 2.136} ${213.6 - yesPercent * 2.136}`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold neon-yes">{yesPercent}%</span>
                <span className="text-[11px] text-muted-foreground">YES</span>
              </div>
            </div>
          )}
        </div>
        {/* Category badge */}
        <div className="absolute top-6 left-6 z-10">
          <span className="glass px-4 py-2 rounded-full text-sm font-medium text-foreground/80">
            {categoryIcons[market.category]} {market.category}
          </span>
        </div>
        {/* Bottom overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black/85 via-black/50 to-transparent">
          <h3 className="text-2xl font-bold text-white mb-2 leading-tight">{market.title}</h3>
          <p className="text-sm text-white/70 mb-4">{market.description}</p>
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
            <span className="text-[11px] text-white/50 font-mono shrink-0 ml-3 flex items-center gap-1">
              <Clock className="w-3 h-3" /> {getTimeRemaining(market.endDate)} · {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
        {/* Watermark */}
        <div className="absolute bottom-3 right-4 z-20 opacity-40">
          <img src={watermarkLogo} alt="" className="h-7 w-auto" />
        </div>
      </div>

      {/* Visible banner */}
      {market.imageUrl && (() => {
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
          <div className="h-40 w-full overflow-hidden">
            <img src={market.imageUrl} alt={market.title} className="w-full h-full object-cover blur-[2px] opacity-70 scale-110 will-change-transform" style={{ transform: `scale(1.1) translateY(${scrollY * 0.15}px)` }} />
          </div>
          <div className="absolute inset-0 bg-black/50" />
          {activeBoost && (
            <div
              className="absolute inset-0 pointer-events-none animate-pulse"
              style={{
                background: `radial-gradient(ellipse at 50% 0%, ${boostGlowColor?.replace('0.6', '0.15')} 0%, transparent 70%)`,
              }}
            />
          )}
          <div className="absolute inset-0 animate-banner-shimmer pointer-events-none" style={{ background: activeBoost
            ? `linear-gradient(105deg, transparent 35%, ${boostGlowColor?.replace('0.6', '0.15')} 50%, transparent 65%)`
            : 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.08) 50%, transparent 60%)', backgroundSize: '200% 100%' }} />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
            <h1 className="text-lg font-bold text-white leading-snug drop-shadow-lg">{market.title}</h1>
            <p className="text-xs text-white/70 mt-1.5 drop-shadow-md line-clamp-2">{market.description}</p>
            <span className="text-[10px] text-white/50 font-mono mt-2 flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" /> {getTimeRemaining(market.endDate)} · {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
        );
      })()}

      <div className={`${market.imageUrl ? 'pt-4' : 'pt-4'}`}>
        {!market.imageUrl && <h1 className="text-2xl font-bold leading-tight mb-2">{market.title}</h1>}
        {!market.imageUrl && <p className="text-sm text-muted-foreground mb-6">{market.description}</p>}

        {activeBoost && (
          <div className="mb-4">
            <BoostCountdown endsAt={activeBoost.ends_at} tier={activeBoost.tier} />
          </div>
        )}

        {/* Chart */}
        <div className="glass rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">{isMulti ? "Option Probabilities" : "Probability"}</span>
            {!isMulti && (
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-destructive">NO {noPercent}¢</span>
                <span className="text-2xl font-bold neon-yes">YES {yesPercent}¢</span>
              </div>
            )}
          </div>
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
                      strokeWidth={selectedOption === opt.id || !selectedOption ? 2 : 0.5}
                      fill={`url(#grad-${opt.id})`} fillOpacity={selectedOption === opt.id || !selectedOption ? 1 : 0.1}
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
            <img src={watermarkLogo} alt="" className="absolute inset-0 m-auto opacity-30 pointer-events-none scale-[0.4]" />
          </div>
          {isMulti && market.options && (
            <div className="flex flex-wrap gap-2 mt-3">
              {market.options.map((opt, i) => (
                <button key={opt.id} onClick={() => setSelectedOption(selectedOption === opt.id ? null : opt.id)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all ${selectedOption === opt.id ? "bg-secondary ring-1 ring-primary/30" : "hover:bg-muted/50"}`}>
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
                  onClick={() => { setSelectedOption(opt.label); setBetSide("yes"); setBetOpen(true); }}
                  className="w-full relative rounded-xl px-4 py-3.5 flex items-center justify-between transition-all active:scale-[0.98] overflow-hidden cursor-pointer"
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
          <div className="glass rounded-xl p-2.5 sm:p-3"><div className="flex items-center gap-2 text-muted-foreground mb-1"><Droplets className="w-3.5 h-3.5" /><span className="text-[11px] sm:text-xs">Liquidity</span></div><span className="text-base sm:text-lg font-bold">{formatVolume(market.liquidity)}</span></div>
          <div className="glass rounded-xl p-2.5 sm:p-3"><div className="flex items-center gap-2 text-muted-foreground mb-1"><Users className="w-3.5 h-3.5" /><span className="text-[11px] sm:text-xs">Traders</span></div><span className="text-base sm:text-lg font-bold">{market.participants.toLocaleString()}</span></div>
          <div className="glass rounded-xl p-2.5 sm:p-3"><div className="flex items-center gap-2 text-muted-foreground mb-1"><Clock className="w-3.5 h-3.5" /><span className="text-[11px] sm:text-xs">Ends</span></div><span className="text-base sm:text-lg font-bold">{getTimeRemaining(market.endDate)}</span></div>
        </div>

        {!isMulti && <OrderBook yesPrice={yesPercent} noPrice={noPercent} liquidity={market.liquidity} marketId={market.id} />}

        <CreatorCard creatorName={market.creatorName} creatorUserId={market.creatorAddress} />

        <InlineComments marketId={market.id} />
      </div>

      {!isMulti && (
        <div className="fixed bottom-16 left-0 right-0 z-30 px-4 pb-3 pt-2 bg-gradient-to-t from-background via-background/95 to-transparent" style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))' }}>
          <div className="max-w-lg mx-auto flex gap-3">
            <button onClick={() => { setBetSide("yes"); setBetOpen(true); }} className="flex-1 btn-yes py-3.5 sm:py-4 rounded-xl font-bold text-sm sm:text-base tracking-wide transition-all active:scale-95">YES {yesPercent}¢</button>
            <button onClick={() => { setBetSide("no"); setBetOpen(true); }} className="flex-1 btn-no py-3.5 sm:py-4 rounded-xl font-bold text-sm sm:text-base tracking-wide transition-all active:scale-95">NO {noPercent}¢</button>
          </div>
        </div>
      )}

      <BetModal
        open={betOpen}
        onClose={() => { setBetOpen(false); setSelectedOption(null); }}
        side={betSide}
        price={selectedOptionObj ? Math.round(selectedOptionObj.price * 100) : (betSide === "yes" ? yesPercent : noPercent)}
        marketTitle={selectedOption ? `${market.title} — ${selectedOption}` : market.title}
        marketId={market.id}
        optionId={selectedOptionObj?.id}
        optionLabel={selectedOption ?? undefined}
        optionColor={selectedOptionColor}
      />

      <BoostMarketModal open={boostOpen} onClose={() => setBoostOpen(false)} marketId={market.id} marketTitle={market.title} />
      <ShareModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        title={market.title}
        description={market.description}
        marketUrl={window.location.href}
        captureRef={shareRef}
      />
      
      <BottomNav />
    </div>
  );
};

export default MarketDetail;
