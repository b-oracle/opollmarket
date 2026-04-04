import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Megaphone, Loader2, AlertTriangle } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

interface BroadcastSpaceModalProps {
  open: boolean;
  onClose: () => void;
  spaceId: string;
  spaceTitle: string;
}

const BroadcastSpaceModal = ({ open, onClose, spaceId, spaceTitle }: BroadcastSpaceModalProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [sending, setSending] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ["commission-settings-broadcast"],
    queryFn: async () => {
      const { data } = await supabase
        .from("public_commission_settings" as any)
        .select("broadcast_price")
        .limit(1)
        .single();
      return data;
    },
    staleTime: 60_000,
  });

  const { data: balance } = useQuery({
    queryKey: ["user-balance", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("balances")
        .select("amount, bonus_balance")
        .eq("user_id", user!.id)
        .eq("currency", "USDT")
        .single();
      return data;
    },
    enabled: !!user?.id && open,
  });

  const price = settings?.broadcast_price ?? 5;
  const mainBal = balance?.amount ?? 0;
  const bonusBal = balance?.bonus_balance ?? 0;
  const totalAvailable = mainBal + bonusBal;
  const canAfford = totalAvailable >= price;

  const handleBroadcast = async () => {
    if (!user || !canAfford) return;
    setSending(true);
    try {
      // Calculate split: bonus first
      const bonusUse = Math.min(bonusBal, price);
      const mainUse = price - bonusUse;

      // Debit balance
      const { data: debitResult } = await supabase.rpc("debit_balance_atomic", {
        _user_id: user.id,
        _main_deduct: mainUse,
        _bonus_deduct: bonusUse,
      });

      const dr = debitResult as any;
      if (!dr?.success) {
        toast.error(dr?.error || "Failed to debit balance");
        setSending(false);
        return;
      }

      // Insert broadcast record
      const { data: bc, error: bcError } = await supabase
        .from("space_broadcasts" as any)
        .insert({
          space_id: spaceId,
          user_id: user.id,
          amount: price,
          status: "pending",
          bonus_amount: bonusUse,
        } as any)
        .select("id")
        .single();

      if (bcError || !bc) {
        toast.error("Failed to create broadcast record");
        setSending(false);
        return;
      }

      // Invoke edge function
      const { error: fnError } = await supabase.functions.invoke("send-space-broadcast", {
        body: { broadcast_id: (bc as any).id, space_id: spaceId },
      });

      if (fnError) {
        console.error("Broadcast function error:", fnError);
        toast.error("Broadcast sent but notification dispatch may be delayed");
      } else {
        toast.success("Broadcast sent to all users! 📢");
      }

      queryClient.invalidateQueries({ queryKey: ["user-balance"] });
      queryClient.invalidateQueries({ queryKey: ["my-space-broadcasts"] });
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent className="px-4 pb-24">
        <DrawerHeader className="px-0">
          <DrawerTitle className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-primary" />
            Broadcast Space
          </DrawerTitle>
        </DrawerHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Send a notification alert to <strong>all users</strong> about this space.
          </p>

          <div className="bg-muted/50 rounded-xl p-3 space-y-1">
            <p className="text-xs text-muted-foreground">Space</p>
            <p className="text-sm font-semibold truncate">{spaceTitle}</p>
          </div>

          <div className="bg-muted/50 rounded-xl p-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Cost</span>
            <span className="text-lg font-bold text-primary">${price.toFixed(2)}</span>
          </div>

          <div className="bg-muted/50 rounded-xl p-3 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Main Balance</span>
              <span>${mainBal.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Bonus Balance</span>
              <span>${bonusBal.toFixed(2)}</span>
            </div>
          </div>

          {!canAfford && (
            <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Insufficient balance. You need ${(price - totalAvailable).toFixed(2)} more.
            </div>
          )}

          <button
            onClick={handleBroadcast}
            disabled={sending || !canAfford}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Megaphone className="w-4 h-4" />
                Send Broadcast — ${price.toFixed(2)}
              </>
            )}
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default BroadcastSpaceModal;
