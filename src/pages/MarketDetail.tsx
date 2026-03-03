import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Share2, Heart, TrendingUp, Users, Clock, Droplets, BarChart3, Zap, Send, CornerDownRight, ChevronDown, Loader2 } from "lucide-react";
import { useMarket } from "@/hooks/useMarkets";
import { categoryIcons } from "@/data/markets";
import BottomNav from "@/components/BottomNav";
import BetModal from "@/components/BetModal";
import BoostMarketModal from "@/components/BoostMarketModal";
import ShareModal from "@/components/ShareModal";
import OrderBook from "@/components/OrderBook";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
    try {
      if (alreadyLiked) { await supabase.from("comment_likes").delete().eq("comment_id", commentId).eq("wallet_address", walletId); }
      else { await supabase.from("comment_likes").insert({ comment_id: commentId, wallet_address: walletId }); }
      const updateLike = (arr: DbComment[]): DbComment[] =>
        arr.map((c) => ({ ...c, liked: c.id === commentId ? !alreadyLiked : c.liked, likes_count: c.id === commentId ? (alreadyLiked ? c.likes_count - 1 : c.likes_count + 1) : c.likes_count, replies: updateLike(c.replies || []) }));
      setComments(updateLike);
    } catch (err) { console.error("Failed to toggle like:", err); }
  };

  const handleReply = (commentId: string, author: string) => { setReplyTo({ id: commentId, author }); setInputValue(`@${author} `); };
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

  const isMulti = market?.marketType === "multi" || market?.marketType === "range";
  const yesPercent = market ? Math.round(market.yesPrice * 100) : 0;
  const noPercent = market ? Math.round(market.noPrice * 100) : 0;

  const [timePeriod, setTimePeriod] = useState<"1D" | "1W" | "1M" | "All">("1M");
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);

  const pointsMap = { "1D": 24, "1W": 7, "1M": 30, "All": 90 };

  const chartData = useMemo(() => {
    if (!market) return [];
    const points = pointsMap[timePeriod];
    if (isMulti && market.options) {
      return Array.from({ length: points }, (_, i) => {
        const entry: Record<string, number> = { day: i + 1 };
        market.options!.forEach((opt, oi) => {
          const volatility = { "1D": 2, "1W": 4, "1M": 5, "All": 8 }[timePeriod];
          const base = opt.price * 100 - volatility;
          const seed = i * 0.8 + points + oi * 7;
          const noise = Math.sin(seed) * volatility + Math.cos(seed * 0.3) * (volatility * 0.4);
          const trend = ((opt.price * 100 - base) / points) * i;
          entry[opt.label] = i === points - 1 ? Math.round(opt.price * 100) : Math.max(1, Math.min(95, Math.round(base + trend + noise)));
        });
        return entry;
      });
    }
    const volatility = { "1D": 3, "1W": 6, "1M": 8, "All": 12 }[timePeriod];
    const base = yesPercent - volatility * 1.5;
    return Array.from({ length: points }, (_, i) => {
      const seed = i * 0.8 + points;
      const noise = Math.sin(seed) * volatility + Math.cos(seed * 0.3) * (volatility * 0.6);
      const trend = ((yesPercent - base) / points) * i;
      const value = Math.max(5, Math.min(95, Math.round(base + trend + noise)));
      return { day: i + 1, yes: i === points - 1 ? yesPercent : value, no: i === points - 1 ? noPercent : 100 - value };
    });
  }, [market, yesPercent, noPercent, timePeriod, isMulti]);

  const [betSide, setBetSide] = useState<"yes" | "no">("yes");
  const [betOpen, setBetOpen] = useState(false);
  const [boostOpen, setBoostOpen] = useState(false);

  if (isLoading) return <div className="h-dvh flex items-center justify-center"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>;
  if (!market) return <div className="h-dvh flex items-center justify-center text-muted-foreground">Market not found</div>;

  const selectedOptionObj = selectedOption ? market.options?.find(o => o.label === selectedOption) : null;

  return (
    <div className="h-dvh bg-background overflow-y-auto pb-20">
      <div className="sticky top-0 z-20 glass-strong">
        <div className="flex items-center justify-between h-14 px-4 max-w-lg mx-auto">
          <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full glass flex items-center justify-center"><ArrowLeft className="w-5 h-5" /></button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">{categoryIcons[market.category]} {market.category}</span>
            {isMulti && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary">{market.marketType === "range" ? "Range" : "Multi"}</span>}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setBoostOpen(true)} className="w-10 h-10 rounded-full glass flex items-center justify-center hover:bg-primary/20 transition-colors" title="Boost Market">
              <Zap className="w-5 h-5 text-primary" />
            </button>
            <button onClick={() => { setLiked(p => !p); toast.success(liked ? "Removed from favorites" : "Added to favorites"); }} className="w-10 h-10 rounded-full glass flex items-center justify-center hover:bg-primary/20 transition-colors">
              <Heart className={`w-5 h-5 transition-colors ${liked ? "text-destructive fill-destructive" : ""}`} />
            </button>
            <button onClick={() => setShareOpen(true)} className="w-10 h-10 rounded-full glass flex items-center justify-center hover:bg-primary/20 transition-colors"><Share2 className="w-5 h-5" /></button>
          </div>
        </div>
      </div>

      {market.imageUrl && (
        <div className="relative w-full max-w-lg mx-auto">
          <div className="aspect-video w-full overflow-hidden">
            <img
              src={market.imageUrl}
              alt={market.title}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
        </div>
      )}

      <div className={`max-w-lg mx-auto px-4 ${market.imageUrl ? 'pt-2' : 'pt-4'}`}>
        <h1 className="text-2xl font-bold leading-tight mb-2">{market.title}</h1>
        <p className="text-sm text-muted-foreground mb-6">{market.description}</p>

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
          <div className="h-40">
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
                  formatter={(value: number, name: string) => [`${value}¢`, name]} labelFormatter={(label) => `Day ${label}`} />
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
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="glass rounded-xl p-3"><div className="flex items-center gap-2 text-muted-foreground mb-1"><TrendingUp className="w-3.5 h-3.5" /><span className="text-xs">Volume</span></div><span className="text-lg font-bold">{formatVolume(market.volume)}</span></div>
          <div className="glass rounded-xl p-3"><div className="flex items-center gap-2 text-muted-foreground mb-1"><Droplets className="w-3.5 h-3.5" /><span className="text-xs">Liquidity</span></div><span className="text-lg font-bold">{formatVolume(market.liquidity)}</span></div>
          <div className="glass rounded-xl p-3"><div className="flex items-center gap-2 text-muted-foreground mb-1"><Users className="w-3.5 h-3.5" /><span className="text-xs">Traders</span></div><span className="text-lg font-bold">{market.participants.toLocaleString()}</span></div>
          <div className="glass rounded-xl p-3"><div className="flex items-center gap-2 text-muted-foreground mb-1"><Clock className="w-3.5 h-3.5" /><span className="text-xs">Ends</span></div><span className="text-lg font-bold">{getTimeRemaining(market.endDate)}</span></div>
        </div>

        {!isMulti && <OrderBook yesPrice={yesPercent} noPrice={noPercent} liquidity={market.liquidity} />}

        <div className="glass rounded-xl p-4 mb-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
            <span className="font-bold text-primary">{market.creatorName.charAt(0)}</span>
          </div>
          <div>
            <p className="text-sm font-semibold">@{market.creatorName}</p>
            <p className="text-xs text-muted-foreground">{market.creatorAddress}</p>
          </div>
        </div>

        <InlineComments marketId={market.id} />
      </div>

      {!isMulti && (
        <div className="fixed bottom-16 left-0 right-0 z-30 px-4 pb-3 pt-2 bg-gradient-to-t from-background via-background/95 to-transparent">
          <div className="max-w-lg mx-auto flex gap-3">
            <button onClick={() => { setBetSide("yes"); setBetOpen(true); }} className="flex-1 btn-yes py-4 rounded-xl font-bold text-base tracking-wide transition-all active:scale-95">YES {yesPercent}¢</button>
            <button onClick={() => { setBetSide("no"); setBetOpen(true); }} className="flex-1 btn-no py-4 rounded-xl font-bold text-base tracking-wide transition-all active:scale-95">NO {noPercent}¢</button>
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
      />

      <BoostMarketModal open={boostOpen} onClose={() => setBoostOpen(false)} marketId={market.id} marketTitle={market.title} />
      <ShareModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        title={market.title}
        description={market.description}
        marketUrl={window.location.href}
        captureRef={pageRef}
      />
      <BottomNav />
    </div>
  );
};

export default MarketDetail;
