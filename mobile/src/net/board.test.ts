import { describe, expect, it } from 'vitest';
import type { Ctx, Http } from './firestore';
import { levelFor, xpFor } from '../social/scores';
import {
  alreadyBanked,
  AlreadyBanked,
  BOARD_SIZE,
  claimsFor,
  placeOf,
  playersByUid,
  recordScore,
  scorePath,
  topPlayers,
} from './board';

const CONFIG = { apiKey: 'k', projectId: 'p' };
const ME = 'uidAnush';
const NOW = 1_788_600_000_000;

/** In-memory Firestore with the ordering and filtering these queries use. */
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

      const f = q.where?.fieldFilter;
      if (f?.op === 'GREATER_THAN') {
        rows = rows.filter(([, d]) => Number(d.fields[f.field.fieldPath]?.integerValue ?? 0) > Number(f.value.integerValue));
      }
      if (f?.op === 'IN') {
        const want = new Set(f.value.arrayValue.values.map((v: any) => v.stringValue.split('/').pop()));
        rows = rows.filter(([k]) => want.has(k.split('/').pop()));
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

      return ok([{ readTime: 'now' }, ...rows.map(([k, d]) => ({ document: { name: `/documents/${k}`, ...d } }))]);
    }

    const key = after.replace(/^\//, '').split('?')[0];
    if (init.method === 'GET') {
      const d = docs.get(key);
      return d ? ok({ name: `/documents/${key}`, ...d }) : fail(404, 'NOT_FOUND');
    }
    if (init.method === 'PATCH') {
      const cur = docs.get(key);
      docs.set(key, { fields: { ...(cur?.fields ?? {}), ...body.fields }, updateTime: `v${++version}` });
      return ok({ name: `/documents/${key}`, ...docs.get(key) });
    }
    return fail(400, 'UNEXPECTED');
  };

  return { docs, ctx: { idToken: 't', config: CONFIG, http } as Ctx };
}

const user = (uid: string, xp: number, handle = uid.toLowerCase()) => ({
  fields: {
    name: { stringValue: uid },
    handle: { stringValue: handle },
    mark: { stringValue: '▲' },
    gi: { integerValue: '1' },
    xp: { integerValue: String(xp) },
  },
  updateTime: 'v0',
});

const score = (over: Partial<Parameters<typeof recordScore>[1]> = {}) => ({
  uid: ME,
  match: 'ABC123',
  game: 'UNO',
  outcome: 'won' as const,
  xp: xpFor('won'),
  at: NOW,
  ...over,
});

describe('recordScore', () => {
  it('writes the claim and moves the total', async () => {
    const { ctx, docs } = fakeStore({ [`users/${ME}`]: user(ME, 1000) });
    const total = await recordScore(ctx, score());
    expect(total).toBe(1000 + xpFor('won'));
    expect(docs.has(scorePath('ABC123', ME))).toBe(true);
    expect(docs.get(`users/${ME}`)?.fields.xp.integerValue).toBe(String(total));
  });

  it('keeps the level in step with the total', async () => {
    const { ctx, docs } = fakeStore({ [`users/${ME}`]: user(ME, 5000) });
    const total = await recordScore(ctx, score());
    expect(docs.get(`users/${ME}`)?.fields.level.integerValue).toBe(String(levelFor(total)));
  });

  it('starts from zero for somebody who has never scored', async () => {
    const { ctx } = fakeStore();
    expect(await recordScore(ctx, score({ outcome: 'lost', xp: xpFor('lost') }))).toBe(xpFor('lost'));
  });

  it('refuses to bank the same match twice', async () => {
    // Rejoining a finished game, or a retried write, must not pay again.
    const { ctx } = fakeStore({ [`users/${ME}`]: user(ME, 0) });
    await recordScore(ctx, score());
    await expect(recordScore(ctx, score())).rejects.toThrow(AlreadyBanked);
  });

  it('leaves the total alone when the match was already banked', async () => {
    const { ctx, docs } = fakeStore({ [`users/${ME}`]: user(ME, 0) });
    const first = await recordScore(ctx, score());
    await recordScore(ctx, score()).catch(() => {});
    expect(docs.get(`users/${ME}`)?.fields.xp.integerValue).toBe(String(first));
  });

  it('keeps each player claim separate for the same match', async () => {
    const { ctx, docs } = fakeStore();
    await recordScore(ctx, score());
    await recordScore(ctx, score({ uid: 'uidDivya', outcome: 'lost', xp: xpFor('lost') }));
    expect(docs.has(scorePath('ABC123', ME))).toBe(true);
    expect(docs.has(scorePath('ABC123', 'uidDivya'))).toBe(true);
  });
});

