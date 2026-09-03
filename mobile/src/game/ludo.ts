/**
 * Ludo — four tokens each, one shared ring, and an exact roll to get home.
 *
 * Every seat owns a yard of four tokens and a quadrant of a 15×15 cross board.
 * A six lifts a token out of the yard onto that seat's start square and buys
 * another roll. From there a token walks the 52-square ring clockwise — its own
 * start square plus fifty more — and then turns inward into a private six-cell
 * home column, whose last cell is the goal. The goal only accepts an exact roll,
 * so the last few squares are the hard ones.
 *
 * Landing on a square holding exactly one enemy token knocks it back to its
 * yard and buys another roll, but eight squares on the ring are marked safe: the
 * four start squares and the four stars eight steps past them. Two tokens of one
 * colour on an unsafe square form a block nobody else may land on. Three sixes
 * in a row forfeits the turn. First seat with all four tokens home wins.
 *
 * Pure data and pure transitions — no React, no clock, no `Math.random`. Every
 * decision that needs chance takes an `Rng`, so a whole match replays from a
 * seed exactly as the tests run it.
 */

import { roll, type BotProfile, type Rng } from './contract';

// ── the board ─────────────────────────────────────────────────────

/** Squares in the shared ring. */
export const RING = 52;
/** Tokens per seat. */
export const TOKENS = 4;
export const MAX_SEATS = 4;

/**
 * A token's distance from its own start square. `0` is the start square itself,
 * `RING_LAST` the last shared square before it turns in, and `HOME` the goal.
 */
export const RING_LAST = 50;
/** First cell of the private home column. */
export const COLUMN_FIRST = 51;
/** The goal — the far end of the home column. */
export const HOME = 56;
/** Cells in a home column, counting the goal itself. */
export const COLUMN = HOME - COLUMN_FIRST + 1;
/** A token still in its yard. */
export const YARD = -1;

/** Consecutive sixes that forfeit a turn. */
export const SIXES_LIMIT = 3;
/** A stalemate guard, so no screen can spin forever on a pathological table. */
export const MAX_ROLLS = 4000;

/** Where each seat joins the ring. A quarter turn apart. */
export const ENTRY = [0, 13, 26, 39];

/** The four start squares and the four stars eight steps past them. */
export const SAFE = [0, 8, 13, 21, 26, 34, 39, 47];
const SAFE_SET = new Set(SAFE);

/** The board grid is 15×15; a cell is its top-left corner in grid units. */
export const GRID = 15;
export type Cell = [number, number];

/** The ring, clockwise from seat 0's start square. */
function buildRing(): Cell[] {
  const c: Cell[] = [];
  for (let x = 1; x <= 5; x++) c.push([x, 6]); // out of the left arm
  for (let y = 5; y >= 0; y--) c.push([6, y]); // up the top arm
  c.push([7, 0]);
  for (let y = 0; y <= 5; y++) c.push([8, y]); // back down it
  for (let x = 9; x <= 14; x++) c.push([x, 6]); // out along the right arm
  c.push([14, 7]);
  for (let x = 14; x >= 9; x--) c.push([x, 8]);
  for (let y = 9; y <= 14; y++) c.push([8, y]); // down the bottom arm
  c.push([7, 14]);
  for (let y = 14; y >= 9; y--) c.push([6, y]);
  for (let x = 5; x >= 0; x--) c.push([x, 8]); // back along the left arm
  c.push([0, 7]);
  c.push([0, 6]);
  return c;
}

export const RING_CELLS: Cell[] = buildRing();

/**
 * Each seat's home column, outermost cell first. The sixth entry is the goal,
 * which sits inside the centre triangle rather than on an arm.
 */
export const COLUMN_CELLS: Cell[][] = [
  [
    [1, 7],
    [2, 7],
    [3, 7],
    [4, 7],
    [5, 7],
    [6, 7],
  ],
  [
    [7, 1],
    [7, 2],
    [7, 3],
    [7, 4],
    [7, 5],
    [7, 6],
  ],
  [
    [13, 7],
    [12, 7],
    [11, 7],
    [10, 7],
    [9, 7],
    [8, 7],
  ],
  [
    [7, 13],
    [7, 12],
    [7, 11],
    [7, 10],
    [7, 9],
    [7, 8],
  ],
];

/** The 6×6 corner block each seat's tokens wait in. */
export const YARD_RECT: [number, number][] = [
  [0, 0],
  [9, 0],
  [9, 9],
  [0, 9],
];

