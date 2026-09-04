#!/usr/bin/env bash
#
# Decides how a change reaches your phone, and does it.
#
# There are two ways to update an installed app, and picking the wrong one
# wastes either an hour or an afternoon:
#
#   OTA   — the JavaScript bundle is swapped at next launch. Seconds. Works only
#           when nothing native changed, because the native code in the APK on
#           your phone stays exactly as it is.
#   BUILD — a whole new APK. ~15 minutes on GitHub Actions. Required the moment
#           a native module, a permission, an icon, the package id or the SDK
#           version moves.
#
# The rule is not a judgement call: if the set of native dependencies is
# identical to the one the installed APK was built from, OTA is correct and
# safe. If it differs at all, OTA would hand the phone JavaScript that calls
# native code it does not have, and the app crashes on launch. So this compares
# a fingerprint rather than asking you to remember.
#
# Usage:
#   ./scripts/ship.sh            decide and do it
#   ./scripts/ship.sh --check    say what it would do, change nothing
#   ./scripts/ship.sh --usb      force the USB path
#   ./scripts/ship.sh --build    force a new APK

set -euo pipefail
cd "$(dirname "$0")/.."

MODE="${1:-auto}"
FINGERPRINT_FILE=".native-fingerprint"

blue() { printf '\033[34m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*"; }
die()  { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

# ── the fingerprint ──────────────────────────────────────────────────────────
#
# Everything that ends up compiled into the APK rather than into the JS bundle.
# app.json covers the package id, permissions, icons, splash and plugins; the
# dependency list covers native modules; the lockfile covers their transitive
# native deps.
native_fingerprint() {
  {
    node -e '
      const p = require("./package.json");
      const app = require("./app.json");
      // Only the native-relevant half of app.json. Changing a colour in the
      // theme does not need a rebuild; changing the icon does.
      const {name, slug, version, icon, splash, plugins, android, ios, scheme} = app.expo;
      console.log(JSON.stringify({
        deps: p.dependencies, native: {name, slug, version, icon, splash, plugins, android, ios, scheme},
      }));
    '
    # The lockfile pins what those dependencies actually resolve to.
    shasum -a 256 package-lock.json 2>/dev/null || sha256sum package-lock.json
  } | shasum -a 256 2>/dev/null | cut -c1-16 || \
  {
    node -e 'console.log("nofingerprint")'
  }
}

FP="$(native_fingerprint)"
PREVIOUS="$(cat "$FINGERPRINT_FILE" 2>/dev/null || echo '')"

if [ -z "$PREVIOUS" ]; then
  DECISION="build"
  WHY="no fingerprint recorded yet — there is no installed build to update"
elif [ "$FP" = "$PREVIOUS" ]; then
  DECISION="ota"
  WHY="native dependencies unchanged since the installed build"
else
  DECISION="build"
  WHY="native dependencies changed ($PREVIOUS -> $FP)"
fi

# ── is the phone here? ───────────────────────────────────────────────────────
#
# A connected phone beats both: it is faster than OTA and it gives back a
# logcat, which is the only way to see a native crash.
DEVICE=""
if command -v adb >/dev/null 2>&1; then
  DEVICE="$(adb devices | awk 'NR>1 && $2=="device" {print $1; exit}')"
fi

[ "$MODE" = "--usb" ] && DECISION="usb"
[ "$MODE" = "--build" ] && DECISION="build"
if [ "$MODE" = "auto" ] && [ -n "$DEVICE" ]; then
  DECISION="usb"
  WHY="a phone is plugged in ($DEVICE), which is faster than either and gives logs"
fi

blue "→ $DECISION: $WHY"
[ "$MODE" = "--check" ] && exit 0

case "$DECISION" in
  usb)
    [ -n "$DEVICE" ] || die "No device. Enable USB debugging, plug the phone in, accept the prompt, then check 'adb devices'."
    if [ "$FP" != "$PREVIOUS" ]; then
      warn "Native dependencies changed, so this compiles the native project — several minutes the first time."
      npx expo run:android --device "$DEVICE" --variant release
    else
      warn "Nothing native changed, so this only reloads the bundle."
      npx expo start --dev-client --android
    fi
    echo "$FP" > "$FINGERPRINT_FILE"
    blue "Watching the log. Ctrl-C to stop."
    exec ./scripts/logcat.sh
    ;;

  ota)
    command -v npx >/dev/null || die "npx not found"
    [ -n "${EXPO_TOKEN:-}" ] || warn "EXPO_TOKEN is not set; eas-cli will ask you to log in."
    npx eas-cli@latest update --branch preview --message "${2:-$(git log -1 --pretty=%s)}" --non-interactive
    blue "Published. The phone picks it up on next launch (twice: once to fetch, once to run)."
    ;;

  build)
    git diff --quiet || die "Commit your changes first — the build runs from what is on GitHub, not what is on disk."
    git push origin HEAD:main
    echo "$FP" > "$FINGERPRINT_FILE"
    blue "Pushed. Watch it at:"
    echo "  https://github.com/AnushKulal/loophole/actions"
    blue "When it finishes, the release page has an APK and a QR code:"
    echo "  https://github.com/AnushKulal/loophole/releases/latest"
    ;;
esac
