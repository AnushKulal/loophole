import { describe, expect, it } from 'vitest';
import type { Ctx, Http } from '../net/firestore';
import { viewFor, type Edge } from './cycle';
import {
  act,
  claimHandle,
  friendsIn,
  handleProblem,
  HandleInvalid,
  HandleTaken,
  HIGH_CODE_POINT,
  myEdges,
  normaliseHandle,
  pendingFor,
  searchByHandle,
} from './service';

const CONFIG = { apiKey: 'k', projectId: 'p' };
const ME = 'uidAnush';
const THEM = 'uidDivya';
const NOW = 1_788_600_000_000;

/**
 * A Firestore stand-in holding documents in a Map, so the tests exercise the
 * real request bodies and the real precondition handling rather than a mock of
 * this module's own behaviour.
 */
function fakeStore(seed: Record<string, { fields: any; updateTime: string }> = {}) {
  const docs = new Map(Object.entries(seed));
  const log: string[] = [];
  let version = 0;

  const http: Http = async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    const path = url.split('/documents')[1] ?? '';
    log.push(`${init.method} ${path.split('?')[0]}`);

    const ok = (json: any) => ({ ok: true, status: 200, json: async () => json });
    const fail = (status: number, code: string) => ({
      ok: false,
      status,
      json: async () => ({ error: { status: code } }),
    });

    if (path.startsWith(':commit')) {
      // Check every precondition before applying anything — the batch is atomic.
      for (const w of body.writes) {
        const key = w.update?.name.split('/documents/')[1] ?? w.delete.split('/documents/')[1];
        const cur = docs.get(key);
        const pre = w.currentDocument;
        if (pre?.exists === false && cur) return fail(409, 'ALREADY_EXISTS');
        if (pre?.updateTime && cur?.updateTime !== pre.updateTime) return fail(400, 'FAILED_PRECONDITION');
      }
      for (const w of body.writes) {
        if (w.delete) docs.delete(w.delete.split('/documents/')[1]);
        else docs.set(w.update.name.split('/documents/')[1], {
          fields: w.update.fields,
          updateTime: `v${++version}`,
        });
      }
      return ok({});
    }

    if (path.startsWith(':runQuery')) {
      const rows = [...docs.entries()]
        .filter(([k]) => k.startsWith(`${body.structuredQuery.from[0].collectionId}/`))
        .map(([k, d]) => ({ document: { name: `/documents/${k}`, ...d } }));
      return ok([{ readTime: 'now' }, ...rows]);
    }

    const key = path.replace(/^\//, '');
    if (init.method === 'GET') {
      const d = docs.get(key);
      return d ? ok({ name: `/documents/${key}`, ...d }) : fail(404, 'NOT_FOUND');
    }
    return fail(400, 'UNEXPECTED');
  };

  return { docs, log, ctx: { idToken: 't', config: CONFIG, http } as Ctx };
}

const edgeDoc = (state: string, by: string, updateTime = 'v0') => ({
  fields: {
    pair: { arrayValue: { values: [{ stringValue: ME }, { stringValue: THEM }].sort((a, b) =>
      a.stringValue < b.stringValue ? -1 : 1) } },
    state: { stringValue: state },
    by: { stringValue: by },
    at: { integerValue: String(NOW) },
  },
  updateTime,
});

const pairKey = `edges/${[ME, THEM].sort().join('_')}`;

describe('handle rules', () => {
  it('normalises what people actually type', () => {
    expect(normaliseHandle('  @Anush  ')).toBe('anush');
    expect(normaliseHandle('ANUSH')).toBe('anush');
  });

  it('accepts sensible handles', () => {
    for (const ok of ['anush', 'a_b_1', 'x'.repeat(20)]) expect(handleProblem(ok), ok).toBeNull();
  });

  it('rejects the rest, with a reason worth showing', () => {
    expect(handleProblem('')).toMatch(/pick/i);
    expect(handleProblem('ab')).toMatch(/3/);
    expect(handleProblem('x'.repeat(21))).toMatch(/20/);
    expect(handleProblem('has space')).toMatch(/letters/i);
    expect(handleProblem('emoji✦')).toMatch(/letters/i);
  });
});

