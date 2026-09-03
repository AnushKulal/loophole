import { describe, expect, it } from 'vitest';
import { BOT, makeRng, type BotProfile, type Rng } from './contract';
import {
  AIM_SPREAD,
  ARENA_H,
  ARENA_W,
  BOUNCES,
  CELL,
  DT,
  ENGAGE,
  GH,
  GW,
  HP,
  IDLE,
  INVULN,
  LAYOUTS,
  MAX_DT,
  MAX_SEATS,
  MAX_SHELLS,
  OWN_GRACE,
  RELOAD,
  RESPAWN_DELAY,
  SHELL_SPEED,
  SPAWN_MARKS,
  TANK_R,
  aimAssist,
  angDiff,
  arenaAt,
  bestSpawn,
  botInput,
  buildArena,
  buildGrid,
  canFire,
  cellOf,
  clearShot,
  clearance,
  concede,
  fireProblem,
  flowField,
  insideWall,
  inputProblem,
  isLegalInput,
  leadPoint,
  lineFor,
  livesFor,
  lockedOn,
  mostWrecks,
  navigate,
  norm,
  overlaps,
  placeOf,
  pushOut,
  rotateToward,
  secondsFor,
  seatsFor,
  segHitsRect,
  standing,
  standings,
  startMatch,
  step,
  timeLeft,
  visibleFoes,
  xpFor,
  type Input,
  type Shell,
  type Tank,
  type TankWorld,
} from './tankWar';

const DIFFS = ['Easy', 'Normal', 'Sharp'] as const;

/** Everything pointing nowhere, driving nowhere. */
const still = (seats: number): Record<number, Input> =>
  Object.fromEntries(Array.from({ length: seats }, (_, i) => [i, IDLE]));

/** One order for one seat, everybody else parked. */
function only(seats: number, seat: number, i: Input): Record<number, Input> {
  const all = still(seats);
  all[seat] = i;
  return all;
}

/** Run the world forward for `seconds` at the engine's own tick. */
function run(w: TankWorld, seconds: number, inputs: Record<number, Input> = {}): TankWorld {
  let out = w;
  const ticks = Math.round(seconds / DT);
  for (let k = 0; k < ticks && !out.over; k++) out = step(out, DT, inputs);
  return out;
}

/** Drop a tank exactly where a test wants it, facing where it wants. */
function place(w: TankWorld, seat: number, x: number, y: number, angle = 0, over: Partial<Tank> = {}): TankWorld {
  const tanks = w.tanks.slice();
  tanks[seat] = { ...tanks[seat], x, y, hull: angle, turret: angle, invuln: 0, ...over };
  return { ...w, tanks };
}

/** An empty floor, so a test can reason about one rule at a time. */
function bare(seats = 2, lives = 3, minutes = 3): TankWorld {
  const w = startMatch(seats, lives, minutes, makeRng(1));
  return { ...w, walls: [], grid: buildGrid([]) };
}

/**
 * Every seat played by a bot, sampling its orders every `every` ticks the way
 * the screen samples them once a frame rather than once a physics step.
 */
function botMatch(profiles: BotProfile[], rng: Rng, minutes = 3, every = 4): TankWorld {
  let w = startMatch(profiles.length, 3, minutes, rng);
  let inputs: Record<number, Input> = {};
  for (let tick = 0; !w.over && tick < 60 * 60 * 12; tick++) {
    if (tick % every === 0) {
      inputs = {};
      for (let i = 0; i < w.seats; i++) inputs[i] = botInput(w, i, profiles[i], rng);
    }
    w = step(w, DT, inputs);
  }
  return w;
}

// ── the arena ─────────────────────────────────────────────────────

describe('the arena', () => {
  it('mirrors its blocks, so neither end of the floor is the better end', () => {
    for (let i = 0; i < LAYOUTS; i++) {
      const walls = arenaAt(i);
      expect(walls.length % 2).toBe(0);
      const half = walls.slice(0, walls.length / 2);
      const rest = walls.slice(walls.length / 2);
      half.forEach((r, k) => {
        expect(rest[k].w).toBeCloseTo(r.w, 9);
        expect(rest[k].h).toBeCloseTo(r.h, 9);
        expect(rest[k].x).toBeCloseTo(ARENA_W - r.x - r.w, 9);
        expect(rest[k].y).toBeCloseTo(ARENA_H - r.y - r.h, 9);
      });
      walls.forEach((r) => {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(ARENA_W);
        expect(r.y + r.h).toBeLessThanOrEqual(ARENA_H);
      });
    }
  });

  it('leaves every starting mark clear of the blocks', () => {
    expect(SPAWN_MARKS).toHaveLength(MAX_SEATS);
    for (let seed = 0; seed < 24; seed++) {
      const w = startMatch(MAX_SEATS, 3, 3, makeRng(seed));
      expect(w.spawns).toHaveLength(MAX_SEATS);
      w.spawns.forEach((s) => {
        expect(insideWall(w.walls, s.x, s.y, TANK_R)).toBe(false);
        expect(s.x).toBeGreaterThanOrEqual(TANK_R);
        expect(s.x).toBeLessThanOrEqual(ARENA_W - TANK_R);
        expect(s.y).toBeGreaterThanOrEqual(TANK_R);
        expect(s.y).toBeLessThanOrEqual(ARENA_H - TANK_R);
      });
      w.tanks.forEach((t) => expect(insideWall(w.walls, t.x, t.y, TANK_R)).toBe(false));
    }
  });

  it('picks a layout from the seed and only from the seed', () => {
    const key = (seed: number) => JSON.stringify(buildArena(makeRng(seed)));
    expect(key(4)).toBe(key(4));
    expect(new Set([0, 1, 2, 3, 4, 5, 6, 7, 8].map(key)).size).toBe(LAYOUTS);
  });

  it('honours the lobby: seats, respawns and minutes, all inside sane bounds', () => {
    expect(seatsFor(1)).toBe(2);
    expect(seatsFor(5)).toBe(5);
    expect(seatsFor(99)).toBe(MAX_SEATS);
    expect(livesFor(0)).toBe(3);
    expect(livesFor(5)).toBe(5);
    expect(livesFor(50)).toBe(9);
    // A lobby minute is a round of the arena, not sixty seconds of one: three
    // lives a seat are spent in about twenty seconds, so minutes on the clock
    // would be a clock no match ever reached.
    expect(secondsFor(2)).toBe(20);
    expect(secondsFor(3)).toBe(30);
    expect(secondsFor(10)).toBe(100);
    expect(secondsFor(0.2)).toBe(20);
    expect(secondsFor(99)).toBe(100);
    // The lobby's shortest round is a round a match reaches; its longest is not.
    expect(secondsFor(2)).toBeLessThan(30);
    expect(secondsFor(2)).toBeLessThan(secondsFor(10));
    const w = startMatch(6, 4, 2, makeRng(2));
    expect(w.seats).toBe(6);
    expect(w.tanks).toHaveLength(6);
    expect(w.limit).toBe(20);
    expect(w.livesPer).toBe(4);
    w.tanks.forEach((t) => expect(t.lives).toBe(4));
  });

  it('measures line of sight and clearance off the same blocks', () => {
    const walls = [{ x: 0.4, y: 0.4, w: 0.2, h: 0.2 }];
    expect(segHitsRect(0.1, 0.5, 0.9, 0.5, walls[0])).toBe(true);
    expect(segHitsRect(0.1, 0.1, 0.9, 0.1, walls[0])).toBe(false);
    // A segment that stops short of the block never reaches it.
    expect(segHitsRect(0.1, 0.5, 0.3, 0.5, walls[0])).toBe(false);
    expect(clearShot(walls, 0.1, 0.5, 0.9, 0.5)).toBe(false);
    expect(clearShot(walls, 0.1, 0.1, 0.9, 0.1)).toBe(true);
    expect(clearance(walls, 0.1, 0.5, 0, 0.45)).toBeLessThan(0.32);
    expect(clearance([], 0.5, 0.5, 0, 0.4)).toBeCloseTo(0.4, 6);
    expect(overlaps(walls[0], 0.5, 0.5, 0.01)).toBe(true);
    expect(overlaps(walls[0], 0.1, 0.1, 0.01)).toBe(false);
  });

  it('folds angles and turns no further than it is allowed to', () => {
    expect(norm(Math.PI * 3)).toBeCloseTo(Math.PI, 9);
    expect(norm(-Math.PI * 3)).toBeCloseTo(Math.PI, 9);
    expect(angDiff(0.1, -0.1)).toBeCloseTo(0.2, 9);
    expect(rotateToward(0, 1, 0.25)).toBeCloseTo(0.25, 9);
    expect(rotateToward(0, 0.1, 0.25)).toBeCloseTo(0.1, 9);
    // The short way round, not the long one: 3.0 toward -3.0 goes up past π.
    expect(Math.abs(angDiff(rotateToward(3.0, -3.0, 0.2), 3.2))).toBeLessThan(1e-9);
    expect(rotateToward(3.0, -3.0, 0.2)).toBeLessThan(0);
  });
});

