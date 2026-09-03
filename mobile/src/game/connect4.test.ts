import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeRng, type Rng } from './contract';
import {
  COLS,
  ROWS,
  botMove,
  emptyBoard,
  findWin,
  lowest,
  place,
  type Board,
  type Disc,
} from './connect4';

/**
 * Connect 4 is a small enough rule set that every clause of it can be stated as
 * a board: gravity, the four directions a line can run in, the wrap the index
 * arithmetic must not fall for, and the two moves that separate a bot from a
 * random column — taking its own four, and stopping yours.
 */

const ALL = Array.from({ length: COLS }, (_, c) => c);

/**
 * A board written the way it looks, top row first: `.` empty, `y` yours,
 * `b` theirs. Six rows of seven, and nothing may float.
 */
function build(rows: string[]): Board {
  expect(rows).toHaveLength(ROWS);
  const b: Board = emptyBoard();
  rows.forEach((line, r) => {
    expect(line).toHaveLength(COLS);
    [...line].forEach((ch, c) => {
      b[r * COLS + c] = ch === 'y' ? 'you' : ch === 'b' ? 'bot' : null;
    });
  });
  // Gravity is a property of the fixture too — a hole under a disc would make
  // every assertion built on it meaningless.
  for (let c = 0; c < COLS; c++)
    for (let r = 0; r < ROWS - 1; r++)
      if (b[r * COLS + c] && !b[(r + 1) * COLS + c]) throw new Error(`floating disc at column ${c + 1}`);
  return b;
}

/** Play a sequence of columns, alternating from `first`. */
function drops(cols: number[], first: Disc = 'you'): Board {
  let b = emptyBoard();
  let p = first;
  for (const c of cols) {
    const n = place(b, c, p);
    if (!n) throw new Error(`column ${c + 1} was full`);
    b = n;
    p = p === 'you' ? 'bot' : 'you';
  }
  return b;
}

const legal = (b: Board) => ALL.filter((c) => lowest(b, c) >= 0);
const full = (b: Board) => !b.includes(null);

/** `botMove` reads the table from its own side, so a mirror plays it as you. */
const swap = (b: Board): Board => b.map((v) => (v === 'you' ? 'bot' : v === 'bot' ? 'you' : null));

describe('the grid', () => {
  it('is seven columns by six rows, empty', () => {
    const b = emptyBoard();
    expect(b).toHaveLength(COLS * ROWS);
    expect(b.every((v) => v === null)).toBe(true);
    expect(COLS).toBe(7);
    expect(ROWS).toBe(6);
  });

  it('stacks discs from the bottom up', () => {
    let b = emptyBoard();
    // Six drops into one column fill rows 5, 4, 3, 2, 1, 0 in that order.
    for (let i = 0; i < ROWS; i++) {
      expect(lowest(b, 4)).toBe(ROWS - 1 - i);
      b = place(b, 4, 'you') as Board;
      expect(b[(ROWS - 1 - i) * COLS + 4]).toBe('you');
    }
    expect(lowest(b, 4)).toBe(-1);
  });

  it('leaves the board it was given untouched', () => {
    const b = emptyBoard();
    const n = place(b, 0, 'you');
    expect(n).not.toBe(b);
    expect(b.every((v) => v === null)).toBe(true);
    expect(n?.[5 * COLS]).toBe('you');
  });
});

describe('legal and illegal moves', () => {
  it('accepts a drop into any column with room', () => {
    const b = drops([0, 1, 2, 3, 4, 5, 6]);
    for (const c of ALL) {
      expect(lowest(b, c)).toBeGreaterThanOrEqual(0);
      expect(place(b, c, 'you')).not.toBeNull();
    }
  });

  it('rejects a drop into a full column', () => {
    const b = drops([2, 2, 2, 2, 2, 2]);
    expect(lowest(b, 2)).toBe(-1);
    expect(place(b, 2, 'you')).toBeNull();
    expect(place(b, 2, 'bot')).toBeNull();
    // Every other column is still open.
    expect(legal(b)).toEqual([0, 1, 3, 4, 5, 6]);
  });

  it('rejects every drop once the board is full', () => {
    let b = emptyBoard();
    let p: Disc = 'you';
    // Fill column by column; the pattern does not matter, only that it fills.
    for (const c of ALL)
      for (let r = 0; r < ROWS; r++) {
        b = place(b, c, p) as Board;
        p = p === 'you' ? 'bot' : 'you';
      }
    expect(full(b)).toBe(true);
    for (const c of ALL) expect(place(b, c, 'you')).toBeNull();
    expect(botMove(b, makeRng(1))).toBeNull();
  });
});

