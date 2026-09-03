/**
 * Gravity Flip — an endless runner with one control.
 *
 * The track is a corridor one unit tall. Everybody runs the *same* procedurally
 * generated course at the same forward speed, so the only thing that separates
 * the seats is what they do with the one button: tapping flips which way gravity
 * pulls, and the runner falls to the ceiling and back. Slabs grow out of both
 * surfaces and hang in the middle of the corridor; orbs sit in the gaps. Score is
 * distance plus orbs, a hit costs a life, and running out of lives puts a seat
 * out for good. Last score standing when the clock runs out takes it.
 *
 * `step(world, dt, flipped)` is the whole simulation: take the flips, roll the
 * camera forward, extend the course ahead of it, integrate every runner under
 * the gravity it has chosen, pick up orbs, test the slabs, cull what is behind,
 * then check the clock. It knows nothing about frames — the screen drives it
 * from a requestAnimationFrame accumulator at a fixed `DT`, the bots project
 * with the same physics constants, and the tests replay a whole match from a
 * seed. One dt, one physics.
 *
 * The course is deliberately a pure function of `(seed, x)` rather than of the
 * clock: `extendCourse` is driven by a numeric seed carried on the state and by
 * how far along the track it has reached, so the same seed lays down the same
 * slabs whatever framerate the phone managed. Speed ramps with *time*; the
 * course ramps with *distance*.
 *
 * Pure data and pure transitions: no React, no clock, no `Math.random`. Chance
 * enters only through an `Rng`.
 */

import type { BotProfile, Rng } from './contract';

// ── the corridor ──────────────────────────────────────────────────

/** The corridor is one unit tall; y = 0 is the ceiling, y = 1 the floor. */
export const TRACK = 1;
/** The runner's collision radius, in track heights. */
export const RUNNER_R = 0.055;
/** Gravity, in track heights per second squared. A full crossing takes ~0.55s. */
export const G = 6;

/** Forward speed at the gun, its ramp per second, and the ceiling it ramps to. */
export const SPEED_0 = 0.62;
export const SPEED_RAMP = 0.014;
export const SPEED_MAX = 1.85;

/** The fixed physics tick. The screen's accumulator uses the same one. */
export const DT = 1 / 60;
/** No single `step` may swallow more than this, however long the frame took. */
export const MAX_DT = 0.05;

/** How far past the runner the course is laid down, and how far behind it is kept. */
export const AHEAD = 4.2;
export const BEHIND = 1.2;
/** Clear track at the gun, so nobody is killed before they have touched the glass. */
export const START_CLEAR = 1.9;
/** Distance over which the course works up from its opening shapes to its hardest. */
export const RAMP_DIST = 78;
/**
 * How much track is on screen ahead of the runner. The bots are held to it: a
 * projection is clipped to what a player can actually see coming, so a Sharp bot
 * wins on judgement and nerve rather than on reading track nobody has drawn yet.
 */
export const SIGHT = 1.25;

export const ORB_R = 0.042;
/** Points per track height travelled, and per orb. */
export const DIST_POINTS = 60;
export const ORB_POINTS = 25;

/** Seconds of grace after a hit — long enough to be carried clear of the slab. */
export const INVULN = 1.2;

export const MIN_SEATS = 2;
export const MAX_SEATS = 6;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * One draw of the course generator, as a pure function of the seed.
 *
 * This is mulberry32 (the same arithmetic as `makeRng`) unrolled so the state is
 * a plain number that can live on the world. That is what lets a course be
 * reproduced exactly from a seed without carrying a closure through the state.
 */
