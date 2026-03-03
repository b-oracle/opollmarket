import { useState, useMemo } from "react";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import DepositWithdrawModal from "@/components/DepositWithdrawModal";
import { Wallet, Copy, ExternalLink, Gift, ArrowDownToLine, ArrowUpFromLine, ArrowUpRight, ArrowDownLeft, Repeat, TrendingUp, TrendingDown } from "lucide-react";
import { useAccount, useBalance } from "wagmi";
import { formatUnits } from "viem";
import { motion } from "framer-motion";

type TxType = "buy" | "sell" | "deposit" | "withdraw";

interface Transaction {
  id: string;
  type: TxType;
  market?: string;
  side?: "YES" | "NO";
  amount: number;
  price?: number;
  shares?: number;
  timestamp: Date;
  txHash: string;
  status: "confirmed" | "pending";
}

const mockTransactions: Transaction[] = [
  { id: "1", type: "buy", market: "BTC above $100k by June?", side: "YES", amount: 25, price: 0.62, shares: 40.32, timestamp: new Date(Date.now() - 1000 * 60 * 30), txHash: "0xabc...def1", status: "confirmed" },
  { id: "2", type: "deposit", amount: 100, timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), txHash: "0xabc...def2", status: "confirmed" },
  { id: "3", type: "sell", market: "ETH Merge successful?", side: "NO", amount: 18.5, price: 0.35, shares: 52.86, timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5), txHash: "0xabc...def3", status: "confirmed" },
  { id: "4", type: "buy", market: "Fed rate cut in March?", side: "YES", amount: 50, price: 0.78, shares: 64.1, timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24), txHash: "0xabc...def4", status: "confirmed" },
  { id: "5", type: "withdraw", amount: 45, timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48), txHash: "0xabc...def5", status: "confirmed" },
  { id: "6", type: "buy", market: "SOL flips BNB?", side: "NO", amount: 30, price: 0.45, shares: 66.67, timestamp: new Date(Date.now() - 1000 * 60 * 60 * 72), txHash: "0xabc...def6", status: "confirmed" },
];

const txConfig: Record<TxType, { icon: typeof ArrowUpRight; label: string; colorClass: string }> = {
  buy: { icon: ArrowDownLeft, label: "Buy", colorClass: "text-primary bg-primary/10" },
  sell: { icon: ArrowUpRight, label: "Sell", colorClass: "text-destructive bg-destructive/10" },
  deposit: { icon: ArrowDownToLine, label: "Deposit", colorClass: "text-primary bg-primary/10" },
  withdraw: { icon: ArrowUpFromLine, label: "Withdraw", colorClass: "text-muted-foreground bg-muted" },
};

