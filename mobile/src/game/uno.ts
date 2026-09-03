/** An UNO round for two to six hands. Seat 0 is you. */

import { shuffle, type Rng } from './contract';

export type Colour = 'R' | 'B' | 'G' | 'Y';
export type CardColour = Colour | 'W';
export type Value = string; // '0'–'9' | 'skip' | 'rev' | '+2' | 'wild' | '+4'

export interface Card {
  c: CardColour;
  v: Value;
}

export interface UnoState {
  deck: Card[];
  /** Everything already played bar the card on top. The deck is rebuilt from these. */
  discard: Card[];
  hands: Card[][];
  top: Card;
  /** The colour in force — a wild's chosen colour, otherwise the top card's own. */
  colour: CardColour;
  turn: number;
  dir: 1 | -1;
  /** Cards the seat to play must take unless it answers with a +2. Only ever above 0 while `stack` is on. */
  draw: number;
  /** The lobby's Stacking rule: a +2 may be answered with a +2 instead of drawing. */
  stack: boolean;
  /** True while the colour picker is open for a wild you played. */
  need: boolean;
  /** Index in your hand of the wild awaiting a colour. */
  pending: number | null;
  winner: number | null;
  log: string;
}

export const COLOURS: Colour[] = ['R', 'B', 'G', 'Y'];

/** The table the lobby's Players stepper can seat. */
export const MIN_SEATS = 2;
export const MAX_SEATS = 6;

/** The lobby's seat count, kept inside what one 108-card deck can deal seven cards to. */
export const seatsFor = (n: number) => Math.max(MIN_SEATS, Math.min(MAX_SEATS, Math.floor(n) || MIN_SEATS));

/** Card face gradients, matching the tinted-glass palette. */
export const UC: Record<Colour, [string, string]> = {
  R: ['#ec8a6a', '#b84a44'],
  B: ['#7d92f0', '#3f4fbe'],
  G: ['#3fb99a', '#136a5c'],
  Y: ['#dfa25e', '#b06a2e'],
};

export const UNAME: Record<CardColour, string> = {
  R: 'Coral',
  B: 'Indigo',
  G: 'Teal',
  Y: 'Amber',
  W: 'Wild',
};

export const WILD_GRAD = 'linear-gradient(160deg,#dbe6ff,#8ba4ff 45%,#dc7aa8)';

export const cardGrad = (c: CardColour) =>
  c === 'W' ? WILD_GRAD : `linear-gradient(160deg,${UC[c as Colour][0]},${UC[c as Colour][1]})`;

/**
 * The glyph printed on a card face. Every one of these has to be a standalone
 * character with a width of its own — a combining mark (the enclosing circle
 * backslash, U+20E0) has none, so set on its own it renders as nothing or as a
 * dotted circle rather than the sign it means.
 */
export const faceOf = (v: Value) => (v === 'skip' ? 'Ø' : v === 'rev' ? '⇄' : v === 'wild' ? '★' : v);

/** A shuffled 108-card deck: one 0 and two of each 1–9, skip, rev and +2 per colour, plus four wilds and four +4s. */
export function buildDeck(rng: Rng): Card[] {
  const d: Card[] = [];
  for (const c of COLOURS) {
    d.push({ c, v: '0' });
    for (let n = 1; n <= 9; n++) {
      d.push({ c, v: String(n) });
      d.push({ c, v: String(n) });
    }
    for (const v of ['skip', 'rev', '+2']) {
      d.push({ c, v });
      d.push({ c, v });
    }
  }
  for (let i = 0; i < 4; i++) {
    d.push({ c: 'W', v: 'wild' });
    d.push({ c: 'W', v: '+4' });
  }
  return shuffle(d, rng);
}

/** Deal seven cards to each seat and turn a non-wild starter, whose action stands. */
export function deal(seats: number, rng: Rng, stack = false): UnoState {
  const n = seatsFor(seats);
  const deck = buildDeck(rng);
  const hands: Card[][] = Array.from({ length: n }, () => []);
  for (let r = 0; r < 7; r++) for (let p = 0; p < n; p++) hands[p].push(deck.pop()!);
  let top = deck.pop()!;
  while (top.c === 'W') {
    deck.unshift(top);
    top = deck.pop()!;
  }
  const u: UnoState = {
    deck,
    discard: [],
    hands,
    top,
    colour: top.c,
    turn: 0,
    dir: 1,
    draw: 0,
    stack,
    need: false,
    pending: null,
    winner: null,
    log: 'Your move',
  };
  applyStarter(u, rng);
  return u;
}

/**
 * Mutates `u`: the turned starter is a card played at seat 0, so its action
 * stands before anyone moves. A skip takes your turn, a reverse turns the table
 * round, and a draw two is yours to take — or, with stacking on, to answer.
 */
