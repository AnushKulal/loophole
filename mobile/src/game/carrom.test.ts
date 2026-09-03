import { describe, expect, it } from 'vitest';
import { BOT, makeRng, type BotProfile, type Rng } from './contract';
import {
  BASE_HALF,
  BASE_INSET,
  BOARD,
  CUSHION_E,
  DT,
  MAN_R,
  MAX_SHOTS,
  MEN_PER_SIDE,
  POCKETS,
  POCKET_R,
  SHOT_MESSAGE,
  STRIKER_R,
  aimCandidates,
  atRest,
  baselineOf,
  botShot,
  describeShot,
  evaluate,
  freeSpots,
  ghostPoint,
  isLegalShot,
  menLeft,
  placeAtCentre,
  playShot,
  pocketIndex,
  pointsFor,
  queenOnBoard,
  rackPieces,
  radiusOf,
  resolve,
  settle,
  shotProblem,
  sideOfSeat,
  sideOfTeam,
  spotFree,
  startMatch,
  step,
  strikerAt,
  takeShot,
  teamOf,
  xpFor,
  type CarromState,
  type Kind,
  type Piece,
  type Shot,
  type Side,
} from './carrom';

const DIFFS = ['Easy', 'Normal', 'Sharp'] as const;

/** A board built by hand, so a rule can be checked without a lucky shot. */
function rig(pieces: Partial<Piece>[], over: Partial<CarromState> = {}): CarromState {
  let id = 0;
  const full: Piece[] = pieces.map((p) => ({
    id: p.id ?? id++,
    kind: (p.kind ?? 'white') as Kind,
    x: p.x ?? 0.5,
    y: p.y ?? 0.5,
    vx: p.vx ?? 0,
    vy: p.vy ?? 0,
  }));
  return {
    seats: 2,
    turn: 0,
    phase: 'aim',
    pieces: full,
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
    log: [],
    nextId: 100,
    ...over,
  };
}

/**
 * A shot that has already come to rest, with a chosen result. This is the
 * boundary the turn rules actually live on, so they can be checked exactly
 * rather than by hoping a simulated shot lands the right way.
 */
function landed(
  pieces: Partial<Piece>[],
  sunk: { kind: Kind }[],
  over: Partial<CarromState> = {},
  contact = true,
): CarromState {
  const s = rig(pieces, over);
  return {
    ...s,
    phase: 'moving',
    contact,
    shots: s.shots + 1,
    sunk: sunk.map((c, i) => ({ id: 900 + i, kind: c.kind, x: POCKETS[0][0], y: POCKETS[0][1], vx: 0, vy: 0 })),
  };
}

/** A whole board played out by bots. */
function autoMatch(seats: number, bot: BotProfile, rng: Rng, check = false): CarromState {
  let s = startMatch(seats, rng);
  for (let i = 0; i < MAX_SHOTS + 8 && s.winner === null; i++) {
    const seat = s.turn;
    const shot = botShot(s, seat, bot, rng);
    if (check) expect(shotProblem(s, seat, shot)).toBeNull();
    s = playShot(s, seat, shot);
  }
  return s;
}

const speed = (p: Piece) => Math.hypot(p.vx, p.vy);
const find = (s: CarromState, kind: Kind) => s.pieces.find((p) => p.kind === kind) as Piece;

// ── the rack ──────────────────────────────────────────────────────

describe('the rack', () => {
  it('is nine white, nine black and the queen in the middle', () => {
    const p = rackPieces();
    expect(p).toHaveLength(2 * MEN_PER_SIDE + 1);
    expect(p.filter((x) => x.kind === 'white')).toHaveLength(MEN_PER_SIDE);
    expect(p.filter((x) => x.kind === 'black')).toHaveLength(MEN_PER_SIDE);
    const queen = p.filter((x) => x.kind === 'queen');
    expect(queen).toHaveLength(1);
    expect(queen[0].x).toBeCloseTo(0.5, 9);
    expect(queen[0].y).toBeCloseTo(0.5, 9);
  });

  it('sets every man down clear of its neighbours, the cushions and the pockets', () => {
    const p = rackPieces();
    for (const a of p) {
      expect(a.x).toBeGreaterThanOrEqual(MAN_R);
      expect(a.x).toBeLessThanOrEqual(BOARD - MAN_R);
      expect(pocketIndex(a.x, a.y)).toBe(-1);
    }
    for (let i = 0; i < p.length; i++)
      for (let j = i + 1; j < p.length; j++) {
        const d = Math.hypot(p[i].x - p[j].x, p[i].y - p[j].y);
        expect(d).toBeGreaterThan(radiusOf(p[i].kind) + radiusOf(p[j].kind) - 1e-9);
      }
  });

  it('deals a fresh board with nothing potted and somebody to break', () => {
    const s = startMatch(2, makeRng(4));
    expect(s.phase).toBe('aim');
    expect(s.pieces).toHaveLength(19);
    expect(s.pocketed).toEqual({ white: 0, black: 0 });
    expect(s.winner).toBeNull();
    expect(s.turn).toBeGreaterThanOrEqual(0);
    expect(s.turn).toBeLessThan(2);
  });

  it('seats two facing each other and four round the board', () => {
    expect(baselineOf(2, 0).ny).toBe(-1); // seat 0 shoots up the board
    expect(baselineOf(2, 1).ny).toBe(1); // seat 1 shoots down it
    const four = [0, 1, 2, 3].map((i) => baselineOf(4, i));
    expect(new Set(four.map((b) => `${b.nx},${b.ny}`)).size).toBe(4);
    // Partners sit opposite and share a colour.
    expect(teamOf(0)).toBe(teamOf(2));
    expect(teamOf(1)).toBe(teamOf(3));
    expect(sideOfSeat(0)).toBe('white');
    expect(sideOfSeat(1)).toBe('black');
  });

  it('keeps the whole base line on the board', () => {
    for (const seats of [2, 3, 4]) {
      for (let seat = 0; seat < seats; seat++) {
        for (const u of [0, 0.25, 0.5, 0.75, 1]) {
          const { x, y } = strikerAt(seats, seat, u);
          expect(x).toBeGreaterThan(STRIKER_R);
          expect(x).toBeLessThan(BOARD - STRIKER_R);
          expect(y).toBeGreaterThan(STRIKER_R);
          expect(y).toBeLessThan(BOARD - STRIKER_R);
          expect(pocketIndex(x, y)).toBe(-1);
        }
      }
    }
    // The line runs the length the constants say it does.
    const a = strikerAt(2, 0, 0);
    const b = strikerAt(2, 0, 1);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(2 * BASE_HALF, 9);
    expect(a.y).toBeCloseTo(BOARD - BASE_INSET, 9);
  });
});

