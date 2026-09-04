#!/usr/bin/env bash
#
# Sends me your phone's screen.
#
# I run on an isolated VM with no USB hardware, so I cannot reach a device over
# adb no matter how it is configured — the cable goes from your phone to your
# computer, and nothing bridges that to here. This is the next best thing: one
# command on your machine captures what the phone is showing, plus its logs and
# the details that change how a layout renders, and pushes them to the repo
# where I can read them.
#
# Usage:
#   ./scripts/snap.sh                 capture the screen now
#   ./scripts/snap.sh "day mode home" capture with a label, so I know what I am looking at
#   ./scripts/snap.sh --no-push       capture only; look at it yourself first
#
# It writes to device-reports/ at the repo root, which the APK workflow ignores,
# so this never kicks off a build.

set -euo pipefail
cd "$(dirname "$0")/../.."          # repo root

PKG=com.loophole.app
LABEL="${1:-snap}"
PUSH=yes
[ "$LABEL" = "--no-push" ] && { PUSH=no; LABEL=snap; }

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
adb -s "$DEVICE" logcat -b crash -d > "$DIR/crash.log" 2>/dev/null || true
adb -s "$DEVICE" logcat -d ReactNative:V ReactNativeJS:V AndroidRuntime:E "$PKG":V "*:S" \
  | tail -400 > "$DIR/app.log" 2>/dev/null || true

blue "Wrote $DIR"
sed 's/^/  /' "$DIR/device.txt"
[ -s "$DIR/crash.log" ] && printf '\033[33m  crash.log is not empty — something crashed\033[0m\n'

if [ "$PUSH" = no ]; then
  blue "Not pushing (--no-push). Open $DIR/screen.png to look."
  exit 0
fi

git add "$DIR"

# Staged nothing means .gitignore swallowed the report, and the push would then
# succeed having sent nothing — indistinguishable from success at this end and
# from "never ran" at the other.
if git diff --cached --quiet -- "$DIR"; then
  printf '\033[33m%s\033[0m\n' "Nothing was staged — .gitignore is excluding the report."
  echo "Run 'git pull' to pick up the fix, then try again. The files are on disk:"
  echo "  $PWD/$DIR"
  exit 1
fi

git commit -q -m "Device report: $LABEL" -- "$DIR"

# Checked, not assumed: a push that fails on credentials would otherwise leave
# the script claiming a report had arrived when it had not.
if ! git push -q origin HEAD; then
  printf '\033[33m%s\033[0m\n' "The push failed, so the report is only on this computer."
  echo "Attach these two files in the chat instead:"
  echo "  $PWD/$DIR/screen.png"
  echo "  $PWD/$DIR/crash.log"
  echo
  echo "A 403 here means git is signed in as a different GitHub account than the"
  echo "one that owns the repo."
  exit 1
fi

REMOTE="$(git remote get-url origin | sed 's/\.git$//;s#git@github.com:#https://github.com/#')"
blue "Pushed. Tell me:  device report $STAMP-${SLUG:-snap}"
echo "  $REMOTE/tree/$(git rev-parse --abbrev-ref HEAD)/$DIR"
