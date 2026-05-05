import { useState, useEffect, useRef, useCallback } from "react";
import ChatDoodleBackground from "./ChatDoodleBackground";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Send, X, Reply, Copy, BadgeCheck, TrendingUp, Pencil, Trash2, Check } from "lucide-react";
import MarketTagSelector, { type MarketTag } from "@/components/social/MarketTagSelector";
import { optimizedImageUrl } from "@/lib/optimizedImage";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const REACTION_EMOJIS = ["❤️", "😂", "👍", "😮", "😢", "🔥"];

interface CommunityChatProps {
  slug: string;
  label: string;
  onBack: () => void;
}

const SLUG_TO_CATEGORY: Record<string, string> = {
  crypto: "Crypto",
  sports: "Sports",
  politics: "Politics",
  entertainment: "Entertainment",
  economy: "Economy",
  "ai-tech": "AI & Tech",
  science: "Science",
  forex: "Forex",
  commodities: "Commodities",
  "twitter-x": "Twitter/X",
};

interface CommunityMessage {
  id: string;
  community_slug: string;
  user_id: string;
  content: string;
  image_url: string | null;
  reply_to_id: string | null;
  reply_to_content: string | null;
  reply_to_name: string | null;
  reactions: Record<string, string[]>;
  tagged_market_ids: string[];
  tagged_markets?: MarketTag[];
  created_at: string;
  edited_at?: string | null;
  profile?: { display_name: string; avatar_url: string | null; verification_level?: string };
}

