// Idempotently patches android/app/src/main/res/values/styles.xml so that
// AppTheme.NoActionBarLaunch disables the androidx core-splashscreen compat
// library. This is required so that the programmatic wordmark splash shows
// instead of Capacitor's default Android-12-style "icon on background" splash.
//
// `npx capacitor-assets generate` regenerates styles.xml from its template
// every run, resetting our change, so we re-apply it after asset generation.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const STYLES = path.join(root, "android", "app", "src", "main", "res", "values", "styles.xml");

const DEFAULT_LAUNCH = `    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="android:background">@drawable/splash</item>
    </style>`;

const PATCHED_LAUNCH = `    <!--
      Parent is AppTheme.NoActionBar (not Theme.SplashScreen) so the androidx
      core-splashscreen compat library is disabled. That way on Android 11 and
      below, the full wordmark @drawable/splash is used as the launch splash.
      On Android 12+, the OS still enforces its own short splash (icon on bg,
      ~500 ms) which cannot be disabled; after that, @capacitor/splash-screen
      shows our programmatic wordmark splash as an ImageView overlay.
      NOTE: \`npx capacitor-assets generate\` resets this file. Run
      \`node scripts/patch-android-splash-theme.mjs\` after to re-apply.
    -->
    <style name="AppTheme.NoActionBarLaunch" parent="AppTheme.NoActionBar">
        <item name="android:background">@drawable/splash</item>
        <item name="android:windowBackground">@drawable/splash</item>
    </style>`;

if (!fs.existsSync(STYLES)) {
  console.error(`styles.xml not found at ${STYLES}`);
  process.exit(1);
}

const original = fs.readFileSync(STYLES, "utf8");

if (original.includes(`parent="AppTheme.NoActionBar"`) && original.includes("android:windowBackground")) {
  console.log("styles.xml already patched — skipping.");
  process.exit(0);
}

if (!original.includes(DEFAULT_LAUNCH)) {
  console.error("Expected default AppTheme.NoActionBarLaunch block not found. Aborting.");
  console.error("Manual inspection of styles.xml required.");
  process.exit(1);
}

const patched = original.replace(DEFAULT_LAUNCH, PATCHED_LAUNCH);
fs.writeFileSync(STYLES, patched);
console.log(`patched ${path.relative(root, STYLES)}`);
