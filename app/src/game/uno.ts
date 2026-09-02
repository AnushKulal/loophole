/** A four-handed UNO round against three bots. Seat 0 is you. */

export type Colour = 'R' | 'B' | 'G' | 'Y';
export type CardColour = Colour | 'W';
export type Value = string; // '0'–'9' | 'skip' | 'rev' | '+2' | 'wild' | '+4'

export interface Card {
  c: CardColour;
  v: Value;
}

export interface UnoState {
  deck: Card[];
  hands: Card[][];
  top: Card;
  /** The colour in force — a wild's chosen colour, otherwise the top card's own. */
  colour: CardColour;
  turn: number;
  dir: 1 | -1;
  /** True while the colour picker is open for a wild you played. */
  need: boolean;
  /** Index in your hand of the wild awaiting a colour. */
  pending: number | null;
  winner: number | null;
  log: string;
}

export const COLOURS: Colour[] = ['R', 'B', 'G', 'Y'];

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

/** The glyph printed on a card face. */
export const faceOf = (v: Value) => (v === 'skip' ? '⃠' : v === 'rev' ? '⇄' : v === 'wild' ? '★' : v);

/** A shuffled 108-card deck: one 0 and two of each 1–9, skip, rev and +2 per colour, plus four wilds and four +4s. */
export function buildDeck(): Card[] {
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
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

/** Deal seven cards each and turn a non-wild starter. */
export function deal(): UnoState {
  const deck = buildDeck();
  const hands: Card[][] = [[], [], [], []];
  for (let r = 0; r < 7; r++) for (let p = 0; p < 4; p++) hands[p].push(deck.pop()!);
  let top = deck.pop()!;
  while (top.c === 'W') {
    deck.unshift(top);
    top = deck.pop()!;
  }
  return {
    deck,
    hands,
    top,
    colour: top.c,
    turn: 0,
    dir: 1,
    need: false,
    pending: null,
    winner: null,
    log: 'Your move',
  };
}

export const isValid = (card: Card, u: UnoState) => card.c === 'W' || card.c === u.colour || card.v === u.top.v;

/** The seat after `from`, respecting direction and an optional skip. */
export function nextSeat(dir: 1 | -1, from: number, skip: boolean): number {
  const n = (from + dir * (skip ? 2 : 1)) % 4;
  return n < 0 ? n + 4 : n;
}

/** Mutates `u`: hand `p` draws `n`, reshuffling a fresh deck if it runs dry. */
export function drawTo(u: UnoState, p: number, n: number): void {
  for (let i = 0; i < n; i++) {
    if (!u.deck.length) u.deck = buildDeck();
    u.hands[p].push(u.deck.pop()!);
  }
}

/**
 * Mutates `u`: resolve `card` played from seat `from`. Reverse flips direction,
 * skip / +2 / +4 pass the turn on, and the draw lands on the seat that was skipped.
 */
export function applyCard(u: UnoState, card: Card, chosen: CardColour | null, from: number): UnoState {
  let dir = u.dir;
  let skip = false;
  if (card.v === 'rev') dir = (dir === 1 ? -1 : 1) as 1 | -1;
  if (card.v === 'skip') skip = true;
  if (card.v === '+2') {
    skip = true;
    drawTo(u, nextSeat(dir, from, false), 2);
  }
  if (card.v === '+4') {
    skip = true;
    drawTo(u, nextSeat(dir, from, false), 4);
  }
  u.dir = dir;
  u.top = card;
  u.colour = card.c === 'W' ? (chosen as CardColour) : card.c;
  u.turn = nextSeat(dir, from, skip);
  return u;
}

/** A bot prefers a card in the live colour, then a number match, then a wild. */
export function botChoice(hand: Card[], u: UnoState): number {
  let i = hand.findIndex((c) => c.c === u.colour && c.c !== 'W');
  if (i < 0) i = hand.findIndex((c) => c.v === u.top.v && c.c !== 'W');
  if (i < 0) i = hand.findIndex((c) => c.c === 'W');
  return i;
}

/** After playing a wild, a bot names whichever colour it holds most of. */
export function bestColour(hand: Card[]): Colour {
  const counts: Record<Colour, number> = { R: 0, B: 0, G: 0, Y: 0 };
  hand.forEach((c) => {
    if (c.c !== 'W') counts[c.c as Colour]++;
  });
  return (Object.keys(counts) as Colour[]).sort((a, b) => counts[b] - counts[a])[0];
}
