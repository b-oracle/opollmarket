import { useState, useEffect } from "react";
import { useAccount, useConnect } from "wagmi";
import { bsc } from "wagmi/chains";
import { motion, AnimatePresence } from "framer-motion";
import {
  Lock,
  Unlock,
  CheckCircle2,
  XCircle,
  Wallet,
  Coins,
  ImageIcon,
  ArrowRight,
  Calendar,
  FileText,
  Tag,
  DollarSign,
  AlertTriangle,
  Loader2,
  Sparkles,
} from "lucide-react";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";

const CATEGORIES = [
  { label: "Crypto", icon: "₿" },
  { label: "AI & Tech", icon: "🤖" },
  { label: "Science", icon: "🚀" },
  { label: "Economy", icon: "📈" },
  { label: "Entertainment", icon: "🎵" },
  { label: "Sports", icon: "⚽" },
  { label: "Politics", icon: "🏛️" },
  { label: "Other", icon: "💡" },
];

type GateStatus = "idle" | "checking" | "passed" | "failed";

interface GateCheck {
  label: string;
  icon: React.ReactNode;
  status: GateStatus;
  detail?: string;
}

const Create = () => {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();

  // Gate state
  const [gateChecks, setGateChecks] = useState<GateCheck[]>([]);
  const [gatePassed, setGatePassed] = useState(false);
  const [gateRunning, setGateRunning] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [endDate, setEndDate] = useState("");
  const [resolutionSource, setResolutionSource] = useState("");
  const [initialLiquidity, setInitialLiquidity] = useState("");
  const [step, setStep] = useState(1);

  // Simulate token-gate verification
  const runGateCheck = () => {
    setGateRunning(true);
    setGateChecks([
      { label: "Wallet Connected", icon: <Wallet className="w-4 h-4" />, status: "checking" },
      { label: "OPOLL Token Balance", icon: <Coins className="w-4 h-4" />, status: "idle" },
      { label: "Creator NFT", icon: <ImageIcon className="w-4 h-4" />, status: "idle" },
    ]);

    // Step 1: Wallet
    setTimeout(() => {
      setGateChecks((prev) =>
        prev.map((c, i) =>
          i === 0
            ? { ...c, status: "passed", detail: `${address?.slice(0, 6)}...${address?.slice(-4)}` }
            : i === 1
            ? { ...c, status: "checking" }
            : c
        )
      );
    }, 600);

    // Step 2: Token check
    setTimeout(() => {
      setGateChecks((prev) =>
        prev.map((c, i) =>
          i === 1
            ? { ...c, status: "passed", detail: "1,250 OPOLL" }
            : i === 2
            ? { ...c, status: "checking" }
            : c
        )
      );
    }, 1500);

    // Step 3: NFT check
    setTimeout(() => {
      setGateChecks((prev) =>
        prev.map((c, i) =>
          i === 2 ? { ...c, status: "passed", detail: "Creator Pass #847" } : c
        )
      );
      setGatePassed(true);
      setGateRunning(false);
    }, 2400);
  };

  useEffect(() => {
    if (isConnected && !gatePassed && !gateRunning && gateChecks.length === 0) {
      runGateCheck();
    }
  }, [isConnected]);

  const isFormValid =
    title.trim().length >= 10 &&
    description.trim().length >= 20 &&
    category &&
    endDate &&
    resolutionSource.trim().length >= 10;

  const statusIcon = (status: GateStatus) => {
    switch (status) {
      case "idle":
        return <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />;
      case "checking":
        return <Loader2 className="w-5 h-5 text-primary animate-spin" />;
      case "passed":
        return <CheckCircle2 className="w-5 h-5 text-primary" />;
      case "failed":
        return <XCircle className="w-5 h-5 text-destructive" />;
    }
  };

  // --- Token Gate Screen ---
  if (!isConnected || !gatePassed) {
    return (
      <div className="min-h-dvh bg-background pb-20">
        <TopBar />
        <div className="max-w-lg mx-auto px-4 pt-20 flex flex-col items-center justify-center min-h-[70dvh]">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-2xl p-6 w-full max-w-sm"
          >
            {/* Icon */}
            <div className="flex justify-center mb-5">
              <motion.div
                animate={gatePassed ? { scale: [1, 1.15, 1] } : {}}
                transition={{ duration: 0.4 }}
                className={`w-16 h-16 rounded-full flex items-center justify-center ${
                  gatePassed
                    ? "bg-primary/20 border border-primary/40"
                    : "bg-muted border border-border"
                }`}
              >
                {gatePassed ? (
                  <Unlock className="w-7 h-7 text-primary" />
                ) : (
                  <Lock className="w-7 h-7 text-muted-foreground" />
                )}
              </motion.div>
            </div>

            <h2 className="text-xl font-bold text-center mb-1">
              {gatePassed ? "Access Granted" : "Creator Verification"}
            </h2>
            <p className="text-sm text-muted-foreground text-center mb-6">
              {isConnected
                ? "Verifying your eligibility to create markets..."
                : "Connect your wallet to verify token holdings and unlock market creation."}
            </p>

            {/* Gate checks */}
            {isConnected && gateChecks.length > 0 && (
              <div className="space-y-3 mb-6">
                {gateChecks.map((check, i) => (
                  <motion.div
                    key={check.label}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.15 }}
                    className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
                      check.status === "passed"
                        ? "bg-primary/5 border border-primary/20"
                        : check.status === "failed"
                        ? "bg-destructive/5 border border-destructive/20"
                        : "bg-muted/50 border border-border"
                    }`}
                  >
                    {statusIcon(check.status)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{check.label}</p>
                      {check.detail && (
                        <p className="text-xs text-muted-foreground truncate">{check.detail}</p>
                      )}
                    </div>
                    {check.icon}
                  </motion.div>
                ))}
              </div>
            )}

            {/* Connect button */}
            {!isConnected && (
              <div className="space-y-2">
                {connectors.map((c) => (
                  <button
                    key={c.uid}
                    onClick={() => connect({ connector: c, chainId: bsc.id })}
                    disabled={isPending}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold transition-all active:scale-95 disabled:opacity-50"
                  >
                    <span className="text-lg">
                      {c.name.includes("MetaMask") ? "🦊" : c.name.includes("WalletConnect") ? "🔗" : "💰"}
                    </span>
                    <span className="flex-1 text-left">
                      {isPending ? "Connecting..." : `Connect ${c.name}`}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ))}
              </div>
            )}

            {/* Requirements info */}
            <div className="mt-5 p-3 rounded-xl bg-muted/50 border border-border">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 font-semibold">
                Requirements (any one)
              </p>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Coins className="w-3 h-3 text-primary" />
                  Hold ≥ 100 OPOLL tokens
                </li>
                <li className="flex items-center gap-2">
                  <ImageIcon className="w-3 h-3 text-primary" />
                  Own a Creator Pass NFT
                </li>
                <li className="flex items-center gap-2">
                  <Sparkles className="w-3 h-3 text-primary" />
                  Staked ≥ 500 OPOLL in governance
                </li>
              </ul>
            </div>
          </motion.div>
        </div>
        <BottomNav />
      </div>
    );
  }

  // --- Market Creation Form ---
  return (
    <div className="min-h-dvh bg-background pb-24">
      <TopBar />
      <div className="max-w-lg mx-auto px-4 pt-20">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
              <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="text-xs text-primary font-semibold">Verified Creator</span>
          </div>
          <h1 className="text-2xl font-bold">Create Market</h1>
          <p className="text-sm text-muted-foreground">
            Launch a prediction market and earn fees from every trade.
          </p>
        </motion.div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  step >= s
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {s}
              </div>
              {s < 3 && (
                <div
                  className={`flex-1 h-0.5 rounded-full transition-colors ${
                    step > s ? "bg-primary" : "bg-border"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* Step 1: Basic Info */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div className="glass rounded-xl p-4">
                <label className="flex items-center gap-2 text-sm font-semibold mb-2">
                  <FileText className="w-4 h-4 text-primary" />
                  Market Question
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Will Bitcoin hit $150K before July 2026?"
                  className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                  maxLength={120}
                />
                <p className="text-[10px] text-muted-foreground mt-1.5 text-right">
                  {title.length}/120
                </p>
              </div>

              <div className="glass rounded-xl p-4">
                <label className="flex items-center gap-2 text-sm font-semibold mb-2">
                  <FileText className="w-4 h-4 text-primary" />
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe how this market resolves. Be specific about conditions, data sources, and edge cases."
                  rows={4}
                  className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all resize-none"
                  maxLength={500}
                />
                <p className="text-[10px] text-muted-foreground mt-1.5 text-right">
                  {description.length}/500
                </p>
              </div>

              <button
                onClick={() => setStep(2)}
                disabled={title.trim().length < 10 || description.trim().length < 20}
                className="w-full bg-primary text-primary-foreground py-3.5 rounded-xl font-semibold transition-all active:scale-95 disabled:opacity-40 disabled:active:scale-100 flex items-center justify-center gap-2"
              >
                Continue
                <ArrowRight className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {/* Step 2: Category & Timing */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div className="glass rounded-xl p-4">
                <label className="flex items-center gap-2 text-sm font-semibold mb-3">
                  <Tag className="w-4 h-4 text-primary" />
                  Category
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.label}
                      onClick={() => setCategory(cat.label)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-95 ${
                        category === cat.label
                          ? "bg-primary/15 border border-primary/40 text-primary"
                          : "bg-muted/50 border border-border text-foreground hover:bg-muted"
                      }`}
                    >
                      <span>{cat.icon}</span>
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="glass rounded-xl p-4">
                <label className="flex items-center gap-2 text-sm font-semibold mb-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  Resolution Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={new Date(Date.now() + 86400000).toISOString().split("T")[0]}
                  className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                />
              </div>

              <div className="glass rounded-xl p-4">
                <label className="flex items-center gap-2 text-sm font-semibold mb-2">
                  <FileText className="w-4 h-4 text-primary" />
                  Resolution Source
                </label>
                <input
                  type="text"
                  value={resolutionSource}
                  onChange={(e) => setResolutionSource(e.target.value)}
                  placeholder="e.g. CoinGecko BTC/USD price feed"
                  className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 glass py-3.5 rounded-xl font-semibold text-sm transition-all active:scale-95"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!category || !endDate || resolutionSource.trim().length < 10}
                  className="flex-1 bg-primary text-primary-foreground py-3.5 rounded-xl font-semibold transition-all active:scale-95 disabled:opacity-40 disabled:active:scale-100 flex items-center justify-center gap-2"
                >
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* Step 3: Liquidity & Review */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div className="glass rounded-xl p-4">
                <label className="flex items-center gap-2 text-sm font-semibold mb-2">
                  <DollarSign className="w-4 h-4 text-primary" />
                  Initial Liquidity (USDT)
                </label>
                <input
                  type="number"
                  value={initialLiquidity}
                  onChange={(e) => setInitialLiquidity(e.target.value)}
                  placeholder="100"
                  min="10"
                  className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                />
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  Minimum 10 USDT. Higher liquidity attracts more traders.
                </p>
              </div>

              {/* Review card */}
              <div className="glass rounded-xl p-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  Market Preview
                </h3>
                <div className="space-y-2.5 text-sm">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Question</p>
                    <p className="font-medium">{title || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Description</p>
                    <p className="text-muted-foreground text-xs">{description || "—"}</p>
                  </div>
                  <div className="flex gap-4">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Category</p>
                      <p className="font-medium">
                        {CATEGORIES.find((c) => c.label === category)?.icon} {category || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ends</p>
                      <p className="font-medium">{endDate || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Liquidity</p>
                      <p className="font-medium">{initialLiquidity ? `$${initialLiquidity}` : "—"}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Fee info */}
              <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/50 border border-border">
                <AlertTriangle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  A 2% platform fee applies. Creators earn 1% of all trade volume. Initial liquidity will be locked until market resolution.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 glass py-3.5 rounded-xl font-semibold text-sm transition-all active:scale-95"
                >
                  Back
                </button>
                <button
                  disabled={!isFormValid || !initialLiquidity}
                  className="flex-1 btn-yes py-3.5 rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-40 disabled:active:scale-100"
                >
                  Create Market
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <BottomNav />
    </div>
  );
};

export default Create;