// ── the navigation grid ───────────────────────────────────────────

describe('the navigation grid', () => {
  it('marks the cells a tank fits in and floods the rest from a goal', () => {
    const walls = arenaAt(0);
    const grid = buildGrid(walls);
    expect(grid).toHaveLength(GW * GH);
    for (let c = 0; c < grid.length; c++) {
      const x = ((c % GW) + 0.5) * CELL;
      const y = (Math.floor(c / GW) + 0.5) * CELL;
      expect(!!grid[c]).toBe(!insideWall(walls, x, y, TANK_R * 0.9));
    }
    const field = flowField(grid, 0.5, 0.65);
    expect(field[cellOf(0.5, 0.65)]).toBe(0);
    // Every open cell can reach the middle — the arena is one connected room.
    let open = 0;
    let reached = 0;
    for (let c = 0; c < grid.length; c++)
      if (grid[c]) {
        open++;
        if (field[c] >= 0) reached++;
      }
    expect(open).toBeGreaterThan(400);
    expect(reached).toBe(open);
  });

  it('steers straight when the line is open and round the block when it is not', () => {
    const open = { ...startMatch(2, 3, 3, makeRng(1)), walls: [], grid: buildGrid([]) };
    expect(navigate(open, { x: 0.2, y: 0.2 }, { x: 0.8, y: 0.2 })).toBeCloseTo(0, 6);

    const walls = [{ x: 0.3, y: 0.0, w: 0.06, h: 0.9 }];
    const blocked = { ...open, walls, grid: buildGrid(walls) };
    const a = navigate(blocked, { x: 0.15, y: 0.4 }, { x: 0.7, y: 0.4 });
    // Straight east is a wall, so it must commit south toward the way round.
    expect(Math.abs(angDiff(a, 0))).toBeGreaterThan(0.4);
    expect(Math.sin(a)).toBeGreaterThan(0);
  });

  it('walks a bot round a block instead of grinding against it', () => {
    // A wall down most of the arena with one gap at the bottom. The quarry is
    // untouchable, so the bot has nothing to do but find its way to it.
    const walls = [{ x: 0.3, y: 0.0, w: 0.06, h: 0.95 }];
    let w = { ...startMatch(2, 3, 3, makeRng(1)), walls, grid: buildGrid(walls) };
    w = place(w, 0, 0.12, 0.3);
    w = place(w, 1, 0.75, 0.3, 0, { invuln: 999 });
    const start = Math.hypot(w.tanks[1].x - w.tanks[0].x, w.tanks[1].y - w.tanks[0].y);
    let closest = start;
    const rng = makeRng(9);
    for (let k = 0; k < 60 * 14 && !w.over; k++) {
      w = step(w, DT, { 0: botInput(w, 0, BOT.Sharp, rng), 1: IDLE });
      closest = Math.min(closest, Math.hypot(w.tanks[1].x - w.tanks[0].x, w.tanks[1].y - w.tanks[0].y));
    }
    expect(w.tanks[0].x).toBeGreaterThan(0.36);
    expect(closest).toBeLessThan(start * 0.4);
  });
});

// ── legality ──────────────────────────────────────────────────────

