import { useState } from "react";
import { Link2, Loader2, ExternalLink, Check } from "lucide-react";
import { useSendTransaction, useAccount } from "wagmi";
import { parseEther } from "viem";
import { useAppKit } from "@reown/appkit/react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RECORDER_ADDRESS, encodeResolutionData } from "@/lib/blockchainRecord";

interface Props {
  marketId: string;
  resolvedSide: string;
  totalPaid: number;
  existingTxHash?: string | null;
  onRecorded?: () => void;
}

const RecordOnChainButton = ({ marketId, resolvedSide, totalPaid, existingTxHash, onRecorded }: Props) => {
  const { address, isConnected } = useAccount();
  const { open } = useAppKit();
  const { sendTransactionAsync } = useSendTransaction();
  const [loading, setLoading] = useState(false);

  if (existingTxHash) {
    return (
      <a
        href={`https://bscscan.com/tx/${existingTxHash}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-green-500 hover:underline"
        title="View on BSCScan"
      >
        <Check className="w-3.5 h-3.5" />
        On-chain
        <ExternalLink className="w-3 h-3" />
      </a>
    );
  }

  const handleRecord = async () => {
    if (!isConnected || !address) {
      open();
      return;
    }

    setLoading(true);
    try {
      const data = encodeResolutionData(marketId, resolvedSide, totalPaid);
      const hash = await sendTransactionAsync({
        to: RECORDER_ADDRESS,
        value: parseEther("0"),
        data,
      });

      await supabase
        .from("markets")
        .update({ blockchain_tx_hash: hash } as any)
        .eq("id", marketId);

      toast.success("Resolution recorded on-chain!", {
        action: {
          label: "View",
          onClick: () => window.open(`https://bscscan.com/tx/${hash}`, "_blank"),
        },
      });
      onRecorded?.();
    } catch (err: any) {
      if (err?.message?.includes("User rejected")) {
        toast.error("Transaction rejected");
      } else {
        toast.error("Failed to record on-chain");
        console.error(err);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleRecord}
      disabled={loading}
      className="p-1.5 rounded-lg hover:bg-primary/10 text-primary transition-colors disabled:opacity-50"
      title={isConnected ? "Record resolution on blockchain" : "Connect wallet to record on-chain"}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
    </button>
  );
};

export default RecordOnChainButton;
