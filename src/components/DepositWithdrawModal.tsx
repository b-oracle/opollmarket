import LogoLoader from "@/components/LogoLoader";
import { useState, useCallback, useEffect, useRef } from "react";
import HoldToConfirmButton from "@/components/HoldToConfirmButton";
import BottomSheet from "@/components/BottomSheet";
import SecurityVerificationModal from "@/components/SecurityVerificationModal";

import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserBalance } from "@/hooks/useUserBalance";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
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
  Banknote,
  Coins,
} from "lucide-react";

type Tab = "deposit" | "withdraw";
type PaymentMethod = "crypto" | "fiat";
type FlowStep = "input" | "confirm" | "executing" | "awaiting_payment" | "awaiting_fiat" | "success" | "partial_success" | "error";

interface DepositWithdrawModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: Tab;
  resumePaymentId?: string | null;
}

interface PaymentInfo {
  payment_id: string;
  pay_address: string;
  pay_amount: number;
  pay_currency: string;
  expiration_estimate_date?: string;
}

interface PartialInfo {
  credited: number;
  requested: number;
  shortfall: number;
}

const PRESET_AMOUNTS = [25, 50, 100, 250];
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 50000;

const CRYPTO_GROUPS = [
  {
    label: "Stablecoins",
    options: [
      { value: "usdtbsc", label: "USDT (BEP20)" },
      { value: "usdttrc20", label: "USDT (TRC20)" },
      { value: "usdterc20", label: "USDT (ERC20)" },
      { value: "usdtmatic", label: "USDT (Polygon)" },
      { value: "usdtsol", label: "USDT (SOL)" },
      { value: "usdcerc20", label: "USDC (ERC20)" },
      { value: "usdcsol", label: "USDC (SOL)" },
      { value: "usdcmatic", label: "USDC (Polygon)" },
      { value: "usdcbsc", label: "USDC (BEP20)" },
      { value: "dai", label: "DAI" },
    ],
  },
  {
    label: "Popular Crypto",
    options: [
      { value: "btc", label: "Bitcoin (BTC)" },
      { value: "eth", label: "Ethereum (ETH)" },
      { value: "bnbbsc", label: "BNB (BSC)" },
      { value: "sol", label: "Solana (SOL)" },
      { value: "ltc", label: "Litecoin (LTC)" },
      { value: "xrp", label: "XRP" },
      { value: "doge", label: "Dogecoin (DOGE)" },
      { value: "maticmainnet", label: "MATIC (Polygon)" },
      { value: "avaxc", label: "AVAX (C-Chain)" },
      { value: "ton", label: "TON" },
    ],
  },
];

const ALL_CRYPTO_OPTIONS = CRYPTO_GROUPS.flatMap((g) => g.options);

