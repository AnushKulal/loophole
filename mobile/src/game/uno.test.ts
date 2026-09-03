import { describe, expect, it } from 'vitest';
import { makeRng, type Rng } from './contract';
import {
  COLOURS,
  MAX_SEATS,
  MIN_SEATS,
  UC,
  UNAME,
  WILD_GRAD,
  applyCard,
  applyStarter,
  bestColour,
  botChoice,
  buildDeck,
  cardGrad,
  deal,
  drawTo,
  faceOf,
  isValid,
  nextSeat,
  seatsFor,
  takeStack,
  type Card,
  type CardColour,
  type UnoState,
} from './uno';

/**
 * The engine takes an `Rng`, so a repeatable deal is a seed passed in rather
 * than a global anybody has to patch. That is what makes a whole simulated
 * match reproducible from a single number.
 */
const seeded = (seed: number): Rng => makeRng(seed);

/** A hand-built table, so a rule can be checked without waiting for a deal. */
function rig(hands: Card[][], top: Card, over: Partial<UnoState> = {}, seats = 4): UnoState {
  return {
    deck: [],
    discard: [],
    hands: Array.from({ length: Math.max(seats, hands.length) }, (_, i) => hands[i] ?? []),
    top,
    colour: top.c,
    turn: 0,
    dir: 1,
    draw: 0,
    stack: false,
    need: false,
    pending: null,
    winner: null,
    log: '',
    ...over,
  };
}

const card = (c: CardColour, v: string): Card => ({ c, v });
const sizes = (u: UnoState) => u.hands.map((h) => h.length);
const key = (c: Card) => `${c.c}${c.v}`;

/** Every card in play, wherever it is sitting. */
function census(u: UnoState): Map<string, number> {
  const seen = new Map<string, number>();
  for (const c of [...u.deck, ...u.discard, ...u.hands.flat(), u.top]) seen.set(key(c), (seen.get(key(c)) ?? 0) + 1);
  return seen;
}

/** The census of one untouched 108-card deck — nothing may ever exceed it. */
function deckCensus(): Map<string, number> {
  const seen = new Map<string, number>();
  for (const c of buildDeck(seeded(1))) seen.set(key(c), (seen.get(key(c)) ?? 0) + 1);
  return seen;
}

// ── the deck ────────────────────────────────────────────────────────

describe('the deck', () => {
  it('is the standard 108 cards', () => {
    const d = buildDeck(seeded(7));
    expect(d).toHaveLength(108);

    for (const c of COLOURS) {
      const mine = d.filter((x) => x.c === c);
      expect(mine).toHaveLength(25);
      expect(mine.filter((x) => x.v === '0')).toHaveLength(1);
      for (let n = 1; n <= 9; n++) expect(mine.filter((x) => x.v === String(n))).toHaveLength(2);
      for (const v of ['skip', 'rev', '+2']) expect(mine.filter((x) => x.v === v)).toHaveLength(2);
    }
    expect(d.filter((x) => x.c === 'W' && x.v === 'wild')).toHaveLength(4);
    expect(d.filter((x) => x.c === 'W' && x.v === '+4')).toHaveLength(4);
  });

  it('shuffles — two seeds do not deal the same order', () => {
    const a = buildDeck(seeded(1));
    const b = buildDeck(seeded(2));
    expect(a.map(key).join()).not.toEqual(b.map(key).join());
  });

  it('shuffles from the seed alone, with no global to patch', () => {
    expect(buildDeck(seeded(31)).map(key)).toEqual(buildDeck(seeded(31)).map(key));
  });
});

// ── the deal ────────────────────────────────────────────────────────