/** The four resting cells inside each yard. */
export const YARD_SLOTS: Cell[][] = YARD_RECT.map(([x, y]) => [
  [x + 1, y + 1],
  [x + 3, y + 1],
  [x + 1, y + 3],
  [x + 3, y + 3],
]);

/** The shared square a token of `player` stands on at ring distance `pos`. */
export const ringIndex = (player: number, pos: number) => (ENTRY[player % MAX_SEATS] + pos) % RING;

export const isSafeRing = (r: number) => SAFE_SET.has(((r % RING) + RING) % RING);

export const inYard = (pos: number) => pos === YARD;
export const onRing = (pos: number) => pos >= 0 && pos <= RING_LAST;
export const inColumn = (pos: number) => pos >= COLUMN_FIRST && pos <= HOME;
export const atHome = (pos: number) => pos === HOME;

/** Where a token is drawn: its yard slot, a ring square, or a column cell. */
export function cellOf(player: number, pos: number, token: number): Cell {
  if (pos === YARD) return YARD_SLOTS[player % MAX_SEATS][token % TOKENS];
  if (pos <= RING_LAST) return RING_CELLS[ringIndex(player, pos)];
  return COLUMN_CELLS[player % MAX_SEATS][pos - COLUMN_FIRST];
}

// ── state ─────────────────────────────────────────────────────────

/** An enemy token knocked back, and how far it had travelled. */
export interface Capture {
  p: number;
  t: number;
  from: number;
}

export interface Move {
  token: number;
  from: number;
  to: number;
  /** Leaving the yard onto the start square. */
  enters: boolean;
  /** Reaching the goal on an exact roll. */
  home: boolean;
  captures: Capture[];
}

export type EventKind = 'roll' | 'move' | 'capture' | 'home' | 'forfeit' | 'stuck' | 'win';

/**
 * The last thing that happened, for the screen to narrate with real names.
 *
 * A roll that lands with somewhere to go is an event in its own right, so
 * `last.dice` is always the die a screen is looking at: the one waiting on the
 * table while `dice` holds it, and the one just spent once it is gone.
 */
export interface LudoEvent {
  kind: EventKind;
  p: number;
  dice?: number;
  token?: number;
  to?: number;
  captured?: Capture[];
}

export interface LudoState {
  seats: number;
  /** `tokens[player][token]` — `YARD`, a ring distance, or `HOME`. */
  tokens: number[][];
  turn: number;
  /** The roll waiting to be spent. `null` means the seat must roll. */
  dice: number | null;
  /** Legal moves for `dice`, recomputed on every roll. */
  moves: Move[];
  /** Consecutive sixes rolled by the seat on turn. */
  sixes: number;
  /** Enemy tokens each seat has sent back. */
  caps: number[];
  rolls: number;
  winner: number | null;
  last: LudoEvent | null;
}

/** A fresh table. With an `rng` the opening seat is drawn; without it, seat 0. */
export function startMatch(seats = MAX_SEATS, rng?: Rng): LudoState {
  const n = Math.max(2, Math.min(MAX_SEATS, Math.round(seats) || MAX_SEATS));
  return {
    seats: n,
    tokens: Array.from({ length: n }, () => Array.from({ length: TOKENS }, () => YARD)),
    turn: rng ? Math.floor(rng() * n) % n : 0,
    dice: null,
    moves: [],
    sixes: 0,
    caps: Array.from({ length: n }, () => 0),
    rolls: 0,
    winner: null,
    last: null,
  };
}

export const nextSeat = (st: LudoState, from: number) => (from + 1) % st.seats;
export const isOver = (st: LudoState) => st.winner !== null;

// ── occupancy ─────────────────────────────────────────────────────

export interface Occupant {
  p: number;
  t: number;
  pos: number;
}

/** Everyone standing on one shared square. */
export function occupantsAt(st: LudoState, ring: number): Occupant[] {
  const r = ((ring % RING) + RING) % RING;
  const out: Occupant[] = [];
  for (let p = 0; p < st.seats; p++) {
    for (let t = 0; t < TOKENS; t++) {
      const pos = st.tokens[p][t];
      if (onRing(pos) && ringIndex(p, pos) === r) out.push({ p, t, pos });
    }
  }
  return out;
}

export const countOwnAt = (st: LudoState, p: number, ring: number) =>
  occupantsAt(st, ring).filter((o) => o.p === p).length;

