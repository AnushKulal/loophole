/**
 * Cloud Firestore over its REST API.
 *
 * Same reasoning as `auth/firebase.ts`, and deliberately the same shape: no
 * `firebase` SDK, no new dependency, just fetch against documented endpoints
 * that behave identically on Android and in a browser. The SDK's offline cache
 * and streaming listeners are the things worth having, and both are native-
 * adjacent enough that adding them would mean rebuilding the APK to change a
 * query. Polling costs a little more and can be reasoned about.
 *
 * This module knows nothing about accounts or friends. It takes an id token and
 * returns plain objects, which is what makes it testable without a project: the
 * bugs in a REST client are in the URLs and the bodies, and those are pure.
 *
 * https://firebase.google.com/docs/firestore/reference/rest
 */

import { firebaseConfig, isConfigured, type FirebaseConfig } from '../auth/config';
import { decodeFields, encodeFields, encodeValue, type Json } from './values';

const HOST = 'https://firestore.googleapis.com/v1';

/** Matches `auth/firebase.ts` — fetch has no timeout, and a stalled socket hangs forever. */
export const REQUEST_TIMEOUT_MS = 15_000;

export class FirestoreError extends Error {
  constructor(
    public code: string,
    public status = 0,
  ) {
    super(code);
    this.name = 'FirestoreError';
  }
}

/** The slice of `fetch` this module uses, so a test can supply its own. */
export type Http = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

export interface Ctx {
  idToken: string;
  config?: FirebaseConfig;
  http?: Http;
}

/** `projects/x/databases/(default)/documents/users/abc` — what commit() wants. */
export const docName = (projectId: string, path: string): string =>
  `projects/${projectId}/databases/(default)/documents/${trim(path)}`;

/** The absolute URL for a document path. */
export const docUrl = (projectId: string, path: string): string =>
  `${rootUrl(projectId)}/${trim(path)}`;

const trim = (p: string) => p.replace(/^\/+|\/+$/g, '');

/** The collection root, which is what `:runQuery` and `:commit` hang off. */
export const rootUrl = (projectId: string): string =>
  `${HOST}/projects/${projectId}/databases/(default)/documents`;

/**
 * Split a collection path into the parent document and the collection itself.
 *
 * `collectionId` in a structured query is one segment, never a path — the
 * parent goes in the URL. So `matches/ABC123/moves` queries `moves` under
 * `matches/ABC123`, and a top-level `users` has no parent at all.
 */
export function splitCollection(path: string): { parent: string; collectionId: string } {
  const parts = trim(path).split('/').filter(Boolean);
  const collectionId = parts.pop() ?? '';
  return { parent: parts.join('/'), collectionId };
}

/** Where `:runQuery` hangs off — the root, or the parent document. */
export function queryUrl(projectId: string, parent = ''): string {
  return parent ? `${rootUrl(projectId)}/${trim(parent)}:runQuery` : `${rootUrl(projectId)}:runQuery`;
}

/** The trailing id of a resource name — `users/abc` and the full name both give `abc`. */
export const idOf = (name: string): string => trim(name).split('/').pop() ?? '';

function guard(c: FirebaseConfig): FirebaseConfig {
  if (!isConfigured(c)) throw new FirestoreError('NOT_CONFIGURED');
  return c;
}

async function send(ctx: Ctx, url: string, method: string, body?: unknown): Promise<any> {
  const http = ctx.http ?? (globalThis.fetch as unknown as Http);
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);

  let res: Awaited<ReturnType<Http>>;
  try {
    res = await http(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ctx.idToken}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: abort.signal,
    });
  } catch {
    // Transport failure or our own abort. Both mean the same thing upstream.
    throw new FirestoreError('UNAVAILABLE');
  } finally {
    clearTimeout(timer);
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = Array.isArray(json) ? json[0]?.error : json?.error;
    throw new FirestoreError(err?.status ?? err?.message ?? `HTTP_${res.status}`, res.status);
  }
  return json;
}

// ── documents ─────────────────────────────────────────────────────

export interface Doc {
  /** The trailing id. */
  id: string;
  data: Record<string, Json>;
  /** Firestore's version stamp, for compare-and-set writes. */
  updateTime?: string;
}

const toDoc = (raw: any): Doc => ({
  id: idOf(raw?.name ?? ''),
  data: decodeFields(raw?.fields),
  updateTime: raw?.updateTime,
});

/**
 * One document, or null if it is not there.
 *
 * A missing document is not an error — most reads here are "do these two people
 * have a relationship", and for almost every pair the answer is no.
 */
export async function getDoc(ctx: Ctx, path: string): Promise<Doc | null> {
  const c = guard(ctx.config ?? firebaseConfig);
  try {
    return toDoc(await send(ctx, docUrl(c.projectId, path), 'GET'));
  } catch (e) {
    if (e instanceof FirestoreError && e.status === 404) return null;
    throw e;
  }
}

/** Replaces the document wholesale, creating it if absent. */
export async function setDoc(ctx: Ctx, path: string, data: Record<string, Json | undefined>): Promise<Doc> {
  const c = guard(ctx.config ?? firebaseConfig);
  return toDoc(await send(ctx, docUrl(c.projectId, path), 'PATCH', { fields: encodeFields(data) }));
}