export function nextRandom(seed: number): [number, number] {
  const a = (seed + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}

// ── the course ────────────────────────────────────────────────────

/** A slab of glass across part of the corridor. Axis aligned, so hits are cheap. */
export interface Slab {
  id: number;
  x: number;
  w: number;
  /** Top and bottom edges, in track heights from the ceiling. */
  y0: number;
  y1: number;
  /** What laid it down — the screen tints the middle ones differently. */
  kind: ColumnKind;
}

export interface Orb {
  id: number;
  x: number;
  y: number;
  /** Seats that have already taken it. An orb is worth one pickup per seat. */
  taken: number[];
}

export type ColumnKind = 'gate' | 'wall' | 'pillar' | 'comb';

/** The generated track: what has been laid down, and how far. */
export interface Course {
  slabs: Slab[];
  orbs: Orb[];
  /** Everything up to here has been generated. */
  genX: number;
  seed: number;
  nextId: number;
}

/** How hard the course is at `x`, 0 at the gun and 1 once it has fully ramped. */
export const courseRamp = (x: number) => clamp(x / RAMP_DIST, 0, 1);

/** Forward speed after `t` seconds of running. */
export const speedAt = (t: number) => Math.min(SPEED_MAX, SPEED_0 + SPEED_RAMP * Math.max(0, t));

/** The speed ramp as a 0–1 dial, for the screen's meter. */
export const speedRamp = (t: number) => clamp((speedAt(t) - SPEED_0) / (SPEED_MAX - SPEED_0), 0, 1);

/** An empty course with clear track at the gun. */
export function newCourse(seed: number): Course {
  return { slabs: [], orbs: [], genX: START_CLEAR, seed: seed >>> 0, nextId: 1 };
}

/**
 * Lay down one more column and the run of open track after it.
 *
 * Four shapes, unlocked as the course ramps: a gate with a gap to thread, a
 * single wall off one surface that simply has to be flown around, a pillar
 * hanging in the middle with a way past above and below, and a comb — two deep
 * walls off opposite surfaces close enough together to force a flip between
 * them. Every shape leaves at least `MIN_FREE` of open corridor, so the course
 * is always run-able; the ramp spends its budget on narrower gaps, wider slabs
 * and less recovery room rather than on anything impossible.
 */
export const MIN_FREE = 0.3;
/**
 * A slab thinner than this is not laid at all. A two-centimetre lip on the
 * ceiling is invisible but still kills a runner resting against it, so the
 * generator rounds those away and lets the gap open onto the surface instead.
 */
export const THIN = RUNNER_R + 0.05;

function emitColumn(c: Course): Course {
  let seed = c.seed;
  let id = c.nextId;
  const rnd = () => {
    const [v, s] = nextRandom(seed);
    seed = s;
    return v;
  };

  const slabs = c.slabs.slice();
  const orbs = c.orbs.slice();
  const x = c.genX;
  const d = courseRamp(x);
  const w = (0.13 + rnd() * 0.12) * (1 + 0.35 * d);

  const put = (y0: number, y1: number, kind: ColumnKind, at = x, wide = w) => {
    if (y1 - y0 < THIN) return;
    slabs.push({ id: id++, x: at, w: wide, y0, y1, kind });
  };
  const orb = (ox: number, oy: number) => {
    orbs.push({ id: id++, x: ox, y: clamp(oy, RUNNER_R + 0.02, TRACK - RUNNER_R - 0.02), taken: [] });
  };

  // The shape menu widens as the course ramps.
  const menu: ColumnKind[] = ['wall', 'wall', 'wall', 'gate'];
  if (d > 0.12) menu.push('pillar', 'pillar');
  if (d > 0.3) menu.push('comb', 'wall');
  if (d > 0.5) menu.push('gate', 'comb');
  const kind = menu[Math.min(menu.length - 1, Math.floor(rnd() * menu.length))];

  let end = x + w;

  if (kind === 'gate') {
    // A gap suspended in the middle of the corridor: both surfaces are blocked,
    // so it can only be threaded by flipping across and flipping back to hang
    // in it. The gap stays generous because that is a two-tap manoeuvre.
    const gap = 0.48 - 0.07 * d;
    const half = gap / 2;
    const gy = TRACK / 2 + (rnd() - 0.5) * 0.16;
    put(0, gy - half, 'gate');
    put(gy + half, TRACK, 'gate');
    if (rnd() < 0.7) orb(x + w / 2, gy);
  } else if (kind === 'wall') {
    const h = Math.min(TRACK - MIN_FREE, 0.44 + rnd() * 0.14 + 0.06 * d);
    const fromTop = rnd() < 0.5;
    if (fromTop) put(0, h, 'wall');
    else put(TRACK - h, TRACK, 'wall');
    if (rnd() < 0.5) orb(x + w / 2, fromTop ? (h + TRACK) / 2 : (TRACK - h) / 2);
  } else if (kind === 'pillar') {
    const py = TRACK / 2 + (rnd() - 0.5) * 0.12;
    const ph = Math.min(0.14, 0.09 + rnd() * 0.045 + 0.02 * d);
    put(py - ph, py + ph, 'pillar');
    // The orb sits on one of the two ways round, never inside the pillar.
    orb(x + w / 2, rnd() < 0.5 ? (py - ph) / 2 : (py + ph + TRACK) / 2);
  } else {
    const h1 = Math.min(TRACK - MIN_FREE, 0.52 + rnd() * 0.1);
    const h2 = Math.min(TRACK - MIN_FREE, 0.52 + rnd() * 0.1);
    const topFirst = rnd() < 0.5;
    const sep = w + 0.44 + 0.22 * (1 - d);
    if (topFirst) {
      put(0, h1, 'comb');
      put(TRACK - h2, TRACK, 'comb', x + sep);
    } else {
      put(TRACK - h1, TRACK, 'comb');
      put(0, h2, 'comb', x + sep);
    }
    end = x + sep + w;
  }

  const run = (0.72 + rnd() * 0.42) * (1 + 0.6 * d);
  // A loose orb out in the open between columns: worth a detour, never a trap.
  if (rnd() < 0.45) orb(end + run * 0.5, 0.16 + rnd() * 0.68);

  return { slabs, orbs, genX: end + run, seed, nextId: id };
}

/** Lay down columns until the course reaches `toX`. */
export function extendCourse(c: Course, toX: number): Course {
  let out = c;
  // The guard is belt and braces: every column advances genX by at least 0.72.
  for (let n = 0; out.genX < toX && n < 4000; n++) out = emitColumn(out);
  return out;
}

/** The whole course from a seed out to `toX`. Two equal seeds give equal track. */
export const generateTo = (seed: number, toX: number) => extendCourse(newCourse(seed), toX);

// ── geometry ──────────────────────────────────────────────────────

/** Does a circle at (x, y) overlap this slab? */
export function hitsSlab(s: Slab, x: number, y: number, r: number): boolean {
  const cx = clamp(x, s.x, s.x + s.w);
  const cy = clamp(y, s.y0, s.y1);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy < r * r;
}

/** The first slab a circle at (x, y) is inside, or null. */
export function slabAt(slabs: Slab[], x: number, y: number, r = RUNNER_R): Slab | null {
  for (const s of slabs) if (hitsSlab(s, x, y, r)) return s;
  return null;
}

export interface Gap {
  y0: number;
  y1: number;
}

/**
 * The open bands of corridor across the whole window `[x0, x1]` — what is left
 * of the track once every slab overlapping that window is subtracted. Used both
 * to drop a runner somewhere survivable after a hit and to check, in the tests,
 * that the generator never lays down a column with no way through.
 */
export function freeGaps(slabs: Slab[], x0: number, x1: number): Gap[] {
  const blocks = slabs
    .filter((s) => s.x <= x1 && s.x + s.w >= x0)
    .map((s) => ({ y0: s.y0, y1: s.y1 }))
    .sort((a, b) => a.y0 - b.y0);
  const gaps: Gap[] = [];
  let y = 0;
  for (const b of blocks) {
    if (b.y0 > y) gaps.push({ y0: y, y1: b.y0 });
    y = Math.max(y, b.y1);
  }
  if (y < TRACK) gaps.push({ y0: y, y1: TRACK });
  return gaps;
}

/** The widest open band over that window — how much room a runner actually has. */
export function widestGap(slabs: Slab[], x0: number, x1: number): Gap | null {
  let best: Gap | null = null;
  for (const g of freeGaps(slabs, x0, x1)) if (!best || g.y1 - g.y0 > best.y1 - best.y0) best = g;
  return best;
}

/** Where to put a runner back after a hit: the middle of the roomiest band. */
export function safeY(slabs: Slab[], x: number, span = 0.34): number {
  const g = widestGap(slabs, x - RUNNER_R, x + span);
  if (!g) return TRACK / 2;
  return clamp((g.y0 + g.y1) / 2, RUNNER_R, TRACK - RUNNER_R);
}

// ── state ─────────────────────────────────────────────────────────

export interface Runner {
  seat: number;
  /** Height in the corridor, ceiling to floor. */
  y: number;
  vy: number;
  /** True while gravity pulls toward the ceiling. */
  flipped: boolean;
  lives: number;
  /** Out of lives, and out of the match. */
  out: boolean;
  /** Seconds of grace left after a hit. */
  invuln: number;
  /** Track heights travelled. Stops the moment a seat goes out. */
  dist: number;
  orbs: number;
  hits: number;
  flips: number;
  /** World time of the last flip, so a bot can be stopped from stuttering. */
  lastFlip: number;
  /** Distance since the last hit — the clean run the scoreboard brags about. */
  streak: number;
  best: number;
}

export type FragKind = 'hit' | 'out';

export interface Frag {
  id: number;
  seat: number;
  kind: FragKind;
  /** World time it happened. */
  t: number;
}

export interface FlipWorld {
  seats: number;
  runners: Runner[];
  course: Course;
  /** Where the runners are on the track. Everybody shares one camera. */
  x: number;
  speed: number;
  t: number;
  /** Seconds the round runs for. */
  limit: number;
  livesPer: number;
  feed: Frag[];
  over: boolean;
  winner: number | null;
  nextId: number;
}

const FEED_KEEP = 5;

export const timeLeft = (w: FlipWorld) => Math.max(0, w.limit - w.t);
/** Seats that still have a life in hand. */
export const standing = (w: FlipWorld) => w.runners.filter((r) => !r.out).map((r) => r.seat);

/** Distance banked plus orbs collected — the whole scoreboard. */
export const scoreOf = (r: Runner) => Math.round(r.dist * DIST_POINTS) + r.orbs * ORB_POINTS;

// ── setting up ────────────────────────────────────────────────────

/** The lobby's minutes, kept inside something a runner can actually survive. */
export const secondsFor = (minutes: number) => clamp(Math.round((Number(minutes) || 3) * 60), 40, 110);
/** The lobby's respawns, kept sane. */
export const livesFor = (lives: number) => clamp(Math.round(Number(lives) || 3), 1, 9);
export const seatsFor = (n: number) => clamp(Math.floor(n) || MIN_SEATS, MIN_SEATS, MAX_SEATS);

/**
 * A fresh run: everybody on the floor at the gun, one seeded course ahead of
 * them. `minutes` is the lobby's match length and `lives` its respawn allowance.
 */
export function startMatch(seats: number, lives: number, minutes: number, rng: Rng): FlipWorld {
  const n = seatsFor(seats);
  const per = livesFor(lives);
  const seed = Math.floor(rng() * 0xffffffff) >>> 0;
  const runners: Runner[] = Array.from({ length: n }, (_, seat) => ({
    seat,
    y: TRACK - RUNNER_R,
    vy: 0,
    flipped: false,
    lives: per,
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
    seats: n,
    runners,
    course: extendCourse(newCourse(seed), START_CLEAR + AHEAD),
    x: 0,
    speed: SPEED_0,
    t: 0,
    limit: secondsFor(minutes),
    livesPer: per,
    feed: [],
    over: false,
    winner: null,
    nextId: 1,
  };
}

// ── legality ──────────────────────────────────────────────────────

export type FlipError = 'no-runner' | 'over' | 'out';

export const FLIP_MESSAGE: Record<FlipError, string> = {
  'no-runner': 'That seat is not running',
  over: 'The run is over',
  out: 'You are out of lives',
};

/** Why a tap would do nothing right now, or null if it would flip gravity. */
export function flipProblem(w: FlipWorld, seat: number): FlipError | null {
  const r = w.runners[seat];
  if (!r) return 'no-runner';
  if (w.over) return 'over';
  if (r.out) return 'out';
  return null;
}

export const canFlip = (w: FlipWorld, seat: number) => flipProblem(w, seat) === null;

/**
 * Flip one seat's gravity. Throws on an illegal tap — check `flipProblem` first.
 * `step` applies flips through the same guard, so a dead seat mashing the glass
 * changes nothing.
 */
export function flip(w: FlipWorld, seat: number): FlipWorld {
  const bad = flipProblem(w, seat);
  if (bad) throw new Error(FLIP_MESSAGE[bad]);
  const runners = w.runners.slice();
  const r = runners[seat];
  runners[seat] = { ...r, flipped: !r.flipped, flips: r.flips + 1, lastFlip: w.t };
  return { ...w, runners };
}

// ── the simulation ────────────────────────────────────────────────

/**
 * What each seat is asking for this tick. A bare boolean is seat 0's tap, which
 * is the single-runner reading of `step(world, dt, flipped)`; an array is one
 * flag per seat, which is what a table of runners needs.
 */
export type FlipInput = boolean | boolean[];

const wants = (f: FlipInput, seat: number) => (Array.isArray(f) ? !!f[seat] : seat === 0 && !!f);

/**
 * Advance the whole run by `dt`.
 *
 * Order matters: flips land before the integration, so a tap is felt on the tick
 * it was made. Then the camera rolls, the course is extended ahead of it, every
 * runner falls, and the slabs and orbs are tested at the shared x. Anything that
 * has scrolled off the back is culled so the arrays stay short.
 */
export function step(w: FlipWorld, dt: number, flipped: FlipInput = false): FlipWorld {
  if (w.over) return w;
  const h = clamp(Number(dt) || 0, 0, MAX_DT);
  if (h <= 0) return w;

  let out = w;
  for (let seat = 0; seat < w.seats; seat++) {
    if (wants(flipped, seat) && canFlip(out, seat)) out = flip(out, seat);
  }

  const speed = speedAt(out.t);
  const x = out.x + speed * h;
  const course = extendCourse(out.course, x + AHEAD);
  const slabs = course.slabs;
  // Orbs are shared, so a pickup is written once into a copy of the list.
  let orbs = course.orbs;
  let orbsCopied = false;
  const takeOrb = (i: number, seat: number) => {
    if (!orbsCopied) {
      orbs = orbs.slice();
      orbsCopied = true;
    }
    orbs[i] = { ...orbs[i], taken: orbs[i].taken.concat(seat) };
  };

  let feed = out.feed;
  let nextId = out.nextId;
  const t = out.t + h;
  const say = (seat: number, kind: FragKind) => {
    feed = feed.concat({ id: nextId++, seat, kind, t }).slice(-FEED_KEEP);
  };

  const runners = out.runners.map((r) => {
    if (r.out) return r;
    const n: Runner = { ...r };

    // Fall.
    n.vy += (n.flipped ? -G : G) * h;
    n.y += n.vy * h;
    if (n.y <= RUNNER_R) {
      n.y = RUNNER_R;
      if (n.vy < 0) n.vy = 0;
    } else if (n.y >= TRACK - RUNNER_R) {
      n.y = TRACK - RUNNER_R;
      if (n.vy > 0) n.vy = 0;
    }

    n.dist += speed * h;
    n.streak += speed * h;
    if (n.streak > n.best) n.best = n.streak;
    if (n.invuln > 0) n.invuln = Math.max(0, n.invuln - h);

    // Orbs first: a gap you only just squeezed through still pays.
    for (let i = 0; i < orbs.length; i++) {
      const o = orbs[i];
      if (o.taken.includes(n.seat)) continue;
      const dx = x - o.x;
      const dy = n.y - o.y;
      const reach = ORB_R + RUNNER_R;
      if (dx * dx + dy * dy <= reach * reach) {
        takeOrb(i, n.seat);
        n.orbs += 1;
      }
    }

    if (n.invuln <= 0 && slabAt(slabs, x, n.y)) {
      n.hits += 1;
      n.lives -= 1;
      n.streak = 0;
      n.invuln = INVULN;
      n.vy = 0;
      n.y = safeY(slabs, x);
      if (n.lives <= 0) {
        n.lives = 0;
        n.out = true;
        say(n.seat, 'out');
      } else {
        say(n.seat, 'hit');
      }
    }

    return n;
  });

  const back = x - BEHIND;
  const culled: Course = {
    ...course,
    slabs: slabs.filter((s) => s.x + s.w >= back),
    orbs: orbs.filter((o) => o.x >= back && o.taken.length < out.seats),
  };

  const alive = runners.some((r) => !r.out);
  const over = !alive || t >= out.limit;
  const next: FlipWorld = {
    ...out,
    runners,
    course: culled,
    x,
    speed,
    t,
    feed,
    nextId,
    over,
    winner: null,
  };
  return over ? { ...next, winner: standings(next)[0] } : next;
}

/**
 * Best first: score, then orbs, then the cleanest run, then lives kept, then
 * seat order. Fully ordered, so a finished run always names exactly one winner.
 */
export function standings(w: FlipWorld): number[] {
  return w.runners
    .slice()
    .sort(
      (a, b) =>
        scoreOf(b) - scoreOf(a) ||
        b.orbs - a.orbs ||
        b.best - a.best ||
        b.lives - a.lives ||
        a.seat - b.seat,
    )
    .map((r) => r.seat);
}

/** 1 for the seat at the top of the board. */
export const placeOf = (w: FlipWorld, seat: number) => standings(w).indexOf(seat) + 1;

// ── the bot ───────────────────────────────────────────────────────

/** The coarse tick a projection runs at — fine enough to catch a slab edge. */
export const PROJ_DT = 1 / 24;
/**
 * The fastest a bot can tap twice, before its skill is taken into account. It
 * stops a bot stuttering on a slab edge, and — stretched out for a clumsy bot —
 * it is most of what a low `skill` costs: hesitate a fifth of a second and the
 * two-tap hover through a gate stops working.
 */
export const FLIP_COOLDOWN = 0.09;

export interface Projection {
  /** Seconds survived, capped at the horizon. */
  time: number;
  orbs: number;
}

/**
 * Run one runner forward on the current course under a fixed plan: flip now or
 * not, and optionally flip once more at `flipAt` seconds in. Nothing is written
 * back — this is the bot imagining, with exactly the physics `step` uses.
 */
export function project(
  w: FlipWorld,
  seat: number,
  flipNow: boolean,
  horizon: number,
  flipAt = Infinity,
): Projection {
  const r = w.runners[seat];
  if (!r) return { time: 0, orbs: 0 };

  const reach = w.x + w.speed * horizon + 0.4;
  const slabs = w.course.slabs.filter((s) => s.x + s.w >= w.x - 0.2 && s.x <= reach);
  const orbs = w.course.orbs.filter((o) => o.x >= w.x - 0.2 && o.x <= reach && !o.taken.includes(seat));
  const got = new Set<number>();

  let y = r.y;
  let vy = r.vy;
  let flipped = flipNow ? !r.flipped : r.flipped;
  let x = w.x;
  let t = 0;
  let turned = false;

  while (t < horizon) {
    if (!turned && t >= flipAt) {
      flipped = !flipped;
      turned = true;
    }
    vy += (flipped ? -G : G) * PROJ_DT;
    y += vy * PROJ_DT;
    if (y <= RUNNER_R) {
      y = RUNNER_R;
      if (vy < 0) vy = 0;
    } else if (y >= TRACK - RUNNER_R) {
      y = TRACK - RUNNER_R;
      if (vy > 0) vy = 0;
    }
    x += w.speed * PROJ_DT;
    t += PROJ_DT;

    for (const o of orbs) {
      if (got.has(o.id)) continue;
      const dx = x - o.x;
      const dy = y - o.y;
      const rr = ORB_R + RUNNER_R;
      if (dx * dx + dy * dy <= rr * rr) got.add(o.id);
    }
    if (slabAt(slabs, x, y)) return { time: t, orbs: got.size };
  }
  return { time: horizon, orbs: got.size };
}

const better = (a: Projection, b: Projection) => a.time > b.time + 1e-6 || (a.time >= b.time - 1e-6 && a.orbs > b.orbs);

/** The second-flip times a bot of this depth is willing to consider. */
export function flipTimes(depth: number, horizon: number): number[] {
  const n = Math.max(0, Math.round(depth) - 1) * 3;
  return Array.from({ length: n }, (_, i) => ((i + 1) / (n + 1)) * horizon);
}

/**
 * The best a seat can do over the horizon if its first action is (or is not) a
 * flip: try the plain plan, then every second-flip time its depth affords. A
 * one-ply bot never looks past its first flip, which is exactly why it cannot
 * park itself in the middle of a gate; a three-ply bot can flip across and flip
 * back to hang in the gap.
 */
export function bestPlan(w: FlipWorld, seat: number, flipNow: boolean, horizon: number, depth: number): Projection {
  let best = project(w, seat, flipNow, horizon);
  for (const tau of flipTimes(depth, horizon)) {
    const p = project(w, seat, flipNow, horizon, tau);
    if (better(p, best)) best = p;
  }
  return best;
}

/**
 * Whether a bot taps this tick.
 *
 * It projects the corridor twice — once carrying on, once flipping now — and
 * takes whichever plan lives longer, breaking a tie on orbs. `depth` buys the
 * second flip inside the plan, `skill` buys how far ahead it can see at all, and
 * `blunder` is a rate per second of a tap it never meant to make: an Easy bot
 * throws itself at the ceiling roughly every two seconds, a Sharp one about once
 * a run. `dt` is the interval since it was last asked, so a screen can poll it
 * at whatever rate it likes without changing how often it fumbles.
 */
export function botFlip(w: FlipWorld, seat: number, bot: BotProfile, rng: Rng, dt: number = DT): boolean {
  if (flipProblem(w, seat)) return false;
  const r = w.runners[seat];
  const skill = clamp(bot.skill, 0, 1);

  // Hands: how fast it can tap twice at all.
  if (w.t - r.lastFlip < FLIP_COOLDOWN + 0.22 * (1 - skill)) return false;

  // Eyes: never further than the track a player can see, and a clumsy bot sees
  // rather less of even that.
  const sight = SIGHT * (0.72 + 0.38 * skill);
  const horizon = Math.min(
    (0.55 + 0.34 * Math.max(1, bot.depth)) * (0.62 + 0.38 * skill),
    sight / Math.max(0.1, w.speed),
  );
  const stay = bestPlan(w, seat, false, horizon, bot.depth);
  const turn = bestPlan(w, seat, true, horizon, bot.depth);

  // Nerve: flipping is the exception, and a clumsy bot wants more convincing —
  // which is exactly how it ends up committing too late.
  const margin = 0.03 + 0.11 * (1 - skill);
  let want = turn.time > stay.time + margin || (turn.time >= horizon && stay.time >= horizon && turn.orbs > stay.orbs);
  if (rng() < bot.blunder * 1.6 * clamp(dt, 0, MAX_DT)) want = !want;
  return want;
}

// ── the scoreboard ────────────────────────────────────────────────

/** Distance run, orbs banked, the place, and the run itself. */
export function xpFor(w: FlipWorld, seat: number): number {
  const r = w.runners[seat];
  if (!r) return 0;
  return (
    50 +
    Math.round(r.dist * 12) +
    30 * r.orbs +
    25 * (w.seats - placeOf(w, seat)) +
    (w.winner === seat ? 220 : 0)
  );
}

/**
 * "4,120" — thousands grouped by hand rather than through `toLocaleString`,
 * which needs an ICU build the phone may not have.
 */
export function group(n: number): string {
  const sign = n < 0 ? '-' : '';
  const digits = String(Math.abs(Math.round(n)));
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  return sign + out;
}

/** "4,120 · 9 orbs · 2 lives left" — the scoreboard's line for a seat. */
export function lineFor(w: FlipWorld, seat: number): string {
  const r = w.runners[seat];
  if (!r) return '—';
  const tail = r.out ? 'crashed out' : `${r.lives} ${r.lives === 1 ? 'life' : 'lives'} left`;
  return `${group(scoreOf(r))} · ${r.orbs} orb${r.orbs === 1 ? '' : 's'} · ${tail}`;
}

/** "×1.8" — how far the speed ramp has run. */
export const speedLabel = (w: FlipWorld) => `×${(w.speed / SPEED_0).toFixed(1)}`;