describe('orders', () => {
  it('accepts a stick inside the circle from a live tank', () => {
    const w = bare();
    expect(isLegalInput(w, 0, { mx: 0, my: 0, aim: null, fire: false })).toBe(true);
    expect(isLegalInput(w, 0, { mx: 0.6, my: -0.8, aim: 1.2, fire: true })).toBe(true);
    expect(inputProblem(w, 0, { mx: -1, my: 0, aim: null, fire: false })).toBeNull();
  });

  it('rejects a stick out of the circle, a bearing that is not a number and a seat with no tank', () => {
    const w = bare();
    expect(inputProblem(w, 0, { mx: 1, my: 1, aim: null, fire: false })).toBe('bad-vector');
    expect(inputProblem(w, 0, { mx: NaN, my: 0, aim: null, fire: false })).toBe('bad-vector');
    expect(inputProblem(w, 0, { mx: 0, my: Infinity, aim: null, fire: false })).toBe('bad-vector');
    expect(inputProblem(w, 0, { mx: 0, my: 0, aim: NaN, fire: false })).toBe('bad-aim');
    expect(inputProblem(w, 5, IDLE)).toBe('no-tank');
  });

  it('rejects orders to a wreck and orders after the final whistle', () => {
    const w = bare();
    const wrecked = place(w, 0, 0.2, 0.2, 0, { alive: false, respawn: RESPAWN_DELAY });
    expect(inputProblem(wrecked, 0, IDLE)).toBe('wrecked');
    expect(inputProblem(concede(w), 0, IDLE)).toBe('over');
  });

  it('lets the gun go off when it is loaded and not otherwise', () => {
    const w = bare();
    expect(fireProblem(w, 0)).toBeNull();
    expect(canFire(w, 0)).toBe(true);
    const hot = place(w, 0, 0.2, 0.2, 0, { reload: RELOAD });
    expect(fireProblem(hot, 0)).toBe('reloading');
    const full: TankWorld = {
      ...w,
      shells: Array.from({ length: MAX_SHELLS }, (_, id) => ({
        id,
        owner: 0,
        x: 0.5,
        y: 0.5,
        vx: 0,
        vy: 0,
        bounces: BOUNCES,
        bumps: 0,
        age: 0,
      })),
    };
    expect(fireProblem(full, 0)).toBe('no-shells');
    expect(fireProblem(place(w, 0, 0.2, 0.2, 0, { alive: false }), 0)).toBe('wrecked');
    expect(fireProblem(concede(w), 0)).toBe('over');
    expect(fireProblem(w, 9)).toBe('no-tank');
  });

  it('ignores an illegal order rather than throwing, and never moves on it', () => {
    let w = bare();
    w = place(w, 0, 0.5, 0.5, 0);
    const before = { ...w.tanks[0] };
    const after = step(w, DT, only(w.seats, 0, { mx: 9, my: 9, aim: null, fire: true }));
    expect(after.tanks[0].x).toBeCloseTo(before.x, 9);
    expect(after.tanks[0].y).toBeCloseTo(before.y, 9);
    expect(after.shells).toHaveLength(0);
    expect(after.tanks[0].shots).toBe(0);
  });

  it('refuses to advance a finished match, and clamps a monstrous frame', () => {
    const done = concede(bare());
    expect(step(done, DT, {})).toBe(done);
    const w = place(bare(), 0, 0.5, 0.5, 0);
    const long = step(w, 10, only(w.seats, 0, { mx: 1, my: 0, aim: null, fire: false }));
    // A ten-second frame may only ever be worth MAX_DT of movement.
    expect(long.t).toBeCloseTo(MAX_DT, 9);
    expect(long.tanks[0].x - 0.5).toBeLessThan(0.05);
    expect(step(w, 0, {})).toBe(w);
  });
});

// ── driving ───────────────────────────────────────────────────────

describe('driving', () => {
  it('turns the hull toward the stick and then drives along it', () => {
    let w = place(bare(), 0, 0.5, 0.65, 0);
    const east = only(w.seats, 0, { mx: 1, my: 0, aim: null, fire: false });
    w = run(w, 1, east);
    expect(w.tanks[0].x).toBeGreaterThan(0.62);
    expect(Math.abs(w.tanks[0].y - 0.65)).toBeLessThan(1e-6);
    expect(w.tanks[0].hull).toBeCloseTo(0, 6);
    expect(w.tanks[0].speed).toBeGreaterThan(0);
    // Centre the stick and it stops dead — no drift.
    const parked = run(w, 0.5, still(w.seats));
    expect(parked.tanks[0].x).toBeCloseTo(w.tanks[0].x, 9);
    expect(parked.tanks[0].speed).toBe(0);
  });

  it('ignores a stick inside the dead zone', () => {
    let w = place(bare(), 0, 0.5, 0.65, 0);
    w = run(w, 1, only(w.seats, 0, { mx: 0.05, my: 0, aim: null, fire: false }));
    expect(w.tanks[0].x).toBeCloseTo(0.5, 9);
  });

  it('never drives through a block or off the floor', () => {
    const walls = [{ x: 0.55, y: 0.3, w: 0.08, h: 0.6 }];
    let w = { ...bare(), walls, grid: buildGrid(walls) };
    w = place(w, 0, 0.3, 0.6, 0);
    w = run(w, 4, only(w.seats, 0, { mx: 1, my: 0, aim: null, fire: false }));
    expect(w.tanks[0].x).toBeLessThanOrEqual(0.55 - TANK_R + 1e-6);
    expect(insideWall(walls, w.tanks[0].x, w.tanks[0].y, TANK_R - 1e-9)).toBe(false);

    let edge = place(bare(), 0, 0.5, 0.2, -Math.PI / 2);
    edge = run(edge, 4, only(edge.seats, 0, { mx: 0, my: -1, aim: null, fire: false }));
    expect(edge.tanks[0].y).toBeGreaterThanOrEqual(TANK_R - 1e-9);
  });

  it('never drives through another tank', () => {
    let w = bare(2, 3, 5);
    w = place(w, 0, 0.3, 0.65, 0);
    w = place(w, 1, 0.6, 0.65, 0);
    const east = only(w.seats, 0, { mx: 1, my: 0, aim: null, fire: false });
    let closest = 99;
    for (let k = 0; k < Math.round(2 / DT) && !w.over; k++) {
      w = step(w, DT, east);
      closest = Math.min(closest, Math.hypot(w.tanks[0].x - w.tanks[1].x, w.tanks[0].y - w.tanks[1].y));
    }
    // Two hulls never share a patch of floor, whatever the stick says.
    expect(closest).toBeGreaterThan(TANK_R * 2 - 1e-6);
    // The one in front is still in front — shoved along the floor, not driven
    // through — so it is between seat 0 and the wall it was heading for.
    expect(w.tanks[0].x).toBeLessThan(w.tanks[1].x);
    expect(w.tanks[1].x).toBeGreaterThan(0.6);
    expect(w.tanks[0].x).toBeLessThan(ARENA_W - TANK_R - 0.05);
  });

  it('parts two hulls dropped on the same spot rather than drawing them as one', () => {
    let w = bare(2);
    w = place(w, 0, 0.5, 0.65, 0);
    w = place(w, 1, 0.5, 0.65, 0);
    w = step(w, DT, still(w.seats));
    const gap = Math.hypot(w.tanks[0].x - w.tanks[1].x, w.tanks[0].y - w.tanks[1].y);
    expect(gap).toBeGreaterThan(TANK_R * 2 - 1e-6);
    w.tanks.forEach((t) => expect(insideWall(w.walls, t.x, t.y, TANK_R - 1e-9)).toBe(false));
  });

  it('keeps hulls apart with a block behind them, over a whole bot match', () => {
    for (let seed = 0; seed < 4; seed++) {
      let w = startMatch(4, 3, 3, makeRng(seed * 3 + 2));
      const rng = makeRng(seed + 77);
      let inputs: Record<number, Input> = {};
      let worst = 99;
      for (let tick = 0; !w.over && tick < 60 * 60; tick++) {
        if (tick % 4 === 0) {
          inputs = {};
          for (let i = 0; i < w.seats; i++) inputs[i] = botInput(w, i, BOT.Sharp, rng);
        }
        w = step(w, DT, inputs);
        for (let i = 0; i < w.seats; i++) {
          for (let j = i + 1; j < w.seats; j++) {
            const a = w.tanks[i];
            const b = w.tanks[j];
            if (!a.alive || !b.alive) continue;
            worst = Math.min(worst, Math.hypot(a.x - b.x, a.y - b.y));
          }
        }
      }
      // A pair pinned against a block keeps whatever the block insists on, but
      // nothing like the free stacking that let a shell only ever reach the
      // lower seat of the two.
      expect(worst).toBeGreaterThan(TANK_R * 1.8);
    }
  });

  it('shoves a box out of whatever it is buried in, along the shallow axis', () => {
    const walls = [{ x: 0.4, y: 0.4, w: 0.2, h: 0.2 }];
    const near = pushOut(walls, 0.42, 0.5, TANK_R);
    expect(near.x).toBeCloseTo(0.4 - TANK_R, 6);
    const under = pushOut(walls, 0.5, 0.62, TANK_R);
    expect(under.y).toBeCloseTo(0.6 + TANK_R, 6);
    expect(insideWall(walls, near.x, near.y, TANK_R - 1e-9)).toBe(false);
    expect(pushOut([], -5, -5, TANK_R)).toEqual({ x: TANK_R, y: TANK_R });
  });

  it('swings the gun on its own, at its own rate, wherever the hull is pointing', () => {
    let w = place(bare(), 0, 0.5, 0.65, 0);
    w = run(w, 1, only(w.seats, 0, { mx: 0, my: 0, aim: Math.PI / 2, fire: false }));
    expect(w.tanks[0].turret).toBeCloseTo(Math.PI / 2, 5);
    expect(w.tanks[0].hull).toBeCloseTo(0, 9);
    // A null bearing with an idle stick leaves the gun exactly where it was.
    const held = run(w, 0.5, still(w.seats));
    expect(held.tanks[0].turret).toBeCloseTo(Math.PI / 2, 5);
  });
});

