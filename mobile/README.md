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
