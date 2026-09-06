import { describe, expect, it } from 'vitest';
import {
  assertAgrees,
  digest,
  DivergenceError,
  hasGap,
  isMyTurn,
  moveProblem,
  nextIndex,
  orderLog,
  replay,
  seatToMove,
  type Move,
} from './lockstep';
import { makeRng, shuffle } from './contract';

const mv = (n: number, by = 'a', data: any = n): Move => ({ n, by, data, at: 1000 + n });

describe('orderLog', () => {
  it('sorts moves that arrived out of order', () => {
    expect(orderLog([mv(2), mv(0), mv(1)]).map((m) => m.n)).toEqual([0, 1, 2]);
  });

  it('stops at the first gap rather than applying past it', () => {
    // Applying 3 without 2 computes a state no other phone will ever hold.
    expect(orderLog([mv(0), mv(1), mv(3), mv(4)]).map((m) => m.n)).toEqual([0, 1]);
  });

  it('keeps the first writer of an index and ignores the retry', () => {
    const first = mv(0, 'a', 'first');
    const retry = mv(0, 'a', 'retry');
    expect(orderLog([first, retry])[0].data).toBe('first');
  });

  it('ignores malformed entries instead of trusting them', () => {
    expect(orderLog([mv(0), { n: -1 } as Move, { n: 1.5 } as Move, null as never])).toHaveLength(1);
  });

  it('is empty when the log is', () => {
    expect(orderLog([])).toEqual([]);
  });

  it('is empty when move 0 never arrived', () => {
    expect(orderLog([mv(1), mv(2)])).toEqual([]);
  });
});

describe('nextIndex', () => {
  it('is 0 for a fresh match', () => {
    expect(nextIndex([])).toBe(0);
  });

  it('is the first unfilled slot', () => {
    expect(nextIndex([mv(0), mv(1)])).toBe(2);
  });

  it('points at the gap, not past it', () => {
    expect(nextIndex([mv(0), mv(2), mv(3)])).toBe(1);
  });
});

describe('hasGap', () => {
  it('knows when something is still in flight', () => {
    expect(hasGap([mv(0), mv(2)])).toBe(true);
  });

  it('is quiet for a complete log', () => {
    expect(hasGap([mv(0), mv(1)])).toBe(false);
    expect(hasGap([])).toBe(false);
  });
});

describe('replay', () => {
  const sum = (s: number, m: Move) => s + (m.data as number);

  it('folds the log in order', () => {
    expect(replay(sum, 0, [mv(2, 'a', 4), mv(0, 'a', 1), mv(1, 'a', 2)])).toEqual({
      state: 7,
      upTo: 3,
    });
  });

  it('stops at a gap and says how far it got', () => {
    expect(replay(sum, 0, [mv(0, 'a', 1), mv(2, 'a', 4)])).toEqual({ state: 1, upTo: 1 });
  });

  it('resumes from where the client already was', () => {
    // A long round must not replay from move 0 on every poll.
    const log = [mv(0, 'a', 1), mv(1, 'a', 2), mv(2, 'a', 4)];
    expect(replay(sum, 3, log, 2).state).toBe(7);
  });

  it('two clients holding different slices of the log agree once both are full', () => {
    const log = [mv(0, 'a', 1), mv(1, 'b', 2), mv(2, 'a', 4)];
    const slow = replay(sum, 0, log.slice(0, 2));
    const caughtUp = replay(sum, slow.state, log, slow.upTo);
    expect(caughtUp.state).toBe(replay(sum, 0, log).state);
  });
});

describe('turn order', () => {
  const seats = ['uidA', 'uidB', 'uidC'];

  it('cycles the seats as moves land', () => {
    expect(seatToMove([], 3)).toBe(0);
    expect(seatToMove([mv(0)], 3)).toBe(1);
    expect(seatToMove([mv(0), mv(1)], 3)).toBe(2);
    expect(seatToMove([mv(0), mv(1), mv(2)], 3)).toBe(0);
  });

  it('says whose turn it is', () => {
    expect(isMyTurn([], seats, 'uidA')).toBe(true);
    expect(isMyTurn([], seats, 'uidB')).toBe(false);
    expect(isMyTurn([mv(0)], seats, 'uidB')).toBe(true);
  });

  it('handles an empty table without dividing by zero', () => {
    expect(seatToMove([mv(0)], 0)).toBe(0);
    expect(isMyTurn([], [], 'uidA')).toBe(false);
  });
});

describe('moveProblem', () => {
  const seats = ['uidA', 'uidB'];

  it('lets the player to move play the next index', () => {
    expect(moveProblem([], seats, 'uidA', 0)).toBeNull();
  });

  it('refuses a spectator', () => {
    expect(moveProblem([], seats, 'uidZ', 0)).toMatch(/not in this match/i);
  });

  it('refuses a move out of turn', () => {
    expect(moveProblem([], seats, 'uidB', 0)).toMatch(/not your turn/i);
  });

  it('refuses a stale index, which is what a slow tap looks like', () => {
    expect(moveProblem([mv(0)], seats, 'uidA', 0)).toMatch(/moved on/i);
  });
});

describe('digest', () => {
  it('is stable for equal states regardless of key order', () => {
    // Object key order differs between two clients that built state by
    // different routes; the digest must not.
    expect(digest({ a: 1, b: [2, 3] })).toBe(digest({ b: [2, 3], a: 1 }));
  });

  it('differs when the state differs', () => {
    expect(digest({ a: 1 })).not.toBe(digest({ a: 2 }));
    expect(digest([1, 2])).not.toBe(digest([2, 1]));
  });

  it('handles the primitives and nesting a game state contains', () => {
    for (const v of [null, 0, '', false, [], {}, { a: [{ b: null }] }]) {
      expect(typeof digest(v)).toBe('string');
    }
  });
});

describe('assertAgrees', () => {
  it('passes when both phones computed the same thing', () => {
    expect(() => assertAgrees('abc', 'abc', 4)).not.toThrow();
  });

  it('says nothing when there is nothing to compare against', () => {
    expect(() => assertAgrees('abc', undefined, 4)).not.toThrow();
  });

  it('reports divergence loudly, with the move it happened at', () => {
    // The alternative is two people arguing about whose screen is right.
    try {
      assertAgrees('abc', 'def', 7);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(DivergenceError);
      expect((e as DivergenceError).at).toBe(7);
    }
  });
});

describe('the determinism lockstep depends on', () => {
  it('gives two clients the same shuffle from the same seed', () => {
    // If this ever fails, every game in the app desynchronises silently.
    const deck = Array.from({ length: 52 }, (_, i) => i);
    const a = shuffle(deck, makeRng(1234));
    const b = shuffle(deck, makeRng(1234));
    expect(a).toEqual(b);
    expect(digest(a)).toBe(digest(b));
  });

  it('gives different seeds different shuffles', () => {
    const deck = Array.from({ length: 52 }, (_, i) => i);
    expect(shuffle(deck, makeRng(1))).not.toEqual(shuffle(deck, makeRng(2)));
  });

  it('stays in step across a long run of draws', () => {
    const a = makeRng(99);
    const b = makeRng(99);
    for (let i = 0; i < 5000; i++) expect(a()).toBe(b());
  });
});