// ── the physics ───────────────────────────────────────────────────

describe('the physics', () => {
  it('rubs speed off a sliding disc until it parks', () => {
    let s = rig([{ kind: 'white', x: 0.5, y: 0.5, vx: 0.9, vy: 0 }], { phase: 'moving' });
    const first = speed(find(s, 'white'));
    s = step(s, DT);
    expect(speed(find(s, 'white'))).toBeLessThan(first);
    for (let i = 0; i < 400 && !atRest(s); i++) s = step(s, DT);
    expect(atRest(s)).toBe(true);
    // It travelled forwards and stopped short of the cushion.
    expect(find(s, 'white').x).toBeGreaterThan(0.5);
    expect(find(s, 'white').x).toBeLessThan(BOARD - MAN_R + 1e-9);
  });

  it('leaves the state it was handed alone', () => {
    const before = rig([{ kind: 'white', x: 0.5, y: 0.5, vx: 1, vy: 0.3 }], { phase: 'moving' });
    const snapshot = JSON.stringify(before);
    const after = step(before, DT);
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(after).not.toBe(before);
    expect(after.pieces[0]).not.toBe(before.pieces[0]);
  });

  it('bounces off a cushion instead of leaving the board', () => {
    let s = rig([{ kind: 'white', x: BOARD - MAN_R - 0.005, y: 0.5, vx: 1.2, vy: 0 }], { phase: 'moving' });
    s = settle(s);
    const p = find(s, 'white');
    expect(p.x).toBeLessThanOrEqual(BOARD - MAN_R + 1e-6);
    expect(p.x).toBeGreaterThanOrEqual(MAN_R - 1e-6);
    // The bounce came back the other way and lost energy doing it.
    expect(p.x).toBeLessThan(BOARD - MAN_R - 0.005);
  });

  it('keeps every disc inside the cushions however hard it is hit', () => {
    let s = rig(
      [
        { kind: 'white', x: 0.5, y: 0.5, vx: 2.3, vy: 1.7 },
        { kind: 'black', x: 0.62, y: 0.58, vx: -1.9, vy: 2.2 },
        { kind: 'striker', x: 0.4, y: 0.8, vx: 2.35, vy: -2.35 },
      ],
      { phase: 'moving' },
    );
    for (let i = 0; i < 1400; i++) {
      s = step(s, DT);
      for (const p of s.pieces) {
        const r = radiusOf(p.kind);
        expect(p.x).toBeGreaterThan(r - 1e-6);
        expect(p.x).toBeLessThan(BOARD - r + 1e-6);
        expect(p.y).toBeGreaterThan(r - 1e-6);
        expect(p.y).toBeLessThan(BOARD - r + 1e-6);
      }
    }
  });

  it('passes momentum along a head-on hit and never through a disc', () => {
    let s = rig(
      [
        { id: 1, kind: 'striker', x: 0.3, y: 0.5, vx: 1.4, vy: 0 },
        { id: 2, kind: 'white', x: 0.55, y: 0.5, vx: 0, vy: 0 },
      ],
      { phase: 'moving' },
    );
    s = settle(s);
    const striker = s.pieces.find((p) => p.id === 1) as Piece;
    const man = s.pieces.find((p) => p.id === 2) as Piece;
    expect(man).toBeDefined();
    // The man was driven down the table, and the striker stayed behind it.
    expect(man.x).toBeGreaterThan(0.55);
    expect(striker.x).toBeLessThan(man.x);
    expect(Math.abs(man.y - 0.5)).toBeLessThan(0.02);
  });

  it('sends a glancing hit off to the side', () => {
    let s = rig(
      [
        { id: 1, kind: 'striker', x: 0.5, y: 0.8, vx: 0, vy: -1.5 },
        { id: 2, kind: 'white', x: 0.53, y: 0.5, vx: 0, vy: 0 },
      ],
      { phase: 'moving' },
    );
    s = settle(s);
    const man = s.pieces.find((p) => p.id === 2) as Piece;
    expect(man.x).toBeGreaterThan(0.53); // cut to the right
    expect(man.y).toBeLessThan(0.5);
  });

  it('drops a disc that reaches a pocket and takes it off the board', () => {
    const [px, py] = POCKETS[0];
    let s = rig([{ id: 1, kind: 'white', x: px + 0.12, y: py + 0.12, vx: -0.6, vy: -0.6 }], { phase: 'moving' });
    s = settle(s);
    expect(s.pieces.find((p) => p.id === 1)).toBeUndefined();
    expect(s.sunk.map((p) => p.kind)).toEqual(['white']);
  });

  it('leaves a disc that stops short of the pocket on the board', () => {
    let s = rig([{ id: 1, kind: 'white', x: 0.5, y: 0.5, vx: 0.05, vy: 0 }], { phase: 'moving' });
    s = settle(s);
    expect(s.pieces).toHaveLength(1);
    expect(s.sunk).toHaveLength(0);
  });

  it('marks contact only when the striker actually strikes something', () => {
    const clean = settle(rig([{ kind: 'striker', x: 0.5, y: 0.8, vx: 0, vy: -1 }], { phase: 'moving' }));
    expect(clean.contact).toBe(false);

    const hit = settle(
      rig(
        [
          { kind: 'striker', x: 0.5, y: 0.8, vx: 0, vy: -1 },
          { kind: 'white', x: 0.5, y: 0.5, vx: 0, vy: 0 },
        ],
        { phase: 'moving' },
      ),
    );
    expect(hit.contact).toBe(true);
  });

  it('always comes to a stop, however chaotic the break', () => {
    for (let seed = 0; seed < 8; seed++) {
      const rng = makeRng(seed + 1);
      const pieces = rackPieces().concat({
        id: 99,
        kind: 'striker',
        x: 0.2 + rng() * 0.6,
        y: 0.86,
        vx: (rng() - 0.5) * 2,
        vy: -2.3,
      });
      const s = settle({ ...rig([]), pieces, phase: 'moving' });
      expect(atRest(s)).toBe(true);
    }
  });

  it('recognises a pocket by distance to its centre', () => {
    const [px, py] = POCKETS[2];
    expect(pocketIndex(px, py)).toBe(2);
    expect(pocketIndex(px, py + POCKET_R * 0.5)).toBe(2);
    expect(pocketIndex(px, py - POCKET_R * 1.6)).toBe(-1);
    expect(pocketIndex(0.5, 0.5)).toBe(-1);
    expect(CUSHION_E).toBeLessThan(1); // cushions absorb, they do not add
  });
});

