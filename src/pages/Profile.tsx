import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { Wallet, Copy, ExternalLink, Gift, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { useAccount, useBalance } from "wagmi";

const Profile = () => {
  const { address, isConnected } = useAccount();
  const { data: balance } = useBalance({ address });

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
              ? `${balance ? `${parseFloat(balance.formatted).toFixed(4)} ${balance.symbol}` : "Loading..."}`
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
        <div className="space-y-3">
          {[
            { icon: ArrowDownToLine, label: "Deposit Funds" },
            { icon: ArrowUpFromLine, label: "Withdraw" },
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
      </div>
      <BottomNav />
    </div>
  );
};

export default Profile;