const CommunityChat = ({ slug, label, onBack }: CommunityChatProps) => {
  const { user } = useAuth();
  const { isFeatureEnabled } = useFeatureToggles();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [replyTo, setReplyTo] = useState<CommunityMessage | null>(null);
  const [activeReactionId, setActiveReactionId] = useState<string | null>(null);
  const [flipReactions, setFlipReactions] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showTagSelector, setShowTagSelector] = useState(false);
  const [taggedMarkets, setTaggedMarkets] = useState<MarketTag[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const categoryFilter = SLUG_TO_CATEGORY[slug] || undefined;

  const { data: isMember, refetch: refetchMembership } = useQuery({
    queryKey: ["community-membership", user?.id, slug],
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase
        .from("community_memberships" as any)
        .select("id")
        .eq("user_id", user.id)
        .eq("community_slug", slug)
        .maybeSingle() as any;
      return !!data;
    },
    enabled: !!user,
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["community-messages", slug],
    queryFn: async () => {
      const { data: msgs } = await supabase
        .from("community_messages" as any)
        .select("*")
        .eq("community_slug", slug)
        .order("created_at", { ascending: true })
        .limit(200) as any;

      if (!msgs || msgs.length === 0) return [];

      const userIds = [...new Set(msgs.map((m: any) => m.user_id))] as string[];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, verification_level")
        .in("id", userIds);

      const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

      // Collect all tagged market IDs
      const allTaggedIds = [...new Set(msgs.flatMap((m: any) => m.tagged_market_ids || []))].filter(Boolean) as string[];
      let taggedMarketMap = new Map<string, MarketTag>();
      if (allTaggedIds.length > 0) {
        const { data: taggedData } = await supabase
          .from("markets")
          .select("id, title, yes_price, image_url")
          .in("id", allTaggedIds);
        if (taggedData) {
          taggedData.forEach((tm) => taggedMarketMap.set(tm.id, { id: tm.id, title: tm.title, yes_price: tm.yes_price, image_url: tm.image_url }));
        }
      }

      return msgs.map((m: any) => ({
        ...m,
        reactions: m.reactions || {},
        tagged_market_ids: m.tagged_market_ids || [],
        tagged_markets: (m.tagged_market_ids || []).map((id: string) => taggedMarketMap.get(id)).filter(Boolean),
        profile: profileMap.get(m.user_id) || { display_name: "User", avatar_url: null },
      }));
    },
    enabled: !!user,
    refetchInterval: 5000,
  });

  useEffect(() => {
    const channel = supabase
      .channel(`community-${slug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "community_messages", filter: `community_slug=eq.${slug}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["community-messages", slug] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [slug, queryClient]);

  // Mark community as read on mount and whenever new messages arrive
  useEffect(() => {
    if (user) {
      import("@/lib/communityReads").then(({ markCommunityReadRemote }) => {
        void markCommunityReadRemote(user.id, slug);
      });
      queryClient.invalidateQueries({ queryKey: ["unread-community"] });
      queryClient.invalidateQueries({ queryKey: ["community-unread-per-slug"] });
    }
  }, [slug, user, messages.length, queryClient]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "instant" as any });
  }, [messages.length]);

  const toggleMembership = async () => {
    if (!user) return;
    if (isMember) {
      await supabase.from("community_memberships" as any).delete().eq("user_id", user.id).eq("community_slug", slug);
    } else {
      await supabase.from("community_memberships" as any).insert({ user_id: user.id, community_slug: slug } as any);
    }
    refetchMembership();
    queryClient.invalidateQueries({ queryKey: ["community-memberships"] });
    queryClient.invalidateQueries({ queryKey: ["community-member-counts"] });
  };

  const sendMessage = useCallback(async () => {
    if (!user || !message.trim()) return;
    const payload: any = {
      community_slug: slug,
      user_id: user.id,
      content: message.trim(),
    };
    if (replyTo) {
      payload.reply_to_id = replyTo.id;
      payload.reply_to_content = (replyTo.content || "").slice(0, 100);
      payload.reply_to_name = replyTo.profile?.display_name || "User";
    }
    if (taggedMarkets.length > 0) {
      payload.tagged_market_ids = taggedMarkets.map((m) => m.id);
    }
    const { error } = await supabase.from("community_messages" as any).insert(payload);
    if (error) {
      toast.error("Failed to send message");
      return;
    }
    setMessage("");
    setReplyTo(null);
    setTaggedMarkets([]);
    setShowTagSelector(false);
  }, [user, message, slug, replyTo, taggedMarkets]);

  const toggleReaction = useCallback(async (messageId: string, emoji: string, currentReactions: Record<string, string[]>) => {
    if (!user) return;
    await supabase.rpc("toggle_message_reaction" as any, {
      _table: "community_messages",
      _message_id: messageId,
      _emoji: emoji,
    });
    queryClient.invalidateQueries({ queryKey: ["community-messages", slug] });
    setActiveReactionId(null);
  }, [user, slug, queryClient]);

  return (
    <div className="flex flex-col h-full relative">
      {isFeatureEnabled("chat_doodle_bg") && <ChatDoodleBackground />}
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border" style={{ paddingTop: "max(0.75rem, var(--safe-top))" }}>
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-sm font-bold flex-1">{label}</h2>
        <Button
          size="sm"
          variant={isMember ? "outline" : "default"}
          className="h-7 text-xs"
          onClick={() => {
            if (isMember) {
              setShowLeaveConfirm(true);
            } else {
              toggleMembership();
            }
          }}
        >
          {isMember ? "Leave" : "Join"}
        </Button>
      </div>

      {/* Messages */}
      <div ref={scrollContainerRef} data-chat-scroll className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">
            No messages yet. Be the first to start the conversation!
          </p>
        ) : (
          messages.map((m: CommunityMessage) => {
            const reactions: Record<string, string[]> = (m.reactions as any) || {};
            const reactionEntries = Object.entries(reactions).filter(([, users]) => users.length > 0);
            const showBar = activeReactionId === m.id;
            return (
              <div key={m.id} className="group relative flex gap-2">
                <button
                  onClick={() => navigate(`/user/${m.user_id}`)}
                  className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden shrink-0 mt-0.5"
                >
                  {m.profile?.avatar_url ? (
                    <img src={m.profile.avatar_url} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <span className="text-[10px] font-bold text-primary">
                      {(m.profile?.display_name || "?").charAt(0).toUpperCase()}
                    </span>
                  )}
                </button>
                <div
                  className="flex-1 min-w-0 relative select-none touch-manipulation"
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    const target = e.currentTarget;
                    const timer = setTimeout(() => {
                      const rect = target.getBoundingClientRect();
                      const scrollContainer = target.closest('[data-chat-scroll]');
                      const containerTop = scrollContainer ? scrollContainer.getBoundingClientRect().top : 0;
                      const trayHeight = 48;
                      setFlipReactions(rect.top - containerTop < trayHeight + 8);
                      setActiveReactionId(m.id);
                      if (navigator.vibrate) navigator.vibrate(10);
                    }, 500);
                    const cancel = () => clearTimeout(timer);
                    target.addEventListener("pointerup", cancel, { once: true });
                    target.addEventListener("pointercancel", cancel, { once: true });
                    target.addEventListener("pointerleave", cancel, { once: true });
                  }}
                >
                  {/* Reaction bar */}
                  {showBar && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setActiveReactionId(null)} />
                      <div className={cn("absolute left-0 z-50 flex items-center gap-0.5 bg-background/95 backdrop-blur-sm border border-border rounded-full px-1.5 py-1 shadow-xl", flipReactions ? "top-full mt-1" : "bottom-full mb-1")}>
                        {REACTION_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => toggleReaction(m.id, emoji, reactions)}
                            className="text-base hover:scale-125 transition-transform active:scale-95 p-0.5"
                          >
                            {emoji}
                          </button>
                        ))}
                        <div className="w-px h-4 bg-border mx-0.5 flex-shrink-0" />
                        <button
                          onClick={() => { setReplyTo(m); setActiveReactionId(null); }}
                          className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-accent transition-colors flex-shrink-0"
                          title="Reply"
                        >
                          <Reply className="w-3 h-3 text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => {
                            if (m.content) {
                              navigator.clipboard.writeText(m.content).then(() => toast.success("Copied")).catch(() => toast.error("Failed to copy"));
                            }
                            setActiveReactionId(null);
                          }}
                          className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-accent transition-colors flex-shrink-0"
                          title="Copy"
                        >
                          <Copy className="w-3 h-3 text-muted-foreground" />
                        </button>
                      </div>
                    </>
                  )}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold">{m.profile?.display_name || "User"}</span>
                    {m.profile?.verification_level === "gold" && (
                      <BadgeCheck className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    )}
                    {m.profile?.verification_level === "blue" && (
                      <BadgeCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  {m.reply_to_content && (
                    <div className="mt-0.5 mb-1 border-l-2 border-primary/40 pl-2 py-0.5">
                      <span className="text-[10px] font-medium text-primary">{m.reply_to_name}</span>
                      <p className="text-[11px] text-muted-foreground truncate">{m.reply_to_content}</p>
                    </div>
                  )}
                  <p className="text-sm break-words">{m.content}</p>
                  {m.image_url && (
                    <img src={m.image_url} className="mt-1 rounded-lg max-w-[200px] max-h-[200px] object-cover" alt="" />
                   )}
                  {/* Tagged markets */}
                  {m.tagged_markets && m.tagged_markets.length > 0 && (
                    <div className="flex flex-col gap-1 mt-1.5">
                      {m.tagged_markets.map((tm: MarketTag) => (
                        <button
                          key={tm.id}
                          onClick={() => navigate(`/market/${tm.id}`)}
                          className="flex items-center gap-2 bg-muted/50 border border-border rounded-lg p-1.5 hover:bg-muted/80 transition-colors max-w-[220px]"
                        >
                          {tm.image_url ? (
                            <img src={optimizedImageUrl(tm.image_url, "thumb")} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
                              <TrendingUp className="w-3.5 h-3.5 text-primary" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1 text-left">
                            <p className="text-[10px] font-semibold leading-tight truncate">{tm.title}</p>
                            <p className="text-[10px] text-primary font-bold">{Math.round(tm.yes_price * 100)}% Yes</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Reaction pills */}
                  {reactionEntries.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {reactionEntries.map(([emoji, users]) => (
                        <button
                          key={emoji}
                          onClick={() => toggleReaction(m.id, emoji, reactions)}
                          className={cn(
                            "flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full border transition-colors",
                            users.includes(user?.id || "")
                              ? "bg-primary/15 border-primary/30 text-primary"
                              : "bg-muted/50 border-border text-muted-foreground hover:bg-muted"
                          )}
                        >
                          <span>{emoji}</span>
                          <span className="text-[10px]">{users.length}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reply banner */}
      {replyTo && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-muted/50 border-t border-border">
          <Reply className="w-3.5 h-3.5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-medium text-primary">{replyTo.profile?.display_name}</span>
            <p className="text-[11px] text-muted-foreground truncate">{replyTo.content}</p>
          </div>
          <button onClick={() => setReplyTo(null)}>
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      )}

      {/* Tag selector panel */}
      {showTagSelector && (
        <div className="shrink-0 px-4 py-2 border-t border-border bg-muted/30">
          <MarketTagSelector
            selected={taggedMarkets}
            onChange={setTaggedMarkets}
            max={3}
            categoryFilter={categoryFilter}
          />
          <button
            onClick={() => setShowTagSelector(false)}
            className="text-[10px] text-muted-foreground mt-1 hover:text-foreground"
          >
            Done
          </button>
        </div>
      )}

      {/* Tagged markets preview */}
      {taggedMarkets.length > 0 && !showTagSelector && (
        <div className="shrink-0 flex items-center gap-1.5 px-4 py-1.5 border-t border-border bg-muted/30">
          <TrendingUp className="w-3 h-3 text-primary shrink-0" />
          <span className="text-[10px] text-muted-foreground">{taggedMarkets.length} market{taggedMarkets.length > 1 ? "s" : ""} tagged</span>
          <button onClick={() => { setTaggedMarkets([]); }} className="ml-auto">
            <X className="w-3 h-3 text-muted-foreground" />
          </button>
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 px-4 py-1.5 flex gap-2" style={{ paddingBottom: "max(0.375rem, var(--safe-bottom))" }}>
        <button
          onClick={() => isMember && setShowTagSelector(!showTagSelector)}
          disabled={!isMember}
          className="h-9 w-9 flex items-center justify-center shrink-0 text-muted-foreground hover:text-primary disabled:opacity-40 transition-colors"
          title="Tag markets"
        >
          <TrendingUp className="w-4 h-4" />
        </button>
        <Input
          placeholder={isMember ? "Type a message..." : "Join to chat"}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
          disabled={!isMember}
          className="h-9 text-sm"
        />
        <Button
          size="sm"
          className="h-9 w-9 p-0"
          disabled={!isMember || (!message.trim() && taggedMarkets.length === 0)}
          onClick={sendMessage}
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>

      <AlertDialog open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
        <AlertDialogContent className="max-w-xs rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Leave {label}?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              You'll no longer receive messages from this community. You can rejoin anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl text-sm">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowLeaveConfirm(false);
                toggleMembership();
              }}
              className="rounded-xl text-sm bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CommunityChat;
