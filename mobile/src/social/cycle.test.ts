import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  can,
  GOAL,
  satisfied,
  canSee,
  CycleError,
  next,
  otherIn,
  pairId,
  pairOf,
  parseEdge,
  reconcileCrossedRequests,
  viewFor,
  type Action,
  type Edge,
  type View,
} from './cycle';

const ME = 'uidAnush';
const THEM = 'uidDivya';
const NOW = 1_788_600_000_000;

const edge = (state: Edge['state'], by: string): Edge => ({
  pair: pairOf(ME, THEM),
  state,
  by,
  at: NOW,
});

describe('pairId', () => {
  it('is the same from either side', () => {
    expect(pairId(ME, THEM)).toBe(pairId(THEM, ME));
  });

  it('refuses to relate an account to itself', () => {
    expect(() => pairId(ME, ME)).toThrow(CycleError);
  });

  it('refuses an empty uid', () => {
    expect(() => pairId(ME, '')).toThrow(CycleError);
    expect(() => pairId('', THEM)).toThrow(CycleError);
  });
});

describe('otherIn', () => {
  it('returns the far side', () => {
    expect(otherIn(edge('friends', ME), ME)).toBe(THEM);
    expect(otherIn(edge('friends', ME), THEM)).toBe(ME);
  });

  it('rejects a relationship you are not in', () => {
    expect(() => otherIn(edge('friends', ME), 'someoneElse')).toThrow(CycleError);
  });
});

describe('viewFor', () => {
  it('reads no document as strangers', () => {
    expect(viewFor(ME, null)).toBe('none');
    expect(viewFor(ME, undefined)).toBe('none');
  });

  it('shows one pending request as outgoing to the sender and incoming to the receiver', () => {
    // The whole point of one shared document: one fact, two points of view.
    const e = edge('pending', ME);
    expect(viewFor(ME, e)).toBe('outgoing');
    expect(viewFor(THEM, e)).toBe('incoming');
  });

  it('shows friends to both', () => {
    const e = edge('friends', ME);
    expect(viewFor(ME, e)).toBe('friends');
    expect(viewFor(THEM, e)).toBe('friends');
  });

  it('distinguishes blocking from being blocked', () => {
    const e = edge('blocked', ME);
    expect(viewFor(ME, e)).toBe('blocked');
    expect(viewFor(THEM, e)).toBe('blockedBy');
  });

  it('treats a relationship between two other people as none', () => {
    // A stale list should render "add", not crash.
    expect(viewFor('stranger', edge('friends', ME))).toBe('none');
  });
});

describe('the cycle, end to end', () => {
  it('runs request -> accept -> friends', () => {
    const sent = next('request', ME, THEM, null, NOW);
    expect(viewFor(ME, sent)).toBe('outgoing');
    expect(viewFor(THEM, sent)).toBe('incoming');

    const accepted = next('accept', THEM, ME, sent, NOW + 1);
    expect(viewFor(ME, accepted)).toBe('friends');
    expect(viewFor(THEM, accepted)).toBe('friends');
  });

  it('runs request -> decline -> strangers', () => {
    const sent = next('request', ME, THEM, null, NOW);
    expect(next('decline', THEM, ME, sent, NOW + 1)).toBeNull();
  });

  it('lets the sender cancel', () => {
    const sent = next('request', ME, THEM, null, NOW);
    expect(next('cancel', ME, THEM, sent, NOW + 1)).toBeNull();
  });

  it('lets either friend remove the other', () => {
    const f = edge('friends', ME);
    expect(next('remove', ME, THEM, f, NOW)).toBeNull();
    expect(next('remove', THEM, ME, f, NOW)).toBeNull();
  });

  it('runs block -> unblock -> strangers', () => {
    const blocked = next('block', ME, THEM, null, NOW);
    expect(viewFor(ME, blocked)).toBe('blocked');
    expect(next('unblock', ME, THEM, blocked, NOW + 1)).toBeNull();
  });

  it('lets a block replace an existing friendship', () => {
    const blocked = next('block', ME, THEM, edge('friends', ME), NOW);
    expect(viewFor(ME, blocked)).toBe('blocked');
    expect(viewFor(THEM, blocked)).toBe('blockedBy');
  });
});