describe('the deal', () => {
  it('seats the table the lobby asked for', () => {
    for (let n = MIN_SEATS; n <= MAX_SEATS; n++) {
      const u = deal(n, seeded(n * 13));
      expect(u.hands).toHaveLength(n);
      // Seven each; only a draw-two starter adds to seat 0, and it adds exactly two.
      for (let p = 0; p < n; p++) expect(u.hands[p].length).toBe(p === 0 && u.top.v === '+2' ? 9 : 7);
      expect(u.top.c).not.toBe('W');
      expect(u.colour).toBe(u.top.c);
      expect(u.winner).toBeNull();
      expect(u.need).toBe(false);
      expect(u.pending).toBeNull();
      expect(u.turn).toBeGreaterThanOrEqual(0);
      expect(u.turn).toBeLessThan(n);
    }
  });

  it('keeps a lobby seat count inside a table that can be dealt', () => {
    expect(seatsFor(4)).toBe(4);
    expect(seatsFor(6)).toBe(6);
    expect(seatsFor(1)).toBe(MIN_SEATS);
    expect(seatsFor(9)).toBe(MAX_SEATS);
    expect(seatsFor(0)).toBe(MIN_SEATS);
    expect(seatsFor(NaN)).toBe(MIN_SEATS);
    expect(deal(9, seeded(4)).hands).toHaveLength(MAX_SEATS);
    expect(deal(1, seeded(4)).hands).toHaveLength(MIN_SEATS);
  });

  it('accounts for all 108 cards however many seats sit down', () => {
    for (let n = MIN_SEATS; n <= MAX_SEATS; n++) {
      const u = deal(n, seeded(500 + n));
      expect(census(u)).toEqual(deckCensus());
      expect(u.deck.length + u.hands.flat().length + u.discard.length + 1).toBe(108);
    }
  });

  it('deals identically from the same seed and differently from another', () => {
    const a = deal(4, seeded(2024));
    const b = deal(4, seeded(2024));
    expect(sizes(b)).toEqual(sizes(a));
    expect(b.hands.flat().map(key)).toEqual(a.hands.flat().map(key));
    expect(key(b.top)).toBe(key(a.top));

    const c = deal(4, seeded(2025));
    expect(c.hands.flat().map(key)).not.toEqual(a.hands.flat().map(key));
  });

  it('never opens on a wild', () => {
    for (let seed = 0; seed < 120; seed++) expect(deal(4, seeded(seed)).top.c).not.toBe('W');
  });
});

// ── the card that starts the round ──────────────────────────────────

describe('the starter card acts', () => {
  it('skips seat 0, so seat 1 leads', () => {
    const u = rig([[]], card('B', 'skip'));
    applyStarter(u, seeded(1));
    expect(u.turn).toBe(1);
    expect(u.dir).toBe(1);
  });

  it('turns the table round on a reverse', () => {
    const u = rig([[]], card('B', 'rev'));
    applyStarter(u, seeded(1));
    expect(u.dir).toBe(-1);
    expect(u.turn).toBe(3);
  });

  it('makes seat 0 take two and lose the turn on a draw two', () => {
    const u = rig([[]], card('B', '+2'), { deck: [card('R', '1'), card('G', '2')] });
    applyStarter(u, seeded(1));
    expect(u.hands[0]).toHaveLength(2);
    expect(u.turn).toBe(1);
  });

  it('leaves the draw two live to answer when stacking is on', () => {
    const u = rig([[]], card('B', '+2'), { stack: true });
    applyStarter(u, seeded(1));
    expect(u.draw).toBe(2);
    expect(u.turn).toBe(0);
    expect(u.hands[0]).toHaveLength(0);
  });

  it('leaves a plain number alone', () => {
    const u = rig([[]], card('B', '7'));
    applyStarter(u, seeded(1));
    expect(u.turn).toBe(0);
    expect(u.dir).toBe(1);
  });

  it('is applied by the real deal, not silently dropped', () => {
    // Roughly a quarter of deals open on an action card; walk seeds until each
    // one has been turned, and check the deal honoured it.
    const seen: Record<string, boolean> = { skip: false, rev: false, '+2': false };
    for (let seed = 0; seed < 400 && !Object.values(seen).every(Boolean); seed++) {
      const u = deal(4, seeded(seed));
      if (u.top.v === 'skip') {
        seen.skip = true;
        expect(u.turn).toBe(1);
      }
      if (u.top.v === 'rev') {
        seen.rev = true;
        expect(u.dir).toBe(-1);
        expect(u.turn).toBe(3);
      }
      if (u.top.v === '+2') {
        seen['+2'] = true;
        expect(u.hands[0]).toHaveLength(9);
        expect(u.turn).toBe(1);
      }
    }
    expect(seen).toEqual({ skip: true, rev: true, '+2': true });
  });
});

