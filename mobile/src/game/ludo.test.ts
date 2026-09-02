import { describe as suite, expect, it } from 'vitest';
import { BOT, makeRng, type BotProfile, type Rng } from './contract';
import {
  COLUMN,
  COLUMN_CELLS,
  COLUMN_FIRST,
  ENTRY,
  GRID,
  HOME,
  MAX_ROLLS,
  MAX_SEATS,
  MOVE_MESSAGE,
  RING,
  RING_CELLS,
  RING_LAST,
  SAFE,
  SIXES_LIMIT,
  TOKENS,
  YARD,
  YARD_SLOTS,
  applyMove,
  atHome,
  botMove,
  botTurn,
  cellOf,
  countOwnAt,
  describe,
  inColumn,
  inYard,
  isOver,
  isSafeRing,
  landingAt,
  legalMoves,
  movableTokens,
  moveProblem,
  nextSeat,
  occupantsAt,
  onRing,
  placeOf,
  playToken,
  pressureFrom,
  progress,
  ringIndex,
  rollDice,
  scoreMove,
  standings,
  startMatch,
  threatAt,
  tokensHome,
  tokensOut,
  tokensYard,
  whereIs,
  xpFor,
  type LudoState,
} from './ludo';

const DIFFS = ['Easy', 'Normal', 'Sharp'] as const;

/** A table rigged straight from token positions. */
function rig(tokens: number[][], over: Partial<LudoState> = {}): LudoState {
  const st = startMatch(tokens.length);
  return { ...st, tokens: tokens.map((r) => r.slice()), ...over };
}

/** The same table, with `dice` already on it for `player`. */
function withRoll(st: LudoState, player: number, dice: number): LudoState {
  const turned = { ...st, turn: player };
  return { ...turned, dice, moves: legalMoves(turned, player, dice) };
}

/** An RNG that deals the given die faces in order, then repeats the last one. */
function dice(...faces: number[]): Rng {
  let i = 0;
  return () => {
    const v = faces[Math.min(i, faces.length - 1)];
    i++;
    return (v - 0.5) / 6;
  };
}

/** An RNG stuck on one value — enough to steer a bot's skill/blunder rolls. */
const flat = (v: number): Rng => () => v;

const yard = () => Array.from({ length: TOKENS }, () => YARD);

/** Every seat played by a bot until somebody is home. */
function autoMatch(seats: number, bots: BotProfile[], rng: Rng, check = false): LudoState {
  let s = startMatch(seats);
  for (let step = 0; step < 60000 && s.winner === null; step++) {
    const p = s.turn;
    if (s.dice === null) {
      s = rollDice(s, rng);
      continue;
    }
    const i = botMove(s, p, bots[p % bots.length], rng);
    if (check) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(s.moves.length);
      expect(moveProblem(s, p, s.moves[i].token)).toBeNull();
    }
    s = applyMove(s, i);
  }
  return s;
}

// ── the board ─────────────────────────────────────────────────────

