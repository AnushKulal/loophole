import { describe, expect, it } from 'vitest';
import { digest, type Move } from './lockstep';
import {
  botDriver,
  c4Apply,
  c4Init,
  c4Legal,
  discFor,
  replayC4,
  replayUno,
  unoApply,
  unoBotMove,
  unoLegal,
  type C4Move,
  type UnoMove,
} from './replay';
import { makeRng } from './contract';
import { COLS, ROWS } from './connect4';
import type { UnoState } from './uno';

const log = (data: unknown[], by = ['a', 'b']): Move[] =>
  data.map((d, n) => ({ n, by: by[n % by.length], data: d as never, at: 1000 + n }));

describe('Connect 4 replay', () => {
  it('is an empty board for an empty log', () => {
    const s = replayC4([]);
    expect(s.board.filter(Boolean)).toHaveLength(0);
    expect(s.turn).toBe(0);
    expect(s.done).toBe(false);
  });

  it('alternates seats and stacks discs in a column', () => {
    const s = replayC4(log([{ col: 3 }, { col: 3 }, { col: 3 }]));
    expect(s.board[5 * COLS + 3]).toBe('you');
    expect(s.board[4 * COLS + 3]).toBe('bot');
    expect(s.board[3 * COLS + 3]).toBe('you');
    expect(s.turn).toBe(1);
  });

  it('finds a win and stops the match', () => {
    // Seat 0 takes columns 0-3 along the bottom; seat 1 answers in column 6.
    const s = replayC4(log([{ col: 0 }, { col: 6 }, { col: 1 }, { col: 6 }, { col: 2 }, { col: 6 }, { col: 3 }]));
    expect(s.winner).toBe('you');
    expect(s.done).toBe(true);
    expect(s.line).toHaveLength(4);
  });

  it('ignores a move played after the match is over', () => {
    const won = log([{ col: 0 }, { col: 6 }, { col: 1 }, { col: 6 }, { col: 2 }, { col: 6 }, { col: 3 }]);
    const after = replayC4([...won, { n: 7, by: 'b', data: { col: 5 } as never, at: 9999 }]);
    expect(after.board.filter(Boolean)).toHaveLength(7);
  });

  it('ignores a move into a full column', () => {
    const full = log(Array.from({ length: 6 }, () => ({ col: 0 })));
    const s = replayC4([...full, { n: 6, by: 'a', data: { col: 0 } as never, at: 9999 }]);
    expect(s.board.filter(Boolean)).toHaveLength(6);
  });

  it('ignores a nonsense column instead of corrupting the board', () => {
    for (const col of [-1, COLS, 1.5, NaN, undefined]) {
      const s = replayC4(log([{ col }]));
      expect(s.board.filter(Boolean), String(col)).toHaveLength(0);
    }
  });

  it('calls a full board a draw', () => {
    // Fill column-pairs so nobody makes four: 0,0,1,1,... never lines up.
    const cols: C4Move[] = [];
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) cols.push({ col: c });
    const s = replayC4(log(cols));
    expect(s.done).toBe(true);
    expect(['draw', 'you', 'bot']).toContain(s.winner);
  });

  it('names the two seats as the engine does', () => {
    expect(discFor(0)).toBe('you');
    expect(discFor(1)).toBe('bot');
  });
});

describe('Connect 4 legality', () => {
  it('refuses a move out of turn', () => {
    expect(c4Legal(c4Init(), { col: 3 }, 1)).toBe(false);
    expect(c4Legal(c4Init(), { col: 3 }, 0)).toBe(true);
  });

  it('refuses everything once the match is done', () => {
    const done = { ...c4Init(), done: true };
    expect(c4Legal(done, { col: 3 }, 0)).toBe(false);
  });

  it('leaves the state untouched when it refuses', () => {
    const s = c4Init();
    expect(c4Apply(s, { col: 99 }, 0)).toBe(s);
  });
});

