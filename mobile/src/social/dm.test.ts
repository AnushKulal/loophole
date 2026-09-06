import { describe, expect, it } from 'vitest';
import {
  canMessage,
  cleanMessage,
  isUnread,
  MAX_LEN,
  messageId,
  messageProblem,
  orderMessages,
  previewFor,
  readId,
  sortThreads,
  unreadCount,
  type Message,
  type ThreadPreview,
} from './dm';

const ME = 'uidAnush';
const THEM = 'uidDivya';
const PAIR = 'uidAnush_uidDivya';
const NOW = 1_788_600_000_000;

const msg = (at: number, by: string, text = 'hi'): Message => ({
  id: messageId(at, by),
  by,
  text,
  at,
});

describe('messageId', () => {
  it('sorts chronologically as a string', () => {
    const early = messageId(NOW, ME);
    const later = messageId(NOW + 1, ME);
    expect([later, early].sort()).toEqual([early, later]);
  });

  it('still sorts correctly when the timestamp gains a digit', () => {
    // A 13-digit millisecond stamp sorts "9…" after "10…" without padding —
    // a bug that would first appear in 2286 and be miserable to find.
    expect([messageId(10_000_000_000_000, ME), messageId(9_999_999_999_999, ME)].sort()[0]).toBe(
      messageId(9_999_999_999_999, ME),
    );
  });

  it('separates two people sending in the same millisecond', () => {
    expect(messageId(NOW, ME)).not.toBe(messageId(NOW, THEM));
  });

  it('is the same for a resend, so a retry is not a duplicate', () => {
    expect(messageId(NOW, ME)).toBe(messageId(NOW, ME));
  });

  it('survives a nonsense timestamp rather than producing a broken id', () => {
    expect(messageId(-5, ME)).toMatch(/^0{15}_/);
    expect(messageId(NOW + 0.7, ME)).toBe(messageId(NOW, ME));
  });
});

describe('messageProblem', () => {
  it('accepts an ordinary message', () => {
    expect(messageProblem('code incoming')).toBeNull();
  });

  it('refuses an empty one, including whitespace', () => {
    expect(messageProblem('')).toMatch(/nothing/i);
    expect(messageProblem('   ')).toMatch(/nothing/i);
  });

  it('refuses an essay', () => {
    expect(messageProblem('x'.repeat(MAX_LEN + 1))).toMatch(/500/);
    expect(messageProblem('x'.repeat(MAX_LEN))).toBeNull();
  });

  it('trims and clamps what does get sent', () => {
    expect(cleanMessage('  hi  ')).toBe('hi');
    expect(cleanMessage('x'.repeat(600))).toHaveLength(MAX_LEN);
  });
});

describe('orderMessages', () => {
  it('sorts by time', () => {
    const out = orderMessages([msg(NOW + 2, ME), msg(NOW, THEM), msg(NOW + 1, ME)]);
    expect(out.map((m) => m.at)).toEqual([NOW, NOW + 1, NOW + 2]);
  });

  it('breaks a tie by id so the order does not flip between refreshes', () => {
    // Two people in the same millisecond is not rare enough to leave to
    // whatever order the query happened to return.
    const a = msg(NOW, ME);
    const b = msg(NOW, THEM);
    expect(orderMessages([a, b])).toEqual(orderMessages([b, a]));
  });

  it('drops duplicates, which a retried send produces', () => {
    const m = msg(NOW, ME);
    expect(orderMessages([m, { ...m }])).toHaveLength(1);
  });

  it('ignores malformed entries instead of rendering them', () => {
    expect(orderMessages([msg(NOW, ME), { id: '', by: ME, text: 'x', at: 1 } as Message])).toHaveLength(1);
    expect(orderMessages([{ id: 'a', by: '', text: 'x', at: 1 } as Message])).toEqual([]);
  });

  it('is empty for an empty thread', () => {
    expect(orderMessages([])).toEqual([]);
  });
});

describe('isUnread', () => {
  it('is true for something they sent after you last looked', () => {
    expect(isUnread({ lastAt: NOW, lastBy: THEM }, ME, NOW - 1000)).toBe(true);
  });

  it('is false once you have read it', () => {
    expect(isUnread({ lastAt: NOW, lastBy: THEM }, ME, NOW)).toBe(false);
    expect(isUnread({ lastAt: NOW, lastBy: THEM }, ME, NOW + 1)).toBe(false);
  });

  it('never counts your own message', () => {
    // Sending something and watching your own conversation go unread is the
    // small wrongness that makes a badge get ignored.
    expect(isUnread({ lastAt: NOW, lastBy: ME }, ME, 0)).toBe(false);
  });

  it('is false for a thread with nothing in it', () => {
    expect(isUnread({ lastAt: 0, lastBy: '' }, ME, 0)).toBe(false);
  });
});

describe('previewFor', () => {
  it('resolves the other person and the unread flag', () => {
    const p = previewFor(PAIR, ME, { pair: [ME, THEM], lastText: 'code?', lastAt: NOW, lastBy: THEM }, 0);
    expect(p).toEqual({
      pair: PAIR,
      other: THEM,
      lastText: 'code?',
      lastAt: NOW,
      lastBy: THEM,
      unread: true,
    });
  });

  it('works from either side', () => {
    const data = { pair: [ME, THEM], lastText: 'x', lastAt: NOW, lastBy: ME };
    expect(previewFor(PAIR, THEM, data, 0)?.other).toBe(ME);
  });

  it('rejects a thread you are not in', () => {
    expect(previewFor(PAIR, 'stranger', { pair: [ME, THEM] }, 0)).toBeNull();
  });

  it('rejects a malformed document rather than half-rendering it', () => {
    expect(previewFor(PAIR, ME, {}, 0)).toBeNull();
    expect(previewFor(PAIR, ME, { pair: [ME] }, 0)).toBeNull();
  });

  it('handles a thread created but never written to', () => {
    const p = previewFor(PAIR, ME, { pair: [ME, THEM] }, 0);
    expect(p?.lastText).toBe('');
    expect(p?.unread).toBe(false);
  });
});

describe('the messages list', () => {
  const preview = (other: string, lastAt: number, unread = false): ThreadPreview => ({
    pair: `${ME}_${other}`,
    other,
    lastText: 'x',
    lastAt,
    lastBy: other,
    unread,
  });

  it('puts the newest conversation first', () => {
    const sorted = sortThreads([preview('a', NOW - 5000), preview('b', NOW), preview('c', NOW - 100)]);
    expect(sorted.map((p) => p.other)).toEqual(['b', 'c', 'a']);
  });

  it('does not mutate what it was given', () => {
    const list = [preview('a', 1), preview('b', 2)];
    sortThreads(list);
    expect(list[0].other).toBe('a');
  });

  it('counts only the unread ones', () => {
    expect(unreadCount([preview('a', 1, true), preview('b', 2), preview('c', 3, true)])).toBe(2);
    expect(unreadCount([])).toBe(0);
  });
});

describe('who may message whom', () => {
  it('is friends only', () => {
    expect(canMessage('friends')).toBe(true);
    for (const v of ['none', 'incoming', 'outgoing', 'blocked', 'blockedBy']) {
      expect(canMessage(v), v).toBe(false);
    }
  });
});

describe('readId', () => {
  it('is one document per person per conversation', () => {
    expect(readId(ME, PAIR)).toBe(`${ME}_${PAIR}`);
    expect(readId(ME, PAIR)).not.toBe(readId(THEM, PAIR));
  });
});
