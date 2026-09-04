# Getting a change onto your phone

Three routes. Picking the wrong one costs either an hour or a crash on launch,
so `mobile/scripts/ship.sh` decides for you — but the reasoning is worth
knowing, because it is the same reasoning either way.

```bash
cd mobile
./scripts/ship.sh --check     # say what it would do, change nothing
./scripts/ship.sh             # do it
```

## The three routes

| | When | How long | Gives you |
| --- | --- | --- | --- |
| **USB** | The phone is plugged in | ~1 min after the first compile | A live log, which is the only way to see a native crash |
| **OTA** | Nothing native changed | Seconds | The new JavaScript at next launch |
| **Build** | Anything native changed | ~15 min on Actions | A fresh APK and a QR code |

## Why the OTA/build split is not a judgement call

An OTA update replaces the JavaScript bundle. The native code — every module
compiled into the APK — stays exactly as it was. So an OTA is correct precisely
when the JavaScript you are shipping does not call any native code the installed
APK lacks. Ship one when that is not true and the app crashes on launch, on
everyone's phone at once, with no way to roll back except a new APK.

`ship.sh` therefore fingerprints the native surface rather than asking you to
remember: the dependency list, the lockfile, and the half of `app.json` that
becomes native — package id, permissions, icons, splash, plugins, SDK versions.
Change a colour, a layout, a rule, a screen: fingerprint unchanged, OTA. Add
`expo-haptics`, change the package id, bump the SDK: fingerprint changes, build.

The fingerprint of the last thing you installed lives in
`mobile/.native-fingerprint`, which is deliberately not committed — it describes
what is on *your* phone, and yours and mine differ.

## USB — the fast loop, and the only way to see a crash

This is the route to use while something is actually broken. It is faster than
OTA and it gives back a log; the other two give you a black screen and a shrug.

One-time setup on the phone:

1. **Settings → About phone** → tap **Build number** seven times
2. **Settings → System → Developer options** → turn on **USB debugging**
3. Plug it in, and accept **Allow USB debugging?** when it appears

Then on the computer, `adb devices` should list it. If adb is missing:
`brew install --cask android-platform-tools` on macOS, `sudo apt install adb` on
Linux, or the Android SDK platform-tools on Windows.

To capture what went wrong:

```bash
./scripts/logcat.sh              # follow the log while you reproduce it
./scripts/logcat.sh --crash      # just the crash buffer, after the fact
./scripts/logcat.sh --screenshot # grab the screen to screen.png
```

`logcat.sh` filters tens of thousands of lines down to Loophole's own output,
React Native's JavaScript errors, and native crash traces. Send the file it
writes — that is the difference between fixing something in one round and
guessing at it over four.

## OTA

Needs a free Expo account and a one-time `eas init`; the commands are in
`.github/workflows/expo-update.yml`. EAS **Update** is not EAS **Build** — the
build minutes that run out are Build's, and updates do not touch them. APKs come
from GitHub Actions here, which has no such limit.

The phone applies an update on the *second* launch after it is published: the
first fetches it in the background, the next one runs it. That is expo-updates'
default and it is the right one — nobody should wait on a download at a splash
screen.

## Build

```bash
./scripts/ship.sh --build
```

Commits must be pushed first, because the build runs from what is on GitHub. The
run publishes a release with the APK and a QR code you can scan from the release
page. Roughly fifteen minutes.

## Showing me the phone

I run on an isolated VM with no USB hardware, so adb here reaches nothing —
the cable goes from your phone to your computer, and nothing bridges that gap.
`snap.sh` is the way across it:

```bash
cd mobile
./scripts/snap.sh "day mode home"
```

That captures the screen, the crash buffer, the recent app log, and the device
details that change how a layout lands — physical size, density, Android
version — then pushes them to `device-reports/` where I can read them. Tell me
the report name it prints and I can see what you see.

`--no-push` captures without pushing, if you want to look first.

It writes outside `mobile/`, so it never triggers a build.

For a quick look without the rest:

```bash
./scripts/logcat.sh --screenshot
./scripts/logcat.sh --crash
```

Rendering problems in particular are worth a screenshot even when nothing
crashes — blur, shadows and gradients behave differently on Android than in any
browser, and two bugs got through to a shipped APK here precisely because a
browser harness cannot see them.