suite('board topology', () => {
  it('is a 52-square ring of distinct cells on the 15×15 cross', () => {
    expect(RING_CELLS).toHaveLength(RING);
    const keys = new Set(RING_CELLS.map(([x, y]) => `${x},${y}`));
    expect(keys.size).toBe(RING);
    for (const [x, y] of RING_CELLS) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(GRID);
      expect(y).toBeLessThan(GRID);
    }
  });

  it('walks one square at a time, turning the arm corners diagonally', () => {
    for (let i = 0; i < RING; i++) {
      const [x1, y1] = RING_CELLS[i];
      const [x2, y2] = RING_CELLS[(i + 1) % RING];
      const dx = Math.abs(x2 - x1);
      const dy = Math.abs(y2 - y1);
      expect(Math.max(dx, dy)).toBe(1);
    }
  });

  it('seats the four entry squares a quarter of the ring apart', () => {
    expect(ENTRY).toEqual([0, 13, 26, 39]);
    for (let p = 0; p < MAX_SEATS; p++) {
      expect((ENTRY[p] - ENTRY[0] + RING) % RING).toBe((p * RING) / MAX_SEATS);
      expect(ringIndex(p, 0)).toBe(ENTRY[p]);
    }
    expect(RING_CELLS[ENTRY[0]]).toEqual([1, 6]);
    expect(RING_CELLS[ENTRY[1]]).toEqual([8, 1]);
    expect(RING_CELLS[ENTRY[2]]).toEqual([13, 8]);
    expect(RING_CELLS[ENTRY[3]]).toEqual([6, 13]);
  });

  it('marks eight safe squares: the four starts and the four stars past them', () => {
    expect(SAFE).toHaveLength(8);
    expect(new Set(SAFE).size).toBe(8);
    for (const p of ENTRY) {
      expect(isSafeRing(p)).toBe(true);
      expect(isSafeRing(p + 8)).toBe(true);
    }
    expect(isSafeRing(1)).toBe(false);
    expect(isSafeRing(RING + 8)).toBe(true); // wraps
    expect(isSafeRing(-52)).toBe(true);
  });

  it('turns each seat into its own six-cell column after fifty-one shared squares', () => {
    expect(COLUMN).toBe(6);
    expect(HOME - COLUMN_FIRST).toBe(5);
    for (let p = 0; p < MAX_SEATS; p++) {
      expect(COLUMN_CELLS[p]).toHaveLength(COLUMN);
      const [lx, ly] = RING_CELLS[ringIndex(p, RING_LAST)];
      const [cx, cy] = COLUMN_CELLS[p][0];
      expect(Math.abs(lx - cx) + Math.abs(ly - cy)).toBe(1);
      // the goal cell sits inside the middle 3×3
      const [gx, gy] = COLUMN_CELLS[p][COLUMN - 1];
      expect(gx).toBeGreaterThanOrEqual(6);
      expect(gx).toBeLessThanOrEqual(8);
      expect(gy).toBeGreaterThanOrEqual(6);
      expect(gy).toBeLessThanOrEqual(8);
    }
  });

  it('covers 51 shared squares before the column, never repeating one', () => {
    for (let p = 0; p < MAX_SEATS; p++) {
      const walked = new Set<number>();
      for (let pos = 0; pos <= RING_LAST; pos++) walked.add(ringIndex(p, pos));
      expect(walked.size).toBe(RING_LAST + 1);
      expect(walked.size).toBe(51);
      // the one square it never stands on is the square before its own entry
      expect(walked.has((ENTRY[p] + RING - 1) % RING)).toBe(false);
    }
  });

  it('places a token in its yard, on the ring or in its column', () => {
    expect(cellOf(0, YARD, 2)).toEqual(YARD_SLOTS[0][2]);
    expect(cellOf(1, 0, 0)).toEqual(RING_CELLS[ENTRY[1]]);
    expect(cellOf(2, RING_LAST, 3)).toEqual(RING_CELLS[ringIndex(2, RING_LAST)]);
    expect(cellOf(3, HOME, 0)).toEqual(COLUMN_CELLS[3][COLUMN - 1]);
    for (let p = 0; p < MAX_SEATS; p++) {
      expect(YARD_SLOTS[p]).toHaveLength(TOKENS);
      expect(new Set(YARD_SLOTS[p].map((c) => c.join())).size).toBe(TOKENS);
    }
  });

  it('classifies a position', () => {
    expect(inYard(YARD)).toBe(true);
    expect(onRing(0)).toBe(true);
    expect(onRing(RING_LAST)).toBe(true);
    expect(onRing(COLUMN_FIRST)).toBe(false);
    expect(inColumn(COLUMN_FIRST)).toBe(true);
    expect(inColumn(HOME)).toBe(true);
    expect(atHome(HOME)).toBe(true);
    expect(atHome(HOME - 1)).toBe(false);
  });
});

// ── the deal ──────────────────────────────────────────────────────