// ── legal moves ─────────────────────────────────────────────────────

describe('isValid', () => {
  const u = rig([[]], card('B', '7'));

  it('accepts a colour match', () => {
    expect(isValid(card('B', '3'), u)).toBe(true);
    expect(isValid(card('B', 'skip'), u)).toBe(true);
  });

  it('accepts a value match in another colour', () => {
    expect(isValid(card('R', '7'), u)).toBe(true);
    expect(isValid(card('G', '7'), u)).toBe(true);
  });

  it('accepts a wild from any hand', () => {
    expect(isValid(card('W', 'wild'), u, [card('B', '5'), card('W', 'wild')])).toBe(true);
  });

  it('rejects a card that matches neither colour nor value', () => {
    expect(isValid(card('R', '3'), u)).toBe(false);
    expect(isValid(card('Y', 'rev'), u)).toBe(false);
    expect(isValid(card('G', '+2'), u)).toBe(false);
  });

  it('follows the colour a wild named, not the wild itself', () => {
    const w = rig([[]], card('W', 'wild'), { colour: 'G' });
    expect(isValid(card('G', '2'), w)).toBe(true);
    expect(isValid(card('R', '2'), w)).toBe(false);
    // The wild's own value still matches, as a second wild.
    expect(isValid(card('W', 'wild'), w)).toBe(true);
  });

  // The rule the +4 exists for: it is a last resort, not a punisher you keep.
  it('refuses a +4 from a hand that still holds the colour in force', () => {
    const hand = [card('B', '5'), card('W', '+4')];
    expect(isValid(card('W', '+4'), u, hand)).toBe(false);
    // The blue card itself is the move that hand has.
    expect(isValid(card('B', '5'), u, hand)).toBe(true);
  });

  it('allows a +4 once the colour has run out of the hand', () => {
    const hand = [card('R', '5'), card('G', '9'), card('W', '+4')];
    expect(isValid(card('W', '+4'), u, hand)).toBe(true);
  });

  it('judges the +4 against the named colour after a wild', () => {
    const w = rig([[]], card('W', 'wild'), { colour: 'G' });
    expect(isValid(card('W', '+4'), w, [card('G', '1'), card('W', '+4')])).toBe(false);
    expect(isValid(card('W', '+4'), w, [card('B', '1'), card('W', '+4')])).toBe(true);
  });

  it('answers a live +2 stack with a +2 and nothing else', () => {
    const s = rig([[]], card('B', '+2'), { draw: 2, stack: true });
    expect(isValid(card('R', '+2'), s)).toBe(true);
    expect(isValid(card('B', '5'), s)).toBe(false);
    expect(isValid(card('W', 'wild'), s)).toBe(false);
    expect(isValid(card('W', '+4'), s, [])).toBe(false);
  });
});

// ── seat order ──────────────────────────────────────────────────────

