import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Radio } from "lucide-react";
import { useLiveSpacesCount } from "@/hooks/useLiveSpacesCount";
import { useActiveSpace } from "@/hooks/useActiveSpace";
import { useSpaceReplay } from "@/hooks/useSpaceReplay";
import { useAuth } from "@/hooks/useAuth";

const HIDDEN_PREFIXES = ["/admin", "/business", "/embed", "/auth", "/setup-security", "/reset-password", "/forgot-password", "/maintenance"];

const LiveSpaceFloatingButton = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: liveCount = 0 } = useLiveSpacesCount();
  const { activeSpace } = useActiveSpace();
  const { space: replaySpace } = useSpaceReplay();

  // Hide on excluded routes
  const onExcludedRoute = HIDDEN_PREFIXES.some((p) => location.pathname.startsWith(p));

  // Hide if user is on the spaces tab of their own profile, or on the social/spaces context
  const params = new URLSearchParams(location.search);
  const isOnSpacesTab =
    (location.pathname.startsWith("/user/") && params.get("tab") === "spaces") ||
    (location.pathname === "/feed" && params.get("tab") === "spaces");

  const shouldShow =
    !!user &&
    liveCount > 0 &&
    !activeSpace &&
    !replaySpace &&
    !onExcludedRoute &&
    !isOnSpacesTab;

  const handleClick = () => {
    if (user) {
      navigate(`/user/${user.id}?tab=spaces`);
    } else {
      navigate("/feed?tab=spaces");
    }
  };

  const displayCount = liveCount > 9 ? "9+" : String(liveCount);

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.button
          key="live-space-fab"
          type="button"
          aria-label={`Join live Space (${liveCount} active)`}
          onClick={handleClick}
          initial={{ opacity: 0, scale: 0.6, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.6, y: 20 }}
          whileTap={{ scale: 0.92 }}
          transition={{ type: "spring", damping: 18, stiffness: 260 }}
          className="fixed bottom-24 right-4 lg:bottom-6 lg:right-6 z-[65] w-14 h-14 rounded-full flex items-center justify-center shadow-xl shadow-destructive/30"
          style={{
            background: "linear-gradient(135deg, hsl(var(--destructive)), hsl(var(--primary)))",
          }}
        >
          {/* Pulsing halo rings */}
          <span className="absolute inset-0 rounded-full bg-destructive/40 animate-ping" />
          <span className="absolute -inset-1 rounded-full border-2 border-destructive/50 animate-pulse" />

          {/* Icon */}
          <span className="relative flex items-center justify-center w-full h-full rounded-full">
            <Radio className="w-6 h-6 text-white" strokeWidth={2.5} />
          </span>

          {/* LIVE dot */}
          <span className="absolute top-1 left-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-background/90 backdrop-blur-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
            <span className="text-[7px] font-extrabold tracking-wide text-destructive">LIVE</span>
          </span>

          {/* Count badge */}
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full bg-background border-2 border-destructive flex items-center justify-center text-[10px] font-bold text-destructive">
            {displayCount}
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  );
};

export default LiveSpaceFloatingButton;
