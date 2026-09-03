/**
 * Carrom — nineteen discs, four corner pockets and one striker.
 *
 * This is a real 2D physics board rather than a table of squares. The playing
 * surface is the unit square; every disc is a circle with a position, a
 * velocity, a radius and a mass, and `step(state, dt)` advances all of them by
 * one fixed tick: integrate, rub off a little speed to friction, bounce off the
 * four cushions, resolve circle-circle impulses, then drop anything that has
 * wandered inside a pocket. Nothing here knows about frames or clocks — the
 * screen calls `step` from a requestAnimationFrame accumulator, the bots call
 * the very same function to look ahead, and the tests call it to replay a match
 * exactly. One dt, one physics.
 *
 * On top of the physics sit the carrom rules proper: white against black with
 * the red queen in the middle, pot one of yours and shoot again, pocket the
 * striker and you owe a man back, and the queen has to be covered by one of
 * your own on the same shot or the next one or she goes back to the centre.
 *
 * Pure data, pure transitions. Chance enters only through an `Rng`.
 */

import type { BotProfile, Rng } from './contract';

// ── the board ─────────────────────────────────────────────────────

/** The playing surface is the unit square, so every length below is a fraction of a side. */
export const BOARD = 1;

export const MAN_R = 0.024;
export const STRIKER_R = 0.03;
export const POCKET_R = 0.035;
/** How far a pocket's centre sits in from the corner. */
export const POCKET_INSET = 0.048;

/** A striker is a heavier disc than a man; that is why it can break the rosette. */
export const MAN_MASS = 1;
export const STRIKER_MASS = 1.65;

/** Sliding friction, in board-widths per second squared. */
export const FRICTION = 0.95;
/** Below this speed a disc is treated as parked. */
export const REST_V = 0.02;
export const CUSHION_E = 0.72;
export const PIECE_E = 0.94;

/** Speed off the striker at zero and at full power. */
export const MIN_SPEED = 0.55;
export const MAX_SPEED = 2.35;

/** The physics tick. The screen's accumulator uses the same one. */
export const DT = 1 / 120;
/** No shot is allowed to run longer than this before it is called dead. */
export const MAX_SHOT_SECONDS = 8;

/** Nine of each colour, plus the queen. */
export const MEN_PER_SIDE = 9;

/** How far the base line sits from its cushion, and how long half of it is. */
export const BASE_INSET = 0.14;
export const BASE_HALF = 0.28;

/** The four corner pockets, clockwise from the top left. */
export const POCKETS: [number, number][] = [
  [POCKET_INSET, POCKET_INSET],
  [BOARD - POCKET_INSET, POCKET_INSET],
  [BOARD - POCKET_INSET, BOARD - POCKET_INSET],
  [POCKET_INSET, BOARD - POCKET_INSET],
];

/** The centre circle the rosette is racked in, and where returned men go back. */
export const CENTRE: [number, number] = [BOARD / 2, BOARD / 2];
export const CENTRE_R = 4 * MAN_R + MAN_R;

// ── discs ─────────────────────────────────────────────────────────

/** The two colours of men. A seat's team owns one of them for the whole board. */
export type Side = 'white' | 'black';
export type Kind = Side | 'queen' | 'striker';

export const SIDES: Side[] = ['white', 'black'];
export const SIDE_NAME: Record<Side, string> = { white: 'White', black: 'Black' };

