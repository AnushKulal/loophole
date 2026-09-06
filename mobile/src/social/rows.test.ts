import { describe, expect, it } from 'vitest';
import { pairOf, type Edge } from './cycle';
import type { Profile } from './service';
import {
  ago,
  filterRows,
  isOnline,
  ONLINE_WINDOW_MS,
  presence,
  primaryAction,
  rowFor,
  rowsFrom,
  sortForPlaying,
  sortRequests,
  type PersonRow,
} from './rows';

const NOW = 1_788_600_000_000;
const ME = 'uidAnush';

const profile = (uid: string, over: Partial<Profile> = {}): Profile => ({
  uid,
  handle: uid.toLowerCase(),
  name: uid,
  mark: '▲',
  gi: 1,
  level: 12,
  lastSeen: NOW,
  ...over,
});

const edge = (them: string, state: Edge['state'], by: string, at = NOW): Edge => ({
  pair: pairOf(ME, them),
  state,
  by,
  at,
});

describe('presence', () => {
  it('reads as online inside the window', () => {
    expect(presence(NOW - 1000, NOW)).toBe('Online');
    expect(isOnline(NOW - 1000, NOW)).toBe(true);
  });

  it('falls out of the window at the boundary', () => {
    expect(isOnline(NOW - ONLINE_WINDOW_MS, NOW)).toBe(false);
  });

  it('counts up through minutes, hours and days', () => {
    expect(presence(NOW - 5 * 60_000, NOW)).toBe('Last seen 5m ago');
    expect(presence(NOW - 3 * 3_600_000, NOW)).toBe('Last seen 3h ago');
    expect(presence(NOW - 25 * 3_600_000, NOW)).toBe('Last seen yesterday');
    expect(presence(NOW - 4 * 24 * 3_600_000, NOW)).toBe('Last seen 4d ago');
  });

  it('says so when someone has never been seen', () => {
    // Better than "Last seen 56 years ago", which is what an epoch-zero
    // timestamp renders as.
    expect(presence(0, NOW)).toBe('Not seen yet');
    expect(isOnline(0, NOW)).toBe(false);
  });
});

describe('rowFor', () => {
  it('carries a profile across', () => {
    const r = rowFor(profile('uidDivya', { name: 'Divya', level: 24 }), 'friends', NOW);
    expect(r).toMatchObject({ key: 'uidDivya', uid: 'uidDivya', name: 'Divya', level: 24, view: 'friends' });
  });

  it('falls back to the handle when no display name was set', () => {
    expect(rowFor(profile('uidX', { name: '', handle: 'zed' }), 'none', NOW).name).toBe('@zed');
  });

  it('keeps the avatar index inside the palette, including for junk', () => {
    // A negative or huge `gi` read off a document must not index out of bounds.
    expect(rowFor(profile('a', { gi: 99 }), 'none', NOW).gi).toBeLessThan(8);
    expect(rowFor(profile('a', { gi: -3 }), 'none', NOW).gi).toBeGreaterThanOrEqual(0);
  });

  it('defaults a missing mark rather than rendering an empty avatar', () => {
    expect(rowFor(profile('a', { mark: '' }), 'none', NOW).mark).toBe('◆');
  });
});

describe('rowsFrom', () => {
  const people = {
    uidDivya: profile('uidDivya', { name: 'Divya' }),
    uidRohan: profile('uidRohan', { name: 'Rohan', lastSeen: NOW - 3 * 3_600_000 }),
  };

  it('resolves each edge to the other person', () => {
    const rows = rowsFrom(ME, [edge('uidDivya', 'friends', ME)], people, NOW, () => true);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Divya');
    expect(rows[0].view).toBe('friends');
  });

  it('keeps only the views asked for', () => {
    const edges = [edge('uidDivya', 'friends', ME), edge('uidRohan', 'pending', 'uidRohan')];
    expect(rowsFrom(ME, edges, people, NOW, (v) => v === 'incoming')).toHaveLength(1);
    expect(rowsFrom(ME, edges, people, NOW, (v) => v === 'incoming')[0].name).toBe('Rohan');
  });

  it('drops an edge whose profile has not arrived yet', () => {
    // Profiles come a request behind the edges; a nameless card that fills in
    // later is worse than one that appears late.
    expect(rowsFrom(ME, [edge('uidGhost', 'friends', ME)], people, NOW, () => true)).toEqual([]);
  });

  it('is empty for someone with no relationships', () => {
    expect(rowsFrom(ME, [], people, NOW, () => true)).toEqual([]);
  });
});

