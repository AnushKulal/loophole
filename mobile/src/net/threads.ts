/**
 * Direct messages over Firestore.
 *
 * The shapes and the reasoning live in `social/dm.ts`; this is the transport.
 *
 * Sending is two writes in one commit — the message, and the preview on the
 * thread — so a conversation can never show a last line that is not in it, or
 * hold a message the list has not heard about. They are separate documents
 * because the alternatives are both worse: one document holding every message
 * hits Firestore's 1 MiB limit after a few thousand lines, and no thread
 * document at all makes the friends list one query per conversation.
 */

import { commit, getDoc, isConflict, runQuery, type Ctx } from './firestore';
import type { Json } from './values';
import {
  cleanMessage,
  messageId,
  messageProblem,
  orderMessages,
  previewFor,
  readId,
  type Message,
  type ThreadPreview,
} from '../social/dm';
import { pairId } from '../social/cycle';

export const threadPath = (pair: string) => `threads/${pair}`;
export const messagesPath = (pair: string) => `threads/${pair}/messages`;
export const readPath = (uid: string, pair: string) => `reads/${readId(uid, pair)}`;

const str = (v: Json | undefined, or = '') => (typeof v === 'string' ? v : or);
const num = (v: Json | undefined, or = 0) => (typeof v === 'number' ? v : or);

export function parseMessage(id: string, data: Record<string, Json>): Message | null {
  const by = str(data.by);
  if (!by || !id) return null;
  return { id, by, text: str(data.text), at: num(data.at) };
}

/**
 * How many messages a thread opens with.
 *
 * Enough that scrolling back a little works, few enough that opening a
 * long-running conversation is one small read. Older messages are not paged in
 * yet; the day that matters, this is where it goes.
 */
export const PAGE = 60;

/** The most recent messages, oldest first. */
export async function readMessages(ctx: Ctx, pair: string, limit = PAGE): Promise<Message[]> {
  const rows = await runQuery(ctx, messagesPath(pair), {
    // Newest first with a limit, then reversed — the other way round returns
    // the oldest sixty of a long thread, which is never what anyone wants.
    orderBy: [{ field: 'at', desc: true }],
    limit,
  });
  return orderMessages(rows.map((d) => parseMessage(d.id, d.data)).filter((m): m is Message => m !== null));
}

export class MessageRejected extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = 'MessageRejected';
  }
}

/**
 * Send one message, and update the preview in the same commit.
 *
 * `ifMissing` on the message makes a resend idempotent rather than a duplicate:
 * the id is derived from the sender and the millisecond, so a retry of the same
 * send lands on the same document and is refused harmlessly.
 */
export async function sendMessage(
  ctx: Ctx,
  me: string,
  them: string,
  raw: string,
  now: number,
): Promise<Message> {
  const problem = messageProblem(raw);
  if (problem) throw new MessageRejected(problem);

  const pair = pairId(me, them);
  const text = cleanMessage(raw);
  const id = messageId(now, me);
  const message: Message = { id, by: me, text, at: now };

  try {
    await commit(ctx, [
      {
        path: `${messagesPath(pair)}/${id}`,
        ifMissing: true,
        data: { by: me, text, at: now },
      },
      {
        // Not create-only: the preview is meant to be overwritten every time.
        path: threadPath(pair),
        data: { pair: [me, them].sort() as unknown as Json, lastText: text, lastAt: now, lastBy: me },
      },
    ]);
  } catch (e) {
    // The same send already landed. Reporting success is correct — the message
    // the caller wanted sent is sent.
    if (isConflict(e)) return message;
    throw e;
  }
  return message;
}

/** Every conversation `me` is in, with unread resolved against their markers. */
export async function myThreads(ctx: Ctx, me: string): Promise<ThreadPreview[]> {
  const [rows, reads] = await Promise.all([
    runQuery(ctx, 'threads', { where: [{ field: 'pair', op: 'ARRAY_CONTAINS', value: me }] }),
    myReads(ctx, me),
  ]);

  const out: ThreadPreview[] = [];
  for (const d of rows) {
    const p = previewFor(d.id, me, d.data as never, reads[d.id] ?? 0);
    if (p) out.push(p);
  }
  return out;
}

/**
 * Where this person has read up to in each conversation.
 *
 * One query, which is the whole reason the marker is a top-level document
 * rather than something nested under the thread.
 */
export async function myReads(ctx: Ctx, me: string): Promise<Record<string, number>> {
  const rows = await runQuery(ctx, 'reads', { where: [{ field: 'uid', op: 'EQUAL', value: me }] });
  const out: Record<string, number> = {};
  for (const d of rows) {
    const pair = str(d.data.pair);
    if (pair) out[pair] = num(d.data.at);
  }
  return out;
}

/**
 * Mark a conversation read up to `at`.
 *
 * Never moves backwards: opening an old thread after a newer message arrived
 * would otherwise un-read it, and a badge that reappears when you look at
 * something is worse than no badge.
 */
export async function markRead(ctx: Ctx, me: string, pair: string, at: number): Promise<void> {
  const existing = await getDoc(ctx, readPath(me, pair));
  if (existing && num(existing.data.at) >= at) return;
  await commit(ctx, [{ path: readPath(me, pair), data: { uid: me, pair, at } }]);
}
