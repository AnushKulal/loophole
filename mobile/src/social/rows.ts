/**
 * What a person looks like to a screen.
 *
 * Friends, Add friends and the inbox each rendered a different shape — `Friend`
 * with a CSS presence colour, `Candidate` with a "why", a `Profile` off the
 * wire — and every screen re-derived the same decisions from whichever one it
 * had. They now all render `PersonRow`, and the deciding happens here, once,
 * where it can be tested without a screen or a server.
 *
 * The one that matters is `view`: the relationship decides which button a row
 * shows, and getting it from the state machine rather than from the screen is
 * what stops "Add" appearing next to someone who is already a friend.
 */

import { GRADS } from '../data/people';
import { viewFor, type Edge, type View } from './cycle';
import type { Profile } from './service';

export interface PersonRow {
  /** Stable list key: the uid when live, the name for a fixture. */
  key: string;
  /** Absent for fixture rows, which is also how a screen knows not to act. */
  uid?: string;
  name: string;
  handle?: string;
  mark: string;
  /** Index into the avatar palette. */
  gi: number;
  level: number;
  /** The line under the name — presence, or why they are suggested. */
  sub: string;
  online: boolean;
  view: View;
}

/**
 * How recently someone has to have been seen to read as online.
 *
 * Two minutes rather than thirty seconds: presence is written when the app
 * comes to the foreground and periodically after, and a tighter window makes
 * everyone flicker offline between writes, which reads as broken rather than
 * as accurate.
 */
export const ONLINE_WINDOW_MS = 2 * 60_000;

export const isOnline = (lastSeen: number, now: number): boolean =>
  lastSeen > 0 && now - lastSeen < ONLINE_WINDOW_MS;

/** "Online", or how long ago — the phrasing the design already used. */
export function presence(lastSeen: number, now: number): string {
  if (isOnline(lastSeen, now)) return 'Online';
  if (!lastSeen) return 'Not seen yet';

  const mins = Math.floor((now - lastSeen) / 60_000);
  if (mins < 60) return `Last seen ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Last seen ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Last seen yesterday' : `Last seen ${days}d ago`;
}

/**
 * "2m", "18m", "1h", "3d" — the compact stamp the inbox puts on a row.
 *
 * Clamped at zero because a phone's clock and the server's disagree by a few
 * seconds routinely, and "in 4s" on a request that has already arrived reads as
 * a bug rather than as clock skew.
 */
export function ago(then: number, now: number): string {
  const ms = Math.max(0, now - then);
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** A published profile, as a row, given how you are related to them. */
export function rowFor(p: Profile, view: View, now: number): PersonRow {
  return {
    key: p.uid,
    uid: p.uid,
    name: p.name || `@${p.handle}`,
    handle: p.handle,
    mark: p.mark || '◆',
    gi: ((p.gi % GRADS.length) + GRADS.length) % GRADS.length,
    level: p.level,
    sub: presence(p.lastSeen, now),
    online: isOnline(p.lastSeen, now),
    view,
  };
}

/**
 * Turn my relationships into rows, resolving each to the other person.
 *
 * An edge whose far profile has not loaded is dropped rather than rendered as a
 * blank card: the profiles arrive one request behind the edges, and a row that
 * appears nameless and then fills in is worse than one that appears late.
 */
export function rowsFrom(
  me: string,
  edges: Edge[],
  people: Record<string, Profile>,
  now: number,
  keep: (view: View) => boolean,
): PersonRow[] {
  const out: PersonRow[] = [];
  for (const e of edges) {
    const view = viewFor(me, e);
    if (!keep(view)) continue;
    const them = e.pair[0] === me ? e.pair[1] : e.pair[0];
    const profile = people[them];
    if (!profile) continue;
    out.push(rowFor(profile, view, now));
  }
  return out;
}

/** Alphabetical, but anyone online first — the list is for picking someone to play. */
export function sortForPlaying(rows: PersonRow[]): PersonRow[] {
  return rows.slice().sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/** Oldest first, so the request that has been waiting longest is answered first. */
export const sortRequests = (edges: Edge[]): Edge[] =>
  edges.slice().sort((a, b) => a.at - b.at);

/**
 * The button a row should show.
 *
 * Derived from the relationship rather than chosen per screen, so Add cannot
 * appear beside someone you are already friends with — which is exactly what
 * happened while each screen decided for itself.
 */
export type RowAction = 'add' | 'accept' | 'cancel' | 'message' | 'none';

export function primaryAction(view: View): RowAction {
  switch (view) {
    case 'none':
      return 'add';
    case 'incoming':
      return 'accept';
    case 'outgoing':
      return 'cancel';
    case 'friends':
      return 'message';
    // Neither side of a block gets an action, and neither is told why.
    case 'blocked':
    case 'blockedBy':
      return 'none';
  }
}

/** Local filtering, for the search box over a list already in hand. */
export function filterRows(rows: PersonRow[], query: string): PersonRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (r) => r.name.toLowerCase().includes(q) || (r.handle ?? '').toLowerCase().includes(q.replace(/^@/, '')),
  );
}
