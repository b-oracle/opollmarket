import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowDownLeft, ArrowUpRight, MessageCircle, Heart, TrendingUp, TrendingDown,
  Loader2, Zap, Activity, ChevronLeft, ChevronRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const ITEMS_PER_PAGE = 10;

interface ActivityFeedProps {
  userId: string;
  isOwnProfile: boolean;
  isPublic: boolean;
}

const ActivityFeed = ({ userId, isOwnProfile, isPublic }: ActivityFeedProps) => {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  // Trades (buy/sell transactions)
  const { data: trades = [], isLoading: loadingTrades } = useQuery({
    queryKey: ["activity-trades", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("id, type, side, amount, shares, price, market_id, created_at, status")
        .eq("user_id", userId)
        .in("type", ["buy", "sell"])
        .eq("status", "confirmed")
        .order("created_at", { ascending: false })
        .limit(100);
      return data || [];
    },
    enabled: isOwnProfile || isPublic,
  });

  // Comments
  const { data: comments = [], isLoading: loadingComments } = useQuery({
    queryKey: ["activity-comments", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("comments")
        .select("id, content, market_id, created_at")
        .eq("author_wallet", userId)
        .order("created_at", { ascending: false })
        .limit(100);
      return data || [];
    },
    enabled: isOwnProfile || isPublic,
  });

  // Likes
  const { data: likes = [], isLoading: loadingLikes } = useQuery({
    queryKey: ["activity-likes", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("market_likes")
        .select("id, market_id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100);
      return data || [];
    },
    enabled: isOwnProfile || isPublic,
  });

  // Get market titles for all referenced markets
  const allMarketIds = [
    ...trades.map((t: any) => t.market_id),
    ...comments.map((c: any) => c.market_id),
    ...likes.map((l: any) => l.market_id),
  ].filter(Boolean);

  const uniqueMarketIds = [...new Set(allMarketIds)];

  const { data: marketMap = new Map() } = useQuery({
    queryKey: ["activity-markets", uniqueMarketIds.join(",")],
    queryFn: async () => {
      if (uniqueMarketIds.length === 0) return new Map();
      const { data } = await supabase
        .from("markets")
        .select("id, title")
        .in("id", uniqueMarketIds.slice(0, 50));
      return new Map((data || []).map((m: any) => [m.id, m.title]));
    },
    enabled: uniqueMarketIds.length > 0,
  });

  // Merge all activities into a single sorted feed
  type FeedItem = {
    id: string;
    type: "trade" | "comment" | "like";
    created_at: string;
    market_id?: string;
    data: any;
  };

  const feed: FeedItem[] = [
    ...trades.map((t: any) => ({ id: `t-${t.id}`, type: "trade" as const, created_at: t.created_at, market_id: t.market_id, data: t })),
    ...comments.map((c: any) => ({ id: `c-${c.id}`, type: "comment" as const, created_at: c.created_at, market_id: c.market_id, data: c })),
    ...likes.map((l: any) => ({ id: `l-${l.id}`, type: "like" as const, created_at: l.created_at, market_id: l.market_id, data: l })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const totalPages = Math.max(1, Math.ceil(feed.length / ITEMS_PER_PAGE));
  const paginatedFeed = feed.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const isLoading = loadingTrades || loadingComments || loadingLikes;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  if (feed.length === 0) {
    return (
      <div className="flex flex-col items-center py-16">
        <Activity className="w-8 h-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">No recent activity</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 mb-6">
      {paginatedFeed.map((item, i) => {
        const marketTitle = item.market_id ? (marketMap as Map<string, string>).get(item.market_id) : null;
        const timeAgo = formatDistanceToNow(new Date(item.created_at), { addSuffix: true });

        return (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.02 }}
            className="glass rounded-xl p-3 flex items-start gap-3 cursor-pointer hover:bg-accent/30 transition-colors"
            onClick={() => item.market_id && navigate(`/market/${item.market_id}`)}
          >
            {/* Icon */}
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
              item.type === "trade"
                ? item.data.type === "buy"
                  ? "bg-primary/10 text-primary"
                  : "bg-destructive/10 text-destructive"
                : item.type === "comment"
                ? "bg-accent text-accent-foreground"
                : "bg-primary/10 text-primary"
            }`}>
              {item.type === "trade" ? (
                item.data.type === "buy" ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />
              ) : item.type === "comment" ? (
                <MessageCircle className="w-4 h-4" />
              ) : (
                <Heart className="w-4 h-4 fill-current" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {item.type === "trade" && (
                <>
                  <p className="text-sm font-medium">
                    <span className={item.data.type === "buy" ? "text-primary" : "text-destructive"}>
                      {item.data.type === "buy" ? "Bought" : "Sold"}
                    </span>{" "}
                    <span className="font-bold">{item.data.side?.toUpperCase()}</span>{" "}
                    · ${Number(item.data.amount).toFixed(2)}
                  </p>
                  {marketTitle && (
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">{marketTitle}</p>
                  )}
                </>
              )}
              {item.type === "comment" && (
                <>
                  <p className="text-sm font-medium line-clamp-2">"{item.data.content}"</p>
                  {marketTitle && (
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">on {marketTitle}</p>
                  )}
                </>
              )}
              {item.type === "like" && (
                <>
                  <p className="text-sm font-medium">Liked a market</p>
                  {marketTitle && (
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">{marketTitle}</p>
                  )}
                </>
              )}
              <p className="text-[9px] text-muted-foreground mt-1">{timeAgo}</p>
            </div>
          </motion.div>
        );
      })}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="w-8 h-8 rounded-lg glass flex items-center justify-center disabled:opacity-30 hover:bg-muted transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-medium text-muted-foreground">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="w-8 h-8 rounded-lg glass flex items-center justify-center disabled:opacity-30 hover:bg-muted transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default ActivityFeed;