// ── legality ──────────────────────────────────────────────────────

describe('a legal shot', () => {
  const board = () => startMatch(2, makeRng(2));
  const up = -Math.PI / 2;

  it('accepts a striker on the base line aimed into the board', () => {
    const s = { ...board(), turn: 0 };
    expect(isLegalShot(s, 0, { u: 0.5, angle: up, power: 0.7 })).toBe(true);
    expect(isLegalShot(s, 0, { u: 0, angle: up + 0.6, power: 0.2 })).toBe(true);
    expect(isLegalShot(s, 0, { u: 1, angle: up - 0.6, power: 1 })).toBe(true);
  });

  it('turns down a shot from the wrong seat or the wrong phase', () => {
    const s = { ...board(), turn: 0 };
    expect(shotProblem(s, 1, { u: 0.5, angle: up, power: 0.7 })).toBe('not-your-turn');
    expect(shotProblem({ ...s, phase: 'moving' }, 0, { u: 0.5, angle: up, power: 0.7 })).toBe('not-your-turn');
    expect(shotProblem({ ...s, winner: 0, phase: 'over' }, 0, { u: 0.5, angle: up, power: 0.7 })).toBe('not-your-turn');
    expect(() => takeShot(s, 1, { u: 0.5, angle: up, power: 0.7 })).toThrow();
  });

  it('turns down a striker off the base line, with no pace, or shot backwards', () => {
    const s = { ...board(), turn: 0 };
    expect(shotProblem(s, 0, { u: -0.01, angle: up, power: 0.7 })).toBe('off-baseline');
    expect(shotProblem(s, 0, { u: 1.4, angle: up, power: 0.7 })).toBe('off-baseline');
    expect(shotProblem(s, 0, { u: Number.NaN, angle: up, power: 0.7 })).toBe('off-baseline');
    expect(shotProblem(s, 0, { u: 0.5, angle: up, power: 0 })).toBe('no-power');
    expect(shotProblem(s, 0, { u: 0.5, angle: up, power: 1.2 })).toBe('no-power');
    // Straight back into your own cushion, and flat along the line.
    expect(shotProblem(s, 0, { u: 0.5, angle: Math.PI / 2, power: 0.7 })).toBe('wrong-way');
    expect(shotProblem(s, 0, { u: 0.5, angle: 0, power: 0.7 })).toBe('wrong-way');
    expect(SHOT_MESSAGE['wrong-way']).toMatch(/into the board/);
  });

  it('turns down a spot with a man already sitting on it', () => {
    const spot = strikerAt(2, 0, 0.5);
    const s = rig([{ kind: 'black', x: spot.x, y: spot.y }]);
    expect(spotFree(s, 0, 0.5)).toBe(false);
    expect(shotProblem(s, 0, { u: 0.5, angle: up, power: 0.7 })).toBe('blocked');
    // and still offers the rest of the line
    const spots = freeSpots(s, 0, 25);
    expect(spots.length).toBeGreaterThan(15);
    for (const u of spots) expect(isLegalShot(s, 0, { u, angle: up, power: 0.7 })).toBe(true);
  });

  it('puts the striker exactly where it was aimed from', () => {
    const s = { ...board(), turn: 0 };
    const moved = takeShot(s, 0, { u: 0.25, angle: up, power: 0.5 });
    const striker = find(moved, 'striker');
    const spot = strikerAt(2, 0, 0.25);
    expect(striker.x).toBeCloseTo(spot.x, 9);
    expect(striker.y).toBeCloseTo(spot.y, 9);
    expect(striker.vy).toBeLessThan(0);
    expect(moved.phase).toBe('moving');
    expect(moved.shots).toBe(s.shots + 1);
  });
});