// ── shells ────────────────────────────────────────────────────────

describe('shells', () => {
  const shot = (): Record<number, Input> => ({ 0: { mx: 0, my: 0, aim: null, fire: true } });

  it('leaves the barrel once, then the gun has to reload', () => {
    let w = place(bare(), 0, 0.5, 0.65, 0);
    w = step(w, DT, shot());
    expect(w.shells).toHaveLength(1);
    expect(w.tanks[0].shots).toBe(1);
    expect(w.tanks[0].reload).toBeCloseTo(RELOAD, 6);
    expect(w.shells[0].vx).toBeCloseTo(SHELL_SPEED, 6);
    w = step(w, DT, shot());
    expect(w.shells).toHaveLength(1);
    expect(w.tanks[0].shots).toBe(1);
  });

  it('bounces off a wall, spends a bounce, and dies when the budget is gone', () => {
    let w = place(bare(2), 0, 0.5, 0.65, 0);
    w = place(w, 1, 0.1, 0.1);
    w = step(w, DT, shot());
    const east = w.shells[0].vx;
    expect(east).toBeGreaterThan(0);
    // It has half the floor to cross, so give it time to come off the far wall.
    w = run(w, 0.8, {});
    expect(w.shells).toHaveLength(1);
    expect(w.shells[0].vx).toBeLessThan(0);
    expect(w.shells[0].bumps).toBe(BOUNCES);
    expect(w.shells[0].bounces).toBe(0);
    // Back across the floor, into the near wall, and that is the end of it.
    w = run(w, 1.6, {});
    expect(w.shells).toHaveLength(0);
  });

  it('expires on its own if it never meets anything', () => {
    let w = place(bare(2), 0, 0.5, 0.65, 0);
    w = place(w, 1, 0.06, 0.06);
    w = step(w, DT, shot());
    w = run(w, 3.6, {});
    expect(w.shells).toHaveLength(0);
  });

  it('cannot hit its own tank fresh out of the barrel, but can once it comes back', () => {
    // Nose against the east wall: the shell bounces straight back into the hull.
    let w = place(bare(2), 0, ARENA_W - TANK_R - 0.02, 0.65, 0);
    w = place(w, 1, 0.1, 0.1);
    w = step(w, DT, shot());
    const early = run(w, OWN_GRACE * 0.5, {});
    expect(early.tanks[0].hp).toBe(HP);
    // Far enough out that the return trip outlasts the grace period.
    let far = place(bare(2), 0, 0.5, 0.65, 0);
    far = place(far, 1, 0.1, 0.1);
    far = step(far, DT, shot());
    far = run(far, 1.4, {});
    expect(far.tanks[0].hp).toBeLessThan(HP);
    expect(far.tanks[0].hits).toBe(0);
  });
});

// ── damage, lives and the end of it ───────────────────────────────

