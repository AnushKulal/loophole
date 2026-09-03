import { describe, expect, it } from 'vitest';
import { BOT, makeRng, type Rng } from './contract';
import {
  COLS,
  DIE,
  JUMPS,
  LADDERS,
  MAX_ROLLS,
  MAX_SEATS,
  MOVE_MESSAGE,
  ROWS,
  SNAKES,
  SQUARES,
  START,
  applyRoll,
  botRoll,
  botThink,
  cellOf,
  hopText,
  isLegalRoll,
  jumpAt,
  jumpList,
  landingOf,
  legalRolls,
  moveProblem,
  order,
  placeOf,
  resolve,
  settle,
  squareAt,
  startMatch,
  takeTurn,
  toGo,
  walkPath,
  xpFor,
  type JumpMap,
  type SlState,
} from './snakesLadders';

const DIFFS = ['Easy', 'Normal', 'Sharp'] as const;
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** A hand-built table, so a rule can be tested without rolling into it. */
function rig(pos: number[], over: Partial<SlState> = {}): SlState {
  return { ...startMatch(pos.length), pos: pos.slice(), best: pos.slice(), ...over };
}

/** Play a whole match out with every seat rolling, optionally checking legality. */
function autoMatch(seats: number, rng: Rng, check = false, board: JumpMap = JUMPS): SlState {
  let s = startMatch(seats, board);
  for (let step = 0; step < 50000 && s.phase !== 'over'; step++) {
    if (s.phase === 'roll') {
      const seat = s.turn;
      const die = botRoll(s, seat, rng);
      if (check) {
        expect(die).not.toBeNull();
        expect(moveProblem(s, seat, die as number)).toBeNull();
      }
      s = applyRoll(s, seat, die as number);
    } else {
      s = settle(s);
    }
  }
  return s;
}

// ── the board ─────────────────────────────────────────────────────

describe('the board', () => {
  it('is a hundred squares on a ten by ten grid', () => {
    expect(SQUARES).toBe(100);
    expect(COLS).toBe(10);
    expect(ROWS).toBe(10);
    expect(DIE).toBe(6);
  });

  it('numbers the squares boustrophedon, so 100 sits above 1', () => {
    expect(cellOf(1)).toEqual({ col: 0, row: 0 });
    expect(cellOf(10)).toEqual({ col: 9, row: 0 });
    expect(cellOf(11)).toEqual({ col: 9, row: 1 }); // the second row turns back
    expect(cellOf(20)).toEqual({ col: 0, row: 1 });
    expect(cellOf(21)).toEqual({ col: 0, row: 2 });
    expect(cellOf(100)).toEqual({ col: 0, row: 9 });
  });

  it('walks consecutive squares to adjacent cells the whole way up', () => {
    for (let sq = 1; sq < SQUARES; sq++) {
      const a = cellOf(sq);
      const b = cellOf(sq + 1);
      const step = Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
      expect(step).toBe(1);
    }
  });

  it('inverts back to the same square from every cell', () => {
    for (let sq = 1; sq <= SQUARES; sq++) {
      const { col, row } = cellOf(sq);
      expect(squareAt(col, row)).toBe(sq);
    }
  });

  it('has nine ladders up and ten snakes down, all inside the board', () => {
    expect(Object.keys(LADDERS)).toHaveLength(9);
    expect(Object.keys(SNAKES)).toHaveLength(10);
    for (const [from, to] of Object.entries(LADDERS)) {
      expect(Number(from)).toBeGreaterThan(0);
      expect(to).toBeGreaterThan(Number(from));
      expect(to).toBeLessThanOrEqual(SQUARES);
    }
    for (const [from, to] of Object.entries(SNAKES)) {
      expect(to).toBeLessThan(Number(from));
      expect(to).toBeGreaterThan(0);
    }
    // Nothing starts on 100, or a winner could be dragged off the finish.
    expect(JUMPS[SQUARES]).toBeUndefined();
    expect(jumpList()).toHaveLength(19);
  });

  it('classifies a square as a ladder foot, a snake head or neither', () => {
    expect(jumpAt(1)).toEqual({ kind: 'ladder', from: 1, to: 38 });
    expect(jumpAt(98)).toEqual({ kind: 'snake', from: 98, to: 78 });
    expect(jumpAt(2)).toBeNull();
    expect(jumpAt(38)).toBeNull(); // a ladder top is an ordinary square
  });
});