export interface Piece {
  id: number;
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export const radiusOf = (k: Kind) => (k === 'striker' ? STRIKER_R : MAN_R);
export const massOf = (k: Kind) => (k === 'striker' ? STRIKER_MASS : MAN_MASS);
export const isMan = (k: Kind): k is Side => k === 'white' || k === 'black';

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const LOG_KEEP = 14;

// ── seats, teams and base lines ───────────────────────────────────

/** Two seats face each other; three or four sit round the board. */
export const sideIndex = (seats: number, seat: number) => (seats <= 2 ? (seat % 2) * 2 : seat % 4);

/** Partners sit opposite, so the team is simply the parity of the seat. */
export const teamOf = (seat: number) => seat % 2;
export const sideOfTeam = (team: number): Side => (team % 2 === 0 ? 'white' : 'black');
export const sideOfSeat = (seat: number) => sideOfTeam(teamOf(seat));
export const otherSide = (s: Side): Side => (s === 'white' ? 'black' : 'white');

/** Inward normal of each cushion: bottom, right, top, left. */
const INWARD: [number, number][] = [
  [0, -1],
  [-1, 0],
  [0, 1],
  [1, 0],
];

export interface Baseline {
  /** Midpoint of the line. */
  cx: number;
  cy: number;
  /** Unit vector along the line, so `u` can be mapped to a point. */
  tx: number;
  ty: number;
  /** Unit vector pointing into the board. */
  nx: number;
  ny: number;
}

/** Where `seat` shoots from, given how many are round the board. */
export function baselineOf(seats: number, seat: number): Baseline {
  const s = sideIndex(seats, seat);
  const [nx, ny] = INWARD[s];
  // The line sits BASE_INSET in from its own cushion, centred on that cushion.
  const cx = s === 1 ? BOARD - BASE_INSET : s === 3 ? BASE_INSET : BOARD / 2;
  const cy = s === 0 ? BOARD - BASE_INSET : s === 2 ? BASE_INSET : BOARD / 2;
  // Tangent is the normal turned a quarter turn.
  return { cx, cy, tx: -ny, ty: nx, nx, ny };
}

/** The striker's centre for a position `u` (0–1) along that seat's base line. */
export function strikerAt(seats: number, seat: number, u: number): { x: number; y: number } {
  const b = baselineOf(seats, seat);
  const off = (clamp(u, 0, 1) - 0.5) * 2 * BASE_HALF;
  return { x: b.cx + b.tx * off, y: b.cy + b.ty * off };
}

// ── state ─────────────────────────────────────────────────────────

/** One shot: where on the base line, which way, and how hard. */
export interface Shot {
  /** 0–1 along the base line. */
  u: number;
  /** Absolute board angle in radians; +y is down the screen. */
  angle: number;
  /** 0–1, mapped onto MIN_SPEED…MAX_SPEED. */
  power: number;
}

/** What one shot did, once every disc had stopped. */
export interface ShotOutcome {
  seat: number;
  /** Men of the shooter's own colour potted. */
  own: number;
  /** Men of the other colour potted — they still count for their owners. */
  opp: number;
  queen: boolean;
  strikerSunk: boolean;
  /** The striker touched nothing at all. */
  missed: boolean;
  foul: boolean;
  /** Men put back on the board as a penalty or because the queen went uncovered. */
  returned: number;
  queenReturned: boolean;
  /** The shooter keeps the strike. */
  again: boolean;
}

export type Phase = 'aim' | 'moving' | 'over';

export interface CarromState {
  seats: number;
  turn: number;
  phase: Phase;
  /** Everything on the board, striker included while a shot is in flight. */
  pieces: Piece[];
  /** Discs pocketed during the shot in flight, in the order they fell. */
  sunk: Piece[];
  /** The striker has struck something this shot. */
  contact: boolean;
  /** Men off the board, by colour. */
  pocketed: Record<Side, number>;
  queenOff: boolean;
  /** The team holding the queen while she is still uncovered, else null. */
  queenTeam: number | null;
  queenCovered: boolean;
  /** Men each team owes back to the board from fouls it could not pay for. */
  due: number[];
  shots: number;
  last: ShotOutcome | null;
  /** The winning team, not the winning seat. */
  winner: number | null;
  log: string[];
  nextId: number;
}

/** A board that runs longer than this is called on men potted. */
export const MAX_SHOTS = 100;

// ── racking ───────────────────────────────────────────────────────

/**
 * The rosette: the queen in the middle, six men round her and twelve round
 * those, colours alternating so each ring splits evenly and both sides start
 * with nine.
 */
export function rackPieces(): Piece[] {
  const [cx, cy] = CENTRE;
  const out: Piece[] = [{ id: 0, kind: 'queen', x: cx, y: cy, vx: 0, vy: 0 }];
  let id = 1;
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    out.push({
      id: id++,
      kind: i % 2 === 0 ? 'white' : 'black',
      x: cx + 2 * MAN_R * Math.cos(a),
      y: cy + 2 * MAN_R * Math.sin(a),
      vx: 0,
      vy: 0,
    });
  }
  for (let i = 0; i < 12; i++) {
    const a = -Math.PI / 2 + Math.PI / 12 + (i * Math.PI) / 6;
    out.push({
      id: id++,
      kind: i % 2 === 0 ? 'black' : 'white',
      x: cx + 4 * MAN_R * Math.cos(a),
      y: cy + 4 * MAN_R * Math.sin(a),
      vx: 0,
      vy: 0,
    });
  }
  return out;
}

/** A fresh board. Two, three or four seats; partners sit opposite. */
export function startMatch(seats: number, rng: Rng): CarromState {
  const n = clamp(Math.floor(seats) || 2, 2, 4);
  const pieces = rackPieces();
  // The only thing chance decides is who breaks.
  const first = Math.floor(rng() * n) % n;
  return {
    seats: n,
    turn: first,
    phase: 'aim',
    pieces,
    sunk: [],
    contact: false,
    pocketed: { white: 0, black: 0 },
    queenOff: false,
    queenTeam: null,
    queenCovered: false,
    due: [0, 0],
    shots: 0,
    last: null,
    winner: null,
    log: [`Seat ${first} breaks`],
    nextId: pieces.length,
  };
}