describe('four in a line wins — across, down or diagonal', () => {
  const lineOf = (b: Board, p: Disc) => {
    const w = findWin(b, p);
    expect(w).not.toBeNull();
    expect(w).toHaveLength(4);
    for (const i of w as number[]) expect(b[i]).toBe(p);
    return w as number[];
  };

  it('finds a horizontal four', () => {
    const b = build([
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '.yyyy..',
    ]);
    expect(lineOf(b, 'you')).toEqual([36, 37, 38, 39]);
    expect(findWin(b, 'bot')).toBeNull();
  });

  it('finds a vertical four', () => {
    const b = build([
      '.......',
      '.......',
      '..b....',
      '..b....',
      '..b....',
      '..b....',
    ]);
    expect(lineOf(b, 'bot')).toEqual([16, 23, 30, 37]);
  });

  it('finds a four on the down-right diagonal', () => {
    const b = build([
      '.......',
      '.......',
      'y......',
      'by.....',
      'bby....',
      'bbby...',
    ]);
    expect(lineOf(b, 'you')).toEqual([14, 22, 30, 38]);
  });

  it('finds a four on the down-left diagonal', () => {
    const b = build([
      '.......',
      '.......',
      '...y...',
      '...by..',
      '...bby.',
      '...bbby',
    ]);
    expect(lineOf(b, 'you')).toEqual([17, 25, 33, 41]);
  });

  it('does not read three as four, or a line that wraps the edge', () => {
    const three = build([
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '..yyy..',
    ]);
    expect(findWin(three, 'you')).toBeNull();

    // Row 4 ends yy and row 5 starts yy: contiguous in the flat array, but two
    // different rows on the board and not a line.
    const wrapped = build([
      '.......',
      '.......',
      '.......',
      '.......',
      '.....yy',
      'yy...bb',
    ]);
    expect(findWin(wrapped, 'you')).toBeNull();
  });

  it('an empty board has no winner', () => {
    expect(findWin(emptyBoard(), 'you')).toBeNull();
    expect(findWin(emptyBoard(), 'bot')).toBeNull();
  });
});

describe('the bot', () => {
  afterEach(() => vi.restoreAllMocks());

  it('opens in the centre, or at worst one column off it', () => {
    // An empty board has nothing to take and nothing to block, so the centre
    // bias is the whole of the decision — and it is the roll, not the global.
    expect(botMove(emptyBoard(), () => 0)).toBe(3);
    expect(botMove(emptyBoard(), () => 0.99)).toBe(2);
    for (let seed = 1; seed <= 50; seed++) expect([3, 2]).toContain(botMove(emptyBoard(), makeRng(seed)) as number);
  });

  it('takes every roll from the Rng it is handed, never Math.random', () => {
    // The screen seeds one stream for a whole match and these tests seed their
    // own; an engine that reaches for the global makes both a fiction, and the
    // suite itself flaky.
    const spy = vi.spyOn(Math, 'random');

    const play = (rng: Rng) => {
      let b = emptyBoard();
      let p: Disc = 'bot';
      const cols: number[] = [];
      while (!full(b) && !findWin(b, 'you') && !findWin(b, 'bot')) {
        // Both seats play the engine, one through the mirror, so every ply is a
        // decision it made rather than one handed to it.
        const c = botMove(p === 'bot' ? b : swap(b), rng) as number;
        expect(legal(b)).toContain(c);
        cols.push(c);
        b = place(b, c, p) as Board;
        p = p === 'you' ? 'bot' : 'you';
      }
      return cols;
    };

    const first = play(makeRng(77));
    expect(first.length).toBeGreaterThan(6);
    expect(play(makeRng(77))).toEqual(first);
    expect(play(makeRng(78))).not.toEqual(first);
    expect(spy).not.toHaveBeenCalled();
  });

  it('takes its own four rather than blocking yours', () => {
    // It is three across the bottom of columns 1–3, open at column 4; you are
    // three up column 0, open at row 2. Both threats are live, and taking its
    // own is the move that ends the game before yours matters.
    const b = build([
      '.......',
      '.......',
      '.......',
      'y......',
      'y......',
      'ybbb...',
    ]);
    expect(findWin(b, 'bot')).toBeNull();
    expect(findWin(place(b, 0, 'you') as Board, 'you')).not.toBeNull();
    const c = botMove(b, makeRng(5)) as number;
    expect(c).toBe(4);
    expect(findWin(place(b, c, 'bot') as Board, 'bot')).not.toBeNull();
  });

  it('blocks your four when it has none of its own', () => {
    const b = build([
      '.......',
      '.......',
      '.......',
      '.......',
      '......b',
      'byyy..b',
    ]);
    // Nothing on the board wins for it this move, so the block is all it has.
    expect(legal(b).every((c) => findWin(place(b, c, 'bot') as Board, 'bot') === null)).toBe(true);
    // Column 0 is plugged, so column 4 is the only end of your three.
    expect(findWin(place(b, 4, 'you') as Board, 'you')).not.toBeNull();
    expect(botMove(b, makeRng(5))).toBe(4);
  });

  it('blocks a vertical three as readily as a horizontal one', () => {
    const b = build([
      '.......',
      '.......',
      '.......',
      '.y.....',
      '.y....b',
      '.y....b',
    ]);
    expect(botMove(b, makeRng(5))).toBe(1);
  });

  it('returns a legal column from every position it can reach', () => {
    const rng = makeRng(20260903);
    for (let game = 0; game < 60; game++) {
      let b = emptyBoard();
      let p: Disc = 'you';
      while (!full(b) && !findWin(b, 'you') && !findWin(b, 'bot')) {
        const open = legal(b);
        // Half the seats play the engine's line, half drop at random, so the
        // positions handed to it are not only the ones it steers towards.
        const c =
          p === 'bot'
            ? (botMove(b, rng) as number)
            : open[Math.floor(rng() * open.length)];
        expect(open).toContain(c);
        b = place(b, c, p) as Board;
        p = p === 'you' ? 'bot' : 'you';
      }
    }
  });

  it('never picks a full column', () => {
    // Five of seven columns are capped; the answer must be one of the other two.
    const b = build([
      'by.by.b',
      'yb.yb.y',
      'by.by.b',
      'yb.ybby',
      'by.byyb',
      'yb.ybby',
    ]);
    const rng = makeRng(31337);
    for (let i = 0; i < 40; i++) expect([2, 5]).toContain(botMove(b, rng) as number);
  });
});

