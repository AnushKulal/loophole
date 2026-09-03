/**
 * 3D Tank War — a top-down arena battle.
 *
 * The arena is a portrait rectangle of open floor with a point-symmetric set of
 * axis-aligned blocks dropped into it, so no seat gets a better corner than any
 * other. Every tank is a box with a hull heading and a turret bearing that turn
 * at their own rates; every shell is a point that flies, bounces off the blocks
 * and the walls while it still has bounces left, and takes a plate off whatever
 * it touches. Three plates wrecks a tank, a wreck costs a life, and running out
 * of lives puts a seat out for good.
 *
 * `step(world, dt, inputs)` is the whole simulation: turn, drive, shove out of
 * walls, fire, fly, bounce, hit, respawn, then check the clock. It knows nothing
 * about frames — the screen drives it from a requestAnimationFrame accumulator
 * at a fixed `DT`, the bots read the same world the renderer draws, and the
 * tests replay a whole match from a seed. One dt, one physics.
 *
 * Pure data and pure transitions: no React, no clock, no `Math.random`. Chance
 * enters only through an `Rng`.
 */

import { pick, type BotProfile, type Rng } from './contract';

// ── the arena ─────────────────────────────────────────────────────

/** The floor, in world units. Portrait, because the screen is. */
export const ARENA_W = 1;
export const ARENA_H = 1.3;

export interface Vec {
  x: number;
  y: number;
}

/** Every obstacle is axis aligned — that is what makes the bounces cheap. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Half-width of a tank's collision box, and the radius shells are checked against. */
export const TANK_R = 0.038;
export const SHELL_R = 0.011;

/** Drive speed at full stick, in arena widths per second. */
export const TANK_SPEED = 0.36;
/** Hull and turret slew, in radians per second. */
export const TURN_RATE = 5.5;
export const TURRET_RATE = 3.6;
/** A tank crawls while it is swinging the hull round, and opens up once it is straight. */
export const TURN_DRAG = 0.42;

export const SHELL_SPEED = 0.8;
/** Seconds between shots. */
export const RELOAD = 0.85;
/**
 * How long your own shell stays harmless to you. A bank shot off the far wall
 * really can come back and take your own plates off; a shell fired point blank
 * into the block you are hugging is just a wasted round.
 */
export const OWN_GRACE = 0.3;
/** Shells one tank may have in the air at once. */
export const MAX_SHELLS = 4;
/** How many walls a shell may bounce off before it dies. */
export const BOUNCES = 1;
/** Seconds a shell lives even if it never hits anything. */
export const SHELL_LIFE = 3.4;

/** Plates on a hull. Three hits wrecks it. */
export const HP = 3;
export const RESPAWN_DELAY = 1.6;
/** Seconds of spawn protection, so a respawn is not a free kill. */
export const INVULN = 1.4;

/** The fixed physics tick. The screen's accumulator uses the same one. */
export const DT = 1 / 60;
/** No single `step` may swallow more than this, however long the frame took. */
export const MAX_DT = 0.05;

export const MIN_SEATS = 2;
export const MAX_SEATS = 8;

const TAU = Math.PI * 2;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** An angle folded into (-π, π]. */
export function norm(a: number): number {
  let x = a % TAU;
  if (x > Math.PI) x -= TAU;
  if (x <= -Math.PI) x += TAU;
  return x;
}

/** The shortest signed turn from `b` to `a`. */
export const angDiff = (a: number, b: number) => norm(a - b);

/** Turn `cur` toward `target`, but no further than `max` this tick. */
export function rotateToward(cur: number, target: number, max: number): number {
  const d = norm(target - cur);
  return Math.abs(d) <= max ? norm(target) : norm(cur + Math.sign(d) * max);
}

/**
 * Three block layouts, given as the top half of the arena. The bottom half is
 * the same set rotated 180° about the centre, so both ends of the floor are
 * exactly as defensible as each other.
 */
const HALVES: Rect[][] = [
  // Crossroads — two long bars and a stub, funnelling play through the middle.
  [
    { x: 0.2, y: 0.26, w: 0.3, h: 0.05 },
    { x: 0.66, y: 0.16, w: 0.05, h: 0.26 },
    { x: 0.1, y: 0.5, w: 0.05, h: 0.2 },
    { x: 0.4, y: 0.55, w: 0.2, h: 0.05 },
  ],
  // Bunkers — an L in each corner to hide behind and shoot round.
  [
    { x: 0.14, y: 0.18, w: 0.18, h: 0.05 },
    { x: 0.14, y: 0.18, w: 0.05, h: 0.2 },
    { x: 0.56, y: 0.3, w: 0.3, h: 0.05 },
    { x: 0.44, y: 0.44, w: 0.05, h: 0.16 },
  ],
  // Pillars — small squares, so almost every angle is a bank shot.
  [
    { x: 0.16, y: 0.22, w: 0.1, h: 0.1 },
    { x: 0.5, y: 0.14, w: 0.1, h: 0.1 },
    { x: 0.74, y: 0.34, w: 0.1, h: 0.1 },
    { x: 0.28, y: 0.46, w: 0.1, h: 0.1 },
    { x: 0.6, y: 0.5, w: 0.1, h: 0.1 },
  ],
];