const note = (s: CarromState, ...lines: string[]) => s.log.concat(lines).slice(-LOG_KEEP);
const copy = (p: Piece): Piece => ({ ...p });

// ── the physics ───────────────────────────────────────────────────

/** Squared distance, kept inline-cheap because the inner loops run millions of times. */
const dist2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);

/** The pocket a disc has fallen into, or -1. */
export function pocketIndex(x: number, y: number): number {
  for (let i = 0; i < POCKETS.length; i++) {
    const [px, py] = POCKETS[i];
    if (dist2(x, y, px, py) <= POCKET_R * POCKET_R) return i;
  }
  return -1;
}

/** Every disc has stopped moving. */
export function atRest(s: CarromState): boolean {
  for (const p of s.pieces) if (p.vx !== 0 || p.vy !== 0) return false;
  return true;
}

/**
 * One tick, in place, on a working array. The public `step` clones first — this
 * is the hot path the bots and the animation both run through.
 *
 * Returns whether the striker touched anything during the tick, and pushes any
 * pocketed disc onto `sunk`.
 */
function advance(pieces: Piece[], sunk: Piece[], dt: number): boolean {
  let touched = false;

  // 1. integrate, and rub speed off against the cloth. A disc that comes to
  //    rest this tick still moved, so it stays in `moving` for the cushion and
  //    pocket passes below — otherwise it could park inside a wall.
  const moving: number[] = [];
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    if (p.vx === 0 && p.vy === 0) continue;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const sp = Math.hypot(p.vx, p.vy);
    const next = sp - FRICTION * dt;
    if (next <= REST_V) {
      p.vx = 0;
      p.vy = 0;
    } else {
      const k = next / sp;
      p.vx *= k;
      p.vy *= k;
    }
    moving.push(i);
  }
  if (!moving.length) return false;

  // 2. cushions
  for (const i of moving) {
    const p = pieces[i];
    const r = radiusOf(p.kind);
    if (p.x < r) {
      p.x = r + (r - p.x);
      p.vx = Math.abs(p.vx) * CUSHION_E;
      p.vy *= CUSHION_E;
    } else if (p.x > BOARD - r) {
      p.x = BOARD - r - (p.x - (BOARD - r));
      p.vx = -Math.abs(p.vx) * CUSHION_E;
      p.vy *= CUSHION_E;
    }
    if (p.y < r) {
      p.y = r + (r - p.y);
      p.vy = Math.abs(p.vy) * CUSHION_E;
      p.vx *= CUSHION_E;
    } else if (p.y > BOARD - r) {
      p.y = BOARD - r - (p.y - (BOARD - r));
      p.vy = -Math.abs(p.vy) * CUSHION_E;
      p.vx *= CUSHION_E;
    }
  }

  // 3. disc against disc — a pair only matters if one of them is going somewhere
  const isMoving = new Set(moving);
  for (let i = 0; i < pieces.length; i++) {
    const a = pieces[i];
    const am = isMoving.has(i);
    for (let j = i + 1; j < pieces.length; j++) {
      if (!am && !isMoving.has(j)) continue;
      const b = pieces[j];
      const ra = radiusOf(a.kind);
      const rb = radiusOf(b.kind);
      const sum = ra + rb;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= sum * sum || d2 === 0) continue;

      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;

      // push them apart so they cannot sink into one another
      const ma = massOf(a.kind);
      const mb = massOf(b.kind);
      const overlap = sum - d;
      const share = ma / (ma + mb);
      a.x -= nx * overlap * (1 - share) * 1.02;
      a.y -= ny * overlap * (1 - share) * 1.02;
      b.x += nx * overlap * share * 1.02;
      b.y += ny * overlap * share * 1.02;

      const vn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (vn <= 0) continue; // already separating

      if (a.kind === 'striker' || b.kind === 'striker') touched = true;

      const jimp = ((1 + PIECE_E) * vn) / (1 / ma + 1 / mb);
      a.vx -= (jimp / ma) * nx;
      a.vy -= (jimp / ma) * ny;
      b.vx += (jimp / mb) * nx;
      b.vy += (jimp / mb) * ny;

      // a nudged disc rejoins the moving set for this tick's pocket sweep
      isMoving.add(i);
      isMoving.add(j);
    }
  }

  // 4. pockets
  for (let i = pieces.length - 1; i >= 0; i--) {
    const p = pieces[i];
    if (p.vx === 0 && p.vy === 0 && !isMoving.has(i)) continue;
    if (pocketIndex(p.x, p.y) >= 0) sunk.push(...pieces.splice(i, 1));
  }

  return touched;
}

/**
 * Advance the whole board by `dt`. Pure: the state handed in is untouched.
 *
 * This is the single source of motion — the screen's animation loop, the bots'
 * look-ahead and the tests all go through it, so what a bot predicts is exactly
 * what the board does.
 */