export interface Landing {
  /** False when a pair of enemy tokens holds the square. */
  ok: boolean;
  captures: Capture[];
  blocked: boolean;
}

/**
 * What happens when `player` puts a token down on distance `to`.
 *
 * The home column is private, so it is always free. A safe square shelters
 * whoever is on it — no capture, no block. Anywhere else a lone enemy is sent
 * home and a pair of them is a wall.
 */
export function landingAt(st: LudoState, player: number, to: number): Landing {
  if (to > RING_LAST) return { ok: true, captures: [], blocked: false };
  const r = ringIndex(player, to);
  if (isSafeRing(r)) return { ok: true, captures: [], blocked: false };
  const enemies = occupantsAt(st, r).filter((o) => o.p !== player);
  if (enemies.length >= 2) return { ok: false, captures: [], blocked: true };
  return { ok: true, captures: enemies.map((o) => ({ p: o.p, t: o.t, from: o.pos })), blocked: false };
}

// ── legal moves ───────────────────────────────────────────────────

/** Every move `player` could make with `dice`, in token order. */
export function legalMoves(st: LudoState, player: number, dice: number): Move[] {
  const out: Move[] = [];
  if (st.winner !== null) return out;
  if (!Number.isInteger(dice) || dice < 1 || dice > 6) return out;
  const mine = st.tokens[player];
  if (!mine) return out;
  for (let t = 0; t < TOKENS; t++) {
    const from = mine[t];
    if (from === HOME) continue;
    let to: number;
    if (from === YARD) {
      if (dice !== 6) continue;
      to = 0;
    } else {
      to = from + dice;
      if (to > HOME) continue;
    }
    const land = landingAt(st, player, to);
    if (!land.ok) continue;
    out.push({ token: t, from, to, enters: from === YARD, home: to === HOME, captures: land.captures });
  }
  return out;
}

/** Token indices the seat on turn may move right now. */
export const movableTokens = (st: LudoState) => st.moves.map((m) => m.token);

export type MoveIssue = 'over' | 'turn' | 'roll' | 'home' | 'yard' | 'exact' | 'block';

export const MOVE_MESSAGE: Record<MoveIssue, string> = {
  over: 'The match is over',
  turn: 'Not your turn',
  roll: 'Roll the dice first',
  home: 'That token is already home',
  yard: 'You need a six to leave the yard',
  exact: 'Home needs an exact roll',
  block: 'Two tokens are holding that square',
};

/** Why `player` cannot move `token` with the roll on the table — `null` if they can. */
export function moveProblem(st: LudoState, player: number, token: number): MoveIssue | null {
  if (st.winner !== null) return 'over';
  if (player !== st.turn) return 'turn';
  const d = st.dice;
  if (d === null) return 'roll';
  const from = st.tokens[player]?.[token];
  if (from === undefined) return 'home';
  if (from === HOME) return 'home';
  if (from === YARD) {
    if (d !== 6) return 'yard';
    return landingAt(st, player, 0).ok ? null : 'block';
  }
  const to = from + d;
  if (to > HOME) return 'exact';
  return landingAt(st, player, to).ok ? null : 'block';
}

// ── transitions ───────────────────────────────────────────────────

function pass(st: LudoState): LudoState {
  return { ...st, turn: nextSeat(st, st.turn), dice: null, moves: [], sixes: 0 };
}

/**
 * Take a die. A third six in a row forfeits the turn outright; a roll with
 * nowhere to go passes it on. Otherwise the roll sits on the table until the
 * seat spends it on one of `moves` — and is recorded in `last`, so a screen
 * reading `last.dice` sees the die actually on the table rather than the one
 * spent on the previous move.
 */
export function rollDice(st: LudoState, rng: Rng): LudoState {
  if (st.winner !== null || st.dice !== null) return st;
  const p = st.turn;
  const d = roll(rng);
  const rolls = st.rolls + 1;

  if (rolls >= MAX_ROLLS) {
    const leader = standings({ ...st, rolls })[0];
    return { ...st, rolls, dice: null, moves: [], sixes: 0, winner: leader, last: { kind: 'win', p: leader } };
  }

  const sixes = d === 6 ? st.sixes + 1 : 0;
  if (sixes >= SIXES_LIMIT) {
    return { ...pass({ ...st, rolls }), last: { kind: 'forfeit', p, dice: d } };
  }

  const moves = legalMoves(st, p, d);
  if (!moves.length) {
    return { ...pass({ ...st, rolls }), last: { kind: 'stuck', p, dice: d } };
  }
  return { ...st, rolls, dice: d, sixes, moves, last: { kind: 'roll', p, dice: d } };
}

