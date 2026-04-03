import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserBalance } from "@/hooks/useUserBalance";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import BottomSheet from "@/components/BottomSheet";

interface ChatGiftModalProps {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  recipientId: string;
  recipientName: string;
}

const GIFT_EMOJIS = ["💸", "🤑", "💰", "💵", "🌹", "💝", "🔥", "🕺", "💃", "👏", "👍", "❤️", "😂", "💯", "🎯", "👱🏼‍♀️"];

const EMOJI_PRICES: Record<string, number> = {
  "💸": 0.10,
  "🤑": 0.25,
  "💰": 0.50,
  "💵": 0.05,
  "🌹": 0.15,
  "💝": 0.20,
  "🔥": 0.10,
  "🕺": 0.05,
  "💃": 0.05,
  "👏": 0.05,
  "👍": 0.05,
  "❤️": 0.05,
  "😂": 0.05,
  "💯": 0.10,
  "🎯": 0.10,
  "👱🏼‍♀️": 50.00,
};

const ChatGiftModal = ({ open, onClose, conversationId, recipientId, recipientName }: ChatGiftModalProps) => {
  const { user } = useAuth();
  const { giftBalance } = useUserBalance();
  const [sending, setSending] = useState<string | null>(null);
  const [lastSentAt, setLastSentAt] = useState(0);
  const queryClient = useQueryClient();

  const handleSendEmoji = async (emoji: string) => {
    const now = Date.now();
    if (now - lastSentAt < 3000) {
      toast.error("Please wait before sending another gift");
      return;
    }
    const price = EMOJI_PRICES[emoji] ?? 0.05;
    if (price > giftBalance) {
      toast.error("Insufficient gift balance");
      return;
    }

    setSending(emoji);
    try {
      const { error } = await supabase.rpc("send_dm_gift" as any, {
        p_conversation_id: conversationId,
        p_recipient_id: recipientId,
        p_amount: price,
        p_emoji: emoji,
      });
      if (error) throw error;
      toast.success(`Sent ${emoji} ($${price.toFixed(2)}) to ${recipientName}!`);
      queryClient.invalidateQueries({ queryKey: ["dm-messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["user-balance"] });
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Gift failed");
    } finally {
      setSending(null);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} maxHeight="70dvh">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">Send gift to {recipientName}</h3>
            <p className="text-xs text-muted-foreground">Emoji gifts deduct from your gift balance</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Gift Balance</p>
            <p className="text-sm font-bold text-emerald-500 dark:text-emerald-400">${giftBalance.toFixed(2)}</p>
          </div>
        </div>

        {/* Emoji Grid */}
        {giftBalance <= 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <span className="text-4xl mb-2">😢</span>
            <p className="text-sm font-medium text-foreground">No gift balance</p>
            <p className="text-xs text-muted-foreground">Top up your gift balance to send emoji gifts</p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {GIFT_EMOJIS.map((emoji) => {
              const price = EMOJI_PRICES[emoji] ?? 0.05;
              const canAfford = price <= giftBalance;
              const isSending = sending === emoji;

              return (
                <button
                  key={emoji}
                  onClick={() => handleSendEmoji(emoji)}
                  disabled={!canAfford || !!sending}
                  className={`flex flex-col items-center justify-center rounded-xl p-3 transition-all ${
                    canAfford
                      ? "bg-secondary hover:bg-accent active:scale-95"
                      : "bg-muted opacity-40 cursor-not-allowed"
                  }`}
                >
                  {isSending ? (
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  ) : (
                    <span className="text-2xl">{emoji}</span>
                  )}
                  <span className="text-[10px] text-muted-foreground mt-1">${price.toFixed(2)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </BottomSheet>
  );
};

export default ChatGiftModal;
