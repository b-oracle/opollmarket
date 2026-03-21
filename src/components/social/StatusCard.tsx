import { useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, Trash2, Loader2, MessageCircle, ExternalLink, Repeat2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import NftBadge, { type VerificationLevel } from "@/components/NftBadge";
import { toast } from "sonner";
import StatusComments from "./StatusComments";
import LiveAvatarBadge from "./LiveAvatarBadge";
import { useLiveSpaceUsers, useLiveSpaceForUser } from "@/hooks/useLiveSpaceUsers";
import { useActiveSpace } from "@/hooks/useActiveSpace";

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

const getInternalPath = (url: string): string | null => {
  try {
    const u = new URL(url);
    const isInternal =
      u.hostname === "opoll.org" ||
      u.hostname.endsWith(".lovable.app") ||
      u.hostname.endsWith(".lovableproject.com");
    if (isInternal) return u.pathname + u.search;
  } catch {}
  return null;
};

const RichContent = ({ content }: { content: string }) => {
  const segments = useMemo(() => parseContentWithLinks(content), [content]);
  return (
    <p className="text-sm whitespace-pre-wrap break-words">
      {segments.map((seg) => {
        if (seg.type === "link") {
          const internalPath = getInternalPath(seg.value);
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

interface StatusCardProps {
  status: {
    id: string;
    user_id: string;
    content: string;
    image_url?: string | null;
    likes_count: number;
    comments_count?: number;
    reposts_count?: number;
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
  const queryClient = useQueryClient();
  const [likeLoading, setLikeLoading] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [repostLoading, setRepostLoading] = useState(false);

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

  const name = profile?.display_name || "Anonymous";
  const vLevel = (profile?.verification_level || "none") as VerificationLevel;
  const timeAgo = formatDistanceToNow(new Date(status.created_at), { addSuffix: true });

  return (
    <motion.div
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
        <div
          className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30 overflow-hidden flex items-center justify-center shrink-0 cursor-pointer"
          onClick={() => navigate(`/user/${status.user_id}`)}
        >
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt={name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm font-bold text-primary">{name.charAt(0).toUpperCase()}</span>
          )}
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
              <img src={market.image_url} alt="" className="w-12 h-12 rounded object-cover shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold line-clamp-2">{market.title}</p>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                <span className="text-emerald-500">Yes {Math.round(market.yes_price * 100)}¢</span>
                <span className="text-rose-500">No {Math.round(market.no_price * 100)}¢</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Legacy image display */}
      {!market && status.image_url && (
        <img src={status.image_url} alt="" className="rounded-lg max-h-60 w-full object-cover" loading="lazy" />
      )}

      {/* Actions */}
      <div className="flex items-center gap-4 pt-1">
        <button
          onClick={handleLike}
          disabled={likeLoading}
          className={`flex items-center gap-1 text-xs transition-colors ${isLiked ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
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
          disabled={repostLoading}
          className={`flex items-center gap-1 text-xs transition-colors ${isReposted ? "text-emerald-500" : "text-muted-foreground hover:text-emerald-500"}`}
        >
          {repostLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Repeat2 className={`w-3.5 h-3.5 ${isReposted ? "stroke-[2.5]" : ""}`} />
          )}
          {(status.reposts_count || 0) > 0 && status.reposts_count}
        </button>
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
