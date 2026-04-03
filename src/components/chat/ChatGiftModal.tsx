import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserBalance } from "@/hooks/useUserBalance";
import { toast } from "sonner";
import { Gift, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface ChatGiftModalProps {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  recipientId: string;
  recipientName: string;
}

const GIFT_PRESETS = [1, 5, 10, 25, 50];

const ChatGiftModal = ({ open, onClose, conversationId, recipientId, recipientName }: ChatGiftModalProps) => {
  const { user } = useAuth();
  const { giftBalance } = useUserBalance();
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);
  const queryClient = useQueryClient();

  const handleSend = async () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) { toast.error("Enter a valid amount"); return; }
    if (val > giftBalance) { toast.error("Insufficient gift balance"); return; }

    setSending(true);
    try {
      const { error } = await supabase.rpc("send_dm_gift" as any, {
        p_conversation_id: conversationId,
        p_recipient_id: recipientId,
        p_amount: val,
        p_emoji: "🎁",
      });
      if (error) throw error;
      toast.success(`Sent $${val} gift to ${recipientName}!`);
      queryClient.invalidateQueries({ queryKey: ["dm-messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["user-balance"] });
      setAmount("");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Gift failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-primary" /> Send Gift
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Gift balance: <span className="font-semibold text-foreground">${giftBalance.toFixed(2)}</span>
        </p>
        <div className="flex gap-2 flex-wrap">
          {GIFT_PRESETS.map((p) => (
            <Button
              key={p}
              variant={amount === String(p) ? "default" : "outline"}
              size="sm"
              onClick={() => setAmount(String(p))}
              disabled={p > giftBalance}
            >
              ${p}
            </Button>
          ))}
        </div>
        <Input
          type="number"
          placeholder="Custom amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min={0.01}
          step={0.01}
        />
        <Button onClick={handleSend} disabled={sending || !amount} className="w-full">
          {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Gift className="w-4 h-4 mr-2" />}
          Send Gift
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default ChatGiftModal;
