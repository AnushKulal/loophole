/**
 * Guess Who I Am — a round of open-information deduction.
 *
 * Every seat is dealt a hidden identity from a public board. You cannot see your
 * own card; everyone else can, and you can see theirs. On your turn you either
 * ask the table one yes/no question about yourself — answered truthfully from
 * the identity's stored attributes — or name who you think you are. Guess right
 * and you take the round; guess wrong and you are out of it.
 *
 * Because the other seats' cards are face up, they are ruled out for you from
 * the first moment, so a seat's candidate set is
 *
 *     board − (the cards other seats are holding) − (everything the answers rule out)
 *
 * and it always contains the truth. That set is the whole game: the race is to
 * cut it to one before anybody else does.
 *
 * Pure data and pure transitions — no React, no clock, no `Math.random`. Every
 * decision that needs chance takes an `Rng`, so a whole match replays from a seed.
 */

import { pick, shuffle, type BotProfile, type Rng } from './contract';

// ── identities ────────────────────────────────────────────────────

/** What the person is chiefly remembered for. */
export type Field = 'science' | 'arts' | 'sport' | 'power' | 'explore' | 'letters';

export type Region = 'europe' | 'asia' | 'africa' | 'americas' | 'oceania';

/**
 * Gender-neutral descriptors of what this person *does*. Deliberately not
 * "he/she" facts — every question in the bank reads the same whoever you are.
 */
export type Trait = 'makes' | 'performs' | 'leads' | 'writes' | 'competes' | 'discovers' | 'fights' | 'teaches';

export interface Identity {
  name: string;
  /** The year they are best remembered for — the anchor for every era question. */
  peak: number;
  field: Field;
  region: Region;
  /** Still living today. */
  alive: boolean;
  traits: Trait[];
}

/** name, peak year, field, region, alive, traits. */
const RAW: [string, number, Field, Region, 0 | 1, string][] = [
  ['Marie Curie', 1903, 'science', 'europe', 0, 'discovers teaches'],
  ['Albert Einstein', 1915, 'science', 'europe', 0, 'discovers teaches writes'],
  ['Leonardo da Vinci', 1500, 'arts', 'europe', 0, 'makes discovers writes'],
  ['Cleopatra', -40, 'power', 'africa', 0, 'leads fights'],
  ['Ada Lovelace', 1843, 'science', 'europe', 0, 'makes writes discovers'],
  ['Mahatma Gandhi', 1930, 'power', 'asia', 0, 'leads writes teaches'],
  ['Frida Kahlo', 1940, 'arts', 'americas', 0, 'makes writes'],
  ['Pelé', 1970, 'sport', 'americas', 0, 'competes performs'],
  ['Serena Williams', 2015, 'sport', 'americas', 1, 'competes performs'],
  ['Amelia Earhart', 1932, 'explore', 'americas', 0, 'discovers competes'],
  ['Nelson Mandela', 1994, 'power', 'africa', 0, 'leads writes fights'],
  ['William Shakespeare', 1600, 'arts', 'europe', 0, 'writes performs makes'],
  ['Ludwig van Beethoven', 1808, 'arts', 'europe', 0, 'makes performs'],
  ['Confucius', -500, 'letters', 'asia', 0, 'teaches writes'],
  ['Jane Austen', 1813, 'letters', 'europe', 0, 'writes'],
  ['Maya Angelou', 1969, 'letters', 'americas', 0, 'writes performs teaches'],
  ['Zheng He', 1420, 'explore', 'asia', 0, 'leads discovers fights'],
  ['Genghis Khan', 1210, 'power', 'asia', 0, 'leads fights'],
  ['Joan of Arc', 1429, 'power', 'europe', 0, 'leads fights'],
  ['Nikola Tesla', 1893, 'science', 'europe', 0, 'makes discovers'],
  ['Katherine Johnson', 1962, 'science', 'americas', 0, 'discovers teaches'],
  ['Yuri Gagarin', 1961, 'explore', 'europe', 0, 'discovers competes'],
  ['Bruce Lee', 1972, 'sport', 'asia', 0, 'competes performs teaches fights'],
  ['Cathy Freeman', 2000, 'sport', 'oceania', 1, 'competes performs'],
  ['Steve Irwin', 1997, 'explore', 'oceania', 0, 'performs teaches discovers'],
  ['Wangari Maathai', 1990, 'science', 'africa', 0, 'leads teaches writes'],
  ['Fela Kuti', 1977, 'arts', 'africa', 0, 'performs makes leads'],
  ['Akira Kurosawa', 1954, 'arts', 'asia', 0, 'makes writes'],
  ['Hokusai', 1831, 'arts', 'asia', 0, 'makes teaches'],
  ['Charles Darwin', 1859, 'science', 'europe', 0, 'discovers writes'],
  ['Ibn Battuta', 1350, 'explore', 'africa', 0, 'discovers writes'],
  ['Hypatia', 400, 'letters', 'africa', 0, 'teaches writes discovers'],
  ['Sacagawea', 1805, 'explore', 'americas', 0, 'discovers leads'],
  ['Emmeline Pankhurst', 1913, 'power', 'europe', 0, 'leads fights writes'],
  ['Rosa Parks', 1955, 'power', 'americas', 0, 'leads fights'],
  ['Sachin Tendulkar', 2010, 'sport', 'asia', 1, 'competes performs'],
  ['Hayao Miyazaki', 1997, 'arts', 'asia', 1, 'makes writes teaches'],
  ['Yo-Yo Ma', 1998, 'arts', 'americas', 1, 'performs teaches'],
  ['Malala Yousafzai', 2014, 'power', 'asia', 1, 'leads writes teaches'],
  ['Tim Berners-Lee', 1991, 'science', 'europe', 1, 'makes discovers'],
  ['Chimamanda Ngozi Adichie', 2013, 'letters', 'africa', 1, 'writes teaches performs'],
];