export function step(s: CarromState, dt: number = DT): CarromState {
  if (s.phase !== 'moving') return s;
  const pieces = s.pieces.map(copy);
  const sunk = s.sunk.slice();
  const touched = advance(pieces, sunk, dt);
  return { ...s, pieces, sunk, contact: s.contact || touched };
}

/** Run the shot in flight until everything stops, or the safety cap trips. */
export function settle(s: CarromState, dt: number = DT, maxSeconds = MAX_SHOT_SECONDS): CarromState {
  if (s.phase !== 'moving') return s;
  const pieces = s.pieces.map(copy);
  const sunk = s.sunk.slice();
  let contact = s.contact;
  const steps = Math.ceil(maxSeconds / dt);
  for (let i = 0; i < steps; i++) {
    let still = true;
    for (const p of pieces) {
      if (p.vx !== 0 || p.vy !== 0) {
        still = false;
        break;
      }
    }
    if (still) break;
    if (advance(pieces, sunk, dt)) contact = true;
  }
  // Anything still crawling at the cap is parked, so a board never hangs.
  for (const p of pieces) {
    p.vx = 0;
    p.vy = 0;
  }
  return { ...s, pieces, sunk, contact };
}

// ── legality ──────────────────────────────────────────────────────

export type ShotError = 'not-your-turn' | 'off-baseline' | 'blocked' | 'no-power' | 'wrong-way';

export const SHOT_MESSAGE: Record<ShotError, string> = {
  'not-your-turn': 'It is not your strike',
  'off-baseline': 'The striker has to sit on your base line',
  blocked: 'A man is in the way — slide the striker along',
  'no-power': 'Pull back further to give it some pace',
  'wrong-way': 'Shoot into the board, not into your own cushion',
};

/** How much of the aim has to point up the board rather than along the line. */
export const MIN_FORWARD = 0.08;

/** True when the striker would sit clear of every man at that spot. */
export function spotFree(s: CarromState, seat: number, u: number): boolean {
  if (u < 0 || u > 1) return false;
  const { x, y } = strikerAt(s.seats, seat, u);
  for (const p of s.pieces) {
    if (p.kind === 'striker') continue;
    const sum = STRIKER_R + radiusOf(p.kind);
    if (dist2(x, y, p.x, p.y) < sum * sum) return false;
  }
  return true;
}

/** Why this shot would be turned down, or null if it is legal. */
export function shotProblem(s: CarromState, seat: number, shot: Shot): ShotError | null {
  if (s.phase !== 'aim' || s.winner !== null || s.turn !== seat) return 'not-your-turn';
  if (!Number.isFinite(shot.u) || shot.u < 0 || shot.u > 1) return 'off-baseline';
  if (!Number.isFinite(shot.power) || shot.power <= 0 || shot.power > 1) return 'no-power';
  if (!Number.isFinite(shot.angle)) return 'wrong-way';
  const b = baselineOf(s.seats, seat);
  const dx = Math.cos(shot.angle);
  const dy = Math.sin(shot.angle);
  if (dx * b.nx + dy * b.ny < MIN_FORWARD) return 'wrong-way';
  if (!spotFree(s, seat, shot.u)) return 'blocked';
  return null;
}

export const isLegalShot = (s: CarromState, seat: number, shot: Shot) => shotProblem(s, seat, shot) === null;

/** The positions along the base line that are not fouled by a man sitting on them. */
export function freeSpots(s: CarromState, seat: number, samples = 25): number[] {
  const out: number[] = [];
  for (let i = 0; i < samples; i++) {
    const u = samples === 1 ? 0.5 : i / (samples - 1);
    if (spotFree(s, seat, u)) out.push(u);
  }
  return out;
}

// ── putting men back ──────────────────────────────────────────────

/**
 * Drop a man back on the board, as close to the centre circle as there is room
 * for. The search is a fixed spiral so a returned man lands in the same place
 * every replay.
 */
export function placeAtCentre(pieces: Piece[], kind: Kind, id: number): Piece {
  const r = radiusOf(kind);
  const [cx, cy] = CENTRE;
  const fits = (x: number, y: number) => {
    if (x < r || x > BOARD - r || y < r || y > BOARD - r) return false;
    if (pocketIndex(x, y) >= 0) return false;
    for (const p of pieces) {
      const sum = r + radiusOf(p.kind);
      if (dist2(x, y, p.x, p.y) < sum * sum) return false;
    }
    return true;
  };
  if (fits(cx, cy)) return { id, kind, x: cx, y: cy, vx: 0, vy: 0 };
  for (let ring = 1; ring <= 40; ring++) {
    const rad = ring * MAN_R * 0.9;
    const n = Math.max(6, Math.round((2 * Math.PI * rad) / (MAN_R * 1.6)));
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + (k * 2 * Math.PI) / n;
      const x = cx + rad * Math.cos(a);
      const y = cy + rad * Math.sin(a);
      if (fits(x, y)) return { id, kind, x, y, vx: 0, vy: 0 };
    }
  }
  return { id, kind, x: cx, y: cy, vx: 0, vy: 0 };
}

