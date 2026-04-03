import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserBalance } from "@/hooks/useUserBalance";
import { useCommissionSettings } from "@/hooks/useCommissionSettings";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import BottomSheet from "@/components/BottomSheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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
  const { balance, giftBalance } = useUserBalance();
  const { data: settings } = useCommissionSettings();
  const giftFeePercent = settings?.gift_fee_percent ?? 2;
  const [sending, setSending] = useState<string | null>(null);
  const [lastSentAt, setLastSentAt] = useState(0);
  const [showTopUp, setShowTopUp] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [processing, setProcessing] = useState(false);
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
    setLastSentAt(Date.now());
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

  const handleTopUp = async () => {
    const amt = Number(topUpAmount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (amt > balance) { toast.error("Insufficient main balance"); return; }
    setProcessing(true);
    const { data, error } = await supabase.rpc("topup_gift_balance", { _user_id: user!.id, _amount: amt } as any);
    setProcessing(false);
    if (error || !(data as any)?.success) {
      toast.error((data as any)?.error || error?.message || "Top up failed");
      return;
    }
    toast.success(`Topped up $${amt.toFixed(2)} to gift balance`);
    setShowTopUp(false);
    setTopUpAmount("");
    queryClient.invalidateQueries({ queryKey: ["user-balance"] });
    queryClient.invalidateQueries({ queryKey: ["balance"] });
  };

  return (
    <BottomSheet open={open} onClose={onClose} maxHeight="70dvh">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">Send gift to {recipientName}</h3>
            <p className="text-xs text-muted-foreground">Emoji gifts deduct from your gift balance ({giftFeePercent}% fee)</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Gift Balance</p>
            <p className="text-sm font-bold text-emerald-500 dark:text-emerald-400">${giftBalance.toFixed(2)}</p>
          </div>
        </div>

        {showTopUp ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Transfer from your main balance (${balance.toFixed(2)}) to your gift balance.
            </p>
            <Input
              type="number"
              placeholder="Amount"
              value={topUpAmount}
              onChange={(e) => setTopUpAmount(e.target.value)}
              min={0.01}
              step={0.01}
            />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setShowTopUp(false); setTopUpAmount(""); }}>
                Back
              </Button>
              <Button onClick={handleTopUp} disabled={processing} className="flex-1">
                {processing ? "Processing..." : "Top Up"}
              </Button>
            </div>
          </div>
        ) : giftBalance <= 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <span className="text-4xl mb-2">😢</span>
            <p className="text-sm font-medium text-foreground">No gift balance</p>
            <p className="text-xs text-muted-foreground mb-3">Top up your gift balance to send emoji gifts</p>
            <button
              onClick={() => setShowTopUp(true)}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Top Up Gift Balance
            </button>
          </div>
        ) : (
          <>
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
            <button
              onClick={() => setShowTopUp(true)}
              className="w-full text-center text-xs text-primary hover:underline py-1"
            >
              Top Up Gift Balance
            </button>
          </>
        )}
      </div>
    </BottomSheet>
  );
};

export default ChatGiftModal;