suite('a fresh table', () => {
  it('sits every token in its yard with nothing rolled', () => {
    const st = startMatch(4);
    expect(st.seats).toBe(4);
    expect(st.tokens).toHaveLength(4);
    for (const row of st.tokens) expect(row).toEqual([YARD, YARD, YARD, YARD]);
    expect(st.dice).toBeNull();
    expect(st.moves).toEqual([]);
    expect(st.winner).toBeNull();
    expect(isOver(st)).toBe(false);
    expect(st.turn).toBe(0);
  });

  it('clamps the table to between two and four seats', () => {
    expect(startMatch(1).seats).toBe(2);
    expect(startMatch(9).seats).toBe(MAX_SEATS);
    expect(startMatch(3).seats).toBe(3);
    expect(startMatch(3).tokens).toHaveLength(3);
  });

  it('draws the opening seat only when handed an rng', () => {
    expect(startMatch(4).turn).toBe(0);
    const seen = new Set<number>();
    for (let s = 0; s < 40; s++) seen.add(startMatch(4, makeRng(s)).turn);
    expect(seen.size).toBeGreaterThan(1);
    for (const v of seen) expect(v).toBeLessThan(4);
  });

  it('passes the dice round the table', () => {
    const st = startMatch(3);
    expect(nextSeat(st, 0)).toBe(1);
    expect(nextSeat(st, 2)).toBe(0);
  });
});

// ── legal moves ───────────────────────────────────────────────────

suite('legal moves', () => {
  it('needs a six to leave the yard, and then offers every token', () => {
    const st = startMatch(4);
    for (const d of [1, 2, 3, 4, 5]) expect(legalMoves(st, 0, d)).toEqual([]);
    const six = legalMoves(st, 0, 6);
    expect(six).toHaveLength(TOKENS);
    for (const m of six) {
      expect(m.from).toBe(YARD);
      expect(m.to).toBe(0);
      expect(m.enters).toBe(true);
      expect(m.captures).toEqual([]);
    }
  });

  it('rejects a roll outside a d6', () => {
    const st = startMatch(4);
    expect(legalMoves(st, 0, 0)).toEqual([]);
    expect(legalMoves(st, 0, 7)).toEqual([]);
    expect(legalMoves(st, 0, 2.5)).toEqual([]);
  });

  it('walks a token forward by the roll', () => {
    const st = rig([[4, YARD, YARD, YARD], yard(), yard(), yard()]);
    const m = legalMoves(st, 0, 3);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ token: 0, from: 4, to: 7, enters: false, home: false });
  });

  it('only lets a token home on an exact roll', () => {
    const st = rig([[HOME - 2, HOME, HOME, HOME], yard(), yard(), yard()]);
    expect(legalMoves(st, 0, 2).map((m) => m.to)).toEqual([HOME]);
    expect(legalMoves(st, 0, 2)[0].home).toBe(true);
    expect(legalMoves(st, 0, 1).map((m) => m.to)).toEqual([HOME - 1]);
    for (const d of [3, 4, 5, 6]) expect(legalMoves(st, 0, d)).toEqual([]);
    expect(moveProblem(withRoll(st, 0, 4), 0, 0)).toBe('exact');
  });

  it('never moves a token that is already home', () => {
    const st = rig([[HOME, HOME, HOME, 20], yard(), yard(), yard()]);
    const m = legalMoves(st, 0, 3);
    expect(m).toHaveLength(1);
    expect(m[0].token).toBe(3);
    expect(moveProblem(withRoll(st, 0, 3), 0, 0)).toBe('home');
  });

  it('lists exactly the tokens the seat on turn may move', () => {
    const st = withRoll(rig([[4, YARD, HOME, 30], yard(), yard(), yard()]), 0, 3);
    expect(movableTokens(st)).toEqual([0, 3]);
  });
});

// ── capture, safety and blocks ────────────────────────────────────