// ── move resolution ───────────────────────────────────────────────

describe('resolving a roll', () => {
  it('advances the rolled number on an ordinary square', () => {
    const h = resolve(0, 10, 3);
    expect(h.landed).toBe(13);
    expect(h.to).toBe(13);
    expect(h.bounced).toBe(false);
    expect(h.jumps).toEqual([]);
    expect(h.won).toBe(false);
  });

  it('leaves the start lane on the first roll', () => {
    expect(resolve(0, START, 5).to).toBe(5);
    expect(resolve(0, START, 1).to).toBe(38); // straight onto the ladder at 1
  });

  it('climbs a ladder foot and slides down a snake head', () => {
    const up = resolve(0, 24, 4); // 28 → 84
    expect(up.landed).toBe(28);
    expect(up.jumps).toEqual([{ kind: 'ladder', from: 28, to: 84 }]);
    expect(up.to).toBe(84);

    const down = resolve(1, 60, 2); // 62 → 19
    expect(down.jumps).toEqual([{ kind: 'snake', from: 62, to: 19 }]);
    expect(down.to).toBe(19);
  });

  it('bounces back off 100 when the roll overshoots', () => {
    expect(landingOf(97, 6)).toEqual({ landed: 97, bounced: true });
    expect(landingOf(99, 6)).toEqual({ landed: 95, bounced: true });
    expect(landingOf(95, 5)).toEqual({ landed: 100, bounced: false });
    const h = resolve(0, 99, 3); // 102 walks back down to 98
    expect(h.landed).toBe(98);
    expect(h.bounced).toBe(true);
    expect(h.won).toBe(false);
  });

  it('lets a bounce drop you onto a snake — the cruellest square on the board', () => {
    const h = resolve(0, 96, 6); // 102 bounces to 98, which is a snake head
    expect(h.landed).toBe(98);
    expect(h.bounced).toBe(true);
    expect(h.jumps).toEqual([{ kind: 'snake', from: 98, to: 78 }]);
    expect(h.to).toBe(78);
  });

  it('only wins on an exact count', () => {
    expect(resolve(0, 94, 6).won).toBe(true);
    expect(resolve(0, 94, 6).to).toBe(SQUARES);
    expect(resolve(0, 96, 5).won).toBe(false);
    expect(resolve(0, 76, 4).won).toBe(true); // 80 is the ladder to 100
    expect(resolve(0, 76, 4).jumps).toEqual([{ kind: 'ladder', from: 80, to: 100 }]);
  });

  it('walks the squares it touches, turning round on 100', () => {
    expect(walkPath(0, 3)).toEqual([1, 2, 3]);
    expect(walkPath(97, 6)).toEqual([98, 99, 100, 99, 98, 97]);
    expect(walkPath(95, 5)).toEqual([96, 97, 98, 99, 100]);
    for (let from = 0; from < SQUARES; from++) {
      for (let die = 1; die <= DIE; die++) {
        const path = walkPath(from, die);
        expect(path).toHaveLength(die);
        expect(path[path.length - 1]).toBe(landingOf(from, die).landed);
        path.forEach((sq) => {
          expect(sq).toBeGreaterThan(0);
          expect(sq).toBeLessThanOrEqual(SQUARES);
        });
      }
    }
  });

  it('follows a chain when one jump lands on the foot of another', () => {
    // A rigged board: 5 is a ladder to 20, and 20 is a snake back down to 8.
    const chained: JumpMap = { 5: 20, 20: 8 };
    const h = resolve(0, 2, 3, chained);
    expect(h.landed).toBe(5);
    expect(h.jumps).toEqual([
      { kind: 'ladder', from: 5, to: 20 },
      { kind: 'snake', from: 20, to: 8 },
    ]);
    expect(h.to).toBe(8);
  });

  it('stops rather than looping when a rigged board points back at itself', () => {
    const loop: JumpMap = { 5: 20, 20: 5 };
    const h = resolve(0, 4, 1, loop);
    expect(h.jumps.length).toBeGreaterThanOrEqual(2);
    expect(h.jumps.length).toBeLessThanOrEqual(8);
    expect([5, 20]).toContain(h.to);
  });

  it('never chains on the classic board', () => {
    for (const j of jumpList()) expect(jumpAt(j.to)).toBeNull();
  });
});