export const LAYOUTS = HALVES.length;

const mirror = (r: Rect): Rect => ({ x: ARENA_W - r.x - r.w, y: ARENA_H - r.y - r.h, w: r.w, h: r.h });

/** One of the layouts, mirrored into a full arena. */
export function buildArena(rng: Rng): Rect[] {
  const half = pick(HALVES, rng);
  return half.concat(half.map(mirror));
}

/** The same, by index — the tests walk every layout. */
export function arenaAt(i: number): Rect[] {
  const half = HALVES[((i % LAYOUTS) + LAYOUTS) % LAYOUTS];
  return half.concat(half.map(mirror));
}

/** Eight starting marks: the corners, then the ends, then the flanks. */
export const SPAWN_MARKS: Vec[] = [
  { x: 0.11, y: 0.11 },
  { x: 0.89, y: 1.19 },
  { x: 0.89, y: 0.11 },
  { x: 0.11, y: 1.19 },
  { x: 0.5, y: 0.09 },
  { x: 0.5, y: 1.21 },
  { x: 0.06, y: 0.65 },
  { x: 0.94, y: 0.65 },
];

// ── geometry ──────────────────────────────────────────────────────

/** Does the box of half-size `r` around (x, y) overlap `w`? */
export function overlaps(w: Rect, x: number, y: number, r: number): boolean {
  return x + r > w.x && x - r < w.x + w.w && y + r > w.y && y - r < w.y + w.h;
}

/** Is a box of half-size `r` at (x, y) buried in any wall? */
export const insideWall = (walls: Rect[], x: number, y: number, r: number) =>
  walls.some((w) => overlaps(w, x, y, r));

/**
 * Slide a box out of anything it is buried in, along whichever axis it is least
 * deep on, and keep it on the floor. Two passes settle a corner between blocks.
 */
export function pushOut(walls: Rect[], x: number, y: number, r: number): Vec {
  let px = clamp(x, r, ARENA_W - r);
  let py = clamp(y, r, ARENA_H - r);
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const w of walls) {
      const ox = Math.min(px + r, w.x + w.w) - Math.max(px - r, w.x);
      const oy = Math.min(py + r, w.y + w.h) - Math.max(py - r, w.y);
      if (ox <= 0 || oy <= 0) continue;
      moved = true;
      if (ox < oy) px += px < w.x + w.w / 2 ? -ox : ox;
      else py += py < w.y + w.h / 2 ? -oy : oy;
    }
    px = clamp(px, r, ARENA_W - r);
    py = clamp(py, r, ARENA_H - r);
    if (!moved) break;
  }
  return { x: px, y: py };
}

/** Liang–Barsky: does the segment touch the rect, grown by `pad`? */
export function segHitsRect(x1: number, y1: number, x2: number, y2: number, r: Rect, pad = 0): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const edges: [number, number][] = [
    [-dx, x1 - (r.x - pad)],
    [dx, r.x + r.w + pad - x1],
    [-dy, y1 - (r.y - pad)],
    [dy, r.y + r.h + pad - y1],
  ];
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
  }
  return true;
}

/** Can a shell fly straight from a to b without meeting a block? */
export const clearShot = (walls: Rect[], ax: number, ay: number, bx: number, by: number) =>
  !walls.some((w) => segHitsRect(ax, ay, bx, by, w, SHELL_R));

// ── the navigation grid ───────────────────────────────────────────

/**
 * Steering by "head that way unless something is in front of me" walks straight
 * into a local minimum: the bot backs off a block, turns at it again, and dies
 * of old age in the corner. So the floor is also kept as a coarse grid of cells
 * a tank fits in, and a bot that cannot see its target floods the grid outward
 * from that target and walks downhill. It is one breadth-first search over a few
 * hundred cells, which is cheaper than the ray sampling it replaces and, unlike
 * it, always finds the way round.
 */
export const CELL = 0.04;
export const GW = Math.ceil(ARENA_W / CELL);
export const GH = Math.ceil(ARENA_H / CELL);

/** 1 where a tank's box fits, 0 where a block is. Depends only on the walls. */
export function buildGrid(walls: Rect[]): Uint8Array {
  const g = new Uint8Array(GW * GH);
  for (let j = 0; j < GH; j++) {
    for (let i = 0; i < GW; i++) {
      const x = (i + 0.5) * CELL;
      const y = (j + 0.5) * CELL;
      g[j * GW + i] = insideWall(walls, x, y, TANK_R * 0.9) ? 0 : 1;
    }
  }
  return g;
}

export const cellOf = (x: number, y: number) =>
  clamp(Math.floor(y / CELL), 0, GH - 1) * GW + clamp(Math.floor(x / CELL), 0, GW - 1);

export const cellCentre = (c: number): Vec => ({ x: ((c % GW) + 0.5) * CELL, y: (Math.floor(c / GW) + 0.5) * CELL });

