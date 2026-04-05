import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, Send, X, Reply } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

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
  created_at: string;
  profile?: { display_name: string; avatar_url: string | null };
}

const CommunityChat = ({ slug, label, onBack }: CommunityChatProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [replyTo, setReplyTo] = useState<CommunityMessage | null>(null);
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
        profile: profileMap.get(m.user_id) || { display_name: "User", avatar_url: null },
      }));
    },
    enabled: !!user,
    refetchInterval: 5000,
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`community-${slug}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "community_messages", filter: `community_slug=eq.${slug}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["community-messages", slug] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [slug, queryClient]);

  // Auto-scroll to bottom
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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border">
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
            const isMe = m.user_id === user?.id;
            return (
              <div key={m.id} className="group flex gap-2">
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden shrink-0 mt-0.5">
                  {m.profile?.avatar_url ? (
                    <img src={m.profile.avatar_url} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <span className="text-[10px] font-bold text-primary">
                      {(m.profile?.display_name || "?").charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
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
                </div>
                <button
                  onClick={() => setReplyTo(m)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity self-start mt-1"
                >
                  <Reply className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />
                </button>
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
      <div className="shrink-0 px-4 py-2 pb-1 border-t border-border flex gap-2">
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
