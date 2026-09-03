/**
 * Snakes & Ladders — the classic 10×10 race to square 100.
 *
 * The board is numbered 1–100 in boustrophedon order: square 1 is the bottom
 * left, the first row runs right, the second row runs back left above it, and
 * so on, so 100 sits directly above 1 in the top-left corner. Each seat owns one
 * token, starting off the board on square 0.
 *
 * A turn is a single d6. The token walks that many squares. Landing on the foot
 * of a ladder carries it to the top; landing on the head of a snake drops it to
 * the tail. A roll that would carry it past 100 walks up to 100 and then back
 * down the overshoot, so the last few squares need an exact count — and a bounce
 * can land you straight on a snake head. First token to stand exactly on 100
 * takes the match.
 *
 * There is nothing to choose here: the die decides everything, and every seat
 * rolls the same fair die. That is the honest shape of the game, so the "bot" is
 * a seeded roll rather than a search, and `BotProfile.think` is what makes a
 * bot's turn read as deliberate. The interesting rules — the bounce, the jump
 * map, the chain when a jump lands you on another one — all live here.
 *
 * Pure data and pure transitions: no React, no clock, no `Math.random`. Every
 * roll takes an `Rng`, so a whole match replays exactly from a seed.
 */

import { roll, type BotProfile, type Rng } from './contract';

// ── the board ─────────────────────────────────────────────────────

/** Squares on the board. */
export const SQUARES = 100;
export const COLS = 10;
export const ROWS = 10;
/** Faces on the die. */
export const DIE = 6;
/** The lobby seats two to four. */
export const MAX_SEATS = 4;
/** A token that has not left the start lane yet. */
export const START = 0;

/**
 * How far a chain of jumps is followed before it is treated as a loop. The
 * classic map never chains — no ladder top is a snake head and no snake tail is
 * a ladder foot — but a custom board handed to `startMatch` may, so resolution
 * follows the chain rather than stopping at the first hop.
 */
export const MAX_CHAIN = 8;

/** A stalemate guard, so no screen can spin forever on a pathological board. */
export const MAX_ROLLS = 2000;

/** Ladder foot → ladder top. The Milton Bradley board. */
export const LADDERS: Record<number, number> = {
  1: 38,
  4: 14,
  9: 31,
  21: 42,
  28: 84,
  36: 44,
  51: 67,
  71: 91,
  80: 100,
};

/** Snake head → snake tail. */
export const SNAKES: Record<number, number> = {
  16: 6,
  47: 26,
  49: 11,
  56: 53,
  62: 19,
  64: 60,
  87: 24,
  93: 73,
  95: 75,
  98: 78,
};

export type JumpMap = Record<number, number>;

/** Both halves of the board in one lookup: square → where it takes you. */
export const JUMPS: JumpMap = { ...LADDERS, ...SNAKES };

export type JumpKind = 'ladder' | 'snake';

export interface Jump {
  kind: JumpKind;
  from: number;
  to: number;
}

/** The snake or ladder starting on `sq`, or null for an ordinary square. */
export function jumpAt(sq: number, map: JumpMap = JUMPS): Jump | null {
  const to = map[sq];
  if (to === undefined || to === sq) return null;
  return { kind: to > sq ? 'ladder' : 'snake', from: sq, to };
}

/** Every snake and ladder on a board, feet-first, for drawing it. */
export function jumpList(map: JumpMap = JUMPS): Jump[] {
  return Object.keys(map)
    .map(Number)
    .sort((a, b) => a - b)
    .map((sq) => jumpAt(sq, map))
    .filter((j): j is Jump => j !== null);
}

/**
 * Where a square sits on the grid. Row 0 is the bottom row, column 0 the left
 * edge; odd rows run right to left, which is what makes the track continuous.
 */
export function cellOf(sq: number): { col: number; row: number } {
  const n = Math.max(1, Math.min(SQUARES, Math.round(sq))) - 1;
  const row = Math.floor(n / COLS);
  const i = n % COLS;
  return { col: row % 2 === 0 ? i : COLS - 1 - i, row };
}

/** The inverse of `cellOf`. */
export function squareAt(col: number, row: number): number {
  const i = row % 2 === 0 ? col : COLS - 1 - col;
  return row * COLS + i + 1;
}

// ── moving ────────────────────────────────────────────────────────

export interface Landing {
  /** The square the walk ends on, before any snake or ladder. */
  landed: number;
  /** True when the roll overshot 100 and had to walk back down. */
  bounced: boolean;
}

/** Where `die` steps from `from` end up, bouncing back off 100. */
export function landingOf(from: number, die: number): Landing {
  const raw = from + die;
  return raw > SQUARES ? { landed: 2 * SQUARES - raw, bounced: true } : { landed: raw, bounced: false };
}

/**
 * The squares a token actually touches, in order, so a screen can step it along
 * the track. A roll that overshoots turns around on 100 and walks back, which is
 * exactly what the bounce-back rule looks like.
 */
