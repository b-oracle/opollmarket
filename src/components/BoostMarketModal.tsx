import { useState } from "react";
import { X, Zap, Flame, Crown, Copy, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface BoostTier {
  id: "flash" | "standard" | "whale";
  label: string;
  duration: string;
  durationHours: number;
  price: number;
  icon: React.ReactNode;
  color: string;
}

const BOOST_TIERS: BoostTier[] = [
  {
    id: "flash",
    label: "Flash Boost",
    duration: "12h",
    durationHours: 12,
    price: 20,
    icon: <Zap className="w-8 h-8" />,
    color: "hsl(var(--primary))",
  },
  {
    id: "standard",
    label: "Standard",
    duration: "1 Day",
    durationHours: 24,
    price: 50,
    icon: <Flame className="w-8 h-8" />,
    color: "hsl(280, 70%, 60%)",
  },
  {
    id: "whale",
    label: "Whale Pin",
    duration: "7 Days",
    durationHours: 168,
    price: 150,
    icon: <Crown className="w-8 h-8" />,
    color: "hsl(45, 93%, 58%)",
  },
];

const PAYMENT_ADDRESS = "0xfc8c540e7d3912458b36189f325f7f6d520be71d";

interface BoostMarketModalProps {
  open: boolean;
  onClose: () => void;
  marketId: string;
  marketTitle: string;
}

const BoostMarketModal = ({ open, onClose, marketId, marketTitle }: BoostMarketModalProps) => {
  const [selectedTier, setSelectedTier] = useState<BoostTier>(BOOST_TIERS[1]);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [txHash, setTxHash] = useState("");

  const handleCopy = () => {
    navigator.clipboard.writeText(PAYMENT_ADDRESS);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmitBoost = async () => {
    if (!txHash.trim()) {
      toast.error("Please enter your transaction hash");
      return;
    }
    setSubmitting(true);
    try {
      const endsAt = new Date();
      endsAt.setHours(endsAt.getHours() + selectedTier.durationHours);

      const { error } = await supabase.from("market_boosts").insert({
        market_id: marketId,
        tier: selectedTier.id,
        amount: selectedTier.price,
        tx_hash: txHash.trim(),
        payer_wallet: "",
        ends_at: endsAt.toISOString(),
        status: "pending",
      });

      if (error) throw error;
      toast.success("Boost submitted! It will be activated after verification.");
      onClose();
    } catch {
      toast.error("Failed to submit boost. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            className="relative w-full max-w-md mx-4 mb-0 sm:mb-0 rounded-t-2xl sm:rounded-2xl overflow-hidden"
            style={{ background: "hsl(var(--card))" }}
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-bold">Boost Market</h2>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Tier selection */}
              <div className="grid grid-cols-3 gap-3">
                {BOOST_TIERS.map((tier) => (
                  <button
                    key={tier.id}
                    onClick={() => setSelectedTier(tier)}
                    className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
                      selectedTier.id === tier.id
                        ? "border-primary/50 bg-primary/5 scale-105"
                        : "border-border bg-muted/30 hover:border-muted-foreground/30"
                    }`}
                  >
                    <div style={{ color: tier.color }}>{tier.icon}</div>
                    <span className="text-sm font-bold">{tier.label}</span>
                    <span className="text-xs text-muted-foreground">{tier.duration}</span>
                    <span className="text-sm font-bold px-3 py-1 rounded-md bg-background border border-border">
                      ${tier.price}
                    </span>
                  </button>
                ))}
              </div>

              {/* Payment info */}
              <div className="glass rounded-xl p-4 space-y-3">
                <p className="text-sm text-muted-foreground text-center">
                  Send <span className="font-bold text-foreground">${selectedTier.price} USDT or USDC (BEP20)</span> to this address:
                </p>
                <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-3">
                  <code className="text-xs flex-1 break-all text-foreground/80">{PAYMENT_ADDRESS}</code>
                  <button
                    onClick={handleCopy}
                    className="shrink-0 w-8 h-8 rounded-md flex items-center justify-center hover:bg-muted transition-colors"
                  >
                    {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                  </button>
                </div>
              </div>

              {/* TX hash input */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Transaction Hash</label>
                <input
                  type="text"
                  value={txHash}
                  onChange={(e) => setTxHash(e.target.value)}
                  placeholder="0x..."
                  className="w-full bg-muted/50 border border-border rounded-lg px-4 py-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              {/* Submit */}
              <button
                onClick={handleSubmitBoost}
                disabled={submitting}
                className="w-full py-3.5 rounded-xl font-bold text-sm bg-primary text-primary-foreground transition-all active:scale-95 disabled:opacity-50"
              >
                {submitting ? "Submitting..." : `Boost for $${selectedTier.price}`}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default BoostMarketModal;
