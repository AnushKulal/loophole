/**
 * Liar's Bar — a bluffing card game played at gunpoint.
 *
 * One deck is six Kings, six Queens, six Aces and two wild Jokers. Every round
 * names a table card and deals five to each surviving seat. On your turn you
 * push one to three cards into the middle FACE DOWN and claim they are all the
 * table card. The next seat with cards either lets it stand — in which case the
 * play passes to them — or calls LIAR.
 *
 * On a call the cards flip. A false claim puts the gun in the claimer's hand; a
 * true one puts it in the caller's. Either way somebody pulls the trigger: each
 * seat carries a revolver with six chambers and one live round in a position
 * fixed at the start of the match, so a survivor's next pull is always deadlier
 * than their last. The round ends the moment the hammer falls, whichever way it
 * falls, and the cards are dealt again. Last seat alive takes the bar.
 *
 * Pure data and pure transitions — no React, no clock, no `Math.random`. Every
 * decision that needs chance takes an `Rng`, so a whole match replays exactly
 * from a seed.
 */

import { pick, shuffle, type BotProfile, type Rng } from './contract';

// ── the deck ──────────────────────────────────────────────────────

export type Rank = 'K' | 'Q' | 'A' | 'J';
/** The three ranks a round can call. Jokers are wild and are never called. */
export type TableRank = Exclude<Rank, 'J'>;

export const TABLE_RANKS: TableRank[] = ['K', 'Q', 'A'];

export const RANK_NAME: Record<Rank, string> = { K: 'King', Q: 'Queen', A: 'Ace', J: 'Joker' };
export const RANK_FACE: Record<Rank, string> = { K: 'K', Q: 'Q', A: 'A', J: '★' };

/** "2 Kings", "1 Ace". */
export const claimText = (rank: TableRank, n: number) => `${n} ${RANK_NAME[rank]}${n === 1 ? '' : 's'}`;

/** Copies of each table rank in one deck. */
export const PER_RANK = 6;
export const JOKERS = 2;
/** 6 + 6 + 6 + 2. */
export const DECK = PER_RANK * TABLE_RANKS.length + JOKERS;
/** Cards in one deck that satisfy any single claim: its rank plus both jokers. */
export const TRUTH_PER_DECK = PER_RANK + JOKERS;

export const HAND = 5;
export const MAX_PLAY = 3;
export const CHAMBERS = 6;

export interface Card {
  r: Rank;
  /** Stable within a match, so the screen can key and animate a card. */
  id: number;
}

/** The ranks in `copies` decks, unshuffled. */
export function buildDeck(copies = 1): Rank[] {
  const d: Rank[] = [];
  for (let c = 0; c < copies; c++) {
    for (const r of TABLE_RANKS) for (let i = 0; i < PER_RANK; i++) d.push(r);
    for (let i = 0; i < JOKERS; i++) d.push('J');
  }
  return d;
}

/** A joker is any table card; otherwise the rank has to match. */
export const isTruth = (c: Card, rank: TableRank) => c.r === 'J' || c.r === rank;

// ── the revolver ──────────────────────────────────────────────────

export interface Revolver {
  /** Which chamber holds the live round, 0–5. Fixed for the whole match. */
  live: number;
  /** Chambers already pulled. The next pull is chamber `spent`. */
  spent: number;
}

/** True when the next pull lands on the live chamber. */
export const willFire = (r: Revolver) => r.spent === r.live;

/**
 * The chance the next pull kills, judged by somebody who cannot see inside the
 * cylinder: the live round is somewhere in the chambers that have not been
 * tried, so five clicks leave a certainty.
 */
export const danger = (r: Revolver) => 1 / Math.max(1, CHAMBERS - r.spent);

// ── state ─────────────────────────────────────────────────────────

export interface Seat {
  hand: Card[];
  /** Everything this seat has pushed into the middle this round, face down. */
  played: Card[];
  revolver: Revolver;
  alive: boolean;
}