export function walkPath(from: number, die: number): number[] {
  const out: number[] = [];
  let sq = from;
  let dir = 1;
  for (let i = 0; i < die; i++) {
    if (sq === SQUARES) dir = -1;
    sq += dir;
    out.push(sq);
  }
  return out;
}

/** One resolved move: the walk, the bounce, the jumps it triggered. */
export interface Hop {
  seat: number;
  die: number;
  from: number;
  landed: number;
  bounced: boolean;
  /** The snakes and ladders taken from `landed`, in the order they were taken. */
  jumps: Jump[];
  /** Where the token finally rests. */
  to: number;
  won: boolean;
}

/**
 * Resolve a roll: walk it, bounce it if it overshoots, then follow the jump the
 * landing square starts — and any jump the far end of that one starts, until the
 * chain runs out.
 */
export function resolve(seat: number, from: number, die: number, map: JumpMap = JUMPS): Hop {
  const { landed, bounced } = landingOf(from, die);
  const jumps: Jump[] = [];
  const seen = new Set<number>([landed]);
  let sq = landed;
  while (jumps.length < MAX_CHAIN) {
    const j = jumpAt(sq, map);
    if (!j) break;
    jumps.push(j);
    sq = j.to;
    if (seen.has(sq)) break;
    seen.add(sq);
  }
  return { seat, die, from, landed, bounced, jumps, to: sq, won: sq === SQUARES };
}

// ── state ─────────────────────────────────────────────────────────

export type Phase =
  /** `turn` must roll. */
  | 'roll'
  /** The roll has resolved and `last` is on the table; `settle` hands the turn on. */
  | 'move'
  | 'over';

