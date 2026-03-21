import { Radio } from "lucide-react";

interface LiveAvatarBadgeProps {
  isLive: boolean;
  size?: "sm" | "md";
}

/**
 * A small pulsing red "LIVE" indicator overlaid on an avatar.
 */
const LiveAvatarBadge = ({ isLive, size = "sm" }: LiveAvatarBadgeProps) => {
  if (!isLive) return null;

  const dim = size === "md" ? "w-5 h-5" : "w-4 h-4";
  const iconSize = size === "md" ? "w-2.5 h-2.5" : "w-2 h-2";

  return (
    <div className={`absolute -top-0.5 -left-0.5 ${dim} rounded-full bg-destructive flex items-center justify-center z-10 ring-2 ring-background`}>
      <Radio className={`${iconSize} text-destructive-foreground animate-pulse`} />
    </div>
  );
};

export default LiveAvatarBadge;