export function applyStarter(u: UnoState, rng: Rng): UnoState {
  const n = u.hands.length;
  if (u.top.v === 'rev') {
    u.dir = -1;
    u.turn = nextSeat(u.dir, 0, false, n);
    u.log = 'Reverse turned — play runs the other way';
  } else if (u.top.v === 'skip') {
    u.turn = nextSeat(u.dir, 0, false, n);
    u.log = 'Skip turned — your turn is gone';
  } else if (u.top.v === '+2') {
    if (u.stack) {
      u.draw = 2;
      u.log = 'Draw two turned — answer it or take two';
    } else {
      drawTo(u, 0, 2, rng);
      u.turn = nextSeat(u.dir, 0, false, n);
      u.log = 'Draw two turned — you took two';
    }
  }
  return u;
}

/**
 * Colour, value, or a wild — with the two rules the table actually plays by:
 * a +4 only goes down when the hand holds nothing in the colour in force, and
 * while a +2 stack is live the only answer is another +2.
 */
export function isValid(card: Card, u: UnoState, hand: Card[] = []): boolean {
  if (u.draw > 0) return card.v === '+2';
  if (card.v === '+4' && u.colour !== 'W' && hand.some((c) => c.c === u.colour)) return false;
  return card.c === 'W' || card.c === u.colour || card.v === u.top.v;
}

/** The seat after `from` at a table of `seats`, respecting direction and an optional skip. */
export function nextSeat(dir: 1 | -1, from: number, skip: boolean, seats: number): number {
  const s = Math.max(MIN_SEATS, Math.floor(seats) || MIN_SEATS);
  const n = (from + dir * (skip ? 2 : 1)) % s;
  return n < 0 ? n + s : n;
}

/**
 * Mutates `u`: hand `p` draws `n`. An empty deck is refilled from the discards,
 * shuffled — a brand-new deck here would put a second copy of a card somebody is
 * already holding into play. With nothing left anywhere the draw simply stops.
 */
export function drawTo(u: UnoState, p: number, n: number, rng: Rng): void {
  for (let i = 0; i < n; i++) {
    if (!u.deck.length) {
      if (!u.discard.length) return;
      u.deck = shuffle(u.discard, rng);
      u.discard = [];
    }
    u.hands[p].push(u.deck.pop()!);
  }
}

/**
 * Mutates `u`: resolve `card` played from seat `from`. Reverse flips direction,
 * skip / +2 / +4 pass the turn on, and the draw lands on the seat that was
 * skipped — unless stacking is on, when a +2 leaves the pile on the next seat
 * to answer or take.
 */
export function applyCard(u: UnoState, card: Card, chosen: CardColour | null, from: number, rng: Rng): UnoState {
  const n = u.hands.length;
  let dir = u.dir;
  let skip = false;
  if (card.v === 'rev') dir = (dir === 1 ? -1 : 1) as 1 | -1;
  if (card.v === 'skip') skip = true;
  if (card.v === '+2') {
    if (u.stack) {
      u.draw += 2;
    } else {
      skip = true;
      drawTo(u, nextSeat(dir, from, false, n), 2, rng);
    }
  }
  if (card.v === '+4') {
    skip = true;
    drawTo(u, nextSeat(dir, from, false, n), 4, rng);
  }
  u.dir = dir;
  u.discard.push(u.top);
  u.top = card;
  u.colour = card.c === 'W' ? (chosen as CardColour) : card.c;
  u.turn = nextSeat(dir, from, skip, n);
  return u;
}

/** Mutates `u`: seat `seat` has no +2 to answer with, so it takes the whole pile and the turn moves on. */
export function takeStack(u: UnoState, seat: number, rng: Rng): UnoState {
  drawTo(u, seat, u.draw, rng);
  u.draw = 0;
  u.turn = nextSeat(u.dir, seat, false, u.hands.length);
  return u;
}

/** A bot prefers a card in the live colour, then a value match, then a wild — never an illegal one. */
export function botChoice(hand: Card[], u: UnoState): number {
  const legal = hand.map((c, i) => (isValid(c, u, hand) ? i : -1)).filter((i) => i >= 0);
  if (!legal.length) return -1;
  return (
    legal.find((i) => hand[i].c === u.colour && hand[i].c !== 'W') ??
    legal.find((i) => hand[i].v === u.top.v && hand[i].c !== 'W') ??
    legal.find((i) => hand[i].c === 'W') ??
    legal[0]
  );
}

/** After playing a wild, a bot names whichever colour it holds most of. */
export function bestColour(hand: Card[]): Colour {
  const counts: Record<Colour, number> = { R: 0, B: 0, G: 0, Y: 0 };
  hand.forEach((c) => {
    if (c.c !== 'W') counts[c.c as Colour]++;
  });
  return (Object.keys(counts) as Colour[]).sort((a, b) => counts[b] - counts[a])[0];
}
