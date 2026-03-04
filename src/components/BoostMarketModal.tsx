import { useState, useEffect, useRef } from "react";
import { X, Zap, Flame, Crown, Copy, Check, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import BottomSheet from "@/components/BottomSheet";

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

interface BoostMarketModalProps {
  open: boolean;
  onClose: () => void;
  marketId: string;
  marketTitle: string;
}

type Step = "select" | "pay" | "success";

const BoostMarketModal = ({ open, onClose, marketId, marketTitle }: BoostMarketModalProps) => {
  const [selectedTier, setSelectedTier] = useState<BoostTier>(BOOST_TIERS[1]);
  const [step, setStep] = useState<Step>("select");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [paymentInfo, setPaymentInfo] = useState<{
    boost_id: string;
    pay_address: string;
    pay_amount: number;
    pay_currency: string;
  } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setStep("select");
      setPaymentInfo(null);
      setLoading(false);
      if (pollRef.current) clearInterval(pollRef.current);
    }
  }, [open]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startPolling = (boostId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const { data } = await supabase
        .from("market_boosts")
        .select("status")
        .eq("id", boostId)
        .single();

      if (data?.status === "active") {
        if (pollRef.current) clearInterval(pollRef.current);
        setStep("success");
      }
    }, 5000);
  };

  const handleCreatePayment = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please sign in to boost a market");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("create-boost-payment", {
        body: { market_id: marketId, tier: selectedTier.id },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setPaymentInfo({
        boost_id: data.boost_id,
        pay_address: data.pay_address,
        pay_amount: data.pay_amount,
        pay_currency: data.pay_currency,
      });
      setStep("pay");
      startPolling(data.boost_id);
    } catch (err: any) {
      toast.error(err?.message || "Failed to create payment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} className="p-5">
      <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto mb-4" />

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold">
            {step === "success" ? "Boost Active! 🚀" : "Boost Market"}
          </h2>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors">
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      <div className="space-y-5">
        {step === "select" && (
          <>
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

            <button
              onClick={handleCreatePayment}
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-bold text-sm bg-primary text-primary-foreground transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating payment...
                </>
              ) : (
                `Pay $${selectedTier.price} & Boost`
              )}
            </button>
          </>
        )}

        {step === "pay" && paymentInfo && (
          <>
            <div className="text-center space-y-1">
              <p className="text-sm text-muted-foreground">
                Send exactly <span className="font-bold text-foreground">{paymentInfo.pay_amount} {paymentInfo.pay_currency.toUpperCase()}</span> to:
              </p>
            </div>

            <div className="glass rounded-xl p-4 space-y-3">
              {/* QR Code */}
              <div className="flex justify-center">
                <div className="rounded-xl bg-white p-3 inline-block">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(paymentInfo.pay_address)}`}
                    alt="Payment QR Code"
                    className="w-[160px] h-[160px]"
                    loading="eager"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-3">
                <code className="text-xs flex-1 break-all text-foreground/80">{paymentInfo.pay_address}</code>
                <button
                  onClick={() => handleCopy(paymentInfo.pay_address)}
                  className="shrink-0 w-8 h-8 rounded-md flex items-center justify-center hover:bg-muted transition-colors"
                >
                  {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Waiting for payment confirmation...
            </div>

            <p className="text-xs text-center text-muted-foreground">
              The boost will activate automatically once payment is confirmed. This usually takes 1-5 minutes.
            </p>
          </>
        )}

        {step === "success" && (
          <div className="text-center space-y-4 py-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Zap className="w-8 h-8 text-primary" />
            </div>
            <div>
              <p className="font-bold text-lg">Boost is Live!</p>
              <p className="text-sm text-muted-foreground mt-1">
                Your {selectedTier.label} boost ({selectedTier.duration}) is now active.
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl font-bold text-sm bg-primary text-primary-foreground transition-all active:scale-95"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
};

export default BoostMarketModal;
