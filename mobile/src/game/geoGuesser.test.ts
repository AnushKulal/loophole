import { describe, expect, it } from 'vitest';
import { BOT, makeRng, type BotProfile, type Difficulty, type Rng } from './contract';
import {
  BLUNDER_MIN_KM,
  BLUNDER_SPAN_KM,
  CONTINENTS,
  EARTH_KM,
  HORIZON,
  MAP_H,
  MAP_W,
  MAX_POINTS,
  PLACES,
  ROUNDS,
  SCENE_H,
  SCENE_W,
  ZERO_KM,
  allIn,
  bestKm,
  botError,
  botFill,
  botGuess,
  closeRound,
  deal,
  destination,
  formatKm,
  group,
  guessProblem,
  hashSeed,
  haversine,
  isLegalGuess,
  isOver,
  matchWinner,
  nextRound,
  normalise,
  onEarth,
  roadEdges,
  roundTable,
  scene,
  sceneFor,
  scoreFor,
  standings,
  submitGuess,
  toLatLon,
  toXY,
  waitingOn,
  wrapLon,
  xpFor,
  type GeoState,
  type Place,
} from './geoGuesser';

const DIFFS: Difficulty[] = ['Easy', 'Normal', 'Sharp'];
const byId = (id: string) => PLACES.find((p) => p.id === id) as Place;

/** Play a whole match with every seat filled by a bot. */
function autoMatch(seats: number, bot: BotProfile, rng: Rng, rounds = ROUNDS): GeoState {
  let s = deal(seats, rounds, rng);
  for (;;) {
    s = botFill(s, bot, rng);
    s = closeRound(s);
    s = nextRound(s);
    if (s.phase === 'over') return s;
  }
}

// ── the dataset ───────────────────────────────────────────────────

