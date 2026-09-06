/**
 * Rebuilding a match from its move log.
 *
 * The whole log is replayed from the seed every time it changes, rather than
 * folding each new move into the state already on screen. That is O(n²) over a
 * match and it does not matter — Connect 4 is at most 42 moves and an UNO round
 * rarely passes a hundred — and it buys the one property this depends on:
 * every client starts from a fresh `Rng` and consumes it in exactly the same
 * order, so the deals and the reshuffles agree. Folding incrementally would
 * mean carrying the RNG's position in state and getting it right on every
 * path, which is a bug waiting for the first reshuffle.
 *
 * Turn order comes from the game's own state, never from the move count. That
 * distinction is load-bearing for UNO, where a skip or a reverse means the
 * seat to play is not `moves.length % seats` — `lockstep.seatToMove` is only
 * correct for games that strictly alternate.
 */

import { makeRng, type Rng } from './contract';
import { orderLog, type Move } from './lockstep';
import {
  COLS,
  emptyBoard,
  findWin,
  lowest,
  place,
  type Board,
  type Disc,
  type Outcome,
} from './connect4';
import {
  applyCard,
  botChoice,
  deal,
  drawTo,
  isValid,
  nextSeat,
  takeStack,
  type CardColour,
  type UnoState,
} from './uno';

/** Seat 0 and seat 1, in the two names the Connect 4 engine already uses. */
export const discFor = (seat: number): Disc => (seat === 0 ? 'you' : 'bot');

export interface C4State {
  board: Board;
  /** Seat to play. */
  turn: number;
  winner: Outcome;
  /** The four indices of the winning line, for the pulse. */
  line: number[];
  /** Where the last disc landed, for the drop animation. */
  last: number;
  done: boolean;
}

/** A Connect 4 move is the column, and nothing else. */
export interface C4Move {
  col: number;
}

export const c4Init = (): C4State => ({
  board: emptyBoard(),
  turn: 0,
  winner: null,
  line: [],
  last: -1,
  done: false,
});

export function c4Legal(s: C4State, move: C4Move, seat: number): boolean {
  if (s.done) return false;
  if (seat !== s.turn) return false;
  if (!Number.isInteger(move?.col) || move.col < 0 || move.col >= COLS) return false;
  return lowest(s.board, move.col) >= 0;
}

/** One column dropped. Returns the state unchanged if the move is not legal. */
export function c4Apply(s: C4State, move: C4Move, seat: number): C4State {
  if (!c4Legal(s, move, seat)) return s;

  const disc = discFor(seat);
  const row = lowest(s.board, move.col);
  const board = place(s.board, move.col, disc);
  if (!board) return s;

  const line = findWin(board, disc);
  const full = !board.includes(null);
  return {
    board,
    turn: line || full ? s.turn : 1 - s.turn,
    winner: line ? disc : full ? 'draw' : null,
    line: line ?? [],
    last: row * COLS + move.col,
    done: !!line || full,
  };
}

/** The whole board, from nothing but the ordered log. */
export function replayC4(moves: Move[]): C4State {
  let s = c4Init();
  for (const m of orderLog(moves)) {
    // The seat is carried by position in the log, not by the uid on the move:
    // a client that has not yet loaded the seat list still replays correctly.
    s = c4Apply(s, (m.data ?? {}) as unknown as C4Move, s.turn);
  }
  return s;
}

// ── UNO ───────────────────────────────────────────────────────────

/**
 * One UNO action.
 *
 * A wild and its colour are a single move rather than two, so the picker is a
 * local step before anything is posted. Splitting them would put a state on the
 * wire — "someone is choosing" — that every client would have to render and
 * that could be abandoned halfway.
 */
export type UnoMove =
  | { play: number; colour?: CardColour }
  /** Draw one from the deck, when nothing in hand will go down. */
  | { draw: true }
  /** Take a stacked pile of +2s rather than answering it. */
  | { take: true };

export interface UnoOptions {
  seats: number;
  stack: boolean;
}

export function unoLegal(u: UnoState, move: UnoMove, seat: number): boolean {
  if (u.winner !== null) return false;
  if (seat !== u.turn) return false;

  if ('take' in move) return u.draw > 0;
  if ('draw' in move) return u.draw === 0;

  const hand = u.hands[seat];
  const card = hand?.[move.play];
  if (!card) return false;
  if (!isValid(card, u, hand)) return false;
  // A wild has to name its colour in the same move, or the table cannot agree
  // on what is in force.
  if (card.c === 'W' && !move.colour) return false;
  return true;
}

/**
 * Apply one action to a *copy* of the state.
 *
 * The engine's helpers mutate, which is fine and fast inside a replay that owns
 * its own state — but the copy is what keeps a caller's previous state from
 * changing under React when the log is replayed for a new render.
 */