/** The nearest open cell to `c`, searched in widening rings. */
function nearestOpen(grid: Uint8Array, c: number): number {
  if (grid[c]) return c;
  const ci = c % GW;
  const cj = Math.floor(c / GW);
  for (let r = 1; r <= 4; r++) {
    for (let j = cj - r; j <= cj + r; j++) {
      for (let i = ci - r; i <= ci + r; i++) {
        if (i < 0 || j < 0 || i >= GW || j >= GH) continue;
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
        const k = j * GW + i;
        if (grid[k]) return k;
      }
    }
  }
  return -1;
}

/** Cell-steps from every reachable cell back to (gx, gy); -1 where there is no way through. */
export function flowField(grid: Uint8Array, gx: number, gy: number): Int16Array {
  const dist = new Int16Array(GW * GH).fill(-1);
  const start = nearestOpen(grid, cellOf(gx, gy));
  if (start < 0) return dist;
  const queue = new Int32Array(GW * GH);
  let head = 0;
  let tail = 0;
  dist[start] = 0;
  queue[tail++] = start;
  while (head < tail) {
    const c = queue[head++];
    const i = c % GW;
    const j = (c - i) / GW;
    const d = dist[c] + 1;
    if (i > 0 && grid[c - 1] && dist[c - 1] < 0) (dist[c - 1] = d), (queue[tail++] = c - 1);
    if (i < GW - 1 && grid[c + 1] && dist[c + 1] < 0) (dist[c + 1] = d), (queue[tail++] = c + 1);
    if (j > 0 && grid[c - GW] && dist[c - GW] < 0) (dist[c - GW] = d), (queue[tail++] = c - GW);
    if (j < GH - 1 && grid[c + GW] && dist[c + GW] < 0) (dist[c + GW] = d), (queue[tail++] = c + GW);
  }
  return dist;
}

/** How far a tank could drive from (x, y) along `angle` before something stops it. */
export function clearance(walls: Rect[], x: number, y: number, angle: number, max = 0.45): number {
  const cx = Math.cos(angle);
  const cy = Math.sin(angle);
  const stepLen = TANK_R * 0.6;
  let d = 0;
  while (d < max) {
    const next = Math.min(d + stepLen, max);
    const px = x + cx * next;
    const py = y + cy * next;
    if (px < TANK_R || px > ARENA_W - TANK_R || py < TANK_R || py > ARENA_H - TANK_R) return d;
    if (insideWall(walls, px, py, TANK_R * 0.9)) return d;
    d = next;
  }
  return max;
}

// ── state ─────────────────────────────────────────────────────────

export interface Tank {
  seat: number;
  x: number;
  y: number;
  /** Where the hull points, and where it drives. */
  hull: number;
  /** Where the gun points. Shells leave along this. */
  turret: number;
  /** Metres per second the hull actually covered last tick — the tracks read from this. */
  speed: number;
  hp: number;
  lives: number;
  alive: boolean;
  /** Out of lives: no more respawns, and out of the match. */
  out: boolean;
  /** Seconds until the gun is loaded. */
  reload: number;
  /** Seconds until a wreck rolls back on. */
  respawn: number;
  /** Seconds of spawn protection left. */
  invuln: number;
  kills: number;
  deaths: number;
  shots: number;
  hits: number;
  /** Fixed at the start, so a bot's weave is its own. */
  phase: number;
}

export interface Shell {
  id: number;
  owner: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Bounces left. Below zero the shell is spent. */
  bounces: number;
  /** Bounces already taken — a shell can only hit its own tank after one. */
  bumps: number;
  age: number;
}

/** A puff the screen draws and the engine ages out. Carries no rules. */
export interface Blast {
  id: number;
  x: number;
  y: number;
  age: number;
  ttl: number;
  /** A wreck rather than a plate. */
  big: boolean;
}

/** One line of the kill feed. */
export interface Frag {
  id: number;
  killer: number;
  victim: number;
  /** Match time it happened at. */
  at: number;
}

export interface TankWorld {
  seats: number;
  walls: Rect[];
  /** Where a tank fits, for the bots' pathfinding. Fixed for the match. */
  grid: Uint8Array;
  spawns: Vec[];
  tanks: Tank[];
  shells: Shell[];
  blasts: Blast[];
  feed: Frag[];
  /** Seconds of match elapsed. */
  t: number;
  /** Seconds the match runs for. */
  limit: number;
  livesPer: number;
  over: boolean;
  winner: number | null;
  nextId: number;
}

/** What one tank is being told to do this tick. */
export interface Input {
  /** Stick vector. Its length is the throttle, clamped to 1. */
  mx: number;
  my: number;
  /**
   * Bearing to swing the gun toward. `null` points it wherever the hull is
   * driving, which is what an idle stick leaves you with.
   */
  aim: number | null;
  fire: boolean;
}

export const IDLE: Input = { mx: 0, my: 0, aim: null, fire: false };

/** Below this the stick is treated as centred. */
export const STICK_DEAD = 0.12;

const FEED_KEEP = 5;
const BLAST_KEEP = 40;