suite('capture', () => {
  it('sends a lone enemy on an unguarded square back to its yard', () => {
    // seat 1 stands on ring 4, which seat 0 reaches from distance 1 with a 3
    const enemy = (4 - ENTRY[1] + RING) % RING;
    const st = withRoll(rig([[1, YARD, YARD, YARD], [enemy, YARD, YARD, YARD], yard(), yard()]), 0, 3);
    expect(isSafeRing(4)).toBe(false);
    expect(st.moves).toHaveLength(1);
    expect(st.moves[0].captures).toEqual([{ p: 1, t: 0, from: enemy }]);

    const after = applyMove(st, 0);
    expect(after.tokens[1][0]).toBe(YARD);
    expect(after.tokens[0][0]).toBe(4);
    expect(after.caps[0]).toBe(1);
  });

  it('leaves an enemy alone on one of the eight safe squares', () => {
    const enemy = (8 - ENTRY[1] + RING) % RING;
    const st = withRoll(rig([[5, YARD, YARD, YARD], [enemy, YARD, YARD, YARD], yard(), yard()]), 0, 3);
    expect(isSafeRing(8)).toBe(true);
    expect(st.moves).toHaveLength(1);
    expect(st.moves[0].to).toBe(8);
    expect(st.moves[0].captures).toEqual([]);
    expect(applyMove(st, 0).tokens[1][0]).toBe(enemy);
  });

  it('treats a pair of enemy tokens on an unsafe square as a wall', () => {
    const enemy = (4 - ENTRY[1] + RING) % RING;
    const st = rig([[1, YARD, YARD, YARD], [enemy, enemy, YARD, YARD], yard(), yard()]);
    expect(landingAt(st, 0, 4)).toEqual({ ok: false, captures: [], blocked: true });
    expect(legalMoves(st, 0, 3)).toEqual([]);
    expect(moveProblem(withRoll(st, 0, 3), 0, 0)).toBe('block');
  });

  it('lets your own tokens share a square', () => {
    const st = rig([[1, 4, YARD, YARD], yard(), yard(), yard()]);
    const m = legalMoves(st, 0, 3);
    expect(m.map((x) => x.token)).toEqual([0, 1]);
    expect(m[0].captures).toEqual([]);
    expect(countOwnAt(applyMove(withRoll(st, 0, 3), 0), 0, 4)).toBe(2);
  });

  it('never touches a token inside a home column', () => {
    const st = rig([[COLUMN_FIRST, YARD, YARD, YARD], [COLUMN_FIRST, YARD, YARD, YARD], yard(), yard()]);
    expect(landingAt(st, 1, COLUMN_FIRST)).toEqual({ ok: true, captures: [], blocked: false });
    expect(occupantsAt(st, ringIndex(0, 0))).toEqual([]);
  });

  it('finds who is standing where', () => {
    const st = rig([[0, YARD, YARD, YARD], [0, YARD, YARD, YARD], yard(), yard()]);
    expect(occupantsAt(st, ENTRY[0])).toEqual([{ p: 0, t: 0, pos: 0 }]);
    expect(occupantsAt(st, ENTRY[1])).toEqual([{ p: 1, t: 0, pos: 0 }]);
  });
});

// ── whose turn it is ──────────────────────────────────────────────

