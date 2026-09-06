/**
 * The friend system, on top of Firestore.
 *
 * Three collections, and the shapes are chosen so the security rules can be
 * short — a rule you cannot read is a rule you cannot trust:
 *
 *   users/{uid}        public profile: handle, display name, mark, level.
 *                      World-readable, writable only by its owner.
 *   handles/{handle}   `{ uid }`. Exists purely so a handle can be claimed
 *                      atomically; the document id *is* the uniqueness
 *                      constraint, which Firestore has no other way to express.
 *   edges/{a_b}        one relationship, both uids sorted into the id.
 *                      Readable and writable by either member — see cycle.ts.
 *
 * Every write that could race carries a precondition, so two phones acting at
 * once produce a conflict this module retries rather than a silent overwrite.
 */

import {
  commit,
  getDoc,
  isConflict,
  runQuery,
  setDoc,
  type Ctx,
  type Doc,
} from '../net/firestore';
import type { Json } from '../net/values';
import {
  next,
  pairId,
  parseEdge,
  reconcileCrossedRequests,
  satisfied,
  viewFor,
  type Action,
  type Edge,
  type View,
} from './cycle';

export interface Profile {
  uid: string;
  /** Lowercased, unique, what people search by. */
  handle: string;
  name: string;
  mark: string;
  /** Index into the avatar gradient palette. */
  gi: number;
  level: number;
  lastSeen: number;
}

export class HandleTaken extends Error {
  constructor(public handle: string) {
    super(`@${handle} is taken`);
    this.name = 'HandleTaken';
  }
}

export class HandleInvalid extends Error {
  constructor(public problem: string) {
    super(problem);
    this.name = 'HandleInvalid';
  }
}

/**
 * The highest code point that still sorts below any ordinary character, which
 * is how Firestore expresses "starts with" — there is no LIKE, so a prefix is
 * the range from the prefix itself up to the prefix plus this.
 */
export const HIGH_CODE_POINT = '\uf8ff';

/**
 * What a handle may contain.
 *
 * Lowercase because search has to be case-insensitive and Firestore compares
 * strings byte-wise — storing one canonical form is far simpler than a second
 * lowercased index field. Three characters is the floor because a one-character
 * handle makes prefix search return most of the database.
 */
export const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

export const normaliseHandle = (raw: string): string => raw.trim().toLowerCase().replace(/^@/, '');

export function handleProblem(raw: string): string | null {
  const h = normaliseHandle(raw);
  if (!h) return 'Pick a username.';
  if (h.length < 3) return 'At least 3 characters.';
  if (h.length > 20) return 'At most 20 characters.';
  if (!HANDLE_RE.test(h)) return 'Letters, numbers and underscores only.';
  return null;
}

const profileFrom = (d: Doc): Profile => ({
  uid: d.id,
  handle: str(d.data.handle),
  name: str(d.data.name),
  mark: str(d.data.mark) || '◆',
  gi: num(d.data.gi),
  level: num(d.data.level),
  lastSeen: num(d.data.lastSeen),
});

const str = (v: Json | undefined) => (typeof v === 'string' ? v : '');
const num = (v: Json | undefined) => (typeof v === 'number' ? v : 0);

// ── the directory ─────────────────────────────────────────────────

/**
 * Claim a handle and publish the profile, or fail if someone else has it.
 *
 * The claim is a create-only write on `handles/{handle}`: Firestore refuses it
 * when the document already exists, so the race between two people typing the
 * same name resolves at the database rather than in a check-then-write that
 * both pass. Re-claiming your own handle is a no-op rather than an error, so
 * saving a profile twice does not lock you out of your own name.
 */
export async function claimHandle(ctx: Ctx, uid: string, raw: string): Promise<string> {
  const handle = normaliseHandle(raw);
  const problem = handleProblem(handle);
  if (problem) throw new HandleInvalid(problem);

  const existing = await getDoc(ctx, `handles/${handle}`);
  if (existing) {
    if (str(existing.data.uid) === uid) return handle;
    throw new HandleTaken(handle);
  }

  try {
    await commit(ctx, [{ path: `handles/${handle}`, data: { uid }, ifMissing: true }]);
  } catch (e) {
    // Someone claimed it between the read and the write. That is exactly what
    // the precondition is for.
    if (isConflict(e)) throw new HandleTaken(handle);
    throw e;
  }
  return handle;
}

export async function publishProfile(ctx: Ctx, p: Profile): Promise<void> {
  await setDoc(ctx, `users/${p.uid}`, {
    handle: p.handle,
    name: p.name,
    mark: p.mark,
    gi: p.gi,
    level: p.level,
    lastSeen: p.lastSeen,
  });
}

export async function getProfile(ctx: Ctx, uid: string): Promise<Profile | null> {
  const d = await getDoc(ctx, `users/${uid}`);
  return d ? profileFrom(d) : null;
}