describe('illegal moves', () => {
  it('refuses to accept your own request', () => {
    const sent = next('request', ME, THEM, null, NOW);
    expect(() => next('accept', ME, THEM, sent, NOW + 1)).toThrow(CycleError);
  });

  it('refuses a second request while one is pending', () => {
    const sent = next('request', ME, THEM, null, NOW);
    expect(() => next('request', ME, THEM, sent, NOW + 1)).toThrow(CycleError);
  });

  it('refuses to request someone who already blocked you', () => {
    expect(() => next('request', THEM, ME, edge('blocked', ME), NOW)).toThrow(CycleError);
  });

  it('does not tell you that you were blocked', () => {
    // Same wording as any other unavailable account — a block that announces
    // itself is not a block.
    let message = '';
    try {
      next('request', THEM, ME, edge('blocked', ME), NOW);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toBe('That account is not available.');
    expect(message).not.toMatch(/block/i);
  });

  it('refuses to unblock someone who blocked you', () => {
    expect(() => next('unblock', THEM, ME, edge('blocked', ME), NOW)).toThrow(CycleError);
  });

  it('refuses to add yourself', () => {
    expect(() => next('request', ME, ME, null, NOW)).toThrow(CycleError);
  });

  it('names the transition it refused', () => {
    try {
      next('accept', ME, THEM, null, NOW);
      expect.unreachable();
    } catch (e) {
      expect((e as CycleError).reason).toBe('accept-from-none');
    }
  });
});

describe('two requests that cross in flight', () => {
  it('becomes a friendship rather than two stuck outgoing requests', () => {
    // Both tap Add at the same moment. Without this, each sees "outgoing" and
    // neither can accept, because accepting your own request is illegal.
    const theirs = next('request', THEM, ME, null, NOW);
    const resolved = reconcileCrossedRequests(ME, THEM, theirs, NOW + 1);
    expect(resolved).not.toBeNull();
    expect(viewFor(ME, resolved)).toBe('friends');
    expect(viewFor(THEM, resolved)).toBe('friends');
  });

  it('stays out of the way when there is nothing to reconcile', () => {
    expect(reconcileCrossedRequests(ME, THEM, null, NOW)).toBeNull();
    expect(reconcileCrossedRequests(ME, THEM, edge('friends', THEM), NOW)).toBeNull();
    expect(reconcileCrossedRequests(ME, THEM, edge('blocked', THEM), NOW)).toBeNull();
    // Your own pending request is the normal path, not a crossed one.
    expect(reconcileCrossedRequests(ME, THEM, edge('pending', ME), NOW)).toBeNull();
  });
});

describe('what a screen may offer', () => {
  it('offers exactly the legal actions for every view', () => {
    const views: View[] = ['none', 'outgoing', 'incoming', 'friends', 'blocked', 'blockedBy'];
    for (const v of views) {
      for (const a of ACTIONS[v]) expect(can(v, a)).toBe(true);
    }
    expect(can('none', 'accept')).toBe(false);
    expect(can('friends', 'request')).toBe(false);
    expect(ACTIONS.blockedBy).toEqual([]);
  });

  it('every offered action is actually legal in `next`', () => {
    // Guards against the button list and the state machine drifting apart.
    const cases: [View, Edge | null][] = [
      ['none', null],
      ['outgoing', edge('pending', ME)],
      ['incoming', edge('pending', THEM)],
      ['friends', edge('friends', ME)],
      ['blocked', edge('blocked', ME)],
    ];
    for (const [view, e] of cases) {
      for (const action of ACTIONS[view]) {
        expect(() => next(action, ME, THEM, e, NOW), `${action} from ${view}`).not.toThrow();
      }
    }
  });

  it('hides both sides of a block from each other', () => {
    expect(canSee('blocked')).toBe(false);
    expect(canSee('blockedBy')).toBe(false);
    expect(canSee('none')).toBe(true);
    expect(canSee('friends')).toBe(true);
    expect(canSee('incoming')).toBe(true);
  });
});

describe('parseEdge', () => {
  it('reads a well-formed document', () => {
    const e = edge('pending', ME);
    expect(parseEdge(JSON.parse(JSON.stringify(e)))).toEqual(e);
  });

  it('rejects anything malformed rather than half-trusting it', () => {
    expect(parseEdge(null)).toBeNull();
    expect(parseEdge('nope')).toBeNull();
    expect(parseEdge({})).toBeNull();
    expect(parseEdge({ pair: [ME], state: 'friends', by: ME })).toBeNull();
    expect(parseEdge({ pair: [ME, THEM], state: 'married', by: ME })).toBeNull();
    // `by` has to be one of the two people, or `viewFor` cannot resolve a side.
    expect(parseEdge({ pair: [ME, THEM], state: 'pending', by: 'someoneElse' })).toBeNull();
  });

  it('defaults a missing timestamp instead of dropping the document', () => {
    expect(parseEdge({ pair: [ME, THEM], state: 'friends', by: ME })?.at).toBe(0);
  });
});

describe('satisfied', () => {
  it('recognises when an action has already happened', () => {
    expect(satisfied('request', 'outgoing')).toBe(true);
    expect(satisfied('accept', 'friends')).toBe(true);
    expect(satisfied('decline', 'none')).toBe(true);
    expect(satisfied('cancel', 'none')).toBe(true);
    expect(satisfied('remove', 'none')).toBe(true);
    expect(satisfied('block', 'blocked')).toBe(true);
    expect(satisfied('unblock', 'none')).toBe(true);
  });

  it('counts a request the far side already accepted as satisfied', () => {
    // You asked to be friends; you are friends. Not an error.
    expect(satisfied('request', 'friends')).toBe(true);
  });

  it('does not paper over an action that genuinely has not happened', () => {
    expect(satisfied('accept', 'incoming')).toBe(false);
    expect(satisfied('accept', 'outgoing')).toBe(false);
    expect(satisfied('request', 'none')).toBe(false);
    expect(satisfied('remove', 'friends')).toBe(false);
    expect(satisfied('block', 'friends')).toBe(false);
  });

  it('has a goal for every action', () => {
    const actions: Action[] = ['request', 'accept', 'decline', 'cancel', 'remove', 'block', 'unblock'];
    for (const a of actions) expect(GOAL[a], a).toBeTruthy();
  });
});