// ── the turn rules ────────────────────────────────────────────────

describe('the turn rules', () => {
  const men = () => [
    { kind: 'white' as Kind, x: 0.3, y: 0.4 },
    { kind: 'white' as Kind, x: 0.6, y: 0.4 },
    { kind: 'black' as Kind, x: 0.4, y: 0.6 },
    { kind: 'queen' as Kind, x: 0.5, y: 0.5 },
  ];

  it('lets you strike again when you pot one of your own', () => {
    const s = resolve(landed(men(), [{ kind: 'white' }]));
    expect(s.last?.own).toBe(1);
    expect(s.last?.again).toBe(true);
    expect(s.turn).toBe(0);
    expect(s.phase).toBe('aim');
    expect(s.pocketed.white).toBe(1);
  });

  it('passes the strike on when nothing goes down', () => {
    const s = resolve(landed(men(), []));
    expect(s.last?.own).toBe(0);
    expect(s.last?.again).toBe(false);
    expect(s.turn).toBe(1);
    expect(s.pocketed).toEqual({ white: 0, black: 0 });
  });

  it('credits a man of the other colour to its owner and passes the strike on', () => {
    const s = resolve(landed(men(), [{ kind: 'black' }]));
    expect(s.last?.opp).toBe(1);
    expect(s.pocketed.black).toBe(1);
    expect(s.pocketed.white).toBe(0);
    expect(s.turn).toBe(1);
  });

  it('calls a pocketed striker a foul, returns everything and costs a man', () => {
    const s = resolve(landed(men(), [{ kind: 'white' }, { kind: 'striker' }], { pocketed: { white: 3, black: 1 } }));
    expect(s.last?.foul).toBe(true);
    expect(s.last?.strikerSunk).toBe(true);
    // the man potted this shot goes back, and one already in the pile goes back too
    expect(s.pocketed.white).toBe(2);
    expect(menLeft(s, 'white')).toBe(4);
    expect(s.turn).toBe(1);
    expect(s.pieces.some((p) => p.kind === 'striker')).toBe(false);
  });

  it('calls touching nothing a foul as well', () => {
    const s = resolve(landed(men(), [], { pocketed: { white: 2, black: 0 } }, false));
    expect(s.last?.missed).toBe(true);
    expect(s.last?.foul).toBe(true);
    expect(s.pocketed.white).toBe(1);
    expect(menLeft(s, 'white')).toBe(3);
    expect(s.turn).toBe(1);
  });

  it('remembers a foul it could not pay for and collects it from the next pot', () => {
    const owed = resolve(landed(men(), [{ kind: 'striker' }], { pocketed: { white: 0, black: 0 } }));
    expect(owed.due[0]).toBe(1);
    expect(owed.pocketed.white).toBe(0);

    const paid = resolve(landed(men(), [{ kind: 'white' }], { due: [1, 0], turn: 0 }));
    expect(paid.due[0]).toBe(0);
    expect(paid.pocketed.white).toBe(0); // the pot went straight back out
    expect(menLeft(paid, 'white')).toBe(3);
    expect(paid.last?.again).toBe(true); // it was still a pot
  });

  it('puts every returned man somewhere legal', () => {
    const s = resolve(landed(men(), [{ kind: 'white' }, { kind: 'striker' }], { pocketed: { white: 5, black: 0 } }));
    for (const a of s.pieces) {
      expect(pocketIndex(a.x, a.y)).toBe(-1);
      expect(a.x).toBeGreaterThanOrEqual(radiusOf(a.kind) - 1e-9);
      expect(a.y).toBeLessThanOrEqual(BOARD - radiusOf(a.kind) + 1e-9);
    }
    for (let i = 0; i < s.pieces.length; i++)
      for (let j = i + 1; j < s.pieces.length; j++) {
        const d = Math.hypot(s.pieces[i].x - s.pieces[j].x, s.pieces[i].y - s.pieces[j].y);
        expect(d).toBeGreaterThan(radiusOf(s.pieces[i].kind) + radiusOf(s.pieces[j].kind) - 1e-6);
      }
  });

  it('finds room for a man even when the middle is packed', () => {
    const pieces = rackPieces();
    const extra = placeAtCentre(pieces, 'white', 500);
    expect(pocketIndex(extra.x, extra.y)).toBe(-1);
    for (const p of pieces) {
      const d = Math.hypot(p.x - extra.x, p.y - extra.y);
      expect(d).toBeGreaterThan(radiusOf(p.kind) + MAN_R - 1e-6);
    }
  });
});

