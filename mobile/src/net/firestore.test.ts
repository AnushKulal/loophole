import { describe, expect, it } from 'vitest';
import {
  commit,
  deleteDoc,
  docName,
  docUrl,
  FirestoreError,
  getDoc,
  idOf,
  isConflict,
  mergeDoc,
  queryUrl,
  runQuery,
  setDoc,
  structuredQuery,
  type Ctx,
  type Http,
} from './firestore';

const CONFIG = { apiKey: 'k', projectId: 'loophole-test' };
const ROOT = 'https://firestore.googleapis.com/v1/projects/loophole-test/databases/(default)/documents';

/** Records every call and replies with whatever the test queued. */
function spy(reply: any = {}, ok = true, status = 200) {
  const calls: { url: string; method: string; headers: Record<string, string>; body: any }[] = [];
  const http: Http = async (url, init) => {
    calls.push({
      url,
      method: init.method,
      headers: init.headers,
      body: init.body ? JSON.parse(init.body) : undefined,
    });
    return { ok, status, json: async () => reply };
  };
  return { calls, http };
}

const ctx = (http: Http): Ctx => ({ idToken: 'tok', config: CONFIG, http });

describe('resource names', () => {
  it('builds the name commit() wants', () => {
    expect(docName('p', 'users/abc')).toBe('projects/p/databases/(default)/documents/users/abc');
  });

  it('tolerates stray slashes on a path', () => {
    expect(docUrl('loophole-test', '/users/abc/')).toBe(`${ROOT}/users/abc`);
  });

  it('reads the id off either form of a name', () => {
    expect(idOf('projects/p/databases/(default)/documents/users/abc')).toBe('abc');
    expect(idOf('users/abc')).toBe('abc');
    expect(idOf('')).toBe('');
  });

  it('hangs runQuery off the collection root with no slash before the colon', () => {
    // `documents/:runQuery` is a 404; the colon binds to `documents` itself.
    expect(queryUrl('loophole-test')).toBe(`${ROOT}:runQuery`);
    expect(queryUrl('loophole-test')).not.toContain('/:');
  });
});

describe('configuration gate', () => {
  it('refuses every call until a project is wired up', async () => {
    const { http } = spy();
    const unset = { idToken: 't', config: { apiKey: '', projectId: '' }, http };
    await expect(getDoc(unset, 'users/a')).rejects.toThrow(FirestoreError);
    await expect(setDoc(unset, 'users/a', {})).rejects.toThrow(FirestoreError);
    await expect(commit(unset, [{ path: 'users/a', data: {} }])).rejects.toThrow(FirestoreError);
  });
});

