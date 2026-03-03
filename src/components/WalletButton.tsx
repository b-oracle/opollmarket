import { Wallet } from "lucide-react";
import { useState } from "react";

const WalletButton = () => {
  const [connected, setConnected] = useState(false);

  return (
    <button
      onClick={() => setConnected(!connected)}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95 ${
        connected
          ? "glass text-primary border border-primary/20"
          : "bg-primary text-primary-foreground shadow-[0_0_20px_hsl(var(--neon-yes)/0.3)]"
      }`}
    >
      <Wallet className="w-4 h-4" />
      {connected ? "0x1a2b...3c4d" : "Connect"}
    </button>
  );
};

export default WalletButton;
