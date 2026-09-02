/**
 * Imposter Word — a one-word-clue deduction round.
 *
 * Every seat is dealt the same secret word except the odd ones out, who get a
 * related but different word from the same pair. In a random order each seat
 * gives a single-word clue about the word they hold, the table talks it over,
 * then everyone votes. The seat with the most votes is ejected: catching an odd
 * one wins it for the table, and surviving wins it for the odd ones.
 *
 * Pure data and pure transitions — no React, no clock, no `Math.random`. Every
 * decision that needs chance takes an `Rng`, so a whole match replays exactly
 * from a seed.
 */

import { pick, shuffle, type BotProfile, type Rng } from './contract';

// ── the word bank ─────────────────────────────────────────────────

export interface WordPair {
  /** The word the table holds. */
  civ: string;
  /** The word the odd one out holds. */
  imp: string;
  /** Clues that describe both words — the safe ground an imposter hides in. */
  both: string[];
  /** Clues that only really fit the civilian word. */
  civOnly: string[];
  /** Clues that only really fit the imposter word — an imposter saying one of
   *  these has told the table exactly which word they are holding. */
  impOnly: string[];
}

/** civilian word, imposter word, shared clues, civilian-only, imposter-only. */
const RAW: [string, string, string, string, string][] = [
  ['Beach', 'Desert', 'sand hot vast sunburn', 'waves tide surf shells', 'cactus camel dunes mirage'],
  ['Coffee', 'Tea', 'mug morning caffeine brew', 'beans espresso roast barista', 'leaves kettle chai steep'],
  ['Cinema', 'Theatre', 'tickets seats audience interval', 'screen popcorn trailer projector', 'curtain rehearsal backstage monologue'],
  ['Guitar', 'Violin', 'strings tune wooden concert', 'chords strum amp frets', 'bow orchestra chin rosin'],
  ['Doctor', 'Nurse', 'hospital patient shift scrubs', 'diagnosis prescription surgery consultant', 'rounds ward injection bedside'],
  ['Winter', 'Autumn', 'cold jacket season wind', 'snow frost skiing icicle', 'leaves harvest pumpkin amber'],
  ['Football', 'Cricket', 'pitch team stadium captain', 'goal striker offside penalty', 'wicket over innings bowler'],
  ['Train', 'Bus', 'commute ticket seats route', 'rails platform carriage sleeper', 'conductor stop aisle depot'],
  ['Library', 'Bookshop', 'reading shelves quiet browsing', 'borrow membership silence overdue', 'price receipt till stock'],
  ['Pizza', 'Sandwich', 'lunch filling cheese takeaway', 'dough oven pepperoni round', 'bread butter lunchbox triangle'],
  ['Moon', 'Sun', 'sky orbit round light', 'craters phases night tides', 'heat noon sunscreen dawn'],
  ['Rain', 'Snow', 'weather sky forecast boots', 'umbrella puddle drizzle monsoon', 'shovel flakes sledge white'],
  ['Chess', 'Checkers', 'board squares pieces turns', 'bishop castling checkmate opening', 'crown jump discs diagonal'],
  ['Dog', 'Cat', 'pet fur vet collar', 'walkies barking leash fetch', 'purring litter whiskers lap'],
  ['Painting', 'Photograph', 'frame wall image gallery', 'brush canvas oils palette', 'shutter lens negative flash'],
  ['Wedding', 'Birthday', 'cake guests gifts party', 'vows rings aisle bride', 'candles age balloons wish'],
  ['Hotel', 'Hostel', 'beds booking reception travel', 'suite concierge minibar stars', 'bunks dorm lockers cheap'],
  ['Ocean', 'Lake', 'water swimming deep boats', 'salt tides whales reef', 'calm shore ducks freshwater'],
  ['Piano', 'Drums', 'band rhythm practice loud', 'keys pedal scales chords', 'sticks kit snare beat'],
  ['Newspaper', 'Magazine', 'pages print articles subscription', 'headlines daily ink columns', 'glossy monthly cover features'],
  ['Mountain', 'Hill', 'climb view walking height', 'summit glacier ropes altitude', 'gentle slope picnic rolling'],
  ['Fire', 'Candle', 'flame warm light matches', 'smoke logs blaze brigade', 'wax wick dinner birthday'],
  ['Bicycle', 'Motorbike', 'wheels helmet road riding', 'pedals chain gears exercise', 'engine fuel throttle licence'],
  ['Bank', 'Cashpoint', 'cash card queue money', 'manager branch loan counter', 'machine pin screen withdraw'],
  ['School', 'University', 'students lessons term exams', 'uniform bell playground register', 'lecture campus degree halls'],
  ['Kitchen', 'Bathroom', 'tiles tap sink plumbing', 'fridge cooking oven cupboard', 'shower towel mirror toothbrush'],
  ['Watch', 'Clock', 'time hands ticking numbers', 'wrist strap gift battery', 'wall alarm tower chime'],
  ['Bread', 'Rice', 'staple meal plain filling', 'loaf toast crust bakery', 'grains boiled paddy sticky'],
  ['Airport', 'Station', 'departures luggage waiting announcements', 'passport runway boarding terminal', 'platform rails timetable tracks'],
  ['Ghost', 'Vampire', 'scary undead legend pale', 'haunting chains transparent attic', 'fangs blood garlic coffin'],
  ['Summer', 'Spring', 'warm outdoors sunny season', 'holidays heatwave sandals sunburn', 'blossom lambs showers planting'],
  ['Pen', 'Pencil', 'writing stationery paper pocket', 'ink cap signature leaking', 'sharpener eraser graphite lead'],
  ['Soup', 'Stew', 'bowl hot spoon dinner', 'broth sipping blender starter', 'chunks simmer beef thick'],
  ['Circus', 'Zoo', 'tickets families crowds outing', 'clowns acrobats ringmaster trapeze', 'enclosures keepers giraffe feeding'],
  ['Bridge', 'Tunnel', 'crossing engineering traffic concrete', 'span river cables arch', 'darkness underground bore echo'],
];

