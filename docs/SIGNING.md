# Signing the release APK

Android identifies an app by its **signing key**, not by its name or version. Two
consequences follow, and both bite:

- An APK signed with a different key than the one already installed **will not
  install** — Android refuses it as a different app wearing the same package id.
  The only way through is to uninstall first, losing whatever was saved.
- If you lose the key, you can never ship an upgrade to anyone who installed the
  app. The fix is a new package id and everybody reinstalls from scratch.

Which is why the build has a fallback: with no keystore configured it generates a
throwaway key per run, so an APK still comes out and still installs. That is fine
for a first look and useless for anything after, because every build is then a
different app to Android.

Setting the four secrets below makes the key stable. Do it once.

## 1. Get a keystore

Either use the one you already have, or make one:

```bash
keytool -genkeypair -v \
  -keystore loophole.jks -alias loophole \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -dname "CN=Loophole, OU=Loophole, O=Loophole, L=<city>, ST=<state>, C=IN"
```

It asks for a password twice. Use the same one for the store and the key — the
workflow passes them separately but nothing here needs them to differ, and two
passwords is two things to lose.

`-validity 10000` is about 27 years. Play Store uploads must not expire before
2033, so do not shorten it.

## 2. Turn it into text

A GitHub secret holds text, and a keystore is binary, so it goes in base64:

```bash
base64 -w0 loophole.jks > keystore-b64.txt     # Linux
base64 -i loophole.jks -o keystore-b64.txt     # macOS
```

`-w0` / the macOS default matter: the result must be **one line with no
wrapping**. A wrapped value decodes to a corrupt keystore and the build fails
with an unhelpful Gradle error.

Check it round-trips before trusting it:

```bash
base64 -d keystore-b64.txt > check.jks && cmp loophole.jks check.jks && echo OK
```

## 3. Add four repository secrets

**Settings → Secrets and variables → Actions → New repository secret**, four
times. Names are case-sensitive and must match exactly:

| Name | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | the whole contents of `keystore-b64.txt`, one line |
| `ANDROID_KEYSTORE_PASSWORD` | the password you chose |
| `ANDROID_KEY_ALIAS` | `loophole` |
| `ANDROID_KEY_PASSWORD` | the same password |

Secrets are write-only. Once saved, nobody — including you — can read them back,
only replace them. So keep the keystore and its password somewhere else too.

## 4. Build and check it took

Push anything under `mobile/`, or run **Actions → Android APK → Run workflow**.

The build says which key it used, in two places:

- The release notes end with either *"Signed with your keystore"* or *"Signed
  with a throwaway key generated for this run."*
- The **Report the signature** step prints the certificate.

To confirm from the APK itself:

```bash
apksigner verify --print-certs loophole-1.0.0-release.apk
```

The SHA-256 there must match your keystore's:

```bash
keytool -list -v -keystore loophole.jks | grep SHA256
```

If they match, every future build installs over the last one without an
uninstall.

## Do not commit the keystore

`loophole.jks`, `keystore-b64.txt` and the password belong outside the
repository — a password manager, or wherever you keep things you cannot
regenerate. This repo is public; a keystore in it is a keystore anyone can sign
your app with.
