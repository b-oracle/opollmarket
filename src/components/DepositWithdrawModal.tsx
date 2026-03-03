import { useState, useCallback, useEffect } from "react";
import SlideToConfirm from "@/components/SlideToConfirm";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserBalance } from "@/hooks/useUserBalance";
import {
  X,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Info,
  Minus,
  Plus,
  ExternalLink,
  Clock,
} from "lucide-react";

type Tab = "deposit" | "withdraw";
type FlowStep = "input" | "confirm" | "executing" | "success" | "error";

interface DepositWithdrawModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: Tab;
}

const PRESET_AMOUNTS = [25, 50, 100, 250];
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 50000;

const DepositWithdrawModal = ({ open, onClose, initialTab = "deposit" }: DepositWithdrawModalProps) => {
  const { user } = useAuth();
  const { balance, bonusBalance, totalBalance } = useUserBalance();

  const [tab, setTab] = useState<Tab>(initialTab);
  const [amount, setAmount] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [step, setStep] = useState<FlowStep>("input");
  const [errorMsg, setErrorMsg] = useState("");
  const [invoiceUrl, setInvoiceUrl] = useState("");

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setAmount("");
      setWalletAddress("");
      setStep("input");
      setErrorMsg("");
      setInvoiceUrl("");
    }
  }, [initialTab, open]);

  const { data: hasDeposit = false } = useQuery({
    queryKey: ["has_deposit", user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { count } = await supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("type", "deposit");
      return (count ?? 0) > 0;
    },
    enabled: !!user,
  });

  const numAmount = parseFloat(amount) || 0;
  const isDeposit = tab === "deposit";
  const maxAvailable = isDeposit ? MAX_AMOUNT : balance;
  const isValid = numAmount >= MIN_AMOUNT && numAmount <= Math.min(MAX_AMOUNT, maxAvailable);
  const isWithdrawValid = isValid && walletAddress.trim().length >= 10;

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

  const setMax = () => {
    setAmount(Math.min(maxAvailable, MAX_AMOUNT).toString());
  };

  const handleDeposit = useCallback(async () => {
    setStep("executing");
    setErrorMsg("");
    try {
      const { data, error } = await supabase.functions.invoke("create-deposit", {
        body: { amount: numAmount },
      });
      if (error || data?.error) {
        throw new Error(data?.error || error?.message || "Failed to create deposit");
      }
      setInvoiceUrl(data.invoice_url);
      setStep("success");
      // Open invoice in new tab
      window.open(data.invoice_url, "_blank");
    } catch (err: any) {
      setErrorMsg(err.message || "Something went wrong");
      setStep("error");
    }
  }, [numAmount]);

  const handleWithdraw = useCallback(async () => {
    setStep("executing");
    setErrorMsg("");
    try {
      const { data, error } = await supabase.functions.invoke("request-withdrawal", {
        body: {
          amount: numAmount,
          wallet_address: walletAddress.trim(),
          crypto_currency: "usdtbsc",
        },
      });
      if (error || data?.error) {
        throw new Error(data?.error || error?.message || "Failed to request withdrawal");
      }
      setStep("success");
    } catch (err: any) {
      setErrorMsg(err.message || "Something went wrong");
      setStep("error");
    }
  }, [numAmount, walletAddress]);

  const handleClose = () => {
    setAmount("");
    setWalletAddress("");
    setStep("input");
    setErrorMsg("");
    setInvoiceUrl("");
    onClose();
  };

  const switchTab = (newTab: Tab) => {
    setTab(newTab);
    setAmount("");
    setWalletAddress("");
    setStep("input");
    setErrorMsg("");
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50"
          />

          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 max-w-lg mx-auto"
          >
            <div className="glass-strong rounded-t-3xl p-5 pb-24 max-h-[85dvh] overflow-y-auto">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto mb-4" />

              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">
                  {isDeposit ? "Deposit" : "Withdraw"} USDT
                </h2>
                <button onClick={handleClose} className="w-8 h-8 rounded-full glass flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {step === "input" && (
                <div className="flex gap-1 p-1 rounded-xl bg-muted/50 mb-5">
                  <button
                    onClick={() => switchTab("deposit")}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                      isDeposit
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <ArrowDownToLine className="w-4 h-4" />
                    Deposit
                  </button>
                  <button
                    onClick={() => switchTab("withdraw")}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                      !isDeposit
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <ArrowUpFromLine className="w-4 h-4" />
                    Withdraw
                  </button>
                </div>
              )}

              <AnimatePresence mode="wait">
                {step === "input" && (
                  <motion.div
                    key="input"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                  >
                    {!user && (
                      <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 mb-4">
                        <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                        <p className="text-xs text-destructive">Sign in to continue.</p>
                      </div>
                    )}

                    {/* Balance */}
                    <div className="rounded-xl p-3 border bg-primary/5 border-primary/20 mb-5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Platform Balance</p>
                      <p className="text-lg font-bold">${balance.toFixed(2)}</p>
                      {bonusBalance > 0 && (
                        <p className="text-[10px] text-muted-foreground">+ ${bonusBalance.toFixed(2)} bonus (non-withdrawable)</p>
                      )}
                    </div>

                    {/* Amount input */}
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs text-muted-foreground">Amount</label>
                        {!isDeposit && (
                          <button onClick={setMax} className="text-[10px] text-primary font-semibold">
                            MAX
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => adjustAmount(-10)}
                          className="w-10 h-10 rounded-xl glass flex items-center justify-center shrink-0 active:scale-95 transition-transform"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <div className="flex-1 relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-lg">$</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={amount}
                            onChange={(e) => handleAmountChange(e.target.value)}
                            placeholder="0.00"
                            className="w-full text-center text-2xl font-bold bg-muted/50 border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                          />
                        </div>
                        <button
                          onClick={() => adjustAmount(10)}
                          className="w-10 h-10 rounded-xl glass flex items-center justify-center shrink-0 active:scale-95 transition-transform"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      {!isDeposit && numAmount > balance && (
                        <p className="text-[10px] text-destructive mt-1">Insufficient balance (bonus cannot be withdrawn)</p>
                      )}
                    </div>

                    {/* Presets */}
                    <div className="flex gap-2 mb-5">
                      {PRESET_AMOUNTS.map((preset) => (
                        <button
                          key={preset}
                          onClick={() => setAmount(preset.toString())}
                          className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95 ${
                            numAmount === preset
                              ? "bg-primary text-primary-foreground"
                              : "glass hover:bg-accent/50"
                          }`}
                        >
                          ${preset}
                        </button>
                      ))}
                    </div>

                    {/* Wallet address for withdrawals */}
                    {!isDeposit && (
                      <div className="mb-5">
                        <label className="text-xs text-muted-foreground mb-1.5 block">Wallet Address (BSC / BEP-20)</label>
                        <input
                          type="text"
                          value={walletAddress}
                          onChange={(e) => setWalletAddress(e.target.value)}
                          placeholder="0x..."
                          className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all font-mono"
                        />
                      </div>
                    )}

                    {/* Info */}
                    {isDeposit && (
                      <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/50 border border-border mb-5">
                        <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        <p className="text-[10px] text-muted-foreground">
                          You'll be redirected to a secure payment page where you can pay with any supported cryptocurrency. Your balance will be credited automatically once payment is confirmed.
                        </p>
                      </div>
                    )}

                    {!isDeposit && !hasDeposit && (
                      <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 mb-5">
                        <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                        <p className="text-[10px] text-destructive font-medium">
                          You must make at least one deposit before you can withdraw funds.
                        </p>
                      </div>
                    )}

                    {!isDeposit && hasDeposit && (
                      <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/50 border border-border mb-5">
                        <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        <p className="text-[10px] text-muted-foreground">
                          Withdrawals are reviewed by our team and typically processed within 24 hours. Bonus balance cannot be withdrawn.
                        </p>
                      </div>
                    )}

                    <button
                      onClick={() => setStep("confirm")}
                      disabled={!user || (isDeposit ? !isValid : !isWithdrawValid || !hasDeposit)}
                      className="w-full bg-primary text-primary-foreground py-4 rounded-xl font-bold text-base transition-all active:scale-95 disabled:opacity-40 disabled:active:scale-100 flex items-center justify-center gap-2"
                    >
                      {isDeposit ? "Continue to Payment" : "Review Withdrawal"}
                    </button>
                  </motion.div>
                )}

                {/* Confirm */}
                {step === "confirm" && (
                  <motion.div
                    key="confirm"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                  >
                    <div className="glass rounded-xl p-4 mb-4">
                      <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                        {isDeposit ? "Confirm Deposit" : "Confirm Withdrawal"}
                      </h3>
                      <div className="space-y-2.5">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Action</span>
                          <span className="font-semibold">{isDeposit ? "Deposit" : "Withdraw"}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Amount</span>
                          <span className="font-bold text-lg">${numAmount.toFixed(2)}</span>
                        </div>
                        {!isDeposit && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">To Wallet</span>
                            <span className="font-mono text-xs truncate max-w-[180px]">{walletAddress}</span>
                          </div>
                        )}
                        {isDeposit && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Method</span>
                            <span className="font-semibold">Crypto Payment</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <SlideToConfirm
                        onConfirm={isDeposit ? handleDeposit : handleWithdraw}
                        label={isDeposit ? "Slide to Deposit" : "Slide to Withdraw"}
                        color="yes"
                      />
                      <button
                        onClick={() => setStep("input")}
                        className="w-full glass py-3 rounded-xl font-semibold text-sm text-muted-foreground transition-all active:scale-95"
                      >
                        Back
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* Executing */}
                {step === "executing" && (
                  <motion.div
                    key="executing"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center py-8"
                  >
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                    >
                      <Loader2 className="w-12 h-12 text-primary" />
                    </motion.div>
                    <h3 className="text-lg font-bold mt-4 mb-1">Processing...</h3>
                    <p className="text-sm text-muted-foreground text-center">
                      {isDeposit ? "Creating payment invoice..." : "Submitting withdrawal request..."}
                    </p>
                  </motion.div>
                )}

                {/* Success */}
                {step === "success" && (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center py-6"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", damping: 10 }}
                      className="w-16 h-16 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center mb-4"
                    >
                      {isDeposit ? (
                        <ExternalLink className="w-8 h-8 text-primary" />
                      ) : (
                        <Clock className="w-8 h-8 text-primary" />
                      )}
                    </motion.div>
                    <h3 className="text-lg font-bold mb-1">
                      {isDeposit ? "Payment Page Opened!" : "Withdrawal Submitted!"}
                    </h3>
                    <p className="text-sm text-muted-foreground text-center mb-4">
                      {isDeposit
                        ? "Complete your payment in the new tab. Your balance will be credited automatically once confirmed."
                        : `Your withdrawal of $${numAmount.toFixed(2)} is pending review and will be processed within 24 hours.`}
                    </p>

                    {isDeposit && invoiceUrl && (
                      <a
                        href={invoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full glass py-3 rounded-xl font-semibold text-sm text-primary text-center flex items-center justify-center gap-2 mb-3 transition-all active:scale-95"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Open Payment Page Again
                      </a>
                    )}

                    <button
                      onClick={handleClose}
                      className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-semibold text-sm transition-all active:scale-95"
                    >
                      Done
                    </button>
                  </motion.div>
                )}

                {/* Error */}
                {step === "error" && (
                  <motion.div
                    key="error"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center py-6"
                  >
                    <div className="w-16 h-16 rounded-full bg-destructive/20 border border-destructive/40 flex items-center justify-center mb-4">
                      <AlertTriangle className="w-8 h-8 text-destructive" />
                    </div>
                    <h3 className="text-lg font-bold mb-1">Request Failed</h3>
                    <p className="text-sm text-muted-foreground text-center mb-5">
                      {errorMsg || "Something went wrong. Please try again."}
                    </p>
                    <div className="flex gap-3 w-full">
                      <button
                        onClick={handleClose}
                        className="flex-1 glass py-3 rounded-xl font-semibold text-sm transition-all active:scale-95"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => setStep("input")}
                        className="flex-1 bg-primary text-primary-foreground py-3 rounded-xl font-semibold text-sm transition-all active:scale-95"
                      >
                        Try Again
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default DepositWithdrawModal;
