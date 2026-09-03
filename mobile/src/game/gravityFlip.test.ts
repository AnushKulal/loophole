import { describe, expect, it } from 'vitest';
import { BOT, makeRng, type BotProfile, type Rng } from './contract';
import {
  AHEAD,
  BEHIND,
  DIST_POINTS,
  DT,
  FLIP_COOLDOWN,
  G,
  INVULN,
  MAX_DT,
  MAX_SEATS,
  MIN_SEATS,
  ORB_POINTS,
  ORB_R,
  RUNNER_R,
  SIGHT,
  SPEED_0,
  SPEED_MAX,
  START_CLEAR,
  THIN,
  TRACK,
  bestPlan,
  botFlip,
  canFlip,
  courseRamp,
  extendCourse,
  flip,
  flipProblem,
  flipTimes,
  freeGaps,
  generateTo,
  group,
  hitsSlab,
  lineFor,
  livesFor,
  newCourse,
  nextRandom,
  placeOf,
  project,
  safeY,
  scoreOf,
  seatsFor,
  secondsFor,
  slabAt,
  speedAt,
  speedRamp,
  standing,
  standings,
  startMatch,
  step,
  timeLeft,
  widestGap,
  xpFor,
  type FlipWorld,
  type Runner,
  type Slab,
} from './gravityFlip';

const DIFFS = ['Easy', 'Normal', 'Sharp'] as const;

/** A hand-built corridor, so a rule can be tested without waiting for a course. */
function rig(slabs: Omit<Slab, 'id' | 'kind'>[], over: Partial<FlipWorld> = {}, seats = 2): FlipWorld {
  const runners: Runner[] = Array.from({ length: seats }, (_, seat) => ({
    seat,
    y: TRACK - RUNNER_R,
    vy: 0,
    flipped: false,
    lives: 3,
    out: false,
    invuln: 0,
    dist: 0,
    orbs: 0,
    hits: 0,
    flips: 0,
    lastFlip: -1,
    streak: 0,
    best: 0,
  }));
  return {
    seats,
    runners,
    course: {
      // A genX past anything the test will reach freezes the course as given.
      slabs: slabs.map((s, i) => ({ ...s, id: i + 1, kind: 'wall' as const })),
      orbs: [],
      genX: 1e9,
      seed: 1,
      nextId: 1000,
    },
    x: 0,
    speed: SPEED_0,
    t: 0,
    limit: 60,
    livesPer: 3,
    feed: [],
    over: false,
    winner: null,
    nextId: 1,
    ...over,
  };
}

/** Advance a rigged world by `n` ticks with nobody touching the glass. */
function idle(w: FlipWorld, n: number, flips: boolean[] | boolean = false): FlipWorld {
  let out = w;
  for (let i = 0; i < n && !out.over; i++) out = step(out, DT, flips);
  return out;
}

/** A whole run with every seat played by a bot, to the clock or the last life. */
function autoRun(
  seats: number,
  profiles: BotProfile[],
  rng: Rng,
  lives = 3,
  minutes = 5,
  check?: (w: FlipWorld, flips: boolean[]) => void,
): FlipWorld {
  let w = startMatch(seats, lives, minutes, rng);
  let acc = 0;
  for (let n = 0; n < 40000 && !w.over; n++) {
    acc += DT;
    const decide = acc >= 0.05;
    if (decide) acc = 0;
    const flips = w.runners.map((r) => (decide ? botFlip(w, r.seat, profiles[r.seat % profiles.length], rng, 0.05) : false));
    check?.(w, flips);
    w = step(w, DT, flips);
  }
  return w;
}

// ── the generator ─────────────────────────────────────────────────