describe('alreadyBanked', () => {
  it('knows before trying', async () => {
    const { ctx } = fakeStore();
    expect(await alreadyBanked(ctx, 'ABC123', ME)).toBe(false);
    await recordScore(ctx, score());
    expect(await alreadyBanked(ctx, 'ABC123', ME)).toBe(true);
  });
});

describe('topPlayers', () => {
  it('comes back highest first', async () => {
    const { ctx } = fakeStore({
      'users/a': user('a', 100),
      'users/b': user('b', 900),
      'users/c': user('c', 500),
    });
    expect((await topPlayers(ctx)).map((p) => p.uid)).toEqual(['b', 'c', 'a']);
  });

  it('asks the server to order and cut, not the client', async () => {
    // Otherwise the "top fifty" is the top of whatever fifty came back first.
    const { ctx } = fakeStore();
    let sent: any;
    const original = (ctx as any).http;
    (ctx as any).http = async (url: string, init: any) => {
      if (url.includes(':runQuery')) sent = JSON.parse(init.body);
      return original(url, init);
    };
    await topPlayers(ctx);
    expect(sent.structuredQuery.orderBy[0]).toEqual({ field: { fieldPath: 'xp' }, direction: 'DESCENDING' });
    expect(sent.structuredQuery.limit).toBe(BOARD_SIZE);
  });

  it('is empty on a board nobody has scored on', async () => {
    expect(await topPlayers(fakeStore().ctx)).toEqual([]);
  });
});

describe('placeOf', () => {
  it('counts the people genuinely ahead', async () => {
    const { ctx } = fakeStore({
      'users/a': user('a', 900),
      'users/b': user('b', 800),
      'users/c': user('c', 100),
    });
    expect(await placeOf(ctx, 100)).toBe(3);
    expect(await placeOf(ctx, 950)).toBe(1);
  });

  it('does not count a tie as ahead', async () => {
    const { ctx } = fakeStore({ 'users/a': user('a', 500), 'users/b': user('b', 500) });
    expect(await placeOf(ctx, 500)).toBe(1);
  });
});

describe('playersByUid', () => {
  it('fetches exactly the people asked for', async () => {
    const { ctx } = fakeStore({
      'users/a': user('a', 1),
      'users/b': user('b', 2),
      'users/c': user('c', 3),
    });
    const got = await playersByUid(ctx, ['a', 'c']);
    expect(got.map((p) => p.uid).sort()).toEqual(['a', 'c']);
  });

  it('batches past the 30-value cap on an IN filter', async () => {
    const seed: Record<string, any> = {};
    const uids = Array.from({ length: 70 }, (_, i) => `u${i}`);
    for (const u of uids) seed[`users/${u}`] = user(u, 1);
    const { ctx } = fakeStore(seed);
    expect(await playersByUid(ctx, uids)).toHaveLength(70);
  });

  it('asks for nothing when there is nobody to ask about', async () => {
    expect(await playersByUid(fakeStore().ctx, [])).toEqual([]);
    expect(await playersByUid(fakeStore().ctx, ['', ''])).toEqual([]);
  });
});

describe('claimsFor', () => {
  it('returns both sides of a match, for checking against the log', async () => {
    const { ctx } = fakeStore();
    await recordScore(ctx, score());
    await recordScore(ctx, score({ uid: 'uidDivya', outcome: 'lost', xp: xpFor('lost') }));
    const claims = await claimsFor(ctx, 'ABC123');
    expect(claims).toHaveLength(2);
    expect(claims.find((c) => c.uid === ME)?.outcome).toBe('won');
    expect(claims.find((c) => c.uid === 'uidDivya')?.outcome).toBe('lost');
  });
});
