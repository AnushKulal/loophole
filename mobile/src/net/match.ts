/**
 * A match shared between phones.
 *
 * Two documents and a subcollection:
 *
 *   matches/{id}              seed, seats, options, status. Written once at
 *                             creation and then only to open or close the table.
 *   matches/{id}/moves/{n}    one document per move, id `000007` so that
 *                             Firestore's lexicographic ordering is also
 *                             numeric ordering.
 *
 * The index is the concurrency primitive. A move is written with a create-only
 * precondition on its own index, so two people playing at the same instant do
 * not need a referee: one write wins, the other comes back as a conflict, and
 * the loser re-reads and takes the next slot. That is the same outcome they
 * would have had by being a moment slower, which is why it does not need to be
 * explained to anyone playing.
 *
 * Reads are polled. Firestore's real-time listener rides a gRPC/WebChannel
 * transport the REST API does not expose, and taking it would mean the SDK, a
 * native dependency, and a rebuild to change a query. A poll every second or so
 * is worse in theory and unnoticeable across a table.
 */

import { commit, getDoc, isConflict, mergeDoc, runQuery, type Ctx } from './firestore';
import type { Json } from './values';
import { nextIndex, orderLog, type Move } from '../game/lockstep';

export interface Seat {
  uid: string;
  name: string;
  mark: string;
  gi: number;
  /** A seat nobody claimed, played by the local bot on every client. */
  bot?: boolean;
}

export interface Match {
  id: string;
  game: string;
  host: string;
  /** Every client seeds its engine with this, which is what makes the deals agree. */
  seed: number;
  seats: Seat[];
  status: 'lobby' | 'live' | 'done';
  options: Record<string, Json>;
  createdAt: number;
}

/** Six digits, so `moves/000007` sorts after `moves/000006` as a string. */
export const moveId = (n: number): string => String(n).padStart(6, '0');

export const matchPath = (id: string) => `matches/${id}`;
export const movesPath = (id: string) => `matches/${id}/moves`;
export const movePath = (id: string, n: number) => `${movesPath(id)}/${moveId(n)}`;

/**
 * A short, human-sayable room code.
 *
 * The alphabet leaves out the characters people misread aloud — O/0, I/1, S/5 —
 * because this exists to be read across a table rather than copied.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXYZ2346789';

export function roomCode(rand: () => number): string {
  let out = '';
  for (let i = 0; i < 6; i++) out += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  return out;
}

const num = (v: Json | undefined, or = 0) => (typeof v === 'number' ? v : or);
const str = (v: Json | undefined, or = '') => (typeof v === 'string' ? v : or);

function parseSeat(v: Json): Seat | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, Json>;
  const uid = str(o.uid);
  if (!uid) return null;
  return { uid, name: str(o.name), mark: str(o.mark, '◆'), gi: num(o.gi), bot: o.bot === true };
}

export function parseMatch(id: string, data: Record<string, Json>): Match | null {
  const seats = Array.isArray(data.seats)
    ? data.seats.map(parseSeat).filter((s): s is Seat => s !== null)
    : [];
  const game = str(data.game);
  if (!game || !seats.length) return null;
  const status = data.status;
  return {
    id,
    game,
    host: str(data.host),
    seed: num(data.seed),
    seats,
    status: status === 'live' || status === 'done' ? status : 'lobby',
    options: (data.options && typeof data.options === 'object' && !Array.isArray(data.options)
      ? (data.options as Record<string, Json>)
      : {}) as Record<string, Json>,
    createdAt: num(data.createdAt),
  };
}

export function parseMove(id: string, data: Record<string, Json>): Move | null {
  const n = Number(id);
  if (!Number.isInteger(n) || n < 0) return null;
  const by = str(data.by);
  if (!by) return null;
  return { n, by, data: data.move ?? null, at: num(data.at) };
}

// ── the table ─────────────────────────────────────────────────────

/**
 * Open a table. The code is the document id, so joining is a direct read
 * rather than a query, and a second table cannot take a live code.
 */