// ── taking a shot ─────────────────────────────────────────────────

export const speedFor = (power: number) => MIN_SPEED + clamp(power, 0, 1) * (MAX_SPEED - MIN_SPEED);

/**
 * Put the striker on the base line and let it go. The board is now `moving`;
 * run `step` (or `settle`) until it rests, then `resolve`.
 */
export function takeShot(s: CarromState, seat: number, shot: Shot): CarromState {
  const bad = shotProblem(s, seat, shot);
  if (bad) throw new Error(SHOT_MESSAGE[bad]);
  const { x, y } = strikerAt(s.seats, seat, shot.u);
  const v = speedFor(shot.power);
  const striker: Piece = {
    id: s.nextId,
    kind: 'striker',
    x,
    y,
    vx: Math.cos(shot.angle) * v,
    vy: Math.sin(shot.angle) * v,
  };
  return {
    ...s,
    phase: 'moving',
    pieces: s.pieces.map(copy).concat(striker),
    sunk: [],
    contact: false,
    nextId: s.nextId + 1,
    shots: s.shots + 1,
  };
}

/** Men of `side` still on the board. */
export const menLeft = (s: CarromState, side: Side) => s.pieces.filter((p) => p.kind === side).length;
/** The queen is still on the board. */
export const queenOnBoard = (s: CarromState) => s.pieces.some((p) => p.kind === 'queen');

/**
 * Apply the rules to whatever the shot left behind.
 *
 * Pot one of yours and you strike again. Pot the striker, or fail to touch a
 * man at all, and it is a foul: everything you sank this shot goes back, an
 * uncovered queen with it, and you owe one of your own men to the centre. The
 * queen has to be covered by one of your own on the same shot or the next one,
 * and neither colour's last man may stay down while she is still lying there.
 * Only the seat that just played can take the board.
 */
