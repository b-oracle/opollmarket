import { useAppKit } from "@reown/appkit/react";
import { useAccount, useDisconnect, useBalance } from "wagmi";
import { Wallet, LogOut, ChevronDown, Copy, Check, ExternalLink } from "lucide-react";
import { useState } from "react";
import { formatUnits } from "viem";
import { motion, AnimatePresence } from "framer-motion";

const truncateAddress = (addr: string) =>
  `${addr.slice(0, 6)}...${addr.slice(-4)}`;

const WalletButton = () => {
  const { open } = useAppKit();
  const { address, isConnected, connector } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({ address });
  const [showDropdown, setShowDropdown] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isConnected) {
    return (
      <button
        onClick={() => open()}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-primary-foreground shadow-[0_0_20px_hsl(var(--neon-yes)/0.3)] transition-all active:scale-95"
      >
        <Wallet className="w-4 h-4" />
        Connect
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold glass border border-primary/20 text-primary transition-all active:scale-95"
      >
        <div className="w-2 h-2 rounded-full bg-primary animate-pulse-glow" />
        <span>{truncateAddress(address!)}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showDropdown ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {showDropdown && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            className="absolute right-0 top-12 w-64 glass-strong rounded-xl p-3 z-50"
          >
            <div className="mb-3 px-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Balance</p>
              <p className="text-lg font-bold">
                {balance ? `${parseFloat(formatUnits(balance.value, balance.decimals)).toFixed(4)} ${balance.symbol}` : "Loading..."}
              </p>
            </div>

            <div className="mb-3 px-1">
              <p className="text-[10px] text-muted-foreground">
                Connected via {connector?.name || "Unknown"}
              </p>
            </div>

            <div className="border-t border-border pt-2 space-y-1">
              <button
                onClick={copyAddress}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent/50 transition-colors text-sm"
              >
                {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
                {copied ? "Copied!" : "Copy Address"}
              </button>

              <a
                href={`https://bscscan.com/address/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent/50 transition-colors text-sm"
              >
                <ExternalLink className="w-4 h-4" />
                View on BscScan
              </a>

              <button
                onClick={() => {
                  disconnect();
                  setShowDropdown(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-destructive/10 transition-colors text-sm text-destructive"
              >
                <LogOut className="w-4 h-4" />
                Disconnect
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default WalletButton;
