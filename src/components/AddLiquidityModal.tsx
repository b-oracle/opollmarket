import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Droplets, Loader2, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserBalance } from "@/hooks/useUserBalance";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface AddLiquidityModalProps {
  open: boolean;
  onClose: () => void;
  marketId: string;
  marketTitle: string;
  currentLiquidity: number;
}

const formatUsd = (v: number) => `$${v.toFixed(2)}`;

const AddLiquidityModal = ({ open, onClose, marketId, marketTitle, currentLiquidity }: AddLiquidityModalProps) => {
  const { balance, userId } = useUserBalance();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const numAmount = parseFloat(amount) || 0;
  const isValid = numAmount > 0 && numAmount <= balance;

  const handleSubmit = async () => {
    if (!isValid || !userId || submitting) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("add_market_liquidity", {
        _user_id: userId,
        _market_id: marketId,
        _amount: numAmount,
      });

      if (error) throw new Error(error.message);

      const result = data as { success: boolean; error?: string };
      if (!result.success) throw new Error(result.error || "Failed to add liquidity");

      toast.success(`Added ${formatUsd(numAmount)} liquidity`);
      queryClient.invalidateQueries({ queryKey: ["market", marketId] });
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      setAmount("");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to add liquidity");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Droplets className="w-5 h-5 text-primary" />
            Add Liquidity
          </DialogTitle>
          <DialogDescription className="text-xs line-clamp-2">
            Top up liquidity for "{marketTitle}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Droplets className="w-3.5 h-3.5" /> Current Liquidity
            </span>
            <span className="font-semibold">{formatUsd(currentLiquidity)}</span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5" /> Your Balance
            </span>
            <span className="font-semibold">{formatUsd(balance)}</span>
          </div>

          <div className="space-y-2">
            <Label htmlFor="liq-amount" className="text-xs">Amount to Add ($)</Label>
            <Input
              id="liq-amount"
              type="number"
              min="0.01"
              step="0.01"
              max={balance}
              placeholder="e.g. 10.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
            <div className="flex gap-2">
              {[5, 10, 25, 50].map((v) => (
                <button
                  key={v}
                  onClick={() => setAmount(String(Math.min(v, balance)))}
                  className="flex-1 text-[10px] font-semibold py-1.5 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
                >
                  ${v}
                </button>
              ))}
            </div>
          </div>

          {numAmount > balance && (
            <p className="text-xs text-destructive">Insufficient balance</p>
          )}

          <Button
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            className="w-full"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Droplets className="w-4 h-4 mr-2" />
            )}
            {submitting ? "Adding..." : `Add ${numAmount > 0 ? formatUsd(numAmount) : ""} Liquidity`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddLiquidityModal;