/**
 * Spend the roll on `moves[index]`. A six, a capture and a token reaching home
 * each buy another roll; anything else hands the dice on.
 */
export function applyMove(st: LudoState, index: number): LudoState {
  if (st.winner !== null || st.dice === null) return st;
  const m = st.moves[index];
  if (!m) return st;
  const p = st.turn;
  const d = st.dice;

  const tokens = st.tokens.map((row) => row.slice());
  tokens[p][m.token] = m.to;
  for (const c of m.captures) tokens[c.p][c.t] = YARD;

  const caps = st.caps.slice();
  caps[p] += m.captures.length;

  const kind: EventKind = m.captures.length ? 'capture' : m.home ? 'home' : 'move';
  const last: LudoEvent = { kind, p, dice: d, token: m.token, to: m.to, captured: m.captures };
  const base: LudoState = { ...st, tokens, caps, dice: null, moves: [], last };

  if (tokens[p].every((x) => x === HOME)) {
    return { ...base, sixes: 0, winner: p, last: { kind: 'win', p, dice: d, token: m.token, to: m.to } };
  }
  // Another roll for a six, for a capture, and for getting a token home.
  if (d === 6 || m.captures.length > 0 || m.home) return { ...base, sixes: d === 6 ? st.sixes : 0 };
  return { ...base, turn: nextSeat(st, p), sixes: 0 };
}

/** Spend the roll on a named token. Unchanged state if that move is not legal. */
export function playToken(st: LudoState, token: number): LudoState {
  const i = st.moves.findIndex((m) => m.token === token);
  return i < 0 ? st : applyMove(st, i);
}

// ── reading a position ────────────────────────────────────────────

export const tokensHome = (st: LudoState, p: number) => st.tokens[p].filter((x) => x === HOME).length;
export const tokensOut = (st: LudoState, p: number) => st.tokens[p].filter((x) => x !== YARD && x !== HOME).length;
export const tokensYard = (st: LudoState, p: number) => st.tokens[p].filter((x) => x === YARD).length;

/** Squares travelled by a whole seat, 0 to `TOKENS * (HOME + 1)`. */
export const progress = (st: LudoState, p: number) =>
  st.tokens[p].reduce((n, pos) => n + (pos === YARD ? 0 : pos + 1), 0);

/** Seats best-placed first: the winner, then tokens home, then ground covered. */
export function standings(st: LudoState): number[] {
  return Array.from({ length: st.seats }, (_, i) => i).sort((a, b) => {
    if (st.winner === a) return -1;
    if (st.winner === b) return 1;
    const h = tokensHome(st, b) - tokensHome(st, a);
    if (h) return h;
    const g = progress(st, b) - progress(st, a);
    if (g) return g;
    return a - b;
  });
}

/** 1-based finishing place. */
export const placeOf = (st: LudoState, p: number) => standings(st).indexOf(p) + 1;

export function xpFor(st: LudoState, p: number): number {
  const base = 50 + 70 * tokensHome(st, p) + 25 * st.caps[p] + Math.round(progress(st, p) / 6);
  return base + (st.winner === p ? 220 : 0);
}

// ── danger ────────────────────────────────────────────────────────

/**
 * How many enemy tokens could reach distance `to` on their very next roll.
 * `extra` accounts for tokens about to arrive: a pair of your own on an unsafe
 * square is a wall, not a target.
 */
export function threatAt(st: LudoState, player: number, to: number, extra = 0): number {
  if (!onRing(to)) return 0;
  const r = ringIndex(player, to);
  if (isSafeRing(r)) return 0;
  if (countOwnAt(st, player, r) + extra >= 2) return 0;
  let n = 0;
  for (let q = 0; q < st.seats; q++) {
    if (q === player) continue;
    for (let t = 0; t < TOKENS; t++) {
      const pos = st.tokens[q][t];
      if (!onRing(pos)) continue;
      const gap = (r - ringIndex(q, pos) + RING) % RING;
      // They only get there if the step is on a die and still on the ring.
      if (gap >= 1 && gap <= 6 && pos + gap <= RING_LAST) n++;
    }
  }
  return n;
}

