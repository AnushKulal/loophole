import { describe, expect, it } from 'vitest';
import {
  barFor,
  commas,
  levelFor,
  podium,
  progressFor,
  rank,
  restOf,
  XP_DRAW,
  XP_LOSS,
  XP_WIN,
  xpFor,
  xpForLevel,
} from './scores';

const person = (uid: string, xp: number, handle = uid.toLowerCase()) => ({
  uid,
  name: uid,
  handle,
  mark: '▲',
  gi: 1,
  xp,
});

describe('the level curve', () => {
  it('starts everyone at level 1 with nothing', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(progressFor(0)).toMatchObject({ level: 1, into: 0 });
  });

  it('costs more for each level than the last', () => {
    // A flat cost makes the tenth level feel identical to the second.
    const cost = (l: number) => xpForLevel(l + 1) - xpForLevel(l);
    for (let l = 1; l < 30; l++) expect(cost(l + 1), `level ${l}`).toBeGreaterThan(cost(l));
  });

  it('is strictly increasing, so a level can never be reached twice', () => {
    for (let l = 1; l < 60; l++) expect(xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l));
  });

  it('places a total exactly at a boundary in the new level, not the old one', () => {
    const at5 = xpForLevel(5);
    expect(levelFor(at5)).toBe(5);
    expect(levelFor(at5 - 1)).toBe(4);
    expect(progressFor(at5).into).toBe(0);
  });

  it('reports progress inside the level, not overall', () => {
    const p = progressFor(xpForLevel(7) + 100);
    expect(p.level).toBe(7);
    expect(p.into).toBe(100);
    expect(p.pct).toBeCloseTo(100 / p.need);
  });

  it('never returns a fraction outside 0 to 1', () => {
    for (const xp of [0, 1, 299, 300, 5000, 250_000]) {
      const p = progressFor(xp);
      expect(p.pct, String(xp)).toBeGreaterThanOrEqual(0);
      expect(p.pct, String(xp)).toBeLessThanOrEqual(1);
    }
  });

  it('survives nonsense totals rather than rendering NaN', () => {
    for (const bad of [-100, NaN, undefined as never, null as never]) {
      const p = progressFor(bad);
      expect(p.level, String(bad)).toBe(1);
      expect(Number.isFinite(p.pct), String(bad)).toBe(true);
    }
  });
});

describe('what a match pays', () => {
  it('rewards winning most, but pays a loss', () => {
    // Nobody plays a second match on a board that only rewards winning.
    expect(xpFor('won')).toBe(XP_WIN);
    expect(xpFor('drew')).toBe(XP_DRAW);
    expect(xpFor('lost')).toBe(XP_LOSS);
    expect(XP_WIN).toBeGreaterThan(XP_DRAW);
    expect(XP_DRAW).toBeGreaterThan(XP_LOSS);
    expect(XP_LOSS).toBeGreaterThan(0);
  });

  it('takes several wins to make a level, so one match does not jump you two', () => {
    const early = xpForLevel(2) - xpForLevel(1);
    expect(early).toBeGreaterThan(XP_WIN);
  });
});

describe('rank', () => {
  it('sorts by XP, highest first, and places from one', () => {
    const { rows } = rank([person('a', 100), person('c', 900), person('b', 500)], 'a');
    expect(rows.map((r) => r.uid)).toEqual(['c', 'b', 'a']);
    expect(rows.map((r) => r.place)).toEqual([1, 2, 3]);
  });

  it('breaks a tie the same way every time', () => {
    // Two players on equal XP must not swap places between screen opens.
    const once = rank([person('x', 500, 'zed'), person('y', 500, 'amy')], 'x');
    const again = rank([person('y', 500, 'amy'), person('x', 500, 'zed')], 'x');
    expect(once.rows.map((r) => r.uid)).toEqual(again.rows.map((r) => r.uid));
    expect(once.rows[0].handle).toBe('amy');
  });

  it('finds your own row wherever it landed', () => {
    const { mine } = rank([person('a', 10), person('b', 900), person('c', 500)], 'a');
    expect(mine?.uid).toBe('a');
    expect(mine?.place).toBe(3);
    expect(mine?.me).toBe(true);
  });

  it('has no row of your own when you are not on the board', () => {
    expect(rank([person('a', 10)], 'stranger').mine).toBeNull();
  });

  it('derives each level from that player own total', () => {
    const { rows } = rank([person('a', xpForLevel(9))], 'a');
    expect(rows[0].level).toBe(9);
  });

  it('falls back to the handle when somebody set no display name', () => {
    const { rows } = rank([{ ...person('a', 1), name: '' }], 'a');
    expect(rows[0].name).toBe('@a');
  });

  it('is empty for an empty board', () => {
    expect(rank([], 'a')).toEqual({ rows: [], mine: null });
  });
});

describe('the podium', () => {
  const rows = rank(
    [person('a', 900), person('b', 800), person('c', 700), person('d', 600)],
    'd',
  ).rows;

  it('reads second, first, third — the lifted middle is the winner', () => {
    expect(podium(rows).map((r) => r.place)).toEqual([2, 1, 3]);
  });

  it('copes with fewer than three players rather than rendering a hole', () => {
    const two = rank([person('a', 900), person('b', 100)], 'a').rows;
    expect(podium(two).map((r) => r.place)).toEqual([2, 1]);
    const one = rank([person('a', 900)], 'a').rows;
    expect(podium(one).map((r) => r.place)).toEqual([1]);
    expect(podium([])).toEqual([]);
  });

  it('puts everybody else in the list below', () => {
    expect(restOf(rows).map((r) => r.place)).toEqual([4]);
  });
});

describe('presentation', () => {
  it('separates thousands, because the numbers get large', () => {
    expect(commas(12450)).toBe('12,450');
    expect(commas(0)).toBe('0');
    expect(commas(-5)).toBe('0');
  });

  it('gives every row a bar between 0 and 1', () => {
    const { rows } = rank([person('a', 0), person('b', 12_450)], 'a');
    for (const r of rows) {
      expect(barFor(r)).toBeGreaterThanOrEqual(0);
      expect(barFor(r)).toBeLessThanOrEqual(1);
    }
  });
});
