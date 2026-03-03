import WalletButton from "@/components/WalletButton";
import ThemeToggle from "@/components/ThemeToggle";

const TopBar = () => (
  <header className="fixed top-0 left-0 right-0 z-50 glass-strong">
    <div className="flex items-center justify-between h-14 max-w-lg mx-auto px-4">
      <h1 className="text-lg font-bold tracking-tight">
        <span className="text-primary">O</span>POLL
      </h1>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <WalletButton />
      </div>
    </div>
  </header>
);

export default TopBar;
