#!/usr/bin/env bash
#
# Captures what the app says on a real phone, filtered down to what is useful.
#
# Run this while reproducing a problem, then send the file it writes. Raw
# logcat is tens of thousands of lines of other apps; this keeps Loophole's own
# output, React Native's errors, and the crash traces — which is the part that
# actually says what went wrong.
#
# Usage:
#   ./scripts/logcat.sh              follow the log, write logcat-loophole.txt
#   ./scripts/logcat.sh --crash      only what a crash produced, then exit
#   ./scripts/logcat.sh --screenshot grab the screen to screen.png and exit

set -euo pipefail
cd "$(dirname "$0")/.."

PKG=com.loophole.app
OUT=logcat-loophole.txt

command -v adb >/dev/null 2>&1 || {
  echo "adb is not installed." >&2
  echo "  macOS:  brew install --cask android-platform-tools" >&2
  echo "  Linux:  sudo apt install adb" >&2
  echo "  Windows: download Android SDK platform-tools and add it to PATH" >&2
  exit 1
}

DEVICE="$(adb devices | awk 'NR>1 && $2=="device" {print $1; exit}')"
if [ -z "$DEVICE" ]; then
  cat >&2 <<'EOF'
No phone found. On the phone:
  1. Settings -> About phone -> tap "Build number" seven times
  2. Settings -> System -> Developer options -> USB debugging, on
  3. Plug it in and accept "Allow USB debugging?" on the phone's screen
Then check with: adb devices
EOF
  exit 1
fi
echo "Device: $DEVICE"

case "${1:-follow}" in
  --screenshot)
    adb -s "$DEVICE" exec-out screencap -p > screen.png
    echo "Wrote screen.png ($(wc -c < screen.png) bytes)"
    ;;

  --crash)
    # The buffer that survives the process dying.
    adb -s "$DEVICE" logcat -b crash -d > "$OUT"
    echo "Wrote $OUT ($(wc -l < "$OUT") lines)"
    ;;

  *)
    # Clear first so the file holds this run and not yesterday's.
    adb -s "$DEVICE" logcat -c || true
    echo "Reproduce the problem now. Ctrl-C when done; the log lands in $OUT."
    # ReactNative/ReactNativeJS carry console output and JS exceptions;
    # AndroidRuntime and libc carry the native crashes.
    adb -s "$DEVICE" logcat \
      ReactNative:V ReactNativeJS:V AndroidRuntime:E libc:F "$PKG":V "*:S" \
      | tee "$OUT"
    ;;
esac