describe('claiming a handle', () => {
  it('claims a free one', async () => {
    const { ctx, docs } = fakeStore();
    expect(await claimHandle(ctx, ME, '@Anush')).toBe('anush');
    expect(docs.has('handles/anush')).toBe(true);
  });

  it('refuses one somebody else holds', async () => {
    const { ctx } = fakeStore({
      'handles/anush': { fields: { uid: { stringValue: 'someoneElse' } }, updateTime: 'v0' },
    });
    await expect(claimHandle(ctx, ME, 'anush')).rejects.toThrow(HandleTaken);
  });

  it('re-claiming your own is a no-op, not a lockout', async () => {
    // Saving your profile twice must not cost you your own name.
    const { ctx } = fakeStore({
      'handles/anush': { fields: { uid: { stringValue: ME } }, updateTime: 'v0' },
    });
    await expect(claimHandle(ctx, ME, 'anush')).resolves.toBe('anush');
  });

  it('reports an invalid handle as invalid rather than taken', async () => {
    const { ctx } = fakeStore();
    await expect(claimHandle(ctx, ME, 'ab')).rejects.toThrow(HandleInvalid);
  });

  it('loses the race at the database, not in a check-then-write', async () => {
    // Someone claims it between our read and our write.
    const { ctx, docs } = fakeStore();
    const original = (ctx as any).http;
    let first = true;
    (ctx as any).http = async (url: string, init: any) => {
      if (first && init.method === 'GET') {
        first = false;
        const res = await original(url, init);
        docs.set('handles/anush', { fields: { uid: { stringValue: 'faster' } }, updateTime: 'v9' });
        return res;
      }
      return original(url, init);
    };
    await expect(claimHandle(ctx, ME, 'anush')).rejects.toThrow(HandleTaken);
  });
});

describe('searchByHandle', () => {
  it('needs two characters before it will query', async () => {
    const { ctx, log } = fakeStore();
    expect(await searchByHandle(ctx, 'a')).toEqual([]);
    expect(log).toHaveLength(0);
  });

  it('asks for a prefix range, not an equality', async () => {
    const { ctx } = fakeStore();
    let sent: any;
    const original = (ctx as any).http;
    (ctx as any).http = async (url: string, init: any) => {
      if (url.includes(':runQuery')) sent = JSON.parse(init.body);
      return original(url, init);
    };
    await searchByHandle(ctx, 'an');
    const filters = sent.structuredQuery.where.compositeFilter.filters;
    expect(filters[0].fieldFilter.op).toBe('GREATER_THAN_OR_EQUAL');
    expect(filters[0].fieldFilter.value.stringValue).toBe('an');
    expect(filters[1].fieldFilter.op).toBe('LESS_THAN');
    // Without the sentinel this range is empty and search silently returns nothing.
    expect(filters[1].fieldFilter.value.stringValue).toBe(`an${HIGH_CODE_POINT}`);
    expect(HIGH_CODE_POINT).toBe('');
  });
});

