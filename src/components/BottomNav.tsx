import { useState } from "react";
import { Home, Compass, PlusCircle, LineChart, User, MoreHorizontal } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import MoreMenu from "@/components/MoreMenu";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";

const baseNavItems = [
  { icon: Home, label: "Home", path: "/", featureKey: null },
  { icon: Compass, label: "Feed", path: "/feed", featureKey: "feed" },
  { icon: PlusCircle, label: "Create", path: "/create", featureKey: "create_market" },
  { icon: LineChart, label: "Quick Trade", path: "/quick-trade", featureKey: "quick_trade" },
];

const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isFeatureEnabled } = useFeatureToggles();
  const [moreOpen, setMoreOpen] = useState(false);

  const filteredBase = baseNavItems.filter(
    (item) => !item.featureKey || isFeatureEnabled(item.featureKey)
  );
  const navItems = [
    ...filteredBase,
    user
      ? { icon: User, label: "Profile", path: "/profile", featureKey: null }
      : { icon: MoreHorizontal, label: "More", path: "__more__", featureKey: null },
  ];

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-[70] glass-strong border-0 shadow-[0_-1px_8px_-2px_hsl(var(--foreground)/0.08)] lg:hidden" style={{ paddingBottom: 'var(--safe-bottom)' }}>
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
          {navItems.map(({ icon: Icon, label, path }) => {
            const isActive = path !== "__more__" && location.pathname === path;
            const isCreate = path === "/create";
            const isMore = path === "__more__";

            return (
              <button
                key={path}
                onClick={() => {
                  if (isMore) {
                    setMoreOpen(true);
                  } else {
                    navigate(path);
                  }
                }}
                className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition-all ${
                  isCreate ? "relative -mt-4" : ""
                }`}
              >
                {isCreate ? (
                  <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-[0_0_20px_hsl(var(--neon-yes)/0.4)]">
                    <Icon className="w-6 h-6 text-primary-foreground" />
                  </div>
                ) : (
                  <Icon
                    className={`w-5 h-5 transition-colors ${
                      isActive ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                )}
                <span
                  className={`text-[10px] font-medium transition-colors ${
                    isActive ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
      <MoreMenu open={moreOpen} onOpenChange={setMoreOpen} />
    </>
  );
};

export default BottomNav;
