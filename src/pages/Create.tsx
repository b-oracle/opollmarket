import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { Lock } from "lucide-react";

const Create = () => (
  <div className="min-h-dvh bg-background pb-20">
    <TopBar />
    <div className="max-w-lg mx-auto px-4 pt-20 flex flex-col items-center justify-center min-h-[60dvh]">
      <div className="glass rounded-2xl p-8 text-center max-w-sm">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Lock className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-bold mb-2">Token Gated</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Hold OPOLL tokens or an approved NFT to create prediction markets and earn creator revenue.
        </p>
        <button className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-semibold transition-all active:scale-95">
          Connect Wallet to Verify
        </button>
      </div>
    </div>
    <BottomNav />
  </div>
);

export default Create;