describe('the world', () => {
  it('carries at least twenty real places with unique ids', () => {
    expect(PLACES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(PLACES.map((p) => p.id)).size).toBe(PLACES.length);
  });

  it('gives every place a plottable coordinate', () => {
    for (const p of PLACES) {
      expect(onEarth(p)).toBe(true);
      expect(Math.abs(p.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(p.lon)).toBeLessThanOrEqual(180);
      // Nothing sitting at a rounded-off (0, 0).
      expect(Math.abs(p.lat) + Math.abs(p.lon)).toBeGreaterThan(1);
    }
  });

  it('gives every place a full cue set and a reveal line', () => {
    for (const p of PLACES) {
      expect(p.name.length).toBeGreaterThan(1);
      expect(p.country.length).toBeGreaterThan(1);
      expect(p.region.length).toBeGreaterThan(1);
      expect(p.sign.trim().length).toBeGreaterThan(0);
      expect(p.tell.length).toBeGreaterThan(20);
      expect(['left', 'right']).toContain(p.drive);
    }
  });

  it('never repeats a whole cue set, so no two scenes are the same puzzle', () => {
    const keys = PLACES.map((p) =>
      [p.climate, p.terrain, p.vegetation, p.architecture, p.script, p.drive, p.sign].join('|'),
    );
    expect(new Set(keys).size).toBe(PLACES.length);
  });

  it('spreads across both hemispheres and every continent-ish longitude band', () => {
    expect(PLACES.some((p) => p.lat > 40)).toBe(true);
    expect(PLACES.some((p) => p.lat < -20)).toBe(true);
    expect(PLACES.some((p) => p.lon < -60)).toBe(true);
    expect(PLACES.some((p) => p.lon > 100)).toBe(true);
    // Every terrain, vegetation and architecture is actually drawn somewhere.
    for (const k of ['mountains', 'dunes', 'flat', 'coast']) expect(PLACES.some((p) => p.terrain === k)).toBe(true);
    for (const k of ['palms', 'pines', 'scrub', 'none']) expect(PLACES.some((p) => p.vegetation === k)).toBe(true);
    for (const k of ['lowrise', 'pagoda', 'adobe', 'glass']) expect(PLACES.some((p) => p.architecture === k)).toBe(true);
  });

  it('draws a world map with real coastlines in map space', () => {
    expect(CONTINENTS.length).toBeGreaterThanOrEqual(10);
    for (const c of CONTINENTS) {
      expect(c.d.startsWith('M')).toBe(true);
      const nums = c.d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
      expect(nums.length).toBeGreaterThan(6);
      for (let i = 0; i < nums.length; i += 2) {
        expect(nums[i]).toBeGreaterThanOrEqual(0);
        expect(nums[i]).toBeLessThanOrEqual(MAP_W);
        expect(nums[i + 1]).toBeGreaterThanOrEqual(0);
        expect(nums[i + 1]).toBeLessThanOrEqual(MAP_H);
      }
    }
  });
});

// ── geometry ──────────────────────────────────────────────────────

describe('haversine', () => {
  it('is zero for a point against itself', () => {
    for (const p of PLACES) expect(haversine(p, p)).toBeCloseTo(0, 6);
  });

  it('matches known great-circle distances', () => {
    const london = { lat: 51.5074, lon: -0.1278 };
    const paris = { lat: 48.8566, lon: 2.3522 };
    expect(haversine(london, paris)).toBeGreaterThan(330);
    expect(haversine(london, paris)).toBeLessThan(355);

    // A quarter of the equator, and pole to pole.
    expect(haversine({ lat: 0, lon: 0 }, { lat: 0, lon: 90 })).toBeCloseTo((EARTH_KM * Math.PI) / 2, 3);
    expect(haversine({ lat: 90, lon: 0 }, { lat: -90, lon: 0 })).toBeCloseTo(EARTH_KM * Math.PI, 3);
  });

  it('is symmetric and never exceeds half the circumference', () => {
    const rng = makeRng(9);
    for (let i = 0; i < 300; i++) {
      const a = { lat: rng() * 180 - 90, lon: rng() * 360 - 180 };
      const b = { lat: rng() * 180 - 90, lon: rng() * 360 - 180 };
      expect(haversine(a, b)).toBeCloseTo(haversine(b, a), 9);
      expect(haversine(a, b)).toBeLessThanOrEqual(EARTH_KM * Math.PI + 1e-6);
    }
  });

  it('crosses the antimeridian the short way', () => {
    expect(haversine({ lat: 0, lon: 179 }, { lat: 0, lon: -179 })).toBeLessThan(230);
  });
});

describe('destination', () => {
  it('lands the requested distance away, on any bearing', () => {
    const rng = makeRng(4);
    for (const p of PLACES) {
      for (let i = 0; i < 8; i++) {
        const km = 50 + rng() * 4000;
        const to = destination(p, rng() * 360, km);
        expect(onEarth(to)).toBe(true);
        // Pins are stored to four decimals, so allow the ~11 m that costs.
        expect(haversine(p, to)).toBeCloseTo(km, 1);
      }
    }
  });

  it('normalises what it returns', () => {
    const to = destination({ lat: 0, lon: 179.5 }, 90, 500);
    expect(to.lon).toBeGreaterThanOrEqual(-180);
    expect(to.lon).toBeLessThan(180);
  });
});

describe('coordinate helpers', () => {
  it('wraps longitude into a single turn', () => {
    expect(wrapLon(190)).toBeCloseTo(-170, 9);
    expect(wrapLon(-190)).toBeCloseTo(170, 9);
    expect(wrapLon(540)).toBeCloseTo(180 - 360, 9);
    expect(wrapLon(0)).toBe(0);
    expect(wrapLon(-0)).toBe(0);
  });

  it('clamps latitude rather than folding it over the pole', () => {
    expect(normalise({ lat: 120, lon: 10 }).lat).toBe(90);
    expect(normalise({ lat: -120, lon: 10 }).lat).toBe(-90);
  });

  it('rejects anything that is not a point on the globe', () => {
    expect(onEarth({ lat: 91, lon: 0 })).toBe(false);
    expect(onEarth({ lat: 0, lon: 181 })).toBe(false);
    expect(onEarth({ lat: NaN, lon: 0 })).toBe(false);
    expect(onEarth({ lat: 0, lon: Infinity })).toBe(false);
    expect(onEarth({ lat: 0, lon: 0 })).toBe(true);
  });

  it('round-trips every place through the equirectangular projection', () => {
    for (const p of PLACES) {
      const { x, y } = toXY(p);
      const back = toLatLon(x, y);
      expect(back.lat).toBeCloseTo(p.lat, 3);
      expect(back.lon).toBeCloseTo(p.lon, 3);
    }
  });

  it('puts the corners of the map where you would expect', () => {
    expect(toXY({ lat: 90, lon: -180 })).toEqual({ x: 0, y: 0 });
    expect(toXY({ lat: -90, lon: 179.9999 }).y).toBe(MAP_H);
    expect(toXY({ lat: -90, lon: 179.9999 }).x).toBeCloseTo(MAP_W, 3);
    // 180° East is the same meridian as 180° West, and lands on the left edge.
    expect(toXY({ lat: 0, lon: 180 }).x).toBe(0);
    expect(toLatLon(0, 0)).toEqual({ lat: 90, lon: -180 });
    expect(toLatLon(MAP_W / 2, MAP_H / 2)).toEqual({ lat: 0, lon: 0 });
  });

  it('scales a tap on a rendered map of any size', () => {
    const w = 362;
    const h = 181;
    const p = byId('kyoto');
    const { x, y } = toXY(p, w, h);
    const back = toLatLon(x, y, w, h);
    expect(haversine(back, p)).toBeLessThan(1);
  });

  it('clamps a tap that lands off the edge of the map', () => {
    expect(onEarth(toLatLon(-40, -40))).toBe(true);
    expect(onEarth(toLatLon(MAP_W + 90, MAP_H + 90))).toBe(true);
    expect(toLatLon(-40, -40)).toEqual({ lat: 90, lon: -180 });
  });
});

// ── the scoring curve ─────────────────────────────────────────────

describe('scoring', () => {
  it('pays the maximum for a perfect pin and nothing past the cut-off', () => {
    expect(scoreFor(0)).toBe(MAX_POINTS);
    expect(scoreFor(ZERO_KM)).toBe(0);
    expect(scoreFor(ZERO_KM + 1)).toBe(0);
    expect(scoreFor(19000)).toBe(0);
  });

  it('decays monotonically across the whole range', () => {
    let last = Infinity;
    for (let km = 0; km <= 6000; km += 25) {
      const v = scoreFor(km);
      expect(v).toBeLessThanOrEqual(last);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(MAX_POINTS);
      last = v;
    }
  });

  it('lands on the intended curve', () => {
    expect(scoreFor(100)).toBeGreaterThan(4500);
    expect(scoreFor(500)).toBeGreaterThan(3300);
    expect(scoreFor(500)).toBeLessThan(3700);
    expect(scoreFor(1000)).toBeGreaterThan(2200);
    expect(scoreFor(1000)).toBeLessThan(2700);
    expect(scoreFor(3000)).toBeLessThan(700);
    expect(scoreFor(3000)).toBeGreaterThan(300);
  });

  it('formats distances and points for the reveal', () => {
    expect(group(1234567)).toBe('1,234,567');
    expect(group(999)).toBe('999');
    expect(formatKm(4.25)).toBe('4.3 km');
    expect(formatKm(1234)).toBe('1,234 km');
    expect(xpFor(15000)).toBe(600);
  });
});

// ── legality ──────────────────────────────────────────────────────

describe('legal and illegal guesses', () => {
  const fresh = () => deal(4, ROUNDS, makeRng(11));

  it('accepts a pin anywhere on the globe', () => {
    const s = fresh();
    for (const at of [
      { lat: 0, lon: 0 },
      { lat: 90, lon: 180 },
      { lat: -90, lon: -180 },
      { lat: 51.5, lon: -0.13 },
    ]) {
      expect(isLegalGuess(s, 0, at)).toBe(true);
      expect(guessProblem(s, 0, at)).toBeNull();
    }
  });

  it('rejects a point that is not on the globe', () => {
    const s = fresh();
    expect(guessProblem(s, 0, { lat: 91, lon: 0 })).toBe('off-globe');
    expect(guessProblem(s, 0, { lat: 0, lon: -181 })).toBe('off-globe');
    expect(guessProblem(s, 0, { lat: NaN, lon: 0 })).toBe('off-globe');
    expect(() => submitGuess(s, 0, { lat: 200, lon: 0 })).toThrow();
  });

  it('rejects a seat that is not at the table', () => {
    const s = fresh();
    expect(guessProblem(s, -1, { lat: 0, lon: 0 })).toBe('off-table');
    expect(guessProblem(s, 4, { lat: 0, lon: 0 })).toBe('off-table');
    expect(guessProblem(s, 1.5, { lat: 0, lon: 0 })).toBe('off-table');
    expect(() => submitGuess(s, 9, { lat: 0, lon: 0 })).toThrow();
  });

  it('rejects a second pin from the same seat in one round', () => {
    const s = submitGuess(fresh(), 2, { lat: 10, lon: 10 });
    expect(guessProblem(s, 2, { lat: 20, lon: 20 })).toBe('already-guessed');
    expect(() => submitGuess(s, 2, { lat: 20, lon: 20 })).toThrow();
    // …but the other seats are still free to guess.
    expect(isLegalGuess(s, 3, { lat: 20, lon: 20 })).toBe(true);
  });

  it('rejects a pin once the round is closed', () => {
    let s = fresh();
    for (let seat = 0; seat < s.seats; seat++) s = submitGuess(s, seat, { lat: seat, lon: seat });
    s = closeRound(s);
    expect(s.phase).toBe('reveal');
    expect(guessProblem(s, 0, { lat: 0, lon: 0 })).toBe('not-guessing');
    expect(() => submitGuess(s, 0, { lat: 0, lon: 0 })).toThrow();
  });

  it('never mutates the state it is handed', () => {
    const s = fresh();
    const before = JSON.stringify(s);
    const after = submitGuess(s, 1, { lat: 5, lon: 5 });
    expect(JSON.stringify(s)).toBe(before);
    expect(after).not.toBe(s);
    expect(after.guesses[0][1]).toEqual({ lat: 5, lon: 5 });
    expect(s.guesses[0][1]).toBeNull();
  });

  it('normalises the pin it stores', () => {
    const s = submitGuess(deal(2, ROUNDS, makeRng(3)), 0, { lat: 12.123456789, lon: -0.000001 });
    expect(s.guesses[0][0]).toEqual({ lat: 12.1235, lon: 0 });
  });

  it('refuses to deal a table or a schedule that cannot be played', () => {
    expect(() => deal(1, 3, makeRng(1))).toThrow();
    expect(() => deal(4, 0, makeRng(1))).toThrow();
    expect(() => deal(4, PLACES.length + 1, makeRng(1))).toThrow();
  });

  it('refuses to close a round nobody has finished, or advance one that is live', () => {
    const s = deal(3, ROUNDS, makeRng(5));
    expect(() => closeRound(s)).toThrow();
    expect(() => nextRound(s)).toThrow();
    expect(() => closeRound(submitGuess(s, 0, { lat: 0, lon: 0 }))).toThrow();
  });
});

// ── the round rule ────────────────────────────────────────────────

describe('closest guess takes the round', () => {
  it('awards the round to the nearest pin and scores by the curve', () => {
    let s = deal(3, ROUNDS, makeRng(21));
    const target = s.places[0];
    const near = destination(target, 30, 120);
    const mid = destination(target, 200, 900);
    const far = destination(target, 300, 4200);

    s = submitGuess(s, 0, mid);
    s = submitGuess(s, 1, far);
    s = submitGuess(s, 2, near);
    expect(allIn(s)).toBe(true);
    s = closeRound(s);

    expect(s.winners[0]).toBe(2);
    expect(s.km[0][2]).toBeCloseTo(120, 2);
    expect(s.points[0][2]).toBe(scoreFor(s.km[0][2]));
    expect(s.points[0][2]).toBeGreaterThan(s.points[0][0]);
    expect(s.points[0][0]).toBeGreaterThan(s.points[0][1]);
    expect(s.totals[2]).toBe(s.points[0][2]);
  });

  it('gives a pin more than 5000 km out nothing at all', () => {
    let s = deal(2, ROUNDS, makeRng(22));
    s = submitGuess(s, 0, destination(s.places[0], 45, 60));
    s = submitGuess(s, 1, destination(s.places[0], 45, 9000));
    s = closeRound(s);
    expect(s.points[0][1]).toBe(0);
    expect(s.points[0][0]).toBeGreaterThan(4700);
    expect(s.winners[0]).toBe(0);
  });

  it('breaks a dead heat on distance by seat, so a round has exactly one winner', () => {
    let s = deal(3, ROUNDS, makeRng(23));
    const same = destination(s.places[0], 40, 500);
    for (let seat = 0; seat < 3; seat++) s = submitGuess(s, seat, same);
    s = closeRound(s);
    expect(new Set(s.km[0]).size).toBe(1);
    expect(new Set(s.points[0]).size).toBe(1);
    expect(s.winners[0]).toBe(0);
    expect(roundTable(s, 0).filter((r) => r.win)).toHaveLength(1);
  });

  it('reports the round nearest-first', () => {
    let s = deal(4, ROUNDS, makeRng(24));
    const p = s.places[0];
    [3000, 100, 2000, 700].forEach((km, seat) => {
      s = submitGuess(s, seat, destination(p, 60 * seat, km));
    });
    s = closeRound(s);
    const rows = roundTable(s, 0);
    expect(rows.map((r) => r.seat)).toEqual([1, 3, 2, 0]);
    for (let i = 1; i < rows.length; i++) expect(rows[i].km).toBeGreaterThanOrEqual(rows[i - 1].km);
    expect(rows[0].win).toBe(true);
  });

  it('tracks who is still to guess', () => {
    let s = deal(4, ROUNDS, makeRng(25));
    expect(waitingOn(s)).toEqual([0, 1, 2, 3]);
    s = submitGuess(s, 1, { lat: 0, lon: 0 });
    expect(waitingOn(s)).toEqual([0, 2, 3]);
    expect(allIn(s)).toBe(false);
  });
});

// ── a whole match ─────────────────────────────────────────────────

describe('a full match', () => {
  it('plays three rounds on three different places and ends exactly once', () => {
    const s = autoMatch(5, BOT.Normal, makeRng(31));
    expect(s.rounds).toBe(3);
    expect(new Set(s.places.map((p) => p.id)).size).toBe(3);
    expect(isOver(s)).toBe(true);
    expect(s.winners.every((w) => w !== null)).toBe(true);
    expect(() => nextRound(s)).toThrow();
  });

  it('declares exactly one match winner', () => {
    for (let seed = 0; seed < 40; seed++) {
      const s = autoMatch(5, BOT.Normal, makeRng(seed * 977 + 3));
      const table = standings(s);
      expect(table).toHaveLength(5);
      expect(table.filter((r) => r.rank === 1)).toHaveLength(1);
      expect(table.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
      expect(new Set(table.map((r) => r.seat)).size).toBe(5);
      expect(matchWinner(s)).toBe(table[0].seat);
    }
  });

  it('adds every round into the totals', () => {
    const s = autoMatch(4, BOT.Sharp, makeRng(32));
    for (let seat = 0; seat < s.seats; seat++) {
      const sum = s.points.reduce((a, r) => a + r[seat], 0);
      expect(s.totals[seat]).toBe(sum);
      expect(s.totals[seat]).toBeLessThanOrEqual(MAX_POINTS * s.rounds);
    }
    expect(s.winners.filter((w) => w !== null)).toHaveLength(3);
  });

  it('ranks on points, and only falls to the closest pin on a dead heat', () => {
    // Everybody misses the planet by more than 5000 km every round: all zeros,
    // so the tie-break has to decide it — and it must still be one winner.
    let s = deal(3, 2, makeRng(33));
    for (let r = 0; r < 2; r++) {
      const p = s.places[r];
      s = submitGuess(s, 0, destination(p, 10, 9000));
      s = submitGuess(s, 1, destination(p, 10, 7000));
      s = submitGuess(s, 2, destination(p, 10, 8000));
      s = closeRound(s);
      s = nextRound(s);
    }
    expect(s.totals).toEqual([0, 0, 0]);
    const table = standings(s);
    expect(table[0].seat).toBe(1);
    expect(table.filter((r) => r.rank === 1)).toHaveLength(1);
    expect(bestKm(s, 1)).toBeLessThan(bestKm(s, 0));
  });

  it('is reproducible from its seed and varied across seeds', () => {
    const a = autoMatch(4, BOT.Normal, makeRng(1234));
    const b = autoMatch(4, BOT.Normal, makeRng(1234));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));

    const c = autoMatch(4, BOT.Normal, makeRng(1235));
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a));

    const sets = new Set<string>();
    for (let seed = 0; seed < 30; seed++) {
      sets.add(deal(4, ROUNDS, makeRng(seed))
        .places.map((p) => p.id)
        .join(','));
    }
    expect(sets.size).toBeGreaterThan(10);
  });

  it('runs a two-player and an eight-player table just as happily', () => {
    for (const seats of [2, 8]) {
      const s = autoMatch(seats, BOT.Easy, makeRng(seats * 31));
      expect(s.seats).toBe(seats);
      expect(standings(s)).toHaveLength(seats);
      expect(isOver(s)).toBe(true);
    }
  });
});

