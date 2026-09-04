# Loophole — Android app

The Expo / React Native build of Loophole. Fourteen party games, one lobby, one
ladder — all fourteen genuinely playable against real bots.

```bash
cd mobile
npm install
npx expo start          # then scan the QR with Expo Go, or press 'a' for an emulator
npm test                # the rules engines
npx tsc --noEmit        # typecheck
```

## Getting an APK

Push to GitHub and the **Android APK** workflow builds one on every push to
`main` — or run it on demand from the Actions tab. It builds with Gradle on the
runner, so it needs **no Expo account and no secrets**. The APK lands in the
run's Artifacts.

`.github/workflows/eas-build.yml` is an optional alternative that builds through
Expo's cloud instead; it needs an `EXPO_TOKEN` secret.

To build locally you need the Android SDK:

```bash
npx expo prebuild --platform android
cd android && ./gradlew assembleDebug
# android/app/build/outputs/apk/debug/app-debug.apk
```

`android/` is generated from `app.json` and is not committed — the config stays
the single source of truth.

## Layout

```
src/
  theme/       the palette as plain values, plus the provider
  components/  base.tsx (primitives), GameChrome.tsx (game furniture),
               AppChrome.tsx (tab bar, sheets, banners), Background.tsx
  data/        fixture data — games, people, progression
  game/        one pure rules engine per title, plus contract.ts and registry.ts
  lib/         setup options and lobby seat derivation
  screens/     one file per screen; screens/games/ holds the playable titles
  store/       app state and every action, outside React
```

### Adding a game

See `docs/GAME_AUTHORING.md`. A title is three files — a pure engine, its tests,
and a screen implementing `GameScreenProps` — plus one line in
`src/game/registry.ts`. Nothing else changes.

### Porting from the web build

`../app/` is the verified web implementation this was ported from, and it stays
the visual reference. `docs/RN_PORTING.md` lists the traps.

## How the design survived the port

Three things the design leans on have no React Native equivalent and were
rebuilt rather than approximated:

| CSS | React Native |
| --- | --- |
| `backdrop-filter` | a real native blur (`expo-blur`, Dimezis on Android) |
| inset `box-shadow` | an explicit specular rim drawn inside the pane |
| `conic-gradient` | an SVG arc with a dashed stroke |
| `radial-gradient` | SVG radial gradients for the five light pools |

Native blur is genuinely better than the web version here — it is the real
platform effect rather than a filter over a snapshot.

## State

All state lives in a single `Store` (`src/store/store.ts`) held outside React and
read through `useSyncExternalStore`. The app is driven by timers — friends
trickling into a lobby, the discussion countdown, bot turns, DM replies — and
keeping state outside React lets those read and write current values without
stale closures.

Games are the exception: each owns its own rules state internally and receives
its match through `MatchConfig`, so the store never grows a field per title.

## Verification

The rules engines are pure TypeScript and are covered by `npm test` in plain
node — no React Native runtime needed.

Screens are verified by exporting the app to web (`npx expo export --platform
web`, which runs the same components through `react-native-web`) and driving it
in a browser. That checks composition, layout and interaction; it does **not**
check native-only rendering, so blur fidelity and gesture feel still need a real
device or emulator.

## Accounts

Sign-in is Firebase Authentication over its REST API — no `firebase` SDK, so
there is no native module and the same code runs on web, iOS and Android.

`src/auth/` is the whole of it:

```
config.ts    the project's public apiKey and projectId
validate.ts  form rules, pure
errors.ts    Firebase's codes and prose, translated into sentences
firebase.ts  the six REST calls, with a 15s timeout
session.ts   the refresh token in the platform keystore
auth.ts      the five functions the rest of the app calls
```

Screens never touch Firebase directly — they call `auth.ts` and read
`state.auth`. Swapping provider means rewriting that one file.

### Pointing it at your own project

1. **console.firebase.google.com** → create a project
2. **Project settings → Your apps → web** → copy `apiKey` and `projectId`
3. **Authentication → Sign-in method → Email/Password → Enable**
4. Put the two values in `DEFAULTS` in `src/auth/config.ts`, or in a `.env`:

```
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_PROJECT_ID=...
```

Both are public client config — they identify the project, they do not
authorise anything, and every Firebase web app ships them in its bundle.
Access is controlled by your auth settings and security rules.

If you change `.env`, export with `--clear`: Metro caches inlined env values,
so a stale key survives an ordinary rebuild.

With nothing configured the sign-in screen says so and offers **Play without an
account** — every game runs locally and needs no account at all.