// ── the queen ─────────────────────────────────────────────────────

describe('the queen', () => {
  const men = () => [
    { kind: 'white' as Kind, x: 0.3, y: 0.4 },
    { kind: 'white' as Kind, x: 0.6, y: 0.4 },
    { kind: 'black' as Kind, x: 0.4, y: 0.6 },
  ];

  it('is covered on the spot when your own man falls with her', () => {
    const s = resolve(landed(men(), [{ kind: 'queen' }, { kind: 'white' }]));
    expect(s.queenOff).toBe(true);
    expect(s.queenTeam).toBe(0);
    expect(s.queenCovered).toBe(true);
    expect(s.last?.again).toBe(true);
  });

  it('waits to be covered, and buys the shot to do it with', () => {
    const s = resolve(landed(men(), [{ kind: 'queen' }]));
    expect(s.queenOff).toBe(true);
    expect(s.queenCovered).toBe(false);
    expect(s.queenTeam).toBe(0);
    expect(s.last?.again).toBe(true); // the cover shot
    expect(s.turn).toBe(0);
    expect(queenOnBoard(s)).toBe(false);

    const covered = resolve(landed(men(), [{ kind: 'white' }], { ...s, phase: 'aim' }));
    expect(covered.queenCovered).toBe(true);
    expect(covered.queenOff).toBe(true);
  });

  it('goes back to the board when the cover shot misses', () => {
    const held = resolve(landed(men(), [{ kind: 'queen' }]));
    const back = resolve(landed(men(), [], { ...held, phase: 'aim' }));
    expect(back.queenOff).toBe(false);
    expect(back.queenTeam).toBeNull();
    expect(back.last?.queenReturned).toBe(true);
    expect(queenOnBoard(back)).toBe(true);
    expect(back.turn).toBe(1);
  });

  it('goes back straight away when the cover shot is a foul', () => {
    const s = resolve(landed(men(), [{ kind: 'queen' }, { kind: 'striker' }]));
    expect(s.queenOff).toBe(false);
    expect(queenOnBoard(s)).toBe(true);
    expect(s.last?.foul).toBe(true);
  });

  it('goes back when the cover shot itself is fouled away', () => {
    // She is held from the shot before, and the cover strike pockets the
    // striker: a foul is not a cover, so she cannot stay off the board.
    const held = resolve(landed(men(), [{ kind: 'queen' }]));
    expect(held.queenOff).toBe(true);
    expect(held.queenCovered).toBe(false);

    const fouled = resolve(landed(men(), [{ kind: 'striker' }], { ...held, phase: 'aim' }));
    expect(fouled.last?.foul).toBe(true);
    expect(fouled.queenOff).toBe(false);
    expect(fouled.queenTeam).toBeNull();
    expect(fouled.queenCovered).toBe(false);
    expect(queenOnBoard(fouled)).toBe(true);
    expect(fouled.last?.queenReturned).toBe(true);
    expect(fouled.turn).toBe(1);
  });

  it('will not let the other side pot your last man while she is lying there', () => {
    // Seat 1 sinks white's ninth. It is credited to white, so it must come
    // straight back out — white with nothing on the cloth could never cover her.
    const board = [
      { kind: 'queen' as Kind, x: 0.5, y: 0.5 },
      { kind: 'black' as Kind, x: 0.7, y: 0.7 },
    ];
    const s = resolve(
      landed(board, [{ kind: 'white' }], { pocketed: { white: MEN_PER_SIDE - 1, black: 0 }, turn: 1 }),
    );
    expect(s.winner).toBeNull();
    expect(s.pocketed.white).toBe(MEN_PER_SIDE - 1);
    expect(menLeft(s, 'white')).toBe(1);
    expect(queenOnBoard(s)).toBe(true);
    expect(s.log.join(' ')).toMatch(/queen is still on the board/);
  });

  it('hands the board to the seat that played the strike, not the other side', () => {
    // White is sitting on nine; seat 1 settles the queen. That is seat 1's
    // strike, so it cannot finish white's board for them.
    const s = resolve(
      landed([{ kind: 'black' as Kind, x: 0.4, y: 0.6 }], [{ kind: 'queen' }, { kind: 'black' }], {
        pocketed: { white: MEN_PER_SIDE, black: 3 },
        turn: 1,
      }),
    );
    expect(s.queenCovered).toBe(true);
    expect(s.queenTeam).toBe(1);
    expect(s.winner).toBeNull();
    expect(s.phase).toBe('aim');
  });

  it('gives a simultaneous ninth to the side on strike', () => {
    // Seat 0 has cleared and holds the covered queen; the black man it gifts
    // takes black to nine on the very same strike. The board is still white's.
    const s = resolve(
      landed([{ kind: 'black' as Kind, x: 0.4, y: 0.6 }], [{ kind: 'black' }], {
        pocketed: { white: MEN_PER_SIDE, black: MEN_PER_SIDE - 1 },
        queenOff: true,
        queenCovered: true,
        queenTeam: 0,
        turn: 0,
      }),
    );
    expect(s.winner).toBe(0);
    expect(s.phase).toBe('over');
  });

  it('will not let a side finish while she is still lying there', () => {
    // Eight already in the pile and the ninth going down now, with the queen
    // still lying in the middle: the ninth is not allowed to finish it.
    const board = [
      { kind: 'black' as Kind, x: 0.4, y: 0.6 },
      { kind: 'queen' as Kind, x: 0.5, y: 0.5 },
    ];
    const s = resolve(landed(board, [{ kind: 'white' }], { pocketed: { white: MEN_PER_SIDE - 1, black: 0 } }));
    expect(s.winner).toBeNull();
    expect(s.pocketed.white).toBe(MEN_PER_SIDE - 1); // the last man came back out
    expect(menLeft(s, 'white')).toBe(1);
    expect(s.log.join(' ')).toMatch(/queen is still on the board/);
  });

  it('lets a side finish the moment she is settled', () => {
    const board = [
      { kind: 'white' as Kind, x: 0.3, y: 0.4 },
      { kind: 'black' as Kind, x: 0.4, y: 0.6 },
    ];
    const s = resolve(
      landed(board, [{ kind: 'white' }], {
        pocketed: { white: MEN_PER_SIDE - 1, black: 0 },
        queenOff: true,
        queenTeam: 0,
        queenCovered: true,
      }),
    );
    expect(s.winner).toBe(0);
    expect(s.phase).toBe('over');
    expect(s.pocketed.white).toBe(MEN_PER_SIDE);
  });

  it('lets the queen and the last man go down together', () => {
    const board = [{ kind: 'black' as Kind, x: 0.4, y: 0.6 }];
    const s = resolve(
      landed(board, [{ kind: 'queen' }, { kind: 'white' }], { pocketed: { white: MEN_PER_SIDE - 1, black: 0 } }),
    );
    expect(s.queenCovered).toBe(true);
    expect(s.winner).toBe(0);
  });
});

