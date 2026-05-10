import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Safely compute avatar initials from a display name.
 * Returns uppercase initial(s) with a sensible fallback.
 */
export function getAvatarInitials(
  name: string | null | undefined,
  { fallback = "?", maxChars = 1 }: { fallback?: string; maxChars?: 1 | 2 } = {}
): string {
  const cleaned = (name || "").trim();
  if (!cleaned) return fallback;

  if (maxChars === 2) {
    const parts = cleaned.split(/\s+/);
    const first = parts[0]?.charAt(0) ?? "";
    const second = parts[1]?.charAt(0) ?? "";
    return (first + second).toUpperCase() || fallback;
  }

  return cleaned.charAt(0).toUpperCase() || fallback;
}