export function resolve(s: CarromState): CarromState {
  if (s.phase !== 'moving') return s;
  if (!atRest(s)) return s;

  const seat = s.turn;
  const team = teamOf(seat);
  const mine = sideOfTeam(team);

  const pieces = s.pieces.filter((p) => p.kind !== 'striker').map(copy);
  const strikerSunk = s.sunk.some((p) => p.kind === 'striker');
  const sunkMen = s.sunk.filter((p) => isMan(p.kind));
  const sunkQueen = s.sunk.some((p) => p.kind === 'queen');
  const missed = !s.contact;
  const foul = strikerSunk || missed;

  const pocketed = { ...s.pocketed };
  let queenOff = s.queenOff;
  let queenTeam = s.queenTeam;
  let queenCovered = s.queenCovered;
  const due = s.due.slice();
  let nextId = s.nextId;
  let returned = 0;
  let queenReturned = false;
  const lines: string[] = [];

  let own = 0;
  let opp = 0;
  /** Men of each colour that went down on this shot and stayed down. */
  const potted: Record<Side, number> = { white: 0, black: 0 };

  if (foul) {
    // Nothing sunk on a foul stands: it all goes straight back to the middle.
    for (const p of sunkMen) pieces.push(placeAtCentre(pieces, p.kind, nextId++));
    if (sunkQueen) {
      pieces.push(placeAtCentre(pieces, 'queen', nextId++));
      queenReturned = true;
    }
    returned += sunkMen.length + (sunkQueen ? 1 : 0);
    // and a man of your own comes back out of your pile as the penalty
    if (pocketed[mine] > 0) {
      pocketed[mine] -= 1;
      pieces.push(placeAtCentre(pieces, mine, nextId++));
      returned += 1;
    } else {
      due[team] += 1;
    }
    lines.push(missed ? `Seat ${seat} touched nothing — foul` : `Seat ${seat} pockets the striker — foul`);
    // A foul is not a cover. A queen held from an earlier shot goes back with
    // everything else, or she would sit off the board uncovered for ever.
    if (queenOff && !queenCovered && queenTeam === team) {
      queenOff = false;
      queenTeam = null;
      pieces.push(placeAtCentre(pieces, 'queen', nextId++));
      queenReturned = true;
      returned += 1;
      lines.push(`The queen goes back — seat ${seat} never covered her`);
    }
  } else {
    for (const p of sunkMen) {
      const side = p.kind as Side;
      pocketed[side] += 1;
      potted[side] += 1;
      if (side === mine) own += 1;
      else opp += 1;
    }
    if (own) lines.push(`Seat ${seat} pots ${own} ${SIDE_NAME[mine].toLowerCase()}`);
    if (opp) lines.push(`Seat ${seat} sinks ${opp} of the other colour`);

    // A foul owed from an earlier shot is paid out of this pot.
    while (due[team] > 0 && pocketed[mine] > 0) {
      due[team] -= 1;
      pocketed[mine] -= 1;
      pieces.push(placeAtCentre(pieces, mine, nextId++));
      returned += 1;
      lines.push(`Seat ${seat} pays a man back to the centre`);
    }

    if (sunkQueen) {
      queenOff = true;
      queenTeam = team;
      queenCovered = own > 0;
      lines.push(queenCovered ? `Seat ${seat} takes the queen and covers her` : `Seat ${seat} takes the queen — she must be covered`);
    } else if (queenOff && !queenCovered && queenTeam === team) {
      // The cover shot: one of your own, or she goes back.
      if (own > 0) {
        queenCovered = true;
        lines.push(`Seat ${seat} covers the queen`);
      } else {
        queenOff = false;
        queenTeam = null;
        pieces.push(placeAtCentre(pieces, 'queen', nextId++));
        queenReturned = true;
        returned += 1;
        lines.push(`The queen goes back — seat ${seat} never covered her`);
      }
    }
  }

  // A side cannot finish while the queen is still lying on the board — no
  // matter who potted the ninth man. Leaving it down would strand that colour
  // with nothing on the cloth to cover her with, and the board could never end.
  const queenSettled = queenOff && queenCovered;
  if (!queenSettled) {
    for (const side of SIDES) {
      if (potted[side] === 0 || pocketed[side] < MEN_PER_SIDE) continue;
      // The man that would have finished it comes back out instead.
      pocketed[side] -= 1;
      pieces.push(placeAtCentre(pieces, side, nextId++));
      returned += 1;
      lines.push('The queen is still on the board — the last man goes back');
    }
  }

  // Only the seat that just played can take the board: a side is never handed
  // the win off the other side's strike.
  let winner: number | null = queenSettled && pocketed[mine] >= MEN_PER_SIDE && due[team] === 0 ? team : null;

  const again = winner === null && !foul && (own > 0 || (sunkQueen && !queenReturned));
  const turn = winner === null && !again ? (s.turn + 1) % s.seats : s.turn;

  // A board that will not end is called on men potted.
  if (winner === null && s.shots >= MAX_SHOTS) {
    const w = pocketed.white;
    const b = pocketed.black;
    winner = w === b ? (queenTeam ?? 0) : w > b ? 0 : 1;
    lines.push('Time on the board — it goes to the fuller pile');
  }

  const outcome: ShotOutcome = {
    seat,
    own,
    opp,
    queen: sunkQueen,
    strikerSunk,
    missed,
    foul,
    returned,
    queenReturned,
    again,
  };

  if (winner !== null) lines.push(`${SIDE_NAME[sideOfTeam(winner)]} takes the board`);

  return {
    ...s,
    pieces,
    sunk: [],
    contact: false,
    pocketed,
    queenOff,
    queenTeam,
    queenCovered,
    due,
    turn,
    phase: winner === null ? 'aim' : 'over',
    winner,
    last: outcome,
    nextId,
    log: note(s, ...lines),
  };
}

/** Take a shot and play it right through to the next player's turn. */
export function playShot(s: CarromState, seat: number, shot: Shot, dt: number = DT): CarromState {
  return resolve(settle(takeShot(s, seat, shot), dt));
}

// ── the bots ──────────────────────────────────────────────────────

/**
 * Where the striker has to strike a man so that the man leaves along `dir`.
 *
 * The two discs touch centre-to-centre along the line of the hit, so the ghost
 * position is one striker plus one man back from the target along that line —
 * the same aiming geometry a pool player uses.
 */
export function ghostPoint(target: Piece, px: number, py: number): { x: number; y: number; dx: number; dy: number } {
  const dx = px - target.x;
  const dy = py - target.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  const gap = STRIKER_R + radiusOf(target.kind);
  return { x: target.x - ux * gap, y: target.y - uy * gap, dx: ux, dy: uy };
}

/** Nothing is standing between the striker's spot and the point it is aimed at. */
function pathClear(pieces: Piece[], sx: number, sy: number, gx: number, gy: number, skip: number): boolean {
  const dx = gx - sx;
  const dy = gy - sy;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return false;
  const ux = dx / len;
  const uy = dy / len;
  for (const p of pieces) {
    if (p.id === skip) continue;
    const t = (p.x - sx) * ux + (p.y - sy) * uy;
    if (t <= 0 || t >= len) continue;
    const px = sx + ux * t;
    const py = sy + uy * t;
    const clearance = STRIKER_R + radiusOf(p.kind);
    if (dist2(px, py, p.x, p.y) < clearance * clearance * 0.92) return false;
  }
  return true;
}

/** How much of a shot a candidate is before anything is simulated. */
interface Candidate extends Shot {
  /** Rough promise of the line, used to pick which ones are worth simulating. */
  hope: number;
}