const DepositWithdrawModal = ({ open, onClose, initialTab = "deposit", resumePaymentId }: DepositWithdrawModalProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { balance, bonusBalance } = useUserBalance();
  const { isFeatureEnabled } = useFeatureToggles();
  const fiatEnabled = isFeatureEnabled("fiat_deposit_payaza");

  const [tab, setTab] = useState<Tab>(initialTab);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("crypto");
  const [walletAddress, setWalletAddress] = useState("");
  const [selectedCrypto, setSelectedCrypto] = useState("usdtbsc");
  const [step, setStep] = useState<FlowStep>("input");
  const [errorMsg, setErrorMsg] = useState("");
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [pollInterval, setPollInterval] = useState<ReturnType<typeof setInterval> | null>(null);
  const [partialInfo, setPartialInfo] = useState<PartialInfo | null>(null);
  const [depositCreatedAt, setDepositCreatedAt] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>("");
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [securitySettings, setSecuritySettings] = useState<{ require_pin: boolean; require_totp: boolean } | null>(null);

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setAmount("");
      setPaymentMethod("crypto");
      setWalletAddress("");
      setSelectedCrypto("usdtbsc");
      setStep("input");
      setErrorMsg("");
      setPaymentInfo(null);
      setCopied(false);
      setPartialInfo(null);
      setDepositCreatedAt(null);
      setTimeRemaining("");
    }
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [initialTab, open]);

  // Resume a pending deposit by fetching payment details
  useEffect(() => {
    if (!open || !resumePaymentId || !user) return;

    const fetchPaymentDetails = async () => {
      setStep("executing");
      setErrorMsg("");
      try {
        const { data, error } = await supabase.functions.invoke("get-deposit-status", {
          body: { payment_id: resumePaymentId },
        });
        if (error || data?.error) {
          throw new Error(data?.error || error?.message || "Failed to fetch payment details");
        }
        setPaymentInfo({
          payment_id: resumePaymentId,
          pay_address: data.pay_address,
          pay_amount: data.pay_amount,
          pay_currency: data.pay_currency,
          expiration_estimate_date: data.expiration_estimate_date,
        });
        setDepositCreatedAt(new Date(data.created_at).getTime());
        setStep("awaiting_payment");
        startPolling(resumePaymentId);
      } catch (err: any) {
        setErrorMsg(err.message || "Could not load payment details");
        setStep("error");
      }
    };

    fetchPaymentDetails();
  }, [open, resumePaymentId, user]);

  // Countdown timer for deposit expiry (2 hours)
  useEffect(() => {
    if (step !== "awaiting_payment" || !depositCreatedAt) {
      setTimeRemaining("");
      return;
    }
    const EXPIRY_MS = 60 * 60 * 1000; // 1 hour
    const tick = () => {
      const elapsed = Date.now() - depositCreatedAt;
      const remaining = EXPIRY_MS - elapsed;
      if (remaining <= 0) {
        setTimeRemaining("Expired");
        return;
      }
      const h = Math.floor(remaining / (1000 * 60 * 60));
      const m = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((remaining % (1000 * 60)) / 1000);
      setTimeRemaining(`${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [step, depositCreatedAt]);

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

  // Fetch stale pending/partial deposits
  const { data: stalePending = [] } = useQuery({
    queryKey: ["stale_pending_deposits", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("transactions")
        .select("id, amount, status, nowpayments_payment_id, created_at")
        .eq("user_id", user.id)
        .eq("type", "deposit")
        .in("status", ["pending", "partial"])
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!user && open,
  });

  const { data: withdrawSettings } = useQuery({
    queryKey: ["withdrawal_settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("commission_settings")
        .select("withdrawal_cooldown_minutes, withdrawal_multiplier, withdrawal_limit_enabled")
        .limit(1)
        .single();
      return {
        cooldown: (data as any)?.withdrawal_cooldown_minutes ?? 5,
        multiplier: (data as any)?.withdrawal_multiplier ?? 2,
        limitEnabled: (data as any)?.withdrawal_limit_enabled ?? true,
      };
    },
    enabled: tab === "withdraw",
  });

  const { data: eligibleWithdrawal } = useQuery({
    queryKey: ["eligible_withdrawal", user?.id, withdrawSettings?.limitEnabled],
    queryFn: async () => {
      if (!user) return null;

      // If withdrawal limit is disabled, return null (no cap)
      if (withdrawSettings?.limitEnabled === false) return null;

      const { data: deposits } = await supabase
        .from("transactions")
        .select("amount")
        .eq("user_id", user.id)
        .eq("type", "deposit")
        .eq("status", "confirmed");

      const totalDeposits = (deposits || []).reduce((sum, r) => sum + Number(r.amount), 0);

      const { data: withdrawals } = await supabase
        .from("transactions")
        .select("amount")
        .eq("user_id", user.id)
        .eq("type", "withdrawal")
        .eq("status", "confirmed");

      const totalWithdrawn = (withdrawals || []).reduce((sum, r) => sum + Number(r.amount), 0);

      const multiplier = withdrawSettings?.multiplier ?? 2;
      return Math.max(0, (multiplier * totalDeposits) - totalWithdrawn);
    },
    enabled: !!user && tab === "withdraw" && withdrawSettings !== undefined,
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
        .select("status, amount")
        .eq("user_id", user.id)
        .eq("nowpayments_payment_id", paymentId)
        .single();

      if (data?.status === "confirmed") {
        clearInterval(interval);
        setPollInterval(null);
        queryClient.invalidateQueries({ queryKey: ["balance"] });
        queryClient.invalidateQueries({ queryKey: ["has_deposit"] });
        setStep("success");
      } else if (data?.status === "partial") {
        clearInterval(interval);
        setPollInterval(null);
        queryClient.invalidateQueries({ queryKey: ["balance"] });
        queryClient.invalidateQueries({ queryKey: ["has_deposit"] });
        const credited = Number(data.amount);
        setPartialInfo({
          credited,
          requested: numAmount,
          shortfall: Math.max(0, numAmount - credited),
        });
        setStep("partial_success");
      }
    }, 10000);
    setPollInterval(interval);
  }, [user, queryClient, numAmount]);

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
      setDepositCreatedAt(Date.now());
      setStep("awaiting_payment");
      startPolling(String(data.payment_id));
    } catch (err: any) {
      setErrorMsg(err.message || "Something went wrong");
      setStep("error");
    }
  }, [numAmount, selectedCrypto, startPolling]);

  const handleFiatDeposit = useCallback(async () => {
    setStep("executing");
    setErrorMsg("");
    try {
      const { data, error } = await supabase.functions.invoke("create-payaza-deposit", {
        body: { amount: numAmount },
      });
      if (error || data?.error) {
        throw new Error(data?.error || error?.message || "Failed to create fiat deposit");
      }

      // Open Payaza inline checkout popup
      const payazaUrl = `https://checkout.payaza.africa/pay/${data.transaction_reference}?merchant_key=${encodeURIComponent(data.merchant_key)}&amount=${numAmount}&currency=NGN&email=${encodeURIComponent(data.email)}&callback_url=${encodeURIComponent(window.location.href)}`;

      // Use Payaza's redirect-based checkout
      // We'll open in a new window and poll for confirmation
      const payazaWindow = window.open(payazaUrl, "_blank", "width=500,height=700,scrollbars=yes");

      setStep("awaiting_fiat");
      // Start polling the transaction status
      startPolling(data.transaction_reference);
    } catch (err: any) {
      setErrorMsg(err.message || "Something went wrong");
      setStep("error");
    }
  }, [numAmount, startPolling]);

  const executeWithdraw = useCallback(async () => {
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

      if (error) {
        let specificMsg = "";
        try {
          const ctx = (error as any).context;
          if (ctx && typeof ctx.json === "function") {
            const body = await ctx.json();
            specificMsg = body?.error || "";
          }
        } catch {}
        if (!specificMsg && data?.error) {
          specificMsg = data.error;
        }
        throw new Error(specificMsg || error.message || "Withdrawal request failed");
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      queryClient.invalidateQueries({ queryKey: ["balance"] });
      queryClient.invalidateQueries({ queryKey: ["eligible_withdrawal"] });
      setStep("success");
    } catch (err: any) {
      setErrorMsg(err.message || "Something went wrong");
      setStep("error");
    }
  }, [numAmount, walletAddress, selectedCrypto, queryClient]);

  const handleWithdraw = useCallback(async () => {
    // Check if user has security requirements
    if (!user) return;
    try {
      const { data: secData } = await supabase
        .from("user_security_settings" as any)
        .select("pin_enabled, totp_enabled, require_pin_withdrawal, require_totp_withdrawal")
        .eq("user_id", user.id)
        .maybeSingle();

      const sec = secData as unknown as { pin_enabled: boolean; totp_enabled: boolean; require_pin_withdrawal: boolean; require_totp_withdrawal: boolean } | null;
      const needPin = sec?.pin_enabled && sec?.require_pin_withdrawal;
      const needTotp = sec?.totp_enabled && sec?.require_totp_withdrawal;

      if (needPin || needTotp) {
        setSecuritySettings({ require_pin: !!needPin, require_totp: !!needTotp });
        setShowSecurityModal(true);
        return;
      }
    } catch {
      // If can't fetch settings, proceed without verification
    }
    executeWithdraw();
  }, [user, executeWithdraw]);

  const handleClose = () => {
    if (pollInterval) clearInterval(pollInterval);
    setPollInterval(null);
    setAmount("");
    setWalletAddress("");
    setStep("input");
    setErrorMsg("");
    setPaymentInfo(null);
    setPartialInfo(null);
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
    setPartialInfo(null);
  };

  if (!open) return null;

  return (
    <>
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

                    {/* Stale pending deposits banner */}
                    {isDeposit && stalePending.length > 0 && (
                      <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-3 mb-5">
                        <div className="flex items-center gap-2 mb-2">
                          <Clock className="w-4 h-4 text-yellow-500 shrink-0" />
                          <p className="text-xs font-semibold">
                            {stalePending.length} pending deposit{stalePending.length > 1 ? "s" : ""}
                          </p>
                        </div>
                        <div className="space-y-2">
                          {stalePending.map((tx) => {
                            const age = Math.round((Date.now() - new Date(tx.created_at).getTime()) / 60000);
                            const ageLabel = age < 60 ? `${age}m ago` : age < 1440 ? `${Math.round(age / 60)}h ago` : `${Math.round(age / 1440)}d ago`;
                            return (
                              <div key={tx.id} className="flex items-center justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <span className="text-xs font-bold">${Number(tx.amount).toFixed(2)}</span>
                                  <span className="text-[10px] text-muted-foreground ml-1.5">
                                    {tx.status === "partial" ? "Partial" : "Pending"} · {ageLabel}
                                  </span>
                                </div>
                                <button
                                  onClick={() => {
                                    setAmount(Number(tx.amount).toFixed(2));
                                    if (tx.nowpayments_payment_id) {
                                      startPolling(tx.nowpayments_payment_id);
                                    }
                                    setStep("confirm");
                                  }}
                                  className="text-[10px] font-semibold text-primary px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors shrink-0"
                                >
                                  {tx.status === "partial" ? "Top Up" : "Resume"}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

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

                    {/* Payment method toggle (deposit only) */}
                    {isDeposit && fiatEnabled && (
                      <div className="flex gap-1 p-1 rounded-xl bg-muted/50 mb-4">
                        <button
                          onClick={() => setPaymentMethod("crypto")}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                            paymentMethod === "crypto"
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Coins className="w-3.5 h-3.5" />
                          Crypto
                        </button>
                        <button
                          onClick={() => setPaymentMethod("fiat")}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                            paymentMethod === "fiat"
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Banknote className="w-3.5 h-3.5" />
                          Fiat (NGN)
                        </button>
                      </div>
                    )}

                    {/* Crypto selector (only for crypto deposits or withdrawals) */}
                    {(paymentMethod === "crypto" || !isDeposit) && (
                    <div className="mb-5">
                      <label className="text-xs text-muted-foreground mb-1.5 block">
                        {isDeposit ? "Pay with" : "Receive as"}
                      </label>
                      <select
                        value={selectedCrypto}
                        onChange={(e) => setSelectedCrypto(e.target.value)}
                        className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all appearance-none"
                        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2360a5fa' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}
                      >
                        {CRYPTO_GROUPS.map((group) => (
                          <optgroup key={group.label} label={group.label}>
                            {group.options.map((c) => (
                              <option key={c.value} value={c.value}>
                                {c.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                    )}

                    {/* Fiat info */}
                    {isDeposit && paymentMethod === "fiat" && (
                      <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/50 border border-border mb-5">
                        <Banknote className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        <p className="text-[10px] text-muted-foreground">
                          Pay with bank transfer or card via Payaza. Amount will be charged in Nigerian Naira (NGN) and credited as USD to your balance.
                        </p>
                      </div>
                    )}

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
                    {isDeposit && paymentMethod === "crypto" && (
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
                        <div className="text-[10px] text-muted-foreground">
                          <p>Withdrawals are processed instantly and sent directly to your wallet. Bonus balance cannot be withdrawn.</p>
                          {eligibleWithdrawal !== undefined && eligibleWithdrawal !== null && (
                            <p className="mt-1 font-semibold text-foreground">
                              Eligible withdrawal remaining: ${eligibleWithdrawal.toFixed(2)}
                            </p>
                          )}
                          {withdrawSettings && withdrawSettings.cooldown > 0 && (
                            <p className="mt-1 flex items-center gap-1">
                              <Clock className="w-3 h-3 inline" />
                              Cooldown between withdrawals: {withdrawSettings.cooldown} minute{withdrawSettings.cooldown !== 1 ? "s" : ""}
                            </p>
                          )}
                        </div>
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
                          <span className="text-muted-foreground">Payment Method</span>
                          <span className="font-semibold">
                            {isDeposit && paymentMethod === "fiat" ? "Fiat (NGN)" : ALL_CRYPTO_OPTIONS.find((c) => c.value === selectedCrypto)?.label}
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
                        onConfirm={isDeposit ? (paymentMethod === "fiat" ? handleFiatDeposit : handleDeposit) : handleWithdraw}
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
                    {/* Progress Stepper */}
                    <div className="flex items-center justify-between mb-5 px-2">
                      {[
                        { label: "Created", done: true },
                        { label: "Awaiting Payment", done: false, active: true },
                        { label: "Confirming", done: false },
                        { label: "Credited", done: false },
                      ].map((s, i, arr) => (
                        <div key={s.label} className="flex items-center flex-1 last:flex-none">
                          <div className="flex flex-col items-center">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                              s.done
                                ? "bg-primary text-primary-foreground"
                                : s.active
                                  ? "bg-primary/20 border-2 border-primary text-primary"
                                  : "bg-muted border border-border text-muted-foreground"
                            }`}>
                              {s.done ? <Check className="w-3.5 h-3.5" /> : i + 1}
                            </div>
                            <span className={`text-[9px] mt-1 font-medium ${
                              s.done || s.active ? "text-primary" : "text-muted-foreground"
                            }`}>{s.label}</span>
                          </div>
                          {i < arr.length - 1 && (
                            <div className={`flex-1 h-0.5 mx-1 mt-[-14px] rounded-full ${
                              s.done ? "bg-primary" : "bg-border"
                            }`} />
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="glass rounded-xl p-4 mb-4 text-center">
                      <div className="w-14 h-14 rounded-full bg-primary/20 border-2 border-primary/30 flex items-center justify-center mx-auto mb-3 relative">
                        <Clock className="w-7 h-7 text-primary" />
                        {/* Pulsing ring */}
                        <motion.div
                          className="absolute inset-0 rounded-full border-2 border-primary/40"
                          animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0, 0.6] }}
                          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                        />
                      </div>
                      <h3 className="text-base font-bold mb-1">Send Crypto to Complete Deposit</h3>
                      <p className="text-[11px] text-muted-foreground mb-1">
                        Send the exact amount below to the address provided
                      </p>

                      {/* Countdown timer */}
                      {timeRemaining && (
                        <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold mb-4 ${
                          timeRemaining === "Expired"
                            ? "bg-destructive/10 text-destructive border border-destructive/20"
                            : timeRemaining.startsWith("0h")
                              ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20"
                              : "bg-primary/10 text-primary border border-primary/20"
                        }`}>
                          <Clock className="w-3.5 h-3.5" />
                          {timeRemaining === "Expired" ? "Payment window expired" : `${timeRemaining} remaining`}
                        </div>
                      )}
                      {!timeRemaining && (
                        <p className="text-[10px] text-primary/70 font-medium mb-4">
                          ⏱ Payment typically confirms in 5–15 minutes
                        </p>
                      )}

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

                      {/* Live status indicator */}
                      <div className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary/5 border border-primary/20">
                        <motion.div
                          className="w-2 h-2 rounded-full bg-primary"
                          animate={{ opacity: [1, 0.3, 1] }}
                          transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                        />
                        <p className="text-xs text-primary font-semibold">
                          Listening for your payment...
                        </p>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                        >
                          <Loader2 className="w-3.5 h-3.5 text-primary" />
                        </motion.div>
                      </div>
                    </div>

                    {/* Tips section */}
                    <div className="space-y-2 mb-4">
                      <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/50 border border-border">
                        <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-muted-foreground">
                          Only send <strong className="text-foreground">{paymentInfo.pay_currency.toUpperCase()}</strong> to this address. Sending any other token may result in permanent loss of funds.
                        </p>
                      </div>
                      <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/50 border border-border">
                        <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        <p className="text-[10px] text-muted-foreground">
                          You can close this modal — your payment will still be tracked and credited automatically once confirmed on-chain.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={handleClose}
                      className="w-full glass py-3 rounded-xl font-semibold text-sm text-muted-foreground transition-all active:scale-95"
                    >
                      Close (payment will still be tracked)
                    </button>
                  </motion.div>
                )}

                {/* AWAITING FIAT */}
                {step === "awaiting_fiat" && (
                  <motion.div
                    key="awaiting_fiat"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center py-8"
                  >
                    <div className="w-14 h-14 rounded-full bg-primary/20 border-2 border-primary/30 flex items-center justify-center mx-auto mb-4 relative">
                      <Banknote className="w-7 h-7 text-primary" />
                      <motion.div
                        className="absolute inset-0 rounded-full border-2 border-primary/40"
                        animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0, 0.6] }}
                        transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                      />
                    </div>
                    <h3 className="text-lg font-bold mb-1">Complete Payment</h3>
                    <p className="text-sm text-muted-foreground text-center mb-2">
                      A Payaza payment window has opened. Complete your payment there.
                    </p>
                    <div className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-primary/5 border border-primary/20 mb-4">
                      <motion.div
                        className="w-2 h-2 rounded-full bg-primary"
                        animate={{ opacity: [1, 0.3, 1] }}
                        transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                      />
                      <p className="text-xs text-primary font-semibold">
                        Waiting for payment confirmation...
                      </p>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                      >
                        <Loader2 className="w-3.5 h-3.5 text-primary" />
                      </motion.div>
                    </div>
                    <p className="text-[10px] text-muted-foreground text-center mb-4">
                      Your balance will be credited automatically once payment is confirmed.
                    </p>
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

                {/* PARTIAL SUCCESS */}
                {step === "partial_success" && partialInfo && (
                  <motion.div
                    key="partial"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center py-6"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", damping: 10 }}
                      className="w-16 h-16 rounded-full bg-yellow-500/20 border border-yellow-500/40 flex items-center justify-center mb-4"
                    >
                      <AlertTriangle className="w-8 h-8 text-yellow-500" />
                    </motion.div>
                    <h3 className="text-lg font-bold mb-1">Partial Deposit Received</h3>
                    <p className="text-sm text-muted-foreground text-center mb-4">
                      We received <span className="font-bold text-foreground">${partialInfo.credited.toFixed(2)}</span> of your <span className="font-bold text-foreground">${partialInfo.requested.toFixed(2)}</span> deposit. The received amount has been credited to your balance.
                    </p>

                    <div className="w-full rounded-xl bg-muted/50 border border-border p-3 mb-4">
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="text-muted-foreground">Requested</span>
                        <span className="font-semibold">${partialInfo.requested.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="text-muted-foreground">Received</span>
                        <span className="font-semibold text-primary">${partialInfo.credited.toFixed(2)}</span>
                      </div>
                      <div className="border-t border-border my-1.5" />
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Shortfall</span>
                        <span className="font-bold text-yellow-500">${partialInfo.shortfall.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="flex gap-3 w-full">
                      <button
                        onClick={handleClose}
                        className="flex-1 glass py-3 rounded-xl font-semibold text-sm transition-all active:scale-95"
                      >
                        Done
                      </button>
                      <button
                        onClick={() => {
                          setAmount(partialInfo.shortfall.toFixed(2));
                          setPartialInfo(null);
                          setPaymentInfo(null);
                          setStep("input");
                        }}
                        className="flex-1 bg-primary text-primary-foreground py-3 rounded-xl font-semibold text-sm transition-all active:scale-95"
                      >
                        Top Up ${partialInfo.shortfall.toFixed(2)}
                      </button>
                    </div>
                  </motion.div>
                )}


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
    <SecurityVerificationModal
      open={showSecurityModal}
      onClose={() => setShowSecurityModal(false)}
      onVerified={() => { setShowSecurityModal(false); executeWithdraw(); }}
      requirePin={securitySettings?.require_pin ?? false}
      requireTotp={securitySettings?.require_totp ?? false}
    />
    </>
  );
};

export default DepositWithdrawModal;
