import LogoLoader from "@/components/LogoLoader";
import { useState, useEffect, useCallback } from "react";
import { useAccount, useConnect } from "wagmi";
import { useNavigate } from "react-router-dom";
import { bsc } from "wagmi/chains";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp,
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
  Share2,
  MessageSquare,
  Plus,
  X,
  BarChart3,
  Target,
  LogIn,
  User,
} from "lucide-react";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/hooks/useAuth";

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import CategoryIcon from "@/components/CategoryIcon";
import SwapModal from "@/components/SwapModal";

const CATEGORIES = [
  "Crypto", "AI & Tech", "Science", "Economy",
  "Entertainment", "Sports", "Politics", "Other",
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
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Gate thresholds & settings from DB
  const [minTokenBalance, setMinTokenBalance] = useState(10_000_000);
  const [minNftBalance, setMinNftBalance] = useState(1);
  const [tokenContractAddress, setTokenContractAddress] = useState("");
  const [nftBuyUrl, setNftBuyUrl] = useState("");
  const [marketCreationFee, setMarketCreationFee] = useState(50);
  const [tokenDecimals, setTokenDecimals] = useState(18);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("commission_settings")
        .select("*")
        .limit(1)
        .single();
      if (data) {
        setMinTokenBalance(Number((data as any).min_token_balance) || 10_000_000);
        setMinNftBalance(Number((data as any).min_nft_balance) || 1);
        setTokenContractAddress((data as any).token_contract_address || "");
        setNftBuyUrl((data as any).nft_buy_url || "");
        setMarketCreationFee(Number((data as any).market_creation_fee) || 50);
        setTokenDecimals(Number((data as any).token_decimals) ?? 18);
      }
    })();
  }, []);

  // Gate state
  const [gateChecks, setGateChecks] = useState<GateCheck[]>([]);
  const [gatePassed, setGatePassed] = useState(false);
  const [gateRunning, setGateRunning] = useState(false);
  const [gateFinished, setGateFinished] = useState(false);
  const [payingToCreate, setPayingToCreate] = useState(false);
  const [swapModalOpen, setSwapModalOpen] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [endDate, setEndDate] = useState("");
  const [resolutionSource, setResolutionSource] = useState("");
  const [initialLiquidity, setInitialLiquidity] = useState("");
  const [step, setStep] = useState(1);
  const [marketType, setMarketType] = useState<"binary" | "multi" | "range">("binary");
  const [options, setOptions] = useState<string[]>(["", ""]);

  const addOption = () => {
    if (options.length < 6) setOptions([...options, ""]);
  };
  const removeOption = (idx: number) => {
    if (options.length > 2) setOptions(options.filter((_, i) => i !== idx));
  };
  const updateOption = (idx: number, val: string) => {
    setOptions(options.map((o, i) => (i === idx ? val : o)));
  };

  // Validation state — track which fields have been "touched" or attempted
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [shakeField, setShakeField] = useState<string | null>(null);

  const markTouched = (field: string) => setTouched((t) => ({ ...t, [field]: true }));

  const shake = (field: string) => {
    setShakeField(field);
    setTimeout(() => setShakeField(null), 500);
  };

  // Validation rules
  const errors: Record<string, string | null> = {
    title: title.trim().length === 0 ? "Question is required" : title.trim().length < 10 ? "Must be at least 10 characters" : null,
    description: description.trim().length === 0 ? "Description is required" : description.trim().length < 20 ? "Must be at least 20 characters" : null,
    category: !category ? "Select a category" : null,
    endDate: !endDate ? "Resolution date is required" : null,
    resolutionSource: resolutionSource.trim().length === 0 ? "Resolution source is required" : resolutionSource.trim().length < 10 ? "Must be at least 10 characters" : null,
    initialLiquidity: !initialLiquidity ? "Initial liquidity is required" : parseFloat(initialLiquidity) < 10 ? "Minimum 10 USDT" : null,
    options: marketType !== "binary" && options.filter(o => o.trim()).length < 2 ? "At least 2 options required" : null,
  };

  const shakeClass = (field: string) => shakeField === field ? "animate-[shake_0.4s_ease-in-out]" : "";

  const tryAdvanceStep1 = () => {
    setTouched((t) => ({ ...t, title: true, description: true, options: true }));
    if (errors.title) { shake("title"); return; }
    if (errors.description) { shake("description"); return; }
    if (marketType !== "binary" && errors.options) { shake("options"); return; }
    setStep(2);
  };

  const tryAdvanceStep2 = () => {
    setTouched((t) => ({ ...t, category: true, endDate: true, resolutionSource: true }));
    if (errors.category) { shake("category"); return; }
    if (errors.endDate) { shake("endDate"); return; }
    if (errors.resolutionSource) { shake("resolutionSource"); return; }
    setStep(3);
  };

  // Submission state
  type SubmitStep = "idle" | "checking_similarity" | "deploying" | "saving" | "success" | "error";
  const [submitStep, setSubmitStep] = useState<SubmitStep>("idle");
  const [txHash, setTxHash] = useState("");
  const [newMarketId, setNewMarketId] = useState("");
  const [similarMarkets, setSimilarMarkets] = useState<Array<{ id: string; title: string; category: string }>>([]);
  const [createdAsPending, setCreatedAsPending] = useState(false);

  // Save wallet address to profile when connected
  useEffect(() => {
    if (user && isConnected && address) {
      (async () => {
        const { data: profile } = await supabase
          .from("profiles")
          .select("wallet_address")
          .eq("id", user.id)
          .single();
        if (profile && !profile.wallet_address) {
          await supabase
            .from("profiles")
            .update({ wallet_address: address })
            .eq("id", user.id);
        }
      })();
    }
  }, [user, isConnected, address]);

  const handleCreateMarket = useCallback(async () => {
    if (!user || !address) return;
    const liquidityAmount = parseFloat(initialLiquidity);
    setSimilarMarkets([]);
    setCreatedAsPending(false);

    // Step 0: AI similarity check
    setSubmitStep("checking_similarity");
    let isSimilar = false;
    try {
      const { data: simData, error: simError } = await supabase.functions.invoke("check-market-similarity", {
        body: { title: title.trim(), description: description.trim() },
      });
      if (!simError && simData?.similar && simData.matches?.length > 0) {
        isSimilar = true;
        setSimilarMarkets(simData.matches);
      }
    } catch (err) {
      console.error("Similarity check failed, proceeding:", err);
    }

    // Step 1: Check and deduct balance
    setSubmitStep("deploying");

    const { data: bal, error: balError } = await supabase
      .from("balances")
      .select("amount")
      .eq("user_id", user.id)
      .single();

    if (balError || !bal) {
      setSubmitStep("error");
      toast.error("Could not fetch your balance");
      return;
    }

    if (bal.amount < liquidityAmount) {
      setSubmitStep("error");
      toast.error(`Insufficient balance. You need $${liquidityAmount} USDT but have $${bal.amount.toFixed(2)}.`);
      return;
    }

    // Deduct initial liquidity from creator's balance
    const { error: deductError } = await supabase
      .from("balances")
      .update({ amount: bal.amount - liquidityAmount, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);

    if (deductError) {
      setSubmitStep("error");
      toast.error("Failed to deduct liquidity from your balance");
      return;
    }

    // Simulate on-chain contract deployment
    await new Promise((r) => setTimeout(r, 2500));
    const mockTxHash = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`;
    const mockContractAddr = `0x${Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`;
    setTxHash(mockTxHash);

    setSubmitStep("saving");

    // If similar, create as pending for admin review
    const marketStatus = isSimilar ? "pending" : "active";

    // Save to database
    const { data, error } = await supabase
      .from("markets")
      .insert({
        creator_wallet: user.id,
        creator_name: user.user_metadata?.display_name || user.email?.split("@")[0] || "Anonymous",
        title: title.trim(),
        description: description.trim(),
        category,
        end_date: endDate,
        resolution_source: resolutionSource.trim(),
        initial_liquidity: liquidityAmount,
        liquidity: liquidityAmount,
        tx_hash: mockTxHash,
        contract_address: mockContractAddr,
        market_type: marketType,
        status: marketStatus,
      })
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("Failed to save market:", error);
      await supabase
        .from("balances")
        .update({ amount: bal.amount, updated_at: new Date().toISOString() })
        .eq("user_id", user.id);
      setSubmitStep("error");
      toast.error("Failed to save market. Your balance has been refunded.");
      return;
    }

    // Record the liquidity transaction
    await supabase.from("transactions").insert({
      user_id: user.id,
      type: "buy",
      amount: liquidityAmount,
      market_id: data?.id,
      status: "confirmed",
      side: "initial_liquidity",
    });

    // Save options for multi/range markets
    if (marketType !== "binary" && data?.id) {
      const validOptions = options.filter(o => o.trim());
      const equalPrice = Math.round((1 / validOptions.length) * 100) / 100;
      const { error: optError } = await supabase
        .from("market_options")
        .insert(
          validOptions.map((label, i) => ({
            market_id: data.id,
            label: label.trim(),
            price: equalPrice,
            sort_order: i,
          }))
        );
      if (optError) {
        console.error("Failed to save options:", optError);
      }
    }

    setNewMarketId(data?.id || "");
    setCreatedAsPending(isSimilar);
    setSubmitStep("success");

    if (isSimilar) {
      toast.info("Your market was flagged as similar to an existing one and is pending admin review.");
    } else {
      toast.success("Market created successfully!");
    }
  }, [user, address, title, description, category, endDate, resolutionSource, initialLiquidity, marketType, options]);

  // Token-gate verification using wallet NFTs
  const runGateCheck = async () => {
    setGateRunning(true);
    setGateFinished(false);
    setGateChecks([
      { label: "Wallet Connected", icon: <Wallet className="w-4 h-4" />, status: "checking" },
      { label: "BC400 Token Balance", icon: <Coins className="w-4 h-4" />, status: "idle" },
      { label: "BC400 NFT", icon: <ImageIcon className="w-4 h-4" />, status: "idle" },
    ]);

    // Step 1: Wallet — always passes if connected
    await new Promise((r) => setTimeout(r, 600));
    setGateChecks((prev) =>
      prev.map((c, i) =>
        i === 0
          ? { ...c, status: "passed", detail: `${address?.slice(0, 6)}...${address?.slice(-4)}` }
          : i === 1
          ? { ...c, status: "checking" }
          : c
      )
    );

    // Step 2: Token balance check via BSC RPC edge function
    let tokenPassed = false;
    try {
      if (tokenContractAddress) {
        const { data, error } = await supabase.functions.invoke("check-token-balance", {
          body: { wallet_address: address, token_contract_address: tokenContractAddress, token_decimals: tokenDecimals },
        });
        if (!error && data?.balance >= minTokenBalance) {
          tokenPassed = true;
        }
        setGateChecks((prev) =>
          prev.map((c, i) =>
            i === 1
              ? {
                  ...c,
                  status: tokenPassed ? "passed" : "failed",
                  detail: tokenPassed
                    ? `${Number(data?.balance || 0).toLocaleString()} BC400`
                    : `${Number(data?.balance || 0).toLocaleString()} / ${minTokenBalance.toLocaleString()} BC400`,
                }
              : i === 2
              ? { ...c, status: "checking" }
              : c
          )
        );
      } else {
        // No token contract configured — skip check as failed
        setGateChecks((prev) =>
          prev.map((c, i) =>
            i === 1
              ? { ...c, status: "failed", detail: "Token contract not configured" }
              : i === 2
              ? { ...c, status: "checking" }
              : c
          )
        );
      }
    } catch (err) {
      console.error("Token balance check error:", err);
      setGateChecks((prev) =>
        prev.map((c, i) =>
          i === 1
            ? { ...c, status: "failed", detail: "Check failed" }
            : i === 2
            ? { ...c, status: "checking" }
            : c
        )
      );
    }

    // Step 3: NFT check via edge function
    await new Promise((r) => setTimeout(r, 900));
    let nftPassed = false;
    try {
      const { data, error } = await supabase.functions.invoke("fetch-wallet-nfts", {
        body: { wallet_address: address },
      });
      if (!error && data?.nfts?.length >= minNftBalance) {
        nftPassed = true;
      }
    } catch {
      // NFT check failed
    }

    setGateChecks((prev) =>
      prev.map((c, i) =>
        i === 2
          ? { ...c, status: nftPassed ? "passed" : "failed", detail: nftPassed ? `≥ ${minNftBalance} NFT found` : "No qualifying NFTs" }
          : c
      )
    );

    const passed = tokenPassed || nftPassed;
    setGatePassed(passed);
    setGateFinished(true);
    setGateRunning(false);
  };

  useEffect(() => {
    if (isConnected && !gatePassed && !gateRunning && gateChecks.length === 0) {
      runGateCheck();
    }
  }, [isConnected]);

  // Pay to create market — deduct fee from balance
  const handlePayToCreate = async () => {
    if (!user) return;
    setPayingToCreate(true);
    try {
      const { data: bal } = await supabase
        .from("balances")
        .select("amount")
        .eq("user_id", user.id)
        .single();

      if (!bal || bal.amount < marketCreationFee) {
        toast.error(`Insufficient balance. You need $${marketCreationFee} USDT.`);
        setPayingToCreate(false);
        return;
      }

      const { error } = await supabase
        .from("balances")
        .update({ amount: bal.amount - marketCreationFee, updated_at: new Date().toISOString() })
        .eq("user_id", user.id);

      if (error) throw error;

      // Record the transaction
      await supabase.from("transactions").insert({
        user_id: user.id,
        type: "buy",
        amount: marketCreationFee,
        status: "confirmed",
        side: "market_creation_fee",
      });

      toast.success("Payment successful! You can now create a market.");
      setGatePassed(true);
    } catch (err: any) {
      toast.error(err.message || "Payment failed");
    } finally {
      setPayingToCreate(false);
    }
  };

  const pancakeSwapUrl = tokenContractAddress
    ? `https://pancakeswap.finance/swap?outputCurrency=${tokenContractAddress}&chain=bsc`
    : "https://pancakeswap.finance/swap";

  const isFormValid =
    title.trim().length >= 10 &&
    description.trim().length >= 20 &&
    category &&
    endDate &&
    resolutionSource.trim().length >= 10 &&
    (marketType === "binary" || options.filter(o => o.trim()).length >= 2);

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

  // --- Auth Loading ---
  if (authLoading) {
    return (
      <div className="min-h-dvh bg-background pb-20">
        <TopBar />
        <div className="max-w-lg mx-auto px-4 pt-20 flex items-center justify-center min-h-[70dvh]">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
        <BottomNav />
      </div>
    );
  }

  // --- Auth Gate: Must be signed in ---
  if (!user) {
    return (
      <div className="min-h-dvh bg-background pb-20">
        <TopBar />
        <div className="max-w-lg md:max-w-2xl mx-auto px-4 pt-20 flex flex-col items-center justify-center min-h-[70dvh]">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-2xl p-6 w-full max-w-sm"
          >
            <div className="flex justify-center mb-5">
              <div className="w-16 h-16 rounded-full bg-muted border border-border flex items-center justify-center">
                <User className="w-7 h-7 text-muted-foreground" />
              </div>
            </div>

            <h2 className="text-xl font-bold text-center mb-1">Sign In Required</h2>
            <p className="text-sm text-muted-foreground text-center mb-6">
              You need an account to create prediction markets. Sign in or create an account to get started.
            </p>

            {/* Steps preview */}
            <div className="space-y-2.5 mb-6">
              {[
                { step: "1", label: "Sign in to your account", icon: <User className="w-4 h-4" />, active: true },
                { step: "2", label: "Connect your EVM Wallet", icon: <Wallet className="w-4 h-4" />, active: false },
                { step: "3", label: "Verify your token holdings", icon: <Coins className="w-4 h-4" />, active: false },
              ].map((s) => (
                <div
                  key={s.step}
                  className={`flex items-center gap-3 p-3 rounded-xl ${
                    s.active
                      ? "bg-primary/10 border border-primary/30"
                      : "bg-muted/50 border border-border opacity-50"
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    s.active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}>
                    {s.step}
                  </div>
                  <span className="text-sm font-medium flex-1">{s.label}</span>
                  {s.icon}
                </div>
              ))}
            </div>

            <button
              onClick={() => navigate("/auth")}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold transition-all active:scale-95"
            >
              <LogIn className="w-4 h-4" />
              Sign In to Create
            </button>
          </motion.div>
        </div>
        <BottomNav />
      </div>
    );
  }

  // --- Token Gate Screen (user is signed in, check wallet + tokens) ---
  if (!isConnected || !gatePassed) {
    return (
      <div className="min-h-dvh bg-background pb-20">
        <TopBar />
        <div className="max-w-lg md:max-w-2xl mx-auto px-4 pt-20 flex flex-col items-center justify-center min-h-[70dvh]">
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

            {/* Connect wallet button — when wallet not connected */}
            {!isConnected && (
              <button
                onClick={() => navigate("/profile?section=wallet")}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold transition-all active:scale-95"
              >
                <Wallet className="w-4 h-4" />
                Connect Wallet in Profile Settings
              </button>
            )}

            {/* Action buttons — when gate finished but failed */}
            {isConnected && gateFinished && !gatePassed && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-2.5 mt-2"
              >
                <p className="text-xs text-muted-foreground text-center mb-3">
                  You don't meet the requirements yet. Choose an option below:
                </p>

                {/* Buy Token — opens embedded swap modal */}
                <button
                  onClick={() => setSwapModalOpen(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold transition-all active:scale-95"
                >
                  <Coins className="w-4 h-4" />
                  Buy BC400 Token
                </button>

                {/* Buy/Mint NFT */}
                {nftBuyUrl && (
                  <a
                    href={nftBuyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-primary text-primary font-semibold transition-all active:scale-95 hover:bg-primary/5"
                  >
                    <ImageIcon className="w-4 h-4" />
                    Mint / Buy NFT
                  </a>
                )}

                {/* Pay to Create */}
                <button
                  onClick={handlePayToCreate}
                  disabled={payingToCreate}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-border text-foreground font-semibold transition-all active:scale-95 hover:bg-muted/50 disabled:opacity-50"
                >
                  {payingToCreate ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <DollarSign className="w-4 h-4" />
                  )}
                  Pay ${marketCreationFee} to Create Market
                </button>

                {/* Retry check */}
                <button
                  onClick={() => { setGateChecks([]); setGateFinished(false); runGateCheck(); }}
                  disabled={gateRunning}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  Re-check eligibility
                </button>
              </motion.div>
            )}

            {/* Requirements info */}
            <div className="mt-5 p-3 rounded-xl bg-muted/50 border border-border">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 font-semibold">
                Requirements (any one)
              </p>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Coins className="w-3 h-3 text-primary" />
                  Hold ≥ {minTokenBalance.toLocaleString()} BC400 tokens
                </li>
                <li className="flex items-center gap-2">
                  <ImageIcon className="w-3 h-3 text-primary" />
                  Own ≥ {minNftBalance} BC400 NFT{minNftBalance !== 1 ? "s" : ""}
                </li>
                <li className="flex items-center gap-2">
                  <DollarSign className="w-3 h-3 text-primary" />
                  Pay ${marketCreationFee} USDT from your balance
                </li>
              </ul>
            </div>
          </motion.div>
        </div>
        <SwapModal
          open={swapModalOpen}
          onClose={() => {
            setSwapModalOpen(false);
            // Auto re-check eligibility after closing swap modal
            setGateChecks([]);
            setGateFinished(false);
            setGatePassed(false);
            runGateCheck();
          }}
          tokenContractAddress={tokenContractAddress}
        />
        <BottomNav />
      </div>
    );
  }

  // --- Market Creation Form ---
  return (
    <div className="min-h-dvh bg-background" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}>
      <TopBar />
      <div className="max-w-lg md:max-w-2xl mx-auto px-3 sm:px-4 pt-20">
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
              <div className={`glass rounded-xl p-4 ${shakeClass("title")} ${touched.title && errors.title ? "border-destructive/50" : ""}`}>
                <label className="flex items-center gap-2 text-sm font-semibold mb-2">
                  <FileText className="w-4 h-4 text-primary" />
                  Market Question
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => markTouched("title")}
                  placeholder="Will Bitcoin hit $150K before July 2026?"
                  className={`w-full bg-muted/50 border rounded-xl px-4 py-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 transition-all ${
                    touched.title && errors.title ? "border-destructive focus:ring-destructive/30" : "border-border focus:ring-primary/30"
                  }`}
                  maxLength={120}
                />
                <div className="flex justify-between mt-1.5">
                  {touched.title && errors.title ? (
                    <p className="text-[10px] text-destructive">{errors.title}</p>
                  ) : <span />}
                  <p className="text-[10px] text-muted-foreground">{title.length}/120</p>
                </div>
              </div>

              <div className={`glass rounded-xl p-4 ${shakeClass("description")} ${touched.description && errors.description ? "border-destructive/50" : ""}`}>
                <label className="flex items-center gap-2 text-sm font-semibold mb-2">
                  <FileText className="w-4 h-4 text-primary" />
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={() => markTouched("description")}
                  placeholder="Describe how this market resolves. Be specific about conditions, data sources, and edge cases."
                  rows={4}
                  className={`w-full bg-muted/50 border rounded-xl px-4 py-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 transition-all resize-none ${
                    touched.description && errors.description ? "border-destructive focus:ring-destructive/30" : "border-border focus:ring-primary/30"
                  }`}
                  maxLength={500}
                />
                <div className="flex justify-between mt-1.5">
                  {touched.description && errors.description ? (
                    <p className="text-[10px] text-destructive">{errors.description}</p>
                  ) : <span />}
                  <p className="text-[10px] text-muted-foreground">{description.length}/500</p>
                </div>
              </div>

              {/* Market Type */}
              <div className="glass rounded-xl p-4">
                <label className="flex items-center gap-2 text-sm font-semibold mb-3">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  Market Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { key: "binary" as const, label: "Yes / No", icon: <Target className="w-4 h-4" />, desc: "Two outcomes" },
                    { key: "multi" as const, label: "Multiple", icon: <BarChart3 className="w-4 h-4" />, desc: "2-6 choices" },
                    { key: "range" as const, label: "Range", icon: <TrendingUp className="w-4 h-4" />, desc: "Price brackets" },
                  ]).map((t) => (
                    <button
                      key={t.key}
                      onClick={() => {
                        setMarketType(t.key);
                        if (t.key === "binary") setOptions(["", ""]);
                      }}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl text-center transition-all active:scale-95 ${
                        marketType === t.key
                          ? "bg-primary/15 border border-primary/40 text-primary"
                          : "bg-muted/50 border border-border text-foreground hover:bg-muted"
                      }`}
                    >
                      {t.icon}
                      <span className="text-xs font-semibold">{t.label}</span>
                      <span className="text-[9px] text-muted-foreground">{t.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Options builder for multi/range */}
              {marketType !== "binary" && (
                <div className={`glass rounded-xl p-4 ${shakeClass("options")} ${touched.options && errors.options ? "border-destructive/50" : ""}`}>
                  <label className="flex items-center gap-2 text-sm font-semibold mb-3">
                    <Plus className="w-4 h-4 text-primary" />
                    {marketType === "range" ? "Price Brackets" : "Answer Options"}
                  </label>
                  <div className="space-y-2">
                    {options.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: [
                            "hsl(var(--primary))", "hsl(var(--destructive))", "hsl(45, 93%, 58%)",
                            "hsl(280, 70%, 60%)", "hsl(30, 80%, 55%)", "hsl(var(--muted-foreground))"
                          ][i] }}
                        />
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => updateOption(i, e.target.value)}
                          placeholder={marketType === "range" ? `e.g. $50K – $100K` : `Option ${i + 1}`}
                          className="flex-1 bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                          maxLength={50}
                        />
                        {options.length > 2 && (
                          <button
                            onClick={() => removeOption(i)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {options.length < 6 && (
                    <button
                      onClick={addOption}
                      className="mt-2 w-full py-2 rounded-lg border border-dashed border-border text-xs font-semibold text-muted-foreground hover:text-primary hover:border-primary/30 transition-all"
                    >
                      + Add Option
                    </button>
                  )}
                  {touched.options && errors.options && (
                    <p className="text-[10px] text-destructive mt-2">{errors.options}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-2">
                    Prices will be distributed equally at launch. {options.filter(o => o.trim()).length}/6 options.
                  </p>
                </div>
              )}

              <button
                onClick={tryAdvanceStep1}
                className="w-full bg-primary text-primary-foreground py-3.5 rounded-xl font-semibold transition-all active:scale-95 flex items-center justify-center gap-2"
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
              <div className={`glass rounded-xl p-4 ${shakeClass("category")} ${touched.category && errors.category ? "border-destructive/50" : ""}`}>
                <label className="flex items-center gap-2 text-sm font-semibold mb-3">
                  <Tag className="w-4 h-4 text-primary" />
                  Category
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => { setCategory(cat); markTouched("category"); }}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-95 ${
                        category === cat
                          ? "bg-primary/15 border border-primary/40 text-primary"
                          : "bg-muted/50 border border-border text-foreground hover:bg-muted"
                      }`}
                    >
                      <CategoryIcon category={cat} className="w-4 h-4" />
                      {cat}
                    </button>
                  ))}
                </div>
                {touched.category && errors.category && (
                  <p className="text-[10px] text-destructive mt-2">{errors.category}</p>
                )}
              </div>

              <div className={`glass rounded-xl p-4 ${shakeClass("endDate")} ${touched.endDate && errors.endDate ? "border-destructive/50" : ""}`}>
                <label className="flex items-center gap-2 text-sm font-semibold mb-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  Resolution Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); markTouched("endDate"); }}
                  min={new Date(Date.now() + 86400000).toISOString().split("T")[0]}
                  className={`w-full bg-muted/50 border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 transition-all ${
                    touched.endDate && errors.endDate ? "border-destructive focus:ring-destructive/30" : "border-border focus:ring-primary/30"
                  }`}
                />
                {touched.endDate && errors.endDate && (
                  <p className="text-[10px] text-destructive mt-1.5">{errors.endDate}</p>
                )}
              </div>

              <div className={`glass rounded-xl p-4 ${shakeClass("resolutionSource")} ${touched.resolutionSource && errors.resolutionSource ? "border-destructive/50" : ""}`}>
                <label className="flex items-center gap-2 text-sm font-semibold mb-2">
                  <FileText className="w-4 h-4 text-primary" />
                  Resolution Source
                </label>
                <input
                  type="text"
                  value={resolutionSource}
                  onChange={(e) => setResolutionSource(e.target.value)}
                  onBlur={() => markTouched("resolutionSource")}
                  placeholder="e.g. CoinGecko BTC/USD price feed"
                  className={`w-full bg-muted/50 border rounded-xl px-4 py-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 transition-all ${
                    touched.resolutionSource && errors.resolutionSource ? "border-destructive focus:ring-destructive/30" : "border-border focus:ring-primary/30"
                  }`}
                />
                {touched.resolutionSource && errors.resolutionSource && (
                  <p className="text-[10px] text-destructive mt-1.5">{errors.resolutionSource}</p>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 glass py-3.5 rounded-xl font-semibold text-sm transition-all active:scale-95"
                >
                  Back
                </button>
                <button
                  onClick={tryAdvanceStep2}
                  className="flex-1 bg-primary text-primary-foreground py-3.5 rounded-xl font-semibold transition-all active:scale-95 flex items-center justify-center gap-2"
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
              <div className={`glass rounded-xl p-4 ${shakeClass("initialLiquidity")} ${touched.initialLiquidity && errors.initialLiquidity ? "border-destructive/50" : ""}`}>
                <label className="flex items-center gap-2 text-sm font-semibold mb-2">
                  <DollarSign className="w-4 h-4 text-primary" />
                  Initial Liquidity (USDT)
                </label>
                <input
                  type="number"
                  value={initialLiquidity}
                  onChange={(e) => setInitialLiquidity(e.target.value)}
                  onBlur={() => markTouched("initialLiquidity")}
                  placeholder="100"
                  min="10"
                  className={`w-full bg-muted/50 border rounded-xl px-4 py-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 transition-all ${
                    touched.initialLiquidity && errors.initialLiquidity ? "border-destructive focus:ring-destructive/30" : "border-border focus:ring-primary/30"
                  }`}
                />
                {touched.initialLiquidity && errors.initialLiquidity ? (
                  <p className="text-[10px] text-destructive mt-1.5">{errors.initialLiquidity}</p>
                ) : (
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    Minimum 10 USDT. Higher liquidity attracts more traders.
                  </p>
                )}
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
                  <div className="flex gap-4 flex-wrap">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Type</p>
                      <p className="font-medium capitalize">{marketType}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Category</p>
                      <p className="font-medium inline-flex items-center gap-1.5">
                        {category && <CategoryIcon category={category} className="w-3.5 h-3.5" />} {category || "—"}
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
                  {marketType !== "binary" && (
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Options</p>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {options.filter(o => o.trim()).map((o, i) => (
                          <span key={i} className="text-xs bg-muted px-2 py-1 rounded-lg">{o}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Fee info */}
              <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/50 border border-border">
                <AlertTriangle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  A 2% platform fee applies. Creators earn 1% of all trade volume. Initial liquidity will be locked until market resolution.
                </p>
              </div>

              {submitStep === "idle" && (
                <div className="flex gap-3">
                  <button
                    onClick={() => setStep(2)}
                    className="flex-1 glass py-3.5 rounded-xl font-semibold text-sm transition-all active:scale-95"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => {
                      setTouched((t) => ({ ...t, initialLiquidity: true }));
                      if (errors.initialLiquidity) { shake("initialLiquidity"); return; }
                      handleCreateMarket();
                    }}
                    disabled={!isFormValid || !!errors.initialLiquidity}
                    className="flex-1 btn-yes py-3.5 rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-40 disabled:active:scale-100 flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    Create Market
                  </button>
                </div>
              )}

              {(submitStep === "deploying" || submitStep === "saving") && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="glass rounded-xl p-6 flex flex-col items-center"
                >
                  <LogoLoader size="lg" />
                  <h3 className="text-base font-bold mt-3 mb-1">
                    {submitStep === "deploying" ? "Deploying Contract..." : "Saving to Database..."}
                  </h3>
                  <p className="text-xs text-muted-foreground text-center">
                    {submitStep === "deploying"
                      ? "Deploying your prediction market contract on BSC. Please confirm in your wallet."
                      : "Storing market data and linking contract address..."}
                  </p>
                  <div className="mt-4 space-y-2 w-full max-w-xs">
                    {[
                      { label: "Preparing contract", done: true },
                      { label: "Awaiting wallet signature", done: submitStep === "saving" },
                      { label: "Broadcasting transaction", done: submitStep === "saving" },
                      { label: "Saving market data", done: false },
                    ].map((s, i) => (
                      <motion.div
                        key={s.label}
                        initial={{ opacity: 0.3 }}
                        animate={{ opacity: s.done ? 1 : submitStep === "saving" && i === 3 ? 1 : 0.3 }}
                        transition={{ delay: i * 0.3 }}
                        className="flex items-center gap-2 text-xs"
                      >
                        {s.done ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                        ) : (
                          <div className="w-3.5 h-3.5 rounded-full border border-muted-foreground/30" />
                        )}
                        <span className={s.done ? "text-foreground" : "text-muted-foreground"}>{s.label}</span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {submitStep === "success" && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="glass rounded-xl p-6 flex flex-col items-center"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", damping: 10 }}
                    className={`w-14 h-14 rounded-full flex items-center justify-center mb-3 ${
                      createdAsPending
                        ? "bg-yellow-500/20 border border-yellow-500/40"
                        : "bg-primary/20 border border-primary/40"
                    }`}
                  >
                    {createdAsPending ? (
                      <AlertTriangle className="w-7 h-7 text-yellow-500" />
                    ) : (
                      <CheckCircle2 className="w-7 h-7 text-primary" />
                    )}
                  </motion.div>
                  <h3 className="text-base font-bold mb-1">
                    {createdAsPending ? "Market Pending Review" : "Market Created!"}
                  </h3>
                  <p className="text-xs text-muted-foreground text-center mb-4">
                    {createdAsPending
                      ? "Your market was flagged as similar to an existing one and needs admin approval before going live."
                      : "Your prediction market is now live. Share it and start earning from trades!"}
                  </p>

                  {/* Similar markets warning */}
                  {createdAsPending && similarMarkets.length > 0 && (
                    <div className="w-full mb-4 p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
                      <p className="text-[10px] text-yellow-600 dark:text-yellow-400 uppercase tracking-wider mb-2 font-semibold">Similar existing markets</p>
                      <ul className="space-y-1.5">
                        {similarMarkets.map((m) => (
                          <li key={m.id} className="text-xs text-muted-foreground flex items-start gap-2">
                            <span className="text-yellow-500 mt-0.5">•</span>
                            <button
                              onClick={() => navigate(`/market/${m.id}`)}
                              className="text-left hover:text-foreground transition-colors"
                            >
                              {m.title}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="w-full space-y-1.5 mb-4">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Liquidity</span>
                      <span className="font-semibold">${initialLiquidity} USDT</span>
                    </div>
                    {address && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Wallet</span>
                        <span className="font-mono text-muted-foreground">{address.slice(0, 6)}...{address.slice(-4)}</span>
                      </div>
                    )}
                  </div>
                  {/* Share buttons */}
                  <div className="w-full mb-4">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 text-center font-semibold">Share your market</p>
                    <div className="grid grid-cols-2 gap-2">
                      <a
                        href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`I just created a prediction market: "${title}" 🔮\n\nPredict now on OPoll 👇`)}&url=${encodeURIComponent(`${window.location.origin}/market/${newMarketId}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-muted/50 border border-border text-xs font-semibold hover:bg-accent/50 transition-colors"
                      >
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                        Post on X
                      </a>
                      <a
                        href={`https://t.me/share/url?url=${encodeURIComponent(`${window.location.origin}/market/${newMarketId}`)}&text=${encodeURIComponent(`I just created a prediction market: "${title}" 🔮 Predict now on OPoll!`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-muted/50 border border-border text-xs font-semibold hover:bg-accent/50 transition-colors"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        Telegram
                      </a>
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(`I just created a prediction market: "${title}" 🔮 Predict now on OPoll! ${window.location.origin}/market/${newMarketId}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-muted/50 border border-border text-xs font-semibold hover:bg-accent/50 transition-colors"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        WhatsApp
                      </a>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/market/${newMarketId}`);
                          toast.success("Link copied!");
                        }}
                        className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-muted/50 border border-border text-xs font-semibold hover:bg-accent/50 transition-colors"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        Copy Link
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-3 w-full">
                    <button
                      onClick={() => navigate("/")}
                      className="flex-1 glass py-3 rounded-xl font-semibold text-sm transition-all active:scale-95"
                    >
                      Home
                    </button>
                    <button
                      onClick={() => navigate(`/market/${newMarketId}`)}
                      className="flex-1 bg-primary text-primary-foreground py-3 rounded-xl font-semibold text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                      View Market
                    </button>
                  </div>
                </motion.div>
              )}

              {submitStep === "error" && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="glass rounded-xl p-6 flex flex-col items-center"
                >
                  <div className="w-14 h-14 rounded-full bg-destructive/20 border border-destructive/40 flex items-center justify-center mb-3">
                    <AlertTriangle className="w-7 h-7 text-destructive" />
                  </div>
                  <h3 className="text-base font-bold mb-1">Creation Failed</h3>
                  <p className="text-xs text-muted-foreground text-center mb-4">
                    Something went wrong. No funds were deducted.
                  </p>
                  <div className="flex gap-3 w-full">
                    <button
                      onClick={() => setSubmitStep("idle")}
                      className="flex-1 glass py-3 rounded-xl font-semibold text-sm transition-all active:scale-95"
                    >
                      Try Again
                    </button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      <BottomNav />
    </div>
  );
};

export default Create;