describe('nextSeat', () => {
  it('walks the table clockwise', () => {
    expect(nextSeat(1, 0, false, 4)).toBe(1);
    expect(nextSeat(1, 3, false, 4)).toBe(0);
  });

  it('walks it back the other way without going negative', () => {
    expect(nextSeat(-1, 0, false, 4)).toBe(3);
    expect(nextSeat(-1, 1, false, 4)).toBe(0);
  });

  it('jumps a seat when the card skips', () => {
    expect(nextSeat(1, 0, true, 4)).toBe(2);
    expect(nextSeat(1, 3, true, 4)).toBe(1);
    expect(nextSeat(-1, 1, true, 4)).toBe(3);
    expect(nextSeat(-1, 0, true, 4)).toBe(2);
  });

  it('wraps at whatever the table seats', () => {
    expect(nextSeat(1, 5, false, 6)).toBe(0);
    expect(nextSeat(1, 4, true, 6)).toBe(0);
    expect(nextSeat(-1, 0, false, 6)).toBe(5);
    // Two-handed: a skip hands the turn straight back.
    expect(nextSeat(1, 0, true, 2)).toBe(0);
    expect(nextSeat(1, 0, false, 2)).toBe(1);
  });

  it('always lands on a real seat, at every table size', () => {
    for (let seats = MIN_SEATS; seats <= MAX_SEATS; seats++)
      for (const dir of [1, -1] as const)
        for (let from = 0; from < seats; from++)
          for (const skip of [false, true]) {
            const n = nextSeat(dir, from, skip, seats);
            expect(n).toBeGreaterThanOrEqual(0);
            expect(n).toBeLessThan(seats);
          }
  });
});

// ── drawing ─────────────────────────────────────────────────────────

describe('drawTo', () => {
  it('moves cards off the deck into a hand', () => {
    const u = deal(4, seeded(5));
    const before = u.deck.length;
    const held = u.hands[2].length;
    drawTo(u, 2, 3, seeded(6));
    expect(u.hands[2]).toHaveLength(held + 3);
    expect(u.deck).toHaveLength(before - 3);
  });

  // Finding: a fresh deck here puts a second copy of a card somebody already
  // holds into play, so the same face can be in two hands at once.
  it('refills from the discards rather than printing a new deck', () => {
    const u = rig([[card('R', '1')]], card('R', '5'), {
      deck: [],
      discard: [card('G', '3'), card('Y', '8'), card('B', '2')],
    });
    drawTo(u, 0, 3, seeded(11));
    expect(u.hands[0]).toHaveLength(4);
    expect(u.deck).toHaveLength(0);
    expect(u.discard).toHaveLength(0);
    expect(u.hands[0].map(key).sort()).toEqual(['B2', 'G3', 'R1', 'Y8']);
  });

  it('never lets a card exist more times than the deck holds it', () => {
    const u = deal(4, seeded(77));
    const start = census(u);
    // Empty the deck the way a long round does, then keep drawing.
    u.discard.push(...u.deck.splice(0, u.deck.length));
    drawTo(u, 0, 5, seeded(78));
    expect(census(u)).toEqual(start);
    expect(census(u)).toEqual(deckCensus());
  });

  it('stops rather than dealing undefined when nothing is left anywhere', () => {
    const u = rig([[card('R', '1')]], card('R', '5'), { deck: [], discard: [] });
    drawTo(u, 0, 3, seeded(11));
    expect(u.hands[0]).toHaveLength(1);
    expect(u.hands[0].every((c) => !!c && !!c.v)).toBe(true);
  });
});

// ── what a card does ────────────────────────────────────────────────