// ── a full board ──────────────────────────────────────────────────

describe('a full board', () => {
  it('reaches a finish with exactly one winning side', () => {
    for (let seed = 0; seed < 4; seed++) {
      const s = autoMatch(2, BOT.Sharp, makeRng(seed * 17 + 3));
      expect(s.winner).not.toBeNull();
      expect(s.phase).toBe('over');
      expect([0, 1]).toContain(s.winner);
      // The other side did not also finish.
      const won = sideOfTeam(s.winner as number);
      const lost = sideOfTeam(1 - (s.winner as number));
      expect(s.pocketed[won] + menLeft(s, won)).toBe(MEN_PER_SIDE);
      expect(s.pocketed[lost] + menLeft(s, lost)).toBe(MEN_PER_SIDE);
      expect(pointsFor(s, s.winner as number)).toBeGreaterThan(0);
      expect(pointsFor(s, 1 - (s.winner as number))).toBe(0);
    }
  }, 120000);

  it('never loses or invents a man along the way', () => {
    const rng = makeRng(555);
    let s = startMatch(2, rng);
    for (let i = 0; i < 40 && s.winner === null; i++) {
      s = playShot(s, s.turn, botShot(s, s.turn, BOT.Normal, rng));
      for (const side of ['white', 'black'] as Side[]) {
        expect(s.pocketed[side] + menLeft(s, side)).toBe(MEN_PER_SIDE);
        expect(s.pocketed[side]).toBeGreaterThanOrEqual(0);
      }
      expect(s.pieces.some((p) => p.kind === 'striker')).toBe(false);
      expect(Number(s.queenOff) + Number(queenOnBoard(s))).toBe(1);
      expect(atRest(s)).toBe(true);
    }
  }, 120000);

  it('finishes at every table size the lobby can seat', () => {
    for (const seats of [2, 3, 4]) {
      const s = autoMatch(seats, BOT.Sharp, makeRng(seats * 91 + 7));
      expect(s.winner).not.toBeNull();
      expect(s.seats).toBe(seats);
    }
  }, 180000);

  it('is called on the fuller pile if it will not end on its own', () => {
    const s = resolve(
      landed([{ kind: 'white', x: 0.4, y: 0.4 }], [], { shots: MAX_SHOTS - 1, pocketed: { white: 4, black: 2 } }),
    );
    expect(s.shots).toBe(MAX_SHOTS);
    expect(s.winner).toBe(0);
    expect(s.phase).toBe('over');
  });
});

// ── the bots ──────────────────────────────────────────────────────

