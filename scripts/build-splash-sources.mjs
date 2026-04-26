// Builds the source asset images that @capacitor/assets consumes, plus the
// Android notification small-icon PNGs (which capacitor-assets doesn't handle).
//
// Outputs to assets/ (consumed by capacitor-assets generate):
//   splash.png, splash-dark.png  (2732x2732)  — full wordmark centered on black.
//   icon-only.png                (1024x1024)  — pre-designed app icon, square.
//   icon-foreground.png          (1024x1024)  — app icon for adaptive-icon foreground.
//   icon-background.png          (1024x1024)  — solid black background layer.
//
// Outputs directly to android/app/src/main/res/drawable-*/ic_stat_notification.png:
//   24/36/48/72/96 px white silhouettes of the app icon. Android forces the
//   notification small icon to a white-on-transparent monochrome shape; we
//   derive it by using the source's brightness as the alpha channel.

import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const SRC_LOGO = path.join(root, "src", "assets", "blue-opoll-logo.png");
const SRC_ICON = path.join(root, "src", "assets", "app-icon.jpg");
const OUT_DIR = path.join(root, "assets");

const BLACK = { r: 0, g: 0, b: 0, alpha: 1 };
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

// ---------- Splash (wordmark on black) ----------
const SPLASH_CANVAS = 2732;
const SPLASH_LOGO_WIDTH = Math.round(SPLASH_CANVAS * 0.35);

async function buildSplash(outName, bg) {
  const logo = await sharp(SRC_LOGO)
    .resize({ width: SPLASH_LOGO_WIDTH })
    .toBuffer();
  const meta = await sharp(logo).metadata();
  const left = Math.round((SPLASH_CANVAS - meta.width) / 2);
  const top = Math.round((SPLASH_CANVAS - meta.height) / 2);

  await sharp({
    create: { width: SPLASH_CANVAS, height: SPLASH_CANVAS, channels: 4, background: bg },
  })
    .composite([{ input: logo, left, top }])
    .png()
    .toFile(path.join(OUT_DIR, outName));

  console.log(`wrote ${outName}`);
}

// ---------- App icon (pre-designed art from src/assets/app-icon.jpg) ----------
const ICON_CANVAS = 1024;

// The pre-designed icon already has its own black background and proper framing,
// so we just fit it to a 1024x1024 square. Any aspect-ratio gaps are filled with
// black so they blend with the icon's own background.
async function buildIcon(outName) {
  await sharp(SRC_ICON)
    .resize(ICON_CANVAS, ICON_CANVAS, { fit: "contain", background: BLACK })
    .png()
    .toFile(path.join(OUT_DIR, outName));

  console.log(`wrote ${outName}`);
}

async function buildIconBackground(outName) {
  await sharp({
    create: { width: ICON_CANVAS, height: ICON_CANVAS, channels: 4, background: BLACK },
  })
    .png()
    .toFile(path.join(OUT_DIR, outName));

  console.log(`wrote ${outName}`);
}

await buildSplash("splash.png", BLACK);
await buildSplash("splash-dark.png", BLACK);
await buildIcon("icon-only.png");
await buildIcon("icon-foreground.png");
await buildIconBackground("icon-background.png");

// ---------- Notification small icon (white silhouette per Android density) ----------
// Android's StatusBarManager re-tints the small icon white and uses the alpha
// channel as the shape mask, so we output white-on-transparent PNGs derived
// from the source's brightness (cyan -> opaque white, black -> transparent).
const ANDROID_RES = path.join(root, "android", "app", "src", "main", "res");
const NOTIFICATION_DENSITIES = [
  { dir: "drawable-mdpi", size: 24 },
  { dir: "drawable-hdpi", size: 36 },
  { dir: "drawable-xhdpi", size: 48 },
  { dir: "drawable-xxhdpi", size: 72 },
  { dir: "drawable-xxxhdpi", size: 96 },
];

// Source app-icon.jpg has the cyan ring at ~90% of its canvas with no breathing
// room. Without padding the silhouette feels cramped/zoomed in the status bar,
// so we render the source at (1 - 2 * NOTIF_PADDING_RATIO) of the target size
// and center it on a black canvas. Black pixels then become transparent
// (brightness=0 -> alpha=0) and only the cyan mark contributes to the alpha.
const NOTIF_PADDING_RATIO = 0.18;

async function buildNotificationIcon(size, outPath) {
  const inner = Math.round(size * (1 - 2 * NOTIF_PADDING_RATIO));
  const offset = Math.round((size - inner) / 2);

  const innerBuf = await sharp(SRC_ICON)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0 } })
    .toBuffer();

  const { data, info } = await sharp({
    create: { width: size, height: size, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite([{ input: innerBuf, left: offset, top: offset }])
    .raw()
    .toBuffer({ resolveWithObject: true });

  const ch = info.channels;
  const out = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const r = data[i * ch];
    const g = data[i * ch + 1];
    const b = data[i * ch + 2];
    const brightness = Math.max(r, g, b);
    out[i * 4] = 255;
    out[i * 4 + 1] = 255;
    out[i * 4 + 2] = 255;
    out[i * 4 + 3] = brightness;
  }

  await sharp(out, { raw: { width: size, height: size, channels: 4 } })
    .png()
    .toFile(outPath);
}

if (fs.existsSync(ANDROID_RES)) {
  for (const { dir, size } of NOTIFICATION_DENSITIES) {
    const outDir = path.join(ANDROID_RES, dir);
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, "ic_stat_notification.png");
    await buildNotificationIcon(size, outPath);
    console.log(`wrote ${path.relative(root, outPath)}`);
  }
} else {
  console.warn(`skipping notification icons — ${ANDROID_RES} does not exist yet.`);
  console.warn("run `npx cap add android` first, then re-run this script.");
}