export const WORD_PAIRS: WordPair[] = RAW.map(([civ, imp, b, c, i]) => ({
  civ,
  imp,
  both: b.split(' '),
  civOnly: c.split(' '),
  impOnly: i.split(' '),
}));

// ── clue semantics ────────────────────────────────────────────────

export const norm = (s: string) => s.trim().toLowerCase();

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

function bigrams(w: string): string[] {
  const s = ` ${w} `;
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

/**
 * Dice coefficient over character bigrams, lifted for a shared stem or one word
 * containing the other. Only used to place a clue the bank has never seen —
 * a player's own typing — somewhere sensible relative to the two words.
 */
export function similarity(a: string, b: string): number {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;

  const A = bigrams(x);
  const B = bigrams(y);
  const pool = B.slice();
  let hits = 0;
  for (const g of A) {
    const i = pool.indexOf(g);
    if (i >= 0) {
      pool.splice(i, 1);
      hits++;
    }
  }
  let d = (2 * hits) / (A.length + B.length);
  if (x.length >= 4 && y.length >= 4 && x.slice(0, 4) === y.slice(0, 4)) d = Math.max(d, 0.7);
  if (x.includes(y) || y.includes(x)) d = Math.max(d, 0.8);
  return clamp01(d);
}

const best = (text: string, words: string[]) => words.reduce((m, w) => Math.max(m, similarity(text, w)), 0);

/** How well a clue in the bank fits [the civilian word, the imposter word]. */
const FIT_BOTH: [number, number] = [0.75, 0.75];
const FIT_CIV: [number, number] = [1, 0.15];
const FIT_IMP: [number, number] = [0.12, 1];
/** A clue nobody has seen before reads as plausible but unremarkable. */
const FIT_BASE = 0.72;

/**
 * A clue's position in the pair's two-word space: how well it describes the
 * civilian word and how well it describes the imposter word. Bank clues carry
 * their authored fit; free text is placed by resemblance to the bank.
 */
export function fitVector(clue: string, pair: WordPair): [number, number] {
  const c = norm(clue);
  if (pair.both.some((w) => norm(w) === c)) return FIT_BOTH;
  if (pair.civOnly.some((w) => norm(w) === c)) return FIT_CIV;
  if (pair.impOnly.some((w) => norm(w) === c)) return FIT_IMP;
  if (c === norm(pair.civ)) return FIT_CIV;
  if (c === norm(pair.imp)) return FIT_IMP;

  const cs = best(c, [pair.civ, ...pair.civOnly]);
  const is = best(c, [pair.imp, ...pair.impOnly]);
  const bs = best(c, pair.both);
  // Resemblance lifts a clue toward a word; leaning clearly on the *other* word
  // is what pulls it down, so the margin between the two sides does the work.
  return [
    clamp01(FIT_BASE + 0.28 * Math.max(cs, bs) - 0.75 * Math.max(0, is - cs)),
    clamp01(FIT_BASE + 0.28 * Math.max(is, bs) - 0.75 * Math.max(0, cs - is)),
  ];
}

/** How well a clue matches the civilian word — the table's suspicion metric. */
export const civFit = (clue: string, pair: WordPair) => fitVector(clue, pair)[0];

/** How alike two clues are, judged without knowing which word is which. */
export function affinity(a: string, b: string, pair: WordPair): number {
  const [ac, ai] = fitVector(a, pair);
  const [bc, bi] = fitVector(b, pair);
  return clamp01(1 - 0.5 * (Math.abs(ac - bc) + Math.abs(ai - bi)));
}

// ── state ─────────────────────────────────────────────────────────

export type Phase = 'reveal' | 'clues' | 'discuss' | 'vote' | 'result';

export interface ImposterState {
  pair: WordPair;
  seats: number;
  /** The word each seat was dealt. */
  words: string[];
  /** Seats holding the other word, ascending. */
  imposters: number[];
  /** Seat order for giving clues. */
  order: number[];
  /** clues[seat], null until that seat has spoken. */
  clues: (string | null)[];
  /** How far through `order` the clue round is. */
  turn: number;
  /** votes[seat] = the seat they voted for, null until they vote. */
  votes: (number | null)[];
  phase: Phase;
  log: string[];
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** `odd` clamped so at least two seats hold the table's word. */
export const clampOdd = (odd: number, seats: number) => Math.max(1, Math.min(Math.floor(odd) || 1, Math.max(1, seats - 2)));

/**
 * Deal a round: one pair from the bank, `odd` seats given the other word, and a
 * random speaking order.
 */
export function deal(seats: number, odd: number, rng: Rng): ImposterState {
  const n = Math.max(2, Math.floor(seats));
  const pair = pick(WORD_PAIRS, rng);
  const count = clampOdd(odd, n);
  const imposters = shuffle(range(n), rng).slice(0, count).sort((a, b) => a - b);
  return {
    pair,
    seats: n,
    words: range(n).map((i) => (imposters.includes(i) ? pair.imp : pair.civ)),
    imposters,
    order: shuffle(range(n), rng),
    clues: range(n).map(() => null),
    turn: 0,
    votes: range(n).map(() => null),
    phase: 'reveal',
    log: [],
  };
}

export const isImposter = (s: ImposterState, seat: number) => s.imposters.includes(seat);

/** The seat that owes a clue, or null once the clue round is over. */
export const toSpeak = (s: ImposterState): number | null =>
  s.phase === 'clues' && s.turn < s.order.length ? s.order[s.turn] : null;

/** Leaves the reveal card and opens the clue round. */
export function beginClues(s: ImposterState): ImposterState {
  if (s.phase !== 'reveal') return s;
  return { ...s, phase: 'clues', turn: 0, log: ['Clues, one word each'] };
}

/** Ends the discussion early and opens voting. */
export function openVote(s: ImposterState): ImposterState {
  if (s.phase !== 'discuss') return s;
  return { ...s, phase: 'vote', log: s.log.concat('Voting is open') };
}

// ── legality ──────────────────────────────────────────────────────

export type ClueError = 'not-your-turn' | 'empty' | 'multi-word' | 'too-short' | 'too-long' | 'bad-chars' | 'the-word' | 'duplicate';

export const CLUE_MESSAGE: Record<ClueError, string> = {
  'not-your-turn': 'Not your turn to give a clue',
  empty: 'Type a clue first',
  'multi-word': 'One word only',
  'too-short': 'That is too short to be a clue',
  'too-long': 'Keep it under 15 letters',
  'bad-chars': 'Letters only',
  'the-word': 'You cannot say the word itself',
  duplicate: 'Someone already said that',
};

const WORDY = /^[a-z][a-z'-]*[a-z]$/;

/**
 * Whether the clue itself is sayable by this seat, ignoring whose turn it is.
 * This is what fills a seat's suggestion list before the turn comes round.
 */
export function clueContent(s: ImposterState, seat: number, raw: string): ClueError | null {
  const c = norm(raw);
  if (!c) return 'empty';
  if (/\s/.test(c)) return 'multi-word';
  if (c.length < 2) return 'too-short';
  if (c.length > 14) return 'too-long';
  if (!WORDY.test(c)) return 'bad-chars';

  // Saying your own word — or an obvious inflection of it — ends the round early.
  const mine = norm(s.words[seat]);
  if (c === mine) return 'the-word';
  if (mine.length >= 4 && (c.startsWith(mine) || mine.startsWith(c)) && Math.min(c.length, mine.length) >= 4) return 'the-word';

  if (s.clues.some((x) => x !== null && norm(x) === c)) return 'duplicate';
  return null;
}

/** Why a clue would be rejected right now, or null if it is legal. */
export function clueProblem(s: ImposterState, seat: number, raw: string): ClueError | null {
  if (s.phase !== 'clues' || toSpeak(s) !== seat) return 'not-your-turn';
  return clueContent(s, seat, raw);
}

export const isLegalClue = (s: ImposterState, seat: number, raw: string) => clueProblem(s, seat, raw) === null;

/** Every clue this seat could give from its own word's bank, turn order aside. */
export function legalClues(s: ImposterState, seat: number): string[] {
  const pool = isImposter(s, seat) ? [...s.pair.both, ...s.pair.impOnly] : [...s.pair.both, ...s.pair.civOnly];
  return pool.filter((c) => clueContent(s, seat, c) === null);
}

/** A shuffled handful of legal clues to offer as taps. */
export function suggestions(s: ImposterState, seat: number, rng: Rng, n = 4): string[] {
  return shuffle(legalClues(s, seat), rng).slice(0, n);
}

export type VoteError = 'not-voting' | 'self' | 'off-table' | 'already-voted';

export const VOTE_MESSAGE: Record<VoteError, string> = {
  'not-voting': 'Voting is not open yet',
  self: 'You cannot vote for yourself',
  'off-table': 'Nobody is sitting there',
  'already-voted': 'Your vote is already in',
};

export function voteProblem(s: ImposterState, seat: number, target: number): VoteError | null {
  if (s.phase !== 'vote') return 'not-voting';
  if (!Number.isInteger(target) || target < 0 || target >= s.seats) return 'off-table';
  if (target === seat) return 'self';
  if (s.votes[seat] !== null) return 'already-voted';
  return null;
}

export const isLegalVote = (s: ImposterState, seat: number, target: number) => voteProblem(s, seat, target) === null;

// ── transitions ───────────────────────────────────────────────────

/** Record a clue. Throws on an illegal one — check `clueProblem` first. */
export function submitClue(s: ImposterState, seat: number, raw: string): ImposterState {
  const bad = clueProblem(s, seat, raw);
  if (bad) throw new Error(CLUE_MESSAGE[bad]);

  const word = norm(raw);
  const clues = s.clues.slice();
  clues[seat] = word;
  const turn = s.turn + 1;
  const done = turn >= s.order.length;
  return {
    ...s,
    clues,
    turn,
    phase: done ? 'discuss' : 'clues',
    log: s.log.concat(done ? 'Every clue is in — talk it over' : `Seat ${seat} said "${word}"`),
  };
}

/** Record a vote, moving to the reveal once every seat has voted. */
export function castVote(s: ImposterState, seat: number, target: number): ImposterState {
  const bad = voteProblem(s, seat, target);
  if (bad) throw new Error(VOTE_MESSAGE[bad]);

  const votes = s.votes.slice();
  votes[seat] = target;
  const all = votes.every((v) => v !== null);
  return { ...s, votes, phase: all ? 'result' : 'vote', log: s.log.concat(all ? 'Votes are in' : `Seat ${seat} voted`) };
}

// ── scoring ───────────────────────────────────────────────────────

export interface RoundScore {
  /** Votes received, per seat. */
  counts: number[];
  /** Seats tied for the most votes. */
  top: number[];
  /** The ejected seat, or null when the vote tied. */
  ejected: number | null;
  /** True when the ejected seat was holding the other word. */
  caught: boolean;
  winner: 'table' | 'imposters';
  /** XP per seat. */
  xp: number[];
}

/**
 * Tally the vote and settle the round. Most votes is ejected; a tie ejects
 * nobody, which counts as the odd ones getting away.
 */
export function scoreRound(s: ImposterState): RoundScore {
  const counts = s.words.map(() => 0);
  s.votes.forEach((v) => {
    if (v !== null && v >= 0 && v < s.seats) counts[v]++;
  });

  const high = Math.max(0, ...counts);
  const top = high > 0 ? counts.map((c, i) => (c === high ? i : -1)).filter((i) => i >= 0) : [];
  const ejected = top.length === 1 ? top[0] : null;
  const caught = ejected !== null && isImposter(s, ejected);
  const winner: RoundScore['winner'] = caught ? 'table' : 'imposters';

  const xp = s.words.map((_, i) => {
    const imp = isImposter(s, i);
    let n = 20;
    if (imp) n += 40;
    const v = s.votes[i];
    if (!imp && v !== null && isImposter(s, v)) n += 100;
    if (imp && i !== ejected) n += 200;
    if (winner === 'table' ? !imp : imp) n += 80;
    return n;
  });

  return { counts, top, ejected, caught, winner, xp };
}

// ── the bots ──────────────────────────────────────────────────────

/**
 * A bot's clue.
 *
 * A civilian leans on a word-specific clue, more so the sharper it is — being
 * legible to the table is how a civilian stays off the gallows.
 *
 * An imposter can only speak about the word it actually holds, so it ranks that
 * word's clues by how well each *also* fits the civilian word and reaches into
 * the list by skill: a sharp imposter takes the top of the list, a clue that
 * covers both words, while a careless one reaches deep and says something only
 * its own word could explain.
 */
export function botClue(s: ImposterState, seat: number, bot: BotProfile, rng: Rng): string {
  const pool = legalClues(s, seat);
  if (!pool.length) return `seat${seat}`;
  if (rng() < bot.blunder) return pick(pool, rng);

  if (isImposter(s, seat)) {
    const ranked = pool.slice().sort((a, b) => civFit(b, s.pair) - civFit(a, s.pair));
    const span = ranked.length - 1;
    const idx = Math.min(span, Math.floor(span * Math.pow(rng(), bot.skill * 3 + 0.4)));
    return ranked[idx];
  }

  const specific = pool.filter((c) => s.pair.civOnly.includes(c));
  const shared = pool.filter((c) => s.pair.both.includes(c));
  const wantSpecific = rng() < 0.35 + 0.3 * bot.skill;
  const from = wantSpecific && specific.length ? specific : shared.length ? shared : specific;
  return pick(from.length ? from : pool, rng);
}

/**
 * A bot's vote.
 *
 * A civilian knows the table's word, so it scores every other clue by how well
 * it matches that word and votes for the worst fit. An imposter does not know
 * the word, so it votes for the outlier instead — the clue least like all the
 * others. Judgement is blurred by noise scaled to (1 − skill), and `blunder`
 * throws the vote away entirely.
 */
export function botVote(s: ImposterState, seat: number, bot: BotProfile, rng: Rng): number {
  const cands = range(s.seats).filter((i) => i !== seat);
  if (!cands.length) return seat;
  if (rng() < bot.blunder) return pick(cands, rng);

  const imp = isImposter(s, seat);
  const clueAt = (i: number) => s.clues[i] ?? '';

  const fit = (i: number): number => {
    if (!clueAt(i)) return 0; // silence is the worst possible clue
    if (!imp) return civFit(clueAt(i), s.pair);
    const others = cands.filter((j) => j !== i && clueAt(j));
    if (!others.length) return 0.5;
    return others.reduce((m, j) => m + affinity(clueAt(i), clueAt(j), s.pair), 0) / others.length;
  };

  const noise = 0.12 + 0.5 * (1 - bot.skill);
  let bestSeat = cands[0];
  let bestScore = Infinity;
  for (const i of cands) {
    const score = fit(i) + (rng() - 0.5) * noise;
    if (score < bestScore) {
      bestScore = score;
      bestSeat = i;
    }
  }
  return bestSeat;
}
