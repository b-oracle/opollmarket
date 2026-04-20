// Builds the source splash images that @capacitor/assets consumes.
// Output: assets/splash.png and assets/splash-dark.png (2732x2732)
// Centers the Opollmarket wordmark on a solid background matching the app's dark theme.

import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const SRC_LOGO = path.join(root, "src", "assets", "blue-opoll-logo.png");
const OUT_DIR = path.join(root, "assets");

const CANVAS = 2732;
// Keep the logo inside ~35% of the canvas so it survives Android's crops on every aspect ratio.
const LOGO_TARGET_WIDTH = Math.round(CANVAS * 0.35);

async function buildSplash(bgColor, outName) {
  const logo = await sharp(SRC_LOGO)
    .resize({ width: LOGO_TARGET_WIDTH })
    .toBuffer();
  const meta = await sharp(logo).metadata();

  const left = Math.round((CANVAS - meta.width) / 2);
  const top = Math.round((CANVAS - meta.height) / 2);

  await sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 4,
      background: bgColor,
    },
  })
    .composite([{ input: logo, left, top }])
    .png()
    .toFile(path.join(OUT_DIR, outName));

  console.log(`wrote ${outName}`);
}

await buildSplash({ r: 0, g: 0, b: 0, alpha: 1 }, "splash.png");
await buildSplash({ r: 0, g: 0, b: 0, alpha: 1 }, "splash-dark.png");
