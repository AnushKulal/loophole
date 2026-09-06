/**
 * Playing one match on several phones, by agreeing on moves rather than state.
 *
 * Every engine in `src/game/` is already a pure function of (state, move) with
 * its randomness coming from a seeded `Rng`. That is the whole reason this can
 * be simple: if two phones start from the same seed and apply the same moves in
 * the same order, they compute byte-identical states without ever sending one.
 * A UNO hand is a few hundred bytes of state and a move is about twenty, and
 * the difference matters on a phone paying for its data.
 *
 * The move log is the authority. There is no host that decides — a move exists
 * once it occupies an index, and the index is claimed by a create-only write,
 * so two people moving at the same instant resolve at the database rather than
 * by asking one of them to arbitrate. The loser re-reads and takes the next
 * index, which is also what would have happened had they been a moment slower.
 *
 * Everything in this file is pure. The network half lives in `net/match.ts`.
 */

import type { Json } from '../net/values';

/** One entry in the log. `n` is its position, and positions start at 0. */
export interface Move {
  n: number;
  /** The uid that played it. */
  by: string;
  data: Json;
  at: number;
}

/** How a game folds a move into its own state. */
export type Reducer<S> = (state: S, move: Move) => S;

export class DivergenceError extends Error {
  constructor(
    public at: number,
    message: string,
  ) {
    super(message);
    this.name = 'DivergenceError';
  }
}

/**
 * Sort, drop duplicates, and stop at the first gap.
 *
 * A gap matters more than it looks. Applying move 5 when 4 has not arrived
 * would compute a state no other phone will ever hold, and every later move
 * would be judged against it — one dropped read and the two players are playing
 * different games while both believe they agree. Stopping at the gap means the
 * screen is briefly behind, which is recoverable; applying past it is not.
 *
 * Duplicates are expected rather than exceptional: a client that does not see
 * the response to its write retries, and both attempts can land.
 */
export function orderLog(moves: Move[]): Move[] {
  const byIndex = new Map<number, Move>();
  for (const m of moves) {
    if (!Number.isInteger(m?.n) || m.n < 0) continue;
    // First writer of an index wins, which is the same rule the database
    // enforces; a later duplicate is a retry, not a correction.
    if (!byIndex.has(m.n)) byIndex.set(m.n, m);
  }

  const out: Move[] = [];
  for (let i = 0; byIndex.has(i); i++) out.push(byIndex.get(i) as Move);
  return out;
}

/** The first index not yet filled — where the next move goes. */
export const nextIndex = (moves: Move[]): number => orderLog(moves).length;

/** True when the log has entries beyond the first gap, so more is on its way. */
export function hasGap(moves: Move[]): boolean {
  const seen = new Set(moves.filter((m) => Number.isInteger(m?.n) && m.n >= 0).map((m) => m.n));
  if (!seen.size) return false;
  const contiguous = orderLog(moves).length;
  return Math.max(...seen) >= contiguous;
}

/**
 * Fold the log into a state.
 *
 * Applies from `from` so a client that already advanced to move 12 does not
 * replay the first eleven on every poll — for a long UNO round that is the
 * difference between a smooth table and a stutter every two seconds.
 */
export function replay<S>(reducer: Reducer<S>, state: S, moves: Move[], from = 0): { state: S; upTo: number } {
  const log = orderLog(moves);
  let next = state;
  for (const m of log) {
    if (m.n < from) continue;
    next = reducer(next, m);
  }
  return { state: next, upTo: log.length };
}

/**
 * Whose move it is, from the log alone.
 *
 * Seat order is fixed when the match is created, so the turn is a property of
 * how many moves have been played rather than something that needs storing and
 * keeping in step.
 */
export const seatToMove = (moves: Move[], seats: number): number =>
  seats > 0 ? nextIndex(moves) % seats : 0;

export const isMyTurn = (moves: Move[], seats: string[], uid: string): boolean =>
  seats.length > 0 && seats[seatToMove(moves, seats.length)] === uid;

/**
 * Check a move before it is sent.
 *
 * Returns the reason it is not allowed, or null. The engine is the real
 * authority on legality; this is the cheap check that stops an obviously wrong
 * write from taking an index that then has to be worked around.
 */
export function moveProblem(moves: Move[], seats: string[], uid: string, n: number): string | null {
  if (!seats.includes(uid)) return 'You are not in this match.';
  if (n !== nextIndex(moves)) return 'The table moved on — catching up.';
  if (!isMyTurn(moves, seats, uid)) return 'Not your turn.';
  return null;
}

/**
 * A fingerprint of a computed state, for spotting divergence.
 *
 * Lockstep's one real failure mode is silent: a non-deterministic engine — a
 * stray `Math.random`, iteration over an object's keys, a date — makes two
 * phones disagree while both keep playing. Comparing a digest every so often
 * turns that into something visible instead of two people arguing about whose
 * screen is right.
 *
 * FNV-1a over the canonical JSON. Not cryptographic; it only has to notice.
 */
export function digest(state: unknown): string {
  const s = canonical(state);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** JSON with object keys sorted, so two equal states always stringify alike. */
function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const keys = Object.keys(v as object).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical((v as any)[k])}`).join(',')}}`;
}

/** Throws if two phones computed different states at the same move. */
export function assertAgrees(mine: string, theirs: string | undefined, at: number): void {
  if (theirs && mine !== theirs) {
    throw new DivergenceError(at, `The table fell out of step at move ${at}.`);
  }
}
