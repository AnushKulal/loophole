/**
 * The friendship state machine.
 *
 * One relationship, one document, shared by both people. The alternative —
 * each user owning a private list of their own friends — needs two writes for
 * every transition and goes wrong the moment one of them lands and the other
 * does not: A thinks they are friends and B never hears about it. A single
 * document cannot disagree with itself.
 *
 * The document is keyed by the two uids sorted and joined, so both sides derive
 * the same id without needing to know who asked first. It stores the *canonical*
 * relationship — pending, friends, blocked, and who caused it — and each client
 * turns that into their own point of view. "Pending, sent by them" is an
 * incoming request to you and an outgoing one to them; it is one fact, read from
 * two sides, rather than two facts that can drift apart.
 *
 * Everything here is pure. The network layer in `net/` does the writing; this
 * module only decides what the next document should be, which is what makes the
 * awkward cases — both people requesting at once, acting on a stale screen —
 * testable without a server.
 */

/** The stored relationship. `by` is whoever caused the current state. */
export interface Edge {
  /** The two uids, sorted. Always length 2. */
  pair: [string, string];
  state: 'pending' | 'friends' | 'blocked';
  /** Who sent the request, or who did the blocking. */
  by: string;
  /** Epoch milliseconds, for sorting an inbox. */
  at: number;
}

/** How the relationship looks from one particular person's side. */
export type View = 'none' | 'outgoing' | 'incoming' | 'friends' | 'blocked' | 'blockedBy';

export type Action = 'request' | 'accept' | 'decline' | 'cancel' | 'remove' | 'block' | 'unblock';

export class CycleError extends Error {
  constructor(
    public reason: string,
    message: string,
  ) {
    super(message);
    this.name = 'CycleError';
  }
}

/**
 * The document id for a relationship.
 *
 * Sorted so that both people compute the same one. Uids are Firebase's, which
 * are alphanumeric, so a `_` separator cannot collide with the contents.
 */
export function pairId(a: string, b: string): string {
  if (!a || !b) throw new CycleError('empty-uid', 'A relationship needs two accounts.');
  if (a === b) throw new CycleError('self', 'You cannot add yourself.');
  return [a, b].sort().join('_');
}

export const pairOf = (a: string, b: string): [string, string] =>
  [a, b].sort() as [string, string];

/** The other person in the pair. */
export function otherIn(edge: Edge, uid: string): string {
  const [a, b] = edge.pair;
  if (uid === a) return b;
  if (uid === b) return a;
  throw new CycleError('not-a-member', 'That relationship is not yours.');
}

/**
 * What `uid` sees. A missing edge is `none` — the overwhelmingly common case,
 * and the reason nothing needs to write a document for two strangers.
 */
export function viewFor(uid: string, edge: Edge | null | undefined): View {
  if (!edge) return 'none';
  // Not a member: no relationship to speak of, rather than an error. A screen
  // rendering a stale list should show "add" and not crash.
  if (edge.pair[0] !== uid && edge.pair[1] !== uid) return 'none';

  switch (edge.state) {
    case 'friends':
      return 'friends';
    case 'pending':
      return edge.by === uid ? 'outgoing' : 'incoming';
    case 'blocked':
      return edge.by === uid ? 'blocked' : 'blockedBy';
  }
}

/** Which buttons a screen should offer for a view. */
export const ACTIONS: Record<View, Action[]> = {
  none: ['request', 'block'],
  outgoing: ['cancel', 'block'],
  incoming: ['accept', 'decline', 'block'],
  friends: ['remove', 'block'],
  blocked: ['unblock'],
  // Nothing. Someone who blocked you should not be actionable, and should not
  // be told that is why — see `canSee`.
  blockedBy: [],
};

export const can = (view: View, action: Action): boolean => ACTIONS[view].includes(action);

/** Where each action is trying to get to. */
export const GOAL: Record<Action, View> = {
  request: 'outgoing',
  accept: 'friends',
  decline: 'none',
  cancel: 'none',
  remove: 'none',
  block: 'blocked',
  unblock: 'none',
};

