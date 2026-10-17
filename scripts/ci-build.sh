#!/usr/bin/env bash
# Builds android/app/build/outputs/apk/debug/app-debug.apk and copies it to ./NDGS-Report.apk
# Needs: Node 22+, JDK 21, Android SDK (ANDROID_HOME), and `npm install` already done.
set -u
cd "$(dirname "$0")/.."

build() {
  (cd android && chmod +x gradlew && ./gradlew assembleDebug --no-daemon "$@")
}

[ -d android ] || npx cap add android || exit 1

if node scripts/prepare-android.mjs && npx cap sync android && build -I ndgs-signing.init.gradle; then
  echo "Build finished with the NDGS icon, splash and signing key."
else
  echo "::warning::The custom icon/signing step failed. Rebuilding with Capacitor defaults (the app still works, but updating may need an uninstall first)."
  rm -rf android
  npx cap add android || exit 1
  build || exit 1
fi

APK=$(ls android/app/build/outputs/apk/debug/*.apk 2>/dev/null | head -n 1)
[ -n "$APK" ] || { echo "APK not found"; exit 1; }
cp "$APK" NDGS-Report.apk
echo "Created NDGS-Report.apk ($(du -h NDGS-Report.apk | cut -f1))"
