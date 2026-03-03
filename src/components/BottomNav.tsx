import { useState } from "react";
import { Home, Compass, PlusCircle, BarChart3, User, MoreHorizontal } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import MoreMenu from "@/components/MoreMenu";

const baseNavItems = [
  { icon: Home, label: "Home", path: "/" },
  { icon: Compass, label: "Feed", path: "/feed" },
  { icon: PlusCircle, label: "Create", path: "/create" },
  { icon: BarChart3, label: "Portfolio", path: "/portfolio" },
];

const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  const navItems = [
    ...baseNavItems,
    user
      ? { icon: User, label: "Profile", path: "/profile" }
      : { icon: MoreHorizontal, label: "More", path: "__more__" },
  ];

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 glass-strong" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
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