const formatTimeAgo = (date: Date) => {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

type FilterType = "all" | "trades" | "deposits";

const Profile = () => {
  const { address, isConnected } = useAccount();
  const { data: balance } = useBalance({ address });
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<"deposit" | "withdraw">("deposit");
  const [txFilter, setTxFilter] = useState<FilterType>("all");

  const openDeposit = () => { setModalTab("deposit"); setModalOpen(true); };
  const openWithdraw = () => { setModalTab("withdraw"); setModalOpen(true); };

  const filteredTx = useMemo(() => {
    if (txFilter === "all") return mockTransactions;
    if (txFilter === "trades") return mockTransactions.filter(t => t.type === "buy" || t.type === "sell");
    return mockTransactions.filter(t => t.type === "deposit" || t.type === "withdraw");
  }, [txFilter]);

  return (
    <div className="min-h-dvh bg-background pb-20">
      <TopBar />
      <div className="max-w-lg mx-auto px-4 pt-20">
        {/* Avatar */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 rounded-full bg-primary/20 border-2 border-primary/30 flex items-center justify-center mb-3">
            {isConnected ? (
              <span className="text-2xl font-bold text-primary">
                {address?.slice(2, 4).toUpperCase()}
              </span>
            ) : (
              <Wallet className="w-8 h-8 text-primary" />
            )}
          </div>
          <h2 className="text-lg font-bold">
            {isConnected ? `${address?.slice(0, 6)}...${address?.slice(-4)}` : "Not Connected"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {isConnected
              ? `${balance ? `${parseFloat(formatUnits(balance.value, balance.decimals)).toFixed(4)} ${balance.symbol}` : "Loading..."}`
              : "Connect your wallet to view profile"}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: "Predictions", value: isConnected ? "0" : "—" },
            { label: "Win Rate", value: isConnected ? "0%" : "—" },
            { label: "PnL", value: isConnected ? "$0.00" : "—" },
          ].map(({ label, value }) => (
            <div key={label} className="glass rounded-xl p-3 text-center">
              <p className="text-lg font-bold">{value}</p>
              <p className="text-[10px] text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="space-y-3 mb-8">
          <button
            onClick={openDeposit}
            className="w-full glass rounded-xl p-4 flex items-center gap-3 hover:bg-accent/50 transition-colors active:scale-[0.98]"
          >
            <ArrowDownToLine className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium">Deposit Funds</span>
          </button>
          <button
            onClick={openWithdraw}
            className="w-full glass rounded-xl p-4 flex items-center gap-3 hover:bg-accent/50 transition-colors active:scale-[0.98]"
          >
            <ArrowUpFromLine className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium">Withdraw</span>
          </button>
          {[
            { icon: Gift, label: "Referral Program" },
            { icon: Copy, label: "Copy Referral Link" },
            { icon: ExternalLink, label: "View on BscScan", href: isConnected ? `https://bscscan.com/address/${address}` : undefined },
          ].map(({ icon: Icon, label, href }) => {
            const content = (
              <>
                <Icon className="w-5 h-5 text-primary" />
                <span className="text-sm font-medium">{label}</span>
              </>
            );

            if (href) {
              return (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full glass rounded-xl p-4 flex items-center gap-3 hover:bg-accent/50 transition-colors active:scale-[0.98]"
                >
                  {content}
                </a>
              );
            }

            return (
              <button
                key={label}
                className="w-full glass rounded-xl p-4 flex items-center gap-3 hover:bg-accent/50 transition-colors active:scale-[0.98]"
              >
                {content}
              </button>
            );
          })}
        </div>

        {/* Transaction History */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Transaction History
            </h3>
            <Repeat className="w-4 h-4 text-muted-foreground" />
          </div>

          {/* Filters */}
          <div className="flex gap-2 mb-4">
            {(["all", "trades", "deposits"] as FilterType[]).map((f) => (
              <button
                key={f}
                onClick={() => setTxFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize ${
                  txFilter === f
                    ? "bg-primary text-primary-foreground"
                    : "glass text-muted-foreground hover:text-foreground"
                }`}
              >
                {f === "deposits" ? "Deposits & Withdrawals" : f}
              </button>
            ))}
          </div>

          {/* Transaction List */}
          <div className="space-y-2">
            {filteredTx.map((tx, i) => {
              const cfg = txConfig[tx.type];
              const Icon = cfg.icon;

              return (
                <motion.div
                  key={tx.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="glass rounded-xl p-3.5 flex items-start gap-3"
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${cfg.colorClass}`}>
                    <Icon className="w-4 h-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{cfg.label}</span>
                        {tx.side && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            tx.side === "YES"
                              ? "bg-primary/15 text-primary"
                              : "bg-destructive/15 text-destructive"
                          }`}>
                            {tx.side}
                          </span>
                        )}
                      </div>
                      <span className={`text-sm font-bold ${
                        tx.type === "buy" || tx.type === "withdraw" ? "text-destructive" : "text-primary"
                      }`}>
                        {tx.type === "sell" || tx.type === "deposit" ? "+" : "-"}${tx.amount.toFixed(2)}
                      </span>
                    </div>

                    {tx.market && (
                      <p className="text-xs text-muted-foreground truncate mb-1">{tx.market}</p>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{formatTimeAgo(tx.timestamp)}</span>
                        {tx.price && <span>@ ${tx.price.toFixed(2)}</span>}
                        {tx.shares && <span>· {tx.shares.toFixed(1)} shares</span>}
                      </div>
                      <a
                        href={`https://bscscan.com/tx/${tx.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
                      >
                        {tx.txHash}
                      </a>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {filteredTx.length === 0 && (
            <div className="glass rounded-xl p-8 text-center">
              <p className="text-sm text-muted-foreground">No transactions found</p>
            </div>
          )}
        </div>
      </div>

      <DepositWithdrawModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initialTab={modalTab}
      />

      <BottomNav />
    </div>
  );
};

export default Profile;
