import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { Wallet, Copy, ExternalLink, Gift } from "lucide-react";

const Profile = () => (
  <div className="min-h-dvh bg-background pb-20">
    <TopBar />
    <div className="max-w-lg mx-auto px-4 pt-20">
      {/* Avatar */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-20 h-20 rounded-full bg-primary/20 border-2 border-primary/30 flex items-center justify-center mb-3">
          <Wallet className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-lg font-bold">Not Connected</h2>
        <p className="text-xs text-muted-foreground">Connect your wallet to view profile</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Predictions", value: "—" },
          { label: "Win Rate", value: "—" },
          { label: "PnL", value: "—" },
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
          { icon: Wallet, label: "Deposit Funds" },
          { icon: ExternalLink, label: "Withdraw" },
          { icon: Gift, label: "Referral Program" },
          { icon: Copy, label: "Copy Referral Link" },
        ].map(({ icon: Icon, label }) => (
          <button
            key={label}
            className="w-full glass rounded-xl p-4 flex items-center gap-3 hover:bg-accent/50 transition-colors active:scale-[0.98]"
          >
            <Icon className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium">{label}</span>
          </button>
        ))}
      </div>
    </div>
    <BottomNav />
  </div>
);

export default Profile;
