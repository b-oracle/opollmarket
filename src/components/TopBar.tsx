import WalletButton from "@/components/WalletButton";
import ThemeToggle from "@/components/ThemeToggle";
import logo from "@/assets/logo.png";
import logoDark from "@/assets/logo-dark.png";
import { useTheme } from "next-themes";

const TopBar = () => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass-strong">
      <div className="flex items-center justify-between h-14 max-w-lg mx-auto px-4">
        {isDark ? (
          <div className="flex items-center gap-1.5">
            <img src={logoDark} alt="OPOLL" className="h-8 w-8" />
            <span className="text-lg font-bold tracking-tight" style={{ color: 'hsl(193, 98%, 50%)' }}>Poll</span>
          </div>
        ) : (
          <img src={logo} alt="OPOLL" className="h-8" />
        )}
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <WalletButton />
      </div>
    </div>
  </header>
);

export default TopBar;