export const timeLeft = (w: TankWorld) => Math.max(0, w.limit - w.t);

/** Seats that still have a life in hand. */
export const standing = (w: TankWorld) => w.tanks.filter((t) => !t.out).map((t) => t.seat);

// ── setting up ────────────────────────────────────────────────────

/** The lobby's minutes, kept inside something a phone match can actually run. */
export const secondsFor = (minutes: number) => clamp(Math.round((Number(minutes) || 3) * 60), 60, 600);
/** The lobby's respawns, kept sane. */
export const livesFor = (lives: number) => clamp(Math.round(Number(lives) || 3), 1, 9);
export const seatsFor = (n: number) => clamp(Math.floor(n) || MIN_SEATS, MIN_SEATS, MAX_SEATS);

function spawnAt(walls: Rect[], mark: Vec): Vec {
  return pushOut(walls, mark.x, mark.y, TANK_R * 1.15);
}

/** Which mark to roll a tank back onto: the one furthest from anybody who could shoot it. */
export function bestSpawn(w: TankWorld, seat: number): Vec {
  const foes = w.tanks.filter((t) => t.seat !== seat && t.alive);
  let best = w.spawns[seat % w.spawns.length];
  let bestScore = -1;
  w.spawns.forEach((s) => {
    let near = 99;
    for (const f of foes) near = Math.min(near, Math.hypot(f.x - s.x, f.y - s.y));
    if (near > bestScore) {
      bestScore = near;
      best = s;
    }
  });
  return best;
}

/** Face the middle of the floor, so nobody opens the match staring at a wall. */
const facingIn = (p: Vec) => Math.atan2(ARENA_H / 2 - p.y, ARENA_W / 2 - p.x);

/**
 * A fresh arena: a mirrored block layout, a mark each, and everybody loaded.
 * Two to eight seats; `minutes` is the lobby's match length and `lives` its
 * respawn allowance.
 */
export function startMatch(seats: number, lives: number, minutes: number, rng: Rng): TankWorld {
  const n = seatsFor(seats);
  const walls = buildArena(rng);
  const spawns = SPAWN_MARKS.map((m) => spawnAt(walls, m));
  const per = livesFor(lives);
  const tanks: Tank[] = Array.from({ length: n }, (_, seat) => {
    const p = spawns[seat % spawns.length];
    return {
      seat,
      x: p.x,
      y: p.y,
      hull: facingIn(p),
      turret: facingIn(p),
      speed: 0,
      hp: HP,
      lives: per,
      alive: true,
      out: false,
      reload: 0,
      respawn: 0,
      invuln: INVULN,
      kills: 0,
      deaths: 0,
      shots: 0,
      hits: 0,
      phase: rng() * TAU,
    };
  });
  return {
    seats: n,
    walls,
    grid: buildGrid(walls),
    spawns,
    tanks,
    shells: [],
    blasts: [],
    feed: [],
    t: 0,
    limit: secondsFor(minutes),
    livesPer: per,
    over: false,
    winner: null,
    nextId: 1,
  };
}

// ── legality ──────────────────────────────────────────────────────

export type InputError = 'no-tank' | 'over' | 'wrecked' | 'bad-vector' | 'bad-aim';

export const INPUT_MESSAGE: Record<InputError, string> = {
  'no-tank': 'That seat has no tank',
  over: 'The match is over',
  wrecked: 'Your tank is wrecked',
  'bad-vector': 'The stick is out of range',
  'bad-aim': 'That is not a bearing',
};

const finite = (n: number) => typeof n === 'number' && Number.isFinite(n);

/** Why this order would be ignored right now, or null if the tank can take it. */
export function inputProblem(w: TankWorld, seat: number, i: Input): InputError | null {
  const me = w.tanks[seat];
  if (!me) return 'no-tank';
  if (w.over) return 'over';
  if (!me.alive) return 'wrecked';
  if (!i || !finite(i.mx) || !finite(i.my)) return 'bad-vector';
  if (Math.hypot(i.mx, i.my) > 1.0001) return 'bad-vector';
  if (i.aim !== null && !finite(i.aim)) return 'bad-aim';
  return null;
}

export const isLegalInput = (w: TankWorld, seat: number, i: Input) => inputProblem(w, seat, i) === null;

export type FireError = 'no-tank' | 'over' | 'wrecked' | 'reloading' | 'no-shells';

export const FIRE_MESSAGE: Record<FireError, string> = {
  'no-tank': 'That seat has no tank',
  over: 'The match is over',
  wrecked: 'Your tank is wrecked',
  reloading: 'Still reloading',
  'no-shells': 'Four shells in the air already',
};

/** Why the gun would not go off, or null if it would. */
export function fireProblem(w: TankWorld, seat: number): FireError | null {
  const me = w.tanks[seat];
  if (!me) return 'no-tank';
  if (w.over) return 'over';
  if (!me.alive) return 'wrecked';
  if (me.reload > 0) return 'reloading';
  if (w.shells.filter((s) => s.owner === seat).length >= MAX_SHELLS) return 'no-shells';
  return null;
}

