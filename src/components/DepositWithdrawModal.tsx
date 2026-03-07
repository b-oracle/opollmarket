import LogoLoader from "@/components/LogoLoader";
import { useState, useCallback, useEffect } from "react";
import HoldToConfirmButton from "@/components/HoldToConfirmButton";
import BottomSheet from "@/components/BottomSheet";

import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  Clock,
  Copy,
  Check,
} from "lucide-react";

type Tab = "deposit" | "withdraw";
type FlowStep = "input" | "confirm" | "executing" | "awaiting_payment" | "success" | "error";

interface DepositWithdrawModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: Tab;
}

interface PaymentInfo {
  payment_id: string;
  pay_address: string;
  pay_amount: number;
  pay_currency: string;
  expiration_estimate_date?: string;
}

const PRESET_AMOUNTS = [25, 50, 100, 250];
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 50000;

const CRYPTO_OPTIONS = [
  { value: "usdtbsc", label: "USDT (BSC)" },
  { value: "usdttrc20", label: "USDT (TRC20)" },
  { value: "usdterc20", label: "USDT (ERC20)" },
  { value: "btc", label: "Bitcoin" },
  { value: "eth", label: "Ethereum" },
  { value: "bnbbsc", label: "BNB (BSC)" },
  { value: "ltc", label: "Litecoin" },
];