export async function getProfiles(ctx: Ctx, uids: string[]): Promise<Map<string, Profile>> {
  const out = new Map<string, Profile>();
  // Firestore's IN filter caps at 30 values, and a friends list can exceed that.
  for (const batch of chunk([...new Set(uids)].filter(Boolean), 30)) {
    const rows = await runQuery(ctx, 'users', {
      where: [{ field: '__name__', op: 'IN', value: batch.map((u) => `users/${u}`) }],
    });
    for (const d of rows) out.set(d.id, profileFrom(d));
  }
  return out;
}

const chunk = <T,>(xs: T[], n: number): T[][] =>
  xs.length ? Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n)) : [];

/**
 * Handle prefix search.
 *
 * Firestore has no LIKE, so a prefix is expressed as a range: everything at or
 * after the prefix, and before the prefix plus `HIGH_CODE_POINT`. This is the
 * documented idiom, and the reason handles are stored already lowercased — the
 * comparison is byte-wise, so searching case-insensitively any other way would
 * mean carrying a second lowercased copy of the field purely to sort on.
 */
export async function searchByHandle(ctx: Ctx, raw: string, limit = 20): Promise<Profile[]> {
  const prefix = normaliseHandle(raw);
  if (prefix.length < 2) return [];
  const rows = await runQuery(ctx, 'users', {
    where: [
      { field: 'handle', op: 'GREATER_THAN_OR_EQUAL', value: prefix },
      { field: 'handle', op: 'LESS_THAN', value: prefix + HIGH_CODE_POINT },
    ],
    orderBy: [{ field: 'handle' }],
    limit,
  });
  return rows.map(profileFrom);
}

// ── relationships ─────────────────────────────────────────────────

const edgePath = (a: string, b: string) => `edges/${pairId(a, b)}`;

/** The relationship document, with its version stamp for a guarded write. */
async function readEdge(ctx: Ctx, me: string, them: string): Promise<{ edge: Edge | null; at?: string }> {
  const d = await getDoc(ctx, edgePath(me, them));
  return { edge: d ? parseEdge(d.data) : null, at: d?.updateTime };
}

export async function viewOf(ctx: Ctx, me: string, them: string): Promise<View> {
  return viewFor(me, (await readEdge(ctx, me, them)).edge);
}

/**
 * Everything `me` is involved in, one query.
 *
 * `pair` is an array containing both uids precisely so this can be a single
 * `array-contains` rather than two queries unioned on the client.
 */
export async function myEdges(ctx: Ctx, me: string): Promise<Edge[]> {
  const rows = await runQuery(ctx, 'edges', {
    where: [{ field: 'pair', op: 'ARRAY_CONTAINS', value: me }],
  });
  return rows.map((d) => parseEdge(d.data)).filter((e): e is Edge => e !== null);
}

/** How many incoming requests are waiting — the number on the inbox badge. */
export const pendingFor = (me: string, edges: Edge[]): Edge[] =>
  edges.filter((e) => viewFor(me, e) === 'incoming');

export const friendsIn = (me: string, edges: Edge[]): Edge[] =>
  edges.filter((e) => viewFor(me, e) === 'friends');

/**
 * Apply one action, retrying once if the other side moved first.
 *
 * The read decides what the next state should be, so a write that lands after
 * someone else's has been decided against a document that no longer exists.
 * The precondition turns that into a conflict, and the retry re-reads and
 * decides again — which is usually the right answer, because the second look
 * sees what they did.
 *
 * `request` gets one extra case: if they requested you while you were
 * requesting them, both taps meant "be friends", and that is what happens
 * rather than two outgoing requests neither can accept.
 */
export async function act(
  ctx: Ctx,
  me: string,
  them: string,
  action: Action,
  now: number,
  attempt = 0,
): Promise<View> {
  const { edge, at } = await readEdge(ctx, me, them);

  // Already where this action was heading — a repeat tap, or a retry after the
  // other side got there first. Report it rather than failing something that
  // has, from the caller's point of view, worked.
  const nowView = viewFor(me, edge);
  if (satisfied(action, nowView)) return nowView;

  const crossed = action === 'request' ? reconcileCrossedRequests(me, them, edge, now) : null;
  const target = crossed ?? next(action, me, them, edge, now);

  // Guard on what we read: the stamp if it was there, "must not exist" if not.
  const guardOn = at ? { ifUnchanged: at } : { ifMissing: true };
  const path = edgePath(me, them);

  try {
    if (target === null) {
      // Nothing to delete, and nothing to race with.
      if (!at) return viewFor(me, null);
      await commit(ctx, [{ path, delete: true, ifUnchanged: at }]);
    } else {
      await commit(ctx, [
        { path, data: { pair: target.pair, state: target.state, by: target.by, at: target.at }, ...guardOn },
      ]);
    }
  } catch (e) {
    // One retry. A second conflict means someone is tapping faster than the
    // network, and failing loudly beats looping.
    if (isConflict(e) && attempt === 0) return act(ctx, me, them, action, now, 1);
    throw e;
  }

  return viewFor(me, target);
}