describe('applyCard', () => {
  const rng = seeded(3);

  it('passes the turn on for a plain number', () => {
    const u = rig([[]], card('B', '7'));
    applyCard(u, card('B', '3'), null, 0, rng);
    expect(u.turn).toBe(1);
    expect(u.dir).toBe(1);
    expect(u.top).toEqual(card('B', '3'));
    expect(u.colour).toBe('B');
  });

  it('buries the card it covered, so it can be dealt again later', () => {
    const u = rig([[]], card('B', '7'));
    applyCard(u, card('B', '3'), null, 0, rng);
    expect(u.discard.map(key)).toEqual(['B7']);
  });

  it('reverse flips the direction and hands play backwards', () => {
    const u = rig([[]], card('B', '7'));
    applyCard(u, card('B', 'rev'), null, 0, rng);
    expect(u.dir).toBe(-1);
    expect(u.turn).toBe(3);

    applyCard(u, card('B', 'rev'), null, 3, rng);
    expect(u.dir).toBe(1);
    expect(u.turn).toBe(0);
  });

  it('skip jumps the next seat', () => {
    const u = rig([[]], card('B', '7'));
    applyCard(u, card('B', 'skip'), null, 0, rng);
    expect(u.turn).toBe(2);
  });

  it('+2 lands on the seat it skips', () => {
    const u = rig([[], [card('R', '1')], [], []], card('B', '7'), { deck: [card('G', '4'), card('Y', '4')] });
    applyCard(u, card('B', '+2'), null, 0, rng);
    expect(u.hands[1]).toHaveLength(3);
    expect(u.turn).toBe(2);
  });

  it('+4 hits the next seat and names a colour', () => {
    const u = rig([[], [], [], []], card('B', '7'), {
      dir: -1,
      turn: 2,
      deck: [card('G', '4'), card('Y', '4'), card('R', '4'), card('B', '4')],
    });
    applyCard(u, card('W', '+4'), 'G', 2, rng);
    expect(u.hands[1]).toHaveLength(4);
    expect(u.turn).toBe(0);
    expect(u.colour).toBe('G');
    expect(u.top.c).toBe('W');
  });

  it('a wild takes the colour it was told, not its own', () => {
    const u = rig([[]], card('B', '7'));
    applyCard(u, card('W', 'wild'), 'Y', 0, rng);
    expect(u.colour).toBe('Y');
    expect(u.turn).toBe(1);
    expect(isValid(card('Y', '9'), u)).toBe(true);
    expect(isValid(card('B', '9'), u)).toBe(false);
  });

  it('a draw card taken backwards still hits the seat behind', () => {
    const u = rig([[], [], [], []], card('B', '7'), { dir: -1, deck: [card('G', '4'), card('Y', '4')] });
    applyCard(u, card('B', '+2'), null, 0, rng);
    expect(u.hands[3]).toHaveLength(2);
    expect(u.turn).toBe(2);
  });

  it('goes round a table of any size', () => {
    const six = rig([[]], card('B', '7'), {}, 6);
    applyCard(six, card('B', 'skip'), null, 5, rng);
    expect(six.turn).toBe(1);

    const two = rig([[]], card('B', '7'), {}, 2);
    applyCard(two, card('B', 'skip'), null, 0, rng);
    expect(two.turn).toBe(0);
  });
});

// ── stacking, the lobby's own rule ──────────────────────────────────

describe('stacking', () => {
  const rng = seeded(9);

  it('leaves a +2 for the next seat to answer instead of forcing the draw', () => {
    const u = rig([[], [card('R', '+2')], [], []], card('B', '7'), { stack: true });
    applyCard(u, card('B', '+2'), null, 0, rng);
    expect(u.draw).toBe(2);
    expect(u.turn).toBe(1);
    expect(u.hands[1]).toHaveLength(1);
    expect(isValid(u.hands[1][0], u, u.hands[1])).toBe(true);
  });

  it('piles the answers up', () => {
    const u = rig([[], [], [], []], card('B', '7'), { stack: true });
    applyCard(u, card('B', '+2'), null, 0, rng);
    applyCard(u, card('R', '+2'), null, 1, rng);
    expect(u.draw).toBe(4);
    expect(u.turn).toBe(2);
  });

  it('hands the whole pile to whoever cannot answer, and takes their turn', () => {
    const u = rig([[], [], [], []], card('B', '+2'), {
      stack: true,
      draw: 4,
      turn: 2,
      deck: Array.from({ length: 6 }, (_, i) => card('G', String(i))),
    });
    takeStack(u, 2, rng);
    expect(u.hands[2]).toHaveLength(4);
    expect(u.draw).toBe(0);
    expect(u.turn).toBe(3);
  });

  it('is off unless the lobby turned it on', () => {
    const u = rig([[], [card('R', '1')], [], []], card('B', '7'), { deck: [card('G', '4'), card('Y', '4')] });
    applyCard(u, card('B', '+2'), null, 0, rng);
    expect(u.draw).toBe(0);
    expect(u.hands[1]).toHaveLength(3);
    expect(deal(4, seeded(3)).stack).toBe(false);
    expect(deal(4, seeded(3), true).stack).toBe(true);
  });
});

