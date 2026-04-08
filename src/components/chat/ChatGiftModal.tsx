import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserBalance } from "@/hooks/useUserBalance";
import { useCommissionSettings } from "@/hooks/useCommissionSettings";
import { useSecuritySettings } from "@/hooks/useSecuritySettings";
import { toast } from "sonner";
import { Loader2, Gift, Banknote, History } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import BottomSheet from "@/components/BottomSheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import SecurityVerificationModal from "@/components/SecurityVerificationModal";
import ChatGiftHistory from "@/components/chat/ChatGiftHistory";

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

const QUICK_AMOUNTS = [1, 5, 10, 25];

type TabType = "emoji" | "money" | "history";

const ChatGiftModal = ({ open, onClose, conversationId, recipientId, recipientName }: ChatGiftModalProps) => {
  const { user } = useAuth();
  const { balance, giftBalance } = useUserBalance();
  const { data: settings } = useCommissionSettings();
  const { data: securitySettings } = useSecuritySettings(user?.id ?? null);
  const giftFeePercent = settings?.gift_fee_percent ?? 2;
  const [sending, setSending] = useState<string | null>(null);
  const [lastSentAt, setLastSentAt] = useState(0);
  const [showTopUp, setShowTopUp] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [processing, setProcessing] = useState(false);
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabType>("emoji");
  const [moneyAmount, setMoneyAmount] = useState("");
  const [sendingMoney, setSendingMoney] = useState(false);
  const [showPinVerify, setShowPinVerify] = useState(false);

  const parsedAmount = Number(moneyAmount) || 0;
  const fee = Math.round(parsedAmount * giftFeePercent) / 100;
  const netAmount = Math.round((parsedAmount - fee) * 100) / 100;
  const canSendMoney = parsedAmount >= 0.50 && parsedAmount <= balance;

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

  const handleSendMoneyClick = useCallback(() => {
    if (!canSendMoney || sendingMoney) return;
    const now = Date.now();
    if (now - lastSentAt < 3000) {
      toast.error("Please wait before sending again");
      return;
    }
    // Require PIN if user has it enabled
    if (securitySettings?.pin_enabled) {
      setShowPinVerify(true);
    } else {
      executeSendMoney();
    }
  }, [canSendMoney, sendingMoney, lastSentAt, securitySettings]);

  const executeSendMoney = useCallback(async () => {
    setSendingMoney(true);
    setLastSentAt(Date.now());
    try {
      const { error } = await supabase.rpc("send_dm_money" as any, {
        p_conversation_id: conversationId,
        p_recipient_id: recipientId,
        p_amount: parsedAmount,
      });
      if (error) throw error;
      toast.success(`Sent $${parsedAmount.toFixed(2)} to ${recipientName}!`);
      queryClient.invalidateQueries({ queryKey: ["dm-messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["user-balance"] });
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Transfer failed");
    } finally {
      setSendingMoney(false);
    }
  }, [conversationId, recipientId, parsedAmount, recipientName, queryClient, onClose]);

  return (
    <>
      <BottomSheet open={open} onClose={onClose} maxHeight="70dvh">
        <div className="p-4 space-y-4">
          {/* Tab Switcher */}
          <div className="flex rounded-lg bg-muted p-0.5 gap-0.5">
            <button
              onClick={() => { setActiveTab("emoji"); setShowTopUp(false); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === "emoji" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Gift className="w-3.5 h-3.5" />
              Emoji Gifts
            </button>
            <button
              onClick={() => { setActiveTab("money"); setShowTopUp(false); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === "money" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Banknote className="w-3.5 h-3.5" />
              Send Money
            </button>
            <button
              onClick={() => { setActiveTab("history"); setShowTopUp(false); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === "history" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <History className="w-3.5 h-3.5" />
              History
            </button>
          </div>

          {activeTab === "history" ? (
            <ChatGiftHistory
              conversationId={conversationId}
              recipientId={recipientId}
              recipientName={recipientName}
            />
          ) : activeTab === "emoji" ? (
            <>
              {/* Emoji tab header */}
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
            </>
          ) : (
            /* Send Money tab */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-foreground">Send money to {recipientName}</h3>
                  <p className="text-xs text-muted-foreground">Transfers from your main balance ({giftFeePercent}% fee)</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Main Balance</p>
                  <p className="text-sm font-bold text-emerald-500 dark:text-emerald-400">${balance.toFixed(2)}</p>
                </div>
              </div>

              {/* Quick amount chips */}
              <div className="flex gap-2">
                {QUICK_AMOUNTS.map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setMoneyAmount(String(amt))}
                    disabled={amt > balance}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                      Number(moneyAmount) === amt
                        ? "bg-primary text-primary-foreground"
                        : amt > balance
                        ? "bg-muted text-muted-foreground opacity-40 cursor-not-allowed"
                        : "bg-secondary text-foreground hover:bg-accent active:scale-95"
                    }`}
                  >
                    ${amt}
                  </button>
                ))}
              </div>

              {/* Custom amount input */}
              <div>
                <Input
                  type="number"
                  placeholder="Custom amount (min $0.50)"
                  value={moneyAmount}
                  onChange={(e) => setMoneyAmount(e.target.value)}
                  min={0.50}
                  step={0.01}
                  className="text-center text-lg font-semibold"
                />
              </div>

              {/* Fee preview */}
              {parsedAmount > 0 && (
                <div className="bg-muted/50 rounded-lg px-3 py-2 text-xs text-muted-foreground space-y-0.5">
                  <div className="flex justify-between">
                    <span>Fee ({giftFeePercent}%)</span>
                    <span>${fee.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-medium text-foreground">
                    <span>{recipientName} receives</span>
                    <span>${netAmount.toFixed(2)}</span>
                  </div>
                </div>
              )}

              {/* Send button */}
              <Button
                onClick={handleSendMoneyClick}
                disabled={!canSendMoney || sendingMoney}
                className="w-full h-11"
              >
                {sendingMoney ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                {sendingMoney
                  ? "Sending..."
                  : canSendMoney
                  ? `Send $${parsedAmount.toFixed(2)} to ${recipientName}`
                  : parsedAmount > 0 && parsedAmount < 0.50
                  ? "Min $0.50"
                  : parsedAmount > balance
                  ? "Insufficient balance"
                  : "Enter amount"}
              </Button>

              {parsedAmount >= 0.50 && securitySettings?.pin_enabled && (
                <p className="text-[10px] text-center text-muted-foreground">🔒 PIN verification required for security</p>
              )}
            </div>
          )}
        </div>
      </BottomSheet>

      {/* PIN Verification */}
      <SecurityVerificationModal
        open={showPinVerify}
        onClose={() => setShowPinVerify(false)}
        onVerified={() => {
          setShowPinVerify(false);
          executeSendMoney();
        }}
        requirePin={securitySettings?.pin_enabled ?? false}
        requireTotp={false}
      />
    </>
  );
};

export default ChatGiftModal;
