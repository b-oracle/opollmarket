import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Send, X, Reply, Copy, BadgeCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const REACTION_EMOJIS = ["❤️", "😂", "👍", "😮", "😢", "🔥"];

interface CommunityChatProps {
  slug: string;
  label: string;
  onBack: () => void;
}

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
  created_at: string;
  profile?: { display_name: string; avatar_url: string | null; verification_level?: string };
}

const CommunityChat = ({ slug, label, onBack }: CommunityChatProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [replyTo, setReplyTo] = useState<CommunityMessage | null>(null);
  const [activeReactionId, setActiveReactionId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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
        .select("id, display_name, avatar_url")
        .in("id", userIds);

      const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

      return msgs.map((m: any) => ({
        ...m,
        reactions: m.reactions || {},
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
    const { error } = await supabase.from("community_messages" as any).insert(payload);
    if (error) {
      toast.error("Failed to send message");
      return;
    }
    setMessage("");
    setReplyTo(null);
  }, [user, message, slug, replyTo]);

  const toggleReaction = useCallback(async (messageId: string, emoji: string, currentReactions: Record<string, string[]>) => {
    if (!user) return;
    const updated = { ...currentReactions };
    const users = updated[emoji] || [];
    if (users.includes(user.id)) {
      updated[emoji] = users.filter((u) => u !== user.id);
      if (updated[emoji].length === 0) delete updated[emoji];
    } else {
      updated[emoji] = [...users, user.id];
    }
    await supabase
      .from("community_messages" as any)
      .update({ reactions: updated } as any)
      .eq("id", messageId);
    queryClient.invalidateQueries({ queryKey: ["community-messages", slug] });
    setActiveReactionId(null);
  }, [user, slug, queryClient]);

  return (
    <div className="flex flex-col h-full">
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
          onClick={toggleMembership}
        >
          {isMember ? "Leave" : "Join"}
        </Button>
      </div>

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
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
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden shrink-0 mt-0.5">
                  {m.profile?.avatar_url ? (
                    <img src={m.profile.avatar_url} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <span className="text-[10px] font-bold text-primary">
                      {(m.profile?.display_name || "?").charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div
                  className="flex-1 min-w-0 relative select-none touch-none"
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    const timer = setTimeout(() => {
                      setActiveReactionId(m.id);
                      if (navigator.vibrate) navigator.vibrate(10);
                    }, 500);
                    const cancel = () => clearTimeout(timer);
                    e.currentTarget.addEventListener("pointerup", cancel, { once: true });
                    e.currentTarget.addEventListener("pointercancel", cancel, { once: true });
                    e.currentTarget.addEventListener("pointerleave", cancel, { once: true });
                  }}
                >
                  {/* Reaction bar */}
                  {showBar && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setActiveReactionId(null)} />
                      <div className="absolute bottom-full mb-1 left-0 z-50 flex items-center gap-0.5 bg-background/95 backdrop-blur-sm border border-border rounded-full px-1.5 py-1 shadow-xl">
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
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">{m.profile?.display_name || "User"}</span>
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

      {/* Input */}
      <div className="shrink-0 px-4 py-1.5 flex gap-2" style={{ paddingBottom: "max(0.375rem, var(--safe-bottom))" }}>
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
          disabled={!isMember || !message.trim()}
          onClick={sendMessage}
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

export default CommunityChat;