/** How many enemy tokens a token of `player` at `to` would be threatening. */
export function pressureFrom(st: LudoState, player: number, to: number): number {
  if (!onRing(to)) return 0;
  const r = ringIndex(player, to);
  let n = 0;
  for (let d = 1; d <= 6; d++) {
    const step = to + d;
    if (step > RING_LAST) break;
    const target = (r + d) % RING;
    if (isSafeRing(target)) continue;
    const enemies = occupantsAt(st, target).filter((o) => o.p !== player);
    if (enemies.length === 1) n++;
  }
  return n;
}

// ── the bot ───────────────────────────────────────────────────────

/**
 * How good a move looks, in the order the rules make matter: knock somebody
 * back, get a token home, tuck one into the column, break a token out of the
 * yard, then simply run. From depth 2 the bot also reads the board it is
 * leaving behind — walking off a threatened square is worth as much as several
 * squares of progress — and from depth 3 it weighs the threat it creates.
 */
export function scoreMove(st: LudoState, player: number, m: Move, depth = 2): number {
  let s = m.to * 2;

  if (m.home) s += 900;
  else if (m.to >= COLUMN_FIRST) s += 300 + (m.to - COLUMN_FIRST) * 24;

  if (m.captures.length) {
    s += 520;
    for (const c of m.captures) s += c.from * 4;
  }

  if (m.enters) s += 190 + tokensYard(st, player) * 20;

  if (onRing(m.to) && isSafeRing(ringIndex(player, m.to))) s += 90;

  if (depth >= 2) {
    s -= threatAt(st, player, m.to, 1) * 70;
    s += threatAt(st, player, m.from) * 55;
  }
  if (depth >= 3) {
    s += pressureFrom(st, player, m.to) * 22;
    // Finish what you started rather than spreading four tokens thin.
    if (m.from >= COLUMN_FIRST) s += 30;
  }
  return s;
}

/**
 * The bot's pick, as an index into `st.moves`. `-1` when there is nothing to
 * play. A `blunder` roll throws the move away at random; failing the `skill`
 * roll settles for something in the top half rather than the best line.
 */
export function botMove(st: LudoState, player: number, bot: BotProfile, rng: Rng): number {
  const moves = st.turn === player && st.dice !== null ? st.moves : [];
  if (!moves.length) return -1;
  if (moves.length === 1) return 0;

  if (rng() < bot.blunder) return Math.floor(rng() * moves.length) % moves.length;

  const ranked = moves
    .map((m, i) => ({ i, s: scoreMove(st, player, m, bot.depth) }))
    .sort((a, b) => b.s - a.s || a.i - b.i);

  if (rng() > bot.skill) {
    const k = Math.max(1, Math.ceil(ranked.length / 2));
    return ranked[Math.floor(rng() * k) % k].i;
  }
  return ranked[0].i;
}

/** Roll and move for one seat — the whole of a bot's turn. */
export function botTurn(st: LudoState, bot: BotProfile, rng: Rng): LudoState {
  if (st.winner !== null) return st;
  if (st.dice === null) return rollDice(st, rng);
  const i = botMove(st, st.turn, bot, rng);
  return i < 0 ? pass(st) : applyMove(st, i);
}

// ── narration ─────────────────────────────────────────────────────

/** The last event as a sentence, with `name` supplying "You" or a real name. */
export function describe(ev: LudoEvent | null, name: (p: number) => string): string {
  if (!ev) return 'Roll to start';
  switch (ev.kind) {
    case 'roll':
      return `${name(ev.p)} rolled a ${ev.dice}`;
    case 'capture':
      return `${name(ev.p)} sent ${name(ev.captured?.[0]?.p ?? ev.p)} back to the yard`;
    case 'home':
      return `${name(ev.p)} brought a token home`;
    case 'forfeit':
      return `${name(ev.p)} rolled three sixes and lost the turn`;
    case 'stuck':
      return `${name(ev.p)} had no move with a ${ev.dice}`;
    case 'win':
      return `${name(ev.p)} got all four tokens home`;
    default:
      return `${name(ev.p)} played a ${ev.dice}`;
  }
}

/** "in the yard", "square 23", "home column 2", "home". */
export function whereIs(pos: number): string {
  if (pos === YARD) return 'in the yard';
  if (pos === HOME) return 'home';
  if (pos >= COLUMN_FIRST) return `home column ${pos - COLUMN_FIRST + 1}`;
  return `square ${pos + 1}`;
}
