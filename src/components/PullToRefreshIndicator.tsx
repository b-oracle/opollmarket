import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

interface PullToRefreshIndicatorProps {
  pulling: boolean;
  refreshing: boolean;
  pullDistance: number;
  pullProgress: number;
  spinControls: ReturnType<typeof import("framer-motion").useAnimation>;
}

const PullToRefreshIndicator = ({
  pulling,
  refreshing,
  pullDistance,
  pullProgress,
  spinControls,
}: PullToRefreshIndicatorProps) => (
  <motion.div
    className="fixed left-0 right-0 z-40 flex items-center justify-center pointer-events-none"
    style={{ top: 'var(--content-top)' }}
    initial={{ opacity: 0, y: -20 }}
    animate={{
      opacity: pulling || refreshing ? 1 : 0,
      y: pulling || refreshing ? pullDistance * 0.3 : -20,
    }}
    transition={{ type: "spring", stiffness: 300, damping: 30 }}
  >
    <div className="flex items-center gap-2 px-4 py-2 rounded-full glass-strong">
      <motion.div
        animate={refreshing ? spinControls : { rotate: pullProgress * 180 }}
        transition={{ type: "tween", duration: 0 }}
      >
        <Loader2 className="w-4 h-4 text-primary" />
      </motion.div>
      <span className="text-xs font-medium text-muted-foreground">
        {refreshing ? "Refreshing…" : pullProgress >= 1 ? "Release to refresh" : "Pull to refresh"}
      </span>
    </div>
  </motion.div>
);

export default PullToRefreshIndicator;