export function unoApply(u: UnoState, move: UnoMove, seat: number, rng: Rng): UnoState {
  if (!unoLegal(u, move, seat)) return u;
  const next: UnoState = clone(u);

  if ('take' in move) {
    takeStack(next, seat, rng);
    next.log = 'Took the pile';
    return next;
  }

  if ('draw' in move) {
    drawTo(next, seat, 1, rng);
    next.turn = nextSeat(next.dir, seat, false, next.hands.length);
    next.log = 'Drew a card';
    return next;
  }

  const [card] = next.hands[seat].splice(move.play, 1);
  applyCard(next, card, move.colour ?? null, seat, rng);
  if (!next.hands[seat].length) {
    next.winner = seat;
    next.log = 'Hand empty';
  }
  return next;
}

/** A structural copy — hands and piles are arrays of plain objects. */
function clone(u: UnoState): UnoState {
  return {
    ...u,
    deck: u.deck.slice(),
    discard: u.discard.slice(),
    hands: u.hands.map((h) => h.slice()),
  };
}

/**
 * The round, from the seed and the log.
 *
 * `deal` and every `+2` consume the same `Rng`, so the stream has to be created
 * here and used for the whole replay — handing each move its own would give two
 * clients different reshuffles the moment a deck ran out.
 */
export function replayUno(seed: number, options: UnoOptions, moves: Move[]): UnoState {
  const rng = makeRng(seed);
  let u = deal(options.seats, rng, options.stack);
  for (const m of orderLog(moves)) {
    u = unoApply(u, (m.data ?? {}) as unknown as UnoMove, u.turn, rng);
  }
  return u;
}

/**
 * The same round, told from `mySeat`'s side of the table.
 *
 * Every UNO screen in this app is written as though you are seat 0 — your hand
 * is `hands[0]`, it is your turn when `turn === 0`. Rather than rewrite all of
 * that for the three players who are not seat 0, the state is rotated so each
 * phone sees itself first. Relative seat order is preserved, so `dir` and every
 * skip still mean the same thing; only the labels move.
 *
 * `seatFromView` is the inverse, for turning a tapped row back into the seat
 * the log talks about.
 */
export function rotateUno(u: UnoState, mySeat: number): UnoState {
  const n = u.hands.length;
  if (!n || mySeat % n === 0) return u;
  const shift = ((mySeat % n) + n) % n;
  return {
    ...u,
    hands: u.hands.map((_, i) => u.hands[(i + shift) % n]),
    turn: (u.turn - shift + n) % n,
    winner: u.winner === null ? null : (u.winner - shift + n) % n,
  };
}

/** View row -> engine seat. */
export const seatFromView = (view: number, mySeat: number, seats: number): number =>
  seats > 0 ? (((view + mySeat) % seats) + seats) % seats : 0;

/** Engine seat -> view row. */
export const viewFromSeat = (seat: number, mySeat: number, seats: number): number =>
  seats > 0 ? (((seat - mySeat) % seats) + seats) % seats : 0;

/**
 * What a bot at `seat` would play.
 *
 * Bots are decided on every client from shared state, so they need no seat on
 * the network and produce the same choice everywhere. Only the client whose
 * turn it is to drive them actually posts the move — see `botSeatToPost`.
 */
export function unoBotMove(u: UnoState, seat: number): UnoMove | null {
  if (u.winner !== null || u.turn !== seat) return null;
  if (u.draw > 0) {
    const answer = u.hands[seat].findIndex((c) => c.v === '+2');
    return answer >= 0 ? { play: answer } : { take: true };
  }
  const pick = botChoice(u.hands[seat], u);
  if (pick < 0) return { draw: true };
  const card = u.hands[seat][pick];
  return card.c === 'W' ? { play: pick, colour: bestOf(u.hands[seat]) } : { play: pick };
}

const bestOf = (hand: UnoState['hands'][number]): CardColour => {
  const counts: Record<string, number> = { R: 0, B: 0, G: 0, Y: 0 };
  for (const c of hand) if (c.c !== 'W') counts[c.c]++;
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] as CardColour;
};

/**
 * Which human client is responsible for posting a bot's move.
 *
 * Every client can compute what the bot would do, so without a rule they would
 * all post it and all but one would lose the race — harmless but noisy, and it
 * triples the writes. The host drives every bot; if the host has gone, the
 * lowest-indexed remaining human does, so a table does not stall because
 * somebody closed the app.
 */
export function botDriver(seats: { uid: string; bot?: boolean }[], host: string): string | null {
  const humans = seats.filter((s) => !s.bot).map((s) => s.uid);
  if (!humans.length) return null;
  return humans.includes(host) ? host : humans.slice().sort()[0];
}