describe('plates, lives and elimination', () => {
  /** Seat 0 shoots seat 1 across an empty floor until `stop` says enough. */
  function duelUntil(w: TankWorld, seconds: number, stop: (x: TankWorld) => boolean = () => false): TankWorld {
    let out = w;
    const ticks = Math.round(seconds / DT);
    for (let k = 0; k < ticks && !out.over && !stop(out); k++) {
      const me = out.tanks[0];
      const foe = out.tanks[1];
      const aim = Math.atan2(foe.y - me.y, foe.x - me.x);
      out = step(out, DT, { 0: { mx: 0, my: 0, aim, fire: canFire(out, 0) } });
    }
    return out;
  }

  it('takes a plate a hit and wrecks the hull on the third', () => {
    let w = bare(2, 3, 5);
    w = place(w, 0, 0.2, 0.65, 0);
    w = place(w, 1, 0.7, 0.65, Math.PI);
    w = duelUntil(w, 4, (x) => x.tanks[1].hp < HP);
    expect(w.tanks[1].hp).toBe(HP - 1);
    expect(w.tanks[1].alive).toBe(true);
    expect(w.tanks[0].hits).toBe(1);
    w = duelUntil(w, 4, (x) => x.tanks[1].hp < HP - 1);
    expect(w.tanks[1].hp).toBe(HP - 2);
    expect(w.tanks[1].alive).toBe(true);
    w = duelUntil(w, 4, (x) => !x.tanks[1].alive);
    expect(w.tanks[1].hp).toBeLessThanOrEqual(0);
    expect(w.tanks[1].alive).toBe(false);
    expect(w.tanks[1].deaths).toBe(1);
    expect(w.tanks[1].lives).toBe(2);
    expect(w.tanks[0].kills).toBe(1);
    expect(w.tanks[0].hits).toBe(3);
    expect(w.feed[w.feed.length - 1]).toMatchObject({ killer: 0, victim: 1 });
    expect(w.blasts.some((b) => b.big)).toBe(true);
  });

  it('rolls a wreck back on after the delay, protected, and never lets a spawn be a free kill', () => {
    let w = bare(2, 3, 5);
    w = place(w, 0, 0.2, 0.65, 0);
    w = place(w, 1, 0.7, 0.65, Math.PI, { hp: 1 });
    w = duelUntil(w, 4, (x) => !x.tanks[1].alive);
    expect(w.tanks[1].alive).toBe(false);
    expect(w.tanks[1].respawn).toBeCloseTo(RESPAWN_DELAY, 6);
    w = run(w, RESPAWN_DELAY * 0.5, {});
    expect(w.tanks[1].alive).toBe(false);
    w = run(w, RESPAWN_DELAY * 0.5 + DT * 2, {});
    expect(w.tanks[1].alive).toBe(true);
    expect(w.tanks[1].hp).toBe(HP);
    expect(w.tanks[1].invuln).toBeGreaterThan(INVULN * 0.9);
    // Protected means untouchable, and untargetable.
    expect(visibleFoes(w, 0).length).toBe(0);
    const shielded = duelUntil(w, INVULN * 0.6);
    expect(shielded.tanks[1].hp).toBe(HP);
  });

  it('puts a seat out when its last life goes, and ends the match on the last tank rolling', () => {
    let w = bare(2, 1, 5);
    w = place(w, 0, 0.2, 0.65, 0);
    w = place(w, 1, 0.7, 0.65, Math.PI, { hp: 1 });
    w = duelUntil(w, 4);
    expect(w.tanks[1].lives).toBe(0);
    expect(w.tanks[1].out).toBe(true);
    expect(standing(w)).toEqual([0]);
    expect(w.over).toBe(true);
    expect(w.winner).toBe(0);
    // Once it is over, nothing moves again.
    expect(step(w, DT, { 0: { mx: 1, my: 0, aim: null, fire: true } })).toBe(w);
  });

  it('keeps a four-tank match running while three of them still have lives', () => {
    let w = bare(4, 1, 5);
    w = place(w, 0, 0.2, 0.65, 0);
    w = place(w, 1, 0.7, 0.65, Math.PI, { hp: 1 });
    w = place(w, 2, 0.2, 0.2);
    w = place(w, 3, 0.8, 1.1);
    w = duelUntil(w, 4, (x) => x.tanks[1].out);
    expect(w.tanks[1].out).toBe(true);
    expect(w.over).toBe(false);
    expect(standing(w)).toEqual([0, 2, 3]);
  });

  it('charges a tank that wrecks itself on its own bounce rather than paying it', () => {
    let w = place(bare(2, 3, 5), 0, ARENA_W - 0.16, 0.65, 0);
    w = place(w, 1, 0.1, 0.1);
    for (let k = 0; k < Math.round(9 / DT) && w.tanks[0].alive; k++) {
      w = step(w, DT, { 0: { mx: 0, my: 0, aim: 0, fire: canFire(w, 0) } });
    }
    expect(w.tanks[0].alive).toBe(false);
    expect(w.tanks[0].deaths).toBe(1);
    expect(w.tanks[0].kills).toBe(-1);
    expect(w.tanks[1].kills).toBe(0);
  });
});

// ── the clock ─────────────────────────────────────────────────────

describe('the clock', () => {
  it('runs the match down and hands it to the top of the board', () => {
    let w = bare(3, 3, 2);
    expect(timeLeft(w)).toBe(20);
    w = { ...w, tanks: w.tanks.map((t, i) => ({ ...t, kills: i === 1 ? 4 : i })) };
    w = run(w, 21, {});
    expect(w.over).toBe(true);
    expect(w.t).toBe(w.limit);
    expect(timeLeft(w)).toBe(0);
    expect(w.winner).toBe(1);
    expect(standings(w)[0]).toBe(1);
    expect(placeOf(w, 1)).toBe(1);
  });

  it('gives a match on the clock to whoever wrecked the most, lives left or not', () => {
    // The rules sheet promises the clock to whoever has wrecked the most. The
    // board is a different question: it ranks a seat that is still rolling above
    // one that is out, however many hulls that one took with it.
    const w = bare(3, 3, 2);
    const rigged: TankWorld = {
      ...w,
      tanks: [
        { ...w.tanks[0], kills: 9, deaths: 3, lives: 0, out: true, alive: false },
        { ...w.tanks[1], kills: 0 },
        { ...w.tanks[2], kills: 1 },
      ],
    };
    const done = run(rigged, rigged.limit + 1, {});
    expect(done.over).toBe(true);
    expect(done.t).toBe(done.limit);
    expect(mostWrecks(done)).toBe(0);
    expect(done.winner).toBe(0);
    // ...and the board still reads the other way round, as it should.
    expect(standings(done)[0]).not.toBe(0);
  });

  it('lets the clock actually end a match, so the lobby length is a setting and not a decoration', () => {
    const onTheClock = (minutes: number) => {
      let ended = 0;
      for (let seed = 0; seed < 12; seed++) {
        const w = botMatch([BOT.Normal, BOT.Normal, BOT.Normal, BOT.Normal], makeRng(seed * 13 + 7), minutes);
        if (standing(w).length > 1) {
          expect(w.over).toBe(true);
          expect(w.t).toBe(w.limit);
          expect(w.winner).toBe(mostWrecks(w));
          ended++;
        }
      }
      return ended;
    };
    // The shortest round the lobby offers is one the clock decides more often
    // than not; the longest is one the arena decides on its own.
    expect(onTheClock(2)).toBeGreaterThan(5);
    expect(onTheClock(10)).toBe(0);
  });

  it('hands nobody the arena when the last two wreck each other on the same tick', () => {
    // Both on their last life, muzzle to muzzle. The shells land together, so
    // there is no last tank rolling to take it — and the seat that must not take
    // it by default is seat 0, which is always the player.
    let w = bare(2, 1, 5);
    w = place(w, 0, 0.3, 0.65, 0, { hp: 1 });
    w = place(w, 1, 0.7, 0.65, Math.PI, { hp: 1 });
    w = run(w, 2, {
      0: { mx: 0, my: 0, aim: 0, fire: true },
      1: { mx: 0, my: 0, aim: Math.PI, fire: true },
    });
    expect(w.over).toBe(true);
    expect(w.tanks.map((t) => t.out)).toEqual([true, true]);
    expect(w.tanks.map((t) => t.kills)).toEqual([1, 1]);
    expect(standing(w)).toEqual([]);
    expect(w.winner).toBeNull();
  });

  it('ranks a seat that is out below one that is still rolling, whatever the kills', () => {
    const w = bare(3, 3, 3);
    const rigged: TankWorld = {
      ...w,
      tanks: [
        { ...w.tanks[0], kills: 9, lives: 0, out: true, alive: false },
        { ...w.tanks[1], kills: 1, lives: 2 },
        { ...w.tanks[2], kills: 1, lives: 1, deaths: 2 },
      ],
    };
    expect(standings(rigged)).toEqual([1, 2, 0]);
    expect(concede(rigged).winner).toBe(1);
  });

  it('pays kills first, then lives kept, then the match', () => {
    const w = bare(2, 3, 3);
    const rigged: TankWorld = {
      ...w,
      over: true,
      winner: 0,
      tanks: [
        { ...w.tanks[0], kills: 3, lives: 2, deaths: 1 },
        { ...w.tanks[1], kills: 1, lives: 0, deaths: 3, out: true },
      ],
    };
    expect(xpFor(rigged, 0)).toBe(50 + 90 * 3 + 30 * 2 + 20 * 1 + 220);
    expect(xpFor(rigged, 1)).toBe(50 + 90 * 1 + 30 * 0 + 20 * 0);
    expect(xpFor(rigged, 0)).toBeGreaterThan(xpFor(rigged, 1));
    expect(lineFor(rigged, 0)).toBe('3 kills · 1 wreck · 2 lives left');
    expect(lineFor(rigged, 1)).toBe('1 kill · 3 wrecks · knocked out');
  });
});

