import { describe, expect, it } from 'vitest';
import type { Ctx, Http } from './firestore';
import { messageId } from '../social/dm';
import {
  markRead,
  MessageRejected,
  messagesPath,
  myReads,
  myThreads,
  PAGE,
  parseMessage,
  readMessages,
  readPath,
  sendMessage,
  threadPath,
} from './threads';

const CONFIG = { apiKey: 'k', projectId: 'p' };
const ME = 'uidAnush';
const THEM = 'uidDivya';
const PAIR = [ME, THEM].sort().join('_');
const NOW = 1_788_600_000_000;

/** In-memory Firestore with subcollection support, as used by the other suites. */
function fakeStore(seed: Record<string, { fields: any; updateTime: string }> = {}) {
  const docs = new Map(Object.entries(seed));
  let version = 0;

  const http: Http = async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    const after = url.split('/documents')[1] ?? '';
    const ok = (json: any) => ({ ok: true, status: 200, json: async () => json });
    const fail = (status: number, code: string) => ({
      ok: false,
      status,
      json: async () => ({ error: { status: code } }),
    });

    if (after.endsWith(':commit')) {
      for (const w of body.writes) {
        const key = (w.update?.name ?? w.delete).split('/documents/')[1];
        if (w.currentDocument?.exists === false && docs.has(key)) return fail(409, 'ALREADY_EXISTS');
      }
      for (const w of body.writes) {
        if (w.delete) docs.delete(w.delete.split('/documents/')[1]);
        else
          docs.set(w.update.name.split('/documents/')[1], {
            fields: w.update.fields,
            updateTime: `v${++version}`,
          });
      }
      return ok({});
    }

    if (after.endsWith(':runQuery')) {
      const parent = after.slice(1, -':runQuery'.length);
      const q = body.structuredQuery;
      const col = q.from[0].collectionId;
      const prefix = parent ? `${parent}/${col}/` : `${col}/`;
      let rows = [...docs.entries()].filter(
        ([k]) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'),
      );

      // Just enough filtering to exercise the queries this module sends.
      const f = q.where?.fieldFilter;
      if (f?.op === 'ARRAY_CONTAINS') {
        rows = rows.filter(([, d]) =>
          (d.fields[f.field.fieldPath]?.arrayValue?.values ?? []).some(
            (v: any) => v.stringValue === f.value.stringValue,
          ),
        );
      }
      if (f?.op === 'EQUAL') {
        rows = rows.filter(([, d]) => d.fields[f.field.fieldPath]?.stringValue === f.value.stringValue);
      }
      if (q.orderBy?.length) {
        const field = q.orderBy[0].field.fieldPath;
        const desc = q.orderBy[0].direction === 'DESCENDING';
        rows.sort(([, a], [, b]) => {
          const x = Number(a.fields[field]?.integerValue ?? 0);
          const y = Number(b.fields[field]?.integerValue ?? 0);
          return desc ? y - x : x - y;
        });
      }
      if (q.limit) rows = rows.slice(0, q.limit);

      return ok([
        { readTime: 'now' },
        ...rows.map(([k, d]) => ({ document: { name: `/documents/${k}`, ...d } })),
      ]);
    }

    const key = after.replace(/^\//, '').split('?')[0];
    if (init.method === 'GET') {
      const d = docs.get(key);
      return d ? ok({ name: `/documents/${key}`, ...d }) : fail(404, 'NOT_FOUND');
    }
    return fail(400, 'UNEXPECTED');
  };

  return { docs, ctx: { idToken: 't', config: CONFIG, http } as Ctx };
}

const msgDoc = (by: string, text: string, at: number) => ({
  fields: { by: { stringValue: by }, text: { stringValue: text }, at: { integerValue: String(at) } },
  updateTime: 'v0',
});

describe('paths', () => {
  it('key a thread by the same pair id as the friendship', () => {
    expect(threadPath(PAIR)).toBe(`threads/${PAIR}`);
    expect(messagesPath(PAIR)).toBe(`threads/${PAIR}/messages`);
    expect(readPath(ME, PAIR)).toBe(`reads/${ME}_${PAIR}`);
  });
});

describe('parseMessage', () => {
  it('reads a message document', () => {
    expect(parseMessage('000001_uidX', { by: ME, text: 'hi', at: NOW })).toEqual({
      id: '000001_uidX',
      by: ME,
      text: 'hi',
      at: NOW,
    });
  });

  it('rejects one with no author or no id', () => {
    expect(parseMessage('id', { text: 'hi' })).toBeNull();
    expect(parseMessage('', { by: ME })).toBeNull();
  });
});