suite('turn order', () => {
  it('rejects a move out of turn, before a roll, or after the match', () => {
    const st = startMatch(4);
    expect(moveProblem(st, 1, 0)).toBe('turn');
    expect(moveProblem(st, 0, 0)).toBe('roll');
    expect(moveProblem({ ...st, winner: 2 }, 0, 0)).toBe('over');
    expect(moveProblem(withRoll(st, 0, 4), 0, 0)).toBe('yard');
    expect(moveProblem(withRoll(st, 0, 6), 0, 0)).toBeNull();
    expect(Object.keys(MOVE_MESSAGE)).toContain('block');
  });

  it('hands the dice on after an ordinary move', () => {
    const st = withRoll(rig([[4, YARD, YARD, YARD], yard(), yard(), yard()]), 0, 3);
    const after = applyMove(st, 0);
    expect(after.turn).toBe(1);
    expect(after.dice).toBeNull();
    expect(after.moves).toEqual([]);
  });

  it('buys another roll with a six', () => {
    const st = withRoll(startMatch(4), 0, 6);
    const after = applyMove(st, 0);
    expect(after.turn).toBe(0);
    expect(after.dice).toBeNull();
    expect(after.tokens[0][0]).toBe(0);
  });

  it('buys another roll with a capture', () => {
    const enemy = (4 - ENTRY[1] + RING) % RING;
    const st = withRoll(rig([[1, YARD, YARD, YARD], [enemy, YARD, YARD, YARD], yard(), yard()]), 0, 3);
    expect(applyMove(st, 0).turn).toBe(0);
  });

  it('buys another roll for getting a token home', () => {
    const st = withRoll(rig([[HOME - 3, YARD, YARD, YARD], yard(), yard(), yard()]), 0, 3);
    const after = applyMove(st, 0);
    expect(after.tokens[0][0]).toBe(HOME);
    expect(after.turn).toBe(0);
  });

  it('forfeits the turn on a third six in a row', () => {
    let st = startMatch(4);
    const rng = dice(6, 6, 6);
    st = rollDice(st, rng);
    expect(st.sixes).toBe(1);
    st = applyMove(st, 0);
    expect(st.turn).toBe(0);
    st = rollDice(st, rng);
    expect(st.sixes).toBe(2);
    st = applyMove(st, 0);
    expect(st.turn).toBe(0);
    st = rollDice(st, rng);
    expect(st.sixes).toBe(0);
    expect(st.dice).toBeNull();
    expect(st.turn).toBe(1);
    expect(st.last?.kind).toBe('forfeit');
    expect(SIXES_LIMIT).toBe(3);
  });

  it('resets the six count when a plain roll interrupts the run', () => {
    let st = startMatch(4);
    const rng = dice(6, 2);
    st = rollDice(st, rng);
    st = applyMove(st, 0);
    st = rollDice(st, rng);
    expect(st.dice).toBe(2);
    expect(st.sixes).toBe(0);
  });

  it('passes the turn when the roll has nowhere to go', () => {
    const st = rollDice(rig([[HOME, HOME, HOME, HOME - 1], yard(), yard(), yard()]), dice(4));
    expect(st.dice).toBeNull();
    expect(st.turn).toBe(1);
    expect(st.last).toMatchObject({ kind: 'stuck', p: 0, dice: 4 });
  });

  it('will not roll twice, or roll once the match is over', () => {
    const st = withRoll(startMatch(4), 0, 6);
    expect(rollDice(st, dice(3))).toBe(st);
    const done = { ...startMatch(4), winner: 1 };
    expect(rollDice(done, dice(3))).toBe(done);
  });

  it('ignores a move index that is not on offer', () => {
    const st = withRoll(startMatch(4), 0, 6);
    expect(applyMove(st, 9)).toBe(st);
    expect(applyMove(st, -1)).toBe(st);
    expect(playToken(st, 2).tokens[0][2]).toBe(0);
    expect(playToken(withRoll(startMatch(4), 0, 3), 2)).toEqual(withRoll(startMatch(4), 0, 3));
  });
});

// ── winning ───────────────────────────────────────────────────────

