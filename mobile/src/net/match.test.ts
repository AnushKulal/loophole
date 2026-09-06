import { describe, expect, it } from 'vitest';
import type { Ctx, Http } from './firestore';
import {
  createMatch,
  getMatch,
  joinMatch,
  matchPath,
  moveId,
  movePath,
  parseMatch,
  parseMove,
  playMove,
  postMove,
  readMoves,
  roomCode,
  TookTheSlot,
  type Match,
  type Seat,
} from './match';
import { makeRng } from '../game/contract';

const CONFIG = { apiKey: 'k', projectId: 'p' };
const NOW = 1_788_600_000_000;

const seat = (uid: string, name: string): Seat => ({ uid, name, mark: '◆', gi: 0 });

/** The same in-memory Firestore the social tests use, with subcollections. */
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
        const cur = docs.get(key);
        if (w.currentDocument?.exists === false && cur) return fail(409, 'ALREADY_EXISTS');
        if (w.currentDocument?.updateTime && cur?.updateTime !== w.currentDocument.updateTime) {
          return fail(400, 'FAILED_PRECONDITION');
        }
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
      // The parent is in the URL; the collection id is in the body.
      const parent = after.slice(1, -':runQuery'.length);
      const col = body.structuredQuery.from[0].collectionId;
      const prefix = parent ? `${parent}/${col}/` : `${col}/`;
      const rows = [...docs.entries()]
        .filter(([k]) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
        .map(([k, d]) => ({ document: { name: `/documents/${k}`, ...d } }));
      return ok([{ readTime: 'now' }, ...rows]);
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

const table = (over: Partial<Match> = {}): Omit<Match, 'id'> => ({
  game: 'UNO',
  host: 'uidA',
  seed: 4242,
  seats: [seat('uidA', 'Anush'), seat('uidB', 'Divya')],
  status: 'lobby',
  options: { players: 2 },
  createdAt: NOW,
  ...over,
});

describe('room codes', () => {
  it('are six characters from a read-aloud-safe alphabet', () => {
    const code = roomCode(makeRng(7));
    expect(code).toHaveLength(6);
    // O/0, I/1 and S/5 are the pairs people mishear across a table.
    expect(code).not.toMatch(/[O0I1S5]/);
  });

  it('are stable for a seed and different across seeds', () => {
    expect(roomCode(makeRng(7))).toBe(roomCode(makeRng(7)));
    expect(roomCode(makeRng(7))).not.toBe(roomCode(makeRng(8)));
  });
});

describe('move ids', () => {
  it('pad so string order is numeric order', () => {
    // Firestore sorts document ids lexicographically; `10` must not precede `9`.
    expect(moveId(7)).toBe('000007');
    expect([moveId(9), moveId(10)].sort()).toEqual(['000009', '000010']);
  });

  it('live under the match', () => {
    expect(movePath('ABC123', 3)).toBe('matches/ABC123/moves/000003');
    expect(matchPath('ABC123')).toBe('matches/ABC123');
  });
});

describe('parsing', () => {
  it('reads a table back', () => {
    const m = parseMatch('ABC123', {
      game: 'UNO',
      host: 'uidA',
      seed: 42,
      seats: [{ uid: 'uidA', name: 'Anush', mark: '▲', gi: 1, bot: false }],
      status: 'live',
      options: { players: 2 },
      createdAt: NOW,
    });
    expect(m?.seats[0]).toEqual({ uid: 'uidA', name: 'Anush', mark: '▲', gi: 1, bot: false });
    expect(m?.status).toBe('live');
  });

  it('rejects a table with no game or no seats', () => {
    expect(parseMatch('X', { game: '', seats: [{ uid: 'a' }] })).toBeNull();
    expect(parseMatch('X', { game: 'UNO', seats: [] })).toBeNull();
  });

  it('drops malformed seats rather than rendering them', () => {
    const m = parseMatch('X', { game: 'UNO', seats: [{ uid: 'a' }, { name: 'no uid' }, 'nope'] });
    expect(m?.seats).toHaveLength(1);
  });

  it('falls back to lobby for an unrecognised status', () => {
    expect(parseMatch('X', { game: 'UNO', seats: [{ uid: 'a' }], status: 'weird' })?.status).toBe('lobby');
  });

  it('takes a move index from its document id', () => {
    expect(parseMove('000007', { by: 'uidA', move: { col: 3 }, at: NOW })).toEqual({
      n: 7,
      by: 'uidA',
      data: { col: 3 },
      at: NOW,
    });
  });

  it('rejects a move with no author or a junk id', () => {
    expect(parseMove('000007', { move: 1 })).toBeNull();
    expect(parseMove('nope', { by: 'uidA' })).toBeNull();
  });
});

describe('opening and joining a table', () => {
  it('creates it under the room code', async () => {
    const { ctx, docs } = fakeStore();
    const m = await createMatch(ctx, 'abc123', table());
    expect(m.id).toBe('ABC123');
    expect(docs.has('matches/ABC123')).toBe(true);
  });

  it('refuses a code already in play', async () => {
    const { ctx } = fakeStore();
    await createMatch(ctx, 'ABC123', table());
    await expect(createMatch(ctx, 'ABC123', table())).rejects.toThrow(/already in use/i);
  });

  it('reads a table back by code, case-insensitively', async () => {
    const { ctx } = fakeStore();
    await createMatch(ctx, 'ABC123', table());
    expect((await getMatch(ctx, 'abc123'))?.game).toBe('UNO');
  });

  it('is null for a code nobody opened', async () => {
    const { ctx } = fakeStore();
    expect(await getMatch(ctx, 'NOPE12')).toBeNull();
  });

  it('seats a new player', async () => {
    const { ctx } = fakeStore();
    await createMatch(ctx, 'ABC123', table({ seats: [seat('uidA', 'Anush')] }));
    const m = await joinMatch(ctx, 'ABC123', seat('uidB', 'Divya'), 4);
    expect(m.seats.map((s) => s.uid)).toEqual(['uidA', 'uidB']);
  });

  it('re-joining is a no-op, not a second seat', async () => {
    // Backgrounding the app and coming back must not clone you.
    const { ctx } = fakeStore();
    await createMatch(ctx, 'ABC123', table({ seats: [seat('uidA', 'Anush')] }));
    const m = await joinMatch(ctx, 'ABC123', seat('uidA', 'Anush'), 4);
    expect(m.seats).toHaveLength(1);
  });

  it('refuses a full table', async () => {
    const { ctx } = fakeStore();
    await createMatch(ctx, 'ABC123', table());
    await expect(joinMatch(ctx, 'ABC123', seat('uidC', 'Rohan'), 2)).rejects.toThrow(/full/i);
  });

  it('refuses a match already under way', async () => {
    const { ctx } = fakeStore();
    await createMatch(ctx, 'ABC123', table({ status: 'live' }));
    await expect(joinMatch(ctx, 'ABC123', seat('uidC', 'Rohan'), 4)).rejects.toThrow(/already started/i);
  });

  it('refuses a code that does not exist', async () => {
    const { ctx } = fakeStore();
    await expect(joinMatch(ctx, 'NOPE12', seat('uidC', 'Rohan'), 4)).rejects.toThrow(/no table/i);
  });

  it('loses the last seat to whoever wrote first', async () => {
    const { ctx, docs } = fakeStore();
    await createMatch(ctx, 'ABC123', table({ seats: [seat('uidA', 'Anush')] }));
    const original = (ctx as any).http;
    let sniped = false;
    (ctx as any).http = async (url: string, init: any) => {
      const res = await original(url, init);
      if (!sniped && init.method === 'GET') {
        sniped = true;
        const cur = docs.get('matches/ABC123');
        docs.set('matches/ABC123', { ...cur!, updateTime: 'vSniped' });
      }
      return res;
    };
    await expect(joinMatch(ctx, 'ABC123', seat('uidC', 'Rohan'), 2)).rejects.toThrow(/just filled up/i);
  });
});

describe('the move log', () => {
  it('starts empty', async () => {
    const { ctx } = fakeStore();
    await createMatch(ctx, 'ABC123', table());
    expect(await readMoves(ctx, 'ABC123')).toEqual([]);
  });

  it('records a move and reads it back in order', async () => {
    const { ctx } = fakeStore();
    await createMatch(ctx, 'ABC123', table());
    await postMove(ctx, 'ABC123', 0, 'uidA', { col: 3 }, NOW);
    await postMove(ctx, 'ABC123', 1, 'uidB', { col: 4 }, NOW + 1);
    const moves = await readMoves(ctx, 'ABC123');
    expect(moves.map((m) => m.n)).toEqual([0, 1]);
    expect(moves[0].data).toEqual({ col: 3 });
  });

  it('refuses to overwrite an index someone already claimed', async () => {
    // This is the whole ordering mechanism.
    const { ctx } = fakeStore();
    await createMatch(ctx, 'ABC123', table());
    await postMove(ctx, 'ABC123', 0, 'uidA', { col: 3 }, NOW);
    await expect(postMove(ctx, 'ABC123', 0, 'uidB', { col: 4 }, NOW)).rejects.toThrow(TookTheSlot);
  });

  it('does not read moves from another table', async () => {
    const { ctx } = fakeStore();
    await createMatch(ctx, 'ABC123', table());
    await createMatch(ctx, 'ZZZ999', table());
    await postMove(ctx, 'ZZZ999', 0, 'uidA', { col: 1 }, NOW);
    expect(await readMoves(ctx, 'ABC123')).toEqual([]);
  });
});

describe('playMove', () => {
  it('takes the next free index', async () => {
    const { ctx } = fakeStore();
    await createMatch(ctx, 'ABC123', table());
    await playMove(ctx, 'ABC123', 'uidA', () => ({ col: 3 }), NOW);
    const moves = await playMove(ctx, 'ABC123', 'uidB', () => ({ col: 4 }), NOW + 1);
    expect(moves.map((m) => m.n)).toEqual([0, 1]);
  });

  it('re-reads and retries when the opponent got there first', async () => {
    const { ctx } = fakeStore();
    await createMatch(ctx, 'ABC123', table());
    const original = (ctx as any).http;
    let raced = false;
    (ctx as any).http = async (url: string, init: any) => {
      if (!raced && url.includes(':commit')) {
        raced = true;
        // Their move lands in slot 0 just before ours does.
        await postMove({ ...(ctx as any), http: original }, 'ABC123', 0, 'uidB', { col: 9 }, NOW);
      }
      return original(url, init);
    };
    const moves = await playMove(ctx, 'ABC123', 'uidA', () => ({ col: 3 }), NOW + 1);
    expect(moves.map((m) => m.n)).toEqual([0, 1]);
    expect(moves[0].by).toBe('uidB');
    expect(moves[1].by).toBe('uidA');
  });

  it('lets the caller stand down once it sees what actually happened', async () => {
    // The reason our slot was taken is usually that they moved — and what we
    // wanted to play may no longer be legal, or even our turn.
    const { ctx } = fakeStore();
    await createMatch(ctx, 'ABC123', table());
    await postMove(ctx, 'ABC123', 0, 'uidB', { col: 9 }, NOW);
    const moves = await playMove(ctx, 'ABC123', 'uidA', (log) => (log.length ? null : { col: 3 }), NOW);
    expect(moves).toHaveLength(1);
    expect(moves[0].by).toBe('uidB');
  });

  it('gives up rather than spinning against a busy table', async () => {
    const { ctx } = fakeStore();
    await createMatch(ctx, 'ABC123', table());
    const original = (ctx as any).http;
    let n = 0;
    (ctx as any).http = async (url: string, init: any) => {
      if (url.includes(':commit')) {
        await postMove({ ...(ctx as any), http: original }, 'ABC123', n++, 'uidB', {}, NOW);
      }
      return original(url, init);
    };
    await expect(playMove(ctx, 'ABC123', 'uidA', () => ({ col: 3 }), NOW)).rejects.toThrow(TookTheSlot);
  });
});
