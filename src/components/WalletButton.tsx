import { useAppKit } from "@reown/appkit/react";
import { useAccount, useDisconnect, useBalance } from "wagmi";
import { Wallet, LogOut, ChevronDown, Copy, Check, ExternalLink, X, Smartphone } from "lucide-react";
import { useState, useEffect } from "react";
import { formatUnits } from "viem";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

const truncateAddress = (addr: string) =>
  `${addr.slice(0, 6)}...${addr.slice(-4)}`;

const isNormalMobileBrowser = () => {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const isMobile = /iPhone|iPad|Android|Mobile/i.test(ua);
  const w = window as any;
  const hasInjected = !!(w.ethereum || w.BinanceChain || w.rabby);
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

  // Clear connection timeout when wallet connects
  useEffect(() => {
    if (isConnected) {
      (window as any).__walletConnected = true;
      const tid = (window as any).__walletConnectTimeout;
      if (tid) {
        clearTimeout(tid);
        delete (window as any).__walletConnectTimeout;
      }
    } else {
      (window as any).__walletConnected = false;
    }
  }, [isConnected]);

  const handleConnect = () => {
    const alreadyShown = sessionStorage.getItem("dapp_hint_shown");
    if (isNormalMobileBrowser() && !alreadyShown) {
      setShowHint(true);
      sessionStorage.setItem("dapp_hint_shown", "1");
    }
    open();

    // Start a 15s timeout – if still not connected, show troubleshooting toast
    const timeoutId = setTimeout(() => {
      // Re-check connection status at timeout time
      if (!(window as any).__walletConnected) {
        toast.error("Wallet connection timed out", {
          description: "Try: 1) Open this site inside your wallet's built-in browser, 2) Use the QR code option, or 3) Refresh and retry.",
          duration: 12000,
        });
      }
    }, 15000);

    // Store timeout so we can clear it on successful connect
    (window as any).__walletConnectTimeout = timeoutId;
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
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 40 40" fill="none"><path d="M37.5 2.5L22.2 13.8l2.8-6.7L37.5 2.5z" fill="#E2761B" stroke="#E2761B" strokeLinecap="round" strokeLinejoin="round"/><path d="M2.5 2.5l15.1 11.5-2.6-6.9L2.5 2.5zM32.1 28.6l-4.1 6.2 8.7 2.4 2.5-8.5-7.1-.1zM.9 28.7l2.5 8.5 8.7-2.4-4.1-6.2-7.1.1z" fill="#E4761B" stroke="#E4761B" strokeLinecap="round" strokeLinejoin="round"/><path d="M11.7 17.4l-2.4 3.7 8.6.4-.3-9.3-5.9 5.2zM28.3 17.4l-6-5.3-.2 9.4 8.6-.4-2.4-3.7zM12.1 34.8l5.2-2.5-4.5-3.5-.7 6zM22.7 32.3l5.2 2.5-.7-6-4.5 3.5z" fill="#E4761B" stroke="#E4761B" strokeLinecap="round" strokeLinejoin="round"/><path d="M27.9 34.8l-5.2-2.5.4 3.4v1.4l4.8-2.3zM12.1 34.8l4.8 2.3v-1.4l.4-3.4-5.2 2.5z" fill="#D7C1B3" stroke="#D7C1B3" strokeLinecap="round" strokeLinejoin="round"/><path d="M17 26.6l-4.3-1.3 3.1-1.4 1.2 2.7zM23 26.6l1.2-2.7 3.1 1.4-4.3 1.3z" fill="#233447" stroke="#233447" strokeLinecap="round" strokeLinejoin="round"/><path d="M12.1 34.8l.7-6.2-4.8.1 4.1 6.1zM27.2 28.6l.7 6.2 4.1-6.1-4.8-.1zM30.7 21.1l-8.6.4.8 4.1 1.2-2.7 3.1 1.4 3.5-3.2zM12.7 25.3l3.1-1.4 1.2 2.7.8-4.1-8.6-.4 3.5 3.2z" fill="#CD6116" stroke="#CD6116" strokeLinecap="round" strokeLinejoin="round"/><path d="M9.2 21.1l3.6 7-.1-3.8-3.5-3.2zM27.2 24.3l-.1 3.8 3.6-7-3.5 3.2zM17.8 21.5l-.8 4.1 1 5.2.2-6.9-.4-2.4zM22.1 21.5l-.4 2.4.2 6.9 1-5.2-.8-4.1z" fill="#E4751F" stroke="#E4751F" strokeLinecap="round" strokeLinejoin="round"/><path d="M22.9 25.6l-1 5.2.7.5 4.5-3.5.1-3.8-4.3 1.6zM12.7 24l.1 3.8 4.5 3.5.7-.5-1-5.2-4.3-1.6z" fill="#F6851B" stroke="#F6851B" strokeLinecap="round" strokeLinejoin="round"/><path d="M23 37.1v-1.4l-.4-.3h-5.2l-.4.3v1.4L12.1 34.8l1.7 1.4 3.4 2.4h5.3l3.4-2.4 1.7-1.4-4.6 2.3z" fill="#C0AD9E" stroke="#C0AD9E" strokeLinecap="round" strokeLinejoin="round"/><path d="M22.7 32.3l-.7-.5h-4l-.7.5-.4 3.4.4-.3h5.2l.4.3-.2-3.4z" fill="#161616" stroke="#161616" strokeLinecap="round" strokeLinejoin="round"/><path d="M38.1 14.5l1.3-6.3L37.5 2.5 22.7 13.4l5.6 4.7 7.9 2.3 1.7-2-.7-.5 1.2-1.1-.9-.7 1.2-.9-.8-.7zM.6 8.2l1.3 6.3-.8.6 1.2.9-.9.7 1.2 1.1-.7.5 1.7 2 7.9-2.3 5.6-4.7L2.5 2.5.6 8.2z" fill="#763D16" stroke="#763D16" strokeLinecap="round" strokeLinejoin="round"/><path d="M36.2 20.4l-7.9-2.3 2.4 3.7-3.6 7 4.7-.1h7.1l-2.7-8.3zM11.7 18.1l-7.9 2.3-2.6 8.3h7.1l4.7.1-3.6-7 2.3-3.7zM22.1 21.5l.5-8.8 2.3-6.2H15l2.3 6.2.5 8.8.2 2.4v6.9h4l.1-6.9.1-2.4z" fill="#F6851B" stroke="#F6851B" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Open in MetaMask
                </a>
                <a
                  href={`https://link.trustwallet.com/open_url?coin_id=20000714&url=${encodeURIComponent(window.location.href)}`}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/50 hover:bg-accent transition-colors text-xs font-medium text-foreground"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 40 40" fill="none"><path d="M20 4C11.7 4 5 10.4 5 18.7c0 5.3 8 15.7 12.8 20.2a3.2 3.2 0 004.4 0C27 34.4 35 24 35 18.7 35 10.4 28.3 4 20 4z" fill="#3375BB"/><path d="M20 8.5c-5.3 0-9.5 4.2-9.5 9.5 0 3.5 5 10.5 8.2 13.8a1.8 1.8 0 002.6 0c3.2-3.3 8.2-10.3 8.2-13.8 0-5.3-4.2-9.5-9.5-9.5z" fill="white"/><path d="M20 12l-5.5 3v6.5c0 3.2 2.3 6.2 5.5 7 3.2-.8 5.5-3.8 5.5-7V15L20 12z" fill="#3375BB"/></svg>
                  Open in Trust Wallet
                </a>
                <a
                  href={`https://safepal.com/dapp?url=${encodeURIComponent(window.location.href)}`}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/50 hover:bg-accent transition-colors text-xs font-medium text-foreground"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 40 40" fill="none"><rect width="40" height="40" rx="8" fill="#4A21EF"/><path d="M20 8l-9 5v9c0 5.5 3.8 10.6 9 12 5.2-1.4 9-6.5 9-12v-9l-9-5z" fill="white"/><path d="M20 12.5l-5.5 3v5.5c0 3.4 2.3 6.5 5.5 7.3 3.2-.8 5.5-3.9 5.5-7.3v-5.5l-5.5-3z" fill="#4A21EF"/></svg>
                  Open in SafePal
                </a>
                <a
                  href={`https://app.binance.com/cedefi/dapp-browser?url=${encodeURIComponent(window.location.href)}`}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/50 hover:bg-accent transition-colors text-xs font-medium text-foreground"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 40 40" fill="none"><rect width="40" height="40" rx="8" fill="#F0B90B"/><path d="M20 8l-3.5 3.5 7.5 7.5-3.5 3.5L20 23.5l-7.5-7.5L9 19.5 20 30.5l11-11L20 8zM12.5 19.5L9 23l3.5 3.5L16 23l-3.5-3.5zM27.5 19.5L24 23l3.5 3.5L31 23l-3.5-3.5z" fill="white"/></svg>
                  Open in Binance
                </a>
                <a
                  href={`https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(window.location.href)}`}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/50 hover:bg-accent transition-colors text-xs font-medium text-foreground"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 40 40" fill="none"><rect width="40" height="40" rx="0" fill="#0052FF"/><rect x="10" y="10" width="20" height="20" rx="4" fill="white"/><rect x="15" y="17" width="4" height="6" rx="1" fill="#0052FF"/><rect x="21" y="17" width="4" height="6" rx="1" fill="#0052FF"/></svg>
                  Open in Coinbase Wallet
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
