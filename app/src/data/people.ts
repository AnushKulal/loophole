/** The eight player marks you can pick during onboarding. */
export const MARKS = ['◆', '▲', '■', '●', '◐', '✦', '◧', '☰'];

/** Solid tinted-glass avatar fills, indexed by a player's grad index. */
export const GRADS = [
  'linear-gradient(160deg,#7d92f0,#3f4fbe)',
  'linear-gradient(160deg,#ec8a6a,#b84a44)',
  'linear-gradient(160deg,#57b7d8,#1f6c9c)',
  'linear-gradient(160deg,#3fb99a,#136a5c)',
  'linear-gradient(160deg,#dfa25e,#b06a2e)',
  'linear-gradient(160deg,#a78cf0,#5b3fb8)',
  'linear-gradient(160deg,#dc7aa8,#9c3c68)',
  'linear-gradient(160deg,#6d9ce0,#2f5aa8)',
];

export const grad = (i: number) => GRADS[i % GRADS.length];

/** The indigo glass used for primary buttons and your own pieces. */
export const GRADV =
  'linear-gradient(160deg,rgba(168,186,255,.6),rgba(112,132,242,.34) 45%,rgba(92,112,224,.24))';

/** Bots read as cyan-teal glass. */
export const GRADBOT = 'linear-gradient(160deg,rgba(120,220,245,.7),rgba(52,211,166,.35))';

export interface Person {
  name: string;
  mark: string;
  gi: number;
}

/** The four seated opponents, in seat order. */
export const OTHERS: Person[] = [
  { name: 'Divya', mark: '▲', gi: 1 },
  { name: 'Rohan', mark: '■', gi: 2 },
  { name: 'Meera', mark: '●', gi: 3 },
  { name: 'Karthik', mark: '◐', gi: 4 },
];

/** Their answers in the Imposter Quiz reveal, aligned with OTHERS. */
export const ANSWERS: [string, string][] = [
  ['Divya', 'Strawberry'],
  ['Rohan', 'Apple'],
  ['Meera', 'Cherry'],
  ['Karthik', 'Tomato'],
];

export interface Friend {
  name: string;
  mark: string;
  gi: number;
  status: string;
  /** Presence dot — ink when around, faded when not. */
  dot: string;
  lvl: number;
}

export const FRIENDS: Friend[] = [
  { name: 'Divya', mark: '▲', gi: 1, status: 'In a lobby · UNO', dot: 'var(--ink)', lvl: 24 },
  { name: 'Rohan', mark: '■', gi: 2, status: 'Online', dot: 'var(--ink)', lvl: 18 },
  { name: 'Meera', mark: '●', gi: 3, status: 'Playing Chess', dot: 'var(--ink)', lvl: 31 },
  { name: 'Karthik', mark: '◐', gi: 4, status: 'Last seen 2h ago', dot: 'rgba(255,255,255,.3)', lvl: 12 },
  { name: 'Sanjay', mark: '✦', gi: 5, status: 'Online', dot: 'var(--ink)', lvl: 27 },
  { name: 'Nithya', mark: '◧', gi: 6, status: 'Last seen yesterday', dot: 'rgba(255,255,255,.3)', lvl: 9 },
];

export type ThreadLine = ['me' | 'them', string];

/** Opening state of each DM thread. */
export const SEED: Record<string, ThreadLine[]> = {
  Divya: [
    ['them', 'we playing tonight or what'],
    ['me', 'yes. quiz first, i want revenge'],
    ['them', 'you were SO obviously the odd one'],
  ],
  Rohan: [['them', 'add me when you open a room']],
  Meera: [
    ['me', 'chess after this?'],
    ['them', 'only if you promise not to rage quit'],
  ],
  Karthik: [['them', 'tomato IS a fruit']],
  Sanjay: [['them', 'code?']],
  Nithya: [['me', 'game night friday?']],
};

export const REPLIES = ['ok sending code', 'give me 2 min', 'joining now', 'who else is in?', 'i call not-imposter'];

export interface PodiumEntry {
  name: string;
  mark: string;
  rank: string;
  pts: string;
  place: number;
  neon: string;
}

/** Rendered left-to-right: 2nd, 1st (lifted), 3rd. */
export const PODIUM: PodiumEntry[] = [
  { name: 'Rohan', mark: '■', rank: '2nd', pts: '42,800', place: 2, neon: 'var(--cyan)' },
  { name: 'Divya', mark: '▲', rank: '1st', pts: '50,200', place: 1, neon: 'var(--gold)' },
  { name: 'Meera', mark: '●', rank: '3rd', pts: '38,150', place: 3, neon: 'var(--pink)' },
];

export interface RankRow {
  n: number;
  name: string;
  mark: string;
  pts: string;
  bar: string;
  sub: string;
}

export const RANKS: RankRow[] = [
  { n: 4, name: 'Sanjay', mark: '✦', pts: '35,900', bar: '78%', sub: 'Imposter Quiz · 21 wins' },
  { n: 5, name: 'Nithya', mark: '◧', pts: '32,400', bar: '70%', sub: 'Ludo · 18 wins' },
  { n: 6, name: 'Karthik', mark: '◐', pts: '31,050', bar: '66%', sub: 'Chess · 12 wins' },
  { n: 7, name: 'Aditya', mark: '◈', pts: '28,300', bar: '60%', sub: 'UNO · 15 wins' },
  { n: 8, name: 'Priya', mark: '△', pts: '26,700', bar: '55%', sub: 'GeoGuesser · 9 wins' },
  { n: 9, name: 'Vikram', mark: '✧', pts: '24,100', bar: '50%', sub: "Liar's Bar · 11 wins" },
];

export interface Candidate {
  name: string;
  mark: string;
  gi: number;
  why: string;
}

export const CANDIDATES: Candidate[] = [
  { name: 'Aditya', mark: '◈', gi: 6, why: '3 mutual friends' },
  { name: 'Priya', mark: '△', gi: 4, why: '1 mutual friend' },
  { name: 'Vikram', mark: '✧', gi: 2, why: 'Plays Chess nightly' },
  { name: 'Lakshmi', mark: '◇', gi: 3, why: 'From your UNO lobby' },
  { name: 'Suresh', mark: '▣', gi: 5, why: '2 mutual friends' },
  { name: 'Anjali', mark: '✲', gi: 7, why: 'New to Loophole' },
];
