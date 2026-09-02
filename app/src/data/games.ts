export type Category = 'Deduction' | 'Board' | 'Arcade';

export interface Game {
  name: string;
  cat: Category;
  players: string;
  /** SVG path data, drawn on a 24×24 viewBox. */
  d: string;
}

const raw: [string, Category, string, string][] = [
  ['Imposter Word', 'Deduction', '4–10', 'M4 6h16M12 6v12M8 18h8'],
  ['Imposter Video', 'Deduction', '4–8', 'M5 4l14 8-14 8z'],
  [
    'Imposter Quiz',
    'Deduction',
    '4–10',
    'M9 9a3 3 0 114 2.8V13M12 17v.01M3 12a9 9 0 1018 0 9 9 0 00-18 0',
  ],
  ["Liar's Bar", 'Deduction', '3–6', 'M6 3h12l-1.5 8a4.5 4.5 0 01-9 0L6 3zM12 15v6M8 21h8'],
  ['Guess Who I Am', 'Deduction', '3–8', 'M12 3a4 4 0 100 8 4 4 0 000-8zM4 21a8 8 0 0116 0M18 5h4M20 3v4'],
  [
    'GeoGuesser',
    'Deduction',
    '2–8',
    'M3 12a9 9 0 1018 0 9 9 0 00-18 0M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18',
  ],
  ['UNO', 'Board', '2–6', 'M8 4h8a2 2 0 012 2v12a2 2 0 01-2 2H8a2 2 0 01-2-2V6a2 2 0 012-2zM12 8v8M9.5 12h5'],
  ['Ludo', 'Board', '2–4', 'M4 4h16v16H4zM7.6 7.6h2.2v2.2H7.6zM10.9 10.9h2.2v2.2h-2.2zM14.2 14.2h2.2v2.2h-2.2z'],
  ['Snakes & Ladders', 'Board', '2–4', 'M6 21V3M14 21V3M6 8h8M6 13h8M6 18h8M18 5c2 3-2 5 0 8s-2 5 0 8'],
  ['Chess', 'Board', '2', 'M12 3v4M10 5h4M6 21h12l1-9-4 3-3-5-3 5-4-3z'],
  [
    'Carrom',
    'Board',
    '2–4',
    'M4 4h16v16H4zM14.4 12a2.4 2.4 0 11-4.8 0 2.4 2.4 0 014.8 0M6.8 6.8h1.8v1.8H6.8zM15.4 15.4h1.8v1.8h-1.8z',
  ],
  [
    'Connect 4',
    'Board',
    '2',
    'M4 5h16v14H4zM9.2 9.6a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0M13.5 9.6a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0M17.8 14.4a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0M9.2 14.4a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0',
  ],
  ['3D Tank War', 'Arcade', '2–8', 'M3 15h14v-4H3zM7 11V8h6v3M17 13h4M5 19h10'],
  ['Gravity Flip', 'Arcade', '2–4', 'M12 3v8M9 8l3 3 3-3M6 21h12M12 14v3'],
];

export const GAMES: Game[] = raw.map(([name, cat, players, d]) => ({ name, cat, players, d }));

export const CATEGORIES: Category[] = ['Deduction', 'Board', 'Arcade'];

export function gameByName(name: string): Game {
  return GAMES.find((g) => g.name === name) ?? GAMES[2];
}

/** Category accent. Deduction indigo, Board cyan, Arcade teal. */
export const NEON: Record<Category, string> = {
  Deduction: 'var(--acc)',
  Board: 'var(--cyan)',
  Arcade: 'var(--lime)',
};

/**
 * Category accent for labels sitting on a fixed dark chip. Those chips stay dark
 * in Day mode, so they need the light accent in both themes — `NEON` resolves to
 * a deep tone in Day mode and would drop to about 2.4:1 there.
 */
export const NEON_ON_DARK: Record<Category, string> = {
  Deduction: '#8ba4ff',
  Board: '#4dd4f0',
  Arcade: '#34d3a6',
};

/** The tinted-glass fill behind a game's glyph. */
export const DIM: Record<Category, string> = {
  Deduction: 'linear-gradient(160deg,rgba(139,164,255,.36),rgba(139,164,255,.1))',
  Board: 'linear-gradient(160deg,rgba(77,212,240,.34),rgba(77,212,240,.09))',
  Arcade: 'linear-gradient(160deg,rgba(52,211,166,.34),rgba(52,211,166,.09))',
};

export const CAT_ICON: Record<Category, string> = {
  Deduction: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6zM14.4 12a2.4 2.4 0 11-4.8 0 2.4 2.4 0 014.8 0',
  Board: 'M4 4h16v16H4zM7.6 7.6h2.2v2.2H7.6zM14.2 14.2h2.2v2.2h-2.2z',
  Arcade: 'M2 7h20v11H2zM7 12.5h3M8.5 11v3M16 11.5v.01M18 13.5v.01',
};

/** The "Continue playing" rail on Home. */
export const FEATURED = ['Imposter Quiz', 'GeoGuesser', 'Connect 4', "Liar's Bar", 'UNO'];

export const GAME_LEVEL: Record<string, string> = {
  'Imposter Quiz': 'LVL 12',
  GeoGuesser: 'NEW',
  'Connect 4': 'LVL 7',
  UNO: 'LVL 4',
  "Liar's Bar": 'LVL 9',
};

export const GAME_XP: Record<string, string> = {
  'Imposter Quiz': '72%',
  GeoGuesser: '4%',
  'Connect 4': '45%',
  UNO: '28%',
  "Liar's Bar": '61%',
};

export const RULES: Record<string, string[]> = {
  'Imposter Quiz': [
    'Everyone gets the same question — except one player, who gets a different one.',
    "Answer out loud as if your question were the same as everyone else's.",
    'Discuss, then vote. The odd one wins by surviving; the table wins by catching them.',
  ],
  UNO: [
    'Match the top card by colour or number.',
    'Skip, reverse and +2 pass the pain along. Wilds let you pick the colour.',
    'No playable card means you draw one. First to empty their hand wins.',
  ],
  'Connect 4': [
    'Take turns dropping a disc into a column.',
    'Discs stack from the bottom up.',
    'Four in a line — across, down or diagonal — wins.',
  ],
  GeoGuesser: [
    'You get a street view and no labels.',
    'Drop a pin where you think it is.',
    'Closest guess takes the round. Three rounds per match.',
  ],
};