/**
 * Every pot a seat can see: each of its own men (and the queen when she is
 * worth taking) against each pocket, from several spots along the base line.
 */
export function aimCandidates(s: CarromState, seat: number): Candidate[] {
  const b = baselineOf(s.seats, seat);
  const mine = sideOfSeat(seat);
  const wantQueen = queenOnBoard(s) && menLeft(s, mine) > 0;
  const targets = s.pieces.filter((p) => p.kind === mine || (p.kind === 'queen' && wantQueen));
  const spots = freeSpots(s, seat, 17);
  const out: Candidate[] = [];

  for (const p of targets) {
    for (const [px, py] of POCKETS) {
      const g = ghostPoint(p, px, py);
      // A man cannot be driven backwards through the striker.
      for (const u of spots) {
        const { x: sx, y: sy } = strikerAt(s.seats, seat, u);
        const ax = g.x - sx;
        const ay = g.y - sy;
        const len = Math.hypot(ax, ay);
        if (len < STRIKER_R) continue;
        const ux = ax / len;
        const uy = ay / len;
        // it has to leave the base line into the board
        if (ux * b.nx + uy * b.ny < MIN_FORWARD + 0.05) continue;
        // and the cut cannot be steeper than about seventy degrees
        const cut = ux * g.dx + uy * g.dy;
        if (cut < 0.34) continue;
        if (!pathClear(s.pieces, sx, sy, g.x, g.y, p.id)) continue;
        const toPocket = Math.hypot(px - p.x, py - p.y);
        const power = clamp(0.34 + len * 0.42 + toPocket * 0.5 + (1 - cut) * 0.35, 0.3, 1);
        out.push({
          u,
          angle: Math.atan2(uy, ux),
          power,
          hope: cut * 2.4 - len * 0.5 - toPocket * 0.6 + (p.kind === 'queen' ? 0.35 : 0),
        });
      }
    }
  }
  out.sort((a, c) => c.hope - a.hope);
  return out;
}

/** A shot with no plan behind it, used for blunders and for coverage. */
function wildShot(s: CarromState, seat: number, rng: Rng): Shot {
  const spots = freeSpots(s, seat, 17);
  const b = baselineOf(s.seats, seat);
  const u = spots.length ? spots[Math.floor(rng() * spots.length)] : 0.5;
  const base = Math.atan2(b.ny, b.nx);
  const spread = (rng() - 0.5) * 2 * (Math.PI / 2 - 0.25);
  return { u, angle: base + spread, power: 0.4 + rng() * 0.6 };
}

/** How much a board is worth to `team`, once a candidate shot has been played. */
export function evaluate(s: CarromState, team: number): number {
  if (s.winner === team) return 100000;
  if (s.winner !== null) return -100000;

  const mine = sideOfTeam(team);
  const theirs = otherSide(mine);
  let score = 320 * s.pocketed[mine] - 200 * s.pocketed[theirs] - 260 * s.due[team] + 260 * s.due[1 - team];

  if (s.queenOff) {
    if (s.queenTeam === team) score += s.queenCovered ? 520 : 150;
    else score -= s.queenCovered ? 520 : 150;
  }

  // Men sitting near a pocket are worth something; so is not gift-wrapping theirs.
  for (const p of s.pieces) {
    let best = Infinity;
    for (const [px, py] of POCKETS) best = Math.min(best, Math.hypot(px - p.x, py - p.y));
    const near = 1 - clamp(best / 0.62, 0, 1);
    if (p.kind === mine) score += 42 * near;
    else if (p.kind === theirs) score -= 26 * near;
    else if (p.kind === 'queen') score += 18 * near;
  }
  return score;
}

/**
 * The bot's shot.
 *
 * It works the way a decent carrom player does: pick the pots that are actually
 * on — each of its own men against each pocket, aimed through the ghost point,
 * from a base-line spot with a clear line — then play each one out on the very
 * same physics the board runs on and keep whichever left the best table. How
 * many it is allowed to try scales with `skill`, and `depth` buys extra rounds
 * of nudging the best line found so far. `blunder` throws the plan away.
 */