// ── legality ──────────────────────────────────────────────────────

describe('rolling', () => {
  const s = startMatch(3);

  it('accepts any of the six faces from the seat on turn', () => {
    expect(legalRolls(s, 0)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const die of legalRolls(s, 0)) expect(isLegalRoll(s, 0, die)).toBe(true);
  });

  it('rejects a roll from a seat that is not on turn', () => {
    expect(legalRolls(s, 1)).toEqual([]);
    expect(moveProblem(s, 1, 3)).toBe('not-your-turn');
    expect(moveProblem(s, 9, 3)).toBe('not-your-turn');
    expect(() => applyRoll(s, 1, 3)).toThrow(MOVE_MESSAGE['not-your-turn']);
  });

  it('rejects a roll while a token is still moving, or after the match is over', () => {
    const moving = applyRoll(s, 0, 3);
    expect(moving.phase).toBe('move');
    expect(moveProblem(moving, 0, 4)).toBe('not-rolling');
    expect(legalRolls(moving, 0)).toEqual([]);
    expect(() => applyRoll(moving, 0, 4)).toThrow();
    const over = rig([100, 40], { phase: 'over', winner: 0 });
    expect(moveProblem(over, 0, 2)).toBe('not-rolling');
  });

  it('rejects a face no die has', () => {
    expect(moveProblem(s, 0, 0)).toBe('bad-die');
    expect(moveProblem(s, 0, 7)).toBe('bad-die');
    expect(moveProblem(s, 0, -1)).toBe('bad-die');
    expect(moveProblem(s, 0, 2.5)).toBe('bad-die');
    expect(() => applyRoll(s, 0, 7)).toThrow(MOVE_MESSAGE['bad-die']);
  });

  it('passes the die on only once the token has settled', () => {
    const moved = applyRoll(s, 0, 3);
    expect(moved.turn).toBe(0);
    const next = settle(moved);
    expect(next.phase).toBe('roll');
    expect(next.turn).toBe(1);
    // Settling twice is a no-op, so a double-fired animation cannot skip a seat.
    expect(settle(next)).toBe(next);
    expect(settle(settle(applyRoll(next, 1, 2))).turn).toBe(2);
  });

  it('wraps the turn back round the table', () => {
    let s2 = startMatch(2);
    s2 = settle(applyRoll(s2, 0, 2));
    expect(s2.turn).toBe(1);
    s2 = settle(applyRoll(s2, 1, 2));
    expect(s2.turn).toBe(0);
  });
});

// ── the state a move leaves behind ────────────────────────────────

describe('applying a roll', () => {
  it('moves only the rolling seat and records the hop', () => {
    const s = applyRoll(rig([10, 40, 70]), 0, 3);
    expect(s.pos).toEqual([13, 40, 70]);
    expect(s.last).toMatchObject({ seat: 0, die: 3, from: 10, to: 13 });
    expect(s.rolls).toBe(1);
  });

  it('counts ladders climbed and snakes taken', () => {
    let s = rig([24, 60]);
    s = settle(applyRoll(s, 0, 4)); // 28 → 84
    s = settle(applyRoll(s, 1, 2)); // 62 → 19
    expect(s.climbs).toEqual([1, 0]);
    expect(s.bites).toEqual([0, 1]);
    expect(s.pos).toEqual([84, 19]);
  });

  it('remembers the furthest square a seat reached, even after a snake', () => {
    let s = rig([90, 0]);
    s = settle(applyRoll(s, 0, 3)); // 93 is a snake back to 73
    expect(s.pos[0]).toBe(73);
    expect(s.best[0]).toBe(93);
    expect(toGo(s, 0)).toBe(27);
  });

  it('does not let a bounce or a snake push a token off the board', () => {
    for (let seed = 0; seed < 200; seed++) {
      const s = autoMatch(4, makeRng(seed * 3 + 1));
      s.pos.forEach((p) => {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(SQUARES);
      });
    }
  });
});