describe('the bots', () => {
  it('returns a legal shot from every board it can be handed, at every difficulty', () => {
    for (const d of DIFFS) {
      const rng = makeRng(11);
      // the opening rack
      const opening = startMatch(2, rng);
      for (let i = 0; i < 12; i++) expect(shotProblem(opening, opening.turn, botShot(opening, opening.turn, BOT[d], rng))).toBeNull();

      // a board down to two men, one of them jammed on the base line
      const spot = strikerAt(2, 0, 0.5);
      const late = rig([
        { kind: 'white', x: 0.22, y: 0.3 },
        { kind: 'black', x: spot.x, y: spot.y },
        { kind: 'queen', x: 0.7, y: 0.62 },
      ]);
      for (let i = 0; i < 12; i++) expect(shotProblem(late, 0, botShot(late, 0, BOT[d], rng))).toBeNull();

      // a board with none of its own left to aim at
      const barren = rig([{ kind: 'black', x: 0.5, y: 0.45 }], { pocketed: { white: 9, black: 0 } });
      for (let i = 0; i < 12; i++) expect(shotProblem(barren, 0, botShot(barren, 0, BOT[d], rng))).toBeNull();

      // and from the other side of the board
      const away = { ...startMatch(4, rng), turn: 3 };
      for (let i = 0; i < 8; i++) expect(shotProblem(away, 3, botShot(away, 3, BOT[d], rng))).toBeNull();
    }
  }, 180000);

  it('still plays legally when it is deliberately throwing the shot away', () => {
    const wild: BotProfile = { skill: 0, depth: 1, blunder: 1, think: 0 };
    const rng = makeRng(3);
    const s = { ...startMatch(2, rng), turn: 0 };
    for (let i = 0; i < 60; i++) expect(shotProblem(s, 0, botShot(s, 0, wild, rng))).toBeNull();
  });

  it('refuses to shoot when the board is over', () => {
    const done = rig([{ kind: 'black', x: 0.5, y: 0.5 }], { phase: 'over', winner: 0 });
    const shot = botShot(done, 0, BOT.Sharp, makeRng(1));
    expect(Number.isFinite(shot.angle)).toBe(true);
    expect(shotProblem(done, 0, shot)).toBe('not-your-turn');
  });

  it('lines a pot up through the ghost point', () => {
    // A lone white man with a clear road to the top-left pocket.
    const s = rig([{ id: 7, kind: 'white', x: 0.32, y: 0.5 }]);
    const cands = aimCandidates(s, 0);
    expect(cands.length).toBeGreaterThan(0);
    const g = ghostPoint(s.pieces[0], POCKETS[0][0], POCKETS[0][1]);
    // The ghost point sits a striker plus a man back from the target, on the
    // far side from the pocket it is being sent to.
    expect(Math.hypot(g.x - s.pieces[0].x, g.y - s.pieces[0].y)).toBeCloseTo(STRIKER_R + MAN_R, 9);
    expect(g.x).toBeGreaterThan(s.pieces[0].x);
    expect(g.y).toBeGreaterThan(s.pieces[0].y);
    for (const c of cands) expect(isLegalShot(s, 0, c)).toBe(true);
  });

  it('pots far more often when it is sharp than when it is careless', () => {
    const rate = (d: (typeof DIFFS)[number]) => {
      let pots = 0;
      let shots = 0;
      for (let seed = 0; seed < 6; seed++) {
        const rng = makeRng(seed * 23 + 9);
        let s = startMatch(2, rng);
        for (let i = 0; i < 22 && s.winner === null; i++) {
          s = playShot(s, s.turn, botShot(s, s.turn, BOT[d], rng));
          shots++;
          if (s.last && (s.last.own > 0 || s.last.queen)) pots++;
        }
      }
      return pots / shots;
    };
    const sharp = rate('Sharp');
    const easy = rate('Easy');
    expect(sharp).toBeGreaterThan(easy + 0.12);
    expect(sharp).toBeLessThan(0.9); // it misses too — it is a real opponent
  }, 180000);

  it('takes the board off a careless bot far more often than it loses it', () => {
    const rate = (a: BotProfile, b: BotProfile, seeds: number) => {
      let wins = 0;
      for (let seed = 0; seed < seeds; seed++) {
        const rng = makeRng(seed * 13 + 5);
        let s = startMatch(2, rng);
        for (let i = 0; i < MAX_SHOTS + 8 && s.winner === null; i++) {
          s = playShot(s, s.turn, botShot(s, s.turn, teamOf(s.turn) === 0 ? a : b, rng));
        }
        if (s.winner === 0) wins++;
      }
      return wins / seeds;
    };
    expect(rate(BOT.Sharp, BOT.Easy, 8)).toBeGreaterThan(0.6);
    // the same board from the other chair, so it is the profile winning and not the seat
    expect(rate(BOT.Easy, BOT.Sharp, 8)).toBeLessThan(0.4);
  }, 300000);

  it('reads a board it has cleaned up as better than one it has not', () => {
    const messy = rig([
      { kind: 'white', x: 0.5, y: 0.5 },
      { kind: 'white', x: 0.56, y: 0.5 },
      { kind: 'black', x: 0.44, y: 0.5 },
    ]);
    const tidy: CarromState = { ...messy, pieces: messy.pieces.slice(2), pocketed: { white: 2, black: 0 } };
    expect(evaluate(tidy, 0)).toBeGreaterThan(evaluate(messy, 0));
    expect(evaluate(tidy, 1)).toBeLessThan(evaluate(messy, 1));
    expect(evaluate({ ...messy, winner: 0, phase: 'over' }, 0)).toBeGreaterThan(evaluate(tidy, 0));
    // the queen is worth having, and worth more once she is covered
    const held: CarromState = { ...messy, queenOff: true, queenTeam: 0, queenCovered: false };
    const kept: CarromState = { ...held, queenCovered: true };
    expect(evaluate(kept, 0)).toBeGreaterThan(evaluate(held, 0));
    expect(evaluate(held, 0)).toBeGreaterThan(evaluate(messy, 0));
  });
});

