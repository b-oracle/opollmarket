/**
 * Generate an optimized Supabase Storage URL with image transforms.
 * Only applies transforms to URLs from our own Supabase storage.
 * For external URLs, returns them unchanged.
 */

import { resolveAvatarUrl } from "@/lib/avatarUrl";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";

type ImageSize = "avatar-sm" | "avatar-md" | "avatar-lg" | "card" | "banner" | "thumb" | "story" | "feed";

const SIZE_PRESETS: Record<ImageSize, { width: number; height?: number; quality?: number; resize?: string }> = {
  "avatar-sm": { width: 48, height: 48, quality: 70, resize: "cover" },
  "avatar-md": { width: 80, height: 80, quality: 70, resize: "cover" },
  "avatar-lg": { width: 200, height: 200, quality: 75, resize: "cover" },
  card: { width: 600, quality: 75 },
  banner: { width: 800, quality: 75 },
  thumb: { width: 100, height: 100, quality: 65, resize: "cover" },
  story: { width: 600, quality: 75 },
  feed: { width: 900, quality: 70 },
};

/**
 * Transform a Supabase storage public URL to use image transforms.
 * @param url - The original public URL
 * @param size - A preset size name
 * @returns Transformed URL with width/quality params, or original URL if not from our storage
 */
export function optimizedImageUrl(url: string | null | undefined, size: ImageSize): string {
  if (!url) return "";

  // Fix NFT / IPFS URLs pointing at unreachable gateways
  url = resolveAvatarUrl(url);

  // Only transform our own Supabase storage URLs
  if (!SUPABASE_URL || !url.includes(SUPABASE_URL)) return url;

  
  // Replace /object/public/ with /render/image/public/ for transforms
  const preset = SIZE_PRESETS[size];
  const transformedUrl = url.replace(
    "/storage/v1/object/public/",
    "/storage/v1/render/image/public/"
  );
  
  const params = new URLSearchParams();
  params.set("width", String(preset.width));
  if (preset.height) params.set("height", String(preset.height));
  params.set("quality", String(preset.quality || 75));
  if (preset.resize) params.set("resize", preset.resize);
  
  const separator = transformedUrl.includes("?") ? "&" : "?";
  return `${transformedUrl}${separator}${params.toString()}`;
}

/**
 * Custom width/quality transform (for non-preset sizes).
 */
export function optimizedImageUrlCustom(
  url: string | null | undefined,
  width: number,
  quality = 75
): string {
  if (!url) return "";
  if (!SUPABASE_URL || !url.includes(SUPABASE_URL)) return url;
  
  const transformedUrl = url.replace(
    "/storage/v1/object/public/",
    "/storage/v1/render/image/public/"
  );
  
  const separator = transformedUrl.includes("?") ? "&" : "?";
  return `${transformedUrl}${separator}width=${width}&quality=${quality}`;
}