export const canFire = (w: TankWorld, seat: number) => fireProblem(w, seat) === null;

// ── the simulation ────────────────────────────────────────────────

/** Best-first: still in the match, then kills, then lives, then fewest wrecks. */
export function standings(w: TankWorld): number[] {
  return w.tanks
    .map((t) => t)
    .sort(
      (a, b) =>
        Number(a.out) - Number(b.out) ||
        b.kills - a.kills ||
        b.lives - a.lives ||
        a.deaths - b.deaths ||
        a.seat - b.seat,
    )
    .map((t) => t.seat);
}

/** 1 for the seat at the top of the board. */
export const placeOf = (w: TankWorld, seat: number) => standings(w).indexOf(seat) + 1;

function muzzle(t: Tank, walls: Rect[]): Vec {
  const d = TANK_R + SHELL_R * 2.2;
  const x = t.x + Math.cos(t.turret) * d;
  const y = t.y + Math.sin(t.turret) * d;
  // A barrel poked into a block would spawn the shell inside it, and a shell
  // inside a block only rattles. Drop it back onto the hull instead.
  if (x < SHELL_R || x > ARENA_W - SHELL_R || y < SHELL_R || y > ARENA_H - SHELL_R) return { x: t.x, y: t.y };
  return insideWall(walls, x, y, SHELL_R) ? { x: t.x, y: t.y } : { x, y };
}

function shellBlocked(walls: Rect[], x: number, y: number): boolean {
  if (x < SHELL_R || x > ARENA_W - SHELL_R || y < SHELL_R || y > ARENA_H - SHELL_R) return true;
  return insideWall(walls, x, y, SHELL_R);
}

/**
 * One tick of the whole arena.
 *
 * Order matters and is fixed: clocks, respawns, then every tank turns, drives
 * and shoots off the same snapshot, then the shells fly and bounce, then the
 * hits land, then the match is asked whether it is finished. `inputs` is keyed
 * by seat; a seat with no input coasts. Illegal orders are ignored rather than
 * thrown — a frame loop has nowhere to put an exception.
 */
