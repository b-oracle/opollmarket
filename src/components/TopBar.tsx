import WalletButton from "@/components/WalletButton";
import ThemeToggle from "@/components/ThemeToggle";
import logo from "@/assets/logo.png";

const TopBar = () => (
  <header className="fixed top-0 left-0 right-0 z-50 glass-strong">
    <div className="flex items-center justify-between h-14 max-w-lg mx-auto px-4">
      <img src={logo} alt="OPOLL" className="h-8" />
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <WalletButton />
      </div>
    </div>
  </header>
);

export default TopBar;
