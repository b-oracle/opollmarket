import LogoLoader from "@/components/LogoLoader";
import { useState, useCallback, useMemo } from "react";
import BottomSheet from "@/components/BottomSheet";
import DepositWithdrawModal from "@/components/DepositWithdrawModal";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useUserBalance, usePlaceBet } from "@/hooks/useUserBalance";
import { usePlaceLimitOrder } from "@/hooks/useLimitOrders";
import { useRateLimit } from "@/hooks/useRateLimit";
import { useCommissionSettings } from "@/hooks/useCommissionSettings";
import { useNavigate } from "react-router-dom";
import TermsAcceptanceModal, { hasAcceptedTerms } from "@/components/TermsAcceptanceModal";
import useAnalytics from "@/hooks/useAnalytics";
import {
  X,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ArrowRight,
  TrendingUp,
  Shield,
  Minus,
  Plus,
  LogIn,
  Clock,
  BellRing,
} from "lucide-react";


type BetSide = "yes" | "no";
type ModalStep = "input" | "insurance" | "confirm" | "executing" | "success" | "error";
type OrderType = "market" | "limit";

interface BetModalProps {
  open: boolean;
  onClose: () => void;
  side: BetSide;
  price: number;
  marketTitle: string;
  marketId?: string;
  optionId?: string;
  optionLabel?: string;
  optionColor?: string;
  marketType?: string;
}

const PRESET_AMOUNTS = [10, 25, 50, 100];

