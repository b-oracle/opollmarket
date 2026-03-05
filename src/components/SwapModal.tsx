import { useState } from "react";
import { X, ExternalLink, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface SwapModalProps {
  open: boolean;
  onClose: () => void;
  tokenContractAddress: string;
}

const SwapModal = ({ open, onClose, tokenContractAddress }: SwapModalProps) => {
  const [loading, setLoading] = useState(true);

  const swapUrl = tokenContractAddress
    ? `https://pancakeswap.finance/swap?outputCurrency=${tokenContractAddress}&chain=bsc`
    : "https://pancakeswap.finance/swap?chain=bsc";

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-background/80 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.97 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-x-3 top-[5vh] bottom-[5vh] z-[71] mx-auto max-w-lg flex flex-col bg-card border border-border rounded-2xl overflow-hidden shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
              <div className="flex items-center gap-2">
                <img
                  src="https://pancakeswap.finance/favicon.ico"
                  alt="PancakeSwap"
                  className="w-5 h-5 rounded"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <h3 className="text-sm font-bold text-foreground">Buy BC400 — PancakeSwap</h3>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={swapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  title="Open in new tab"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Loading state */}
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-card z-10 mt-12">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Loading PancakeSwap...</p>
                </div>
              </div>
            )}

            {/* PancakeSwap iframe */}
            <iframe
              src={swapUrl}
              className="flex-1 w-full border-0"
              title="PancakeSwap Swap"
              onLoad={() => setLoading(false)}
              allow="clipboard-write"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-top-navigation"
            />

            {/* Footer hint */}
            <div className="px-4 py-2 border-t border-border bg-muted/30 shrink-0">
              <p className="text-[10px] text-muted-foreground text-center">
                Swap powered by PancakeSwap. Connect your wallet inside the widget to trade.
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default SwapModal;