// ── the win ───────────────────────────────────────────────────────

describe('winning', () => {
  it('ends the match when a token lands exactly on 100', () => {
    const moved = applyRoll(rig([96, 20]), 0, 4);
    expect(moved.last?.won).toBe(true);
    expect(moved.phase).toBe('move');
    expect(moved.winner).toBeNull(); // the token still has to walk there
    const done = settle(moved);
    expect(done.phase).toBe('over');
    expect(done.winner).toBe(0);
    expect(done.pos[0]).toBe(SQUARES);
    expect(moveProblem(done, 1, 3)).toBe('not-rolling');
  });

  it('does not end the match on an overshoot', () => {
    const s = settle(applyRoll(rig([97, 20]), 0, 6));
    expect(s.phase).toBe('roll');
    expect(s.winner).toBeNull();
    expect(s.pos[0]).toBe(97);
  });

  it('wins off the ladder at 80 as readily as off the track', () => {
    const s = settle(applyRoll(rig([78, 20]), 0, 2));
    expect(s.winner).toBe(0);
    expect(s.climbs[0]).toBe(1);
  });

  it('reaches exactly one winner from every seed and every table size', () => {
    for (let seats = 2; seats <= MAX_SEATS; seats++) {
      for (let seed = 0; seed < 30; seed++) {
        const s = autoMatch(seats, makeRng(seed * 17 + seats));
        expect(s.phase).toBe('over');
        expect(s.winner).not.toBeNull();
        expect(s.pos.filter((p) => p === SQUARES)).toHaveLength(1);
        expect(s.pos[s.winner as number]).toBe(SQUARES);
        expect(s.rolls).toBeLessThan(MAX_ROLLS);
      }
    }
  });

  it('calls a board that will not finish rather than spinning forever', () => {
    // A rigged board whose only jump throws you straight back to the start.
    const cruel: JumpMap = { 99: 1, 98: 1, 97: 1, 96: 1, 95: 1, 94: 1 };
    const s = autoMatch(3, makeRng(5), false, cruel);
    expect(s.phase).toBe('over');
    expect(s.winner).not.toBeNull();
  });
});

// ── the bot ───────────────────────────────────────────────────────

describe('the bot', () => {
  it('returns a legal face from every position it is asked in, at every difficulty', () => {
    for (const d of DIFFS) {
      for (let seed = 0; seed < 8; seed++) {
        const s = autoMatch(4, makeRng(seed * 11 + 7), true);
        expect(s.phase).toBe('over');
        expect(botThink(BOT[d])).toBeGreaterThan(0);
      }
    }
  });

  it('refuses to roll out of turn, mid-move or after the match is over', () => {
    const s = startMatch(3);
    const rng = makeRng(1);
    expect(botRoll(s, 1, rng)).toBeNull();
    expect(botRoll(s, 2, rng)).toBeNull();
    expect(botRoll(applyRoll(s, 0, 2), 0, rng)).toBeNull();
    expect(botRoll(rig([100, 3], { phase: 'over', winner: 0 }), 0, rng)).toBeNull();
  });

  it('rolls a fair-looking die across every face', () => {
    const s = startMatch(2);
    const rng = makeRng(9001);
    const seen = new Map<number, number>();
    for (let i = 0; i < 600; i++) {
      const die = botRoll(s, 0, rng) as number;
      expect(isLegalRoll(s, 0, die)).toBe(true);
      seen.set(die, (seen.get(die) ?? 0) + 1);
    }
    expect(seen.size).toBe(DIE);
    for (const n of seen.values()) expect(n).toBeGreaterThan(600 / DIE / 2);
  });

  it('paces a turn from its profile, briskly when sharp and slowly when easy', () => {
    expect(botThink(BOT.Sharp)).toBeLessThan(botThink(BOT.Easy));
    const hop = resolve(0, 24, 4);
    expect(hop.jumps).toHaveLength(1);
    // A jump is held a beat longer so it reads.
    expect(botThink(BOT.Normal, hop)).toBeGreaterThan(botThink(BOT.Normal));
  });

  it('beats you sometimes and loses sometimes — every seat wins across the seeds', () => {
    const wins = [0, 0, 0, 0];
    for (let seed = 0; seed < 200; seed++) wins[autoMatch(4, makeRng(seed * 5 + 2)).winner as number]++;
    wins.forEach((w) => expect(w).toBeGreaterThan(10));
    // Going first is worth something, but not the match.
    expect(wins[0]).toBeLessThan(120);
  });
});

