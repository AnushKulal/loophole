/**
 * Direct messages.
 *
 * Same pair-keyed document as a friendship — `threads/{a_b}` — so a thread and
 * the relationship it belongs to are addressed identically and neither can
 * point at a person the other does not.
 *
 *   threads/{pair}              last message, for the list preview
 *   threads/{pair}/messages/{id}   one document per message
 *   reads/{uid}_{pair}          how far that person has read
 *
 * The read marker is a top-level document rather than a field on the thread or
 * a subcollection under it, for one reason: it makes "everything I have read"
 * a single query. Under the thread it would be one read per conversation, and
 * as a map field on the thread both people would be writing the same document
 * to record something private to each of them.
 *
 * Unlike a game's move log, messages do not need a total order agreed between
 * clients — two people typing at once should both succeed rather than one
 * being told to retry. So ids carry their own timestamp and sort themselves,
 * and nothing takes a numbered slot.
 */

/** How long a message may be. A DM, not an essay. */
export const MAX_LEN = 500;

export interface Message {
  id: string;
  by: string;
  text: string;
  at: number;
}

export interface ThreadPreview {
  /** The pair id, which is also the thread's document id. */
  pair: string;
  /** The uid of the other person. */
  other: string;
  lastText: string;
  lastAt: number;
  lastBy: string;
  unread: boolean;
}

/**
 * A message id that sorts itself.
 *
 * Zero-padded to fifteen digits so lexicographic order is chronological order —
 * a thirteen-digit millisecond timestamp would sort `9…` after `10…` once the
 * clock rolls a digit, which is a bug that would first appear in the year 2286
 * and be extremely annoying to find. The uid tail keeps two people sending in
 * the same millisecond from colliding, and makes a resend by the same person
 * land on the same id — so a retry is idempotent rather than a duplicate.
 */
export function messageId(at: number, uid: string): string {
  return `${String(Math.max(0, Math.floor(at))).padStart(15, '0')}_${uid.slice(-6)}`;
}

/** The reason a message cannot be sent, or null. */
export function messageProblem(raw: string): string | null {
  const text = raw.trim();
  if (!text) return 'Nothing to send.';
  if (text.length > MAX_LEN) return `Keep it under ${MAX_LEN} characters.`;
  return null;
}

export const cleanMessage = (raw: string): string => raw.trim().slice(0, MAX_LEN);

/**
 * Chronological, with duplicates dropped.
 *
 * Sorted by `at` and broken by id, because two people sending in the same
 * millisecond is not rare enough to leave to whichever order the query
 * happened to return — an order that flips between refreshes reads as messages
 * jumping around.
 */
export function orderMessages(messages: Message[]): Message[] {
  const byId = new Map<string, Message>();
  for (const m of messages) {
    if (!m?.id || typeof m.text !== 'string' || !m.by) continue;
    if (!byId.has(m.id)) byId.set(m.id, m);
  }
  return [...byId.values()].sort((a, b) => (a.at === b.at ? a.id.localeCompare(b.id) : a.at - b.at));
}

/**
 * Whether a thread has something new in it for `me`.
 *
 * Your own message never counts, however long ago you read: sending something
 * and then seeing your own conversation marked unread is the kind of small
 * wrongness that makes a badge untrustworthy, and an untrustworthy badge gets
 * ignored.
 */
export function isUnread(preview: { lastAt: number; lastBy: string }, me: string, readAt: number): boolean {
  if (!preview.lastAt) return false;
  if (preview.lastBy === me) return false;
  return preview.lastAt > readAt;
}

/** The one-line preview each row in the friends list shows. */
export function previewFor(
  pair: string,
  me: string,
  data: { pair?: string[]; lastText?: string; lastAt?: number; lastBy?: string },
  readAt: number,
): ThreadPreview | null {
  const members = data.pair;
  if (!Array.isArray(members) || members.length !== 2) return null;
  if (!members.includes(me)) return null;

  const lastAt = typeof data.lastAt === 'number' ? data.lastAt : 0;
  const lastBy = typeof data.lastBy === 'string' ? data.lastBy : '';
  return {
    pair,
    other: members[0] === me ? members[1] : members[0],
    lastText: typeof data.lastText === 'string' ? data.lastText : '',
    lastAt,
    lastBy,
    unread: isUnread({ lastAt, lastBy }, me, readAt),
  };
}

/** Newest conversation first — the order a messages list is read in. */
export const sortThreads = (previews: ThreadPreview[]): ThreadPreview[] =>
  previews.slice().sort((a, b) => b.lastAt - a.lastAt);

export const unreadCount = (previews: ThreadPreview[]): number =>
  previews.filter((p) => p.unread).length;

/**
 * Only friends may message each other.
 *
 * Enforced in the security rules too — this is the cheap check that keeps the
 * composer from offering something the server will refuse, not the thing that
 * makes it true.
 */
export const canMessage = (view: string): boolean => view === 'friends';

/** `reads/{uid}_{pair}` — one document per person per conversation. */
export const readId = (uid: string, pair: string): string => `${uid}_${pair}`;
