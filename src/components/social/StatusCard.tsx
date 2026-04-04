import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, Trash2, Loader2, MessageCircle, ExternalLink, Repeat2, BarChart3, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import NftBadge, { type VerificationLevel } from "@/components/NftBadge";
import { toast } from "sonner";
import StatusComments from "./StatusComments";
import { optimizedImageUrl } from "@/lib/optimizedImage";
import LiveAvatarBadge from "./LiveAvatarBadge";
import { useLiveSpaceUsers, useLiveSpaceForUser } from "@/hooks/useLiveSpaceUsers";
import { useActiveSpace } from "@/hooks/useActiveSpace";
import { getInternalPathFromUrl } from "@/lib/internalLinks";

/** Detect URLs in text and return array of text/link segments */
const URL_REGEX = /(https?:\/\/[^\s]+)/g;

const parseContentWithLinks = (text: string) => {
  const parts = text.split(URL_REGEX);
  return parts.map((part, i) => {
    if (URL_REGEX.test(part)) {
      URL_REGEX.lastIndex = 0;
      return { type: "link" as const, value: part, key: i };
    }
    return { type: "text" as const, value: part, key: i };
  });
};

const RichContent = ({ content }: { content: string }) => {
  const segments = useMemo(() => parseContentWithLinks(content), [content]);
  return (
    <p className="text-sm whitespace-pre-wrap break-words">
      {segments.map((seg) => {
        if (seg.type === "link") {
          const internalPath = getInternalPathFromUrl(seg.value);
          if (internalPath) {
            return (
              <Link
                key={seg.key}
                to={internalPath}
                className="text-primary hover:underline inline-flex items-center gap-0.5"
                onClick={(e) => e.stopPropagation()}
              >
                {internalPath.startsWith("/market/")
                  ? "🔗 View Market"
                  : internalPath.startsWith("/user/")
                  ? "🔗 View Profile"
                  : "🔗 Open Link"}
              </Link>
            );
          }
          return (
            <a
              key={seg.key}
              href={seg.value}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              {new URL(seg.value).hostname} <ExternalLink className="w-3 h-3 inline" />
            </a>
          );
        }
        return <span key={seg.key}>{seg.value}</span>;
      })}
    </p>
  );
};

const formatViewCount = (count: number) => {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
};

interface StatusCardProps {
  status: {
    id: string;
    user_id: string;
    content: string;
    image_url?: string | null;
    likes_count: number;
    comments_count?: number;
    reposts_count?: number;
    views_count?: number;
    created_at: string;
    market_id?: string | null;
  };
  profile?: {
    display_name?: string | null;
    avatar_url?: string | null;
    verification_level?: string;
  } | null;
  market?: {
    id: string;
    title: string;
    image_url?: string | null;
    yes_price: number;
    no_price: number;
    status?: string;
  } | null;
  index?: number;
  repostedBy?: {
    name: string;
    userId: string;
  } | null;
}