/** The deck. A round deals a subset of these onto the board. */
export const IDENTITIES: Identity[] = RAW.map(([name, peak, field, region, alive, traits]) => ({
  name,
  peak,
  field,
  region,
  alive: alive === 1,
  traits: traits.split(' ') as Trait[],
}));

// ── the question bank ─────────────────────────────────────────────

/** The axis a question probes, so the list can be grouped. */
export type Axis = 'time' | 'place' | 'field' | 'doing';

export interface Question {
  id: string;
  /** Asked in the first person — you are asking the table about yourself. */
  text: string;
  /** A three-or-four-word tag for the answer log. */
  tag: string;
  axis: Axis;
  /** The predicate. Every answer in the game is this, evaluated truthfully. */
  test: (i: Identity) => boolean;
}

const has = (t: Trait) => (i: Identity) => i.traits.includes(t);

export const QUESTIONS: Question[] = [
  { id: 'alive', text: 'Am I alive today?', tag: 'Alive today', axis: 'time', test: (i) => i.alive },
  { id: 'pre1800', text: 'Was I best known before 1800?', tag: 'Before 1800', axis: 'time', test: (i) => i.peak < 1800 },
  { id: 'pre1900', text: 'Was I best known before 1900?', tag: 'Before 1900', axis: 'time', test: (i) => i.peak < 1900 },
  { id: 'c20', text: 'Was I best known in the 1900s?', tag: 'The 1900s', axis: 'time', test: (i) => i.peak >= 1900 && i.peak < 2000 },
  { id: 'post1950', text: 'Was I best known after 1950?', tag: 'After 1950', axis: 'time', test: (i) => i.peak >= 1950 },

  { id: 'europe', text: 'Am I from Europe?', tag: 'From Europe', axis: 'place', test: (i) => i.region === 'europe' },
  { id: 'asia', text: 'Am I from Asia?', tag: 'From Asia', axis: 'place', test: (i) => i.region === 'asia' },
  { id: 'africa', text: 'Am I from Africa?', tag: 'From Africa', axis: 'place', test: (i) => i.region === 'africa' },
  { id: 'americas', text: 'Am I from the Americas?', tag: 'From the Americas', axis: 'place', test: (i) => i.region === 'americas' },
  { id: 'oceania', text: 'Am I from Australia or the Pacific?', tag: 'From the Pacific', axis: 'place', test: (i) => i.region === 'oceania' },
  { id: 'oldworld', text: 'Am I from the old world — Europe, Asia or Africa?', tag: 'Old world', axis: 'place', test: (i) => i.region !== 'americas' && i.region !== 'oceania' },

  { id: 'science', text: 'Is my work science?', tag: 'In science', axis: 'field', test: (i) => i.field === 'science' },
  { id: 'arts', text: 'Is my work in the arts?', tag: 'In the arts', axis: 'field', test: (i) => i.field === 'arts' },
  { id: 'sport', text: 'Am I known for sport?', tag: 'In sport', axis: 'field', test: (i) => i.field === 'sport' },
  { id: 'power', text: 'Am I known for power, or for fighting it?', tag: 'In power', axis: 'field', test: (i) => i.field === 'power' },
  { id: 'explore', text: 'Am I an explorer?', tag: 'An explorer', axis: 'field', test: (i) => i.field === 'explore' },
  { id: 'letters', text: 'Am I known for the written word?', tag: 'In letters', axis: 'field', test: (i) => i.field === 'letters' },

  { id: 'makes', text: 'Do I make things?', tag: 'Makes things', axis: 'doing', test: has('makes') },
  { id: 'performs', text: 'Do I perform for an audience?', tag: 'Performs', axis: 'doing', test: has('performs') },
  { id: 'leads', text: 'Do I lead people?', tag: 'Leads people', axis: 'doing', test: has('leads') },
  { id: 'writes', text: 'Have I written something people still read?', tag: 'Writes', axis: 'doing', test: has('writes') },
  { id: 'competes', text: 'Do I compete against other people?', tag: 'Competes', axis: 'doing', test: has('competes') },
  { id: 'discovers', text: 'Did I find something nobody had found?', tag: 'Discovers', axis: 'doing', test: has('discovers') },
  { id: 'fights', text: 'Was I caught up in a war or a struggle?', tag: 'In a struggle', axis: 'doing', test: has('fights') },
  { id: 'teaches', text: 'Do I pass on what I know?', tag: 'Teaches', axis: 'doing', test: has('teaches') },
];