describe('a full match', () => {
  /**
   * Both seats play the engine, one of them through the mirror, off a single
   * seeded stream handed straight to it — the same way the screen drives it.
   */
  function selfPlay(rng: Rng) {
    let b = emptyBoard();
    let p: Disc = 'you';
    const moves: number[] = [];
    for (let ply = 0; ply < COLS * ROWS; ply++) {
      if (findWin(b, 'you') || findWin(b, 'bot') || full(b)) break;
      const c = (p === 'bot' ? botMove(b, rng) : botMove(swap(b), rng)) as number;
      expect(legal(b)).toContain(c);
      moves.push(c);
      b = place(b, c, p) as Board;
      p = p === 'you' ? 'bot' : 'you';
    }
    return { board: b, moves };
  }

  it('reaches a terminal state with at most one winner', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const { board } = selfPlay(makeRng(seed));

      const yours = findWin(board, 'you');
      const theirs = findWin(board, 'bot');
      // Only one side can have completed a four: the board closes the moment
      // one does, so the other never gets the move that would make it two.
      expect(yours !== null && theirs !== null).toBe(false);
      expect(yours !== null || theirs !== null || full(board)).toBe(true);

      // Turn order held all the way: you opened, so you are never behind.
      const y = board.filter((v) => v === 'you').length;
      const o = board.filter((v) => v === 'bot').length;
      expect(y - o).toBeGreaterThanOrEqual(0);
      expect(y - o).toBeLessThanOrEqual(1);
    }
  });

  it('both sides can win — the bot is beatable and it can beat you', () => {
    const outcomes = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const { board } = selfPlay(makeRng(seed * 7919));
      outcomes.add(findWin(board, 'you') ? 'you' : findWin(board, 'bot') ? 'bot' : 'draw');
    }
    expect(outcomes.has('you')).toBe(true);
    expect(outcomes.has('bot')).toBe(true);
  });

  it('replays identically from the same seed, and differently from another', () => {
    const a = selfPlay(makeRng(4242));
    const b = selfPlay(makeRng(4242));
    const c = selfPlay(makeRng(4243));

    expect(a.moves).toEqual(b.moves);
    expect(a.board).toEqual(b.board);
    expect(a.moves.length).toBeGreaterThan(6);
    expect(c.moves).not.toEqual(a.moves);
  });
});