const DepositWithdrawModal = ({ open, onClose, initialTab = "deposit" }: DepositWithdrawModalProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { balance, bonusBalance } = useUserBalance();

  const [tab, setTab] = useState<Tab>(initialTab);
  const [amount, setAmount] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [selectedCrypto, setSelectedCrypto] = useState("usdtbsc");
  const [step, setStep] = useState<FlowStep>("input");
  const [errorMsg, setErrorMsg] = useState("");
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [pollInterval, setPollInterval] = useState<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setAmount("");
      setWalletAddress("");
      setSelectedCrypto("usdtbsc");
      setStep("input");
      setErrorMsg("");
      setPaymentInfo(null);
      setCopied(false);
    }
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
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

  const copyAddress = useCallback(() => {
    if (paymentInfo?.pay_address) {
      navigator.clipboard.writeText(paymentInfo.pay_address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [paymentInfo]);

  // Poll for deposit confirmation
  const startPolling = useCallback((paymentId: string) => {
    const interval = setInterval(async () => {
      if (!user) return;
      const { data } = await supabase
        .from("transactions")
        .select("status")
        .eq("user_id", user.id)
        .eq("nowpayments_payment_id", paymentId)
        .single();

      if (data?.status === "confirmed") {
        clearInterval(interval);
        setPollInterval(null);
        queryClient.invalidateQueries({ queryKey: ["balance"] });
        queryClient.invalidateQueries({ queryKey: ["has_deposit"] });
        setStep("success");
      }
    }, 10000); // every 10 seconds
    setPollInterval(interval);
  }, [user, queryClient]);

  const handleDeposit = useCallback(async () => {
    setStep("executing");
    setErrorMsg("");
    try {
      const { data, error } = await supabase.functions.invoke("create-deposit", {
        body: { amount: numAmount, pay_currency: selectedCrypto },
      });
      if (error || data?.error) {
        throw new Error(data?.error || error?.message || "Failed to create deposit");
      }
      setPaymentInfo({
        payment_id: data.payment_id,
        pay_address: data.pay_address,
        pay_amount: data.pay_amount,
        pay_currency: data.pay_currency,
        expiration_estimate_date: data.expiration_estimate_date,
      });
      setStep("awaiting_payment");
      startPolling(String(data.payment_id));
    } catch (err: any) {
      setErrorMsg(err.message || "Something went wrong");
      setStep("error");
    }
  }, [numAmount, selectedCrypto, startPolling]);

  const handleWithdraw = useCallback(async () => {
    setStep("executing");
    setErrorMsg("");
    try {
      const { data, error } = await supabase.functions.invoke("request-withdrawal", {
        body: {
          amount: numAmount,
          wallet_address: walletAddress.trim(),
          crypto_currency: selectedCrypto,
        },
      });
      // Edge functions return error details in data even on non-2xx
      const errorMsg = data?.error || error?.message;
      if (errorMsg) {
        throw new Error(errorMsg);
      }
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      setStep("success");
    } catch (err: any) {
      setErrorMsg(err.message || "Something went wrong");
      setStep("error");
    }
  }, [numAmount, walletAddress, selectedCrypto, queryClient]);

  const handleClose = () => {
    if (pollInterval) clearInterval(pollInterval);
    setPollInterval(null);
    setAmount("");
    setWalletAddress("");
    setStep("input");
    setErrorMsg("");
    setPaymentInfo(null);
    onClose();
  };

  const switchTab = (newTab: Tab) => {
    if (pollInterval) clearInterval(pollInterval);
    setPollInterval(null);
    setTab(newTab);
    setAmount("");
    setWalletAddress("");
    setStep("input");
    setErrorMsg("");
    setPaymentInfo(null);
  };

  if (!open) return null;

  return (
    <BottomSheet open={open} onClose={handleClose} className="p-5">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto mb-4" />

              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">
                  {isDeposit ? "Deposit" : "Withdraw"} Funds
                </h2>
                <button onClick={handleClose} className="w-8 h-8 rounded-full glass flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {(step === "input" || step === "confirm") && (
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
                {/* INPUT STEP */}
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

                    {/* Amount */}
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs text-muted-foreground">Amount (USD)</label>
                        {!isDeposit && (
                          <button onClick={setMax} className="text-[10px] text-primary font-semibold">MAX</button>
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
                    <div className="flex gap-2 mb-4">
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

                    {/* Crypto selector */}
                    <div className="mb-5">
                      <label className="text-xs text-muted-foreground mb-1.5 block">
                        {isDeposit ? "Pay with" : "Receive as"}
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {CRYPTO_OPTIONS.slice(0, 6).map((c) => (
                          <button
                            key={c.value}
                            onClick={() => setSelectedCrypto(c.value)}
                            className={`py-2 px-2 rounded-xl text-xs font-semibold transition-all ${
                              selectedCrypto === c.value
                                ? "bg-primary text-primary-foreground"
                                : "glass hover:bg-accent/50 text-muted-foreground"
                            }`}
                          >
                            {c.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Wallet address for withdrawals */}
                    {!isDeposit && (
                      <div className="mb-5">
                        <label className="text-xs text-muted-foreground mb-1.5 block">Your Wallet Address</label>
                        <input
                          type="text"
                          value={walletAddress}
                          onChange={(e) => setWalletAddress(e.target.value)}
                          placeholder="0x... or T... or bc1..."
                          className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all font-mono"
                        />
                      </div>
                    )}

                    {/* Info */}
                    {isDeposit && (
                      <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/50 border border-border mb-5">
                        <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        <p className="text-[10px] text-muted-foreground">
                          You'll receive a unique wallet address to send your crypto. Your balance will be credited automatically once the payment is confirmed on-chain.
                        </p>
                      </div>
                    )}

                    {!isDeposit && !hasDeposit && (
                      <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 mb-5">
                        <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                        <p className="text-[10px] text-destructive font-medium">
                          You must make at least one deposit before you can withdraw.
                        </p>
                      </div>
                    )}

                    {!isDeposit && hasDeposit && (
                      <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/50 border border-border mb-5">
                        <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        <p className="text-[10px] text-muted-foreground">
                          Withdrawals are processed instantly and sent directly to your wallet. Bonus balance cannot be withdrawn.
                        </p>
                      </div>
                    )}

                    <button
                      onClick={() => setStep("confirm")}
                      disabled={!user || (isDeposit ? !isValid : !isWithdrawValid || !hasDeposit)}
                      className="w-full bg-primary text-primary-foreground py-4 rounded-xl font-bold text-base transition-all active:scale-95 disabled:opacity-40 disabled:active:scale-100"
                    >
                      {isDeposit ? "Continue" : "Review Withdrawal"}
                    </button>
                  </motion.div>
                )}

                {/* CONFIRM STEP */}
                {step === "confirm" && (
                  <motion.div
                    key="confirm"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                  >
                    <div className="glass rounded-xl p-4 mb-4">
                      <h3 className="text-sm font-semibold mb-3">
                        {isDeposit ? "Confirm Deposit" : "Confirm Withdrawal"}
                      </h3>
                      <div className="space-y-2.5">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Amount</span>
                          <span className="font-bold text-lg">${numAmount.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Currency</span>
                          <span className="font-semibold">
                            {CRYPTO_OPTIONS.find((c) => c.value === selectedCrypto)?.label}
                          </span>
                        </div>
                        {!isDeposit && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">To Wallet</span>
                            <span className="font-mono text-xs truncate max-w-[180px]">{walletAddress}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <HoldToConfirmButton
                        onConfirm={isDeposit ? handleDeposit : handleWithdraw}
                        label={isDeposit ? "Hold to Confirm Deposit" : "Hold to Confirm Withdrawal"}
                      />
                      <p className="text-[10px] text-center text-muted-foreground">Press and hold the button for 1.5s to confirm</p>
                      <button
                        onClick={() => setStep("input")}
                        className="w-full glass py-3 rounded-xl font-semibold text-sm text-muted-foreground transition-all active:scale-95"
                      >
                        Back
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* EXECUTING */}
                {step === "executing" && (
                  <motion.div
                    key="executing"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center py-8"
                  >
                    <LogoLoader size="lg" />
                    <h3 className="text-lg font-bold mt-4 mb-1">Processing...</h3>
                    <p className="text-sm text-muted-foreground text-center">
                      {isDeposit ? "Generating payment address..." : "Submitting withdrawal request..."}
                    </p>
                  </motion.div>
                )}

                {/* AWAITING PAYMENT (deposit only — shows address in-app) */}
                {step === "awaiting_payment" && paymentInfo && (
                  <motion.div
                    key="awaiting"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                  >
                    <div className="glass rounded-xl p-4 mb-4 text-center">
                      <div className="w-12 h-12 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center mx-auto mb-3">
                        <Clock className="w-6 h-6 text-primary" />
                      </div>
                      <h3 className="text-sm font-bold mb-1">Send Crypto to This Address</h3>
                      <p className="text-[10px] text-muted-foreground mb-4">
                        Send exactly the amount shown below. Your balance will be credited automatically.
                      </p>

                      {/* QR Code */}
                      <div className="rounded-xl bg-white p-3 mb-3 inline-block mx-auto">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(paymentInfo.pay_address)}`}
                          alt="Deposit QR Code"
                          className="w-[180px] h-[180px]"
                          loading="eager"
                        />
                      </div>

                      {/* Amount to send */}
                      <div className="rounded-xl bg-muted/50 border border-border p-3 mb-3">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Amount to Send</p>
                        <p className="text-xl font-bold text-primary">
                          {paymentInfo.pay_amount} {paymentInfo.pay_currency.toUpperCase()}
                        </p>
                        <p className="text-[10px] text-muted-foreground">≈ ${numAmount.toFixed(2)} USD</p>
                      </div>

                      {/* Wallet address */}
                      <div className="rounded-xl bg-muted/50 border border-border p-3 mb-3">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Payment Address</p>
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-mono break-all flex-1 text-left select-all">
                            {paymentInfo.pay_address}
                          </p>
                          <button
                            onClick={copyAddress}
                            className="shrink-0 w-8 h-8 rounded-lg glass flex items-center justify-center transition-all active:scale-95"
                          >
                            {copied ? (
                              <Check className="w-4 h-4 text-primary" />
                            ) : (
                              <Copy className="w-4 h-4 text-muted-foreground" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Status */}
                      <div className="flex items-center justify-center gap-2 py-2">
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                        >
                          <Loader2 className="w-4 h-4 text-primary" />
                        </motion.div>
                        <p className="text-xs text-muted-foreground font-medium">
                          Waiting for payment confirmation...
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/50 border border-border mb-4">
                      <AlertTriangle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      <p className="text-[10px] text-muted-foreground">
                        Only send <strong>{paymentInfo.pay_currency.toUpperCase()}</strong> to this address. Sending any other token may result in permanent loss of funds.
                      </p>
                    </div>

                    <button
                      onClick={handleClose}
                      className="w-full glass py-3 rounded-xl font-semibold text-sm text-muted-foreground transition-all active:scale-95"
                    >
                      Close (payment will still be tracked)
                    </button>
                  </motion.div>
                )}

                {/* SUCCESS */}
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
                      <CheckCircle2 className="w-8 h-8 text-primary" />
                    </motion.div>
                    <h3 className="text-lg font-bold mb-1">
                      {isDeposit ? "Deposit Confirmed!" : "Withdrawal Sent!"}
                    </h3>
                    <p className="text-sm text-muted-foreground text-center mb-4">
                      {isDeposit
                        ? `$${numAmount.toFixed(2)} has been credited to your platform balance.`
                        : `$${numAmount.toFixed(2)} has been sent to your wallet. It may take a few minutes to arrive.`}
                    </p>
                    <button
                      onClick={handleClose}
                      className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-semibold text-sm transition-all active:scale-95"
                    >
                      Done
                    </button>
                  </motion.div>
                )}

                {/* ERROR */}
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
    </BottomSheet>
  );
};

export default DepositWithdrawModal;