/** Question by id. */
export const QUESTION: Record<string, Question> = (() => {
  const map: Record<string, Question> = {};
  for (const q of QUESTIONS) map[q.id] = q;
  return map;
})();

/** The truthful answer. There is no other source of answers in this game. */
export const answer = (q: Question, i: Identity): boolean => q.test(i);

// ── labels ────────────────────────────────────────────────────────

export const FIELD_LABEL: Record<Field, string> = {
  science: 'Science',
  arts: 'Arts',
  sport: 'Sport',
  power: 'Power',
  explore: 'Explorer',
  letters: 'Letters',
};

export const REGION_LABEL: Record<Region, string> = {
  europe: 'Europe',
  asia: 'Asia',
  africa: 'Africa',
  americas: 'Americas',
  oceania: 'Pacific',
};

export const TRAIT_LABEL: Record<Trait, string> = {
  makes: 'Makes things',
  performs: 'Performs',
  leads: 'Leads',
  writes: 'Writes',
  competes: 'Competes',
  discovers: 'Discovers',
  fights: 'In a struggle',
  teaches: 'Teaches',
};

export function eraLabel(peak: number): string {
  if (peak < 500) return 'Ancient';
  if (peak < 1500) return 'Medieval';
  if (peak < 1800) return 'Early modern';
  if (peak < 1900) return 'The 1800s';
  if (peak < 1960) return 'Early 1900s';
  if (peak < 2000) return 'Late 1900s';
  return 'Today';
}

