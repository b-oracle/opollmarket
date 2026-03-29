import imageCompression from "browser-image-compression";

type ImagePreset = "market-banner" | "avatar" | "social";

const PRESETS: Record<ImagePreset, { maxWidthOrHeight: number; initialQuality: number }> = {
  "market-banner": { maxWidthOrHeight: 1200, initialQuality: 0.75 },
  avatar: { maxWidthOrHeight: 300, initialQuality: 0.7 },
  social: { maxWidthOrHeight: 800, initialQuality: 0.75 },
};

/**
 * Compress and convert an image to WebP before upload.
 * Falls back to original file on error.
 */
export async function compressImage(file: File, preset: ImagePreset): Promise<File> {
  try {
    const opts = PRESETS[preset];
    const compressed = await imageCompression(file, {
      maxWidthOrHeight: opts.maxWidthOrHeight,
      initialQuality: opts.initialQuality,
      fileType: "image/webp",
      useWebWorker: true,
    });
    // Return as File with .webp extension
    const name = file.name.replace(/\.[^.]+$/, ".webp");
    return new File([compressed], name, { type: "image/webp" });
  } catch (err) {
    console.warn("Image compression failed, using original:", err);
    return file;
  }
}

/** Get .webp extension for storage paths */
export function webpExtension(): string {
  return "webp";
}