describe('act — the cycle over the wire', () => {
  it('sends a request when there is nothing there', async () => {
    const { ctx, docs } = fakeStore();
    expect(await act(ctx, ME, THEM, 'request', NOW)).toBe('outgoing');
    expect(docs.has(pairKey)).toBe(true);
  });

  it('guards the create with "must not exist"', async () => {
    const { ctx } = fakeStore();
    let sent: any;
    const original = (ctx as any).http;
    (ctx as any).http = async (url: string, init: any) => {
      if (url.includes(':commit')) sent = JSON.parse(init.body);
      return original(url, init);
    };
    await act(ctx, ME, THEM, 'request', NOW);
    expect(sent.writes[0].currentDocument).toEqual({ exists: false });
  });

  it('guards a change with the version it read', async () => {
    const { ctx } = fakeStore({ [pairKey]: edgeDoc('pending', THEM, 'v7') });
    let sent: any;
    const original = (ctx as any).http;
    (ctx as any).http = async (url: string, init: any) => {
      if (url.includes(':commit')) sent = JSON.parse(init.body);
      return original(url, init);
    };
    await act(ctx, ME, THEM, 'accept', NOW);
    expect(sent.writes[0].currentDocument).toEqual({ updateTime: 'v7' });
  });

  it('accepts an incoming request into a friendship', async () => {
    const { ctx, docs } = fakeStore({ [pairKey]: edgeDoc('pending', THEM) });
    expect(await act(ctx, ME, THEM, 'accept', NOW)).toBe('friends');
    expect(docs.get(pairKey)?.fields.state.stringValue).toBe('friends');
  });

  it('declining removes the document rather than leaving a row behind', async () => {
    const { ctx, docs } = fakeStore({ [pairKey]: edgeDoc('pending', THEM) });
    expect(await act(ctx, ME, THEM, 'decline', NOW)).toBe('none');
    expect(docs.has(pairKey)).toBe(false);
  });

  it('removing a friend is a delete', async () => {
    const { ctx, docs } = fakeStore({ [pairKey]: edgeDoc('friends', ME) });
    expect(await act(ctx, ME, THEM, 'remove', NOW)).toBe('none');
    expect(docs.has(pairKey)).toBe(false);
  });

  it('treats removing a non-friend as already done, and writes nothing', async () => {
    // Idempotence: the end state is what was asked for, so this is success.
    const { ctx, log } = fakeStore();
    expect(await act(ctx, ME, THEM, 'remove', NOW)).toBe('none');
    expect(log.filter((l) => l.includes('commit'))).toHaveLength(0);
  });

  it('is safe to repeat every action', async () => {
    // Phones retry writes whose response they never saw, and fingers double-tap.
    const { ctx } = fakeStore();
    expect(await act(ctx, ME, THEM, 'request', NOW)).toBe('outgoing');
    expect(await act(ctx, ME, THEM, 'request', NOW)).toBe('outgoing');

    expect(await act(ctx, THEM, ME, 'accept', NOW)).toBe('friends');
    expect(await act(ctx, THEM, ME, 'accept', NOW)).toBe('friends');

    expect(await act(ctx, ME, THEM, 'remove', NOW)).toBe('none');
    expect(await act(ctx, ME, THEM, 'remove', NOW)).toBe('none');
  });

  it('reports a request the far side already accepted as a friendship', async () => {
    const { ctx } = fakeStore({ [pairKey]: edgeDoc('friends', THEM) });
    expect(await act(ctx, ME, THEM, 'request', NOW)).toBe('friends');
  });

  it('two requests that crossed become a friendship', async () => {
    // They tapped Add while we were tapping Add. Both meant the same thing.
    const { ctx, docs } = fakeStore({ [pairKey]: edgeDoc('pending', THEM) });
    expect(await act(ctx, ME, THEM, 'request', NOW)).toBe('friends');
    expect(docs.get(pairKey)?.fields.state.stringValue).toBe('friends');
  });

  it('retries once when the other side moved between our read and our write', async () => {
    const { ctx, docs } = fakeStore({ [pairKey]: edgeDoc('pending', THEM, 'v1') });
    const original = (ctx as any).http;
    let bumped = false;
    (ctx as any).http = async (url: string, init: any) => {
      if (!bumped && url.includes(':commit')) {
        // They accepted first; our guarded write is now against a stale version.
        bumped = true;
        docs.set(pairKey, edgeDoc('friends', THEM, 'v2'));
      }
      return original(url, init);
    };
    // The retry re-reads, sees the friendship, and reports it rather than failing.
    await expect(act(ctx, ME, THEM, 'accept', NOW)).resolves.toBe('friends');
  });

  it('gives up rather than looping when conflicts keep coming', async () => {
    const { ctx, docs } = fakeStore({ [pairKey]: edgeDoc('pending', THEM, 'v1') });
    const original = (ctx as any).http;
    let n = 0;
    (ctx as any).http = async (url: string, init: any) => {
      if (url.includes(':commit')) docs.set(pairKey, edgeDoc('pending', THEM, `v${++n + 1}`));
      return original(url, init);
    };
    await expect(act(ctx, ME, THEM, 'accept', NOW)).rejects.toThrow();
  });

  it('refuses an illegal move without touching the network', async () => {
    const { ctx, log } = fakeStore({ [pairKey]: edgeDoc('pending', ME) });
    // Accepting your own request.
    await expect(act(ctx, ME, THEM, 'accept', NOW)).rejects.toThrow();
    expect(log.filter((l) => l.includes('commit'))).toHaveLength(0);
  });
});

describe('reading your relationships back', () => {
  it('fetches everything you are in with one query', async () => {
    const { ctx, log } = fakeStore({
      [pairKey]: edgeDoc('friends', ME),
      'edges/uidAnush_uidZed': {
        fields: {
          pair: { arrayValue: { values: [{ stringValue: ME }, { stringValue: 'uidZed' }] } },
          state: { stringValue: 'pending' },
          by: { stringValue: 'uidZed' },
          at: { integerValue: '1' },
        },
        updateTime: 'v0',
      },
    });
    const edges = await myEdges(ctx, ME);
    expect(edges).toHaveLength(2);
    expect(log.filter((l) => l.includes('runQuery'))).toHaveLength(1);
  });

  it('splits them into friends and waiting requests', async () => {
    const edges: Edge[] = [
      { pair: [ME, THEM].sort() as [string, string], state: 'friends', by: ME, at: 1 },
      { pair: [ME, 'uidZed'].sort() as [string, string], state: 'pending', by: 'uidZed', at: 2 },
      { pair: [ME, 'uidQ'].sort() as [string, string], state: 'pending', by: ME, at: 3 },
    ];
    expect(friendsIn(ME, edges)).toHaveLength(1);
    // Only the one they sent us — our own outgoing request is not an inbox item.
    expect(pendingFor(ME, edges)).toHaveLength(1);
    expect(viewFor(ME, pendingFor(ME, edges)[0])).toBe('incoming');
  });

  it('drops malformed documents instead of rendering them', async () => {
    const { ctx } = fakeStore({
      'edges/junk': { fields: { state: { stringValue: 'friends' } }, updateTime: 'v0' },
    });
    expect(await myEdges(ctx, ME)).toEqual([]);
  });
});