export interface SlState {
  seats: number;
  /** The jump map in play. Swappable so a test can rig a chained board. */
  board: JumpMap;
  /** Each seat's square: 0 in the start lane, 100 home. */
  pos: number[];
  turn: number;
  phase: Phase;
  last: Hop | null;
  /** Dice rolled this match, by everybody. */
  rolls: number;
  /** Ladders climbed, per seat. */
  climbs: number[];
  /** Snakes taken, per seat. */
  bites: number[];
  /** The furthest square each seat has reached. */
  best: number[];
  winner: number | null;
  log: string[];
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const LOG_KEEP = 14;
const note = (s: SlState, ...lines: string[]) => s.log.concat(lines).slice(-LOG_KEEP);

/** A fresh match. Seats are clamped to the two-to-four the lobby offers. */
export function startMatch(seats: number, board: JumpMap = JUMPS): SlState {
  const n = Math.max(2, Math.min(MAX_SEATS, Math.floor(seats) || 2));
  return {
    seats: n,
    board,
    pos: range(n).map(() => START),
    turn: 0,
    phase: 'roll',
    last: null,
    rolls: 0,
    climbs: range(n).map(() => 0),
    bites: range(n).map(() => 0),
    best: range(n).map(() => START),
    winner: null,
    log: [],
  };
}

// ── legality ──────────────────────────────────────────────────────

export type MoveError = 'not-rolling' | 'not-your-turn' | 'bad-die';

export const MOVE_MESSAGE: Record<MoveError, string> = {
  'not-rolling': 'The die is not yours to roll yet',
  'not-your-turn': 'It is not your turn',
  'bad-die': 'A die shows one to six',
};

/** Why this roll would be rejected right now, or null if it is legal. */
export function moveProblem(s: SlState, seat: number, die: number): MoveError | null {
  if (s.phase !== 'roll') return 'not-rolling';
  if (!Number.isInteger(seat) || seat < 0 || seat >= s.seats || s.turn !== seat) return 'not-your-turn';
  if (!Number.isInteger(die) || die < 1 || die > DIE) return 'bad-die';
  return null;
}

export const isLegalRoll = (s: SlState, seat: number, die: number) => moveProblem(s, seat, die) === null;

/** Every face this seat could legally play right now — all six, or none at all. */
export function legalRolls(s: SlState, seat: number): number[] {
  if (s.phase !== 'roll' || s.turn !== seat) return [];
  return range(DIE).map((i) => i + 1);
}

// ── transitions ───────────────────────────────────────────────────

/**
 * Apply a rolled face. Throws on an illegal roll — check `moveProblem` first.
 * The turn does not pass until `settle`, so a screen can animate the token along
 * `last` before the next seat picks the die up.
 */
export function applyRoll(s: SlState, seat: number, die: number): SlState {
  const bad = moveProblem(s, seat, die);
  if (bad) throw new Error(MOVE_MESSAGE[bad]);

  const hop = resolve(seat, s.pos[seat], die, s.board);
  const pos = s.pos.slice();
  pos[seat] = hop.to;
  const best = s.best.slice();
  best[seat] = Math.max(best[seat], hop.to, hop.landed);
  const climbs = s.climbs.slice();
  const bites = s.bites.slice();
  for (const j of hop.jumps) {
    if (j.kind === 'ladder') climbs[seat] += 1;
    else bites[seat] += 1;
  }

  const lines = [`Seat ${seat} rolled ${die}`];
  if (hop.bounced) lines.push(`Overshot 100 and bounced back to ${hop.landed}`);
  for (const j of hop.jumps) {
    lines.push(j.kind === 'ladder' ? `Ladder ${j.from} → ${j.to}` : `Snake ${j.from} → ${j.to}`);
  }
  if (hop.won) lines.push(`Seat ${seat} is home`);

  return { ...s, pos, best, climbs, bites, rolls: s.rolls + 1, last: hop, phase: 'move', log: note(s, ...lines) };
}

/** Roll for whoever is on turn. The one place chance enters the engine. */
export function takeTurn(s: SlState, rng: Rng): SlState {
  if (s.phase !== 'roll') return s;
  return applyRoll(s, s.turn, roll(rng));
}

/**
 * Hand the turn on once the token has finished moving. A token standing exactly
 * on 100 ends the match; so, as a guard, does a board that has somehow taken
 * `MAX_ROLLS` dice without one, in which case the furthest seat takes it.
 */
export function settle(s: SlState): SlState {
  if (s.phase !== 'move' || !s.last) return s;
  const h = s.last;
  if (h.won) {
    return { ...s, phase: 'over', winner: h.seat, log: note(s, `Seat ${h.seat} wins`) };
  }
  if (s.rolls >= MAX_ROLLS) {
    const lead = order({ ...s, winner: null })[0];
    return { ...s, phase: 'over', winner: lead, log: note(s, `The board is called — seat ${lead} is furthest`) };
  }
  return { ...s, phase: 'roll', turn: (s.turn + 1) % s.seats };
}

// ── the bot ───────────────────────────────────────────────────────

/**
 * A bot's roll. There is no decision in Snakes & Ladders — a die is a die — so
 * this is simply the same fair d6 every seat rolls, drawn from the match's
 * seeded stream. It returns null when it is not that seat's roll, so a caller
 * can never smuggle a move in out of turn.
 */
export function botRoll(s: SlState, seat: number, rng: Rng): number | null {
  if (!legalRolls(s, seat).length) return null;
  return roll(rng);
}

/**
 * Where the difficulty actually lands: how long a bot sits with the die before
 * throwing it. A sharp bot plays briskly; an easy one dawdles. A hop that
 * triggered a snake or a ladder is given a beat longer so the jump reads.
 */
export function botThink(botProfile: BotProfile, hop?: Hop | null): number {
  const base = Math.max(120, Math.round(botProfile.think));
  return hop && hop.jumps.length ? Math.round(base * 1.25) : base;
}

// ── reading a move ────────────────────────────────────────────────

/**
 * A sentence for the table log. `who` is already the right name for the seat;
 * `second` switches the one verb that has to agree with it.
 */
export function hopText(h: Hop, who: string, second = false): string {
  const rolled = `${who} rolled ${h.die}`;
  if (h.won) return `${rolled} and ${second ? 'are' : 'is'} home on 100`;
  const bounce = h.bounced ? ` — bounced back off 100 to ${h.landed}` : '';
  const jump = h.jumps.length ? h.jumps[h.jumps.length - 1] : null;
  if (!jump) return `${rolled} to ${h.to}${bounce}`;
  const chain = h.jumps.length > 1 ? ` (${h.jumps.length} in a row)` : '';
  return jump.kind === 'ladder'
    ? `${rolled}${bounce} and climbed the ladder ${h.jumps[0].from} → ${h.to}${chain}`
    : `${rolled}${bounce} and slid down the snake ${h.jumps[0].from} → ${h.to}${chain}`;
}

/** How many squares are left to the finish. */
export const toGo = (s: SlState, seat: number) => SQUARES - s.pos[seat];

// ── the scoreboard ────────────────────────────────────────────────

/** Seats ranked: the winner, then whoever is furthest along, seat order last. */
export function order(s: SlState): number[] {
  return range(s.seats).sort((a, b) => {
    const wa = s.winner === a ? 1 : 0;
    const wb = s.winner === b ? 1 : 0;
    if (wa !== wb) return wb - wa;
    if (s.pos[a] !== s.pos[b]) return s.pos[b] - s.pos[a];
    return a - b;
  });
}

/** 1 for the winner, then down the board. */
export const placeOf = (s: SlState, seat: number) => order(s).indexOf(seat) + 1;

/** XP: a flat fee, ground covered, every ladder found, the finish, and the win. */
export function xpFor(s: SlState, seat: number): number {
  return (
    40 +
    3 * s.best[seat] +
    45 * s.climbs[seat] +
    55 * (s.seats - placeOf(s, seat)) +
    (s.winner === seat ? 240 : 0)
  );
}