export function step(w: TankWorld, dt: number, inputs: Record<number, Input> = {}): TankWorld {
  if (w.over) return w;
  const d = clamp(Number(dt) || 0, 0, MAX_DT);
  if (d <= 0) return w;

  const t = w.t + d;
  const walls = w.walls;
  let nextId = w.nextId;
  const blasts: Blast[] = [];
  const shells: Shell[] = [];
  const feed = w.feed.slice();

  // ── clocks and respawns ─────────────────────────────────────────
  const tanks: Tank[] = w.tanks.map((p) => {
    const n: Tank = { ...p };
    n.reload = Math.max(0, n.reload - d);
    n.invuln = Math.max(0, n.invuln - d);
    if (!n.alive && !n.out) {
      n.respawn = Math.max(0, n.respawn - d);
      n.speed = 0;
    }
    return n;
  });

  const rolling: TankWorld = { ...w, tanks };
  tanks.forEach((n) => {
    if (n.alive || n.out || n.respawn > 0) return;
    const spot = bestSpawn(rolling, n.seat);
    n.x = spot.x;
    n.y = spot.y;
    n.hull = facingIn(spot);
    n.turret = n.hull;
    n.hp = HP;
    n.alive = true;
    n.invuln = INVULN;
    n.reload = 0;
    n.speed = 0;
  });

  // ── drive and shoot ─────────────────────────────────────────────
  for (const n of tanks) {
    if (!n.alive) continue;
    const raw = inputs[n.seat];
    const order = raw && inputProblem(rolling, n.seat, raw) === null ? raw : IDLE;

    const mag = Math.min(1, Math.hypot(order.mx, order.my));
    if (mag > STICK_DEAD) {
      const want = Math.atan2(order.my, order.mx);
      n.hull = rotateToward(n.hull, want, TURN_RATE * d);
      // Swinging the hull round costs pace; straight ahead is full speed.
      const straight = Math.max(0, Math.cos(angDiff(want, n.hull)));
      const v = TANK_SPEED * mag * (TURN_DRAG + (1 - TURN_DRAG) * straight);
      const spot = pushOut(walls, n.x + Math.cos(n.hull) * v * d, n.y + Math.sin(n.hull) * v * d, TANK_R);
      n.speed = Math.hypot(spot.x - n.x, spot.y - n.y) / d;
      n.x = spot.x;
      n.y = spot.y;
    } else {
      n.speed = 0;
    }

    const aim = order.aim === null ? (mag > STICK_DEAD ? n.hull : n.turret) : order.aim;
    n.turret = rotateToward(n.turret, aim, TURRET_RATE * d);

    if (order.fire && fireProblem(rolling, n.seat) === null && n.reload <= 0) {
      const m = muzzle(n, walls);
      shells.push({
        id: nextId++,
        owner: n.seat,
        x: m.x,
        y: m.y,
        vx: Math.cos(n.turret) * SHELL_SPEED,
        vy: Math.sin(n.turret) * SHELL_SPEED,
        bounces: BOUNCES,
        bumps: 0,
        age: 0,
      });
      n.reload = RELOAD;
      n.shots += 1;
    }
  }

  // ── shells fly and bounce ───────────────────────────────────────
  for (const s of w.shells) {
    const n: Shell = { ...s, age: s.age + d };
    if (n.age > SHELL_LIFE) continue;
    let bumped = false;

    const nx = n.x + n.vx * d;
    if (shellBlocked(walls, nx, n.y)) {
      n.vx = -n.vx;
      bumped = true;
    } else n.x = nx;

    const ny = n.y + n.vy * d;
    if (shellBlocked(walls, n.x, ny)) {
      n.vy = -n.vy;
      bumped = true;
    } else n.y = ny;

    if (bumped) {
      // A corner counts once — a shell should not lose its whole budget to one wall.
      n.bounces -= 1;
      n.bumps += 1;
      if (n.bounces < 0) {
        blasts.push({ id: nextId++, x: n.x, y: n.y, age: 0, ttl: 0.24, big: false });
        continue;
      }
    }
    shells.push(n);
  }

  // ── hits ────────────────────────────────────────────────────────
  const live: Shell[] = [];
  for (const s of shells) {
    let hit: Tank | null = null;
    for (const n of tanks) {
      if (!n.alive || n.invuln > 0) continue;
      // Your own shell is harmless until it has come back off something, and
      // then only once it has been in the air long enough to have gone somewhere.
      if (n.seat === s.owner && (s.bumps === 0 || s.age < OWN_GRACE)) continue;
      if (Math.hypot(n.x - s.x, n.y - s.y) > TANK_R + SHELL_R) continue;
      hit = n;
      break;
    }
    if (!hit) {
      live.push(s);
      continue;
    }

    hit.hp -= 1;
    const shooter = tanks[s.owner];
    if (shooter && shooter.seat !== hit.seat) shooter.hits += 1;
    blasts.push({ id: nextId++, x: s.x, y: s.y, age: 0, ttl: 0.3, big: false });

    if (hit.hp <= 0) {
      hit.alive = false;
      hit.deaths += 1;
      hit.lives -= 1;
      hit.respawn = RESPAWN_DELAY;
      hit.speed = 0;
      hit.out = hit.lives <= 0;
      if (shooter && shooter.seat !== hit.seat) shooter.kills += 1;
      else hit.kills -= 1; // a tank that wrecks itself pays for it
      blasts.push({ id: nextId++, x: hit.x, y: hit.y, age: 0, ttl: 0.75, big: true });
      feed.push({ id: nextId++, killer: shooter ? shooter.seat : hit.seat, victim: hit.seat, at: t });
    }
  }

  // ── puffs age out ───────────────────────────────────────────────
  for (const b of w.blasts) {
    const age = b.age + d;
    if (age < b.ttl) blasts.push({ ...b, age });
  }

  // ── is it finished? ─────────────────────────────────────────────
  const left = tanks.filter((n) => !n.out);
  const timeUp = t >= w.limit;
  const lastOne = w.seats > 1 && left.length <= 1;
  const over = timeUp || lastOne;

  const out: TankWorld = {
    ...w,
    tanks,
    shells: live,
    // Newest first, so a busy tick drops the puffs that were already fading.
    blasts: blasts.slice(0, BLAST_KEEP),
    feed: feed.slice(-FEED_KEEP),
    t: over && timeUp ? w.limit : t,
    over,
    winner: null,
    nextId,
  };
  if (over) out.winner = lastOne && left.length === 1 ? left[0].seat : standings(out)[0];
  return out;
}

/** Call it there and hand the arena to whoever is top of the board. */
export function concede(w: TankWorld): TankWorld {
  if (w.over) return w;
  const out: TankWorld = { ...w, over: true, winner: null };
  out.winner = standings(out)[0];
  return out;
}

// ── reading the arena ─────────────────────────────────────────────

/**
 * Where to point the gun to hit a moving tank with a shell that takes time to
 * arrive. Two refinements is plenty at these speeds.
 */
export function leadPoint(from: Vec, target: Tank, speed = SHELL_SPEED): Vec {
  const vx = Math.cos(target.hull) * target.speed;
  const vy = Math.sin(target.hull) * target.speed;
  let flight = Math.hypot(target.x - from.x, target.y - from.y) / speed;
  for (let i = 0; i < 2; i++) {
    const px = target.x + vx * flight;
    const py = target.y + vy * flight;
    flight = Math.hypot(px - from.x, py - from.y) / speed;
  }
  return { x: target.x + vx * flight, y: target.y + vy * flight };
}

/** Enemies this seat could shoot at right now. */
export function visibleFoes(w: TankWorld, seat: number): Tank[] {
  const me = w.tanks[seat];
  if (!me) return [];
  return w.tanks.filter(
    (t) => t.seat !== seat && t.alive && t.invuln <= 0 && clearShot(w.walls, me.x, me.y, t.x, t.y),
  );
}

