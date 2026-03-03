import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount, useBalance } from "wagmi";
import { formatUnits } from "viem";
import {
  X,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Shield,
  Wallet,
  Info,
  Minus,
  Plus,
} from "lucide-react";

type Tab = "deposit" | "withdraw";
type FlowStep = "input" | "approve" | "confirm" | "executing" | "success" | "error";

interface DepositWithdrawModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: Tab;
}

const PRESET_AMOUNTS = [25, 50, 100, 250];
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 50000;

// Mock platform balance
const MOCK_PLATFORM_BALANCE = 340.5;
const MOCK_USDT_WALLET_BALANCE = 1280.42;

const DepositWithdrawModal = ({ open, onClose, initialTab = "deposit" }: DepositWithdrawModalProps) => {
  const { isConnected, address } = useAccount();
  const { data: nativeBalance } = useBalance({ address });

  const [tab, setTab] = useState<Tab>(initialTab);
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<FlowStep>("input");
  const [approved, setApproved] = useState(false);

  const numAmount = parseFloat(amount) || 0;
  const isDeposit = tab === "deposit";
  const maxAvailable = isDeposit ? MOCK_USDT_WALLET_BALANCE : MOCK_PLATFORM_BALANCE;
  const isValid = numAmount >= MIN_AMOUNT && numAmount <= Math.min(MAX_AMOUNT, maxAvailable);

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

  const handleApprove = useCallback(() => {
    setStep("executing");
    setTimeout(() => {
      setApproved(true);
      setStep("confirm");
    }, 2000);
  }, []);

  const handleExecute = useCallback(() => {
    setStep("executing");
    setTimeout(() => {
      if (Math.random() > 0.1) {
        setStep("success");
      } else {
        setStep("error");
      }
    }, 2500);
  }, []);

  const handleClose = () => {
    setAmount("");
    setStep("input");
    setApproved(false);
    onClose();
  };

  const switchTab = (newTab: Tab) => {
    setTab(newTab);
    setAmount("");
    setStep("input");
    setApproved(false);
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
            <div className="glass-strong rounded-t-3xl p-5 pb-8 max-h-[85dvh] overflow-y-auto">
              {/* Handle */}
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto mb-4" />

              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">
                  {isDeposit ? "Deposit" : "Withdraw"} USDT
                </h2>
                <button onClick={handleClose} className="w-8 h-8 rounded-full glass flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Tabs */}
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
                {/* STEP: Input */}
                {step === "input" && (
                  <motion.div
                    key="input"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                  >
                    {!isConnected && (
                      <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 mb-4">
                        <Wallet className="w-4 h-4 text-destructive shrink-0" />
                        <p className="text-xs text-destructive">Connect your wallet first.</p>
                      </div>
                    )}

                    {/* Balances */}
                    <div className="grid grid-cols-2 gap-3 mb-5">
                      <div className={`rounded-xl p-3 border ${isDeposit ? "bg-primary/5 border-primary/20" : "bg-muted/50 border-border"}`}>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Wallet USDT</p>
                        <p className="text-lg font-bold">${MOCK_USDT_WALLET_BALANCE.toFixed(2)}</p>
                        <p className="text-[10px] text-muted-foreground">BEP-20</p>
                      </div>
                      <div className={`rounded-xl p-3 border ${!isDeposit ? "bg-primary/5 border-primary/20" : "bg-muted/50 border-border"}`}>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Platform</p>
                        <p className="text-lg font-bold">${MOCK_PLATFORM_BALANCE.toFixed(2)}</p>
                        <p className="text-[10px] text-muted-foreground">Available</p>
                      </div>
                    </div>

                    {/* Amount input */}
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs text-muted-foreground">Amount</label>
                        <button onClick={setMax} className="text-[10px] text-primary font-semibold">
                          MAX
                        </button>
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
                      {numAmount > maxAvailable && (
                        <p className="text-[10px] text-destructive mt-1">Insufficient balance</p>
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

                    {/* Info for deposit */}
                    {isDeposit && (
                      <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/50 border border-border mb-5">
                        <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        <p className="text-[10px] text-muted-foreground">
                          Depositing requires two transactions: first <strong>approve</strong> USDT spending, then <strong>deposit</strong> to the platform contract. Gas fees apply on BSC.
                        </p>
                      </div>
                    )}

                    {!isDeposit && (
                      <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/50 border border-border mb-5">
                        <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        <p className="text-[10px] text-muted-foreground">
                          Withdrawals send USDT (BEP-20) back to your connected wallet. Processing is instant on-chain.
                        </p>
                      </div>
                    )}

                    <button
                      onClick={() => setStep(isDeposit && !approved ? "approve" : "confirm")}
                      disabled={!isValid || !isConnected}
                      className="w-full bg-primary text-primary-foreground py-4 rounded-xl font-bold text-base transition-all active:scale-95 disabled:opacity-40 disabled:active:scale-100 flex items-center justify-center gap-2"
                    >
                      {isDeposit ? "Continue to Approve" : "Review Withdrawal"}
                    </button>
                  </motion.div>
                )}

                {/* STEP: Approve (deposit only) */}
                {step === "approve" && (
                  <motion.div
                    key="approve"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                  >
                    <div className="glass rounded-xl p-4 mb-4">
                      <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                        <Shield className="w-4 h-4 text-primary" />
                        Step 1: Approve USDT
                      </h3>
                      <p className="text-xs text-muted-foreground mb-4">
                        Allow the OPOLL platform contract to spend <strong>${numAmount.toFixed(2)} USDT</strong> from your wallet. This does not transfer funds yet.
                      </p>

                      {/* Visual steps */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary">1</div>
                          <div className="flex-1">
                            <p className="text-sm font-medium">Approve Spending</p>
                            <p className="text-[10px] text-muted-foreground">Sign approval in your wallet</p>
                          </div>
                          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                        </div>
                        <div className="flex items-center gap-3 opacity-40">
                          <div className="w-8 h-8 rounded-full bg-muted border border-border flex items-center justify-center text-xs font-bold text-muted-foreground">2</div>
                          <div className="flex-1">
                            <p className="text-sm font-medium">Deposit Funds</p>
                            <p className="text-[10px] text-muted-foreground">Transfer to platform</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/50 border border-border mb-5">
                      <AlertTriangle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      <p className="text-[10px] text-muted-foreground">
                        Approval is a standard ERC-20 operation. You only approve the exact amount needed. The contract address is verified on BscScan.
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => setStep("input")}
                        className="flex-1 glass py-3.5 rounded-xl font-semibold text-sm transition-all active:scale-95"
                      >
                        Back
                      </button>
                      <button
                        onClick={handleApprove}
                        className="flex-1 bg-primary text-primary-foreground py-3.5 rounded-xl font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
                      >
                        <Shield className="w-4 h-4" />
                        Approve USDT
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* STEP: Confirm */}
                {step === "confirm" && (
                  <motion.div
                    key="confirm"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                  >
                    <div className="glass rounded-xl p-4 mb-4">
                      <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                        <Shield className="w-4 h-4 text-primary" />
                        {isDeposit ? "Step 2: Confirm Deposit" : "Confirm Withdrawal"}
                      </h3>

                      <div className="space-y-2.5">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Action</span>
                          <span className="font-semibold">{isDeposit ? "Deposit" : "Withdraw"}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Token</span>
                          <span className="font-semibold">USDT (BEP-20)</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Amount</span>
                          <span className="font-bold text-lg">${numAmount.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Network</span>
                          <span className="font-semibold">BNB Smart Chain</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Est. Gas</span>
                          <span className="font-semibold text-muted-foreground">~$0.05</span>
                        </div>
                        {isDeposit && approved && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Approval</span>
                            <span className="text-primary font-semibold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Visual flow */}
                    <div className="glass rounded-xl p-4 mb-4">
                      <div className="flex items-center justify-between text-xs">
                        <div className="text-center">
                          <div className="w-10 h-10 rounded-full bg-muted border border-border flex items-center justify-center mx-auto mb-1">
                            <Wallet className="w-4 h-4" />
                          </div>
                          <p className="text-muted-foreground">{isDeposit ? "Your Wallet" : "Platform"}</p>
                        </div>
                        <div className="flex-1 px-3">
                          <motion.div
                            className="h-0.5 bg-primary rounded-full"
                            initial={{ scaleX: 0 }}
                            animate={{ scaleX: 1 }}
                            transition={{ duration: 0.8, delay: 0.3 }}
                            style={{ transformOrigin: "left" }}
                          />
                          <p className="text-center text-primary font-bold mt-1">${numAmount.toFixed(2)}</p>
                        </div>
                        <div className="text-center">
                          <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center mx-auto mb-1">
                            {isDeposit ? <ArrowDownToLine className="w-4 h-4 text-primary" /> : <ArrowUpFromLine className="w-4 h-4 text-primary" />}
                          </div>
                          <p className="text-muted-foreground">{isDeposit ? "Platform" : "Your Wallet"}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => setStep(isDeposit && !approved ? "approve" : "input")}
                        className="flex-1 glass py-3.5 rounded-xl font-semibold text-sm transition-all active:scale-95"
                      >
                        Back
                      </button>
                      <button
                        onClick={handleExecute}
                        className="flex-1 bg-primary text-primary-foreground py-3.5 rounded-xl font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
                      >
                        {isDeposit ? (
                          <>
                            <ArrowDownToLine className="w-4 h-4" />
                            Deposit Now
                          </>
                        ) : (
                          <>
                            <ArrowUpFromLine className="w-4 h-4" />
                            Withdraw Now
                          </>
                        )}
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* STEP: Executing */}
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
                    <h3 className="text-lg font-bold mt-4 mb-1">
                      {approved ? "Processing..." : "Approving USDT..."}
                    </h3>
                    <p className="text-sm text-muted-foreground text-center">
                      Please confirm in your wallet
                    </p>
                    <div className="mt-4 space-y-2 w-full max-w-xs">
                      {(approved
                        ? ["Preparing transaction", "Awaiting signature", "Confirming on-chain..."]
                        : ["Preparing approval", "Awaiting signature", "Confirming on-chain..."]
                      ).map((label, i) => (
                        <motion.div
                          key={label}
                          initial={{ opacity: 0.3 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.7, duration: 0.4 }}
                          className="flex items-center gap-2 text-xs text-muted-foreground"
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                          {label}
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* STEP: Success */}
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
                      {isDeposit ? "Deposit Successful!" : "Withdrawal Successful!"}
                    </h3>
                    <p className="text-sm text-muted-foreground text-center mb-4">
                      <strong>${numAmount.toFixed(2)} USDT</strong> {isDeposit ? "deposited to" : "withdrawn from"} the platform
                    </p>

                    <div className="glass rounded-xl p-3 w-full space-y-1.5 mb-5">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Amount</span>
                        <span className="font-semibold">${numAmount.toFixed(2)} USDT</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">New Platform Balance</span>
                        <span className="font-bold text-primary">
                          ${isDeposit
                            ? (MOCK_PLATFORM_BALANCE + numAmount).toFixed(2)
                            : (MOCK_PLATFORM_BALANCE - numAmount).toFixed(2)
                          }
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Tx Hash</span>
                        <span className="font-mono text-primary">0x7b2e...a91f</span>
                      </div>
                    </div>

                    <button
                      onClick={handleClose}
                      className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-semibold text-sm transition-all active:scale-95"
                    >
                      Done
                    </button>
                  </motion.div>
                )}

                {/* STEP: Error */}
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
                    <h3 className="text-lg font-bold mb-1">Transaction Failed</h3>
                    <p className="text-sm text-muted-foreground text-center mb-5">
                      The transaction was rejected or failed. No funds were moved.
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
