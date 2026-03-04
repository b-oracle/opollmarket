import LogoLoader from "@/components/LogoLoader";
import { useState, useCallback } from "react";
import BottomSheet from "@/components/BottomSheet";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useUserBalance, usePlaceBet } from "@/hooks/useUserBalance";
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
} from "lucide-react";


type BetSide = "yes" | "no";
type ModalStep = "input" | "confirm" | "executing" | "success" | "error";

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
}

const PRESET_AMOUNTS = [10, 25, 50, 100];
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 10000;

const BetModal = ({ open, onClose, side, price, marketTitle, marketId, optionId, optionLabel, optionColor }: BetModalProps) => {
  const { user, isEmailVerified } = useAuth();
  const { balance, totalBalance } = useUserBalance();
  const { data: commission } = useCommissionSettings();
  const placeBet = usePlaceBet();
  const navigate = useNavigate();
  const { checkLimit: checkBetLimit } = useRateLimit(5, 60000);
  const { track } = useAnalytics();
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<ModalStep>("input");
  const [errorMsg, setErrorMsg] = useState("");
  const [showTerms, setShowTerms] = useState(false);

  const numAmount = parseFloat(amount) || 0;
  const totalFeePercent = (commission?.admin_fee_percent ?? 2) + (commission?.creator_fee_percent ?? 3);
  const fee = numAmount * (totalFeePercent / 100);
  const poolAmount = numAmount - fee;
  const shares = poolAmount > 0 ? poolAmount / (price / 100) : 0;
  const potentialPayout = shares;
  const totalCost = numAmount;
  const profit = potentialPayout - totalCost;
  const roi = numAmount > 0 ? (profit / totalCost) * 100 : 0;

  const isValid = numAmount >= MIN_AMOUNT && numAmount <= MAX_AMOUNT && totalCost <= totalBalance;

  const handleAmountChange = (val: string) => {
    const cleaned = val.replace(/[^0-9.]/g, "");
    const parts = cleaned.split(".");
    if (parts.length > 2) return;
    if (parts[1] && parts[1].length > 2) return;
    if (parseFloat(cleaned) > MAX_AMOUNT) return;
    setAmount(cleaned);
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
      await placeBet.mutateAsync({
        marketId,
        optionId,
        side,
        amount: numAmount,
        price,
        shares,
      });
      track("bet_confirmed", { marketId, side, amount: numAmount });
      setStep("success");
    } catch (err: any) {
      setErrorMsg(err?.message || "Transaction failed");
      setStep("error");
    }
  }, [marketId, optionId, side, numAmount, price, shares, placeBet]);

  const handleClose = () => {
    setAmount("");
    setStep("input");
    setErrorMsg("");
    onClose();
  };

  const isYes = side === "yes";
  const sideTextClass = isYes ? "neon-yes" : "neon-no";
  const sideBgClass = isYes ? "bg-primary/10 border-primary/30" : "bg-destructive/10 border-destructive/30";
  const sideBtnClass = isYes ? "btn-yes" : "btn-no";

  if (!open) return null;

  return (
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
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-muted/50 border border-border mb-3">
                      <span className="text-xs text-muted-foreground">Your Balance</span>
                        <span className="text-sm font-bold">${totalBalance.toFixed(2)}</span>
                      </div>
                    )}

                    <div className={`rounded-xl p-2.5 mb-3 border ${sideBgClass}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Current Price</span>
                        <span className={`text-xl font-bold ${sideTextClass}`}>{price}¢</span>
                      </div>
                    </div>

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

                    {totalCost > totalBalance && numAmount > 0 && user && (
                      <p className="text-xs text-destructive mb-2">Insufficient balance. You need ${(totalCost - totalBalance).toFixed(2)} more.</p>
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

                    {numAmount > 0 && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="glass rounded-xl p-2.5 mb-4 space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Shares</span>
                          <span className="font-semibold">{shares.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Admin Fee ({commission?.admin_fee_percent ?? 2}%)</span>
                          <span className="font-semibold">${(numAmount * (commission?.admin_fee_percent ?? 2) / 100).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Creator Fee ({commission?.creator_fee_percent ?? 3}%)</span>
                          <span className="font-semibold">${(numAmount * (commission?.creator_fee_percent ?? 3) / 100).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Total Cost</span>
                          <span className="font-semibold">${totalCost.toFixed(2)}</span>
                        </div>
                        <div className="border-t border-border pt-2 flex justify-between text-xs">
                          <span className="text-muted-foreground">Potential Payout</span>
                          <span className={`font-bold ${sideTextClass}`}>${potentialPayout.toFixed(2)}</span>
                        </div>
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
                        track("bet_placed", { marketId, side, amount: numAmount });
                        setStep("confirm");
                      }}
                      disabled={!isValid || !user || !isEmailVerified}
                      className={`w-full ${sideBtnClass} py-3 rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-40 disabled:active:scale-100 flex items-center justify-center gap-2`}
                    >
                      Review Order <ArrowRight className="w-4 h-4" />
                    </button>

                    <TermsAcceptanceModal
                      open={showTerms}
                      onAccept={() => {
                        setShowTerms(false);
                        track("terms_accepted", {});
                        track("bet_placed", { marketId, side, amount: numAmount });
                        setStep("confirm");
                      }}
                      onClose={() => setShowTerms(false)}
                    />
                  </motion.div>
                )}

                {step === "confirm" && (
                  <motion.div key="confirm" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                    <div className="glass rounded-xl p-4 mb-4 space-y-3">
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <Shield className="w-4 h-4 text-primary" /> Order Summary
                      </h3>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Side</span>
                          <span className={`font-bold ${optionColor ? "" : sideTextClass}`} style={optionColor ? { color: optionColor } : undefined}>{optionLabel || side.toUpperCase()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Amount</span>
                          <span className="font-semibold">${numAmount.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Price</span>
                          <span className="font-semibold">{price}¢</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Shares</span>
                          <span className="font-semibold">{shares.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Fee</span>
                          <span className="font-semibold">${fee.toFixed(2)}</span>
                        </div>
                        <div className="border-t border-border pt-2 flex justify-between text-sm">
                          <span className="text-muted-foreground">Potential Payout</span>
                          <span className={`font-bold text-lg ${optionColor ? "" : sideTextClass}`} style={optionColor ? { color: optionColor } : undefined}>${potentialPayout.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/50 border border-border mb-5">
                      <AlertTriangle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      <p className="text-[10px] text-muted-foreground">
                        By confirming, you authorize this prediction. Your balance will be deducted. Predictions are final. Shares resolve at $1.00 or $0.00.
                      </p>
                    </div>
                    <div className="space-y-3">
                      <button onClick={() => setStep("input")} className="w-full glass py-3 rounded-xl font-semibold text-sm transition-all active:scale-95">
                        ← Back to Edit
                      </button>
                      <button onClick={handleConfirm} disabled={placeBet.isPending} className={`w-full ${sideBtnClass} py-3 rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2`}>
                        {placeBet.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Placing...</> : "Confirm Prediction"}
                      </button>
                    </div>
                  </motion.div>
                )}

                {step === "executing" && (
                  <motion.div key="executing" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center py-8">
                    <LogoLoader size="lg" />
                    <h3 className="text-lg font-bold mt-4 mb-1">Processing Prediction</h3>
                    <p className="text-sm text-muted-foreground text-center">Placing your prediction...</p>
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
                      <CheckCircle2 className="w-8 h-8" style={optionColor ? { color: optionColor } : { color: "hsl(var(--primary))" }} />
                    </motion.div>
                    <h3 className="text-lg font-bold mb-1" style={optionColor ? { color: optionColor } : undefined}>Prediction Placed!</h3>
                    <p className="text-sm text-muted-foreground text-center mb-4">
                      You bought <span className={`font-bold ${optionColor ? "" : sideTextClass}`} style={optionColor ? { color: optionColor } : undefined}>{shares.toFixed(2)}</span> {optionLabel || side.toUpperCase()} shares
                    </p>
                    <div className="glass rounded-xl p-3 w-full space-y-1.5 mb-5">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Cost</span>
                        <span className="font-semibold">${totalCost.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Max Payout</span>
                        <span className={`font-bold ${optionColor ? "" : sideTextClass}`} style={optionColor ? { color: optionColor } : undefined}>${potentialPayout.toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="flex gap-3 w-full">
                      <button onClick={handleClose} className="flex-1 glass py-3 rounded-xl font-semibold text-sm transition-all active:scale-95">Close</button>
                      <button
                        onClick={() => { handleClose(); navigate("/portfolio"); }}
                        className="flex-1 bg-primary text-primary-foreground py-3 rounded-xl font-semibold text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
                      >
                        <TrendingUp className="w-4 h-4" /> View Portfolio
                      </button>
                    </div>
                  </motion.div>
                )}

                {step === "error" && (
                  <motion.div key="error" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center py-6">
                    <div className="w-16 h-16 rounded-full bg-destructive/20 border border-destructive/40 flex items-center justify-center mb-4">
                      <AlertTriangle className="w-8 h-8 text-destructive" />
                    </div>
                    <h3 className="text-lg font-bold mb-1">Prediction Failed</h3>
                    <p className="text-sm text-muted-foreground text-center mb-5">{errorMsg || "Something went wrong. Please try again."}</p>
                    <div className="flex gap-3 w-full">
                      <button onClick={handleClose} className="flex-1 glass py-3 rounded-xl font-semibold text-sm transition-all active:scale-95">Cancel</button>
                      <button onClick={() => setStep("input")} className="flex-1 bg-primary text-primary-foreground py-3 rounded-xl font-semibold text-sm transition-all active:scale-95">Try Again</button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
    </BottomSheet>
  );
};

export default BetModal;
