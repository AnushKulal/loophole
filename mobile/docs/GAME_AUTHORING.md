# Adding a playable game

Every title in the library is a self-contained module: one pure rules engine,
one screen component, one entry in the registry. Nothing else in the app changes
when a game is added.

## The three files

```
src/game/<id>.ts          the rules — pure TypeScript, no React, no DOM
src/game/<id>.test.ts     vitest coverage of those rules
src/screens/games/<Id>.tsx  the screen — implements GameScreenProps
```

`<id>` is lower camel case (`liarsBar`, `snakesLadders`), `<Id>` is upper
(`LiarsBar`, `SnakesLadders`).

## The contract

`src/game/contract.ts` is the source of truth. Read it before you start. In
short, your screen is handed:

```ts
{ config, onFinish, onExit, onRules, onChat, chatCount, onToast }
```

- `config.you` and `config.opponents` are the players, already carrying their
  name, mark glyph and avatar gradient. Use them — never invent player names.
- `config.difficulty` maps to a `BotProfile` via the exported `BOT` table. Read
  `skill` / `depth` / `blunder` / `think` from it rather than branching on the
  difficulty string, so all titles scale the same way.
- `config.options` is what the lobby agreed. Honour the ones that apply to your
  category: Deduction uses `timer` / `odd` / `discuss`, Board uses `players` /
  `turn`, Arcade uses `lives` / `match`.
- Call `onFinish(result)` exactly once when the match ends. The result feeds the
  existing scoreboard, so every seat needs a row.
- `onExit` leaves to the lobby. Wire it to the header's ✕.

## Rules engines are pure

The engine module must have no React import, no DOM access, and no
`Math.random()` at the top level. Take an `Rng` (from `contract.ts`) so tests
can seed it:

```ts
export function deal(rng: Rng = makeRng(Date.now())): State { ... }
```

Model state as plain data and expose transitions as functions that return new
state. That is what makes the rules testable without rendering anything.

`Date.now()` is fine inside a screen. Inside an engine, take time as a parameter.

## Screens

Compose the shared furniture from `src/components/GameChrome.tsx` — `GameShell`,
`GameHeader`, `HudChip`, `SeatStrip`, `GameOverlay`, `OverlayActions`,
`EmoteBar`, `FloatingEmote`, `TableLog`. Every game gets the same header, so
wire `onRules`, `onChat` and `onExit` through `GameHeader`.

Look at `src/screens/games/Connect4.tsx` for a worked example.

### Visual rules

This app is a tinted-glass design system. Stay inside it:

- **Colour comes only from the tokens.** `var(--acc)`, `--cyan`, `--lime`,
  `--pink`, `--gold`, `--ink`, `--dim`, `--dim2`, `--panel`, `--line`, `--track`.
  Never hard-code a hex for UI chrome. Game pieces may use the card/tint
  gradients already defined in `src/data/people.ts` and `src/game/uno.ts`.
- **Surfaces are glass.** Use the `glass(radius)` helper from
  `src/components/ui.ts` — it carries the blur, the specular rim and the shadow.
  Primary actions use `primary()` / `cta`.
- **Type is Outfit for anything structural, Plus Jakarta for prose.** Use the
  `outfit` / `jakarta` / `head()` / `kicker()` helpers, never a raw font stack.
- Radii are generous (10–26px). Nothing is square.
- Both themes must work. Anything sitting on a *fixed dark* chip needs a light
  accent, because the theme accent goes deep in Day mode — see `NEON_ON_DARK` in
  `src/data/games.ts`.
- Animations come from the twelve keyframes in `src/styles/tokens.css`
  (`vUp`, `vPop`, `vSlide`, `vDrop`, `vWave`, `vPulse`, `vFloat`, `vShine`,
  `vFall`, `vGlow`, `vDots`, `vFlip`). Add a new keyframe only if none fits.

### Layout rules

The screen renders inside a 402px-wide column at roughly 874px tall, and **must
not overflow it**. The design's own games are laid out as: fixed header, a
flexible middle that centres or scrolls, and fixed controls at the bottom.

- The root is `<GameShell>`; give the middle section `flex: 1` and `minHeight: 0`.
- Anything that can grow past the frame gets its own `overflow: auto`.
- Never set a fixed pixel height that assumes a viewport taller than 700px.

### Accessibility

Every interactive element needs an accessible name — visible text or
`aria-label`. Tests drive the games by role and name, so a button with only an
icon and no label is untestable as well as unusable.

## Bots must actually play

"Playable" means a real opponent, not a scripted animation. A bot decides from
the current state using the rules, scaled by its `BotProfile`. If a bot can
lose, it must be able to win too.

## Tests

Cover the rules, not the rendering:

- the legal-move generator accepts legal moves and rejects illegal ones
- a full match reaches a terminal state and declares exactly one winner
- the scoring / capture / elimination rule does what the rules text says
- the bot returns a legal move from every reachable position you can construct
- seeded RNG makes a match reproducible

Run `npm test` before you finish.

## Registration

Export a `PlayableGame` as the module's default from the screen file:

```tsx
export const game: PlayableGame = { name: 'Liar’s Bar', Screen, rules: [...] }
```

`name` must exactly equal the `name` in `src/data/games.ts`. The registry index
is assembled separately — do not edit `src/game/registry.ts`, `src/store/store.ts`
or `src/App.tsx`.
