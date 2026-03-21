import { useState, useEffect, useRef } from "react";
import { X, Zap, Flame, Crown, Copy, Check, Loader2, AlertTriangle, ChevronLeft, Megaphone, Clock, Wallet, CreditCard, Banknote, Tv, Link2 } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import BottomSheet from "@/components/BottomSheet";
import { useUserBalance } from "@/hooks/useUserBalance";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import { useCommissionSettings } from "@/hooks/useCommissionSettings";

interface BoostTier {
  id: "flash" | "standard" | "whale";
  label: string;
  duration: string;
  durationHours: number;
  price: number;
  rank: number;
  icon: React.ReactNode;
  color: string;
}

const BROADCAST_PRICE_DEFAULT = 5;

const buildBoostTiers = (flashPrice: number, standardPrice: number, whalePrice: number): BoostTier[] => [
  {
    id: "flash",
    label: "Flash Boost",
    duration: "12h",
    durationHours: 12,
    price: flashPrice,
    rank: 1,
    icon: <Zap className="w-8 h-8" />,
    color: "hsl(var(--primary))",
  },
  {
    id: "standard",
    label: "Standard",
    duration: "1 Day",
    durationHours: 24,
    price: standardPrice,
    rank: 2,
    icon: <Flame className="w-8 h-8" />,
    color: "hsl(280, 70%, 60%)",
  },
  {
    id: "whale",
    label: "Whale Pin",
    duration: "7 Days",
    durationHours: 168,
    price: whalePrice,
    rank: 3,
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

type Step = "select" | "confirm" | "pay" | "success";
type PayMethod = "balance" | "crypto" | "ngn";

interface ActiveBoostInfo {
  tier: string;
  ends_at: string;
  rank: number;
}

const BoostMarketModal = ({ open, onClose, marketId, marketTitle }: BoostMarketModalProps) => {
  const { data: commissionSettings } = useCommissionSettings();
  const BOOST_TIERS = buildBoostTiers(
    commissionSettings?.boost_flash_price ?? 20,
    commissionSettings?.boost_standard_price ?? 50,
    commissionSettings?.boost_whale_price ?? 150,
  );
  const BROADCAST_PRICE = commissionSettings?.broadcast_price ?? BROADCAST_PRICE_DEFAULT;
  const SOCIAL_AD_PRICE = commissionSettings?.social_ad_price ?? 10;

  const [selectedTier, setSelectedTier] = useState<BoostTier | null>(null);
  const [broadcastSelected, setBroadcastSelected] = useState(false);
  const [socialAdSelected, setSocialAdSelected] = useState(false);
  const [adHeadline, setAdHeadline] = useState("");
  const [adVideoUrl, setAdVideoUrl] = useState("");
  const [step, setStep] = useState<Step>("select");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeBoost, setActiveBoost] = useState<ActiveBoostInfo | null>(null);
  const [payMethod, setPayMethod] = useState<PayMethod>("balance");
  const [ngnCopied, setNgnCopied] = useState<string | null>(null);
  const [paymentInfo, setPaymentInfo] = useState<{
    boost_id?: string;
    broadcast_id?: string;
    pay_address?: string;
    pay_amount?: number;
    pay_currency?: string;
    extending?: boolean;
    new_ends_at?: string;
    total_charged?: number;
    bonus_used?: number;
    main_used?: number;
    bank_name?: string;
    account_number?: string;
    account_name?: string;
    amount_ngn?: number;
    amount_usd?: number;
    exchange_rate?: number | null;
    expires_at?: string | null;
  } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { balance, bonusBalance, totalBalance, isLoading: balLoading } = useUserBalance();
  const { isFeatureEnabled } = useFeatureToggles();
  const balancePayEnabled = isFeatureEnabled("balance_promotions");
  const ngnPayEnabled = isFeatureEnabled("ngn_promotions");

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Fetch existing active boost for this market
  useEffect(() => {
    if (!open || !marketId) {
      setActiveBoost(null);
      return;
    }

    const fetchActiveBoost = async () => {
      const now = new Date().toISOString();
      const { data } = await supabase
        .from("market_boosts")
        .select("tier, ends_at")
        .eq("market_id", marketId)
        .eq("status", "active")
        .gte("ends_at", now)
        .order("ends_at", { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        const tierRanks: Record<string, number> = { flash: 1, standard: 2, whale: 3 };
        setActiveBoost({
          tier: data[0].tier,
          ends_at: data[0].ends_at,
          rank: tierRanks[data[0].tier] || 0,
        });
      } else {
        setActiveBoost(null);
      }
    };

    fetchActiveBoost();
  }, [open, marketId]);

  useEffect(() => {
    if (!open) {
      setStep("select");
      setPaymentInfo(null);
      setLoading(false);
      setSelectedTier(null);
      setBroadcastSelected(false);
      setSocialAdSelected(false);
      setAdHeadline("");
      setAdVideoUrl("");
      setPayMethod(balancePayEnabled ? "balance" : "crypto");
      setNgnCopied(null);
      if (pollRef.current) clearInterval(pollRef.current);
    }
  }, [open]);

  const totalPrice = (selectedTier?.price || 0) + (broadcastSelected ? BROADCAST_PRICE : 0) + (socialAdSelected ? SOCIAL_AD_PRICE : 0);
  const hasSelection = selectedTier || broadcastSelected || socialAdSelected;

  // Balance breakdown calculation
  const bonusDeduct = Math.min(bonusBalance, totalPrice);
  const mainDeduct = totalPrice - bonusDeduct;
  const canPayFromBalance = totalBalance >= totalPrice;

  const isTierBlocked = (tier: BoostTier) => {
    if (!activeBoost) return false;
    return tier.rank < activeBoost.rank;
  };

  const formatTimeRemaining = (endsAt: string) => {
    const diff = new Date(endsAt).getTime() - Date.now();
    if (diff <= 0) return "expiring soon";
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h left`;
    if (hours > 0) return `${hours}h ${mins}m left`;
    return `${mins}m left`;
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startPolling = (boostId?: string, broadcastId?: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      let boostDone = !boostId;
      let broadcastDone = !broadcastId;

      if (boostId) {
        const { data } = await supabase
          .from("market_boosts")
          .select("status")
          .eq("id", boostId)
          .single();
        if (data?.status === "active") boostDone = true;
      }

      if (broadcastId) {
        const { data } = await supabase
          .from("market_broadcasts")
          .select("status")
          .eq("id", broadcastId)
          .single();
        if (data?.status === "sent") broadcastDone = true;
      }

      if (boostDone && broadcastDone) {
        if (pollRef.current) clearInterval(pollRef.current);
        setStep("success");
      }
    }, 5000);
  };

  const handlePayWithBalance = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("pay-promotion-balance", {
        body: {
          market_id: marketId,
          boost_tier: selectedTier?.id || null,
          include_broadcast: broadcastSelected,
          include_social_ad: socialAdSelected,
          ad_headline: adHeadline || null,
          ad_video_url: adVideoUrl || null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setPaymentInfo({
        boost_id: data.boost_id,
        broadcast_id: data.broadcast_id,
        extending: data.extending,
        new_ends_at: data.new_ends_at,
        total_charged: data.total_charged,
        bonus_used: data.bonus_used,
        main_used: data.main_used,
      });
      setStep("success");
      toast.success("Payment successful!");
    } catch (err: any) {
      toast.error(err?.message || "Failed to process payment");
    } finally {
      setLoading(false);
    }
  };

  const handlePayWithCrypto = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please sign in first");
        setLoading(false);
        return;
      }

      if (selectedTier) {
        const { data, error } = await supabase.functions.invoke("create-boost-payment", {
          body: { market_id: marketId, tier: selectedTier.id },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        let broadcastId: string | undefined;
        if (broadcastSelected) {
          const { data: bData, error: bError } = await supabase.functions.invoke("create-broadcast-payment", {
            body: { market_id: marketId },
          });
          if (!bError && bData && !bData.error) {
            broadcastId = bData.broadcast_id;
          }
        }

        setPaymentInfo({
          boost_id: data.boost_id,
          broadcast_id: broadcastId,
          pay_address: data.pay_address,
          pay_amount: data.pay_amount,
          pay_currency: data.pay_currency,
          extending: data.extending,
          new_ends_at: data.new_ends_at,
        });
        setStep("pay");
        startPolling(data.boost_id, broadcastId);
      } else if (broadcastSelected) {
        const { data, error } = await supabase.functions.invoke("create-broadcast-payment", {
          body: { market_id: marketId },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        setPaymentInfo({
          broadcast_id: data.broadcast_id,
          pay_address: data.pay_address,
          pay_amount: data.pay_amount,
          pay_currency: data.pay_currency,
        });
        setStep("pay");
        startPolling(undefined, data.broadcast_id);
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to create payment");
    } finally {
      setLoading(false);
    }
  };

  const handlePayWithNgn = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-promotion-payaza", {
        body: {
          market_id: marketId,
          boost_tier: selectedTier?.id || null,
          include_broadcast: broadcastSelected,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setPaymentInfo({
        boost_id: data.boost_id,
        broadcast_id: data.broadcast_id,
        bank_name: data.bank_name,
        account_number: data.account_number,
        account_name: data.account_name,
        amount_ngn: data.amount_ngn,
        amount_usd: data.amount_usd,
        exchange_rate: data.exchange_rate,
        expires_at: data.expires_at,
      });
      setStep("pay");
      startPolling(data.boost_id, data.broadcast_id);
    } catch (err: any) {
      toast.error(err?.message || "Failed to create NGN payment");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmPayment = () => {
    if (payMethod === "balance") {
      handlePayWithBalance();
    } else if (payMethod === "ngn") {
      handlePayWithNgn();
    } else {
      handlePayWithCrypto();
    }
  };

  const isExtending = activeBoost && selectedTier;

  return (
    <BottomSheet open={open} onClose={onClose} className="p-5">
      <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto mb-4" />

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold">
            {step === "success" ? "All Set! 🚀" : "Promote Market"}
          </h2>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors">
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      <div className="space-y-5">
        {step === "select" && (
          <>
            {/* Active Boost Banner */}
            {activeBoost && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/10 border border-primary/20">
                <Clock className="w-5 h-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    Active {activeBoost.tier.charAt(0).toUpperCase() + activeBoost.tier.slice(1)} boost
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatTimeRemaining(activeBoost.ends_at)} — select same or higher tier to extend
                  </p>
                </div>
              </div>
            )}

            {/* Boost Section */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">⚡ Boost Market</p>
              <div className="grid grid-cols-3 gap-3">
                {BOOST_TIERS.map((tier) => {
                  const blocked = isTierBlocked(tier);
                  const isExtendingTier = activeBoost && tier.rank >= activeBoost.rank;
                  return (
                    <button
                      key={tier.id}
                      onClick={() => !blocked && setSelectedTier(selectedTier?.id === tier.id ? null : tier)}
                      disabled={blocked}
                      className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
                        blocked
                          ? "border-border bg-muted/20 opacity-40 cursor-not-allowed"
                          : selectedTier?.id === tier.id
                          ? "border-primary/50 bg-primary/5 scale-105"
                          : "border-border bg-muted/30 hover:border-muted-foreground/30"
                      }`}
                    >
                      <div style={{ color: blocked ? "hsl(var(--muted-foreground))" : tier.color }}>{tier.icon}</div>
                      <span className="text-sm font-bold">{tier.label}</span>
                      <span className="text-xs text-muted-foreground">{tier.duration}</span>
                      <span className="text-sm font-bold px-3 py-1 rounded-md bg-background border border-border">
                        ${tier.price}
                      </span>
                      {isExtendingTier && !blocked && (
                        <span className="text-[10px] text-primary font-semibold">+{tier.duration}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Broadcast Section */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">📢 Broadcast</p>
              <button
                onClick={() => setBroadcastSelected(!broadcastSelected)}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all ${
                  broadcastSelected
                    ? "border-primary/50 bg-primary/5"
                    : "border-border bg-muted/30 hover:border-muted-foreground/30"
                }`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${broadcastSelected ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                  <Megaphone className="w-7 h-7" />
                </div>
                <div className="flex-1 text-left">
                  <span className="text-sm font-bold block">Alert</span>
                  <span className="text-xs text-muted-foreground">Push notification to all users</span>
                </div>
                <span className="text-sm font-bold px-3 py-1 rounded-md bg-background border border-border">
                  ${BROADCAST_PRICE}
                </span>
              </button>
            </div>

            {/* Social Ad Section */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">📺 Social Ad</p>
              <button
                onClick={() => setSocialAdSelected(!socialAdSelected)}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all ${
                  socialAdSelected
                    ? "border-primary/50 bg-primary/5"
                    : "border-border bg-muted/30 hover:border-muted-foreground/30"
                }`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${socialAdSelected ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                  <Tv className="w-7 h-7" />
                </div>
                <div className="flex-1 text-left">
                  <span className="text-sm font-bold block">Sponsored Post</span>
                  <span className="text-xs text-muted-foreground">Appears in everyone's feed as an ad</span>
                </div>
                <span className="text-sm font-bold px-3 py-1 rounded-md bg-background border border-border">
                  ${SOCIAL_AD_PRICE}
                </span>
              </button>

              {socialAdSelected && (
                <div className="mt-3 space-y-2">
                  <input
                    type="text"
                    value={adHeadline}
                    onChange={(e) => setAdHeadline(e.target.value)}
                    placeholder="Custom headline (optional)"
                    className="w-full px-3 py-2.5 rounded-lg border border-border bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                    maxLength={120}
                  />
                  <div className="relative">
                    <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="url"
                      value={adVideoUrl}
                      onChange={(e) => setAdVideoUrl(e.target.value)}
                      placeholder="YouTube video URL (optional)"
                      className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-border bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                  </div>
                </div>
              )}
            </div>

              onClick={() => setStep("confirm")}
              disabled={!hasSelection}
              className="w-full py-3.5 rounded-xl font-bold text-sm bg-primary text-primary-foreground transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {hasSelection
                ? isExtending
                  ? `Extend Boost – $${totalPrice}`
                  : `Continue – $${totalPrice}`
                : "Select an option"}
            </button>
          </>
        )}

        {step === "confirm" && (
          <>
            {/* Payment Method Selector */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Payment Method</p>
              <div className={`grid gap-3 ${balancePayEnabled && ngnPayEnabled ? "grid-cols-3" : balancePayEnabled || ngnPayEnabled ? "grid-cols-2" : "grid-cols-1"}`}>
                {balancePayEnabled && (
                <button
                  onClick={() => setPayMethod("balance")}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                    payMethod === "balance"
                      ? "border-primary/50 bg-primary/5"
                      : "border-border bg-muted/30 hover:border-muted-foreground/30"
                  }`}
                >
                  <Wallet className="w-5 h-5" />
                  <span className="text-xs font-bold">Balance</span>
                  <span className="text-[10px] text-muted-foreground">${totalBalance.toFixed(2)}</span>
                </button>
                )}
                <button
                  onClick={() => setPayMethod("crypto")}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                    payMethod === "crypto"
                      ? "border-primary/50 bg-primary/5"
                      : "border-border bg-muted/30 hover:border-muted-foreground/30"
                  }`}
                >
                  <CreditCard className="w-5 h-5" />
                  <span className="text-xs font-bold">Crypto</span>
                  <span className="text-[10px] text-muted-foreground">USDT</span>
                </button>
                {ngnPayEnabled && (
                <button
                  onClick={() => setPayMethod("ngn")}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                    payMethod === "ngn"
                      ? "border-primary/50 bg-primary/5"
                      : "border-border bg-muted/30 hover:border-muted-foreground/30"
                  }`}
                >
                  <Banknote className="w-5 h-5" />
                  <span className="text-xs font-bold">NGN</span>
                  <span className="text-[10px] text-muted-foreground">Bank Transfer</span>
                </button>
                )}
              </div>
            </div>

            {/* Order Summary */}
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Order Summary</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Market</span>
                  <span className="font-medium text-foreground text-right max-w-[60%] truncate">{marketTitle}</span>
                </div>
                {selectedTier && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Boost Tier</span>
                      <span className="font-medium text-foreground">
                        {selectedTier.label} ({selectedTier.duration})
                        {isExtending && <span className="text-primary ml-1">↗ extend</span>}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Boost Cost</span>
                      <span className="font-medium text-foreground">${selectedTier.price.toFixed(2)}</span>
                    </div>
                  </>
                )}
                {broadcastSelected && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Broadcast Alert</span>
                    <span className="font-medium text-foreground">${BROADCAST_PRICE.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-border pt-2 mt-2">
                  <span className="font-bold text-foreground">Total</span>
                  <span className="font-bold text-foreground">${totalPrice.toFixed(2)} USD</span>
                </div>
              </div>

              {/* Balance Payment Breakdown */}
              {payMethod === "balance" && (
                <div className="border-t border-border pt-3 mt-1 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment Breakdown</p>
                  {bonusDeduct > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">From Bonus Balance</span>
                      <span className="font-medium text-primary">−${bonusDeduct.toFixed(2)}</span>
                    </div>
                  )}
                  {mainDeduct > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">From Main Balance</span>
                      <span className="font-medium text-foreground">−${mainDeduct.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Remaining Balance</span>
                    <span className="font-medium text-foreground">
                      ${Math.max(0, totalBalance - totalPrice).toFixed(2)}
                    </span>
                  </div>

                  {!canPayFromBalance && (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 mt-1">
                      <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                      <p className="text-xs text-destructive">
                        Insufficient balance. You need ${(totalPrice - totalBalance).toFixed(2)} more. Deposit funds or pay with crypto.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep("select")}
                className="flex-1 py-3 rounded-xl font-bold text-sm border border-border bg-muted/30 text-foreground transition-all active:scale-95 flex items-center justify-center gap-1.5"
              >
                <ChevronLeft className="w-4 h-4" />
                Go Back
              </button>
              <button
                onClick={handleConfirmPayment}
                disabled={loading || (payMethod === "balance" && !canPayFromBalance)}
                className="flex-1 py-3 rounded-xl font-bold text-sm bg-primary text-primary-foreground transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : payMethod === "balance" ? (
                  <>
                    <Wallet className="w-4 h-4" />
                    Pay from Balance
                  </>
                ) : payMethod === "ngn" ? (
                  <>
                    <Banknote className="w-4 h-4" />
                    Pay with NGN
                  </>
                ) : (
                  "Confirm & Pay"
                )}
              </button>
            </div>
          </>
        )}

        {step === "pay" && paymentInfo && paymentInfo.pay_address && (
          <>
            <div className="text-center space-y-1">
              <p className="text-sm text-muted-foreground">
                Send exactly <span className="font-bold text-foreground">{paymentInfo.pay_amount} {paymentInfo.pay_currency?.toUpperCase()}</span> to:
              </p>
            </div>

            <div className="glass rounded-xl p-4 space-y-3">
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
                  onClick={() => handleCopy(paymentInfo.pay_address!)}
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
              {paymentInfo.extending
                ? "The existing boost will be extended once payment is confirmed."
                : selectedTier && broadcastSelected
                ? "Both boost and broadcast will activate once all payments are confirmed."
                : selectedTier
                ? "The boost will activate automatically once payment is confirmed."
                : "The broadcast will be sent once payment is confirmed."}
              {" "}This usually takes 1-5 minutes.
            </p>
          </>
        )}

        {/* NGN Bank Transfer Pay Step */}
        {step === "pay" && paymentInfo && paymentInfo.account_number && !paymentInfo.pay_address && (
          <>
            <div className="text-center space-y-1">
              <p className="text-sm text-muted-foreground">
                Transfer exactly <span className="font-bold text-foreground">₦{paymentInfo.amount_ngn?.toLocaleString()}</span> to:
              </p>
            </div>

            <div className="glass rounded-xl p-4 space-y-3">
              {[
                { label: "Bank", value: paymentInfo.bank_name || "" },
                { label: "Account Number", value: paymentInfo.account_number || "" },
                { label: "Account Name", value: paymentInfo.account_name || "" },
                { label: "Amount", value: `₦${paymentInfo.amount_ngn?.toLocaleString()}` },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{row.label}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-foreground">{row.value}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(row.value.replace(/[₦,]/g, ""));
                        setNgnCopied(row.label);
                        setTimeout(() => setNgnCopied(null), 2000);
                      }}
                      className="w-6 h-6 rounded flex items-center justify-center hover:bg-muted transition-colors"
                    >
                      {ngnCopied === row.label ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
                    </button>
                  </div>
                </div>
              ))}

              {paymentInfo.exchange_rate && (
                <div className="text-[10px] text-muted-foreground text-center border-t border-border pt-2">
                  Rate: $1 = ₦{paymentInfo.exchange_rate.toLocaleString()} · Total: ${paymentInfo.amount_usd}
                </div>
              )}

              {paymentInfo.expires_at && (
                <div className="text-[10px] text-center text-destructive">
                  Expires: {new Date(paymentInfo.expires_at).toLocaleTimeString()}
                </div>
              )}
            </div>

            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Waiting for transfer confirmation...
            </div>

            <p className="text-xs text-center text-muted-foreground">
              Transfer the exact amount shown. Your promotion will activate automatically once the payment is confirmed.
            </p>
          </>
        )}

        {step === "success" && (
          <div className="text-center space-y-4 py-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              {broadcastSelected && !selectedTier ? (
                <Megaphone className="w-8 h-8 text-primary" />
              ) : (
                <Zap className="w-8 h-8 text-primary" />
              )}
            </div>
            <div>
              <p className="font-bold text-lg">
                {selectedTier && broadcastSelected
                  ? paymentInfo?.extending ? "Boost Extended & Broadcast Sent!" : "Boost & Broadcast Live!"
                  : selectedTier
                  ? paymentInfo?.extending ? "Boost Extended!" : "Boost is Live!"
                  : "Broadcast Sent!"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedTier && paymentInfo?.extending && paymentInfo?.new_ends_at
                  ? `Your boost has been extended until ${new Date(paymentInfo.new_ends_at).toLocaleString()}. `
                  : selectedTier
                  ? `Your ${selectedTier.label} boost (${selectedTier.duration}) is now active. `
                  : ""}
                {broadcastSelected && "A push notification has been sent to all users."}
              </p>
              {/* Balance payment receipt */}
              {paymentInfo?.total_charged != null && (
                <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 text-left space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Receipt</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Charged</span>
                    <span className="font-bold text-foreground">${paymentInfo.total_charged.toFixed(2)}</span>
                  </div>
                  {(paymentInfo.bonus_used ?? 0) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Bonus Used</span>
                      <span className="font-medium text-primary">${paymentInfo.bonus_used!.toFixed(2)}</span>
                    </div>
                  )}
                  {(paymentInfo.main_used ?? 0) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Main Balance Used</span>
                      <span className="font-medium text-foreground">${paymentInfo.main_used!.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}
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