/** The closest enemy this seat has a clear shot at, or null. */
export function bestTarget(w: TankWorld, seat: number): Tank | null {
  const me = w.tanks[seat];
  if (!me || !me.alive) return null;
  const foes = visibleFoes(w, seat);
  if (!foes.length) return null;
  let best = foes[0];
  let near = Infinity;
  for (const f of foes) {
    const dd = Math.hypot(f.x - me.x, f.y - me.y);
    if (dd < near) {
      near = dd;
      best = f;
    }
  }
  return best;
}

/**
 * The bearing a seat's gun should hold: the lead on the closest enemy it can
 * actually see, or null when there is nothing to shoot. The screen hands this
 * straight to `Input.aim`, so a thumb on the stick is not also a thumb on the
 * gun — one stick drives, the gun keeps the lock, and the trigger stays yours.
 */
export function aimAssist(w: TankWorld, seat: number): number | null {
  const me = w.tanks[seat];
  const target = bestTarget(w, seat);
  if (!me || !target) return null;
  const p = leadPoint(me, target);
  return Math.atan2(p.y - me.y, p.x - me.x);
}

/**
 * Is the gun actually on a target? The tolerance is the angle the target fills
 * at this range, so a lock means the shell arrives rather than sails past. The
 * screen lights the trigger with this.
 */
export function lockedOn(w: TankWorld, seat: number): boolean {
  const me = w.tanks[seat];
  const target = bestTarget(w, seat);
  if (!me || !target) return false;
  const dist = Math.hypot(target.x - me.x, target.y - me.y);
  if (dist > ENGAGE) return false;
  const p = leadPoint(me, target);
  return Math.abs(angDiff(me.turret, Math.atan2(p.y - me.y, p.x - me.x))) < Math.atan2(TANK_R, Math.max(0.06, dist));
}

// ── the bot ───────────────────────────────────────────────────────

