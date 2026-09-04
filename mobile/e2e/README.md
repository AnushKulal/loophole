# Acceptance suites

Two suites that drive the app in a real browser rather than asserting against
mocks. They run against `expo export --platform web` — the same JavaScript that
ships inside the APK, so a pass here is evidence about the shipped bundle, not
about a test double.

What they do not cover is anything native: blur fidelity, gesture feel, frame
rate, and the keystore-backed session all need a physical device.

```bash
npm run build:web                       # export and serve on :8080
node e2e/acceptance.mjs 8080            # 38 cases across the whole app
node e2e/login.mjs 8080 unconfigured    # the sign-in screen with no project
node e2e/login.mjs 8080 configured      # ...and with one
```

`SHOT_DIR=/some/path` changes where screenshots land; a failing case writes
`FAIL-<id>.png` so you can see what was on screen.

## acceptance.mjs

38 cases in five groups — boot, accounts, navigation, all thirteen games, and
the rest of the features. Every game is played: entered through the library,
put in a lobby, started, given its first real interaction, and left running long
enough for a bot to take a turn.

A case fails if its assertion fails **or** if the page logged a console error
while it ran, so a silent exception in an unrelated component still fails the
case that provoked it.

## login.mjs

The sign-in screen specifically, run twice. `unconfigured` checks that a build
with no Firebase project says so and still offers a way in. `configured` needs
a build with a key — a deliberately invalid one is ideal, because a wrong key
still reaches Firebase and so exercises the whole chain: form, fetch, Firebase's
error envelope, the translation table, and what lands on screen.

To make that build, put a dummy key in `.env` and export with `--clear`:

```
EXPO_PUBLIC_FIREBASE_API_KEY=AIzaSyTESTKEYNOTREAL00000000000000000
EXPO_PUBLIC_FIREBASE_PROJECT_ID=loophole-test
```

The `--clear` matters. Metro caches inlined env values, so deleting `.env` and
rebuilding leaves the old key in the bundle — which is how a test key almost
shipped in an APK here.

## Writing a case

Assert on what a person would see. When a case fails, check the screenshot
before changing the app: three of the five failures on this suite's first run
were the assertions looking in the wrong place, not defects.
