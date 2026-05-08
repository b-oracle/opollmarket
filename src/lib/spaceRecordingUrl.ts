import { supabase } from "@/integrations/supabase/client";

const BUCKET = "space-recordings";
// 7 days — max allowed for signed URLs
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

/**
 * Extract the storage path inside the `space-recordings` bucket from any of:
 *   - a bare path:                 "userId/space-xxx-123.webm"
 *   - a public URL:                ".../storage/v1/object/public/space-recordings/userId/file.webm"
 *   - a signed URL:                ".../storage/v1/object/sign/space-recordings/userId/file.webm?token=..."
 */
export function extractRecordingPath(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const marker = `/${BUCKET}/`;
  const idx = stored.indexOf(marker);
  if (idx >= 0) {
    const after = stored.slice(idx + marker.length);
    return after.split("?")[0];
  }
  // Treat as a bare path already
  return stored.replace(/^\/+/, "").split("?")[0];
}

/**
 * Resolve any stored recording reference to a fresh signed URL the browser can play.
 * The bucket is private, so public URLs returned by older code paths will not work
 * — we always re-sign from the path.
 */
export async function getPlayableRecordingUrl(stored: string | null | undefined): Promise<string | null> {
  const path = extractRecordingPath(stored);
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) {
    console.error("[spaceRecordingUrl] Failed to sign recording URL:", error.message, path);
    return null;
  }
  return data?.signedUrl ?? null;
}
