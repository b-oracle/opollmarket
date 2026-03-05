import { useAppKit } from "@reown/appkit/react";
import { useAccount, useDisconnect, useBalance } from "wagmi";
import { Wallet, LogOut, ChevronDown, Copy, Check, ExternalLink, X, Smartphone } from "lucide-react";
import { useState, useEffect } from "react";
import { formatUnits } from "viem";
import { motion, AnimatePresence } from "framer-motion";

const truncateAddress = (addr: string) =>
  `${addr.slice(0, 6)}...${addr.slice(-4)}`;

const isNormalMobileBrowser = () => {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const isMobile = /iPhone|iPad|Android|Mobile/i.test(ua);
  const hasInjected = !!(window as any).ethereum;
  return isMobile && !hasInjected;
};

const WalletButton = () => {
  const { open } = useAppKit();
  const { address, isConnected, connector } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({ address });
  const [showDropdown, setShowDropdown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (!showHint) return;
    const timer = setTimeout(() => setShowHint(false), 10000);
    return () => clearTimeout(timer);
  }, [showHint]);

  const handleConnect = () => {
    const alreadyShown = sessionStorage.getItem("dapp_hint_shown");
    if (isNormalMobileBrowser() && !alreadyShown) {
      setShowHint(true);
      sessionStorage.setItem("dapp_hint_shown", "1");
    }
    open();
  };

  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isConnected) {
    return (
      <div className="relative">
        <button
          onClick={handleConnect}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-primary-foreground shadow-[0_0_20px_hsl(var(--neon-yes)/0.3)] transition-all active:scale-95"
        >
          <Wallet className="w-4 h-4" />
          Connect
        </button>

        <AnimatePresence>
          {showHint && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              className="absolute right-0 top-12 w-80 z-50 rounded-xl border border-primary/20 bg-card p-3 shadow-lg"
            >
              <button
                onClick={() => setShowHint(false)}
                className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <div className="flex items-start gap-2.5 pr-4 mb-3">
                <Smartphone className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  For the best experience, open this site in your wallet's built-in browser.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <a
                  href={`https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}`}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/50 hover:bg-accent transition-colors text-xs font-medium text-foreground"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-primary" />
                  Open in MetaMask
                </a>
                <a
                  href={`https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(window.location.href)}`}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/50 hover:bg-accent transition-colors text-xs font-medium text-foreground"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-primary" />
                  Open in Trust Wallet
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
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