// ── the bots ──────────────────────────────────────────────────────

describe('the bots', () => {
  it('returns a legal pin from every position that can be reached', () => {
    for (const d of DIFFS) {
      const bot = BOT[d];
      const rng = makeRng(hashSeed(d));
      for (const place of PLACES) {
        for (let i = 0; i < 12; i++) {
          const at = botGuess(place, bot, rng);
          expect(onEarth(at)).toBe(true);
          expect(Number.isFinite(at.lat) && Number.isFinite(at.lon)).toBe(true);
        }
      }
    }
  });

  it('is legal against every state a match can be in, whoever has already guessed', () => {
    for (const d of DIFFS) {
      const bot = BOT[d];
      const rng = makeRng(7);
      let s = deal(5, ROUNDS, rng);
      for (let round = 0; round < ROUNDS; round++) {
        // Fill the seats one at a time, checking the bot from each position.
        while (!allIn(s)) {
          for (const seat of waitingOn(s)) {
            expect(isLegalGuess(s, seat, botGuess(s.places[s.round], bot, rng))).toBe(true);
          }
          const seat = waitingOn(s)[0];
          s = submitGuess(s, seat, botGuess(s.places[s.round], bot, rng));
        }
        s = closeRound(s);
        // In the reveal nothing is legal, and the bot must not be asked.
        expect(isLegalGuess(s, 0, botGuess(s.places[s.round], bot, rng))).toBe(false);
        s = nextRound(s);
      }
      expect(isOver(s)).toBe(true);
    }
  });

  it('lands inside its own error radius when it does not blunder', () => {
    for (const d of DIFFS) {
      const steady: BotProfile = { ...BOT[d], blunder: 0 };
      const rng = makeRng(hashSeed(`steady-${d}`));
      for (const place of PLACES) {
        for (let i = 0; i < 10; i++) {
          const km = haversine(place, botGuess(place, steady, rng));
          expect(km).toBeLessThanOrEqual(botError(steady) + 1e-6);
        }
      }
    }
  });

  it('scales with skill — Sharp names the city, Easy names the region', () => {
    const mean = (d: Difficulty) => {
      const bot = BOT[d];
      const rng = makeRng(hashSeed(`mean-${d}`));
      let total = 0;
      let n = 0;
      for (const place of PLACES) {
        for (let i = 0; i < 40; i++) {
          total += haversine(place, botGuess(place, bot, rng));
          n++;
        }
      }
      return total / n;
    };
    const sharp = mean('Sharp');
    const normal = mean('Normal');
    const easy = mean('Easy');

    expect(sharp).toBeLessThan(normal);
    expect(normal).toBeLessThan(easy);
    // A Sharp bot is inside a few hundred km, an Easy bot inside a few thousand.
    expect(sharp).toBeLessThan(500);
    expect(easy).toBeGreaterThan(1000);
    expect(easy).toBeLessThan(4000);
    expect(botError(BOT.Sharp)).toBeLessThan(botError(BOT.Normal));
    expect(botError(BOT.Normal)).toBeLessThan(botError(BOT.Easy));
  });

  it('never lands further out than a blunder allows', () => {
    const rng = makeRng(55);
    for (const d of DIFFS) {
      for (const place of PLACES) {
        for (let i = 0; i < 6; i++) {
          const km = haversine(place, botGuess(place, BOT[d], rng));
          expect(km).toBeLessThanOrEqual(Math.max(botError(BOT[d]), BLUNDER_MIN_KM + BLUNDER_SPAN_KM) + 1e-6);
        }
      }
    }
  });

  it('beats a careless human but loses to a careful one', () => {
    // A player who pins the right city outscores a Sharp table; a player who
    // pins the wrong hemisphere does not.
    let careful = deal(2, ROUNDS, makeRng(61));
    let careless = deal(2, ROUNDS, makeRng(61));
    const rng = makeRng(62);
    for (let r = 0; r < ROUNDS; r++) {
      careful = submitGuess(careful, 0, destination(careful.places[r], 20, 25));
      careful = submitGuess(careful, 1, botGuess(careful.places[r], BOT.Sharp, rng));
      careful = nextRound(closeRound(careful));

      careless = submitGuess(careless, 0, destination(careless.places[r], 20, 8000));
      careless = submitGuess(careless, 1, botGuess(careless.places[r], BOT.Sharp, rng));
      careless = nextRound(closeRound(careless));
    }
    expect(matchWinner(careful)).toBe(0);
    expect(matchWinner(careless)).toBe(1);
  });

  it('fills only the seats that still owe a pin', () => {
    let s = deal(4, ROUNDS, makeRng(71));
    s = submitGuess(s, 2, { lat: 1, lon: 1 });
    const mine = s.guesses[0][2];
    s = botFill(s, BOT.Normal, makeRng(72));
    expect(allIn(s)).toBe(true);
    expect(s.guesses[0][2]).toEqual(mine);
  });
});