export async function createMatch(
  ctx: Ctx,
  code: string,
  m: Omit<Match, 'id'>,
): Promise<Match> {
  const id = code.toUpperCase();
  try {
    await commit(ctx, [
      {
        path: matchPath(id),
        ifMissing: true,
        data: {
          game: m.game,
          host: m.host,
          seed: m.seed,
          seats: m.seats.map((s) => ({ ...s, bot: s.bot ?? false })) as unknown as Json,
          status: m.status,
          options: m.options as unknown as Json,
          createdAt: m.createdAt,
        },
      },
    ]);
  } catch (e) {
    if (isConflict(e)) throw new Error('That room code is already in use.');
    throw e;
  }
  return { ...m, id };
}

export async function getMatch(ctx: Ctx, id: string): Promise<Match | null> {
  const d = await getDoc(ctx, matchPath(id.toUpperCase()));
  return d ? parseMatch(d.id, d.data) : null;
}

/** Take a seat. Rejects a full or already-started table. */
export async function joinMatch(ctx: Ctx, id: string, seat: Seat, max: number): Promise<Match> {
  const code = id.toUpperCase();
  const d = await getDoc(ctx, matchPath(code));
  const m = d && parseMatch(d.id, d.data);
  if (!m) throw new Error('No table with that code.');
  if (m.status !== 'lobby') throw new Error('That match has already started.');
  if (m.seats.some((s) => s.uid === seat.uid)) return m;
  if (m.seats.length >= max) throw new Error('That table is full.');

  const seats = [...m.seats, seat];
  try {
    await commit(ctx, [
      { path: matchPath(code), data: { seats: seats as unknown as Json }, ifUnchanged: d.updateTime },
    ]);
  } catch (e) {
    // Someone else took the last seat while we were deciding.
    if (isConflict(e)) throw new Error('That table just filled up.');
    throw e;
  }
  return { ...m, seats };
}

/** A merge, not a set — changing the status must not drop the seats. */
export async function setStatus(ctx: Ctx, id: string, status: Match['status']): Promise<void> {
  await mergeDoc(ctx, matchPath(id.toUpperCase()), { status });
}

// ── the move log ──────────────────────────────────────────────────

/** Every move played so far, ordered and with gaps respected. */
export async function readMoves(ctx: Ctx, id: string): Promise<Move[]> {
  const rows = await runQuery(ctx, movesPath(id.toUpperCase()), {
    orderBy: [{ field: 'at' }],
  });
  return orderLog(rows.map((d) => parseMove(d.id, d.data)).filter((m): m is Move => m !== null));
}

export class TookTheSlot extends Error {
  constructor(public n: number) {
    super('Someone else played that move first.');
    this.name = 'TookTheSlot';
  }
}

/**
 * Claim index `n` for a move.
 *
 * The create-only precondition is the whole mechanism: whoever's write reaches
 * Firestore first owns the slot, and the other gets a conflict rather than
 * overwriting a move that has already been shown on somebody's screen.
 */
export async function postMove(
  ctx: Ctx,
  id: string,
  n: number,
  by: string,
  move: Json,
  now: number,
): Promise<void> {
  try {
    await commit(ctx, [
      { path: movePath(id.toUpperCase(), n), ifMissing: true, data: { by, move, at: now } },
    ]);
  } catch (e) {
    if (isConflict(e)) throw new TookTheSlot(n);
    throw e;
  }
}

/**
 * Play a move, re-reading and retrying if the slot was taken.
 *
 * `decide` is handed the current log and returns the move to play, or null to
 * stand down — because the reason the slot was taken is usually that the
 * opponent moved, and what we wanted to play a moment ago may no longer be
 * legal or even our turn.
 */
export async function playMove(
  ctx: Ctx,
  id: string,
  by: string,
  decide: (moves: Move[]) => Json | null,
  now: number,
  attempts = 3,
): Promise<Move[]> {
  let moves = await readMoves(ctx, id);
  for (let i = 0; i < attempts; i++) {
    const chosen = decide(moves);
    if (chosen === null) return moves;
    const n = nextIndex(moves);
    try {
      await postMove(ctx, id, n, by, chosen, now);
      return [...moves, { n, by, data: chosen, at: now }];
    } catch (e) {
      if (!(e instanceof TookTheSlot)) throw e;
      moves = await readMoves(ctx, id);
    }
  }
  throw new TookTheSlot(nextIndex(moves));
}