export interface Claim {
  seat: number;
  /** The face-down cards. Their identity is the whole game. */
  cards: Card[];
}

export interface Showdown {
  /** Who made the claim. */
  seat: number;
  /** Who called it. */
  caller: number;
  cards: Card[];
  /** Every card really was the table card or a joker. */
  honest: boolean;
  /** Whoever was wrong: the liar, or the caller who doubted an honest claim. */
  shooter: number;
  /** null until the trigger is pulled. */
  fired: boolean | null;
}

export type Phase =
  /** `turn` must push one to three cards forward. */
  | 'play'
  /** `decider` must let it stand or call liar. */
  | 'challenge'
  /** The cards are face up; the trigger has not been pulled yet. */
  | 'showdown'
  /** The hammer has fallen. Deal again. */
  | 'shot'
  /** Every hand emptied with nobody calling. Deal again. */
  | 'exhausted'
  | 'over';

export interface LiarState {
  seats: number;
  /** Decks shuffled together, so six seats still get five cards each. */
  copies: number;
  rank: TableRank;
  players: Seat[];
  claim: Claim | null;
  turn: number;
  decider: number | null;
  showdown: Showdown | null;
  phase: Phase;
  round: number;
  /** Cards dealt this round — the size of the pool every read is judged against. */
  dealt: number;
  /** Seats in the order they were shot out. */
  out: number[];
  winner: number | null;
  log: string[];
  nextId: number;
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const LOG_KEEP = 14;
const note = (s: LiarState, ...lines: string[]) => s.log.concat(lines).slice(-LOG_KEEP);

/** Seats still in the match. */
export const aliveSeats = (s: LiarState) => range(s.seats).filter((i) => s.players[i].alive);

/** A seat can be asked to play or to judge only while it is alive and holding cards. */
export const canAct = (s: LiarState, i: number) => !!s.players[i] && s.players[i].alive && s.players[i].hand.length > 0;

function nextActiveIn(players: Seat[], seats: number, from: number): number | null {
  for (let k = 1; k <= seats; k++) {
    const i = (from + k) % seats;
    if (players[i].alive && players[i].hand.length > 0) return i;
  }
  return null;
}

/** The next seat round the table that still has cards, or null if there is none. */
export const nextActive = (s: LiarState, from: number) => nextActiveIn(s.players, s.seats, from);

function aliveFrom(players: Seat[], seats: number, from: number): number {
  for (let k = 0; k < seats; k++) {
    const i = (from + k) % seats;
    if (players[i].alive) return i;
  }
  return from;
}

// ── dealing ───────────────────────────────────────────────────────

/** Enough decks that every seat gets a full hand. */
export const copiesFor = (seats: number) => Math.max(1, Math.ceil((seats * HAND) / DECK));

/** Fresh hands, a fresh table card, and `starter` (or the next seat alive) to open. */
export function dealRound(s: LiarState, rng: Rng, starter: number): LiarState {
  const deck = shuffle(buildDeck(s.copies), rng);
  let id = s.nextId;
  let cut = 0;
  const players = s.players.map<Seat>((p) => {
    if (!p.alive) return { ...p, hand: [], played: [] };
    const hand = deck.slice(cut, cut + HAND).map<Card>((r) => ({ r, id: id++ }));
    cut += HAND;
    return { ...p, hand, played: [] };
  });
  const rank = pick(TABLE_RANKS, rng);
  const round = s.round + 1;
  return {
    ...s,
    players,
    rank,
    claim: null,
    turn: aliveFrom(players, s.seats, starter),
    decider: null,
    showdown: null,
    phase: 'play',
    round,
    dealt: cut,
    nextId: id,
    log: note(s, `Round ${round}: the table card is the ${RANK_NAME[rank]}`),
  };
}

/**
 * A new match: a revolver per seat with the live round hidden in one of six
 * chambers, then the first deal. Two to six seats; more seats simply shuffle a
 * second deck in.
 */
export function startMatch(seats: number, rng: Rng): LiarState {
  const n = Math.max(2, Math.min(6, Math.floor(seats) || 2));
  const players: Seat[] = range(n).map(() => ({
    hand: [],
    played: [],
    revolver: { live: Math.floor(rng() * CHAMBERS), spent: 0 },
    alive: true,
  }));
  const base: LiarState = {
    seats: n,
    copies: copiesFor(n),
    rank: 'K',
    players,
    claim: null,
    turn: 0,
    decider: null,
    showdown: null,
    phase: 'play',
    round: 0,
    dealt: 0,
    out: [],
    winner: null,
    log: [],
    nextId: 0,
  };
  return dealRound(base, rng, 0);
}

/** Deal the next round. The seat that pulled the trigger opens it if it survived. */
export function nextRound(s: LiarState, rng: Rng): LiarState {
  if (s.phase !== 'shot' && s.phase !== 'exhausted') return s;
  const from = s.showdown ? s.showdown.shooter : s.turn;
  return dealRound(s, rng, from);
}

// ── legality ──────────────────────────────────────────────────────

export type PlayError = 'not-your-turn' | 'no-cards' | 'too-many' | 'off-hand' | 'same-card';

export const PLAY_MESSAGE: Record<PlayError, string> = {
  'not-your-turn': 'It is not your play',
  'no-cards': 'Pick at least one card',
  'too-many': 'Three cards at most',
  'off-hand': 'That card is not in your hand',
  'same-card': 'You cannot play the same card twice',
};

/** Why this play would be rejected right now, or null if it is legal. */
export function playProblem(s: LiarState, seat: number, idx: number[]): PlayError | null {
  if (s.phase !== 'play' || s.turn !== seat) return 'not-your-turn';
  if (!Array.isArray(idx) || idx.length === 0) return 'no-cards';
  if (idx.length > MAX_PLAY) return 'too-many';
  const hand = s.players[seat].hand;
  const seen = new Set<number>();
  for (const i of idx) {
    if (!Number.isInteger(i) || i < 0 || i >= hand.length) return 'off-hand';
    if (seen.has(i)) return 'same-card';
    seen.add(i);
  }
  return null;
}

export const isLegalPlay = (s: LiarState, seat: number, idx: number[]) => playProblem(s, seat, idx) === null;

/**
 * Every shape of play this hand allows — one, two or three cards. Turn order
 * aside, so it can also fill a hint before the turn comes round.
 */
export function legalPlays(s: LiarState, seat: number): number[][] {
  const n = s.players[seat]?.hand.length ?? 0;
  const out: number[][] = [];
  for (let a = 0; a < n; a++) {
    out.push([a]);
    for (let b = a + 1; b < n; b++) {
      out.push([a, b]);
      for (let c = b + 1; c < n; c++) out.push([a, b, c]);
    }
  }
  return out;
}

export type DecideError = 'not-deciding';

export const DECIDE_MESSAGE: Record<DecideError, string> = { 'not-deciding': 'Nothing to judge' };

export function decideProblem(s: LiarState, seat: number): DecideError | null {
  return s.phase === 'challenge' && s.decider === seat && s.claim !== null ? null : 'not-deciding';
}

export const isLegalDecision = (s: LiarState, seat: number) => decideProblem(s, seat) === null;

// ── transitions ───────────────────────────────────────────────────

/**
 * Push `idx` forward as a claim of that many table cards. Throws on an illegal
 * play — check `playProblem` first.
 *
 * If nobody else is left holding cards there is no one to doubt it, so the
 * round simply burns out and is dealt again.
 */
export function playCards(s: LiarState, seat: number, idx: number[]): LiarState {
  const bad = playProblem(s, seat, idx);
  if (bad) throw new Error(PLAY_MESSAGE[bad]);

  const p = s.players[seat];
  const take = new Set(idx);
  const cards = idx.slice().sort((a, b) => a - b).map((i) => p.hand[i]);
  const players = s.players.slice();
  players[seat] = { ...p, hand: p.hand.filter((_, i) => !take.has(i)), played: p.played.concat(cards) };

  const claim: Claim = { seat, cards };
  const said = `Seat ${seat} claims ${claimText(s.rank, cards.length)}`;
  const decider = nextActiveIn(players, s.seats, seat);
  if (decider === null) {
    return {
      ...s,
      players,
      claim,
      decider: null,
      phase: 'exhausted',
      log: note(s, said, 'Nobody is left holding cards — the round burns out'),
    };
  }
  return { ...s, players, claim, decider, phase: 'challenge', log: note(s, said) };
}

/** Let the claim stand. The play passes to whoever accepted it. */
export function accept(s: LiarState, seat: number): LiarState {
  const bad = decideProblem(s, seat);
  if (bad) throw new Error(DECIDE_MESSAGE[bad]);
  const c = s.claim as Claim;
  return {
    ...s,
    claim: null,
    turn: seat,
    decider: null,
    phase: 'play',
    log: note(s, `Seat ${seat} lets ${claimText(s.rank, c.cards.length)} stand`),
  };
}

/**
 * Call liar. The cards flip: a false claim hands the gun to the claimer, a true
 * one hands it to the caller. Nobody pulls until `pullTrigger`.
 */
export function callLiar(s: LiarState, seat: number): LiarState {
  const bad = decideProblem(s, seat);
  if (bad) throw new Error(DECIDE_MESSAGE[bad]);
  const c = s.claim as Claim;
  const honest = c.cards.every((card) => isTruth(card, s.rank));
  const shooter = honest ? seat : c.seat;
  return {
    ...s,
    phase: 'showdown',
    decider: null,
    showdown: { seat: c.seat, caller: seat, cards: c.cards, honest, shooter, fired: null },
    log: note(
      s,
      `Seat ${seat} calls liar`,
      honest ? `The claim was good — seat ${shooter} pulls` : `The claim was a lie — seat ${shooter} pulls`,
    ),
  };
}

/**
 * Pull the trigger for whoever the showdown named. The round ends either way;
 * a hit takes that seat out of the match, and the last seat alive wins it.
 */
export function pullTrigger(s: LiarState): LiarState {
  if (s.phase !== 'showdown' || !s.showdown) throw new Error('Nobody is holding the gun');
  const sd = s.showdown;
  const p = s.players[sd.shooter];
  const fired = willFire(p.revolver);
  const players = s.players.slice();
  players[sd.shooter] = {
    ...p,
    revolver: { ...p.revolver, spent: p.revolver.spent + 1 },
    alive: !fired,
    hand: fired ? [] : p.hand,
  };

  const left = players.filter((x) => x.alive);
  const over = left.length <= 1;
  return {
    ...s,
    players,
    out: fired ? s.out.concat(sd.shooter) : s.out,
    showdown: { ...sd, fired },
    phase: over ? 'over' : 'shot',
    winner: over ? players.findIndex((x) => x.alive) : null,
    log: note(s, fired ? `Seat ${sd.shooter} is out` : `Click — seat ${sd.shooter} lives`),
  };
}

// ── reading a claim ───────────────────────────────────────────────

/** n choose k. Only ever called with small numbers. */
function comb(n: number, k: number): number {
  if (k < 0 || k > n || n < 0) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

/** P(at least `k` successes) drawing `n` from `N` cards containing `K` successes. */
export function hyperAtLeast(K: number, N: number, n: number, k: number): number {
  if (k <= 0) return 1;
  if (N <= 0 || n <= 0 || K <= 0 || k > n) return 0;
  const total = comb(N, n);
  if (!total) return 0;
  let p = 0;
  for (let i = k; i <= Math.min(K, n); i++) p += (comb(K, i) * comb(N - K, n - i)) / total;
  return Math.max(0, Math.min(1, p));
}

/** Everything a judge needs to price a claim. */
export interface Read {
  /** Cards dealt this round the judge has never seen. */
  pool: number;
  /** Table cards that could be among them. */
  unknownTruth: number;
  /** Cards the claimer was holding when they claimed. */
  claimerCards: number;
  /** How many they claim. */
  count: number;
}

/** How often a seat pushes cards forward it knows are not the table card. */
export const BLUFF_PRIOR = 0.36;

/**
 * The chance a claim is a lie.
 *
 * A seat that *can* tell the truth usually does, so the read is a prior on
 * bluffing corrected by whether the claimer could plausibly be holding that
 * many table cards at all. Hold four Kings yourself and a claim of three
 * Kings is nearly impossible to be honest — the odds go to one.
 */
export function lieOdds(r: Read): number {
  const could = hyperAtLeast(
    Math.max(0, Math.round(r.unknownTruth)),
    Math.max(0, Math.round(r.pool)),
    Math.max(0, Math.round(r.claimerCards)),
    r.count,
  );
  return BLUFF_PRIOR / (BLUFF_PRIOR + (1 - BLUFF_PRIOR) * could);
}

/** Cards this seat has seen this round: its hand plus whatever it has played. */
export const seenCards = (s: LiarState, i: number) => s.players[i].hand.length + s.players[i].played.length;

/** How many of those were table cards. */
export const seenTruth = (s: LiarState, i: number) =>
  s.players[i].hand.filter((c) => isTruth(c, s.rank)).length +
  s.players[i].played.filter((c) => isTruth(c, s.rank)).length;

/** Table cards among the cards dealt this round. */
export const truthDealt = (s: LiarState) => Math.round((TRUTH_PER_DECK * s.dealt) / DECK);

/**
 * How `viewer` reads the claim currently on the table: the odds it is a lie,
 * given the cards in their own hand.
 */
export function judgeOdds(s: LiarState, viewer: number, count?: number): number {
  const c = s.claim;
  const n = count ?? c?.cards.length ?? 0;
  if (!n) return 0;
  const claimer = c ? c.seat : -1;
  return lieOdds({
    pool: s.dealt - seenCards(s, viewer),
    unknownTruth: truthDealt(s) - seenTruth(s, viewer),
    // What they were holding a moment ago, before the claim left their hand.
    claimerCards: claimer >= 0 ? s.players[claimer].hand.length + n : n,
    count: n,
  });
}

/**
 * The mirror of `judgeOdds`, from the seat about to claim: how a lie of `count`
 * cards would read to the seat that has to judge it. It cannot see their hand,
 * so it credits them with their fair share of the table cards it cannot
 * account for — hand sizes are public, so that share is knowable.
 */
export function bluffOdds(s: LiarState, seat: number, count: number): number {
  const mine = seenCards(s, seat);
  const others = Math.max(1, s.dealt - mine);
  const loose = Math.max(0, truthDealt(s) - seenTruth(s, seat));
  const dec = nextActive(s, seat);
  const decCards = dec === null ? HAND : seenCards(s, dec);
  const expected = (loose * decCards) / others;
  return lieOdds({
    pool: s.dealt - decCards,
    unknownTruth: truthDealt(s) - expected,
    claimerCards: s.players[seat].hand.length,
    count,
  });
}

// ── the bots ──────────────────────────────────────────────────────

/**
 * What a bot pushes forward, as indices into its hand.
 *
 * Table cards are worth stalling with: played one at a time they keep a safe
 * answer in reserve and hand every opponent a chance to call a claim that is
 * actually true, which is the cheapest way to shoot somebody. Junk has to go
 * out as a lie sooner or later, so when it goes it goes in the biggest batch
 * that still reads as plausible — fewer lies means fewer chances to be caught.
 *
 * `skill` decides how strictly that line is held: a sharp bot almost never
 * bluffs while it still holds a table card and sizes the bluff by the odds a
 * `blunder` throws the whole plan away.
 */
export function botPlay(s: LiarState, seat: number, bot: BotProfile, rng: Rng): number[] {
  const hand = s.players[seat]?.hand ?? [];
  const n = hand.length;
  if (!n) return [];

  const truth: number[] = [];
  const junk: number[] = [];
  hand.forEach((c, i) => (isTruth(c, s.rank) ? truth : junk).push(i));

  if (rng() < bot.blunder) {
    const size = 1 + Math.floor(rng() * Math.min(MAX_PLAY, n));
    return shuffle(range(n), rng).slice(0, size).sort((a, b) => a - b);
  }

  const bluff = junk.length > 0 && (truth.length === 0 || rng() < 0.08 + 0.34 * (1 - bot.skill));

  if (!bluff) {
    const cap = Math.min(MAX_PLAY, truth.length);
    // Sharp play trickles table cards out; a careless bot dumps them.
    const extra = Math.floor(rng() * (1 - bot.skill) * cap);
    return truth.slice(0, Math.max(1, Math.min(cap, 1 + extra)));
  }

  // The biggest lie the next seat should still swallow.
  const tolerance = 0.5 + 0.22 * (1 - bot.skill);
  let size = 1;
  for (let k = Math.min(MAX_PLAY, junk.length); k >= 1; k--) {
    if (bluffOdds(s, seat, k) <= tolerance) {
      size = k;
      break;
    }
  }
  return shuffle(junk, rng).slice(0, size).sort((a, b) => a - b);
}

/**
 * Whether a bot calls liar.
 *
 * It prices the claim against its own hand — the fewer table cards it can
 * account for elsewhere, the more the claim smells — and then weighs the two
 * revolvers, because calling wrong is what puts the gun in *its* hand. A seat
 * five clicks into its cylinder wants a near-certainty before it doubts
 * anybody; a seat facing somebody who is one click from the end will doubt
 * them on much less. `skill` narrows the noise around that call and `blunder`
 * turns it into a coin toss.
 */
export function botChallenge(s: LiarState, seat: number, bot: BotProfile, rng: Rng): boolean {
  if (decideProblem(s, seat)) return false;
  if (rng() < bot.blunder) return rng() < 0.5;

  const c = s.claim as Claim;
  const lie = judgeOdds(s, seat);
  const mine = danger(s.players[seat].revolver);
  const theirs = danger(s.players[c.seat].revolver);

  // Normalised expected value of calling: their risk if it is a lie, against
  // mine if it is not.
  let ev = (lie * theirs - (1 - lie) * mine) / (mine + theirs);
  // Letting it stand means having to play next, and a hand with nothing true
  // in it can only answer with a lie of its own.
  const held = s.players[seat].hand.filter((x) => isTruth(x, s.rank)).length;
  if (held === 0) ev += 0.08 * bot.skill;

  const noise = (rng() - 0.5) * (0.06 + 0.6 * (1 - bot.skill));
  return ev + noise > 0;
}

// ── the scoreboard ────────────────────────────────────────────────

/** 1 for the seat still standing, then back down the order they were shot out. */
export function placeOf(s: LiarState, seat: number): number {
  if (s.players[seat].alive) return 1;
  const k = s.out.indexOf(seat);
  return k < 0 ? s.seats : s.seats - k;
}

/** Clicks survived — every pull but the one that took them out. */
export const clicksOf = (s: LiarState, seat: number) =>
  s.players[seat].revolver.spent - (s.players[seat].alive ? 0 : 1);

/** XP: a flat fee, a bonus per click survived, a bonus per seat outlasted, and the bar. */
export function xpFor(s: LiarState, seat: number): number {
  return (
    40 + 60 * clicksOf(s, seat) + 55 * (s.seats - placeOf(s, seat)) + (s.winner === seat ? 240 : 0)
  );
}
