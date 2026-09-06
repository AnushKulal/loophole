/**
 * Levels, XP, and the board.
 *
 * Two decisions are worth stating plainly, because both are visible to anyone
 * who plays and neither is what a server-backed game would do.
 *
 * **Only shared matches score.** A global board fed by games against bots is
 * farmable in a minute — set the difficulty to Easy, win, repeat — and a
 * leaderboard everyone knows is farmable is furniture. Local games still award
 * the XP the results screen shows; it simply stays on that phone.
 *
 * **Scores are self-reported.** The security rules let you write your own
 * profile and nobody else's, and there is no server here to referee, so the
 * number on the board is the number its owner wrote. That is worth knowing
 * rather than hiding — but it is not unfalsifiable: the match's move log is
 * stored beside the claim, and replaying it says who actually won. Among people
 * who know each other, which is the only audience this app has, a claim that
 * can be checked is enough.
 */

/**
 * What a level costs, and why it is a curve rather than a constant.
 *
 * A flat cost makes the tenth level feel identical to the second, and the
 * numbers a player recognises — "1,200 to go" — stop meaning anything as the
 * total grows. Rising cost keeps each level roughly the same number of matches
 * while the totals still get impressively large.
 */
export const LEVEL_BASE = 300;
export const LEVEL_STEP = 50;

/** XP needed to *reach* `level`, counting from level 1 at zero. */
export function xpForLevel(level: number): number {
  const l = Math.max(1, Math.floor(level));
  // Sum of (BASE + STEP*(n-1)) for n = 1 .. l-1.
  const n = l - 1;
  return n * LEVEL_BASE + (LEVEL_STEP * n * (n - 1)) / 2;
}

export interface Progress {
  level: number;
  /** XP earned inside the current level. */
  into: number;
  /** XP the current level costs in total. */
  need: number;
  /** 0–1, for the bar. */
  pct: number;
}

/**
 * Where a total sits.
 *
 * Walks up rather than solving the quadratic: the arithmetic is exact, the loop
 * runs a few dozen times at most, and an off-by-one in a closed form would show
 * up as somebody's level flickering at a boundary.
 */
export function progressFor(xp: number): Progress {
  const total = Math.max(0, Math.floor(xp) || 0);
  let level = 1;
  while (xpForLevel(level + 1) <= total) level++;

  const floor = xpForLevel(level);
  const need = xpForLevel(level + 1) - floor;
  const into = total - floor;
  return { level, into, need, pct: need > 0 ? into / need : 0 };
}

export const levelFor = (xp: number): number => progressFor(xp).level;

/**
 * What a finished match is worth.
 *
 * A loss pays too. Nobody plays a second match on a board that only rewards
 * winning, and the gap is wide enough that winning is still the point.
 */
export const XP_WIN = 240;
export const XP_DRAW = 90;
export const XP_LOSS = 40;

export type Outcome = 'won' | 'lost' | 'drew';

export const xpFor = (outcome: Outcome): number =>
  outcome === 'won' ? XP_WIN : outcome === 'drew' ? XP_DRAW : XP_LOSS;

/** One player's claim about one match. The move log beside it is the evidence. */
export interface Score {
  uid: string;
  match: string;
  game: string;
  outcome: Outcome;
  xp: number;
  at: number;
}

// ── the board ─────────────────────────────────────────────────────

export interface BoardRow {
  uid: string;
  name: string;
  handle: string;
  mark: string;
  gi: number;
  xp: number;
  level: number;
  /** 1-based, after sorting. */
  place: number;
  /** True for the signed-in player's own row. */
  me: boolean;
}

export interface Ranked {
  rows: BoardRow[];
  /** Your own row, wherever it landed — including off the end of the page. */
  mine: BoardRow | null;
}

/**
 * Sort, place and find yourself.
 *
 * Ties break on handle rather than being left to the order the query happened
 * to return: two players on the same XP should not swap places every time the
 * screen is opened.
 */
export function rank(
  people: { uid: string; name: string; handle: string; mark: string; gi: number; xp: number }[],
  me: string,
): Ranked {
  const rows = people
    .slice()
    .sort((a, b) => (b.xp === a.xp ? a.handle.localeCompare(b.handle) : b.xp - a.xp))
    .map((p, i) => ({
      uid: p.uid,
      name: p.name || `@${p.handle}`,
      handle: p.handle,
      mark: p.mark || '◆',
      gi: p.gi,
      xp: p.xp,
      level: levelFor(p.xp),
      place: i + 1,
      me: p.uid === me,
    }));

  return { rows, mine: rows.find((r) => r.me) ?? null };
}

/** The podium reads 2nd, 1st, 3rd — the lifted middle is the winner. */
export function podium(rows: BoardRow[]): BoardRow[] {
  const [first, second, third] = rows;
  return [second, first, third].filter(Boolean);
}

/** Everyone below the podium. */
export const restOf = (rows: BoardRow[]): BoardRow[] => rows.slice(3);

/** How far along the current level a row is, for its bar. */
export const barFor = (row: BoardRow): number => progressFor(row.xp).pct;

/** "12,450" — the board's numbers are large enough to need separating. */
export const commas = (n: number): string => Math.max(0, Math.floor(n)).toLocaleString('en-US');
