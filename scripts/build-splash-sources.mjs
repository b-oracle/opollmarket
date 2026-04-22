// Builds the source asset images that @capacitor/assets consumes.
// Output (all PNG, written to assets/):
//   splash.png, splash-dark.png  (2732x2732)  — full wordmark centered on black.
//   icon-only.png                (1024x1024)  — pre-designed app icon, square.
//   icon-foreground.png          (1024x1024)  — app icon for adaptive-icon foreground.
//   icon-background.png          (1024x1024)  — solid black background layer.

import sharp from "sharp";
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
