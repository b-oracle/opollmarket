/**
 * Tiered verification badge.
 * - "blue" = holds NFT OR 10M+ BC400 tokens (one of them)
 * - "gold" = holds BOTH NFT AND 100M+ BC400 tokens
 * - Falls back to checking avatar URL if no level provided (legacy)
 */
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CheckCircle, Coins, Image } from "lucide-react";

export type VerificationLevel = "none" | "blue" | "gold";

export const isNftAvatar = (avatarUrl: string | null | undefined): boolean =>
  !!avatarUrl && !avatarUrl.includes("/storage/v1/");

/** Verified tick – mirrors the X (Twitter) badge shape */
const VerifiedTick = ({ size = 16, color = "gold" }: { size?: number; color?: "gold" | "blue" }) => {
  const gradientId = color === "gold" ? "gold-grad" : "blue-grad";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Verified"
    >
      <path
        d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81C14.67 2.63 13.43 1.75 12 1.75S9.33 2.63 8.66 3.94c-1.39-.46-2.9-.2-3.91.81s-1.27 2.52-.81 3.91C2.63 9.33 1.75 10.57 1.75 12s.88 2.67 2.19 3.34c-.46 1.39-.2 2.9.81 3.91s2.52 1.27 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.67-.88 3.34-2.19c1.39.46 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34Z"
        fill={`url(#${gradientId})`}
      />
      <path
        d="M9.726 15.39a.75.75 0 0 1-.53-.22l-2.72-2.72a.75.75 0 1 1 1.06-1.06l2.19 2.19 4.99-4.99a.75.75 0 1 1 1.06 1.06l-5.52 5.52a.75.75 0 0 1-.53.22Z"
        fill="#fff"
      />
      <defs>
        <linearGradient id="gold-grad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F7D86C" />
          <stop offset="0.5" stopColor="#E8B730" />
          <stop offset="1" stopColor="#C6951B" />
        </linearGradient>
        <linearGradient id="blue-grad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#60A5FA" />
          <stop offset="0.5" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#2563EB" />
        </linearGradient>
      </defs>
    </svg>
  );
};

interface NftBadgeProps {
  className?: string;
  size?: number;
  level?: VerificationLevel;
}

const NftBadge = ({ className = "", size = 16, level }: NftBadgeProps) => {
  const effectiveLevel = level || "gold"; // legacy fallback
  if (effectiveLevel === "none") return null;

  const color = effectiveLevel === "gold" ? "gold" : "blue";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center cursor-pointer ${className}`}
          aria-label={effectiveLevel === "gold" ? "Gold Verified" : "Blue Verified"}
        >
          <VerifiedTick size={size} color={color} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        className="w-64 p-3 text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        {effectiveLevel === "gold" ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <VerifiedTick size={20} color="gold" />
              <span className="font-bold text-sm">Gold Verified</span>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              This user meets <span className="font-semibold text-foreground">both</span> requirements:
            </p>
            <ul className="space-y-1.5">
              <li className="flex items-start gap-1.5">
                <Image className="w-3.5 h-3.5 mt-0.5 text-amber-500 shrink-0" />
                <span>Holds a BC400 NFT <span className="text-muted-foreground">&</span> uses it as their profile avatar</span>
              </li>
              <li className="flex items-start gap-1.5">
                <Coins className="w-3.5 h-3.5 mt-0.5 text-amber-500 shrink-0" />
                <span>Holds the required BC400 tokens for Gold tier</span>
              </li>
            </ul>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <VerifiedTick size={20} color="blue" />
              <span className="font-bold text-sm">Blue Verified</span>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              This user meets <span className="font-semibold text-foreground">at least one</span> requirement:
            </p>
            <ul className="space-y-1.5">
              <li className="flex items-start gap-1.5">
                <Coins className="w-3.5 h-3.5 mt-0.5 text-blue-500 shrink-0" />
                <span>Holds the required BC400 tokens for Blue tier</span>
              </li>
              <li className="flex items-start gap-1.5">
                <Image className="w-3.5 h-3.5 mt-0.5 text-blue-500 shrink-0" />
                <span>Holds a BC400 NFT & uses it as their profile avatar</span>
              </li>
            </ul>
          </div>
        )}
        <div className="mt-2 pt-2 border-t border-border">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <CheckCircle className="w-3 h-3" /> Verified holders get trending boosts & revenue sharing
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default NftBadge;