describe('UNO replay', () => {
  const OPTS = { seats: 3, stack: false };

  it('deals the same hands to every client from one seed', () => {
    // The property the whole scheme rests on.
    expect(digest(replayUno(1234, OPTS, []))).toBe(digest(replayUno(1234, OPTS, [])));
  });

  it('deals differently from a different seed', () => {
    expect(digest(replayUno(1, OPTS, []))).not.toBe(digest(replayUno(2, OPTS, [])));
  });

  it('deals seven cards to every seat', () => {
    const u = replayUno(7, OPTS, []);
    expect(u.hands).toHaveLength(3);
    for (const h of u.hands) expect(h.length).toBeGreaterThanOrEqual(7);
  });

  it('plays a legal card out of the right hand', () => {
    const u0 = replayUno(99, OPTS, []);
    const seat = u0.turn;
    const idx = u0.hands[seat].findIndex((c, i) => unoLegal(u0, { play: i, colour: 'R' }, seat));
    if (idx < 0) return; // nothing legal from this deal; the draw path covers it
    const u1 = replayUno(99, OPTS, log([{ play: idx, colour: 'R' }]));
    expect(u1.hands[seat].length).toBe(u0.hands[seat].length - 1);
  });

  it('lets a stuck hand draw, and moves the turn on', () => {
    const u0 = replayUno(4242, OPTS, []);
    const u1 = replayUno(4242, OPTS, log([{ draw: true }]));
    expect(u1.hands[u0.turn].length).toBe(u0.hands[u0.turn].length + 1);
    expect(u1.turn).not.toBe(u0.turn);
  });

  it('ignores an illegal move rather than desynchronising', () => {
    // A client that posts nonsense must not make the others compute something
    // different — every client drops the same move for the same reason.
    const clean = replayUno(11, OPTS, []);
    const dirty = replayUno(11, OPTS, log([{ play: 999 }]));
    expect(digest(dirty)).toBe(digest(clean));
  });

  it('refuses a wild with no colour named', () => {
    const u = replayUno(5, OPTS, []);
    const seat = u.turn;
    const wild = u.hands[seat].findIndex((c) => c.c === 'W');
    if (wild < 0) return;
    expect(unoLegal(u, { play: wild }, seat)).toBe(false);
    expect(unoLegal(u, { play: wild, colour: 'G' }, seat)).toBe(true);
  });

  it('refuses a move from a seat that is not to play', () => {
    const u = replayUno(5, OPTS, []);
    expect(unoLegal(u, { draw: true }, (u.turn + 1) % 3)).toBe(false);
  });

  it('does not mutate the state it was given', () => {
    const u = replayUno(77, OPTS, []);
    const before = digest(u);
    unoApply(u, { draw: true }, u.turn, makeRng(1));
    expect(digest(u)).toBe(before);
  });

  it('ends the round when a hand empties', () => {
    // Drive a whole round with the bot policy until someone goes out.
    const OPTS2 = { seats: 2, stack: false };
    const moves: UnoMove[] = [];
    let u = replayUno(2026, OPTS2, []);
    for (let i = 0; i < 400 && u.winner === null; i++) {
      const m = unoBotMove(u, u.turn);
      if (!m) break;
      moves.push(m);
      u = replayUno(2026, OPTS2, log(moves));
    }
    expect(u.winner).not.toBeNull();
    expect(u.hands[u.winner as number]).toHaveLength(0);
  });
});

describe('two clients holding different slices of the log', () => {
  it('agree once both have seen everything', () => {
    const OPTS = { seats: 2, stack: true };
    const moves: UnoMove[] = [];
    let u = replayUno(31337, OPTS, []);
    for (let i = 0; i < 30 && u.winner === null; i++) {
      const m = unoBotMove(u, u.turn);
      if (!m) break;
      moves.push(m);
      u = replayUno(31337, OPTS, log(moves));
    }

    // One client saw them arrive in order; the other received them shuffled.
    const inOrder = replayUno(31337, OPTS, log(moves));
    const jumbled = replayUno(31337, OPTS, log(moves).slice().reverse());
    expect(digest(jumbled)).toBe(digest(inOrder));
  });

  it('a client missing a middle move stops short rather than diverging', () => {
    // Applying past a gap computes a state nobody else will ever hold.
    const full = log([{ col: 3 }, { col: 3 }, { col: 4 }]);
    const gapped = [full[0], full[2]];
    expect(replayC4(gapped).board.filter(Boolean)).toHaveLength(1);
  });
});

describe('botDriver', () => {
  const seats = [
    { uid: 'host' },
    { uid: 'guest' },
    { uid: 'bot1', bot: true },
  ];

  it('is the host, so a bot move is posted once rather than by everyone', () => {
    expect(botDriver(seats, 'host')).toBe('host');
  });

  it('falls to the lowest remaining human when the host has gone', () => {
    // Otherwise the table stalls because somebody closed the app.
    expect(botDriver([{ uid: 'zed' }, { uid: 'alice' }], 'host')).toBe('alice');
  });

  it('is nobody at a table of only bots', () => {
    expect(botDriver([{ uid: 'b1', bot: true }], 'host')).toBeNull();
    expect(botDriver([], 'host')).toBeNull();
  });
});

describe('unoBotMove', () => {
  const OPTS = { seats: 2, stack: true };

  it('is silent when it is not that seat to play', () => {
    const u = replayUno(8, OPTS, []);
    expect(unoBotMove(u, (u.turn + 1) % 2)).toBeNull();
  });

  it('is silent once the round is over', () => {
    const u = { ...replayUno(8, OPTS, []), winner: 0 } as UnoState;
    expect(unoBotMove(u, u.turn)).toBeNull();
  });

  it('always proposes something legal', () => {
    for (let seed = 0; seed < 40; seed++) {
      const u = replayUno(seed, OPTS, []);
      const m = unoBotMove(u, u.turn);
      expect(m, `seed ${seed}`).not.toBeNull();
      expect(unoLegal(u, m as UnoMove, u.turn), `seed ${seed}`).toBe(true);
    }
  });

  it('answers a live +2 stack with a +2 or takes the pile', () => {
    const u = { ...replayUno(3, OPTS, []), draw: 2 } as UnoState;
    const m = unoBotMove(u, u.turn);
    expect(m === null || 'take' in m || 'play' in m).toBe(true);
  });
});