const ShareToXButton = ({ marketTitle, marketId, side, optionLabel }: { marketTitle: string; marketId?: string; side: string; optionLabel?: string }) => {
  const [sharing, setSharing] = useState(false);
  const [shared, setShared] = useState(false);
  const { user } = useAuth();

  const handleShare = async () => {
    if (!user || !marketId) return;
    setSharing(true);
    try {
      const base = `https://opoll.org/market/${marketId}`;
      const shareUrl = user?.id ? `${base}?ref=${user.id}` : base;
      const text = `I just predicted ${optionLabel || side.toUpperCase()} on "${marketTitle}" 🔮\n\nJoin me → ${shareUrl}`;
      const { data, error } = await supabase.functions.invoke("twitter-post-tweet", { body: { text } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setShared(true);
      toast.success("Shared to X!");
    } catch (err: any) {
      if (err.message?.includes("not linked")) {
        toast.error("Link your X account first in Profile → Connect");
      } else {
        toast.error(err.message || "Failed to share");
      }
    } finally {
      setSharing(false);
    }
  };

  if (shared) return null;

  return (
    <button
      onClick={handleShare}
      disabled={sharing}
      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl glass text-sm font-semibold mb-3 hover:bg-accent/50 transition-all active:scale-95 disabled:opacity-50"
    >
      {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : (
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
      )}
      Share to X
    </button>
  );
};

const BetModal = ({ open, onClose, side, price, marketTitle, marketId, optionId, optionLabel, optionColor, marketType }: BetModalProps) => {
  const isParimutuel = marketType === "multi" || marketType === "range";
  const { user, isEmailVerified } = useAuth();
  const { balance, bonusBalance, totalBalance } = useUserBalance();
  const { data: commission } = useCommissionSettings();
  const MIN_AMOUNT = commission?.prediction_min_bet ?? 1;
  const MAX_AMOUNT = commission?.prediction_max_bet ?? 10000;
  const placeBet = usePlaceBet();
  const placeLimitOrder = usePlaceLimitOrder();
  const navigate = useNavigate();
  const { checkLimit: checkBetLimit } = useRateLimit(5, 60000);
  const { track } = useAnalytics();
  const { isSupported: pushSupported, isSubscribed: pushSubscribed, loading: pushLoading, subscribe: pushSubscribe } = usePushNotifications();
  const [pushPromptDismissed, setPushPromptDismissed] = useState(false);
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<ModalStep>("input");
  const [errorMsg, setErrorMsg] = useState("");
  const [showTerms, setShowTerms] = useState(false);
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [limitPriceInput, setLimitPriceInput] = useState("");
  const [insuranceTier, setInsuranceTier] = useState<number | null>(null);
  const [showDepositModal, setShowDepositModal] = useState(false);

  const numAmount = parseFloat(amount) || 0;
  const limitPriceNum = parseFloat(limitPriceInput) || 0;
  const effectivePrice = orderType === "limit" ? limitPriceNum : price;

  // Single flat prediction fee
  const totalFeePercent = commission?.prediction_fee_percent ?? 10;
  const fee = orderType === "market" ? numAmount * (totalFeePercent / 100) : 0; // no fee on limit orders until filled
  const poolAmount = numAmount - fee;
  const shares = poolAmount > 0 && effectivePrice > 0 ? poolAmount / (effectivePrice / 100) : 0;
  const potentialPayout = shares;

  // oSURE insurance
  const osureEnabled = commission?.osure_enabled !== false;
  const insurancePremiumPercent = insuranceTier === 25 ? (commission?.osure_25_premium ?? 10) : insuranceTier === 50 ? (commission?.osure_50_premium ?? 20) : insuranceTier === 100 ? (commission?.osure_100_premium ?? 30) : 0;
  const insurancePremium = insuranceTier ? numAmount * (insurancePremiumPercent / 100) : 0;
  const insuranceCoverage = insuranceTier ? poolAmount * (insuranceTier / 100) : 0;

  const totalCost = numAmount + insurancePremium;
  const profit = potentialPayout - totalCost;
  const roi = numAmount > 0 ? (profit / totalCost) * 100 : 0;

  // Bonus can only cover fees, not the bet itself (matches edge function logic)
  const bonusForFees = Math.min(bonusBalance, fee);
  const mainNeeded = totalCost - bonusForFees;
  const canAfford = mainNeeded <= balance;

  const isLimitValid = orderType === "limit" ? limitPriceNum >= 1 && limitPriceNum <= 99 : true;
  const isValid = numAmount >= MIN_AMOUNT && numAmount <= MAX_AMOUNT && canAfford && isLimitValid;

  const handleAmountChange = (val: string) => {
    const cleaned = val.replace(/[^0-9.]/g, "");
    const parts = cleaned.split(".");
    if (parts.length > 2) return;
    if (parts[1] && parts[1].length > 2) return;
    if (parseFloat(cleaned) > MAX_AMOUNT) return;
    setAmount(cleaned);
  };

  const handleLimitPriceChange = (val: string) => {
    const cleaned = val.replace(/[^0-9]/g, "");
    if (parseInt(cleaned) > 99) return;
    setLimitPriceInput(cleaned);
  };

  const adjustAmount = (delta: number) => {
    const newVal = Math.max(MIN_AMOUNT, Math.min(MAX_AMOUNT, numAmount + delta));
    setAmount(newVal.toString());
  };

  const handleConfirm = useCallback(async () => {
    if (!marketId) return;
    if (!checkBetLimit()) {
      setErrorMsg("Too many predictions. Please wait a moment.");
      setStep("error");
      return;
    }
    setStep("executing");
    setErrorMsg("");
    try {
      if (orderType === "limit") {
        await placeLimitOrder.mutateAsync({
          marketId,
          optionId,
          side,
          amount: numAmount,
          limitPrice: limitPriceNum / 100, // store as decimal
          shares,
        });
        track("limit_order_placed", { marketId, side, amount: numAmount, limitPrice: limitPriceNum });
      } else {
        await placeBet.mutateAsync({
          marketId,
          optionId,
          side,
          amount: numAmount,
          price,
          shares,
          insuranceTier: insuranceTier || undefined,
        });
        track("prediction_confirmed", { marketId, side, amount: numAmount, insuranceTier: insuranceTier || 0 });
      }
      setStep("success");
    } catch (err: any) {
      setErrorMsg(err?.message || "Transaction failed");
      setStep("error");
    }
  }, [marketId, optionId, side, numAmount, price, shares, placeBet, placeLimitOrder, orderType, limitPriceNum, insuranceTier]);

  const handleClose = () => {
    setAmount("");
    setStep("input");
    setErrorMsg("");
    setOrderType("market");
    setLimitPriceInput("");
    setInsuranceTier(null);
    onClose();
  };

  const isYes = side === "yes";
  const sideTextClass = isYes ? "neon-yes" : "neon-no";
  const sideBgClass = isYes ? "bg-primary/10 border-primary/30" : "bg-destructive/10 border-destructive/30";
  const sideBtnClass = isYes ? "btn-yes" : "btn-no";

  if (!open) return null;

  return (
    <>
    <BottomSheet open={open} onClose={handleClose} maxHeight="80dvh" className="p-4">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto mb-3" />

              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${optionColor ? "" : isYes ? "bg-primary" : "bg-destructive"}`} style={optionColor ? { backgroundColor: optionColor } : undefined} />
                  <h2 className="text-lg font-bold">
                    Buy <span className={optionColor ? "font-bold" : sideTextClass} style={optionColor ? { color: optionColor } : undefined}>{optionLabel || side.toUpperCase()}</span>
                  </h2>
                </div>
                <button onClick={handleClose} className="w-8 h-8 rounded-full glass flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-muted-foreground mb-3 line-clamp-1">{marketTitle}</p>

              <AnimatePresence mode="wait">
                {step === "input" && (
                  <motion.div key="input" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                    {!user && (
                      <button
                        onClick={() => { handleClose(); navigate("/auth"); }}
                        className="flex items-center gap-2 p-2.5 rounded-xl bg-primary/10 border border-primary/20 mb-3 w-full"
                      >
                        <LogIn className="w-4 h-4 text-primary shrink-0" />
                        <p className="text-xs text-primary font-medium">Sign in to place predictions</p>
                      </button>
                    )}

                    {user && !isEmailVerified && (
                      <div className="p-2.5 rounded-xl bg-destructive/10 border border-destructive/20 mb-3 w-full">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                          <p className="text-xs text-destructive font-medium">Verify your email before placing predictions.</p>
                        </div>
                        <button
                          onClick={async () => {
                            const { error } = await supabase.auth.resend({ type: "signup", email: user.email! });
                            if (error) toast.error(error.message);
                            else toast.success("Verification email sent! Check your inbox.");
                          }}
                          className="mt-2 w-full text-xs font-semibold text-destructive hover:text-destructive/80 underline underline-offset-2 transition-colors"
                        >
                          Resend verification email
                        </button>
                      </div>
                    )}

                    {user && (
                      <div className="p-2.5 rounded-xl bg-muted/50 border border-border mb-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Main Balance</span>
                          <span className="text-sm font-bold">${balance.toFixed(2)}</span>
                        </div>
                        {bonusBalance > 0 && (
                          <div className="flex items-center justify-between mt-0.5">
                            <span className="text-xs text-muted-foreground">Bonus (fees only)</span>
                            <span className="text-xs text-muted-foreground">${bonusBalance.toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Order Type Toggle */}
                    <div className="flex gap-1 p-0.5 rounded-lg bg-muted/50 mb-3 w-full">
                      <button
                        onClick={() => setOrderType("market")}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-semibold transition-all ${
                          orderType === "market"
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <TrendingUp className="w-3 h-3" />
                        Market
                      </button>
                      <button
                        onClick={() => setOrderType("limit")}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-semibold transition-all ${
                          orderType === "limit"
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Clock className="w-3 h-3" />
                        Limit
                      </button>
                    </div>

                    <div className={`rounded-xl p-2.5 mb-3 border ${sideBgClass}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {orderType === "market" ? "Current Price" : "Market Price"}
                        </span>
                        <span className={`text-xl font-bold ${sideTextClass}`}>{price}¢</span>
                      </div>
                    </div>

                    {/* Limit Price Input */}
                    {orderType === "limit" && (
                      <div className="mb-3">
                        <label className="text-xs text-muted-foreground mb-1 block">Limit Price (1¢ – 99¢)</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={limitPriceInput}
                            onChange={(e) => handleLimitPriceChange(e.target.value)}
                            placeholder={`e.g. ${Math.max(1, price - 5)}`}
                            className="flex-1 text-center text-lg font-bold bg-muted/50 border border-border rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                          />
                          <span className="text-sm font-semibold text-muted-foreground">¢</span>
                        </div>
                        {limitPriceNum > 0 && limitPriceNum >= price && (
                          <p className="text-[10px] text-amber-500 mt-1">
                            Tip: Set below {price}¢ to buy at a better price
                          </p>
                        )}
                        {limitPriceNum > 0 && limitPriceNum < price && (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Order fills when price drops to {limitPriceNum}¢
                          </p>
                        )}
                      </div>
                    )}

                    <div className="mb-2">
                      <label className="text-xs text-muted-foreground mb-1 block">Amount (USDT)</label>
                      <div className="flex items-center gap-2">
                        <button onClick={() => adjustAmount(-5)} className="w-9 h-9 rounded-xl glass flex items-center justify-center shrink-0 active:scale-95 transition-transform">
                          <Minus className="w-4 h-4" />
                        </button>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={amount}
                          onChange={(e) => handleAmountChange(e.target.value)}
                          placeholder="0.00"
                          className="flex-1 text-center text-xl font-bold bg-muted/50 border border-border rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                        />
                        <button onClick={() => adjustAmount(5)} className="w-9 h-9 rounded-xl glass flex items-center justify-center shrink-0 active:scale-95 transition-transform">
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {!canAfford && numAmount > 0 && user && (
                      <div className="flex items-center gap-1.5 text-xs text-destructive mb-2 flex-wrap">
                        <span>Insufficient balance. You need ${(mainNeeded - balance).toFixed(2)} more.</span>
                        <button
                          type="button"
                          onClick={() => setShowDepositModal(true)}
                          className="underline font-semibold hover:text-destructive/80 transition-colors"
                        >
                          Deposit
                        </button>
                      </div>
                    )}

                    <div className="flex gap-2 mb-4">
                      {PRESET_AMOUNTS.map((preset) => (
                        <button
                          key={preset}
                          onClick={() => setAmount(preset.toString())}
                          className={`flex-1 py-1.5 rounded-xl text-sm font-semibold transition-all active:scale-95 ${
                            numAmount === preset ? "bg-primary text-primary-foreground" : "glass hover:bg-accent/50"
                          }`}
                        >
                          ${preset}
                        </button>
                      ))}
                    </div>

                    {numAmount > 0 && (orderType === "market" || (orderType === "limit" && limitPriceNum > 0)) && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="glass rounded-xl p-2.5 mb-4 space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">
                            {orderType === "limit" ? "Limit Price" : "Entry Price"}
                          </span>
                          <span className="font-semibold">{effectivePrice}¢</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Shares</span>
                          <span className="font-semibold">{shares.toFixed(2)}</span>
                        </div>
                        {orderType === "market" && (
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Prediction Fee (up to {totalFeePercent}%)</span>
                            <span className="font-semibold">${fee.toFixed(2)}</span>
                          </div>
                        )}
                        {orderType === "limit" && (
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Fees</span>
                            <span className="font-semibold text-muted-foreground">Charged on fill</span>
                          </div>
                        )}
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">
                            {orderType === "limit" ? "Escrowed Amount" : "Total Cost"}
                          </span>
                          <span className="font-semibold">${totalCost.toFixed(2)}</span>
                        </div>
                        <div className="border-t border-border pt-2 flex justify-between text-xs">
                          <span className="text-muted-foreground">
                            {isParimutuel ? "Est. Payout (pool-based)" : "Potential Payout"}
                          </span>
                          <span className={`font-bold ${sideTextClass}`}>${potentialPayout.toFixed(2)}</span>
                        </div>
                        {isParimutuel && (
                          <p className="text-[10px] text-muted-foreground/70 italic">Estimated at $1/share. Actual payout depends on final pool size.</p>
                        )}
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Potential ROI</span>
                          <span className={`font-bold ${roi > 0 ? sideTextClass : "text-muted-foreground"}`}>
                            {roi > 0 ? "+" : ""}{roi.toFixed(1)}%
                          </span>
                        </div>
                      </motion.div>
                    )}

                    <button
                      onClick={() => {
                        if (!hasAcceptedTerms()) {
                          setShowTerms(true);
                          return;
                        }
                        track(orderType === "limit" ? "limit_order_started" : "prediction_placed", { marketId, side, amount: numAmount });
                        // For market orders with oSURE enabled, show insurance step
                        if (orderType === "market" && osureEnabled) {
                          setStep("insurance");
                        } else {
                          setStep("confirm");
                        }
                      }}
                      disabled={!isValid || !user || !isEmailVerified}
                      className={`w-full ${sideBtnClass} py-3 rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-40 disabled:active:scale-100 flex items-center justify-center gap-2`}
                    >
                      Review {orderType === "limit" ? "Limit Order" : "Order"} <ArrowRight className="w-4 h-4" />
                    </button>

                    <TermsAcceptanceModal
                      open={showTerms}
                      onAccept={() => {
                        setShowTerms(false);
                        track("terms_accepted", {});
                        track(orderType === "limit" ? "limit_order_started" : "prediction_placed", { marketId, side, amount: numAmount });
                        if (orderType === "market" && osureEnabled) {
                          setStep("insurance");
                        } else {
                          setStep("confirm");
                        }
                      }}
                      onClose={() => setShowTerms(false)}
                    />
                  </motion.div>
                )}

                {/* ── oSURE Protection Selection Step ── */}
                {step === "insurance" && (
                  <motion.div key="insurance" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <Shield className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold">oSURE Protection</h3>
                        <p className="text-[10px] text-muted-foreground">Protect your prediction against losses</p>
                      </div>
                    </div>

                    <div className="space-y-2 mb-4">
                      {([25, 50, 100] as const).map((tier) => {
                        const premPercent = tier === 25 ? (commission?.osure_25_premium ?? 10) : tier === 50 ? (commission?.osure_50_premium ?? 20) : (commission?.osure_100_premium ?? 30);
                        const prem = numAmount * (premPercent / 100);
                        const coverage = poolAmount * (tier / 100);
                        const isSelected = insuranceTier === tier;
                        return (
                          <button
                            key={tier}
                            onClick={() => setInsuranceTier(isSelected ? null : tier)}
                            className={`w-full p-3 rounded-xl border transition-all text-left ${
                              isSelected
                                ? "bg-primary/10 border-primary/40 ring-1 ring-primary/30"
                                : "glass border-border hover:border-primary/20"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-bold">{tier}% Coverage</span>
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isSelected ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                                ${prem.toFixed(2)} premium
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                              <span>Get back ${coverage.toFixed(2)} if you lose</span>
                              <span>{premPercent}% of wager</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {insuranceTier && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="glass rounded-xl p-2.5 mb-3 space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Wager</span>
                          <span className="font-semibold">${numAmount.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Insurance Premium</span>
                          <span className="font-semibold text-primary">${insurancePremium.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs border-t border-border pt-1.5">
                          <span className="text-muted-foreground font-semibold">Total Cost</span>
                          <span className="font-bold">${totalCost.toFixed(2)}</span>
                        </div>
                      </motion.div>
                    )}

                    <div className="space-y-2">
                      <button
                        onClick={() => {
                          setInsuranceTier(null);
                          setStep("confirm");
                        }}
                        className="w-full border border-border py-2.5 rounded-xl text-sm font-semibold text-foreground/70 hover:text-foreground hover:border-foreground/30 transition-all active:scale-95"
                      >
                        Skip Insurance
                      </button>
                      <button
                        onClick={() => setStep("confirm")}
                        disabled={!insuranceTier}
                        className={`w-full ${sideBtnClass} py-3 rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2`}
                      >
                        <Shield className="w-4 h-4" /> Continue with {insuranceTier}% oSURE
                      </button>
                      <button onClick={() => { setInsuranceTier(null); setStep("input"); }} className="w-full text-xs text-muted-foreground py-1.5 transition-all">
                        ← Back to Edit
                      </button>
                    </div>
                  </motion.div>
                )}

                {step === "confirm" && (
                  <motion.div key="confirm" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                    <div className="glass rounded-xl p-4 mb-4 space-y-3">
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <Shield className="w-4 h-4 text-primary" />
                        {orderType === "limit" ? "Limit Order Summary" : "Order Summary"}
                      </h3>
                      <div className="space-y-2">
                        {orderType === "limit" && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Order Type</span>
                            <span className="font-bold flex items-center gap-1 text-amber-500">
                              <Clock className="w-3.5 h-3.5" /> Limit
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Side</span>
                          <span className={`font-bold ${optionColor ? "" : sideTextClass}`} style={optionColor ? { color: optionColor } : undefined}>{optionLabel || side.toUpperCase()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Amount</span>
                          <span className="font-semibold">${numAmount.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            {orderType === "limit" ? "Limit Price" : "Price"}
                          </span>
                          <span className="font-semibold">{effectivePrice}¢</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Shares</span>
                          <span className="font-semibold">{shares.toFixed(2)}</span>
                        </div>
                        {orderType === "market" && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Fee</span>
                            <span className="font-semibold">${fee.toFixed(2)}</span>
                          </div>
                        )}
                        {insuranceTier && (
                          <>
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground flex items-center gap-1"><Shield className="w-3 h-3 text-primary" /> oSURE ({insuranceTier}%)</span>
                              <span className="font-semibold text-primary">${insurancePremium.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Insurance Coverage</span>
                              <span className="font-semibold">${insuranceCoverage.toFixed(2)}</span>
                            </div>
                          </>
                        )}
                        <div className="border-t border-border pt-2 flex justify-between text-sm">
                          <span className="text-muted-foreground font-semibold">Total Cost</span>
                          <span className="font-bold">${totalCost.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{isParimutuel ? "Est. Payout (pool-based)" : "Potential Payout"}</span>
                          <span className={`font-bold text-lg ${optionColor ? "" : sideTextClass}`} style={optionColor ? { color: optionColor } : undefined}>${potentialPayout.toFixed(2)}</span>
                        </div>
                        {isParimutuel && (
                          <p className="text-[10px] text-muted-foreground/70 italic mb-1">Estimated at $1/share. Actual payout depends on final pool size.</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 mb-5">
                      <AlertTriangle className="w-4 h-4 text-destructive/60 shrink-0 mt-0.5" />
                      <p className="text-[10px] text-destructive/70">
                        {orderType === "limit"
                          ? "Your funds will be escrowed until the order is filled or cancelled. You can cancel anytime from your portfolio."
                          : isParimutuel
                            ? "By confirming, you authorize this prediction. Your balance will be deducted. Predictions are final. Payout is proportional to the total pool split among winners."
                            : "By confirming, you authorize this prediction. Your balance will be deducted. Predictions are final. Shares resolve at $1.00 or $0.00."}
                      </p>
                    </div>
                    <div className="space-y-3">
                      <button onClick={() => setStep(osureEnabled && orderType === "market" ? "insurance" : "input")} className="w-full glass py-3 rounded-xl font-semibold text-sm transition-all active:scale-95">
                        ← Back
                      </button>
                      <button onClick={handleConfirm} disabled={placeBet.isPending || placeLimitOrder.isPending} className={`w-full ${sideBtnClass} py-3 rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2`}>
                        {(placeBet.isPending || placeLimitOrder.isPending) ? <><Loader2 className="w-4 h-4 animate-spin" /> Placing...</> : orderType === "limit" ? "Place Limit Order" : "Confirm Prediction"}
                      </button>
                    </div>
                  </motion.div>
                )}

                {step === "executing" && (
                  <motion.div key="executing" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center py-8">
                    <LogoLoader size="lg" />
                    <h3 className="text-lg font-bold mt-4 mb-1">
                      {orderType === "limit" ? "Placing Limit Order" : "Processing Prediction"}
                    </h3>
                    <p className="text-sm text-muted-foreground text-center">
                      {orderType === "limit" ? "Setting up your limit order..." : "Placing your prediction..."}
                    </p>
                  </motion.div>
                )}

                {step === "success" && (
                  <motion.div key="success" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center py-6">
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", damping: 10 }}
                      className="w-16 h-16 rounded-full flex items-center justify-center mb-4 border"
                      style={optionColor
                        ? { backgroundColor: `${optionColor}20`, borderColor: `${optionColor}66` }
                        : { backgroundColor: "hsl(var(--primary) / 0.2)", borderColor: "hsl(var(--primary) / 0.4)" }
                      }>
                      {orderType === "limit" ? (
                        <Clock className="w-8 h-8" style={optionColor ? { color: optionColor } : { color: "hsl(var(--primary))" }} />
                      ) : (
                        <CheckCircle2 className="w-8 h-8" style={optionColor ? { color: optionColor } : { color: "hsl(var(--primary))" }} />
                      )}
                    </motion.div>
                    <h3 className="text-lg font-bold mb-1" style={optionColor ? { color: optionColor } : undefined}>
                      {orderType === "limit" ? "Limit Order Placed!" : "Prediction Placed!"}
                    </h3>
                    <p className="text-sm text-muted-foreground text-center mb-4">
                      {orderType === "limit" ? (
                        <>Buying <span className={`font-bold ${optionColor ? "" : sideTextClass}`} style={optionColor ? { color: optionColor } : undefined}>{shares.toFixed(2)}</span> {optionLabel || side.toUpperCase()} shares at {effectivePrice}¢</>
                      ) : (
                        <>You bought <span className={`font-bold ${optionColor ? "" : sideTextClass}`} style={optionColor ? { color: optionColor } : undefined}>{shares.toFixed(2)}</span> {optionLabel || side.toUpperCase()} shares</>
                      )}
                    </p>
                    <div className="glass rounded-xl p-3 w-full space-y-1.5 mb-5">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">
                          {orderType === "limit" ? "Escrowed" : "Cost"}
                        </span>
                        <span className="font-semibold">${totalCost.toFixed(2)}</span>
                      </div>
                      {orderType === "limit" && (
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Status</span>
                          <span className="font-semibold text-amber-500">Pending</span>
                        </div>
                      )}
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Max Payout</span>
                        <span className={`font-bold ${optionColor ? "" : sideTextClass}`} style={optionColor ? { color: optionColor } : undefined}>${potentialPayout.toFixed(2)}</span>
                      </div>
                    </div>

                    {/* Push notification prompt — shows when push is supported but not subscribed */}
                    {pushSupported && !pushSubscribed && !pushPromptDismissed && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-xl border border-primary/20 bg-primary/5 p-3 mb-4 w-full"
                      >
                        <div className="flex items-start gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <BellRing className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold mb-0.5">Never miss a payout</p>
                            <p className="text-[10px] text-muted-foreground mb-2">
                              Get notified when your predictions resolve — even when the app is closed.
                            </p>
                            <div className="flex gap-2">
                              <button
                                disabled={pushLoading}
                                onClick={async () => {
                                  const ok = await pushSubscribe();
                                  if (ok) {
                                    toast.success("Push notifications enabled!");
                                    track("push_enabled_first_prediction", {});
                                  }
                                }}
                                className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[10px] font-semibold active:scale-95 transition-transform"
                              >
                                {pushLoading ? "..." : "Enable Alerts"}
                              </button>
                              <button
                                onClick={() => setPushPromptDismissed(true)}
                                className="px-3 py-1.5 rounded-lg text-[10px] font-medium text-muted-foreground hover:bg-muted transition-colors"
                              >
                                Not now
                              </button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* Share to X */}
                    <ShareToXButton marketTitle={marketTitle} marketId={marketId} side={side} optionLabel={optionLabel} />

                    <div className="flex gap-3 w-full">
                      <button onClick={handleClose} className="flex-1 glass py-3 rounded-xl font-semibold text-sm transition-all active:scale-95">Close</button>
                      <button
                        onClick={() => { handleClose(); navigate("/portfolio"); }}
                        className="flex-1 bg-primary text-primary-foreground py-3 rounded-xl font-semibold text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
                      >
                        <TrendingUp className="w-4 h-4" /> {orderType === "limit" ? "View Orders" : "View Portfolio"}
                      </button>
                    </div>
                  </motion.div>
                )}

                {step === "error" && (
                  <motion.div key="error" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center py-6">
                    <div className="w-16 h-16 rounded-full bg-destructive/20 border border-destructive/40 flex items-center justify-center mb-4">
                      <AlertTriangle className="w-8 h-8 text-destructive" />
                    </div>
                    <h3 className="text-lg font-bold mb-1">
                      {orderType === "limit" ? "Order Failed" : "Prediction Failed"}
                    </h3>
                    <p className="text-sm text-muted-foreground text-center mb-5">{errorMsg || "Something went wrong. Please try again."}</p>
                    <div className="flex gap-3 w-full">
                      <button onClick={handleClose} className="flex-1 glass py-3 rounded-xl font-semibold text-sm transition-all active:scale-95">Cancel</button>
                      <button onClick={() => setStep("input")} className="flex-1 bg-primary text-primary-foreground py-3 rounded-xl font-semibold text-sm transition-all active:scale-95">Try Again</button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
    </BottomSheet>

      <DepositWithdrawModal
        open={showDepositModal}
        onClose={() => setShowDepositModal(false)}
        initialTab="deposit"
      />
    </>
  );
};

export default BetModal;
