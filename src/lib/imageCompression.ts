import imageCompression from "browser-image-compression";

type ImagePreset = "market-banner" | "avatar" | "social";

const PRESETS: Record<ImagePreset, { maxWidthOrHeight: number; initialQuality: number }> = {
  "market-banner": { maxWidthOrHeight: 800, initialQuality: 0.7 },
  avatar: { maxWidthOrHeight: 200, initialQuality: 0.7 },
  social: { maxWidthOrHeight: 600, initialQuality: 0.7 },
};

/**
 * Compress and convert an image to WebP before upload.
 * Falls back to original file on error.
 */
export async function compressImage(file: File, preset: ImagePreset): Promise<File> {
  try {
    const opts = PRESETS[preset];
    // Try WebP first
    const compressed = await imageCompression(file, {
      maxWidthOrHeight: opts.maxWidthOrHeight,
      initialQuality: opts.initialQuality,
      fileType: "image/webp",
      useWebWorker: true,
    });
    // Verify it actually produced something
    if (compressed && compressed.size > 0) {
      const name = file.name.replace(/\.[^.]+$/, ".webp");
      return new File([compressed], name, { type: "image/webp" });
    }
    throw new Error("Compression produced empty file");
  } catch (err) {
    console.warn("WebP compression failed, trying JPEG fallback:", err);
    try {
      // Fallback to JPEG which has wider device support
      const opts = PRESETS[preset];
      const compressed = await imageCompression(file, {
        maxWidthOrHeight: opts.maxWidthOrHeight,
        initialQuality: opts.initialQuality,
        fileType: "image/jpeg",
        useWebWorker: true,
      });
      if (compressed && compressed.size > 0) {
        const name = file.name.replace(/\.[^.]+$/, ".jpg");
        return new File([compressed], name, { type: "image/jpeg" });
      }
    } catch (err2) {
      console.warn("JPEG compression also failed:", err2);
    }
    return file;
  }
}

/** Get .webp extension for storage paths */
export function webpExtension(): string {
  return "webp";
}