describe('sendMessage', () => {
  it('writes the message and the preview together', async () => {
    // A conversation must never show a last line that is not in it.
    const { ctx, docs } = fakeStore();
    await sendMessage(ctx, ME, THEM, 'code incoming', NOW);
    expect(docs.has(`threads/${PAIR}/messages/${messageId(NOW, ME)}`)).toBe(true);
    expect(docs.get(`threads/${PAIR}`)?.fields.lastText.stringValue).toBe('code incoming');
    expect(docs.get(`threads/${PAIR}`)?.fields.lastBy.stringValue).toBe(ME);
  });

  it('stores the pair sorted, so either side finds the thread', async () => {
    const { ctx, docs } = fakeStore();
    await sendMessage(ctx, THEM, ME, 'hi', NOW);
    const pair = docs.get(`threads/${PAIR}`)?.fields.pair.arrayValue.values.map((v: any) => v.stringValue);
    expect(pair).toEqual([ME, THEM].sort());
  });

  it('trims what it sends', async () => {
    const { ctx, docs } = fakeStore();
    await sendMessage(ctx, ME, THEM, '   spaced   ', NOW);
    expect(docs.get(`threads/${PAIR}`)?.fields.lastText.stringValue).toBe('spaced');
  });

  it('refuses an empty message and an essay, without touching the network', async () => {
    const { ctx, docs } = fakeStore();
    await expect(sendMessage(ctx, ME, THEM, '  ', NOW)).rejects.toThrow(MessageRejected);
    await expect(sendMessage(ctx, ME, THEM, 'x'.repeat(600), NOW)).rejects.toThrow(MessageRejected);
    expect(docs.size).toBe(0);
  });

  it('refuses to message yourself', async () => {
    const { ctx } = fakeStore();
    await expect(sendMessage(ctx, ME, ME, 'hi', NOW)).rejects.toThrow();
  });

  it('treats a resend as already sent rather than duplicating it', async () => {
    // The id is the sender plus the millisecond, so a retry lands on the same
    // document and is refused harmlessly.
    const { ctx, docs } = fakeStore();
    await sendMessage(ctx, ME, THEM, 'hi', NOW);
    await expect(sendMessage(ctx, ME, THEM, 'hi', NOW)).resolves.toMatchObject({ text: 'hi' });
    const messages = [...docs.keys()].filter((k) => k.includes('/messages/'));
    expect(messages).toHaveLength(1);
  });
});

describe('readMessages', () => {
  it('returns the newest page, oldest first', async () => {
    // Asking for the oldest sixty of a long thread is never what anyone wants.
    const seed: Record<string, any> = {};
    for (let i = 0; i < 80; i++) {
      seed[`threads/${PAIR}/messages/${messageId(NOW + i, ME)}`] = msgDoc(ME, `m${i}`, NOW + i);
    }
    const { ctx } = fakeStore(seed);
    const out = await readMessages(ctx, PAIR);
    expect(out).toHaveLength(PAGE);
    expect(out[0].text).toBe('m20');
    expect(out[out.length - 1].text).toBe('m79');
  });

  it('is empty for a conversation with nothing in it', async () => {
    const { ctx } = fakeStore();
    expect(await readMessages(ctx, PAIR)).toEqual([]);
  });

  it('does not pick up another conversation', async () => {
    const { ctx } = fakeStore({
      [`threads/other_pair/messages/${messageId(NOW, ME)}`]: msgDoc(ME, 'elsewhere', NOW),
    });
    expect(await readMessages(ctx, PAIR)).toEqual([]);
  });
});

describe('myThreads', () => {
  it('lists conversations with unread resolved from the read marker', async () => {
    const { ctx } = fakeStore({
      [`threads/${PAIR}`]: {
        fields: {
          pair: { arrayValue: { values: [{ stringValue: ME }, { stringValue: THEM }] } },
          lastText: { stringValue: 'code?' },
          lastAt: { integerValue: String(NOW) },
          lastBy: { stringValue: THEM },
        },
        updateTime: 'v0',
      },
    });
    const [t] = await myThreads(ctx, ME);
    expect(t.other).toBe(THEM);
    expect(t.unread).toBe(true);
  });

  it('is read once the marker has caught up', async () => {
    const { ctx } = fakeStore({
      [`threads/${PAIR}`]: {
        fields: {
          pair: { arrayValue: { values: [{ stringValue: ME }, { stringValue: THEM }] } },
          lastText: { stringValue: 'code?' },
          lastAt: { integerValue: String(NOW) },
          lastBy: { stringValue: THEM },
        },
        updateTime: 'v0',
      },
      [`reads/${ME}_${PAIR}`]: {
        fields: {
          uid: { stringValue: ME },
          pair: { stringValue: PAIR },
          at: { integerValue: String(NOW) },
        },
        updateTime: 'v0',
      },
    });
    expect((await myThreads(ctx, ME))[0].unread).toBe(false);
  });

  it('does not list a conversation between two other people', async () => {
    const { ctx } = fakeStore({
      'threads/a_b': {
        fields: { pair: { arrayValue: { values: [{ stringValue: 'a' }, { stringValue: 'b' }] } } },
        updateTime: 'v0',
      },
    });
    expect(await myThreads(ctx, ME)).toEqual([]);
  });
});

describe('markRead', () => {
  it('records how far you have read', async () => {
    const { ctx, docs } = fakeStore();
    await markRead(ctx, ME, PAIR, NOW);
    expect(docs.get(`reads/${ME}_${PAIR}`)?.fields.at.integerValue).toBe(String(NOW));
  });

  it('never moves backwards', async () => {
    // Opening an old thread must not un-read a newer message; a badge that
    // reappears when you look at something is worse than no badge.
    const { ctx, docs } = fakeStore();
    await markRead(ctx, ME, PAIR, NOW);
    await markRead(ctx, ME, PAIR, NOW - 5000);
    expect(docs.get(`reads/${ME}_${PAIR}`)?.fields.at.integerValue).toBe(String(NOW));
  });

  it('carries the uid and pair so the whole set is one query', async () => {
    const { ctx } = fakeStore();
    await markRead(ctx, ME, PAIR, NOW);
    expect(await myReads(ctx, ME)).toEqual({ [PAIR]: NOW });
  });

  it('does not return another person markers', async () => {
    const { ctx } = fakeStore();
    await markRead(ctx, ME, PAIR, NOW);
    await markRead(ctx, THEM, PAIR, NOW);
    expect(Object.keys(await myReads(ctx, THEM))).toEqual([PAIR]);
    expect(await myReads(ctx, 'someoneElse')).toEqual({});
  });
});