const StatusCard = ({ status, profile, market, index = 0, repostedBy }: StatusCardProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isFeatureEnabled } = useFeatureToggles();
  const queryClient = useQueryClient();
  const [likeLoading, setLikeLoading] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [repostLoading, setRepostLoading] = useState(false);
  const [replacingImage, setReplacingImage] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const viewTracked = useRef(false);
  const liveUserIds = useLiveSpaceUsers();
  const liveSpace = useLiveSpaceForUser(liveUserIds.has(status.user_id) ? status.user_id : undefined);
  const { joinSpace } = useActiveSpace();
  const isUserLive = liveUserIds.has(status.user_id);

  // Track view when post becomes visible
  useEffect(() => {
    if (!user || viewTracked.current) return;
    const el = cardRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !viewTracked.current) {
          viewTracked.current = true;
          supabase
            .from("status_views" as any)
            .upsert(
              { status_id: status.id, user_id: user.id },
              { onConflict: "status_id,user_id" }
            )
            .then(() => {});
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [user, status.id]);

  const { data: isLiked = false } = useQuery({
    queryKey: ["status-liked", status.id, user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { count } = await supabase
        .from("status_likes")
        .select("id", { count: "exact", head: true })
        .eq("status_id", status.id)
        .eq("user_id", user.id);
      return (count || 0) > 0;
    },
    enabled: !!user,
  });

  const { data: isReposted = false } = useQuery({
    queryKey: ["status-reposted", status.id, user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { count } = await supabase
        .from("status_reposts")
        .select("id", { count: "exact", head: true })
        .eq("status_id", status.id)
        .eq("user_id", user.id);
      return (count || 0) > 0;
    },
    enabled: !!user,
  });

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) { toast.error("Sign in to like"); return; }
    setLikeLoading(true);
    try {
      if (isLiked) {
        await supabase.from("status_likes").delete().eq("status_id", status.id).eq("user_id", user.id);
      } else {
        await supabase.from("status_likes").insert({ status_id: status.id, user_id: user.id });
      }
      queryClient.invalidateQueries({ queryKey: ["status-liked", status.id] });
      queryClient.invalidateQueries({ queryKey: ["status-feed"] });
      queryClient.invalidateQueries({ queryKey: ["activity-statuses"] });
    } catch {
      toast.error("Failed");
    } finally {
      setLikeLoading(false);
    }
  };

  const handleRepost = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) { toast.error("Sign in to repoll"); return; }
    if (user.id === status.user_id) { toast.error("Can't repoll your own post"); return; }
    setRepostLoading(true);
    try {
      if (isReposted) {
        await supabase.from("status_reposts").delete().eq("status_id", status.id).eq("user_id", user.id);
        toast.success("Repoll removed");
      } else {
        await supabase.from("status_reposts").insert({ status_id: status.id, user_id: user.id });
        toast.success("Repolled!");
      }
      queryClient.invalidateQueries({ queryKey: ["status-reposted", status.id] });
      queryClient.invalidateQueries({ queryKey: ["status-feed"] });
    } catch {
      toast.error("Failed");
    } finally {
      setRepostLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const { error } = await supabase.from("status_updates").delete().eq("id", status.id);
    if (error) { toast.error("Failed to delete"); return; }
    queryClient.invalidateQueries({ queryKey: ["status-feed"] });
    queryClient.invalidateQueries({ queryKey: ["activity-statuses"] });
    toast.success("Deleted");
  };

  const handleReplaceMarketImage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!market || !user) return;
    setReplacingImage(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-social-content", {
        body: { type: "image", caption: status.content || market.title, market_id: market.id },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      if (data?.imageUrl) {
        toast.success(`Image replaced ($${data.cost || "0.50"})`);
        queryClient.invalidateQueries({ queryKey: ["status-feed"] });
        queryClient.invalidateQueries({ queryKey: ["markets"] });
        queryClient.invalidateQueries({ queryKey: ["balance"] });
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to replace image");
    } finally {
      setReplacingImage(false);
    }
  };

  const name = profile?.display_name || "Anonymous";
  const vLevel = (profile?.verification_level || "none") as VerificationLevel;
  const timeAgo = formatDistanceToNow(new Date(status.created_at), { addSuffix: true });

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="glass rounded-xl p-3 space-y-2"
    >
      {/* Repost header */}
      {repostedBy && (
        <div
          className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer hover:underline -mt-1 mb-1"
          onClick={() => navigate(`/user/${repostedBy.userId}`)}
        >
          <Repeat2 className="w-3 h-3" />
          <span>{repostedBy.name} repolled</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="relative shrink-0">
          <div
            className={`w-9 h-9 rounded-full bg-primary/20 border ${isUserLive ? "border-destructive" : "border-primary/30"} overflow-hidden flex items-center justify-center cursor-pointer`}
            onClick={(e) => {
              e.stopPropagation();
              if (isUserLive && liveSpace) {
                joinSpace({ id: liveSpace.spaceId, title: liveSpace.title, hostId: liveSpace.hostId });
              } else {
                navigate(`/user/${status.user_id}`);
              }
            }}
          >
            {profile?.avatar_url ? (
              <img src={optimizedImageUrl(profile.avatar_url, "avatar-md")} alt={name} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <span className="text-sm font-bold text-primary">{name.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <LiveAvatarBadge isLive={isUserLive} />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-semibold truncate flex items-center gap-1 cursor-pointer hover:underline"
            onClick={() => navigate(`/user/${status.user_id}`)}
          >
            {name}
            {vLevel !== "none" && <NftBadge level={vLevel} size={14} />}
          </p>
          <p className="text-[9px] text-muted-foreground">{timeAgo}</p>
        </div>
        {user?.id === status.user_id && (
          <button onClick={handleDelete} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Content */}
      <RichContent content={status.content} />

      {/* Market preview card */}
      {market && (
        <div
          onClick={() => navigate(`/market/${market.id}`)}
          className="rounded-lg border border-border overflow-hidden cursor-pointer hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-2 p-2">
            {market.image_url && (
              <img src={optimizedImageUrl(market.image_url, "thumb")} alt="" className="w-12 h-12 rounded object-contain bg-muted/30 shrink-0" loading="lazy" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold line-clamp-2">{market.title}</p>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                <span className="text-emerald-500">Yes {Math.round(market.yes_price * 100)}¢</span>
                <span className="text-rose-500">No {Math.round(market.no_price * 100)}¢</span>
              </div>
            </div>
            {user?.id === status.user_id && isFeatureEnabled("ai_social_generation") && (
              <button
                onClick={handleReplaceMarketImage}
                disabled={replacingImage}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-muted transition-colors shrink-0"
                title="Replace image with AI"
              >
                {replacingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Legacy image display */}
      {!market && status.image_url && (
        <div className="rounded-lg overflow-hidden bg-muted/20">
          <img src={optimizedImageUrl(status.image_url, "card")} alt="" className="w-full max-h-96 object-cover rounded-lg" loading="lazy" />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-4 pt-1">
        <button
          onClick={handleLike}
          disabled={likeLoading}
          className={`flex items-center gap-1 text-xs transition-colors ${isLiked ? "text-destructive" : "text-muted-foreground hover:text-destructive"}`}
        >
          {likeLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Heart className={`w-3.5 h-3.5 ${isLiked ? "fill-current" : ""}`} />
          )}
          {status.likes_count > 0 && status.likes_count}
        </button>
        <button
          onClick={() => setShowComments(!showComments)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          {(status.comments_count || 0) > 0 && status.comments_count}
        </button>
        <button
          onClick={handleRepost}
          disabled={repostLoading || (!!user && user.id === status.user_id)}
          className={`flex items-center gap-1 text-xs transition-colors ${isReposted && user?.id !== status.user_id ? "text-emerald-500" : "text-muted-foreground hover:text-emerald-500"} ${user?.id === status.user_id ? "opacity-40 cursor-not-allowed hover:text-muted-foreground" : ""}`}
        >
          {repostLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Repeat2 className={`w-3.5 h-3.5 ${isReposted && user?.id !== status.user_id ? "stroke-[2.5]" : ""}`} />
          )}
          {(status.reposts_count || 0) > 0 && status.reposts_count}
        </button>
        {(status.views_count || 0) > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
            <BarChart3 className="w-3.5 h-3.5" />
            {formatViewCount(status.views_count || 0)}
          </span>
        )}
      </div>

      {/* Comments Section */}
      <AnimatePresence>
        {showComments && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-border pt-2"
          >
            <StatusComments statusId={status.id} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default StatusCard;

