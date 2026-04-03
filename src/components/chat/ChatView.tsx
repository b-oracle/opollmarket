import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, Send, Gift, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatDistanceToNow } from "date-fns";
import ChatGiftModal from "./ChatGiftModal";
import SEOHead from "@/components/SEOHead";

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  gift_amount: number | null;
  created_at: string;
  read_at: string | null;
}

const ChatView = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showGift, setShowGift] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Conversation info
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

  // Messages
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

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Mark messages as read
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

  // Realtime subscription
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`dm-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dm_messages", filter: `conversation_id=eq.${conversationId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["dm-messages", conversationId] });
          queryClient.invalidateQueries({ queryKey: ["dm-unread-count"] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, queryClient]);

  const sendMessage = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || !conversationId || !user) return;
    setSending(true);
    try {
      const { error } = await supabase
        .from("dm_messages" as any)
        .insert({ conversation_id: conversationId, sender_id: user.id, content: trimmed });
      if (error) throw error;

      // Update last_message_at
      await supabase
        .from("dm_conversations" as any)
        .update({ last_message_at: new Date().toISOString() } as any)
        .eq("id", conversationId);

      setText("");
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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead title={`Chat with ${otherName} | Pollmarket`} description="Direct message" />
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
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
        {messages.map((m) => {
          const isMine = m.sender_id === user?.id;
          const isGift = m.gift_amount != null && m.gift_amount > 0;

          if (isGift) {
            return (
              <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] rounded-2xl px-4 py-3 border ${
                  isMine
                    ? "bg-primary/10 border-primary/20"
                    : "bg-accent/30 border-accent/50"
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Gift className="w-4 h-4 text-primary" />
                    <span className="text-sm font-bold text-primary">${m.gift_amount}</span>
                  </div>
                  <p className="text-lg">{m.content}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
            );
          }

          return (
            <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${
                isMine
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-muted text-foreground rounded-bl-md"
              }`}>
                <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                <p className={`text-[10px] mt-1 ${isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                  {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t border-border px-4 py-3 z-30">
        <div className="max-w-lg mx-auto flex items-center gap-2">
          <button
            onClick={() => setShowGift(true)}
            className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors shrink-0"
            aria-label="Send gift"
          >
            <Gift className="w-4 h-4" />
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
            onClick={sendMessage}
            disabled={!text.trim() || sending}
            className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground disabled:opacity-50 transition-all active:scale-95 shrink-0"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Gift modal */}
      {showGift && otherId && (
        <ChatGiftModal
          open={showGift}
          onClose={() => setShowGift(false)}
          conversationId={conversationId!}
          recipientId={otherId}
          recipientName={otherName}
        />
      )}
    </div>
  );
};

export default ChatView;