// ── reading the arena ─────────────────────────────────────────────

describe('reading the arena', () => {
  it('leads a moving tank ahead of itself and a parked one not at all', () => {
    const w = bare(2);
    const parked: Tank = { ...w.tanks[1], x: 0.6, y: 0.65, hull: 0, speed: 0 };
    expect(leadPoint({ x: 0.1, y: 0.65 }, parked)).toEqual({ x: 0.6, y: 0.65 });
    const moving: Tank = { ...parked, hull: Math.PI / 2, speed: 0.3 };
    const p = leadPoint({ x: 0.1, y: 0.65 }, moving);
    expect(p.x).toBeCloseTo(0.6, 9);
    expect(p.y).toBeGreaterThan(0.65);
    // The lead is the flight time of the shell, not a guess — within a percent
    // of it, since the solve is two refinements rather than a closed form.
    const want = (0.3 * Math.hypot(p.x - 0.1, p.y - 0.65)) / SHELL_SPEED;
    expect(Math.abs(p.y - 0.65 - want) / want).toBeLessThan(0.01);
  });

  it('hands the player a lock on the nearest enemy it can actually see', () => {
    const walls = [{ x: 0.4, y: 0.0, w: 0.06, h: 1.3 }];
    let w = { ...bare(3), walls, grid: buildGrid(walls) };
    w = place(w, 0, 0.2, 0.65, 0);
    w = place(w, 1, 0.25, 0.2); // visible, further
    w = place(w, 2, 0.7, 0.65); // closer in a straight line, but behind the block
    expect(visibleFoes(w, 0).map((t) => t.seat)).toEqual([1]);
    const aim = aimAssist(w, 0) as number;
    expect(aim).not.toBeNull();
    expect(Math.abs(angDiff(aim, Math.atan2(0.2 - 0.65, 0.25 - 0.2)))).toBeLessThan(0.01);
    // Nothing in sight, no lock.
    const alone = place(place(w, 1, 0.9, 1.2), 2, 0.95, 1.25);
    expect(aimAssist(alone, 0)).toBeNull();
    expect(lockedOn(alone, 0)).toBe(false);
  });

  it('only calls it a lock once the gun is on the target', () => {
    let w = place(bare(2), 0, 0.3, 0.65, 0);
    w = place(w, 1, 0.6, 0.65, Math.PI);
    expect(lockedOn(w, 0)).toBe(true);
    const askew = place(w, 0, 0.3, 0.65, 0, { turret: Math.PI / 2 });
    expect(lockedOn(askew, 0)).toBe(false);
    // Out of range is not a lock either, however straight the gun is.
    let far = place(bare(2), 0, 0.5, 0.05 + TANK_R, Math.PI / 2);
    far = place(far, 1, 0.5, ARENA_H - TANK_R - 0.01, -Math.PI / 2);
    expect(Math.hypot(0, far.tanks[1].y - far.tanks[0].y)).toBeGreaterThan(ENGAGE);
    expect(lockedOn(far, 0)).toBe(false);
  });
});

// ── the bots ──────────────────────────────────────────────────────