// ── the generated scene ───────────────────────────────────────────

describe('the generated scene', () => {
  it('is the same picture every time for a given place', () => {
    for (const p of PLACES) expect(JSON.stringify(sceneFor(p))).toBe(JSON.stringify(sceneFor(p)));
    expect(hashSeed('kyoto')).toBe(hashSeed('kyoto'));
    expect(hashSeed('kyoto')).not.toBe(hashSeed('seoul'));
  });

  it('is reproducible from a seed and differs between places', () => {
    const a = scene(byId('cairo'), makeRng(5));
    const b = scene(byId('cairo'), makeRng(5));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(sceneFor(byId('cairo')))).not.toBe(JSON.stringify(sceneFor(byId('kyoto'))));
  });

  it('draws the cues it is given, not decoration', () => {
    for (const p of PLACES) {
      const sc = sceneFor(p);
      // Climate drives the palette.
      expect(sc.sky).toEqual(expect.arrayContaining([expect.stringMatching(/^#/)]));
      // Vegetation drives the greenery.
      if (p.vegetation === 'none') expect(sc.plants).toHaveLength(0);
      else {
        expect(sc.plants.length).toBeGreaterThan(2);
        expect(sc.plants.every((pl) => pl.kind === p.vegetation)).toBe(true);
      }
      // Architecture drives the skyline.
      expect(sc.buildings.length).toBeGreaterThan(1);
      expect(sc.buildings.every((b) => b.kind === p.architecture)).toBe(true);
      // Terrain drives the water.
      expect(sc.water === null).toBe(p.terrain !== 'coast');
      // The sign carries the local word, in the local script, on the local side.
      expect(sc.sign.text).toBe(p.sign);
      expect(sc.sign.script).toBe(p.script);
      expect(sc.drive).toBe(p.drive);
    }
  });

  it('puts the sign on the side they drive on', () => {
    for (const p of PLACES) {
      const sc = sceneFor(p);
      if (p.drive === 'left') expect(sc.sign.postX).toBeLessThan(SCENE_W / 2);
      else expect(sc.sign.postX).toBeGreaterThan(SCENE_W / 2);
    }
  });

  it('makes mountains taller than plains', () => {
    const topOf = (d: string) => Math.min(...(d.match(/,(-?\d+(\.\d+)?)/g) ?? []).map((m) => Number(m.slice(1))));
    const alps = topOf(sceneFor(byId('kathmandu')).ridgeFar);
    const polder = topOf(sceneFor(byId('amsterdam')).ridgeFar);
    expect(alps).toBeLessThan(polder - 20);
    expect(alps).toBeLessThan(HORIZON);
  });

  it('keeps every drawn element inside the frame and out of the road', () => {
    for (const p of PLACES) {
      const sc = sceneFor(p);
      expect(sc.sign.x).toBeGreaterThanOrEqual(0);
      expect(sc.sign.x + sc.sign.w).toBeLessThanOrEqual(SCENE_W);
      expect(sc.sign.y + sc.sign.h).toBeLessThan(SCENE_H);
      for (const b of sc.buildings) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(SCENE_W);
        expect(b.h).toBeGreaterThan(0);
      }
      for (const pl of sc.plants) {
        expect(pl.x).toBeGreaterThanOrEqual(0);
        expect(pl.x).toBeLessThanOrEqual(SCENE_W);
        expect(pl.y).toBeGreaterThan(HORIZON);
        expect(pl.y).toBeLessThan(SCENE_H);
        const [lo, hi] = roadEdges(pl.y);
        expect(pl.x < lo || pl.x > hi).toBe(true);
      }
    }
  });

  it('narrows the road towards the horizon', () => {
    const [nearLo, nearHi] = roadEdges(SCENE_H);
    const [farLo, farHi] = roadEdges(HORIZON);
    expect(farHi - farLo).toBeLessThan(nearHi - nearLo);
    expect(roadEdges(-100)).toEqual(roadEdges(HORIZON));
  });
});

describe('toLatLon robustness', () => {
  it('never returns a non-finite point, whatever the tap carries', () => {
    for (const bad of [NaN, Infinity, -Infinity, undefined as unknown as number]) {
      const a = toLatLon(bad, 50);
      const b = toLatLon(50, bad);
      expect(Number.isFinite(a.lat) && Number.isFinite(a.lon)).toBe(true);
      expect(Number.isFinite(b.lat) && Number.isFinite(b.lon)).toBe(true);
    }
  });
});
