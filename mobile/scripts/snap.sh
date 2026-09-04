#!/usr/bin/env bash
#
# Sends me your phone's screen.
#
# I run on an isolated VM with no USB hardware, so I cannot reach a device over
# adb no matter how it is configured — the cable goes from your phone to your
# computer, and nothing bridges that to here. This is the next best thing: one
# command captures what the phone is showing, plus its logs and the details
# that change how a layout renders, ready to attach.
#
# Usage:
#   ./scripts/snap.sh                 capture the screen now
#   ./scripts/snap.sh "day mode home" capture with a label, so I know what I am looking at
#
# The report is written to disk for you to attach. It is deliberately not
# pushed: the repo is public and a screenshot captures whatever is on screen.


set -euo pipefail
cd "$(dirname "$0")/../.."          # repo root

PKG=com.loophole.app
LABEL="${1:-snap}"

blue() { printf '\033[34m%s\033[0m\n' "$*"; }
die()  { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

command -v adb >/dev/null 2>&1 || die "adb is not installed.
  macOS:   brew install --cask android-platform-tools
  Linux:   sudo apt install adb
  Windows: install Android SDK platform-tools and add it to PATH"

DEVICE="$(adb devices | awk 'NR>1 && $2=="device" {print $1; exit}')"
[ -n "$DEVICE" ] || die "No phone found. Plug it in, make sure USB debugging is on,
and accept the 'Allow USB debugging?' prompt on the phone. Then: adb devices"

SLUG="$(printf '%s' "$LABEL" | tr '[:upper:] ' '[:lower:]-' | tr -cd 'a-z0-9-')"
STAMP="$(date +%Y%m%d-%H%M%S)"
DIR="device-reports/$STAMP-${SLUG:-snap}"
mkdir -p "$DIR"

# A screenshot is of whatever is on screen right now, which the first time was
# a home screen rather than the app. Count down so there is time to get to it.
echo "Open the screen you want captured on the phone."
for i in 5 4 3 2 1; do printf '\r  capturing in %s… ' "$i"; sleep 1; done
printf '\r%*s\r' 24 ''

blue "Capturing from $DEVICE…"
adb -s "$DEVICE" exec-out screencap -p > "$DIR/screen.png"

# The details that change how a layout lands: physical size, density, Android
# version. A card that looks wrong at one density often looks right at another,
# and guessing which is what wastes a round trip.
{
  echo "device:  $(adb -s "$DEVICE" shell getprop ro.product.manufacturer | tr -d '\r') $(adb -s "$DEVICE" shell getprop ro.product.model | tr -d '\r')"
  echo "android: $(adb -s "$DEVICE" shell getprop ro.build.version.release | tr -d '\r') (API $(adb -s "$DEVICE" shell getprop ro.build.version.sdk | tr -d '\r'))"
  echo "screen:  $(adb -s "$DEVICE" shell wm size | tr -d '\r')"
  echo "density: $(adb -s "$DEVICE" shell wm density | tr -d '\r')"
  echo "app:     $(adb -s "$DEVICE" shell dumpsys package $PKG | grep -m1 versionName | tr -d '\r ' || echo 'not installed')"
  echo "label:   $LABEL"
} > "$DIR/device.txt"

# Crash buffer survives the process dying, so it holds the last crash whether or
# not one just happened. Empty is good news.
# Only this app's crashes. The buffer holds every crash on the phone, and
# flagging an unrelated app's startup failure sends everyone chasing nothing.
adb -s "$DEVICE" logcat -b crash -d 2>/dev/null | awk -v pkg="$PKG" '
  /FATAL EXCEPTION/ { keep = 0; buf = "" }
  { buf = buf $0 "\n" }
  index($0, pkg) { keep = 1 }
  /^$/ { if (keep) printf "%s", buf; buf = ""; keep = 0 }
  END { if (keep) printf "%s", buf }
' > "$DIR/crash.log" || true
adb -s "$DEVICE" logcat -d ReactNative:V ReactNativeJS:V AndroidRuntime:E "$PKG":V "*:S" \
  | tail -400 > "$DIR/app.log" 2>/dev/null || true

blue "Wrote $DIR"
sed 's/^/  /' "$DIR/device.txt"
if [ -s "$DIR/crash.log" ]; then
  printf '\033[33m  crash.log has a Loophole crash in it\033[0m\n'
else
  echo "  no Loophole crash"
fi

blue "Attach these two files in the chat:"
echo "  $PWD/$DIR/screen.png"
echo "  $PWD/$DIR/crash.log"
echo
echo "Reports are not pushed: this repo is public, and a screenshot is whatever"
echo "was on screen — which the first time was a home screen, not the app."