// ── the scoreboard ────────────────────────────────────────────────

describe('the scoreboard', () => {
  it('ranks the winner first and the rest by how far they got', () => {
    const s = rig([100, 12, 64, 40], { winner: 0, phase: 'over' });
    expect(order(s)).toEqual([0, 2, 3, 1]);
    expect(placeOf(s, 0)).toBe(1);
    expect(placeOf(s, 2)).toBe(2);
    expect(placeOf(s, 1)).toBe(4);
  });

  it('breaks a tie on square by seat order, so a place is never shared', () => {
    const s = rig([30, 30, 90], { winner: 2, phase: 'over' });
    expect(order(s)).toEqual([2, 0, 1]);
    expect(new Set([0, 1, 2].map((i) => placeOf(s, i))).size).toBe(3);
  });

  it('pays exactly what the scoring rule says', () => {
    const s = rig([100, 47, 30], {
      winner: 0,
      phase: 'over',
      best: [100, 62, 30],
      climbs: [2, 1, 0],
      bites: [0, 1, 0],
    });
    expect(xpFor(s, 0)).toBe(40 + 3 * 100 + 45 * 2 + 55 * 2 + 240);
    expect(xpFor(s, 1)).toBe(40 + 3 * 62 + 45 * 1 + 55 * 1);
    expect(xpFor(s, 2)).toBe(40 + 3 * 30 + 0 + 0);
    expect(Math.max(xpFor(s, 0), xpFor(s, 1), xpFor(s, 2))).toBe(xpFor(s, 0));
  });

  it('pays the winner of a real match the most', () => {
    for (let seed = 0; seed < 20; seed++) {
      const s = autoMatch(4, makeRng(seed * 13 + 4));
      const xp = range(4).map((i) => xpFor(s, i));
      expect(Math.max(...xp)).toBe(xp[s.winner as number]);
    }
  });
});

// ── the table log ─────────────────────────────────────────────────

describe('describing a move', () => {
  it('names the ladder, the snake, the bounce and the finish', () => {
    expect(hopText(resolve(0, 10, 3), 'Karthik')).toBe('Karthik rolled 3 to 13');
    expect(hopText(resolve(0, 24, 4), 'Karthik')).toContain('climbed the ladder 28 → 84');
    expect(hopText(resolve(0, 60, 2), 'Karthik')).toContain('slid down the snake 62 → 19');
    expect(hopText(resolve(0, 96, 6), 'Karthik')).toContain('bounced back off 100 to 98');
    expect(hopText(resolve(0, 94, 6), 'Karthik')).toContain('is home on 100');
    expect(hopText(resolve(0, 94, 6), 'You', true)).toContain('are home on 100');
  });
});

// ── determinism ───────────────────────────────────────────────────

describe('reproducibility', () => {
  const sig = (s: SlState) => ({ winner: s.winner, pos: s.pos, rolls: s.rolls, climbs: s.climbs, bites: s.bites, log: s.log });

  it('replays a whole match identically from the same seed', () => {
    const run = () => sig(autoMatch(4, makeRng(20260903)));
    expect(run()).toEqual(run());
  });

  it('replays a seeded turn loop identically', () => {
    const play = (seed: number) => {
      let s = startMatch(3);
      const rng = makeRng(seed);
      while (s.phase !== 'over') s = s.phase === 'roll' ? takeTurn(s, rng) : settle(s);
      return sig(s);
    };
    expect(play(77)).toEqual(play(77));
    expect(play(77)).not.toEqual(play(78));
  });

  it('gives different matches from different seeds', () => {
    const winners = new Set<number | null>();
    const lengths = new Set<number>();
    for (let seed = 0; seed < 40; seed++) {
      const s = autoMatch(4, makeRng(seed * 7 + 3));
      winners.add(s.winner);
      lengths.add(s.rolls);
    }
    expect(winners.size).toBeGreaterThan(1);
    expect(lengths.size).toBeGreaterThan(10);
  });
});
