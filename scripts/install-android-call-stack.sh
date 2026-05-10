#!/usr/bin/env bash
# install-android-call-stack.sh
#
# Copies every file from android-native-ref/ into the generated Capacitor
# android/ project at the correct paths for appId com.opollmarket.app, then
# prints the remaining manual merge steps (AndroidManifest, build.gradle,
# google-services.json, MainActivity plugin registration).
#
# Run from the project root AFTER `npx cap add android`:
#   bash scripts/install-android-call-stack.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/android-native-ref"
PKG_PATH="android/app/src/main/java/com/opollmarket/app"
RES_PATH="android/app/src/main/res"

if [ ! -d "$ROOT/android" ]; then
  echo "✘ android/ folder not found."
  echo "  Run \`npx cap add android\` first, then re-run this script."
  exit 1
fi

if [ ! -d "$SRC" ]; then
  echo "✘ android-native-ref/ not found at $SRC"
  exit 1
fi

mkdir -p "$ROOT/$PKG_PATH"
mkdir -p "$ROOT/$RES_PATH/layout"
mkdir -p "$ROOT/$RES_PATH/layout-land"
mkdir -p "$ROOT/$RES_PATH/drawable"
mkdir -p "$ROOT/$RES_PATH/raw"

echo "▸ Copying Kotlin sources to $PKG_PATH"
cp -v "$SRC/CallMessagingService.kt"  "$ROOT/$PKG_PATH/"
cp -v "$SRC/IncomingCallActivity.kt"  "$ROOT/$PKG_PATH/"
cp -v "$SRC/CallActionReceiver.kt"    "$ROOT/$PKG_PATH/"
cp -v "$SRC/AudioRouterPlugin.kt"     "$ROOT/$PKG_PATH/"

echo "▸ Copying portrait layout"
cp -v "$SRC/activity_incoming_call.xml" "$ROOT/$RES_PATH/layout/activity_incoming_call.xml"

echo "▸ Copying landscape layout"
cp -v "$SRC/layout-land/activity_incoming_call.xml" "$ROOT/$RES_PATH/layout-land/activity_incoming_call.xml"

echo "▸ Copying drawables"
for f in "$SRC"/drawable/*.xml; do
  cp -v "$f" "$ROOT/$RES_PATH/drawable/"
done

if [ ! -f "$ROOT/$RES_PATH/raw/ringtone.mp3" ]; then
  echo
  echo "⚠️  res/raw/ringtone.mp3 NOT found."
  echo "   Drop a short MP3 (≤ 6 s, ≤ 200 KB) at:"
  echo "     $RES_PATH/raw/ringtone.mp3"
fi

if [ ! -f "$ROOT/android/app/google-services.json" ]; then
  echo
  echo "⚠️  android/app/google-services.json NOT found."
  echo "   Download it from Firebase Console → Project Settings → Your Apps"
  echo "   and drop it at android/app/google-services.json."
fi

echo
echo "✓ Native files copied. Remaining manual steps:"
echo
echo "  1) Merge AndroidManifest additions:"
echo "     open android-native-ref/AndroidManifest.additions.xml"
echo "     and merge each <uses-permission>, <service>, <activity>, <receiver>,"
echo "     and the opoll:// <intent-filter> into"
echo "     android/app/src/main/AndroidManifest.xml"
echo
echo "  2) Register the AudioRouterPlugin in MainActivity.kt:"
echo
echo "     android/app/src/main/java/com/opollmarket/app/MainActivity.kt"
echo
echo "       import android.os.Bundle"
echo "       ..."
echo "       override fun onCreate(savedInstanceState: Bundle?) {"
echo "           registerPlugin(AudioRouterPlugin::class.java)"
echo "           super.onCreate(savedInstanceState)"
echo "       }"
echo
echo "  3) Add Firebase Messaging to android/build.gradle (project) and"
echo "     android/app/build.gradle (module):"
echo
echo "     project build.gradle:"
echo "       buildscript { dependencies { classpath 'com.google.gms:google-services:4.4.2' } }"
echo
echo "     app build.gradle:"
echo "       plugins { id 'com.google.gms.google-services' }"
echo "       dependencies {"
echo "         implementation platform('com.google.firebase:firebase-bom:33.5.1')"
echo "         implementation 'com.google.firebase:firebase-messaging-ktx'"
echo "       }"
echo
echo "  4) From the project root:"
echo "       npx cap sync android"
echo "       npx cap open android"
echo "     and Build → Build APK in Android Studio."
echo
echo "  5) Test on a locked device — call yourself from another account."
echo "     The full-screen IncomingCallActivity should appear with red Decline /"
echo "     green Accept and ring even from a killed app."
echo
echo "  Reference: CALL_UI_DEPLOYMENT_CHECKLIST.md"
