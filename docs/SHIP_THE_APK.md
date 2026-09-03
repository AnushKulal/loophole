# Getting Loophole onto a phone

Two routes, because Android and iOS are not alike: Android takes an APK you can
hand to anyone, iOS has no equivalent and has to load the app inside a host app.

Both are automated. The only thing that cannot be done from here is the first
push — this checkout has no remote yet.

## 0. Push it

```bash
# On github.com: New repository → name it "loophole" → Public → Create.
# Do not add a README, .gitignore or licence; this repo already has them.
git remote add origin https://github.com/<you>/loophole.git
git push -u origin implement-loophole-v5:main
```

## 1. Android — an APK, and a QR code to install it

**Actions → Android APK → Run workflow**, leave `variant: release` and
`publish: true`, and run it.

Roughly fifteen minutes later it publishes a GitHub Release holding the APK and
a QR code. Open the release page on a laptop and point a phone camera at the
code; it downloads and installs. Android asks once for permission to install
apps from your browser, which is expected for anything that does not come from
the Play Store.

You can also run it from the CLI:

```bash
gh workflow run "Android APK" -f variant=release -f publish=true
gh run watch
```

### Signing

Without a keystore each run signs with a throwaway key. The APK installs, but
Android will not upgrade an app across a change of signing key, so testers have
to uninstall before taking a new build. Fix that once:

```bash
keytool -genkeypair -v -keystore loophole.jks -alias loophole \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 loophole.jks   # macOS: base64 -i loophole.jks
```

Add four repository secrets under **Settings → Secrets and variables → Actions**:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | the base64 above |
| `ANDROID_KEYSTORE_PASSWORD` | the store password you chose |
| `ANDROID_KEY_ALIAS` | `loophole` |
| `ANDROID_KEY_PASSWORD` | the key password you chose |

Keep `loophole.jks` somewhere safe and out of the repo. Lose it and you cannot
ship an upgrade to anyone who already installed the app — you have to publish
under a new package id.

The signing itself is wired in by `mobile/plugins/withReleaseSigning.js`.
Expo's template points the release build at the *debug* key, so without that
plugin `assembleRelease` would quietly produce a debug-signed APK.

## 2. iPhone — Expo Go

An iOS build cannot be sideloaded the way an APK can; Apple only allows the App
Store or TestFlight, and TestFlight needs a paid Apple Developer account. Until
then, iPhones run Loophole inside **Expo Go**, a free host app from the App
Store.

### The route that works today

```bash
cd mobile
npm run share      # expo start --tunnel
```

That serves the app over a tunnel and prints a QR code in the terminal. Install
Expo Go on the iPhone, scan the code with the Camera app, and Loophole opens.
It works from anywhere, not just your Wi-Fi. The catch is that it only works
while that command is running — close the terminal and the link dies.

### A link that outlives your terminal

`.github/workflows/expo-update.yml` publishes the app to EAS Update and prints a
permanent QR code. It needs a free Expo account and a one-time `eas init` from
your machine; the steps are in the workflow's header comment.

### TestFlight

`.github/workflows/eas-build.yml` builds a real `.ipa` through Expo's cloud.
That is the route to TestFlight and the App Store, and the point at which the
$99/year Apple Developer account becomes unavoidable.

---

## Tracking issue

**Goal** — get an installable Loophole build into the hands of friends to test,
which is what the original design brief was for.

### Done

- [x] All 14 games playable against real bots, 677 engine tests green
- [x] The full 23-screen app rebuilt in Expo / React Native
- [x] `android-apk.yml` — release APK, published as a GitHub Release with a QR
      code, no Expo account and no secrets needed
- [x] Real release signing via a config plugin, with a generated key as fallback
- [x] `expo-update.yml` — the Expo Go route for iPhones
- [x] `eas-build.yml` — cloud builds through Expo, for TestFlight
- [x] App icon, adaptive icon, splash and `com.loophole.app` package id
- [x] Typecheck and engine tests run in CI before any build

### To do

- [ ] Push to the GitHub remote so Actions can run
- [ ] Run **Android APK** and install the first release APK from the QR code
- [ ] Generate a keystore and add the four secrets, so later builds upgrade
      cleanly instead of needing an uninstall
- [ ] Smoke-test on a real device: native blur, gestures, the arcade frame rate
- [ ] `eas init` if you want the permanent Expo Go link
- [ ] Decide the fate of `app/` — the web build. It is the visual reference and
      also installs as a PWA; delete it once the native build is signed off, or
      keep it as the browser version.

### Known gaps

- Verified by rendering through `react-native-web`, not on a physical device.
  Blur fidelity, gesture feel and the arcade games' frame rate need a real
  phone.
- The two arcade titles and Carrom run physics at 60fps; they are the most
  likely to need tuning on low-end hardware.
- The release APK has never been built — this container cannot reach
  `dl.google.com`, so the Android SDK is unavailable and the Gradle half of the
  workflow is unexercised. The first run on Actions is its first real test.