suite('winning', () => {
  it('declares the first seat with all four tokens home', () => {
    const st = withRoll(rig([[HOME, HOME, HOME, HOME - 4], yard(), yard(), yard()]), 0, 4);
    const after = applyMove(st, 0);
    expect(after.winner).toBe(0);
    expect(tokensHome(after, 0)).toBe(TOKENS);
    expect(isOver(after)).toBe(true);
    expect(after.last).toMatchObject({ kind: 'win', p: 0 });
  });

  it('freezes once somebody has won', () => {
    const won = { ...rig([[HOME, HOME, HOME, HOME], yard(), yard(), yard()]), winner: 0 };
    expect(rollDice(won, dice(6))).toBe(won);
    expect(legalMoves(won, 1, 6)).toEqual([]);
    expect(botTurn(won, BOT.Sharp, makeRng(1))).toBe(won);
  });

  it('counts tokens, ground covered and finishing order', () => {
    const st = rig([[HOME, 20, YARD, YARD], [HOME, HOME, 1, YARD], [0, YARD, YARD, YARD], yard()]);
    expect(tokensHome(st, 1)).toBe(2);
    expect(tokensOut(st, 0)).toBe(1);
    expect(tokensYard(st, 3)).toBe(TOKENS);
    expect(progress(st, 0)).toBe(HOME + 1 + 21);
    expect(progress(st, 3)).toBe(0);
    expect(standings(st)).toEqual([1, 0, 2, 3]);
    expect(placeOf(st, 1)).toBe(1);
    expect(placeOf(st, 3)).toBe(4);
  });

  it('puts the winner first however far behind they were', () => {
    const st = { ...rig([[HOME, HOME, HOME, HOME], [HOME, HOME, HOME, 40], yard(), yard()]), winner: 0 };
    expect(standings(st)[0]).toBe(0);
    expect(xpFor(st, 0)).toBeGreaterThan(xpFor(st, 1));
    expect(xpFor(st, 2)).toBeGreaterThan(0);
  });
});

// ── reading danger ────────────────────────────────────────────────

suite('danger', () => {
  it('counts the enemies within one roll of a square', () => {
    const st = rig([[10, YARD, YARD, YARD], yard(), [(9 - ENTRY[2] + RING) % RING, YARD, YARD, YARD], yard()]);
    expect(threatAt(st, 0, 10)).toBe(1);
    expect(threatAt(st, 0, 20)).toBe(0);
  });

  it('reads a safe square, a home column and a pair as untouchable', () => {
    const behind = (7 - ENTRY[2] + RING) % RING;
    const st = rig([[8, 8, YARD, YARD], yard(), [behind, YARD, YARD, YARD], yard()]);
    expect(threatAt(st, 0, 8)).toBe(0); // 8 is a star
    expect(threatAt(st, 0, COLUMN_FIRST)).toBe(0);
    const unsafe = rig([[9, 9, YARD, YARD], yard(), [(8 - ENTRY[2] + RING) % RING, YARD, YARD, YARD], yard()]);
    expect(threatAt(unsafe, 0, 9)).toBe(0); // two of your own is a wall
    expect(threatAt(unsafe, 0, 9, -1)).toBe(1); // one of them is a target
  });

  it('counts the lone enemies a square would threaten', () => {
    const target = (14 - ENTRY[1] + RING) % RING;
    const st = rig([[10, YARD, YARD, YARD], [target, YARD, YARD, YARD], yard(), yard()]);
    expect(pressureFrom(st, 0, 10)).toBe(1);
    expect(pressureFrom(st, 0, COLUMN_FIRST)).toBe(0);
  });
});

// ── the bot ───────────────────────────────────────────────────────