describe('getDoc', () => {
  it('sends the id token as a bearer credential', async () => {
    const { calls, http } = spy({ name: `${ROOT}/users/abc`, fields: { name: { stringValue: 'Anush' } } });
    await getDoc(ctx(http), 'users/abc');
    expect(calls[0].headers.Authorization).toBe('Bearer tok');
    expect(calls[0].method).toBe('GET');
  });

  it('decodes the document', async () => {
    const { http } = spy({
      name: `${ROOT}/users/abc`,
      fields: { name: { stringValue: 'Anush' }, level: { integerValue: '24' } },
      updateTime: '2026-09-06T10:00:00Z',
    });
    const doc = await getDoc(ctx(http), 'users/abc');
    expect(doc).toEqual({
      id: 'abc',
      data: { name: 'Anush', level: 24 },
      updateTime: '2026-09-06T10:00:00Z',
    });
  });

  it('reads a missing document as null, not an error', async () => {
    // Most reads here ask "are these two related", and usually they are not.
    const { http } = spy({ error: { status: 'NOT_FOUND' } }, false, 404);
    expect(await getDoc(ctx(http), 'edges/a_b')).toBeNull();
  });

  it('still throws on a real failure', async () => {
    const { http } = spy({ error: { status: 'PERMISSION_DENIED' } }, false, 403);
    await expect(getDoc(ctx(http), 'users/abc')).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });

  it('reports a transport failure rather than hanging', async () => {
    const http: Http = async () => {
      throw new Error('socket');
    };
    await expect(getDoc(ctx(http), 'users/abc')).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
});

describe('writes', () => {
  it('setDoc replaces the whole document', async () => {
    const { calls, http } = spy({ name: `${ROOT}/users/abc` });
    await setDoc(ctx(http), 'users/abc', { name: 'Anush', level: 24 });
    expect(calls[0].method).toBe('PATCH');
    expect(calls[0].url).toBe(`${ROOT}/users/abc`);
    expect(calls[0].url).not.toContain('updateMask');
    expect(calls[0].body).toEqual({
      fields: { name: { stringValue: 'Anush' }, level: { integerValue: '24' } },
    });
  });

  it('mergeDoc masks exactly the fields it was given', async () => {
    // Without the mask this silently deletes every field not mentioned.
    const { calls, http } = spy({ name: `${ROOT}/users/abc` });
    await mergeDoc(ctx(http), 'users/abc', { lastSeen: 1 });
    expect(calls[0].url).toBe(`${ROOT}/users/abc?updateMask.fieldPaths=lastSeen`);
  });

  it('mergeDoc masks several fields', async () => {
    const { calls, http } = spy({ name: `${ROOT}/users/abc` });
    await mergeDoc(ctx(http), 'users/abc', { a: 1, b: 2 });
    expect(calls[0].url).toContain('updateMask.fieldPaths=a');
    expect(calls[0].url).toContain('updateMask.fieldPaths=b');
  });

  it('mergeDoc leaves undefined out of the mask entirely', async () => {
    const { calls, http } = spy({ name: `${ROOT}/users/abc` });
    await mergeDoc(ctx(http), 'users/abc', { a: 1, b: undefined });
    expect(calls[0].url).not.toContain('fieldPaths=b');
    expect(calls[0].body.fields).toEqual({ a: { integerValue: '1' } });
  });

  it('deleting something already gone is success', async () => {
    const { http } = spy({ error: { status: 'NOT_FOUND' } }, false, 404);
    await expect(deleteDoc(ctx(http), 'edges/a_b')).resolves.toBeUndefined();
  });
});

describe('structuredQuery', () => {
  it('omits `where` when there is nothing to filter', () => {
    expect(structuredQuery('users').structuredQuery.where).toBeUndefined();
  });

  it('sends a single filter bare', () => {
    // Firestore rejects a compositeFilter wrapping only one child.
    const q = structuredQuery('edges', { where: [{ field: 'pair', op: 'ARRAY_CONTAINS', value: 'me' }] });
    expect(q.structuredQuery.where).toEqual({
      fieldFilter: { field: { fieldPath: 'pair' }, op: 'ARRAY_CONTAINS', value: { stringValue: 'me' } },
    });
  });

  it('wraps several filters in an AND', () => {
    const q = structuredQuery('edges', {
      where: [
        { field: 'pair', op: 'ARRAY_CONTAINS', value: 'me' },
        { field: 'state', op: 'EQUAL', value: 'friends' },
      ],
    });
    expect(q.structuredQuery.where.compositeFilter.op).toBe('AND');
    expect(q.structuredQuery.where.compositeFilter.filters).toHaveLength(2);
  });

  it('carries order and limit', () => {
    const q = structuredQuery('edges', { orderBy: [{ field: 'at', desc: true }], limit: 20 });
    expect(q.structuredQuery.orderBy).toEqual([{ field: { fieldPath: 'at' }, direction: 'DESCENDING' }]);
    expect(q.structuredQuery.limit).toBe(20);
  });
});

describe('runQuery', () => {
  it('drops the readTime-only envelopes Firestore pads with', async () => {
    const { http } = spy([
      { readTime: '2026-09-06T10:00:00Z' },
      { document: { name: `${ROOT}/edges/a_b`, fields: { state: { stringValue: 'friends' } } } },
    ]);
    const rows = await runQuery(ctx(http), 'edges');
    expect(rows).toEqual([{ id: 'a_b', data: { state: 'friends' }, updateTime: undefined }]);
  });

  it('returns nothing for an empty result', async () => {
    const { http } = spy([{ readTime: '2026-09-06T10:00:00Z' }]);
    expect(await runQuery(ctx(http), 'edges')).toEqual([]);
  });

  it('reads the error out of the array envelope runQuery returns', async () => {
    const { http } = spy([{ error: { status: 'PERMISSION_DENIED' } }], false, 403);
    await expect(runQuery(ctx(http), 'edges')).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });
});

describe('commit', () => {
  it('sends nothing at all for an empty batch', async () => {
    const { calls, http } = spy();
    await commit(ctx(http), []);
    expect(calls).toHaveLength(0);
  });

  it('names documents in full and applies writes together', async () => {
    const { calls, http } = spy();
    await commit(ctx(http), [
      { path: 'edges/a_b', data: { state: 'friends' } },
      { path: 'users/a', delete: true },
    ]);
    expect(calls[0].url).toBe(`${ROOT}:commit`);
    expect(calls[0].body.writes).toEqual([
      {
        update: {
          name: 'projects/loophole-test/databases/(default)/documents/edges/a_b',
          fields: { state: { stringValue: 'friends' } },
        },
      },
      { delete: 'projects/loophole-test/databases/(default)/documents/users/a' },
    ]);
  });

  it('sends `exists: false` for a create-only write', async () => {
    // Claiming a handle: two people typing the same one must not both win.
    const { calls, http } = spy();
    await commit(ctx(http), [{ path: 'handles/anush', data: { uid: 'a' }, ifMissing: true }]);
    expect(calls[0].body.writes[0].currentDocument).toEqual({ exists: false });
  });

  it('sends the version stamp for a compare-and-set write', async () => {
    const { calls, http } = spy();
    await commit(ctx(http), [
      { path: 'edges/a_b', data: { state: 'friends' }, ifUnchanged: '2026-09-06T10:00:00Z' },
    ]);
    expect(calls[0].body.writes[0].currentDocument).toEqual({ updateTime: '2026-09-06T10:00:00Z' });
  });

  it('guards a conditional delete too', async () => {
    const { calls, http } = spy();
    await commit(ctx(http), [{ path: 'edges/a_b', delete: true, ifUnchanged: '2026-09-06T10:00:00Z' }]);
    expect(calls[0].body.writes[0]).toEqual({
      delete: 'projects/loophole-test/databases/(default)/documents/edges/a_b',
      currentDocument: { updateTime: '2026-09-06T10:00:00Z' },
    });
  });
});

describe('isConflict', () => {
  it('recognises the failures that mean "read again"', () => {
    expect(isConflict(new FirestoreError('FAILED_PRECONDITION', 400))).toBe(true);
    expect(isConflict(new FirestoreError('ALREADY_EXISTS', 409))).toBe(true);
    expect(isConflict(new FirestoreError('whatever', 409))).toBe(true);
  });

  it('does not swallow genuine failures', () => {
    expect(isConflict(new FirestoreError('PERMISSION_DENIED', 403))).toBe(false);
    expect(isConflict(new FirestoreError('UNAVAILABLE'))).toBe(false);
    expect(isConflict(new Error('nope'))).toBe(false);
  });
});