/**
 * Whether the action has already happened.
 *
 * This is what makes every action safe to repeat, which is not a nicety: a
 * phone retries a write it never saw the response to, two taps land on one
 * button, and — the case that actually bit — you tap Accept at the same moment
 * they cancel and re-send, so by the time the retry looks again you are already
 * friends. Reporting that as "you cannot accept from here" would be telling
 * someone their action failed at the exact moment it succeeded.
 *
 * A request whose far side has already accepted counts as more than satisfied.
 */
export function satisfied(action: Action, view: View): boolean {
  if (GOAL[action] === view) return true;
  return action === 'request' && view === 'friends';
}

/**
 * Whether `uid` should be shown the other person at all.
 *
 * A block is one-directional and silent: the person blocked keeps their view of
 * the world, they simply stop appearing in searches and lists on the other
 * side. Telling them would make blocking useless for the thing people actually
 * use it for.
 */
export const canSee = (view: View): boolean => view !== 'blocked' && view !== 'blockedBy';

/**
 * The next document, or null to delete it.
 *
 * Throws `CycleError` when the action is not legal from the caller's current
 * view. That happens for real — two phones, one stale screen — so callers are
 * expected to catch it and re-read rather than treat it as a bug.
 */
export function next(
  action: Action,
  uid: string,
  them: string,
  edge: Edge | null | undefined,
  now: number,
): Edge | null {
  const pair = pairOf(uid, them);
  // Throws on self-add and empty uids, before anything else can look sensible.
  pairId(uid, them);

  const view = viewFor(uid, edge);

  if (!can(view, action)) {
    throw new CycleError(
      `${action}-from-${view}`,
      view === 'blockedBy'
        ? // Deliberately the same wording as a genuine miss. See `canSee`.
          'That account is not available.'
        : `You cannot ${action} from here.`,
    );
  }

  switch (action) {
    case 'request':
      return { pair, state: 'pending', by: uid, at: now };

    case 'accept':
      return { pair, state: 'friends', by: uid, at: now };

    // All three mean "back to strangers", and deleting the document is what
    // makes that true — a leftover row would keep showing up in queries.
    case 'decline':
    case 'cancel':
    case 'remove':
      return null;

    case 'block':
      return { pair, state: 'blocked', by: uid, at: now };

    case 'unblock':
      return null;
  }
}

/**
 * Resolve two requests that crossed in flight.
 *
 * Both people tap Add at the same moment. Each writes `pending, by: me`, and one
 * write lands second and overwrites the first — leaving both of them looking at
 * an outgoing request that nobody can accept, because accepting your own request
 * is not a legal move. The second writer detects it here and goes straight to
 * friends, which is what both of them were asking for anyway.
 *
 * Returns null when `incoming` is not that case and the normal path applies.
 */
export function reconcileCrossedRequests(
  uid: string,
  them: string,
  existing: Edge | null | undefined,
  now: number,
): Edge | null {
  if (!existing || existing.state !== 'pending') return null;
  if (existing.by !== them) return null;
  return { pair: pairOf(uid, them), state: 'friends', by: uid, at: now };
}

/** Reads a document off the wire, rejecting anything malformed. */
export function parseEdge(raw: unknown): Edge | null {
  const v = raw as Partial<Edge> | null;
  if (!v || typeof v !== 'object') return null;
  if (!Array.isArray(v.pair) || v.pair.length !== 2) return null;
  const [a, b] = v.pair;
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return null;
  if (v.state !== 'pending' && v.state !== 'friends' && v.state !== 'blocked') return null;
  if (typeof v.by !== 'string' || (v.by !== a && v.by !== b)) return null;
  return {
    pair: [a, b],
    state: v.state,
    by: v.by,
    at: typeof v.at === 'number' && Number.isFinite(v.at) ? v.at : 0,
  };
}
