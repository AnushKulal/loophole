import { describe, expect, it } from 'vitest';
import { makeRng } from './contract';
import {
  COLOURS,
  UC,
  UNAME,
  WILD_GRAD,
  applyCard,
  bestColour,
  botChoice,
  buildDeck,
  cardGrad,
  deal,
  drawTo,
  faceOf,
  isValid,
  nextSeat,
  type Card,
  type CardColour,
  type Colour,
  type UnoState,
} from './uno';

/**
 * The UNO engine shuffles with `Math.random`, so every test that needs a
 * repeatable deal runs inside `seeded`, which swaps in a mulberry32 stream for
 * the duration of the call. That is what makes a whole simulated match
 * reproducible from a single number.
 */
function seeded<T>(seed: number, fn: () => T): T {
  const real = Math.random;
  Math.random = makeRng(seed);
  try {
    return fn();
  } finally {
    Math.random = real;
  }
}

/** A hand-built table, so a rule can be checked without waiting for a deal. */
function rig(hands: Card[][], top: Card, over: Partial<UnoState> = {}): UnoState {
  return {
    deck: [],
    hands: [hands[0] ?? [], hands[1] ?? [], hands[2] ?? [], hands[3] ?? []],
    top,
    colour: top.c,
    turn: 0,
    dir: 1,
    need: false,
    pending: null,
    winner: null,
    log: '',
    ...over,
  };
}

const card = (c: CardColour, v: string): Card => ({ c, v });
const sizes = (u: UnoState) => u.hands.map((h) => h.length);

// ── the deck ────────────────────────────────────────────────────────

describe('the deck', () => {
  it('is the standard 108 cards', () => {
    const d = seeded(7, buildDeck);
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
    const a = seeded(1, buildDeck);
    const b = seeded(2, buildDeck);
    expect(a.map((c) => `${c.c}${c.v}`).join()).not.toEqual(b.map((c) => `${c.c}${c.v}`).join());
  });
});

