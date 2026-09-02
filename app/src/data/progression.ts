/** Avatar tints sold in the shop. Cost 0 means owned from the start. */
export interface Tint {
  name: string;
  grad: string;
  cost: number;
}

export const TINTS: Tint[] = [
  { name: 'Indigo', grad: 'linear-gradient(160deg,#7d92f0,#3f4fbe)', cost: 0 },
  { name: 'Coral', grad: 'linear-gradient(160deg,#ec8a6a,#b84a44)', cost: 0 },
  { name: 'Teal', grad: 'linear-gradient(160deg,#3fb99a,#136a5c)', cost: 0 },
  { name: 'Amber', grad: 'linear-gradient(160deg,#dfa25e,#b06a2e)', cost: 0 },
  { name: 'Violet', grad: 'linear-gradient(160deg,#a78cf0,#5b3fb8)', cost: 1200 },
  { name: 'Rose', grad: 'linear-gradient(160deg,#dc7aa8,#9c3c68)', cost: 1200 },
  { name: 'Frost', grad: 'linear-gradient(160deg,#dbe6ff,#8ba4ff)', cost: 2400 },
  { name: 'Obsidian', grad: 'linear-gradient(160deg,#4a5368,#151a24)', cost: 3600 },
];

export type TierState = 'unlocked' | 'claim' | 'locked';

export interface SeasonTier {
  lvl: number;
  name: string;
  state: TierState;
}

export const SEASON: SeasonTier[] = [
  { lvl: 1, name: 'Coral tint', state: 'unlocked' },
  { lvl: 4, name: 'Rose tint', state: 'unlocked' },
  { lvl: 8, name: 'Frost tint', state: 'claim' },
  { lvl: 12, name: 'Glass table skin', state: 'locked' },
  { lvl: 16, name: 'Obsidian tint', state: 'locked' },
  { lvl: 20, name: 'Season badge', state: 'locked' },
];

/** Claiming the level-8 tier is what unlocks Frost in the shop. */
export const FROST_TIER = 8;

export interface Award {
  name: string;
  sub: string;
  d: string;
  tint: string;
}

/** Post-game highlights on the results screen. */
export const AWARDS: Award[] = [
  {
    name: 'Straight face',
    sub: 'Never once broke character',
    d: 'M12 3l2.4 6.2H21l-5.2 4 1.9 6.3L12 15.8 6.3 19.5l1.9-6.3-5.2-4h6.6z',
    tint: 'var(--acc)',
  },
  { name: 'Fastest lock-in', sub: 'Answered in 4 seconds', d: 'M13 2L4 14h6l-1 8 9-12h-6z', tint: 'var(--cyan)' },
  {
    name: 'Vote magnet',
    sub: 'Took 2 votes and survived',
    d: 'M12 20s-7-4.6-7-9a4 4 0 017-2.6A4 4 0 0119 11c0 4.4-7 9-7 9z',
    tint: 'var(--pink)',
  },
];

/** Friday Cup — quarters, semis, final. */
export const BRACKET: [string, string][][] = [
  [
    ['Divya', 'Karthik'],
    ['Rohan', 'Sanjay'],
    ['Meera', 'Nithya'],
    ['Arjun', 'Aditya'],
  ],
  [
    ['Divya', 'Rohan'],
    ['Meera', 'Arjun'],
  ],
  [['Divya', 'Arjun']],
];

export const ROUND_LABELS = ['QUARTERS', 'SEMIS', 'FINAL'];

/** Achievement glyphs shown on both profile screens. */
export const BADGES = [
  { name: 'Straight face', neon: 'var(--acc)', d: 'M12 3l2.4 6.2H21l-5.2 4 1.9 6.3L12 15.8 6.3 19.5l1.9-6.3-5.2-4h6.6z' },
  { name: 'Fast talker', neon: 'var(--cyan)', d: 'M13 2L4 14h6l-1 8 9-12h-6z' },
  { name: 'Vote magnet', neon: 'var(--pink)', d: 'M12 20s-7-4.6-7-9a4 4 0 017-2.6A4 4 0 0119 11c0 4.4-7 9-7 9z' },
  { name: 'Board shark', neon: 'var(--lime)', d: 'M4 4h16v16H4zM7.6 7.6h2.2v2.2H7.6zM14.2 14.2h2.2v2.2h-2.2z' },
  { name: 'Night owl', neon: 'var(--gold)', d: 'M20 14a8 8 0 11-9.9-9.9A6.5 6.5 0 0020 14z' },
];

export const PREFS = [
  { key: 'sound' as const, name: 'Sound effects', hint: 'Dice, cards, buzzers', neon: 'var(--acc)', d: 'M11 5L6 9H3v6h3l5 4zM16 9a4 4 0 010 6' },
  { key: 'haptic' as const, name: 'Haptics', hint: 'Buzz on your turn', neon: 'var(--g2)', d: 'M7 4h10v16H7zM11 18h2' },
  {
    key: 'push' as const,
    name: 'Lobby invites',
    hint: 'Push when friends open a room',
    neon: 'var(--ink)',
    d: 'M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8M10.5 20a2 2 0 003 0',
  },
  { key: 'fast' as const, name: 'Fast reveal', hint: 'Skip vote animations', neon: 'var(--g2)', d: 'M13 2L4 14h6l-1 8 9-12h-6z' },
];

export interface InboxItem {
  kind: 'inv' | 'req' | 'res';
  who: string;
  mark: string;
  gi: number;
  title: string;
  sub: string;
  when: string;
  act: string;
}

export const INBOX: InboxItem[] = [
  { kind: 'inv', who: 'Divya', mark: '▲', gi: 1, title: 'Lobby invite · UNO', sub: '4 seats · 2 taken', when: '2m', act: 'Join' },
  { kind: 'req', who: 'Aditya', mark: '◈', gi: 6, title: 'Friend request', sub: '3 mutual friends', when: '18m', act: 'Accept' },
  {
    kind: 'inv',
    who: 'Rohan',
    mark: '■',
    gi: 2,
    title: 'Lobby invite · Imposter Quiz',
    sub: '5 seats · 4 taken',
    when: '1h',
    act: 'Join',
  },
  { kind: 'res', who: 'Meera', mark: '●', gi: 3, title: 'Beat your Chess record', sub: '12 wins this season', when: '3h', act: 'View' },
];

/** A stable identity for an inbox row, so dismissals survive re-renders. */
export const inboxId = (x: InboxItem) => x.who + x.title;