/**
 * Merges fields, leaving every other field alone.
 *
 * The mask is what makes it a merge — a PATCH without one replaces the whole
 * document, which is a surprising way to lose the fields you did not mention.
 */
export async function mergeDoc(ctx: Ctx, path: string, data: Record<string, Json | undefined>): Promise<Doc> {
  const c = guard(ctx.config ?? firebaseConfig);
  const fields = encodeFields(data);
  const mask = Object.keys(fields)
    .map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`)
    .join('&');
  const url = `${docUrl(c.projectId, path)}${mask ? `?${mask}` : ''}`;
  return toDoc(await send(ctx, url, 'PATCH', { fields }));
}

/** Deleting something already gone is success, not a 404. */
export async function deleteDoc(ctx: Ctx, path: string): Promise<void> {
  const c = guard(ctx.config ?? firebaseConfig);
  try {
    await send(ctx, docUrl(c.projectId, path), 'DELETE');
  } catch (e) {
    if (e instanceof FirestoreError && e.status === 404) return;
    throw e;
  }
}

// ── queries ───────────────────────────────────────────────────────

export type Op =
  | 'EQUAL'
  | 'NOT_EQUAL'
  | 'LESS_THAN'
  | 'LESS_THAN_OR_EQUAL'
  | 'GREATER_THAN'
  | 'GREATER_THAN_OR_EQUAL'
  | 'ARRAY_CONTAINS'
  | 'IN'
  | 'ARRAY_CONTAINS_ANY';

export interface Where {
  field: string;
  op: Op;
  value: Json;
}

export interface Query {
  where?: Where[];
  orderBy?: { field: string; desc?: boolean }[];
  limit?: number;
}

const filterFor = (w: Where) => ({
  fieldFilter: { field: { fieldPath: w.field }, op: w.op, value: encodeValue(w.value) },
});

export function structuredQuery(collection: string, q: Query = {}): any {
  const filters = (q.where ?? []).map(filterFor);
  return {
    structuredQuery: {
      from: [{ collectionId: splitCollection(collection).collectionId }],
      // One filter goes on its own; several need wrapping. Firestore rejects a
      // compositeFilter with a single child.
      ...(filters.length === 1
        ? { where: filters[0] }
        : filters.length > 1
          ? { where: { compositeFilter: { op: 'AND', filters } } }
          : {}),
      ...(q.orderBy?.length
        ? {
            orderBy: q.orderBy.map((o) => ({
              field: { fieldPath: o.field },
              direction: o.desc ? 'DESCENDING' : 'ASCENDING',
            })),
          }
        : {}),
      ...(q.limit ? { limit: q.limit } : {}),
    },
  };
}

/**
 * Every document in a collection matching the query.
 *
 * runQuery streams results as an array of envelopes, and pads with entries that
 * carry only a `readTime` when there is nothing to report — those are not
 * documents and are dropped here rather than surfacing as empty rows.
 */
export async function runQuery(ctx: Ctx, collection: string, q: Query = {}): Promise<Doc[]> {
  const c = guard(ctx.config ?? firebaseConfig);
  const { parent } = splitCollection(collection);
  const rows = await send(ctx, queryUrl(c.projectId, parent), 'POST', structuredQuery(collection, q));
  return (Array.isArray(rows) ? rows : []).filter((r) => r?.document).map((r) => toDoc(r.document));
}

// ── atomic writes ─────────────────────────────────────────────────

/**
 * One write in a batch.
 *
 * `ifMissing` and `ifUnchanged` are the reason this exists rather than a plain
 * PATCH. The friend cycle decides the next state from the document it read; if
 * the other person acted in between, that decision was made against a version
 * that no longer exists. A precondition turns that into a failed write the
 * caller can retry, instead of an overwrite nobody notices.
 */
export type Write =
  | { path: string; data: Record<string, Json | undefined>; ifMissing?: boolean; ifUnchanged?: string }
  | { path: string; delete: true; ifUnchanged?: string };

function writeBody(projectId: string, w: Write): any {
  const name = docName(projectId, w.path);
  const precondition =
    'ifMissing' in w && w.ifMissing
      ? { exists: false }
      : w.ifUnchanged
        ? { updateTime: w.ifUnchanged }
        : undefined;

  const base = 'delete' in w ? { delete: name } : { update: { name, fields: encodeFields(w.data) } };
  return precondition ? { ...base, currentDocument: precondition } : base;
}

/**
 * Apply writes together — all of them land or none do.
 *
 * Throws `FAILED_PRECONDITION` when a precondition did not hold, which the
 * caller should read as "someone else got there first, read again".
 */
export async function commit(ctx: Ctx, writes: Write[]): Promise<void> {
  const c = guard(ctx.config ?? firebaseConfig);
  if (!writes.length) return;
  await send(ctx, `${rootUrl(c.projectId)}:commit`, 'POST', {
    writes: writes.map((w) => writeBody(c.projectId, w)),
  });
}

/** True when a failure means "the document moved under you", not "it broke". */
export const isConflict = (e: unknown): boolean =>
  e instanceof FirestoreError && (e.code === 'FAILED_PRECONDITION' || e.code === 'ALREADY_EXISTS' || e.status === 409);