describe('the course generator', () => {
  it('is a pure function of the seed', () => {
    expect(generateTo(4242, 60)).toEqual(generateTo(4242, 60));
    expect(generateTo(4242, 60).slabs).not.toEqual(generateTo(4243, 60).slabs);
  });

  it('only ever extends what it has already laid down', () => {
    const short = generateTo(77, 30);
    const long = generateTo(77, 90);
    expect(long.slabs.length).toBeGreaterThan(short.slabs.length);
    expect(long.slabs.slice(0, short.slabs.length)).toEqual(short.slabs);
    expect(long.orbs.slice(0, short.orbs.length)).toEqual(short.orbs);
    // Extending in two hops lands in exactly the same place as one.
    expect(extendCourse(short, 90)).toEqual(long);
  });

  it('leaves the track clear at the gun', () => {
    const c = generateTo(9, 40);
    expect(c.slabs.every((s) => s.x >= START_CLEAR)).toBe(true);
    expect(slabAt(c.slabs, 0, TRACK - RUNNER_R)).toBeNull();
  });

  it('never lays a slab too thin to see', () => {
    for (let seed = 0; seed < 30; seed++) {
      for (const s of generateTo(seed * 7919, 120).slabs) expect(s.y1 - s.y0).toBeGreaterThanOrEqual(THIN);
    }
  });

  it('always leaves a way through', () => {
    // The runner is 2·RUNNER_R across; every column has to leave more than that
    // at every single x, or the course would be a wall rather than a course.
    for (let seed = 0; seed < 30; seed++) {
      const c = generateTo(seed * 104729, 120);
      for (let x = 0; x < 120; x += 0.05) {
        const gap = widestGap(c.slabs, x, x);
        expect(gap).not.toBeNull();
        expect((gap as { y0: number; y1: number }).y1 - (gap as { y0: number; y1: number }).y0).toBeGreaterThan(2 * RUNNER_R + 0.03);
      }
    }
  });

  it('tightens as it runs on', () => {
    // Measured at the columns themselves: further down the track the open track
    // between them stretches out, which would flatter a plain average.
    const measure = (from: number, to: number) => {
      let total = 0;
      let n = 0;
      for (let seed = 0; seed < 20; seed++) {
        const c = generateTo(seed * 31337, to + 10);
        for (let x = from; x < to; x += 0.05) {
          if (!c.slabs.some((s) => s.x <= x && s.x + s.w >= x)) continue;
          const g = widestGap(c.slabs, x, x);
          total += g ? g.y1 - g.y0 : 0;
          n++;
        }
      }
      return total / n;
    };
    expect(measure(70, 130)).toBeLessThan(measure(2, 24));
    expect(courseRamp(0)).toBe(0);
    expect(courseRamp(1e6)).toBe(1);
    expect(courseRamp(20)).toBeLessThan(courseRamp(60));
  });

  it('draws its numbers from a stream that never repeats itself', () => {
    const [a, s1] = nextRandom(1);
    const [b, s2] = nextRandom(s1);
    expect(a).not.toBe(b);
    expect(s1).not.toBe(s2);
    expect(nextRandom(1)).toEqual([a, s1]);
    for (let i = 0; i < 500; i++) {
      const [v] = nextRandom(i * 977);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('starts empty and grows only when asked', () => {
    const c = newCourse(3);
    expect(c.slabs).toEqual([]);
    expect(c.genX).toBe(START_CLEAR);
    expect(extendCourse(c, START_CLEAR - 1)).toEqual(c);
    expect(extendCourse(c, START_CLEAR + 5).slabs.length).toBeGreaterThan(0);
  });
});

// ── geometry ──────────────────────────────────────────────────────

describe('the corridor', () => {
  const slab: Slab = { id: 1, x: 1, w: 0.4, y0: 0, y1: 0.5, kind: 'wall' };

  it('knows what a runner is inside', () => {
    expect(hitsSlab(slab, 1.2, 0.25, RUNNER_R)).toBe(true);
    expect(hitsSlab(slab, 1.2, 0.9, RUNNER_R)).toBe(false);
    // Just clear of the bottom edge, and just inside it.
    expect(hitsSlab(slab, 1.2, 0.5 + RUNNER_R + 0.001, RUNNER_R)).toBe(false);
    expect(hitsSlab(slab, 1.2, 0.5 + RUNNER_R - 0.001, RUNNER_R)).toBe(true);
    // Clear of both ends in x.
    expect(hitsSlab(slab, 0.5, 0.25, RUNNER_R)).toBe(false);
    expect(hitsSlab(slab, 2.0, 0.25, RUNNER_R)).toBe(false);
  });

  it('subtracts the slabs from the corridor', () => {
    const gaps = freeGaps([slab], 1, 1.4);
    expect(gaps).toEqual([{ y0: 0.5, y1: 1 }]);
    expect(freeGaps([], 0, 1)).toEqual([{ y0: 0, y1: 1 }]);
    const gate: Slab[] = [
      { id: 1, x: 0, w: 1, y0: 0, y1: 0.3, kind: 'gate' },
      { id: 2, x: 0, w: 1, y0: 0.7, y1: 1, kind: 'gate' },
    ];
    expect(freeGaps(gate, 0.5, 0.5)).toEqual([{ y0: 0.3, y1: 0.7 }]);
    expect(widestGap(gate, 0.5, 0.5)).toEqual({ y0: 0.3, y1: 0.7 });
  });

  it('puts a knocked-down runner in the roomiest band', () => {
    const y = safeY([slab], 1.2);
    expect(y).toBeGreaterThan(0.5);
    expect(slabAt([slab], 1.2, y)).toBeNull();
    // With nothing in the way the middle of the corridor is as good as anywhere.
    expect(safeY([], 5)).toBeCloseTo(TRACK / 2, 6);
  });
});

// ── legality ──────────────────────────────────────────────────────

describe('a tap', () => {
  it('is legal for a runner still in the match', () => {
    const w = rig([]);
    expect(flipProblem(w, 0)).toBeNull();
    expect(canFlip(w, 0)).toBe(true);
    expect(flip(w, 0).runners[0].flipped).toBe(true);
    expect(flip(flip(w, 0), 0).runners[0].flipped).toBe(false);
  });

  it('is rejected from a seat that is not running', () => {
    const w = rig([]);
    expect(flipProblem(w, 7)).toBe('no-runner');
    expect(flipProblem({ ...w, over: true }, 0)).toBe('over');

    const dead = rig([]);
    dead.runners[0] = { ...dead.runners[0], out: true, lives: 0 };
    expect(flipProblem(dead, 0)).toBe('out');
    expect(canFlip(dead, 0)).toBe(false);
    expect(() => flip(dead, 0)).toThrow();
    expect(() => flip({ ...w, over: true }, 0)).toThrow();
    expect(() => flip(w, 7)).toThrow();
  });

  it('is counted, and timestamped so a bot cannot stutter', () => {
    const w = flip({ ...rig([]), t: 4 }, 1);
    expect(w.runners[1].flips).toBe(1);
    expect(w.runners[1].lastFlip).toBe(4);
    expect(w.runners[0].flips).toBe(0);
  });

  it('is ignored by step when it would be illegal', () => {
    const w = rig([]);
    w.runners[1] = { ...w.runners[1], out: true, lives: 0 };
    const after = step(w, DT, [false, true]);
    expect(after.runners[1].flipped).toBe(false);
    expect(after.runners[1].flips).toBe(0);
    // An over world is frozen whatever anybody taps.
    const done = { ...w, over: true };
    expect(step(done, DT, [true, true])).toBe(done);
  });

  it('reads a bare boolean as seat one, and an array as the table', () => {
    const w = rig([], {}, 3);
    expect(step(w, DT, true).runners.map((r) => r.flipped)).toEqual([true, false, false]);
    expect(step(w, DT, [false, true, true]).runners.map((r) => r.flipped)).toEqual([false, true, true]);
    expect(step(w, DT).runners.map((r) => r.flipped)).toEqual([false, false, false]);
  });
});

// ── the physics ───────────────────────────────────────────────────

describe('gravity', () => {
  it('holds a runner on the floor until it is flipped', () => {
    const w = idle(rig([]), 60);
    expect(w.runners[0].y).toBeCloseTo(TRACK - RUNNER_R, 6);
    expect(w.runners[0].vy).toBe(0);
  });

  it('pulls to the ceiling once it is', () => {
    let w = flip(rig([]), 0);
    const start = w.runners[0].y;
    w = idle(w, 6);
    expect(w.runners[0].y).toBeLessThan(start);
    // And settles against the ceiling rather than falling through it.
    w = idle(w, 200);
    expect(w.runners[0].y).toBeCloseTo(RUNNER_R, 6);
    expect(w.runners[0].vy).toBe(0);
  });

  it('crosses the corridor in about the time the constant says', () => {
    let w = flip(rig([]), 0);
    let ticks = 0;
    while (w.runners[0].y > RUNNER_R + 1e-6 && ticks < 600) {
      w = step(w, DT);
      ticks++;
    }
    const want = Math.sqrt((2 * (TRACK - 2 * RUNNER_R)) / G);
    expect(ticks * DT).toBeGreaterThan(want * 0.9);
    expect(ticks * DT).toBeLessThan(want * 1.2);
  });

  it('swallows at most one long frame at a time, and nothing at all from a bad one', () => {
    const w = rig([]);
    expect(step(w, 0)).toBe(w);
    expect(step(w, -1)).toBe(w);
    expect(step(w, Number.NaN)).toBe(w);
    expect(step(w, 10).t).toBeCloseTo(MAX_DT, 6);
  });

  it('rolls the camera forward at the ramping speed', () => {
    expect(speedAt(0)).toBe(SPEED_0);
    expect(speedAt(1e6)).toBe(SPEED_MAX);
    expect(speedAt(20)).toBeGreaterThan(speedAt(10));
    expect(speedRamp(0)).toBe(0);
    expect(speedRamp(1e6)).toBe(1);
    const w = idle(rig([]), 120);
    expect(w.x).toBeCloseTo(w.runners[0].dist, 6);
    expect(w.x).toBeGreaterThan(0);
    expect(timeLeft(w)).toBeCloseTo(60 - w.t, 6);
  });

  it('lays new track ahead of the camera and drops what is behind', () => {
    const rng = makeRng(5);
    let w = startMatch(2, 3, 5, rng);
    w = idle(w, 60 * 20);
    expect(w.course.genX).toBeGreaterThanOrEqual(w.x + AHEAD);
    expect(w.course.slabs.every((s) => s.x + s.w >= w.x - BEHIND)).toBe(true);
    expect(w.course.slabs.length).toBeLessThan(60);
  });
});

// ── the rules ─────────────────────────────────────────────────────

describe('hitting a slab', () => {
  /** A wall off the floor, right where a runner resting on the floor will meet it. */
  const wall = { x: 0.4, w: 0.5, y0: 0.5, y1: TRACK };

  it('costs a life and drops the runner somewhere survivable', () => {
    // The wall arrives around two thirds of a second in, well inside the grace.
    const w = idle(rig([wall]), 45);
    const r = w.runners[0];
    expect(slabAt([{ ...wall, id: 1, kind: 'wall' }], w.x, r.y)).toBeNull();
    expect(r.hits).toBe(1);
    expect(r.lives).toBe(2);
    expect(r.invuln).toBeGreaterThan(0);
    expect(r.invuln).toBeLessThanOrEqual(INVULN);
    expect(r.streak).toBeLessThan(r.best);
    expect(w.feed.some((f) => f.kind === 'hit' && f.seat === 0)).toBe(true);
  });

  it('cannot cost two lives inside the grace period', () => {
    // A single long wall: without the grace it would take a life every tick.
    const w = idle(rig([{ x: 0.4, w: 3, y0: 0.5, y1: TRACK }]), 90);
    expect(w.runners[0].hits).toBe(1);
    expect(w.runners[0].lives).toBe(2);
  });

  it('takes the last life and puts the seat out for good', () => {
    const one = rig([{ x: 0.4, w: 0.5, y0: 0.5, y1: TRACK }]);
    one.runners[0] = { ...one.runners[0], lives: 1 };
    const w = idle(one, 200);
    expect(w.runners[0].out).toBe(true);
    expect(w.runners[0].lives).toBe(0);
    expect(w.feed.some((f) => f.kind === 'out' && f.seat === 0)).toBe(true);
    expect(standing(w)).toEqual([1]);
    // And an eliminated runner stops banking distance.
    const frozen = w.runners[0].dist;
    expect(idle(w, 60).runners[0].dist).toBeCloseTo(frozen, 6);
  });

  it('only touches the seat that hit it', () => {
    const two = rig([wall]);
    two.runners[1] = { ...two.runners[1], y: RUNNER_R, flipped: true };
    const w = idle(two, 60);
    expect(w.runners[0].hits).toBe(1);
    expect(w.runners[1].hits).toBe(0);
    expect(w.runners[1].lives).toBe(3);
  });
});

describe('the score', () => {
  it('is distance plus orbs, exactly as the rules say', () => {
    const w = idle(rig([]), 300);
    const r = w.runners[0];
    expect(scoreOf(r)).toBe(Math.round(r.dist * DIST_POINTS));
    expect(scoreOf({ ...r, orbs: 4 })).toBe(Math.round(r.dist * DIST_POINTS) + 4 * ORB_POINTS);
  });

  it('pays each seat once for an orb, and never twice', () => {
    const w = rig([], {}, 2);
    w.course = { ...w.course, orbs: [{ id: 1, x: 0.3, y: TRACK - RUNNER_R, taken: [] }] };
    const after = idle(w, 200);
    expect(after.runners[0].orbs).toBe(1);
    expect(after.runners[1].orbs).toBe(1);
    // Both seats have taken it, so it is gone from the course.
    expect(after.course.orbs).toEqual([]);
    // A very long stay on top of one still only pays once.
    const parked = rig([], {}, 1 + 1);
    parked.course = { ...parked.course, orbs: [{ id: 1, x: 0.3, y: TRACK - RUNNER_R, taken: [] }] };
    expect(idle(parked, 400).runners[0].orbs).toBe(1);
  });

  it('is only paid for an orb the runner actually reached', () => {
    const w = rig([], {}, 2);
    w.course = { ...w.course, orbs: [{ id: 1, x: 0.3, y: RUNNER_R, taken: [] }] };
    // Both seats are on the floor; the orb is up on the ceiling.
    expect(idle(w, 120).runners[0].orbs).toBe(0);
    expect(ORB_R + RUNNER_R).toBeLessThan(TRACK - 2 * RUNNER_R);
  });
});

describe('the lobby options', () => {
  it('sets the respawns', () => {
    expect(livesFor(1)).toBe(1);
    expect(livesFor(5)).toBe(5);
    expect(livesFor(-4)).toBe(1);
    expect(livesFor(99)).toBe(9);
    // An option that never arrived falls back to the lobby's own default.
    expect(livesFor(0)).toBe(3);
    expect(livesFor(Number.NaN)).toBe(3);
    const rng = makeRng(1);
    expect(startMatch(3, 2, 5, rng).runners.every((r) => r.lives === 2)).toBe(true);
    expect(startMatch(3, 2, 5, rng).livesPer).toBe(2);
  });

  it('sets the round length', () => {
    expect(secondsFor(1)).toBe(60);
    expect(secondsFor(0.1)).toBe(40);
    expect(secondsFor(99)).toBe(110);
    expect(startMatch(2, 3, 1, makeRng(1)).limit).toBe(60);
  });

  it('sets the seats, inside what the corridor holds', () => {
    expect(seatsFor(4)).toBe(4);
    expect(seatsFor(1)).toBe(MIN_SEATS);
    expect(seatsFor(99)).toBe(MAX_SEATS);
    expect(startMatch(99, 3, 5, makeRng(1)).runners).toHaveLength(MAX_SEATS);
  });
});

// ── a whole run ───────────────────────────────────────────────────

describe('a full run', () => {
  it('reaches a terminal state with exactly one winner', () => {
    for (const d of DIFFS) {
      const w = autoRun(4, [BOT[d]], makeRng(2024));
      expect(w.over).toBe(true);
      expect(w.winner).not.toBeNull();
      const seat = w.winner as number;
      expect(seat).toBeGreaterThanOrEqual(0);
      expect(seat).toBeLessThan(w.seats);
      expect(placeOf(w, seat)).toBe(1);
      // Exactly one: everybody else is placed behind them.
      expect(w.runners.filter((r) => placeOf(w, r.seat) === 1)).toHaveLength(1);
      // And the board is a total order over the seats.
      const board = standings(w);
      expect(board).toHaveLength(w.seats);
      expect(new Set(board).size).toBe(w.seats);
      expect(board[0]).toBe(seat);
    }
  });

  it('ends the moment the last seat runs out of lives', () => {
    // Nobody taps, so everybody rides the floor into the first wall they meet.
    const w = idle(startMatch(3, 1, 5, makeRng(11)), 40000);
    expect(w.over).toBe(true);
    expect(w.runners.every((r) => r.out)).toBe(true);
    expect(w.t).toBeLessThan(w.limit);
    expect(w.winner).not.toBeNull();
  });

  it('ends on the clock when somebody is still running', () => {
    const w = autoRun(3, [BOT.Sharp], makeRng(4), 9, 1);
    expect(w.over).toBe(true);
    expect(w.t).toBeGreaterThanOrEqual(w.limit);
    expect(timeLeft(w)).toBe(0);
  });

  it('stays over once it is over', () => {
    const w = autoRun(2, [BOT.Normal], makeRng(6), 1);
    expect(step(w, DT, [true, true])).toBe(w);
  });

  it('ranks by score, then orbs, then the cleanest run', () => {
    const w = rig([], { over: true }, 3);
    w.runners[0] = { ...w.runners[0], dist: 10, orbs: 0 };
    w.runners[1] = { ...w.runners[1], dist: 10, orbs: 3 };
    w.runners[2] = { ...w.runners[2], dist: 2, orbs: 40 };
    expect(scoreOf(w.runners[2])).toBeGreaterThan(scoreOf(w.runners[1]));
    expect(standings(w)).toEqual([2, 1, 0]);
    // A dead heat is broken all the way down to seat order, never left a tie.
    const flat = rig([], { over: true }, 3);
    expect(standings(flat)).toEqual([0, 1, 2]);
  });

  it('groups its thousands without leaning on an ICU build', () => {
    expect(group(0)).toBe('0');
    expect(group(42)).toBe('42');
    expect(group(1000)).toBe('1,000');
    expect(group(12345)).toBe('12,345');
    expect(group(1234567)).toBe('1,234,567');
    expect(group(-4200)).toBe('-4,200');
  });

  it('pays out a scoreboard line and XP for every seat', () => {
    const w = autoRun(4, [BOT.Normal], makeRng(31));
    for (const r of w.runners) {
      expect(xpFor(w, r.seat)).toBeGreaterThan(0);
      expect(lineFor(w, r.seat)).toMatch(/orb/);
    }
    expect(xpFor(w, w.winner as number)).toBeGreaterThan(200);
    expect(xpFor(w, 99)).toBe(0);
    expect(lineFor(w, 99)).toBe('—');
  });
});

// ── the bot ───────────────────────────────────────────────────────

describe('the bot', () => {
  it('answers with a legal move from every position a run reaches', () => {
    for (const d of DIFFS) {
      const rng = makeRng(808);
      autoRun(4, [BOT[d]], rng, 3, 5, (w, flips) => {
        flips.forEach((f, seat) => {
          expect(typeof f).toBe('boolean');
          // Anything it asked for has to be something the rules would allow.
          if (f) expect(canFlip(w, seat)).toBe(true);
        });
      });
    }
  });

  it('answers from the awkward positions too', () => {
    const bot = BOT.Sharp;
    const rng = makeRng(3);
    const live = startMatch(2, 3, 5, makeRng(3));

    expect(botFlip(live, 9, bot, rng)).toBe(false);
    expect(botFlip({ ...live, over: true }, 0, bot, rng)).toBe(false);

    const dead = { ...live, runners: live.runners.map((r, i) => (i === 0 ? { ...r, out: true } : r)) };
    expect(botFlip(dead, 0, bot, rng)).toBe(false);

    // Fresh off a flip, it holds its hand rather than stuttering.
    const twitchy = { ...live, t: 1, runners: live.runners.map((r) => ({ ...r, lastFlip: 1 - FLIP_COOLDOWN / 2 })) };
    expect(botFlip(twitchy, 0, bot, rng)).toBe(false);

    // Boxed in, mid-corridor, at full tilt — still a boolean, never a throw.
    const boxed = rig([
      { x: 0.2, w: 4, y0: 0, y1: 0.4 },
      { x: 0.2, w: 4, y0: 0.6, y1: TRACK },
    ]);
    boxed.runners[0] = { ...boxed.runners[0], y: 0.5, vy: 1.2 };
    for (const d of DIFFS) {
      expect(typeof botFlip({ ...boxed, speed: SPEED_MAX }, 0, BOT[d], rng, 0.05)).toBe('boolean');
    }
  });

  it('flips out of the way of a wall it is about to run into', () => {
    // Seat 0 is played by a bot, seat 1 rides the floor into the wall. Carrying
    // on is fatal and the ceiling is clear track, so the bot has to see it.
    const wall = { x: 1.2, w: 0.6, y0: 0.45, y1: TRACK };
    const never: Rng = () => 0.999;
    let w = rig([wall]);
    // The plain plan dies where the flipped one does not.
    expect(project(w, 0, false, 2.4).time).toBeLessThan(project(w, 0, true, 2.4).time);
    for (let i = 0; i < 300 && !w.over; i++) w = step(w, DT, [botFlip(w, 0, BOT.Sharp, never, DT), false]);
    expect(w.x).toBeGreaterThan(wall.x + wall.w);
    expect(w.runners[0].flips).toBeGreaterThan(0);
    expect(w.runners[0].hits).toBe(0);
    expect(w.runners[1].hits).toBe(1);
  });

  it('leaves clear track alone', () => {
    const w = rig([]);
    // No blunder in the stream: a flat corridor gives it nothing to gain.
    const never: Rng = () => 0.999;
    expect(botFlip(w, 0, BOT.Sharp, never, 0.05)).toBe(false);
  });

  it('sees no further than the player does', () => {
    const w = { ...rig([{ x: 3.5, w: 0.4, y0: 0.4, y1: TRACK }]), speed: SPEED_MAX };
    // The wall is well past the sight line, so nothing about it can be acted on.
    expect(SIGHT / SPEED_MAX).toBeLessThan(1);
    const never: Rng = () => 0.999;
    expect(botFlip(w, 0, BOT.Sharp, never, 0.05)).toBe(false);
  });

  it('projects the same physics the world runs', () => {
    const w = flip(rig([]), 0);
    const horizon = 0.5;
    const p = project(w, 0, false, horizon);
    expect(p.time).toBe(horizon);
    expect(p.orbs).toBe(0);
    // A wall right on top of the runner kills the projection immediately.
    const doomed = rig([{ x: -1, w: 4, y0: 0.5, y1: TRACK }]);
    expect(project(doomed, 0, false, 1).time).toBeLessThan(0.2);
    expect(project(doomed, 9, false, 1)).toEqual({ time: 0, orbs: 0 });
  });

  it('spends its depth on a second flip', () => {
    expect(flipTimes(1, 1)).toEqual([]);
    expect(flipTimes(2, 1)).toHaveLength(3);
    expect(flipTimes(3, 1)).toHaveLength(6);
    expect(flipTimes(3, 1).every((t) => t > 0 && t < 1)).toBe(true);
    // The one-ply plan is a special case of the deeper one, so deeper is never worse.
    const gate = rig([
      { x: 1.1, w: 0.3, y0: 0, y1: 0.3 },
      { x: 1.1, w: 0.3, y0: 0.72, y1: TRACK },
    ]);
    const shallow = bestPlan(gate, 0, true, 1.6, 1);
    const deep = bestPlan(gate, 0, true, 1.6, 3);
    expect(deep.time).toBeGreaterThanOrEqual(shallow.time);
  });

  it('gets better as the profile does', () => {
    const runs = (bot: BotProfile) => {
      let total = 0;
      for (let s = 0; s < 8; s++) total += scoreOf(autoRun(2, [bot], makeRng(500 + s * 313)).runners[0]);
      return total / 8;
    };
    const easy = runs(BOT.Easy);
    const normal = runs(BOT.Normal);
    const sharp = runs(BOT.Sharp);
    expect(normal).toBeGreaterThan(easy * 1.5);
    expect(sharp).toBeGreaterThan(normal);
  });

  it('can be beaten — it does not simply run for ever', () => {
    // Even a Sharp table takes hits; the course wins in the end.
    const w = autoRun(3, [BOT.Sharp], makeRng(77), 3, 5);
    expect(w.runners.reduce((n, r) => n + r.hits, 0)).toBeGreaterThan(0);
  });
});

// ── reproducibility ───────────────────────────────────────────────

describe('a seeded run', () => {
  it('replays exactly', () => {
    const a = autoRun(4, [BOT.Normal], makeRng(4321));
    const b = autoRun(4, [BOT.Normal], makeRng(4321));
    expect(b).toEqual(a);
    expect(b.winner).toBe(a.winner);
    expect(b.runners.map(scoreOf)).toEqual(a.runners.map(scoreOf));
  });

  it('lays the same course whatever the framerate was', () => {
    const rng = () => 0.5;
    const smooth = idle(startMatch(2, 3, 5, rng), 60 * 12);
    // The same twelve seconds, in half-length ticks.
    let choppy = startMatch(2, 3, 5, rng);
    for (let i = 0; i < 120 * 12; i++) choppy = step(choppy, DT / 2);
    expect(choppy.course.seed).toBe(smooth.course.seed);
    const n = Math.min(smooth.course.slabs.length, choppy.course.slabs.length);
    expect(n).toBeGreaterThan(3);
    // The course is a function of distance and seed, so the shared stretch matches.
    const ids = (w: FlipWorld) => w.course.slabs.map((s) => s.id);
    const shared = ids(smooth).filter((id) => ids(choppy).includes(id));
    expect(shared.length).toBeGreaterThan(3);
    for (const id of shared) {
      expect(choppy.course.slabs.find((s) => s.id === id)).toEqual(smooth.course.slabs.find((s) => s.id === id));
    }
  });

  it('gives a different seed a different course', () => {
    const a = startMatch(2, 3, 5, makeRng(1));
    const b = startMatch(2, 3, 5, makeRng(2));
    expect(a.course.seed).not.toBe(b.course.seed);
    expect(a.course.slabs).not.toEqual(b.course.slabs);
  });

  it('opens every run the same way, on the floor at the gun', () => {
    const w = startMatch(4, 3, 5, makeRng(9));
    expect(w.runners.every((r) => r.y === TRACK - RUNNER_R && !r.flipped && !r.out)).toBe(true);
    expect(w.x).toBe(0);
    expect(w.t).toBe(0);
    expect(w.over).toBe(false);
    expect(w.winner).toBeNull();
    expect(w.runners.map(scoreOf)).toEqual([0, 0, 0, 0]);
  });
});