// ── determinism ───────────────────────────────────────────────────

describe('reproducibility', () => {
  const sig = (s: CarromState) => ({
    winner: s.winner,
    shots: s.shots,
    pocketed: s.pocketed,
    queen: [s.queenOff, s.queenTeam, s.queenCovered],
    pieces: s.pieces.map((p) => `${p.kind}:${p.x.toFixed(6)},${p.y.toFixed(6)}`),
    log: s.log,
  });

  it('replays a whole board identically from the same seed', () => {
    const run = () => sig(autoMatch(2, BOT.Normal, makeRng(20260903)));
    expect(run()).toEqual(run());
  }, 120000);

  it('replays one shot identically, tick by tick, however it is stepped', () => {
    const s = takeShot(startMatch(2, makeRng(8)), 0, { u: 0.4, angle: -1.4, power: 0.85 });
    let a = s;
    for (let i = 0; i < 1000 && !atRest(a); i++) a = step(a, DT);
    const b = settle(s);
    expect(sig(resolve(a))).toEqual(sig(resolve(b)));
  });

  it('gives different boards from different seeds', () => {
    const shapes = new Set<string>();
    for (let seed = 0; seed < 6; seed++) {
      const rng = makeRng(seed * 7 + 1);
      let s = startMatch(2, rng);
      for (let i = 0; i < 6; i++) s = playShot(s, s.turn, botShot(s, s.turn, BOT.Normal, rng));
      shapes.add(JSON.stringify(sig(s).pieces));
    }
    expect(shapes.size).toBeGreaterThan(4);
  }, 120000);

  it('lets either side take the board, so the bots are beatable as well as beating', () => {
    const winners = new Set<number | null>();
    for (let seed = 0; seed < 8; seed++) winners.add(autoMatch(2, BOT.Normal, makeRng(seed * 29 + 4)).winner);
    expect(winners.size).toBe(2);
  }, 300000);
});

// ── the scoreboard ────────────────────────────────────────────────

describe('the scoreboard', () => {
  const won = (over: Partial<CarromState> = {}) =>
    rig(
      [
        { kind: 'black', x: 0.3, y: 0.3 },
        { kind: 'black', x: 0.4, y: 0.3 },
        { kind: 'black', x: 0.5, y: 0.3 },
      ],
      {
        winner: 0,
        phase: 'over',
        pocketed: { white: 9, black: 6 },
        queenOff: true,
        queenTeam: 0,
        queenCovered: true,
        ...over,
      },
    );

  it('pays a point per man the losers left, and three for the queen', () => {
    const s = won();
    expect(pointsFor(s, 0)).toBe(3 + 3);
    expect(pointsFor(s, 1)).toBe(0);
    // the queen counts only for whoever covered her
    expect(pointsFor(won({ queenTeam: 1 }), 0)).toBe(3);
  });

  it('pays the winning side most, and every seat something', () => {
    const s = won();
    expect(xpFor(s, 0)).toBe(60 + 26 * 9 + 40 * 6 + 220);
    expect(xpFor(s, 1)).toBe(60 + 26 * 6);
    expect(xpFor(s, 0)).toBeGreaterThan(xpFor(s, 1));
    expect(xpFor(s, 2)).toBe(xpFor(s, 0)); // partners share the board
  });

  it('ranks the winning side first', () => {
    const s = won();
    expect([0, 1, 2, 3].map((i) => (s.winner === teamOf(i) ? 1 : 2))).toEqual([1, 2, 1, 2]);
  });

  it('says what the last shot did', () => {
    const name = (i: number) => `Seat ${i}`;
    expect(describeShot(null, name)).toMatch(/Break/);
    const base = { seat: 1, own: 0, opp: 0, queen: false, strikerSunk: false, missed: false, foul: false, returned: 0, queenReturned: false, again: false };
    expect(describeShot({ ...base, own: 2, again: true }, name)).toMatch(/potted 2/);
    expect(describeShot({ ...base, strikerSunk: true, foul: true, returned: 1 }, name)).toMatch(/striker/);
    expect(describeShot({ ...base, missed: true, foul: true }, name)).toMatch(/touched nothing/);
    expect(describeShot({ ...base, queen: true, again: true }, name)).toMatch(/queen/);
    expect(describeShot(base, name)).toMatch(/empty/);
  });
});