export function botShot(s: CarromState, seat: number, bot: BotProfile, rng: Rng): Shot {
  if (s.phase !== 'aim' || s.winner !== null) return { u: 0.5, angle: 0, power: 0.5 };

  const legal = (sh: Shot) => shotProblem(s, seat, sh) === null;
  const fallback = (): Shot => {
    for (let i = 0; i < 40; i++) {
      const w = wildShot(s, seat, rng);
      if (legal(w)) return w;
    }
    const spots = freeSpots(s, seat, 33);
    const b = baselineOf(s.seats, seat);
    return { u: spots.length ? spots[Math.floor(spots.length / 2)] : 0.5, angle: Math.atan2(b.ny, b.nx), power: 0.7 };
  };

  if (rng() < bot.blunder) return fallback();

  const team = teamOf(seat);
  const tries = Math.max(4, Math.round(5 + 25 * bot.skill));
  const wilds = 2 + Math.round(4 * (1 - bot.skill));

  const pool: Shot[] = aimCandidates(s, seat)
    .filter(legal)
    .slice(0, tries)
    .map(({ u, angle, power }) => ({ u, angle, power }));
  for (let i = 0; i < wilds; i++) {
    const w = wildShot(s, seat, rng);
    if (legal(w)) pool.push(w);
  }
  if (!pool.length) return fallback();

  // The noise is what makes a careless bot careless: it misreads its own reads.
  const noise = 900 * (1 - bot.skill);
  const scoreOf = (sh: Shot) => evaluate(playShot(s, seat, sh), team) + (rng() - 0.5) * noise;

  let best = pool[0];
  let bestScore = scoreOf(best);
  for (let i = 1; i < pool.length; i++) {
    const v = scoreOf(pool[i]);
    if (v > bestScore) {
      bestScore = v;
      best = pool[i];
    }
  }

  // `depth` extra rounds of feeling around the best line found so far.
  for (let round = 1; round < Math.max(1, bot.depth); round++) {
    const spread = 0.6 / round;
    for (let k = 0; k < 5; k++) {
      const trial: Shot = {
        u: clamp(best.u + (rng() - 0.5) * 0.09 * spread, 0, 1),
        angle: best.angle + (rng() - 0.5) * 0.09 * spread,
        power: clamp(best.power + (rng() - 0.5) * 0.22 * spread, 0.15, 1),
      };
      if (!legal(trial)) continue;
      const v = scoreOf(trial);
      if (v > bestScore) {
        bestScore = v;
        best = trial;
      }
    }
  }

  return waver(s, seat, best, bot, rng);
}

/**
 * The hand, as opposed to the head.
 *
 * A bot that plays the line it picked exactly would pot everything, because it
 * reads the board with the very physics the board runs on. Real players miss,
 * so the chosen line is nudged by an execution error that shrinks with `skill`
 * — a sharp bot is off by half a degree, a careless one by five.
 */
export function waver(s: CarromState, seat: number, shot: Shot, bot: BotProfile, rng: Rng): Shot {
  const spread = 0.013 + 0.075 * (1 - bot.skill);
  const kick = 0.02 + 0.11 * (1 - bot.skill);
  for (let i = 0; i < 6; i++) {
    const trial: Shot = {
      u: shot.u,
      angle: shot.angle + (rng() - 0.5) * 2 * spread,
      power: clamp(shot.power + (rng() - 0.5) * 2 * kick, 0.12, 1),
    };
    if (shotProblem(s, seat, trial) === null) return trial;
  }
  return shot;
}

// ── the scoreboard ────────────────────────────────────────────────

/**
 * The winning side scores a point for every man the losers left on the board,
 * plus three for the queen if they were the ones who covered her.
 */
export function pointsFor(s: CarromState, team: number): number {
  if (s.winner !== team) return 0;
  const left = menLeft(s, otherSide(sideOfTeam(team)));
  return left + (s.queenOff && s.queenCovered && s.queenTeam === team ? 3 : 0);
}

/** 1 for the winning team's seats, 2 for the rest. */
export const placeOf = (s: CarromState, seat: number) => (s.winner === teamOf(seat) ? 1 : 2);

/**
 * The seats in scoreboard order: the winning side first, seat order within a
 * side. Teams are seat parities, so the seats themselves interleave win and
 * loss — anything that prints a row's position as its placing has to be handed
 * the board through here rather than in seat order.
 */
export function standings(s: CarromState): number[] {
  return Array.from({ length: s.seats }, (_, i) => i).sort(
    (a, b) => placeOf(s, a) - placeOf(s, b) || a - b,
  );
}

/** XP: a flat fee, the men your side sank, the board points and the win. */
export function xpFor(s: CarromState, seat: number): number {
  const team = teamOf(seat);
  return 60 + 26 * s.pocketed[sideOfTeam(team)] + 40 * pointsFor(s, team) + (s.winner === team ? 220 : 0);
}

/** A one-line reading of the last shot, for the table log. */
export function describeShot(o: ShotOutcome | null, name: (seat: number) => string): string {
  if (!o) return 'Break the rosette';
  const who = name(o.seat);
  if (o.missed) return `${who} touched nothing — a man goes back`;
  if (o.strikerSunk) return `${who} pocketed the striker — a man goes back`;
  if (o.queen && !o.queenReturned) return `${who} took the queen`;
  if (o.queenReturned) return 'The queen went back uncovered';
  if (o.own && o.opp) return `${who} potted ${o.own} and gifted ${o.opp}`;
  if (o.own) return `${who} potted ${o.own} — another strike`;
  if (o.opp) return `${who} sank ${o.opp} of the other colour`;
  return `${who} came up empty`;
}
