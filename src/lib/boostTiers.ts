import { Zap, Flame, Crown, type LucideIcon } from "lucide-react";

export interface BoostTierConfig {
  color: string;       // raw HSL string for inline styles
  label: string;
  icon: LucideIcon;
  glowShadow: string;  // box-shadow value
  ringClass: string;    // border/ring color (inline style)
  bgTint: string;       // subtle background tint (inline style)
}

const TIER_MAP: Record<string, BoostTierConfig> = {
  flash: {
    color: "hsl(var(--primary))",
    label: "Flash Boost",
    icon: Zap,
    glowShadow: "0 0 12px hsl(var(--primary) / 0.5)",
    ringClass: "hsl(var(--primary) / 0.35)",
    bgTint: "hsl(var(--primary) / 0.06)",
  },
  standard: {
    color: "hsl(280, 70%, 60%)",
    label: "Standard",
    icon: Flame,
    glowShadow: "0 0 12px hsl(280 70% 60% / 0.5)",
    ringClass: "hsl(280 70% 60% / 0.35)",
    bgTint: "hsl(280 70% 60% / 0.06)",
  },
  whale: {
    color: "hsl(45, 93%, 58%)",
    label: "Whale Pin",
    icon: Crown,
    glowShadow: "0 0 12px hsl(45 93% 58% / 0.5)",
    ringClass: "hsl(45 93% 58% / 0.35)",
    bgTint: "hsl(45 93% 58% / 0.06)",
  },
};

export const getBoostTierConfig = (tier?: string): BoostTierConfig => {
  return TIER_MAP[tier || "flash"] || TIER_MAP.flash;
};
