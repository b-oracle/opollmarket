// Idempotently patches Android resource files that need customization beyond
// what `capacitor-assets generate` and `cap sync` produce out of the box.
//
// Patches:
//   1. values/styles.xml — Switch AppTheme.NoActionBarLaunch's parent from
//      Theme.SplashScreen to AppTheme.NoActionBar so the androidx
//      core-splashscreen compat library is disabled and our wordmark splash
//      shows on Android 11 and below. (capacitor-assets resets this every run.)
//   2. values/colors.xml — Ensure <color name="notification_color"> exists
//      with the brand cyan, used as the FCM notification accent color.
//   3. AndroidManifest.xml — Ensure FCM default_notification_icon and
//      default_notification_color meta-data are declared inside <application>.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const RES = path.join(root, "android", "app", "src", "main", "res");
const STYLES = path.join(RES, "values", "styles.xml");
const COLORS = path.join(RES, "values", "colors.xml");
const MANIFEST = path.join(root, "android", "app", "src", "main", "AndroidManifest.xml");

const BRAND_CYAN = "#02C7FC";

// ---------- 1. styles.xml ----------

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
      \`node scripts/patch-android-resources.mjs\` after to re-apply.
    -->
    <style name="AppTheme.NoActionBarLaunch" parent="AppTheme.NoActionBar">
        <item name="android:background">@drawable/splash</item>
        <item name="android:windowBackground">@drawable/splash</item>
    </style>`;

function patchStyles() {
  if (!fs.existsSync(STYLES)) {
    console.error(`styles.xml not found at ${STYLES}`);
    process.exit(1);
  }
  const original = fs.readFileSync(STYLES, "utf8");

  if (original.includes(`parent="AppTheme.NoActionBar"`) && original.includes("android:windowBackground")) {
    console.log("styles.xml already patched.");
    return;
  }
  if (!original.includes(DEFAULT_LAUNCH)) {
    console.error("Expected default AppTheme.NoActionBarLaunch block not found in styles.xml. Aborting.");
    process.exit(1);
  }
  fs.writeFileSync(STYLES, original.replace(DEFAULT_LAUNCH, PATCHED_LAUNCH));
  console.log(`patched ${path.relative(root, STYLES)}`);
}

// ---------- 2. colors.xml ----------

function patchColors() {
  const colorEntry = `    <color name="notification_color">${BRAND_CYAN}</color>`;
  fs.mkdirSync(path.dirname(COLORS), { recursive: true });

  if (!fs.existsSync(COLORS)) {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
${colorEntry}
</resources>
`;
    fs.writeFileSync(COLORS, xml);
    console.log(`created ${path.relative(root, COLORS)}`);
    return;
  }

  const original = fs.readFileSync(COLORS, "utf8");
  if (original.includes(`name="notification_color"`)) {
    console.log("colors.xml already has notification_color.");
    return;
  }
  const patched = original.replace(/<\/resources>\s*$/, `${colorEntry}\n</resources>\n`);
  fs.writeFileSync(COLORS, patched);
  console.log(`patched ${path.relative(root, COLORS)}`);
}

// ---------- 3. AndroidManifest.xml ----------

const FCM_META = `        <meta-data
            android:name="com.google.firebase.messaging.default_notification_icon"
            android:resource="@drawable/ic_stat_notification" />
        <meta-data
            android:name="com.google.firebase.messaging.default_notification_color"
            android:resource="@color/notification_color" />`;

function patchManifest() {
  if (!fs.existsSync(MANIFEST)) {
    console.error(`AndroidManifest.xml not found at ${MANIFEST}`);
    process.exit(1);
  }
  const original = fs.readFileSync(MANIFEST, "utf8");

  if (original.includes("com.google.firebase.messaging.default_notification_icon")) {
    console.log("AndroidManifest.xml already has FCM notification meta-data.");
    return;
  }
  if (!original.includes("</application>")) {
    console.error("AndroidManifest.xml has no </application> tag. Aborting.");
    process.exit(1);
  }
  const patched = original.replace("</application>", `${FCM_META}\n    </application>`);
  fs.writeFileSync(MANIFEST, patched);
  console.log(`patched ${path.relative(root, MANIFEST)}`);
}

patchStyles();
patchColors();
patchManifest();
