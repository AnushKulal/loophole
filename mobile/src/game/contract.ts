import type { ComponentType } from 'react';
import type { Category } from '../data/games';

/**
 * The contract every playable game implements.
 *
 * A game owns its own rules state internally — the app store only knows which
 * game is on screen. That keeps each title self-contained: one pure engine
 * module plus one screen component, added to the registry and nothing else.
 */

export interface MatchOptions {
  /** Deduction: seconds to write an answer. */
  timer: number;
  /** Deduction: how many players get the other question. */
  odd: number;
  /** Deduction: seconds of discussion before voting opens. */
  discuss: number;
  /** Board: seats at the table. */
  players: number;
  /** Board: seconds before a turn auto-skips. */
  turn: number;
  /** Arcade: respawns per player. */
  lives: number;
  /** Arcade: minutes per round. */
  match: number;
  stack: boolean;
  safe: boolean;
  spin: boolean;
}

export interface Player {
  name: string;
  /** The geometric glyph on their avatar. */
  mark: string;
  /** CSS gradient for their avatar disc. */
  grad: string;
  bot: boolean;
}

/** What the lobby agreed on, handed to a game when the host starts it. */
export interface MatchConfig {
  game: string;
  cat: Category;
  you: Player;
  /** Everyone else at the table, in seat order. */
  opponents: Player[];
  difficulty: Difficulty;
  options: MatchOptions;
  /**
   * Present when this match is shared with other phones.
   *
   * Absent is the ordinary local game against bots, and every screen keeps that
   * path working unchanged — a networked match is an addition, not a
   * replacement. See `game/useMatch.ts`.
   */
  net?: NetInfo;
}

/** The shared half of a match: where the log lives, and which seat you are. */
export interface NetInfo {
  /** Room code, and the match document's id. */
  id: string;
  /** Seeds every client's engine, which is what makes the deals agree. */
  seed: number;
  host: string;
  /** Seat order, fixed when the match was created. */
  seats: { uid: string; name: string; mark: string; gi: number; bot?: boolean }[];
  /** Which of those seats is this device. */
  mySeat: number;
  me: string;
}

export type Difficulty = 'Easy' | 'Normal' | 'Sharp';

/** One line of the scoreboard. */
export interface ResultRow {
  /** Player name. */
  n: string;
  /** What they did — "Went out", "3 cards left", "Voted Karthik". */
  d: string;
  /** XP delta, already formatted: "+240". */
  s: string;
  win?: boolean;
  mark: string;
  grad: string;
}

/** A finished match, in the shape the results screen renders. */
export interface MatchResult {
  game: string;
  /** The headline: "You won", "You survived". */
  head: string;
  kicker: string;
  /** Total XP, formatted: "+320". */
  xp: string;
  /** One sentence under the highlights. */
  note: string;
  rows: ResultRow[];
}

export interface GameScreenProps {
  config: MatchConfig;
  /** End the match and move to the scoreboard. */
  onFinish: (result: MatchResult) => void;
  /** Leave back to the lobby. */
  onExit: () => void;
  /** Open the shared how-to-play sheet. */
  onRules: () => void;
  /** Open table chat. */
  onChat: () => void;
  /** Unread count shown on the chat button. */
  chatCount: number;
  /** Show a transient toast. */
  onToast: (message: string) => void;
}

export interface PlayableGame {
  /** Must exactly equal the game's `name` in `src/data/games.ts`. */
  name: string;
  Screen: ComponentType<GameScreenProps>;
  /** Three how-to-play steps for the rules sheet. */
  rules: string[];
}

/**
 * How hard the bots play. Games read this rather than branching on the
 * difficulty string, so all eleven titles scale consistently.
 */
export interface BotProfile {
  /** 0 = plays at random, 1 = always takes the best line it can see. */
  skill: number;
  /** How many plies / how far ahead a searching bot should look. */
  depth: number;
  /** Chance per decision of a deliberate mistake. */
  blunder: number;
  /** Milliseconds a bot waits before acting, so turns read as deliberate. */
  think: number;
}

export const BOT: Record<Difficulty, BotProfile> = {
  Easy: { skill: 0.35, depth: 1, blunder: 0.3, think: 700 },
  Normal: { skill: 0.7, depth: 2, blunder: 0.12, think: 620 },
  Sharp: { skill: 1, depth: 3, blunder: 0.02, think: 520 },
};

/**
 * Deterministic pseudo-randomness. `Math.random` is fine at runtime, but engine
 * tests need repeatable deals and rolls, so every engine takes an optional RNG
 * and defaults to this one seeded from the clock.
 */
export type Rng = () => number;

export function makeRng(seed: number): Rng {
  // mulberry32 — small, fast, good enough for shuffles and dice.
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates, returning a new array. */
export function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pick one item. Throws on an empty list rather than returning undefined. */
export function pick<T>(items: T[], rng: Rng): T {
  if (!items.length) throw new Error('pick() on an empty list');
  return items[Math.floor(rng() * items.length)];
}

/** A d6. */
export const roll = (rng: Rng) => 1 + Math.floor(rng() * 6);