/** The two letters printed on a card face. */
export function initials(name: string): string {
  const words = name.split(/[\s-]+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** The line under a card face. */
export const blurb = (i: Identity): string => `${FIELD_LABEL[i.field]} · ${REGION_LABEL[i.region]} · ${eraLabel(i.peak)}`;

// ── state ─────────────────────────────────────────────────────────

export type Phase = 'study' | 'play' | 'over';

/** One question, asked by one seat, with the table's truthful answer. */
export interface Ask {
  seat: number;
  q: string;
  yes: boolean;
}

export interface GuessState {
  /** The identities in play. Public — every seat can see the whole board. */
  board: Identity[];
  seats: number;
  /** secret[seat] = index into `board`. Every seat but its owner can see it. */
  secret: number[];
  /** Seat to act. */
  turn: number;
  /** Every question asked this round, in order. */
  asked: Ask[];
  /** Seats knocked out by a wrong guess. */
  out: boolean[];
  winner: number | null;
  phase: Phase;
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Cards dealt onto the board for a round. */
export const BOARD_SIZE = 20;

/** The smallest legal board: one card per seat plus four decoys. */
export const boardFor = (seats: number, want: number) =>
  Math.max(seats + 4, Math.min(Math.floor(want) || BOARD_SIZE, IDENTITIES.length));

/**
 * Deal a round: a board of identities, one secret each, and a random opening
 * seat so no seat has a permanent tempo advantage.
 */
export function deal(seats: number, rng: Rng, boardSize: number = BOARD_SIZE): GuessState {
  const n = Math.max(2, Math.min(8, Math.floor(seats) || 2));
  const size = boardFor(n, boardSize);
  const board = shuffle(IDENTITIES, rng).slice(0, size);
  const secret = shuffle(range(size), rng).slice(0, n);
  const first = Math.min(n - 1, Math.floor(rng() * n));
  return { board, seats: n, secret, turn: first, asked: [], out: range(n).map(() => false), winner: null, phase: 'study' };
}

/** Leaves the study phase and opens the round. */
export function beginRound(s: GuessState): GuessState {
  return s.phase === 'study' ? { ...s, phase: 'play' } : s;
}

export const isOver = (s: GuessState) => s.phase === 'over';

/** The identity a seat is actually holding. */
export const identityOf = (s: GuessState, seat: number): Identity => s.board[s.secret[seat]];

/** Every question this seat has already spent. */
export const askedBy = (s: GuessState, seat: number): string[] =>
  s.asked.filter((a) => a.seat === seat).map((a) => a.q);

/** The questions this seat may still ask. */
export function legalQuestions(s: GuessState, seat: number): string[] {
  const used = askedBy(s, seat);
  return QUESTIONS.filter((q) => !used.includes(q.id)).map((q) => q.id);
}

/**
 * Board indices still consistent for this seat: not face up in front of anybody
 * else, and agreeing with every answer the table has given them. The seat's own
 * card always satisfies both, so this is never empty.
 */
export function candidates(s: GuessState, seat: number): number[] {
  const taken: boolean[] = s.board.map(() => false);
  s.secret.forEach((idx, i) => {
    if (i !== seat) taken[idx] = true;
  });
  const mine = s.asked.filter((a) => a.seat === seat);
  const out: number[] = [];
  for (let i = 0; i < s.board.length; i++) {
    if (taken[i]) continue;
    let ok = true;
    for (const a of mine) {
      const q = QUESTION[a.q];
      if (q && q.test(s.board[i]) !== a.yes) {
        ok = false;
        break;
      }
    }
    if (ok) out.push(i);
  }
  return out;
}

/** How many cards every seat starts from — the board minus the faces it can see. */
export const startingCandidates = (s: GuessState) => s.board.length - (s.seats - 1);

/** How a question would cut this seat's remaining candidates. */
export function split(s: GuessState, seat: number, qid: string): { yes: number; no: number } {
  const q = QUESTION[qid];
  const c = candidates(s, seat);
  if (!q) return { yes: 0, no: c.length };
  let yes = 0;
  for (const i of c) if (q.test(s.board[i])) yes++;
  return { yes, no: c.length - yes };
}

/** A question that leaves both sides non-empty actually tells you something. */
export function isInformative(s: GuessState, seat: number, qid: string): boolean {
  const { yes, no } = split(s, seat, qid);
  return yes > 0 && no > 0;
}

/**
 * The seat's askable questions, best splitter first. "Best" is the one that
 * comes closest to halving the candidate set; ties break on id so the ordering
 * is deterministic and a seeded match replays exactly.
 */
export function rankQuestions(s: GuessState, seat: number): string[] {
  const c = candidates(s, seat);
  return legalQuestions(s, seat)
    .map((id) => {
      const q = QUESTION[id];
      let yes = 0;
      for (const i of c) if (q.test(s.board[i])) yes++;
      return { id, cost: Math.abs(2 * yes - c.length) };
    })
    .sort((a, b) => a.cost - b.cost || (a.id < b.id ? -1 : 1))
    .map((x) => x.id);
}

// ── legality ──────────────────────────────────────────────────────

export type AskError = 'not-playing' | 'not-your-turn' | 'eliminated' | 'unknown-question' | 'already-asked';

export const ASK_MESSAGE: Record<AskError, string> = {
  'not-playing': 'The round is not open',
  'not-your-turn': 'Wait for your turn',
  eliminated: 'You are out of this round',
  'unknown-question': 'That is not a question you can ask',
  'already-asked': 'You have asked that already',
};

export function askProblem(s: GuessState, seat: number, qid: string): AskError | null {
  if (s.phase !== 'play') return 'not-playing';
  if (!Number.isInteger(seat) || seat < 0 || seat >= s.seats) return 'not-your-turn';
  if (s.out[seat]) return 'eliminated';
  if (s.turn !== seat) return 'not-your-turn';
  if (!QUESTION[qid]) return 'unknown-question';
  if (askedBy(s, seat).includes(qid)) return 'already-asked';
  return null;
}

export const isLegalAsk = (s: GuessState, seat: number, qid: string) => askProblem(s, seat, qid) === null;

export type GuessError = 'not-playing' | 'not-your-turn' | 'eliminated' | 'off-board' | 'someone-elses';

export const GUESS_MESSAGE: Record<GuessError, string> = {
  'not-playing': 'The round is not open',
  'not-your-turn': 'Wait for your turn',
  eliminated: 'You are out of this round',
  'off-board': 'That card is not on the board',
  'someone-elses': 'You can see that card in front of somebody else',
};

export function guessProblem(s: GuessState, seat: number, at: number): GuessError | null {
  if (s.phase !== 'play') return 'not-playing';
  if (!Number.isInteger(seat) || seat < 0 || seat >= s.seats) return 'not-your-turn';
  if (s.out[seat]) return 'eliminated';
  if (s.turn !== seat) return 'not-your-turn';
  if (!Number.isInteger(at) || at < 0 || at >= s.board.length) return 'off-board';
  if (s.secret.some((idx, i) => i !== seat && idx === at)) return 'someone-elses';
  return null;
}

export const isLegalGuess = (s: GuessState, seat: number, at: number) => guessProblem(s, seat, at) === null;

/** Board indices a seat is allowed to name — everything not face up elsewhere. */
export const nameable = (s: GuessState, seat: number): number[] =>
  s.board.map((_, i) => i).filter((i) => !s.secret.some((idx, j) => j !== seat && idx === i));

// ── transitions ───────────────────────────────────────────────────

/** Pass the turn to the next seat still in the round. */
function advance(s: GuessState): GuessState {
  if (s.out.every(Boolean)) return { ...s, phase: 'over', winner: null };
  let t = s.turn;
  for (let k = 0; k < s.seats; k++) {
    t = (t + 1) % s.seats;
    if (!s.out[t]) break;
  }
  return { ...s, turn: t };
}

/**
 * Ask the table a question. The answer is computed from the asker's own hidden
 * identity, so it is always true and always derivable — nobody can lie here.
 * Throws on an illegal ask; check `askProblem` first.
 */
export function ask(s: GuessState, seat: number, qid: string): GuessState {
  const bad = askProblem(s, seat, qid);
  if (bad) throw new Error(ASK_MESSAGE[bad]);
  const yes = QUESTION[qid].test(identityOf(s, seat));
  return advance({ ...s, asked: s.asked.concat({ seat, q: qid, yes }) });
}

/**
 * Name who you think you are. Right ends the round on the spot; wrong puts you
 * out of it and play carries on without you. Throws on an illegal guess.
 */
export function guess(s: GuessState, seat: number, at: number): GuessState {
  const bad = guessProblem(s, seat, at);
  if (bad) throw new Error(GUESS_MESSAGE[bad]);
  if (at === s.secret[seat]) return { ...s, winner: seat, phase: 'over' };
  const out = s.out.slice();
  out[seat] = true;
  return advance({ ...s, out });
}

// ── the bot ───────────────────────────────────────────────────────

export type Move = { kind: 'ask'; q: string } | { kind: 'guess'; at: number };

/**
 * A bot's turn.
 *
 * With one candidate left there is nothing to think about — it names it. With
 * more, it wants the question that comes closest to halving what is left, so it
 * ranks the bank and picks by `skill`: `skill` of the time it takes the top of
 * the list and finds itself in about log2(n) questions, otherwise it reaches
 * down the list and burns a turn on a question that barely cuts anything.
 *
 * `blunder` is a careless turn: a wild question, or — when the set is nearly
 * closed and the temptation is real — an early gamble that can knock it out.
 * A bot with nothing left to ask has to gamble whether it likes it or not.
 */
export function botTurn(s: GuessState, seat: number, bot: BotProfile, rng: Rng): Move {
  const c = candidates(s, seat);
  if (!c.length) return { kind: 'guess', at: s.secret[seat] };
  if (c.length === 1) return { kind: 'guess', at: c[0] };

  const legal = legalQuestions(s, seat);

  if (rng() < bot.blunder) {
    if (!legal.length || c.length <= 3) return { kind: 'guess', at: pick(c, rng) };
    return { kind: 'ask', q: pick(legal, rng) };
  }

  const ranked = rankQuestions(s, seat).filter((id) => isInformative(s, seat, id));
  if (!ranked.length) return { kind: 'guess', at: pick(c, rng) };

  // Two draws either way, so the stream advances the same however it decides.
  const sure = rng();
  const reach = rng();
  const span = ranked.length - 1;
  const idx = sure < bot.skill ? 0 : Math.min(span, Math.floor(span * Math.pow(reach, 1.2)));
  return { kind: 'ask', q: ranked[idx] };
}

/** Apply a bot's move. Convenience for tests and the screen's timer. */
export function play(s: GuessState, seat: number, move: Move): GuessState {
  return move.kind === 'ask' ? ask(s, seat, move.q) : guess(s, seat, move.at);
}

// ── scoring ───────────────────────────────────────────────────────

export const XP = { base: 20, ask: 12, cut: 14, win: 260, standing: 40 } as const;

export interface RoundScore {
  winner: number | null;
  /** Questions each seat spent. */
  asks: number[];
  /** Candidates each seat still had at the end. */
  left: number[];
  /** How many cards each seat ruled out. */
  cut: number[];
  xp: number[];
}

/**
 * XP by the rules text: a flat entry fee, a little for every question you spent,
 * more for every card you actually ruled out, the round to whoever named
 * themselves, and a consolation for anyone still standing when it ended.
 */
export function scoreRound(s: GuessState): RoundScore {
  const start = startingCandidates(s);
  const asks = range(s.seats).map((seat) => s.asked.filter((a) => a.seat === seat).length);
  const left = range(s.seats).map((seat) => candidates(s, seat).length);
  const cut = left.map((l) => Math.max(0, start - l));
  const xp = range(s.seats).map(
    (seat) =>
      XP.base +
      XP.ask * asks[seat] +
      XP.cut * cut[seat] +
      (s.winner === seat ? XP.win : 0) +
      (s.winner !== null && s.winner !== seat && !s.out[seat] ? XP.standing : 0),
  );
  return { winner: s.winner, asks, left, cut, xp };
}
