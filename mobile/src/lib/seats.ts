import { GRADBOT, MARKS, OTHERS, grad } from '../data/people';
import { TINTS } from '../data/progression';
import { seatCount, type State } from '../store/store';

export interface Seat {
  name: string;
  mark: string;
  grad: string;
  markColor: string;
  ring: string;
  ringGlow: string;
  tag: string | null;
  tagBg: string;
  tagColor: string;
  color: string;
  sub: string;
  kind: 'you' | 'human' | 'bot' | 'invite';
}

/**
 * Who is around the table. Humans fill from the host outwards as they join;
 * remaining seats become bots, or dashed "Invite" slots in friends-only mode.
 */
export function buildSeats(s: State): { seats: Seat[]; count: number; filled: number; canStart: boolean; joinedLabel: string } {
  const count = seatCount(s);
  const humans = s.mode === 'bots' ? 1 : Math.min(s.joined, count);
  const seats: Seat[] = [];

  for (let i = 0; i < count; i++) {
    if (i < humans) {
      const host = i === 0;
      const p = host
        ? { name: s.myName, mark: MARKS[s.mark], gi: s.tint }
        : OTHERS[(i - 1) % OTHERS.length];
      seats.push({
        name: p.name,
        mark: p.mark,
        grad: host ? TINTS[s.tint].grad : grad(p.gi),
        markColor: '#fff',
        ring: host ? 'var(--ink)' : 'rgba(255,255,255,.14)',
        ringGlow: host ? '0 0 14px rgba(150,180,255,.6)' : 'none',
        tag: host ? 'HOST' : null,
        tagBg: 'var(--ink)',
        tagColor: 'var(--onAcc)',
        color: 'var(--ink)',
        sub: host ? 'You · host' : 'Ready',
        kind: host ? 'you' : 'human',
      });
    } else if (s.mode !== 'friends') {
      seats.push({
        name: `Bot ${i - humans + 1}`,
        mark: 'B',
        grad: GRADBOT,
        markColor: 'var(--onAcc)',
        ring: 'rgba(150,180,255,.5)',
        ringGlow: '0 0 12px rgba(150,180,255,.5)',
        tag: 'BOT',
        tagBg: 'var(--g2)',
        tagColor: 'var(--onAcc)',
        color: 'var(--ink)',
        sub: s.diff,
        kind: 'bot',
      });
    } else {
      seats.push({
        name: 'Invite',
        mark: '+',
        grad: 'transparent',
        markColor: 'var(--dim2)',
        ring: 'rgba(255,255,255,.2)',
        ringGlow: 'none',
        tag: null,
        tagBg: '',
        tagColor: '',
        color: 'var(--dim2)',
        sub: 'Tap to add',
        kind: 'invite',
      });
    }
  }

  const filled = seats.filter((x) => x.kind !== 'invite').length;
  const canStart = filled >= Math.min(s.cat === 'Deduction' ? 4 : 2, count);
  const bots = count - humans;

  const joinedLabel =
    s.mode === 'friends'
      ? `${filled} of ${count} joined`
      : `${humans} ${humans === 1 ? 'player' : 'players'} · ${bots} ${bots === 1 ? 'bot' : 'bots'}`;

  return { seats, count, filled, canStart, joinedLabel };
}
