import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Safely compute avatar initials from a display name.
 * - Returns "?" (or custom fallback) for empty/missing names.
 * - With maxChars: 2, returns initials of first + last word, or first 2 letters
 *   of a single word. Strips emoji/symbol noise so we get real letters.
 */
export function getAvatarInitials(
  name: string | null | undefined,
  { fallback = "?", maxChars = 1 }: { fallback?: string; maxChars?: 1 | 2 } = {}
): string {
  const cleaned = (name || "")
    .replace(/[^\p{L}\p{N}\s'-]/gu, "")
    .trim();
  if (!cleaned) return fallback;

  if (maxChars === 2) {
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const first = parts[0].charAt(0);
      const last = parts[parts.length - 1].charAt(0);
      return (first + last).toUpperCase() || fallback;
    }
    const word = parts[0] || "";
    return (word.length >= 2 ? word.slice(0, 2) : word.charAt(0)).toUpperCase() || fallback;
  }

  return cleaned.charAt(0).toUpperCase() || fallback;
}
