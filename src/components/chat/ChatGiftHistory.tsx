import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { format } from "date-fns";

interface ChatGiftHistoryProps {
  conversationId: string;
  recipientId: string;
  recipientName: string;
}

interface GiftMessage {
  id: string;
  sender_id: string;
  content: string;
  gift_amount: number;
  created_at: string;
}

const ChatGiftHistory = ({ conversationId, recipientId, recipientName }: ChatGiftHistoryProps) => {
  const { user } = useAuth();

  const { data: messages, isLoading } = useQuery({
    queryKey: ["dm-gift-history", conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dm_messages")
        .select("id, sender_id, content, gift_amount, created_at")
        .eq("conversation_id", conversationId)
        .not("gift_amount", "is", null)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as GiftMessage[];
    },
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!messages?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <span className="text-3xl mb-2">📭</span>
        <p className="text-sm font-medium text-foreground">No gift history yet</p>
        <p className="text-xs text-muted-foreground">Gifts and transfers in this chat will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-1 max-h-[45dvh] overflow-y-auto">
      {messages.map((msg) => {
        const isSent = msg.sender_id === user?.id;
        const isEmojiGift = msg.content !== "💵" || (msg.gift_amount && msg.gift_amount < 0.50);
        const isDirect = msg.content === "💵" && msg.gift_amount && msg.gift_amount >= 0.50;

        return (
          <div
            key={msg.id}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-secondary/50"
          >
            <div className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 ${
              isSent ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-500"
            }`}>
              {isSent ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownLeft className="w-4 h-4" />}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-foreground truncate">
                  {isSent ? `To ${recipientName}` : `From ${recipientName}`}
                </span>
                {!isDirect && <span className="text-base">{msg.content}</span>}
                {isDirect && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                    Direct
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">
                {format(new Date(msg.created_at), "MMM d, yyyy · h:mm a")}
              </p>
            </div>

            <span className={`text-sm font-semibold tabular-nums ${
              isSent ? "text-destructive" : "text-emerald-500"
            }`}>
              {isSent ? "-" : "+"}${msg.gift_amount?.toFixed(2)}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default ChatGiftHistory;