suite('the bot', () => {
  it('prefers a capture to any amount of running', () => {
    const enemy = (4 - ENTRY[1] + RING) % RING;
    const st = withRoll(rig([[1, 40, YARD, YARD], [enemy, YARD, YARD, YARD], yard(), yard()]), 0, 3);
    const [take, run] = st.moves;
    expect(take.captures).toHaveLength(1);
    expect(scoreMove(st, 0, take, 3)).toBeGreaterThan(scoreMove(st, 0, run, 3));
  });

  it('prefers getting home to sitting in the column', () => {
    const st = withRoll(rig([[HOME - 3, COLUMN_FIRST, YARD, YARD], yard(), yard(), yard()]), 0, 3);
    const [home, column] = st.moves;
    expect(home.home).toBe(true);
    expect(scoreMove(st, 0, home, 2)).toBeGreaterThan(scoreMove(st, 0, column, 2));
  });

  it('prefers breaking a token out to shuffling one already on the ring', () => {
    const st = withRoll(rig([[3, YARD, YARD, YARD], yard(), yard(), yard()]), 0, 6);
    const shuffle = st.moves.find((m) => !m.enters)!;
    const out = st.moves.find((m) => m.enters)!;
    expect(scoreMove(st, 0, out, 2)).toBeGreaterThan(scoreMove(st, 0, shuffle, 2));
  });

  it('sees the square it is walking onto only once it looks a ply ahead', () => {
    // seat 2 sits two squares behind ring 44, so 40 → 44 walks into the line of fire
    const lurk = (42 - ENTRY[2] + RING) % RING;
    const st = withRoll(rig([[40, 10, YARD, YARD], yard(), [lurk, YARD, YARD, YARD], yard()]), 0, 4);
    const [risky, quiet] = st.moves;
    expect(risky.to).toBe(44);
    expect(quiet.to).toBe(14);
    expect(scoreMove(st, 0, risky, 1)).toBeGreaterThan(scoreMove(st, 0, quiet, 1));
    expect(scoreMove(st, 0, quiet, 3)).toBeGreaterThan(scoreMove(st, 0, risky, 3));
    // and the profiles carry that through: Sharp reads the danger, Easy does not
    expect(botMove(st, 0, BOT.Sharp, flat(0.5))).toBe(1);
    expect(botMove(st, 0, BOT.Easy, flat(0.5))).toBe(0);
  });

  it('returns nothing to play when there is nothing to play', () => {
    expect(botMove(startMatch(4), 0, BOT.Normal, makeRng(3))).toBe(-1);
    const notMine = withRoll(startMatch(4), 0, 6);
    expect(botMove(notMine, 1, BOT.Normal, makeRng(3))).toBe(-1);
  });

  it('blunders into a legal move rather than an illegal one', () => {
    const st = withRoll(rig([[1, 20, 30, YARD], yard(), yard(), yard()]), 0, 3);
    for (let s = 0; s < 200; s++) {
      const i = botMove(st, 0, { skill: 0, depth: 1, blunder: 1, think: 0 }, makeRng(s));
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(st.moves.length);
      expect(moveProblem(st, 0, st.moves[i].token)).toBeNull();
    }
  });

  it('only ever offers a legal move, from every position a match reaches', () => {
    for (const d of DIFFS) {
      for (let seed = 0; seed < 6; seed++) {
        const end = autoMatch(4, [BOT[d], BOT[d], BOT[d], BOT[d]], makeRng(seed), true);
        expect(end.winner).not.toBeNull();
      }
    }
  });

  it('plays a whole turn on its own', () => {
    let st = startMatch(4);
    const rng = makeRng(11);
    for (let i = 0; i < 40; i++) st = botTurn(st, BOT.Normal, rng);
    expect(st.rolls).toBeGreaterThan(0);
    for (let p = 0; p < st.seats; p++) for (const pos of st.tokens[p]) expect(pos).toBeGreaterThanOrEqual(YARD);
  });
});

// ── a full match ──────────────────────────────────────────────────