// ── the bot ─────────────────────────────────────────────────────────

describe('botChoice', () => {
  it('prefers the live colour over a value match', () => {
    const u = rig([[]], card('B', '7'), { colour: 'B' });
    const hand = [card('R', '7'), card('B', '2')];
    expect(botChoice(hand, u)).toBe(1);
  });

  it('falls back to a value match when it is off colour', () => {
    const u = rig([[]], card('B', '7'), { colour: 'B' });
    const hand = [card('R', '3'), card('G', '7')];
    expect(botChoice(hand, u)).toBe(1);
  });

  it('keeps its wilds for last', () => {
    const u = rig([[]], card('B', '7'), { colour: 'B' });
    expect(botChoice([card('W', '+4'), card('B', '2')], u)).toBe(1);
    expect(botChoice([card('W', '+4'), card('R', '3')], u)).toBe(0);
  });

  it('says -1 when nothing in hand is legal', () => {
    const u = rig([[]], card('B', '7'), { colour: 'B' });
    expect(botChoice([card('R', '3'), card('G', '9')], u)).toBe(-1);
  });

  // The exact position the +4 rule forbids: a blue card in hand, blue in force.
  it('plays the colour it holds rather than the +4 it is sitting on', () => {
    const u = rig([[]], card('B', '7'), { colour: 'B' });
    const hand = [card('B', '5'), card('W', '+4')];
    const i = botChoice(hand, u);
    expect(i).toBe(0);
    expect(isValid(hand[i], u, hand)).toBe(true);
  });

  it('answers a stack with a +2 and says -1 when it has none', () => {
    const s = rig([[]], card('B', '+2'), { draw: 2, stack: true, colour: 'B' });
    expect(botChoice([card('B', '5'), card('G', '+2')], s)).toBe(1);
    expect(botChoice([card('B', '5'), card('W', 'wild')], s)).toBe(-1);
  });

  it('never names an illegal card, from any position it can face', () => {
    // Every top card the deck holds, against a hand drawn from the same deck.
    const deck = buildDeck(seeded(42));
    const rng = seeded(99);
    let checked = 0;
    for (const top of deck) {
      for (const colour of COLOURS) {
        const hand = Array.from({ length: 5 }, () => deck[Math.floor(rng() * deck.length)]);
        const u = rig([hand], top, { colour: top.c === 'W' ? colour : top.c });
        const i = botChoice(hand, u);
        if (i < 0) {
          // A -1 has to mean the hand really is dead.
          expect(hand.some((c) => isValid(c, u, hand))).toBe(false);
        } else {
          expect(i).toBeLessThan(hand.length);
          expect(isValid(hand[i], u, hand)).toBe(true);
        }
        checked++;
      }
    }
    expect(checked).toBe(432);
  });
});

describe('bestColour', () => {
  it('names whichever colour the hand holds most of', () => {
    expect(bestColour([card('R', '1'), card('R', '2'), card('B', '3')])).toBe('R');
    expect(bestColour([card('G', '1'), card('Y', '2'), card('Y', '5'), card('Y', '9')])).toBe('Y');
  });

  it('ignores the wilds it is holding', () => {
    expect(bestColour([card('W', '+4'), card('W', 'wild'), card('B', '3')])).toBe('B');
  });

  it('still names a real colour from a hand of nothing but wilds', () => {
    expect(COLOURS).toContain(bestColour([card('W', 'wild')]));
  });
});