describe('ordering', () => {
  const row = (name: string, online: boolean): PersonRow => ({
    key: name,
    name,
    mark: '◆',
    gi: 0,
    level: 1,
    sub: '',
    online,
    view: 'friends',
  });

  it('puts whoever is online first, then alphabetical', () => {
    const sorted = sortForPlaying([row('Zed', false), row('Anu', false), row('Meera', true)]);
    expect(sorted.map((r) => r.name)).toEqual(['Meera', 'Anu', 'Zed']);
  });

  it('does not mutate the list it was given', () => {
    const rows = [row('Zed', false), row('Anu', true)];
    sortForPlaying(rows);
    expect(rows[0].name).toBe('Zed');
  });

  it('answers the longest-waiting request first', () => {
    const edges = [edge('b', 'pending', 'b', NOW), edge('c', 'pending', 'c', NOW - 5000)];
    expect(sortRequests(edges)[0].pair).toContain('c');
  });
});

describe('primaryAction', () => {
  it('offers the one thing that makes sense for each relationship', () => {
    expect(primaryAction('none')).toBe('add');
    expect(primaryAction('incoming')).toBe('accept');
    expect(primaryAction('outgoing')).toBe('cancel');
    expect(primaryAction('friends')).toBe('message');
  });

  it('offers nothing on either side of a block', () => {
    expect(primaryAction('blocked')).toBe('none');
    expect(primaryAction('blockedBy')).toBe('none');
  });

  it('never offers Add to someone already a friend', () => {
    // This is exactly what happened while each screen decided for itself.
    expect(primaryAction('friends')).not.toBe('add');
    expect(primaryAction('outgoing')).not.toBe('add');
    expect(primaryAction('incoming')).not.toBe('add');
  });
});

describe('filterRows', () => {
  const rows: PersonRow[] = [
    { key: '1', name: 'Divya', handle: 'divya_k', mark: '▲', gi: 1, level: 1, sub: '', online: true, view: 'friends' },
    { key: '2', name: 'Rohan', handle: 'ro', mark: '■', gi: 2, level: 1, sub: '', online: false, view: 'friends' },
  ];

  it('returns everything for an empty query', () => {
    expect(filterRows(rows, '   ')).toHaveLength(2);
  });

  it('matches name or handle, case-insensitively', () => {
    expect(filterRows(rows, 'div')).toHaveLength(1);
    expect(filterRows(rows, 'DIV')).toHaveLength(1);
    expect(filterRows(rows, 'ro')).toHaveLength(1);
  });

  it('ignores a leading @, which is how people type a handle', () => {
    expect(filterRows(rows, '@divya')).toHaveLength(1);
  });

  it('is empty when nothing matches', () => {
    expect(filterRows(rows, 'zzz')).toEqual([]);
  });
});

describe('ago', () => {
  it('reads as the inbox stamps it', () => {
    expect(ago(NOW - 30_000, NOW)).toBe('now');
    expect(ago(NOW - 2 * 60_000, NOW)).toBe('2m');
    expect(ago(NOW - 18 * 60_000, NOW)).toBe('18m');
    expect(ago(NOW - 3_600_000, NOW)).toBe('1h');
    expect(ago(NOW - 3 * 24 * 3_600_000, NOW)).toBe('3d');
  });

  it('never reads as the future when the clocks disagree', () => {
    // Phone and server drift by seconds routinely; "in 4s" looks like a bug.
    expect(ago(NOW + 4000, NOW)).toBe('now');
  });
});