describe('bots', () => {
  it('gives a legal order from every position it can be put in, at every difficulty', () => {
    const walls = arenaAt(1);
    const base = { ...startMatch(4, 3, 3, makeRng(4)), walls, grid: buildGrid(walls) };
    const spots: [number, number][] = [
      [0.06, 0.06],
      [0.5, 0.65],
      [ARENA_W - 0.06, ARENA_H - 0.06],
      [0.5, 0.05],
      [0.06, 0.65],
    ];
    for (const d of DIFFS) {
      const rng = makeRng(21);
      for (const [x, y] of spots) {
        for (const [fx, fy] of spots) {
          let w = place(base, 0, x, y, 0.3);
          w = place(w, 1, fx, fy, -1.1);
          for (let n = 0; n < 6; n++) {
            const order = botInput(w, 0, BOT[d], rng);
            expect(inputProblem(w, 0, order)).toBeNull();
            expect(Number.isFinite(order.mx)).toBe(true);
            expect(Number.isFinite(order.my)).toBe(true);
            expect(Math.hypot(order.mx, order.my)).toBeLessThanOrEqual(1.0001);
            expect(order.aim === null || Number.isFinite(order.aim)).toBe(true);
            if (order.fire) expect(fireProblem(w, 0)).toBeNull();
            w = step(w, DT, { 0: order });
          }
        }
      }
    }
  });

  it('parks itself when it is wrecked, when the match is over and when it is alone', () => {
    const w = bare(2);
    for (const d of DIFFS) {
      expect(botInput(place(w, 0, 0.5, 0.5, 0, { alive: false }), 0, BOT[d], makeRng(1))).toEqual(IDLE);
      expect(botInput(concede(w), 0, BOT[d], makeRng(1))).toEqual(IDLE);
      expect(botInput(place(w, 1, 0.9, 0.9, 0, { alive: false }), 0, BOT[d], makeRng(1))).toEqual(IDLE);
      expect(botInput(w, 9, BOT[d], makeRng(1))).toEqual(IDLE);
    }
  });

  it('never pulls the trigger on an empty gun, however hard it wants to', () => {
    let w = place(bare(2), 0, 0.3, 0.65, 0, { reload: RELOAD });
    w = place(w, 1, 0.55, 0.65, Math.PI);
    for (const d of DIFFS) {
      for (let seed = 0; seed < 40; seed++) expect(botInput(w, 0, BOT[d], makeRng(seed)).fire).toBe(false);
    }
  });

  it('shoots at a target it can see and holds off one it cannot', () => {
    const seen = (walls: { x: number; y: number; w: number; h: number }[]) => {
      let w = { ...bare(2), walls, grid: buildGrid(walls) };
      w = place(w, 0, 0.25, 0.65, 0);
      w = place(w, 1, 0.62, 0.65, Math.PI);
      let shots = 0;
      for (let seed = 0; seed < 60; seed++) if (botInput(w, 0, BOT.Sharp, makeRng(seed)).fire) shots++;
      return shots;
    };
    expect(seen([])).toBeGreaterThan(50);
    expect(seen([{ x: 0.42, y: 0.4, w: 0.06, h: 0.5 }])).toBeLessThan(6);
  });

  it('throws a shot away about as often as its blunder rate says', () => {
    // Nothing in sight and nothing lined up, so any shot at all is a wasted one.
    const walls = [{ x: 0.42, y: 0.0, w: 0.06, h: 1.3 }];
    let w = { ...bare(2), walls, grid: buildGrid(walls) };
    w = place(w, 0, 0.25, 0.65, 0);
    w = place(w, 1, 0.62, 0.65, Math.PI);
    for (const d of DIFFS) {
      let wasted = 0;
      for (let seed = 0; seed < 500; seed++) if (botInput(w, 0, BOT[d], makeRng(seed * 7 + 1)).fire) wasted++;
      expect(wasted / 500).toBeGreaterThan(BOT[d].blunder * 0.5);
      expect(wasted / 500).toBeLessThan(BOT[d].blunder * 2 + 0.02);
    }
    expect(BOT.Easy.blunder).toBeGreaterThan(BOT.Sharp.blunder);
  });

  it('aims straighter the sharper it is', () => {
    let w = place(bare(2), 0, 0.25, 0.65, 0);
    w = place(w, 1, 0.62, 0.65, Math.PI);
    const spread = (d: (typeof DIFFS)[number]) => {
      let worst = 0;
      for (let seed = 0; seed < 300; seed++) {
        const order = botInput(w, 0, BOT[d], makeRng(seed * 11 + 3));
        worst = Math.max(worst, Math.abs(angDiff(order.aim as number, 0)));
      }
      return worst;
    };
    expect(spread('Sharp')).toBeLessThan(spread('Normal'));
    expect(spread('Normal')).toBeLessThan(spread('Easy'));
    expect(spread('Easy')).toBeLessThan(AIM_SPREAD);
  });

  it('leads a crossing target only once it is deep enough to think of it', () => {
    let w = place(bare(2), 0, 0.2, 0.65, 0);
    w = place(w, 1, 0.6, 0.65, Math.PI / 2, { speed: 0.3 });
    const bearingOf = (depth: number) =>
      botInput(w, 0, { ...BOT.Sharp, depth, skill: 1, blunder: 0 }, makeRng(5)).aim as number;
    // A shallow bot shoots at the tank; a deeper one shoots where it is going.
    expect(Math.abs(bearingOf(1))).toBeLessThan(0.05);
    expect(bearingOf(BOT.Sharp.depth)).toBeGreaterThan(0.25);
    expect(BOT.Easy.depth).toBeLessThan(2);
  });

  it('hunts a target down across the whole floor', () => {
    for (let seed = 0; seed < 6; seed++) {
      let w = startMatch(2, 3, 3, makeRng(seed));
      const rng = makeRng(seed + 400);
      let inputs: Record<number, Input> = {};
      for (let tick = 0; !w.over && tick < 60 * 90; tick++) {
        if (tick % 4 === 0) inputs = { 0: IDLE, 1: botInput(w, 1, BOT.Sharp, rng) };
        w = step(w, DT, inputs);
      }
      // A tank that never moves is a tank that gets found and finished.
      expect(w.over).toBe(true);
      expect(w.winner).toBe(1);
      expect(w.tanks[0].out).toBe(true);
    }
  });

  it('never leaves a tank buried in a block over a whole match', () => {
    for (let seed = 0; seed < 6; seed++) {
      const w = botMatch([BOT.Sharp, BOT.Easy, BOT.Normal, BOT.Sharp], makeRng(seed * 3 + 2), 3);
      w.tanks.forEach((t) => {
        expect(insideWall(w.walls, t.x, t.y, TANK_R - 1e-6)).toBe(false);
        expect(t.x).toBeGreaterThanOrEqual(TANK_R - 1e-9);
        expect(t.x).toBeLessThanOrEqual(ARENA_W - TANK_R + 1e-9);
        expect(t.y).toBeGreaterThanOrEqual(TANK_R - 1e-9);
        expect(t.y).toBeLessThanOrEqual(ARENA_H - TANK_R + 1e-9);
      });
    }
  });

  it('rolls a wreck back onto the mark furthest from anybody who could shoot it', () => {
    let w = bare(2);
    w = place(w, 1, 0.11, 0.11);
    const spot = bestSpawn(w, 0);
    expect(Math.hypot(spot.x - 0.11, spot.y - 0.11)).toBeGreaterThan(0.6);
  });

  it('breaks off a shell already on its way, once it is deep enough to see it', () => {
    const aimed: Shell = {
      id: 1,
      owner: 1,
      x: 0.2,
      y: 0.65,
      vx: SHELL_SPEED,
      vy: 0,
      bounces: BOUNCES,
      bumps: 0,
      age: 0.4,
    };
    let w = place(bare(2), 0, 0.45, 0.65, 0);
    w = place(w, 1, 0.15, 0.65, 0);
    const live: TankWorld = { ...w, shells: [aimed] };

    // A shallow bot cannot see it coming: the shell changes nothing it does.
    const flat = botInput(live, 0, { ...BOT.Sharp, depth: 1 }, makeRng(3));
    const flatClear = botInput(w, 0, { ...BOT.Sharp, depth: 1 }, makeRng(3));
    expect(flat).toEqual(flatClear);

    // A deep one breaks across the shell's line rather than along it.
    const deep = botInput(live, 0, BOT.Sharp, makeRng(3));
    const along = Math.cos(Math.atan2(deep.my, deep.mx) - Math.atan2(aimed.vy, aimed.vx));
    expect(Math.abs(along)).toBeLessThan(0.2);
  });
});

