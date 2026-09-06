/**
 * Scores and the leaderboard, over Firestore.
 *
 * Finishing a shared match writes two things:
 *
 *   matches/{id}/scores/{uid}   your claim about that match, create-only
 *   users/{uid}.xp              your running total, which is what the board reads
 *
 * The claim exists so the total is checkable. A board where the only artefact is
 * a number somebody wrote about themselves is a board nobody can dispute; with
 * the claim sitting in the match beside the move log that produced it, anyone
 * can replay the log and see whether the claim is true. That does not make
 * cheating impossible — without a server nothing does — it makes it visible,
 * which among people who know each other is the part that matters.
 *
 * Create-only on the score is what stops a match being banked twice. Rejoining
 * a finished game, or a retried write, lands on the same document and is
 * refused; the total moves once per match per player, or not at all.
 */

import { commit, getDoc, isConflict, mergeDoc, runQuery, type Ctx } from './firestore';
import type { Json } from './values';
import { levelFor, type Outcome, type Score } from '../social/scores';

export const scorePath = (match: string, uid: string) => `matches/${match}/scores/${uid}`;

/** How many rows the board shows. Enough to scroll, few enough to be one read. */
export const BOARD_SIZE = 50;

const num = (v: Json | undefined, or = 0) => (typeof v === 'number' ? v : or);
const str = (v: Json | undefined, or = '') => (typeof v === 'string' ? v : or);

export class AlreadyBanked extends Error {
  constructor() {
    super('That match has already been counted.');
    this.name = 'AlreadyBanked';
  }
}

/**
 * Bank one finished match.
 *
 * The claim is written first and the total second, deliberately. If the second
 * write fails the claim is still there to reconcile from, whereas a total moved
 * without a claim behind it is exactly the unaccountable number this design is
 * trying not to have.
 */
export async function recordScore(ctx: Ctx, score: Score): Promise<number> {
  try {
    await commit(ctx, [
      {
        path: scorePath(score.match, score.uid),
        ifMissing: true,
        data: {
          uid: score.uid,
          match: score.match,
          game: score.game,
          outcome: score.outcome,
          xp: score.xp,
          at: score.at,
        },
      },
    ]);
  } catch (e) {
    // Already banked. Not an error worth showing anyone — the match counted
    // the first time.
    if (isConflict(e)) throw new AlreadyBanked();
    throw e;
  }

  // Read-then-add rather than an atomic increment: Firestore's REST transform
  // for that is a different request shape, and this runs once at the end of a
  // match by the one person it concerns. A lost update needs them to finish two
  // matches in the same second on two devices.
  const me = await getDoc(ctx, `users/${score.uid}`);
  const total = num(me?.data.xp) + score.xp;
  await mergeDoc(ctx, `users/${score.uid}`, { xp: total, level: levelFor(total) });
  return total;
}

export interface BoardPerson {
  uid: string;
  name: string;
  handle: string;
  mark: string;
  gi: number;
  xp: number;
}

const personFrom = (d: { id: string; data: Record<string, Json> }): BoardPerson => ({
  uid: d.id,
  name: str(d.data.name),
  handle: str(d.data.handle),
  mark: str(d.data.mark, '◆'),
  gi: num(d.data.gi),
  xp: num(d.data.xp),
});

/**
 * The top of the board.
 *
 * Ordered by the server so the page is the actual top rather than the top of
 * whatever fifty documents came back first.
 */
export async function topPlayers(ctx: Ctx, limit = BOARD_SIZE): Promise<BoardPerson[]> {
  const rows = await runQuery(ctx, 'users', {
    orderBy: [{ field: 'xp', desc: true }],
    limit,
  });
  return rows.map(personFrom);
}

/**
 * Your own standing, when you are not in the page above.
 *
 * Ranking against the top fifty would tell somebody in two hundredth place that
 * they are fifty-first, which is worse than saying nothing. This counts how many
 * people are genuinely ahead instead.
 */
export async function placeOf(ctx: Ctx, xp: number): Promise<number> {
  const ahead = await runQuery(ctx, 'users', {
    where: [{ field: 'xp', op: 'GREATER_THAN', value: xp }],
    orderBy: [{ field: 'xp', desc: true }],
    // Counting is not something the REST API does, so this is bounded: past
    // this many the exact number stops being interesting anyway.
    limit: 500,
  });
  return ahead.length + 1;
}

/** Everyone you have played with, for the Friends scope. */
export async function playersByUid(ctx: Ctx, uids: string[]): Promise<BoardPerson[]> {
  const wanted = [...new Set(uids)].filter(Boolean);
  const out: BoardPerson[] = [];
  // The IN filter caps at 30 values.
  for (let i = 0; i < wanted.length; i += 30) {
    const batch = wanted.slice(i, i + 30);
    const rows = await runQuery(ctx, 'users', {
      where: [{ field: '__name__', op: 'IN', value: batch.map((u) => `users/${u}`) }],
    });
    out.push(...rows.map(personFrom));
  }
  return out;
}

/** Whether this match has already been banked by this player. */
export async function alreadyBanked(ctx: Ctx, match: string, uid: string): Promise<boolean> {
  return (await getDoc(ctx, scorePath(match, uid))) !== null;
}

/** Both players' claims about one match, for comparing against the log. */
export async function claimsFor(ctx: Ctx, match: string): Promise<Score[]> {
  const rows = await runQuery(ctx, `matches/${match}/scores`);
  return rows.map((d) => ({
    uid: str(d.data.uid, d.id),
    match: str(d.data.match, match),
    game: str(d.data.game),
    outcome: str(d.data.outcome, 'lost') as Outcome,
    xp: num(d.data.xp),
    at: num(d.data.at),
  }));
}
