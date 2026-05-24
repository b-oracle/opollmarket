import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, AlertTriangle, ArrowDownToLine, Undo2, Search, Coins } from "lucide-react";

interface PreviewData {
  tx_hash: string;
  from: string;
  to: string;
  user_id: string;
  hd_index: number;
  bnb_amount: number;
  bnb_price_usd: number | null;
  usd_value: number | null;
  block_number: number;
}

const AdminBscMistakenDeposit = () => {
  const [txHash, setTxHash] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [acting, setActing] = useState<"credit_and_sweep" | "refund" | null>(null);

  const call = async (action: "preview" | "credit_and_sweep" | "refund") => {
    const hash = txHash.trim().toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(hash)) {
      toast.error("Enter a valid BSC transaction hash (0x… 64 hex chars)");
      return;
    }
    if (action === "preview") setLoading(true); else setActing(action);
    try {
      const { data, error } = await supabase.functions.invoke("recover-bsc-native", {
        body: { action, tx_hash: hash },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      if (action === "preview") {
        setPreview(data as PreviewData);
      } else {
        toast.success(
          action === "credit_and_sweep"
            ? `Credited $${(data as any).credited_usd?.toFixed?.(2) ?? "?"} and swept to treasury`
            : `Refunded ${(data as any).bnb_sent} BNB to sender`
        );
        setPreview(null);
        setTxHash("");
      }
    } catch (e: any) {
      toast.error(e?.message || "Recovery failed");
    } finally {
      setLoading(false);
      setActing(null);
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Coins className="w-6 h-6 text-primary" />
          BSC Mistaken Deposit Recovery
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Recover native BNB that a user sent to their USDT/USDC deposit address by mistake.
          The system only auto-credits ERC-20 stablecoin transfers — native BNB is invisible to the poller.
        </p>
      </div>

      <Card className="p-4 mb-4 border-amber-500/30 bg-amber-500/5">
        <div className="flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm space-y-1">
            <p><strong>Super-admin only.</strong> Every action signs an on-chain BSC transaction using the user's derived private key.</p>
            <p>Always preview first. Each tx hash can only be processed once.</p>
          </div>
        </div>
      </Card>

      <Card className="p-4 mb-4">
        <label className="text-sm font-medium mb-2 block">BSC Transaction Hash</label>
        <div className="flex gap-2">
          <Input
            placeholder="0x…"
            value={txHash}
            onChange={(e) => { setTxHash(e.target.value); setPreview(null); }}
            disabled={loading || !!acting}
            className="font-mono text-sm"
          />
          <Button onClick={() => call("preview")} disabled={loading || !!acting}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            <span className="ml-2">Verify</span>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Paste the BscScan tx hash of the user's accidental BNB transfer.
        </p>
      </Card>

      {preview && (
        <Card className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-muted-foreground">From</div>
              <div className="font-mono text-xs break-all">{preview.from}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Deposit address (to)</div>
              <div className="font-mono text-xs break-all">{preview.to}</div>
            </div>
            <div>
              <div className="text-muted-foreground">User ID</div>
              <div className="font-mono text-xs break-all">{preview.user_id}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Block</div>
              <div className="font-mono text-xs">{preview.block_number}</div>
            </div>
            <div>
              <div className="text-muted-foreground">BNB amount</div>
              <div className="text-lg font-semibold">{preview.bnb_amount} BNB</div>
            </div>
            <div>
              <div className="text-muted-foreground">USD value (live)</div>
              <div className="text-lg font-semibold">
                {preview.usd_value !== null
                  ? `$${preview.usd_value.toFixed(2)}`
                  : "—"}
                {preview.bnb_price_usd && (
                  <span className="text-xs text-muted-foreground ml-1">
                    @ ${preview.bnb_price_usd.toFixed(2)}/BNB
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t">
            <Button
              onClick={() => call("credit_and_sweep")}
              disabled={!!acting}
              className="flex-1"
            >
              {acting === "credit_and_sweep"
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <ArrowDownToLine className="w-4 h-4" />}
              <span className="ml-2">Credit user & sweep to treasury</span>
            </Button>
            <Button
              onClick={() => call("refund")}
              disabled={!!acting}
              variant="outline"
              className="flex-1"
            >
              {acting === "refund"
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Undo2 className="w-4 h-4" />}
              <span className="ml-2">Refund to sender</span>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Sweep/refund tx fees come out of the BNB balance at the deposit address.
            The exact USD credited is computed from the original tx amount (not current balance).
          </p>
        </Card>
      )}
    </div>
  );
};

export default AdminBscMistakenDeposit;