// ── a whole match ───────────────────────────────────────────────────

interface Trace {
  winner: number;
  plies: number;
  sizes: number[];
  moves: string[];
  illegal: number;
  /** Plies where some card existed more times than the deck holds it. */
  duplicated: number;
  /** Times the round drew on an empty deck and had to turn the discards over. */
  refills: number;
}

/**
 * Plays a complete round with every seat on the engine's own bot, exactly as
 * the screen drives it: answer or swallow a stack, otherwise play if you can,
 * otherwise draw one and play it if the draw happens to fit.
 *
 * `starve` buries all but five of the undealt cards before the first move — the
 * state a long round arrives at anyway — so the reshuffle is crossed for sure.
 */
function runMatch(seed: number, seats = 4, stack = false, starve = false): Trace {
  const rng = seeded(seed);
  const u = deal(seats, rng, stack);
  const full = deckCensus();
  const moves: string[] = [];
  let plies = 0;
  let illegal = 0;
  let duplicated = 0;
  let refills = 0;

  if (starve) u.discard.push(...u.deck.splice(0, Math.max(0, u.deck.length - 5)));

  while (u.winner === null && plies < 4000) {
    plies++;
    const p = u.turn;
    const hand = u.hands[p];
    let i = botChoice(hand, u);

    if (i < 0) {
      if (u.draw > 0) {
        if (!u.deck.length) refills++;
        takeStack(u, p, rng);
        moves.push(`${p} took the pile`);
        if (JSON.stringify([...census(u)].sort()) !== JSON.stringify([...full].sort())) duplicated++;
        continue;
      }
      const held = hand.length;
      if (!u.deck.length) refills++;
      drawTo(u, p, 1, rng);
      const drawn = hand[hand.length - 1];
      if (JSON.stringify([...census(u)].sort()) !== JSON.stringify([...full].sort())) duplicated++;
      if (hand.length === held || !isValid(drawn, u, hand)) {
        u.turn = nextSeat(u.dir, p, false, u.hands.length);
        moves.push(`${p} drew`);
        continue;
      }
      i = hand.length - 1;
    }

    const played = hand[i];
    if (!isValid(played, u, hand)) illegal++;
    hand.splice(i, 1);

    if (!hand.length) {
      u.winner = p;
      u.discard.push(u.top);
      u.top = played;
      moves.push(`${p} out`);
      break;
    }
    const chosen = played.c === 'W' ? bestColour(hand) : null;
    applyCard(u, played, chosen, p, rng);
    moves.push(`${p}:${key(played)}${chosen ?? ''}`);
    if (JSON.stringify([...census(u)].sort()) !== JSON.stringify([...full].sort())) duplicated++;
  }

  return { winner: u.winner ?? -1, plies, sizes: sizes(u), moves, illegal, duplicated, refills };
}

