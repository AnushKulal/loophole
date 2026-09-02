# Shipping the APK

This repo has no git remote, so the Actions pipeline that builds the APK has
nowhere to run yet and the tracking issue below could not be filed. Everything
needed is committed — these are the three commands that finish the job.

## 1. Create the repo and push

```bash
gh repo create loophole --private --source=. --remote=origin --push
# or, without the gh CLI: create it on github.com, then
#   git remote add origin git@github.com:<you>/loophole.git
#   git push -u origin main
```

## 2. Get the APK

The **Android APK** workflow runs automatically on the first push. To run it on
demand:

```bash
gh workflow run "Android APK" -f variant=debug
gh run watch
gh run download --name loophole-debug-apk
```

Or from the browser: **Actions → Android APK → Run workflow**, then download it
from the run's **Artifacts** section.

Transfer the `.apk` to an Android phone and open it. The first install asks you
to allow "install unknown apps" for whichever app you opened it from.

It builds with Gradle on the runner, so it needs **no Expo account and no
secrets**. `eas-build.yml` is there if you would rather Expo's cloud handled
signing and update channels — that one needs an `EXPO_TOKEN`.

## 3. File the tracking issue

```bash
gh issue create --title "Ship a testable Loophole APK to friends" --body-file docs/SHIP_THE_APK.md
```

---

## Tracking issue

**Goal** — get an installable Loophole build into the hands of friends to test,
which is what the original design brief was for.

### Done

- [x] All 14 games playable against real bots
- [x] The full 23-screen app rebuilt in Expo / React Native
- [x] `android-apk.yml` — builds a debug APK on the runner, no account needed
- [x] `eas-build.yml` — optional cloud build through Expo
- [x] App icon, adaptive icon, splash and `com.loophole.app` package id
- [x] Engine tests run in CI before any build

### To do

- [ ] Push to a GitHub remote so Actions can run
- [ ] Download the first APK from the run artifacts and install it on a phone
- [ ] Smoke-test on a real device: native blur, gestures, the arcade frame rate
- [ ] Decide whether to sign a release build (add `ANDROID_KEYSTORE_BASE64`,
      `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`
      as repo secrets, then run the workflow with `variant=release`)
- [ ] Decide the fate of `app/` — the web build. It is the visual reference and
      also installs as a PWA; delete it once the native build is signed off, or
      keep it as the browser version.

### Known gaps

- Verified by rendering through `react-native-web`, not on a physical device.
  Blur fidelity, gesture feel and the arcade games' frame rate need a real
  phone.
- The two arcade titles and Carrom run physics at 60fps; they are the most
  likely to need tuning on low-end hardware.
