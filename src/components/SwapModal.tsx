import { useState, useEffect, useCallback } from "react";
import { X, ArrowDown, Loader2, AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount, useBalance, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";
import { parseEther, formatEther, formatUnits, encodeFunctionData, type Address } from "viem";
import { toast } from "sonner";

// PancakeSwap Router V2 on BSC
const PANCAKE_ROUTER_V2 = "0x10ED43C718714eb63d5aA57B78B54704E256024E" as Address;
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" as Address;

// Router V2 ABI fragments
const ROUTER_ABI = [
  {
    name: "getAmountsOut",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "path", type: "address[]" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
  {
    name: "swapExactETHForTokens",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "amountOutMin", type: "uint256" },
      { name: "path", type: "address[]" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
] as const;

interface SwapModalProps {
  open: boolean;
  onClose: () => void;
  tokenContractAddress: string;
}

const SwapModal = ({ open, onClose, tokenContractAddress }: SwapModalProps) => {
  const { address, isConnected } = useAccount();
  const { data: bnbBalance } = useBalance({ address });
  const [bc400Balance, setBc400Balance] = useState<string>("0");

  // Fetch BC400 token balance via RPC
  useEffect(() => {
    if (!address || !tokenContractAddress || !open) return;
    const fetchTokenBalance = async () => {
      try {
        const balanceOfSig = "0x70a08231";
        const paddedAddr = address.slice(2).toLowerCase().padStart(64, "0");
        const data = balanceOfSig + paddedAddr;
        const resp = await fetch("https://bsc-dataseed1.binance.org/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0", id: 1, method: "eth_call",
            params: [{ to: tokenContractAddress, data }, "latest"],
          }),
        });
        const result = await resp.json();
        if (result.result && result.result !== "0x") {
          setBc400Balance(formatUnits(BigInt(result.result), 18));
        }
      } catch { /* ignore */ }
    };
    fetchTokenBalance();
  }, [address, tokenContractAddress, open]);

  const [bnbAmount, setBnbAmount] = useState("");
  const [estimatedTokens, setEstimatedTokens] = useState("");
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [slippage, setSlippage] = useState(5); // 5% default for low-liquidity tokens
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [swapStep, setSwapStep] = useState<"idle" | "confirming" | "pending" | "success" | "error">("idle");

  const { sendTransactionAsync } = useSendTransaction();
  const { isLoading: isTxPending, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isTxSuccess && swapStep === "pending") {
      setSwapStep("success");
      toast.success("Swap successful! BC400 tokens received.");
    }
  }, [isTxSuccess, swapStep]);

  // Fetch quote from PancakeSwap Router
  const fetchQuote = useCallback(async (amount: string) => {
    if (!amount || parseFloat(amount) <= 0 || !tokenContractAddress) {
      setEstimatedTokens("");
      return;
    }

    setQuoteLoading(true);
    try {
      const amountInWei = parseEther(amount);
      const path = [WBNB, tokenContractAddress as Address];

      const data = encodeFunctionData({
        abi: ROUTER_ABI,
        functionName: "getAmountsOut",
        args: [amountInWei, path],
      });

      const response = await fetch("https://bsc-dataseed1.binance.org/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [{ to: PANCAKE_ROUTER_V2, data }, "latest"],
        }),
      });

      const result = await response.json();
      if (result.result && result.result !== "0x") {
        // Decode the amounts array — last element is output amount
        const hex = result.result.slice(2);
        // Skip first 64 chars (offset) + next 64 chars (array length)
        // Then each subsequent 64 chars is an amount
        const arrayLength = parseInt(hex.slice(64, 128), 16);
        const lastAmountHex = hex.slice(128 + (arrayLength - 1) * 64, 128 + arrayLength * 64);
        const outputAmount = BigInt("0x" + lastAmountHex);
        // Assume 18 decimals (common for BSC tokens) — will work for BC400
        setEstimatedTokens(formatUnits(outputAmount, 18));
      } else {
        setEstimatedTokens("0");
      }
    } catch (err) {
      console.error("Quote error:", err);
      setEstimatedTokens("");
    } finally {
      setQuoteLoading(false);
    }
  }, [tokenContractAddress]);

  // Debounced quote fetch
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchQuote(bnbAmount);
    }, 500);
    return () => clearTimeout(timer);
  }, [bnbAmount, fetchQuote]);

  const handleSwap = async () => {
    if (!address || !bnbAmount || parseFloat(bnbAmount) <= 0) return;

    setSwapStep("confirming");

    try {
      const amountInWei = parseEther(bnbAmount);
      const path = [WBNB, tokenContractAddress as Address];
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200); // 20 min deadline

      // Calculate minimum output with slippage
      let amountOutMin = BigInt(0);
      if (estimatedTokens && parseFloat(estimatedTokens) > 0) {
        const estimated = parseEther(estimatedTokens);
        amountOutMin = (estimated * BigInt(100 - slippage)) / BigInt(100);
      }

      const data = encodeFunctionData({
        abi: ROUTER_ABI,
        functionName: "swapExactETHForTokens",
        args: [amountOutMin, path, address, deadline],
      });

      const hash = await sendTransactionAsync({
        to: PANCAKE_ROUTER_V2,
        data,
        value: amountInWei,
      });

      setTxHash(hash);
      setSwapStep("pending");
    } catch (err: any) {
      console.error("Swap error:", err);
      if (err?.message?.includes("User rejected") || err?.message?.includes("denied")) {
        toast.error("Transaction rejected");
      } else {
        toast.error("Swap failed. Try increasing slippage.");
      }
      setSwapStep("error");
      setTimeout(() => setSwapStep("idle"), 2000);
    }
  };

  const handleMaxBnb = () => {
    if (bnbBalance) {
      // Leave 0.005 BNB for gas
      const max = parseFloat(formatEther(bnbBalance.value)) - 0.005;
      if (max > 0) setBnbAmount(max.toFixed(6));
    }
  };

  const resetSwap = () => {
    setBnbAmount("");
    setEstimatedTokens("");
    setTxHash(undefined);
    setSwapStep("idle");
  };

  const formattedBalance = bnbBalance ? parseFloat(formatEther(bnbBalance.value)).toFixed(4) : "0";
  const formattedEstimate = estimatedTokens
    ? parseFloat(estimatedTokens).toLocaleString(undefined, { maximumFractionDigits: 2 })
    : "—";

  const canSwap =
    isConnected &&
    bnbAmount &&
    parseFloat(bnbAmount) > 0 &&
    parseFloat(bnbAmount) <= parseFloat(formattedBalance) &&
    swapStep === "idle";

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-background/80 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.97 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-x-3 top-[10vh] z-[71] mx-auto max-w-md flex flex-col bg-card border border-border rounded-2xl overflow-hidden shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-base font-bold text-foreground">Buy BC400</h3>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Success State */}
              {swapStep === "success" ? (
                <div className="flex flex-col items-center gap-4 py-8">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-primary" />
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-foreground">Swap Complete!</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      BC400 tokens have been added to your wallet.
                    </p>
                  </div>
                  {txHash && (
                    <a
                      href={`https://bscscan.com/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      View on BscScan ↗
                    </a>
                  )}
                  <button
                    onClick={() => {
                      resetSwap();
                      onClose();
                    }}
                    className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  {/* Not connected warning */}
                  {!isConnected && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20">
                      <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                      <p className="text-xs text-destructive">
                        Connect your wallet first to swap tokens.
                      </p>
                    </div>
                  )}

                  {/* From: BNB */}
                  <div className="rounded-xl border border-border bg-muted/30 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">You Pay</span>
                      <button
                        onClick={handleMaxBnb}
                        className="text-[10px] text-primary font-semibold hover:underline"
                      >
                        Balance: {formattedBalance} BNB
                      </button>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        value={bnbAmount}
                        onChange={(e) => setBnbAmount(e.target.value)}
                        placeholder="0.0"
                        min="0"
                        step="0.01"
                        className="flex-1 bg-transparent text-2xl font-bold text-foreground outline-none placeholder:text-muted-foreground/40 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        disabled={!isConnected || swapStep !== "idle"}
                      />
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted shrink-0">
                        <img
                          src="https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png"
                          alt="BNB"
                          className="w-5 h-5 rounded-full"
                        />
                        <span className="text-sm font-bold text-foreground">BNB</span>
                      </div>
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="flex justify-center -my-1">
                    <div className="w-8 h-8 rounded-full bg-muted border border-border flex items-center justify-center">
                      <ArrowDown className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>

                  {/* To: BC400 */}
                  <div className="rounded-xl border border-border bg-muted/30 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">You Receive (estimated)</span>
                      <div className="flex items-center gap-2">
                        {quoteLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                        <span className="text-[10px] text-muted-foreground font-semibold">
                          Balance: {parseFloat(bc400Balance).toLocaleString(undefined, { maximumFractionDigits: 2 })} BC400
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="flex-1 text-2xl font-bold text-foreground">
                        {quoteLoading ? "..." : formattedEstimate}
                      </span>
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted shrink-0">
                        <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                          <span className="text-[8px] font-bold text-primary">BC</span>
                        </div>
                        <span className="text-sm font-bold text-foreground">BC400</span>
                      </div>
                    </div>
                  </div>

                  {/* Slippage */}
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs text-muted-foreground">Slippage Tolerance</span>
                    <div className="flex items-center gap-1">
                      {[3, 5, 10].map((s) => (
                        <button
                          key={s}
                          onClick={() => setSlippage(s)}
                          className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                            slippage === s
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {s}%
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Price info */}
                  {bnbAmount && parseFloat(bnbAmount) > 0 && estimatedTokens && parseFloat(estimatedTokens) > 0 && (
                    <div className="rounded-lg bg-muted/40 p-3 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Rate</span>
                        <span className="text-foreground font-medium">
                          1 BNB ≈ {(parseFloat(estimatedTokens) / parseFloat(bnbAmount)).toLocaleString(undefined, { maximumFractionDigits: 0 })} BC400
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Min. received</span>
                        <span className="text-foreground font-medium">
                          {(parseFloat(estimatedTokens) * (1 - slippage / 100)).toLocaleString(undefined, { maximumFractionDigits: 2 })} BC400
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Route</span>
                        <span className="text-foreground font-medium">BNB → BC400</span>
                      </div>
                    </div>
                  )}

                  {/* Swap Button */}
                  <button
                    onClick={handleSwap}
                    disabled={!canSwap}
                    className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    {swapStep === "confirming" ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Confirm in Wallet...
                      </>
                    ) : swapStep === "pending" ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Swapping...
                      </>
                    ) : swapStep === "error" ? (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        Try Again
                      </>
                    ) : !isConnected ? (
                      "Connect Wallet First"
                    ) : !bnbAmount || parseFloat(bnbAmount) <= 0 ? (
                      "Enter BNB Amount"
                    ) : parseFloat(bnbAmount) > parseFloat(formattedBalance) ? (
                      "Insufficient BNB"
                    ) : (
                      "Swap BNB → BC400"
                    )}
                  </button>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-border bg-muted/20">
              <p className="text-[10px] text-muted-foreground text-center">
                Swap routed via PancakeSwap V2 on BNB Smart Chain. Prices are estimates and may change.
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default SwapModal;