// ── a full match ──────────────────────────────────────────────────

describe('a full match', () => {
  it('reaches a finish the board agrees with, and a scoreboard for every seat', () => {
    for (let seed = 0; seed < 12; seed++) {
      const w = botMatch([BOT.Normal, BOT.Normal, BOT.Normal, BOT.Normal], makeRng(seed * 13 + 7), 3);
      expect(w.over).toBe(true);
      expect(standings(w)).toHaveLength(w.seats);
      expect(new Set(standings(w)).size).toBe(w.seats);
      if (w.winner !== null) expect(w.tanks.filter((t) => t.seat === w.winner)).toHaveLength(1);
      const left = standing(w);
      if (left.length === 1) {
        // A winner by elimination is the only one left, and tops the board with it.
        expect(w.winner).toBe(left[0]);
        expect(standings(w)[0]).toBe(w.winner);
      } else if (left.length === 0) {
        // The last two went together, so there is nobody to hand it to.
        expect(w.winner).toBeNull();
      } else {
        // A winner on time is whoever wrecked the most.
        expect(w.t).toBe(w.limit);
        expect(w.winner).toBe(mostWrecks(w));
      }
      w.tanks.forEach((t) => {
        expect(t.lives).toBeGreaterThanOrEqual(0);
        expect(t.deaths).toBeLessThanOrEqual(w.livesPer);
        expect(t.out).toBe(t.lives <= 0);
        expect(xpFor(w, t.seat)).toBeGreaterThan(0);
      });
    }
  });

  it('finishes with every table the lobby can seat', () => {
    for (let seats = 2; seats <= MAX_SEATS; seats++) {
      const w = botMatch(
        Array.from({ length: seats }, () => BOT.Normal),
        makeRng(seats * 31 + 5),
        3,
      );
      expect(w.over).toBe(true);
      // Somebody takes it, unless the last two went together and nobody can.
      if (w.winner === null) expect(standing(w)).toHaveLength(0);
      else expect(standings(w)).toContain(w.winner);
      expect(w.tanks).toHaveLength(seats);
    }
  });

  it('shoots more than it misses the sharper it is', () => {
    const acc = (d: (typeof DIFFS)[number]) => {
      let shots = 0;
      let hits = 0;
      for (let seed = 0; seed < 14; seed++) {
        const w = botMatch([BOT[d], BOT.Normal], makeRng(seed * 19 + 11), 2);
        shots += w.tanks[0].shots;
        hits += w.tanks[0].hits;
      }
      return hits / Math.max(1, shots);
    };
    const sharp = acc('Sharp');
    const easy = acc('Easy');
    expect(sharp).toBeGreaterThan(easy + 0.1);
    expect(easy).toBeGreaterThan(0.08);
  });

  it('wins far more of the arena than it loses, head to head, from either mark', () => {
    const rate = (a: BotProfile, b: BotProfile) => {
      let wins = 0;
      for (let seed = 0; seed < 40; seed++) if (botMatch([a, b], makeRng(seed * 17 + 5), 2).winner === 0) wins++;
      return wins / 40;
    };
    expect(rate(BOT.Sharp, BOT.Easy)).toBeGreaterThan(0.7);
    // The same fight from the other mark, so it is the profile winning and not the seat.
    expect(rate(BOT.Easy, BOT.Sharp)).toBeLessThan(0.3);
    expect(rate(BOT.Normal, BOT.Easy)).toBeGreaterThan(0.6);
  });

  it('is still beatable — a careless seat takes the arena often enough to matter', () => {
    let easy = 0;
    for (let seed = 0; seed < 60; seed++) {
      if (botMatch([BOT.Easy, BOT.Normal, BOT.Sharp, BOT.Easy], makeRng(seed * 7 + 3), 3).winner === 0) easy++;
    }
    expect(easy).toBeGreaterThan(0);
    expect(easy).toBeLessThan(30);
  });
});

// ── determinism ───────────────────────────────────────────────────

describe('reproducibility', () => {
  const sig = (w: TankWorld) => ({
    winner: w.winner,
    t: Math.round(w.t * 1000),
    walls: w.walls,
    tanks: w.tanks.map((t) => ({
      seat: t.seat,
      x: Math.round(t.x * 1e6),
      y: Math.round(t.y * 1e6),
      kills: t.kills,
      deaths: t.deaths,
      lives: t.lives,
      shots: t.shots,
      hits: t.hits,
    })),
  });

  it('replays a whole match identically from the same seed', () => {
    const once = () => sig(botMatch([BOT.Sharp, BOT.Normal, BOT.Easy], makeRng(20260903), 3));
    expect(once()).toEqual(once());
  });

  it('gives different arenas and different outcomes from different seeds', () => {
    const winners = new Set<number | null>();
    const lengths = new Set<number>();
    const floors = new Set<string>();
    for (let seed = 0; seed < 18; seed++) {
      const w = botMatch([BOT.Normal, BOT.Normal, BOT.Normal, BOT.Normal], makeRng(seed * 5 + 1), 3);
      winners.add(w.winner);
      lengths.add(Math.round(w.t));
      floors.add(JSON.stringify(w.walls));
    }
    expect(winners.size).toBeGreaterThan(1);
    expect(lengths.size).toBeGreaterThan(3);
    expect(floors.size).toBe(LAYOUTS);
  });

  it('leaves the world it was handed untouched', () => {
    const w = place(bare(2), 0, 0.4, 0.6, 0);
    const before = JSON.stringify({ tanks: w.tanks, shells: w.shells, t: w.t });
    step(w, DT, { 0: { mx: 1, my: 0, aim: 1, fire: true } });
    expect(JSON.stringify({ tanks: w.tanks, shells: w.shells, t: w.t })).toBe(before);
  });

  it('lets any mark win, so the bots are beatable as well as beating', () => {
    const wins = [0, 0, 0, 0];
    for (let seed = 0; seed < 60; seed++) {
      // A mutual last-life wreck takes the arena away from everybody; it counts
      // for no mark rather than quietly for seat 0.
      const champ = botMatch([BOT.Sharp, BOT.Sharp, BOT.Sharp, BOT.Sharp], makeRng(seed * 3 + 1), 3).winner;
      if (champ !== null) wins[champ]++;
    }
    wins.forEach((n) => expect(n).toBeGreaterThan(0));
  });
});
