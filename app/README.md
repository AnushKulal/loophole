# Loophole

A party-games app: fourteen titles, one lobby, one ladder. Built from the
`Loophole v5` design in the Claude Design handoff at the repo root
(`../project/Loophole v5.dc.html`) — the "tinted glass" direction.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/
npm run preview
```

## What's here

23 screens, end to end: splash → sign in → onboarding → home → setup → lobby →
game → results, plus profile, player cards, leaderboard, friends, DMs, settings,
inbox, add-friends, season pass, tint shop, spectate and a tournament bracket.

Two games really play:

- **UNO** — a full 108-card deck, real deal, colour/number matching, skip /
  reverse / +2 / wild / +4 all resolving, a colour picker for wilds, and three
  bots that lead with their strongest colour and draw when stuck.
- **Connect 4** — against a bot that takes a win when it has one, blocks yours
  when you have one, and otherwise favours the centre.

**Imposter Quiz** runs the whole deduction loop as a flow: deal → read your card
→ answer → all five answers at once → a live discussion countdown → vote →
who got voted out.

## Layout

```
src/
  data/        the fixture data — games, people, progression
  game/        connect4.ts and uno.ts: pure rules engines, no React
  store/       the app state and every action, outside React
  lib/         setup options and lobby seat derivation
  components/  design-system primitives + global chrome
  screens/     one file per screen (grouped where they share fixtures)
  styles/      the token sheet
```

### State

All state lives in a single `Store` (`src/store/store.ts`) held outside React and
read through `useSyncExternalStore`. The design is driven by timers — friends
trickling into a lobby, the discussion countdown, bot turns, DM replies — and
keeping state outside React lets those read and write current values without
stale closures. Components are pure functions of `State`.

### Styling

The token sheet in `src/styles/tokens.css` is ported verbatim from the design:
the same custom properties, the same `--blur` / `--spec` / `--glow` recipes for
the glass, and the same twelve keyframes. `[data-theme="light"]` is the Day
palette; the theme switches from Settings.

Layout metrics are inline styles, matching the design one-for-one. Hover states
live in CSS since the design expressed them with an attribute the browser has no
equivalent for. `src/components/ui.ts` holds the recurring surfaces (`glass`,
`primary`, `cta`, `kicker`) so a pane's rim and shadow are defined once.

Fonts (Outfit, Plus Jakarta Sans) are bundled via `@fontsource`, so the app has
no runtime dependency on a font CDN and the type metrics are guaranteed.

The app renders full-bleed: it fills the viewport on a phone and centres a 402px
column — the width the design was drawn against — on anything wider.

## Deliberate deviations from the prototype

- **Category chips on dark tiles** use a fixed light accent (`NEON_ON_DARK`).
  The prototype used the theme accent, which resolves to a deep tone in Day mode
  and dropped the label to about 2.4:1 on its always-dark chip.
- **Result-row avatars** carry their gradient directly rather than an index into
  the avatar palette. The prototype indexed the palette by the equipped tint,
  but the tint and avatar palettes diverge past the third entry, so your own row
  could show a different colour than your avatar everywhere else.
- The device bezel and the design-tool screen rail are not reproduced — this
  ships as the app itself, not as a prototype viewer.