describe('a full round', () => {
  it('reaches a terminal state with exactly one winner', () => {
    for (const seed of [1, 2, 3, 8, 21, 55, 610, 4181]) {
      const r = runMatch(seed);
      expect(r.plies).toBeLessThan(4000);
      expect(r.winner).toBeGreaterThanOrEqual(0);
      expect(r.winner).toBeLessThan(4);
      // The winner is out; nobody else is.
      expect(r.sizes[r.winner]).toBe(0);
      expect(r.sizes.filter((n) => n === 0)).toHaveLength(1);
      expect(r.illegal).toBe(0);
    }
  });

  it('does the same at every table the lobby can seat, stacking either way', () => {
    for (let seats = MIN_SEATS; seats <= MAX_SEATS; seats++)
      for (const stack of [false, true]) {
        const r = runMatch(seats * 101 + (stack ? 1 : 0), seats, stack);
        expect(r.sizes).toHaveLength(seats);
        expect(r.winner).toBeGreaterThanOrEqual(0);
        expect(r.winner).toBeLessThan(seats);
        expect(r.sizes.filter((n) => n === 0)).toHaveLength(1);
        expect(r.illegal).toBe(0);
      }
  });

  // Finding: an exhausted deck used to be replaced by a brand-new 108, which
  // puts a second copy of a card somebody is already holding into play.
  it('conserves the deck for a whole round', () => {
    for (let seed = 0; seed < 40; seed++) {
      expect(runMatch(seed).duplicated).toBe(0);
      expect(runMatch(seed, 6, true).duplicated).toBe(0);
    }
  });

  it('runs a round that empties the deck without printing new cards', () => {
    let crossed = 0;
    for (const seed of [4, 17, 33, 128, 909]) {
      for (const stack of [false, true]) {
        const r = runMatch(seed, 4, stack, true);
        crossed += r.refills;
        expect(r.duplicated).toBe(0);
        expect(r.illegal).toBe(0);
        // The round still finishes; a reshuffle is not a stuck state.
        expect(r.winner).toBeGreaterThanOrEqual(0);
        expect(r.sizes.filter((n) => n === 0)).toHaveLength(1);
      }
    }
    expect(crossed).toBeGreaterThan(0);
  });

  it('is won by emptying a hand, not by running the deck out', () => {
    const r = runMatch(97);
    expect(r.moves[r.moves.length - 1]).toBe(`${r.winner} out`);
  });

  it('lets every seat win across enough deals', () => {
    const winners = new Set<number>();
    for (let seed = 0; seed < 60; seed++) winners.add(runMatch(seed).winner);
    expect(winners.size).toBeGreaterThan(1);
  });

  it('replays identically from the same seed', () => {
    const a = runMatch(20260903);
    const b = runMatch(20260903);
    expect(b).toEqual(a);
    expect(a.moves.length).toBeGreaterThan(4);
  });

  it('plays out differently from a different seed', () => {
    const traces = [11, 12, 13, 14, 15].map((s) => runMatch(s).moves.join('|'));
    expect(new Set(traces).size).toBeGreaterThan(1);
  });
});

// ── card faces ──────────────────────────────────────────────────────

describe('presentation', () => {
  it('names every colour, wilds included', () => {
    expect(COLOURS).toEqual(['R', 'B', 'G', 'Y']);
    for (const c of COLOURS) expect(UNAME[c]).toBeTruthy();
    expect(UNAME.W).toBe('Wild');
  });

  it('gives every card a two-stop gradient', () => {
    for (const c of COLOURS) {
      expect(cardGrad(c)).toContain(UC[c][0]);
      expect(cardGrad(c)).toContain(UC[c][1]);
    }
    expect(cardGrad('W')).toBe(WILD_GRAD);
  });

  it('prints a glyph for the action cards and the number otherwise', () => {
    expect(faceOf('skip')).toBe('Ø');
    expect(faceOf('rev')).toBe('⇄');
    expect(faceOf('wild')).toBe('★');
    expect(faceOf('+2')).toBe('+2');
    expect(faceOf('+4')).toBe('+4');
    expect(faceOf('7')).toBe('7');
  });

  // A combining mark has no width of its own: set alone it renders as nothing,
  // or as a dotted circle. Every face has to be a character that stands up by
  // itself — U+20E0, the old skip face, is not one.
  it('prints faces that are standalone characters, not combining marks', () => {
    const combining = (cp: number) =>
      (cp >= 0x0300 && cp <= 0x036f) || (cp >= 0x1ab0 && cp <= 0x1aff) || (cp >= 0x20d0 && cp <= 0x20f0) || (cp >= 0xfe00 && cp <= 0xfe0f);
    for (const v of ['0', '9', 'skip', 'rev', '+2', 'wild', '+4']) {
      const face = faceOf(v);
      expect(face.length).toBeGreaterThan(0);
      for (const ch of face) expect(combining(ch.codePointAt(0) as number)).toBe(false);
    }
  });
});