describe('the deal', () => {
  it('gives four seats seven cards each and turns a playable starter', () => {
    for (const seed of [3, 19, 404, 90210]) {
      const u = seeded(seed, deal);
      expect(sizes(u)).toEqual([7, 7, 7, 7]);
      // 108 minus 28 dealt minus the one on the discard.
      expect(u.deck).toHaveLength(79);
      expect(u.top.c).not.toBe('W');
      expect(u.colour).toBe(u.top.c);
      expect(u.turn).toBe(0);
      expect(u.dir).toBe(1);
      expect(u.winner).toBeNull();
      expect(u.need).toBe(false);
      expect(u.pending).toBeNull();
    }
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

  it('accepts any wild', () => {
    expect(isValid(card('W', 'wild'), u)).toBe(true);
    expect(isValid(card('W', '+4'), u)).toBe(true);
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
});

// ── seat order ──────────────────────────────────────────────────────

describe('nextSeat', () => {
  it('walks the table clockwise', () => {
    expect(nextSeat(1, 0, false)).toBe(1);
    expect(nextSeat(1, 3, false)).toBe(0);
  });

  it('walks it back the other way without going negative', () => {
    expect(nextSeat(-1, 0, false)).toBe(3);
    expect(nextSeat(-1, 1, false)).toBe(0);
  });

  it('jumps a seat when the card skips', () => {
    expect(nextSeat(1, 0, true)).toBe(2);
    expect(nextSeat(1, 3, true)).toBe(1);
    expect(nextSeat(-1, 1, true)).toBe(3);
    expect(nextSeat(-1, 0, true)).toBe(2);
  });

  it('always lands on a real seat', () => {
    for (const dir of [1, -1] as const)
      for (let from = 0; from < 4; from++)
        for (const skip of [false, true]) {
          const n = nextSeat(dir, from, skip);
          expect(n).toBeGreaterThanOrEqual(0);
          expect(n).toBeLessThan(4);
        }
  });
});

// ── drawing ─────────────────────────────────────────────────────────

describe('drawTo', () => {
  it('moves cards off the deck into a hand', () => {
    const u = seeded(5, deal);
    const before = u.deck.length;
    drawTo(u, 2, 3);
    expect(sizes(u)).toEqual([7, 7, 10, 7]);
    expect(u.deck).toHaveLength(before - 3);
  });

  it('reshuffles a fresh deck rather than dealing undefined', () => {
    const u = rig([[card('R', '1')]], card('R', '5'));
    u.deck = [];
    seeded(11, () => drawTo(u, 0, 3));
    expect(u.hands[0]).toHaveLength(4);
    expect(u.hands[0].every((c) => !!c && !!c.v)).toBe(true);
    expect(u.deck).toHaveLength(105);
  });
});

// ── what a card does ────────────────────────────────────────────────

describe('applyCard', () => {
  it('passes the turn on for a plain number', () => {
    const u = rig([[]], card('B', '7'));
    applyCard(u, card('B', '3'), null, 0);
    expect(u.turn).toBe(1);
    expect(u.dir).toBe(1);
    expect(u.top).toEqual(card('B', '3'));
    expect(u.colour).toBe('B');
  });

  it('reverse flips the direction and hands play backwards', () => {
    const u = rig([[]], card('B', '7'));
    applyCard(u, card('B', 'rev'), null, 0);
    expect(u.dir).toBe(-1);
    expect(u.turn).toBe(3);

    applyCard(u, card('B', 'rev'), null, 3);
    expect(u.dir).toBe(1);
    expect(u.turn).toBe(0);
  });

  it('skip jumps the next seat', () => {
    const u = rig([[]], card('B', '7'));
    applyCard(u, card('B', 'skip'), null, 0);
    expect(u.turn).toBe(2);
  });

  it('+2 lands on the seat it skips', () => {
    const u = rig([[], [card('R', '1')], [], []], card('B', '7'));
    applyCard(u, card('B', '+2'), null, 0);
    expect(u.hands[1]).toHaveLength(3);
    expect(u.turn).toBe(2);
  });

  it('+4 hits the next seat and names a colour', () => {
    const u = rig([[], [], [], []], card('B', '7'), { dir: -1, turn: 2 });
    applyCard(u, card('W', '+4'), 'G', 2);
    expect(u.hands[1]).toHaveLength(4);
    expect(u.turn).toBe(0);
    expect(u.colour).toBe('G');
    expect(u.top.c).toBe('W');
  });

  it('a wild takes the colour it was told, not its own', () => {
    const u = rig([[]], card('B', '7'));
    applyCard(u, card('W', 'wild'), 'Y', 0);
    expect(u.colour).toBe('Y');
    expect(u.turn).toBe(1);
    expect(isValid(card('Y', '9'), u)).toBe(true);
    expect(isValid(card('B', '9'), u)).toBe(false);
  });

  it('a draw card taken backwards still hits the seat behind', () => {
    const u = rig([[], [], [], []], card('B', '7'), { dir: -1 });
    applyCard(u, card('B', '+2'), null, 0);
    expect(u.hands[3]).toHaveLength(2);
    expect(u.turn).toBe(2);
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

  it('never names an illegal card, from any position it can face', () => {
    // Every top card the deck holds, against a hand drawn from the same deck.
    const deck = seeded(42, buildDeck);
    const rng = makeRng(99);
    let checked = 0;
    for (const top of deck) {
      for (const colour of ['R', 'B', 'G', 'Y'] as Colour[]) {
        const hand = Array.from({ length: 5 }, () => deck[Math.floor(rng() * deck.length)]);
        const u = rig([hand], top, { colour: top.c === 'W' ? colour : top.c });
        const i = botChoice(hand, u);
        if (i < 0) {
          // A -1 has to mean the hand really is dead.
          expect(hand.some((c) => isValid(c, u))).toBe(false);
        } else {
          expect(i).toBeLessThan(hand.length);
          expect(isValid(hand[i], u)).toBe(true);
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
}

/**
 * Plays a complete round with all four seats on the engine's own bot, exactly
 * as the screen drives it: play if you can, otherwise draw one and play it if
 * the draw happens to fit.
 */
function runMatch(seed: number): Trace {
  return seeded(seed, () => {
    const u = deal();
    const moves: string[] = [];
    let plies = 0;
    let illegal = 0;

    while (u.winner === null && plies < 4000) {
      plies++;
      const p = u.turn;
      const hand = u.hands[p];
      let i = botChoice(hand, u);

      if (i < 0) {
        drawTo(u, p, 1);
        const drawn = hand[hand.length - 1];
        if (!isValid(drawn, u)) {
          u.turn = nextSeat(u.dir, p, false);
          moves.push(`${p} drew`);
          continue;
        }
        i = hand.length - 1;
      }

      const played = hand[i];
      if (!isValid(played, u)) illegal++;
      hand.splice(i, 1);

      if (!hand.length) {
        u.winner = p;
        moves.push(`${p} out`);
        break;
      }
      const chosen = played.c === 'W' ? bestColour(hand) : null;
      applyCard(u, played, chosen, p);
      moves.push(`${p}:${played.c}${played.v}${chosen ?? ''}`);
    }

    return { winner: u.winner ?? -1, plies, sizes: sizes(u), moves, illegal };
  });
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
    expect(faceOf('skip')).toBe('⃠');
    expect(faceOf('rev')).toBe('⇄');
    expect(faceOf('wild')).toBe('★');
    expect(faceOf('+2')).toBe('+2');
    expect(faceOf('+4')).toBe('+4');
    expect(faceOf('7')).toBe('7');
  });
});
