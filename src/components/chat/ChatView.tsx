import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, Send, Gift, Loader2, Share2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import ChatGiftModal from "./ChatGiftModal";
import ChatMessageBubble from "./ChatMessageBubble";
import ChatSharePicker from "./ChatSharePicker";
import SEOHead from "@/components/SEOHead";

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  gift_amount: number | null;
  created_at: string;
  read_at: string | null;
  reactions?: Record<string, string[]>;
}

const ChatView = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showGift, setShowGift] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: convo } = useQuery({
    queryKey: ["dm-conversation", conversationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("dm_conversations" as any)
        .select("*")
        .eq("id", conversationId)
        .single() as any;
      if (!data) return null;
      const otherId = data.user_a === user!.id ? data.user_b : data.user_a;
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .eq("id", otherId)
        .maybeSingle();
      return { ...(data as any), other_user: profile };
    },
    enabled: !!conversationId && !!user,
  });

  const otherId = convo ? ((convo as any).user_a === user?.id ? (convo as any).user_b : (convo as any).user_a) : null;
  const otherName = (convo as any)?.other_user?.display_name || "User";

  const { data: messages = [] } = useQuery({
    queryKey: ["dm-messages", conversationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("dm_messages" as any)
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(200) as any;
      return (data || []) as Message[];
    },
    enabled: !!conversationId,
    staleTime: 5_000,
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  useEffect(() => {
    if (!user || !conversationId || messages.length === 0) return;
    const unreadIds = messages
      .filter((m) => m.sender_id !== user.id && !m.read_at)
      .map((m) => m.id);
    if (unreadIds.length === 0) return;
    supabase
      .from("dm_messages" as any)
      .update({ read_at: new Date().toISOString() } as any)
      .in("id", unreadIds)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["dm-unread-count"] });
      });
  }, [messages, user, conversationId, queryClient]);

  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`dm-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dm_messages", filter: `conversation_id=eq.${conversationId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["dm-messages", conversationId] });
          queryClient.invalidateQueries({ queryKey: ["dm-unread-count"] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, queryClient]);

  const sendMessage = useCallback(async (content?: string) => {
    const trimmed = (content || text).trim();
    if (!trimmed || sending || !conversationId || !user) return;
    setSending(true);
    try {
      const { error } = await supabase
        .from("dm_messages" as any)
        .insert({ conversation_id: conversationId, sender_id: user.id, content: trimmed });
      if (error) throw error;
      if (!content) setText("");
      queryClient.invalidateQueries({ queryKey: ["dm-messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["dm-conversations"] });
    } catch {
      const { toast } = await import("sonner");
      toast.error("Failed to send message");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [text, sending, conversationId, user, queryClient]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleShareLink = (url: string) => {
    sendMessage(url);
  };

  return (
    <div className="h-[100dvh] bg-background flex flex-col overflow-hidden">
      <SEOHead title={`Chat with ${otherName} | Pollmarket`} description="Direct message" />
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
        <button onClick={() => navigate("/messages")} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div
          className="flex items-center gap-2 cursor-pointer flex-1 min-w-0"
          onClick={() => otherId && navigate(`/user/${otherId}`)}
        >
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden shrink-0">
            {(convo as any)?.other_user?.avatar_url ? (
              <img src={(convo as any).other_user.avatar_url} className="w-full h-full object-cover" alt="" />
            ) : (
              <span className="text-xs font-bold text-primary">{otherName.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <span className="text-sm font-semibold truncate">{otherName}</span>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2" style={{ paddingBottom: "80px" }}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 py-20">
            <span className="text-6xl mb-4">💬</span>
            <h3 className="text-lg font-semibold text-foreground mb-1">No messages here yet...</h3>
            <p className="text-sm text-muted-foreground">Send a message or a gift to start the conversation.</p>
          </div>
        )}
        {messages.map((m) => (
          <ChatMessageBubble key={m.id} message={m} conversationId={conversationId!} />
        ))}
      </div>

      {/* Input bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t border-border px-4 py-3 z-30" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <div className="max-w-lg mx-auto flex items-center gap-2">
          <button
            onClick={() => setShowGift(true)}
            className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors shrink-0"
            aria-label="Send gift"
          >
            <Gift className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowShare(true)}
            className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors shrink-0"
            aria-label="Share market or space"
          >
            <Share2 className="w-4 h-4" />
          </button>
          <Input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 h-10 rounded-full"
            maxLength={2000}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!text.trim() || sending}
            className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground disabled:opacity-50 transition-all active:scale-95 shrink-0"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {showGift && otherId && (
        <ChatGiftModal
          open={showGift}
          onClose={() => setShowGift(false)}
          conversationId={conversationId!}
          recipientId={otherId}
          recipientName={otherName}
        />
      )}

      {showShare && (
        <ChatSharePicker
          open={showShare}
          onClose={() => setShowShare(false)}
          onShare={handleShareLink}
        />
      )}
    </div>
  );
};

export default ChatView;