/** How far a bot will shoot. Beyond this a shell arrives too late to matter. */
export const ENGAGE = 0.78;
/** The widest an unskilled bot's aim wanders, in radians. */
export const AIM_SPREAD = 0.34;
/** A floor on the wander, so even a perfect bot is not a laser. */
export const AIM_FLOOR = 0.05;
function bearing(from: Vec, to: Vec) {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/** The eight ways out of a cell, diagonals last. */
const NEIGH: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/**
 * The heading that makes real progress toward `to`.
 *
 * The straight line, when the straight line is open. Otherwise the grid is
 * flooded from the destination and the bot steps to whichever neighbouring cell
 * is closest to it — a diagonal only when both cells beside it are open too, so
 * a tank never tries to squeeze through a corner it does not fit.
 */
export function navigate(w: TankWorld, me: Vec, to: Vec): number {
  const want = bearing(me, to);
  const reach = Math.min(0.45, Math.hypot(to.x - me.x, to.y - me.y));
  if (clearance(w.walls, me.x, me.y, want, reach) >= reach - 1e-6) return want;

  const field = flowField(w.grid, to.x, to.y);
  const here = cellOf(me.x, me.y);
  const i = here % GW;
  const j = Math.floor(here / GW);
  let best = -1;
  let bestD = field[here] >= 0 ? field[here] : Infinity;
  for (const [di, dj] of NEIGH) {
    const ni = i + di;
    const nj = j + dj;
    if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue;
    const c = nj * GW + ni;
    if (!w.grid[c] || field[c] < 0) continue;
    if (di !== 0 && dj !== 0 && !(w.grid[j * GW + ni] && w.grid[nj * GW + i])) continue;
    if (field[c] < bestD) {
      bestD = field[c];
      best = c;
    }
  }
  if (best < 0) return want;
  const p = cellCentre(best);
  return Math.atan2(p.y - me.y, p.x - me.x);
}

/** The shell most likely to be about to hit this tank, or null. */
export function incoming(w: TankWorld, seat: number): Shell | null {
  const me = w.tanks[seat];
  if (!me) return null;
  let worst: Shell | null = null;
  let soonest = Infinity;
  for (const s of w.shells) {
    if (s.owner === seat && (s.bumps === 0 || s.age < OWN_GRACE)) continue;
    const rx = me.x - s.x;
    const ry = me.y - s.y;
    const vv = s.vx * s.vx + s.vy * s.vy;
    if (vv <= 0) continue;
    const time = (rx * s.vx + ry * s.vy) / vv;
    if (time <= 0 || time > 0.7) continue;
    const miss = Math.hypot(rx - s.vx * time, ry - s.vy * time);
    if (miss > TANK_R * 2.4) continue;
    if (time < soonest) {
      soonest = time;
      worst = s;
    }
  }
  return worst;
}

/**
 * What a bot does this tick.
 *
 * It picks the closest enemy it can see — or the closest enemy at all, if it
 * can see none — and then does three things at once. The gun leads that tank,
 * off by an error that shrinks with `skill`. The hull holds a working range and
 * weaves across it on a phase of its own, so it is never a stationary target,
 * and drops the weave to charge when it is careless. And with `depth` to spend
 * it also watches for a shell already on its way and breaks perpendicular to
 * it.
 *
 * It fires when the gun is lined up, it has line of sight and the range is
 * worth it — the tolerance widening as skill falls, so a careless bot lets go
 * of shots a sharp one holds. `blunder` is a shot thrown away regardless: the
 * gun goes off wherever it happens to be pointing.
 */
export function botInput(w: TankWorld, seat: number, bot: BotProfile, rng: Rng): Input {
  const me = w.tanks[seat];
  if (!me || !me.alive || w.over) return IDLE;

  const foes = w.tanks.filter((t) => t.seat !== seat && t.alive);
  if (!foes.length) return IDLE;

  const seen = visibleFoes(w, seat);
  const pool = seen.length ? seen : foes;
  let target = pool[0];
  let near = Infinity;
  for (const f of pool) {
    const dd = Math.hypot(f.x - me.x, f.y - me.y);
    if (dd < near) {
      near = dd;
      target = f;
    }
  }
  const los = seen.includes(target);
  const dist = Math.hypot(target.x - me.x, target.y - me.y);

  // ── the gun ───────────────────────────────────────────────────
  // Reading a target's course and firing where it will be is the first thing a
  // shallow bot cannot do: it shoots at where the tank is and keeps missing.
  const mark = los && bot.depth >= 2 ? leadPoint(me, target) : target;
  const trueAim = bearing(me, mark);
  const wander = (rng() - 0.5) * (AIM_FLOOR + AIM_SPREAD * (1 - bot.skill));
  const aim = norm(trueAim + wander);

  // ── the hull ──────────────────────────────────────────────────
  let drive: number;
  if (los) {
    // Everybody wants a working range; a sharp bot also refuses to stand still
    // in it, weaving across the arc while a careless one lumbers straight in.
    const hold = 0.26 + 0.06 * bot.skill;
    const radial = dist > hold + 0.06 ? 1 : dist < hold - 0.06 ? -1 : 0;
    const swing = Math.sin(w.t * 1.15 + me.phase) * (0.25 + 0.85 * bot.skill);
    const toward = bearing(me, target);
    const rx = Math.cos(toward) * radial;
    const ry = Math.sin(toward) * radial;
    const sx = -Math.sin(toward) * swing;
    const sy = Math.cos(toward) * swing;
    drive = Math.atan2(ry + sy, rx + sx);
    // Do not grind along a block just because the circle would take it there.
    if (clearance(w.walls, me.x, me.y, drive, TANK_R * 3) < TANK_R * 2.5) {
      drive = navigate(w, me, { x: me.x + Math.cos(drive) * 0.25, y: me.y + Math.sin(drive) * 0.25 });
    }
  } else {
    drive = navigate(w, me, target);
  }

  if (bot.depth >= 2) {
    const shell = incoming(w, seat);
    if (shell) {
      const side = Math.sin(w.t * 2.1 + me.phase) >= 0 ? 1 : -1;
      const dodge = Math.atan2(shell.vx * side, -shell.vy * side);
      const open = clearance(w.walls, me.x, me.y, dodge);
      drive = open > TANK_R * 3 ? dodge : norm(dodge + Math.PI);
    }
  }

  const throttle = 0.7 + 0.3 * bot.skill;
  const ready = canFire(w, seat);
  // The angle the target actually fills at this range: inside it the shot is on,
  // outside it the shell goes past. A careless bot lets go well outside it.
  const subtend = Math.atan2(TANK_R, Math.max(0.06, dist));
  const tol = subtend * (1 + 1.8 * (1 - bot.skill));
  const lined = Math.abs(angDiff(me.turret, trueAim)) < tol;
  const wasted = ready && rng() < bot.blunder;
  const fire = ready && ((los && lined && dist < ENGAGE) || wasted);

  return {
    mx: Math.cos(drive) * Math.min(1, throttle),
    my: Math.sin(drive) * Math.min(1, throttle),
    aim,
    fire,
  };
}

// ── the scoreboard ────────────────────────────────────────────────

/** Kills, then lives kept, then the match itself. */
export function xpFor(w: TankWorld, seat: number): number {
  const t = w.tanks[seat];
  if (!t) return 0;
  return (
    50 + 90 * Math.max(0, t.kills) + 30 * Math.max(0, t.lives) + 20 * (w.seats - placeOf(w, seat)) + (w.winner === seat ? 220 : 0)
  );
}

/** "3 kills · 1 wreck" — the scoreboard's line for a seat. */
export function lineFor(w: TankWorld, seat: number): string {
  const t = w.tanks[seat];
  if (!t) return '—';
  const k = Math.max(0, t.kills);
  const d = t.deaths;
  const tail = t.out ? 'knocked out' : `${t.lives} ${t.lives === 1 ? 'life' : 'lives'} left`;
  return `${k} kill${k === 1 ? '' : 's'} · ${d} wreck${d === 1 ? '' : 's'} · ${tail}`;
}

/** Shots that found a hull, as a percentage. */
export const accuracy = (w: TankWorld, seat: number) => {
  const t = w.tanks[seat];
  if (!t || !t.shots) return 0;
  return Math.round((t.hits / t.shots) * 100);
};
