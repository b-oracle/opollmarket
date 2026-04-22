import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const sourceGoogleServices = path.join(root, "firebase", "google-services.json");
const targetGoogleServices = path.join(root, "android", "app", "google-services.json");
const androidBuildGradle = path.join(root, "android", "build.gradle");
const appBuildGradle = path.join(root, "android", "app", "build.gradle");

if (!fs.existsSync(sourceGoogleServices)) {
  console.error(`Missing source Firebase config: ${sourceGoogleServices}`);
  process.exit(1);
}

if (fs.existsSync(path.dirname(targetGoogleServices))) {
  fs.copyFileSync(sourceGoogleServices, targetGoogleServices);
  console.log("Copied firebase/google-services.json -> android/app/google-services.json");
}

if (fs.existsSync(androidBuildGradle)) {
  let content = fs.readFileSync(androidBuildGradle, "utf8");
  if (!content.includes("com.google.gms:google-services")) {
    content = content.replace(
      "classpath 'com.android.tools.build:gradle:8.13.0'",
      "classpath 'com.android.tools.build:gradle:8.13.0'\n        classpath 'com.google.gms:google-services:4.4.4'"
    );
  }
  if (!content.includes("kotlin-gradle-plugin")) {
    if (!content.includes("kotlinVersion")) {
      content = content.replace(
        "buildscript {",
        "buildscript {\n    ext {\n        kotlinVersion = '2.0.21'\n    }"
      );
    }
    content = content.replace(
      "classpath 'com.google.gms:google-services:4.4.4'",
      "classpath 'com.google.gms:google-services:4.4.4'\n        classpath \"org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlinVersion\""
    );
  }
  fs.writeFileSync(androidBuildGradle, content);
}

if (fs.existsSync(appBuildGradle)) {
  let appContent = fs.readFileSync(appBuildGradle, "utf8");
  if (!appContent.includes("com.google.gms.google-services")) {
    appContent += `

try {
    def servicesJSON = file('google-services.json')
    if (servicesJSON.text) {
        apply plugin: 'com.google.gms.google-services'
    }
} catch(Exception e) {
    logger.info("google-services.json not found, google-services plugin not applied. Push Notifications won't work")
}
`;
  }
  fs.writeFileSync(appBuildGradle, appContent);
}

console.log("Android Firebase patch complete.");