suite('a full match', () => {
  it('reaches a terminal state with exactly one winner, all four home', () => {
    for (let seed = 0; seed < 12; seed++) {
      const end = autoMatch(4, [BOT.Sharp, BOT.Normal, BOT.Easy, BOT.Normal], makeRng(seed));
      expect(end.winner).not.toBeNull();
      const champs = Array.from({ length: end.seats }, (_, i) => i).filter((i) => tokensHome(end, i) === TOKENS);
      expect(champs).toEqual([end.winner]);
      expect(end.rolls).toBeLessThan(MAX_ROLLS);
      expect(standings(end)[0]).toBe(end.winner);
    }
  });

  it('finishes a two-handed and a three-handed table too', () => {
    for (const seats of [2, 3]) {
      const end = autoMatch(seats, [BOT.Normal, BOT.Normal, BOT.Normal], makeRng(seats * 7));
      expect(end.winner).not.toBeNull();
      expect(tokensHome(end, end.winner as number)).toBe(TOKENS);
      expect(end.tokens).toHaveLength(seats);
    }
  });

  it('never leaves a token off the board', () => {
    const end = autoMatch(4, [BOT.Normal, BOT.Normal, BOT.Normal, BOT.Normal], makeRng(99));
    for (let p = 0; p < end.seats; p++) {
      expect(end.tokens[p]).toHaveLength(TOKENS);
      for (const pos of end.tokens[p]) {
        expect(pos === YARD || (pos >= 0 && pos <= HOME)).toBe(true);
      }
    }
  });

  it('gives the sharper table the better of a long run', () => {
    let sharp = 0;
    let easy = 0;
    for (let seed = 0; seed < 40; seed++) {
      // seat 0 Sharp, seat 1 Easy, and the same two again so the seat order is fair
      const end = autoMatch(4, [BOT.Sharp, BOT.Easy, BOT.Sharp, BOT.Easy], makeRng(seed + 500));
      if (end.winner === 0 || end.winner === 2) sharp++;
      else easy++;
    }
    expect(sharp + easy).toBe(40);
    expect(sharp).toBeGreaterThan(easy * 0.6);
  });
});

// ── reproducibility ───────────────────────────────────────────────

suite('a seeded match', () => {
  it('replays exactly from the same seed', () => {
    const a = autoMatch(4, [BOT.Sharp, BOT.Normal, BOT.Easy, BOT.Normal], makeRng(2024));
    const b = autoMatch(4, [BOT.Sharp, BOT.Normal, BOT.Easy, BOT.Normal], makeRng(2024));
    expect(b).toEqual(a);
    expect(b.tokens).toEqual(a.tokens);
    expect(b.winner).toBe(a.winner);
    expect(b.rolls).toBe(a.rolls);
    expect(b.caps).toEqual(a.caps);
  });

  it('plays out differently from a different seed', () => {
    const runs = [1, 2, 3, 4, 5].map((s) => autoMatch(4, [BOT.Normal, BOT.Normal, BOT.Normal, BOT.Normal], makeRng(s)));
    expect(new Set(runs.map((r) => `${r.winner}:${r.rolls}`)).size).toBeGreaterThan(1);
  });

  it('rolls a fair d6 from a seed', () => {
    const rng = makeRng(7);
    const seen = new Set<number>();
    let st = startMatch(4);
    for (let i = 0; i < 400; i++) {
      st = rollDice(st, rng);
      if (st.dice !== null) {
        seen.add(st.dice);
        st = applyMove(st, 0);
      }
    }
    expect(Array.from(seen).sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

// ── narration ─────────────────────────────────────────────────────

suite('narration', () => {
  const name = (p: number) => (p === 0 ? 'You' : `Seat ${p + 1}`);

  it('says what just happened in one sentence', () => {
    expect(describe(null, name)).toBe('Roll to start');
    expect(describe({ kind: 'move', p: 0, dice: 4 }, name)).toBe('You played a 4');
    expect(describe({ kind: 'capture', p: 0, dice: 3, captured: [{ p: 2, t: 1, from: 9 }] }, name)).toBe(
      'You sent Seat 3 back to the yard',
    );
    expect(describe({ kind: 'home', p: 1 }, name)).toBe('Seat 2 brought a token home');
    expect(describe({ kind: 'forfeit', p: 1, dice: 6 }, name)).toContain('three sixes');
    expect(describe({ kind: 'stuck', p: 0, dice: 5 }, name)).toBe('You had no move with a 5');
    expect(describe({ kind: 'win', p: 3 }, name)).toBe('Seat 4 got all four tokens home');
  });

  it('names a position', () => {
    expect(whereIs(YARD)).toBe('in the yard');
    expect(whereIs(0)).toBe('square 1');
    expect(whereIs(RING_LAST)).toBe('square 51');
    expect(whereIs(COLUMN_FIRST)).toBe('home column 1');
    expect(whereIs(HOME)).toBe('home');
  });
});
