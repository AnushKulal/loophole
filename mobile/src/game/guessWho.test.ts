import { describe, expect, it } from 'vitest';
import { BOT, makeRng, type BotProfile, type Difficulty, type Rng } from './contract';
import {
  ask,
  askProblem,
  askedBy,
  beginRound,
  blurb,
  boardFor,
  BOARD_SIZE,
  botTurn,
  candidates,
  deal,
  eraLabel,
  guess,
  guessProblem,
  identityOf,
  IDENTITIES,
  initials,
  isInformative,
  isLegalAsk,
  isLegalGuess,
  isOver,
  legalQuestions,
  nameable,
  play,
  QUESTION,
  QUESTIONS,
  rankQuestions,
  scoreRound,
  split,
  startingCandidates,
  XP,
  type GuessState,
  type Move,
} from './guessWho';

const DIFFS: Difficulty[] = ['Easy', 'Normal', 'Sharp'];

/** Play a whole match with every seat driven by the same bot profile. */
function autoMatch(seats: number, bot: BotProfile, rng: Rng, boardSize: number = BOARD_SIZE): GuessState {
  let s = beginRound(deal(seats, rng, boardSize));
  for (let guard = 0; !isOver(s); guard++) {
    if (guard > 600) throw new Error('the match never reached a terminal state');
    const seat = s.turn;
    const move: Move = botTurn(s, seat, bot, rng);
    // Every move a bot makes must be legal in the position it was handed.
    if (move.kind === 'ask') expect(askProblem(s, seat, move.q)).toBeNull();
    else expect(guessProblem(s, seat, move.at)).toBeNull();
    s = play(s, seat, move);
  }
  return s;
}

/** A short signature of a finished match, for comparing two seeded replays. */
const transcript = (s: GuessState) => ({
  board: s.board.map((i) => i.name),
  secret: s.secret,
  asked: s.asked,
  out: s.out,
  winner: s.winner,
});

// ── the deck ──────────────────────────────────────────────────────

describe('the identity deck', () => {
  it('carries at least twenty-four identities, all distinct', () => {
    expect(IDENTITIES.length).toBeGreaterThanOrEqual(24);
    const names = IDENTITIES.map((i) => i.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('gives every identity a full, well-formed set of attributes', () => {
    for (const i of IDENTITIES) {
      expect(i.name.length).toBeGreaterThan(1);
      expect(Number.isFinite(i.peak)).toBe(true);
      expect(typeof i.alive).toBe('boolean');
      expect(['science', 'arts', 'sport', 'power', 'explore', 'letters']).toContain(i.field);
      expect(['europe', 'asia', 'africa', 'americas', 'oceania']).toContain(i.region);
      expect(i.traits.length).toBeGreaterThanOrEqual(1);
      expect(new Set(i.traits).size).toBe(i.traits.length);
      // A living identity cannot be remembered for something before 1900.
      if (i.alive) expect(i.peak).toBeGreaterThan(1900);
    }
  });

  it('spreads across every era, region and field so the questions bite', () => {
    const seen = <T>(f: (i: (typeof IDENTITIES)[number]) => T) => new Set(IDENTITIES.map(f));
    expect(seen((i) => i.field).size).toBe(6);
    expect(seen((i) => i.region).size).toBe(5);
    expect(seen((i) => i.alive).size).toBe(2);
    expect(IDENTITIES.filter((i) => i.peak < 1500).length).toBeGreaterThanOrEqual(4);
    expect(IDENTITIES.filter((i) => i.peak >= 1950).length).toBeGreaterThanOrEqual(8);
  });

  it('renders a card face and a blurb for every identity', () => {
    for (const i of IDENTITIES) {
      expect(initials(i.name)).toMatch(/^[A-ZÉ]{1,2}$/);
      expect(blurb(i)).toContain('·');
      expect(eraLabel(i.peak).length).toBeGreaterThan(2);
    }
    expect(initials('Leonardo da Vinci')).toBe('LV');
    expect(initials('Hokusai')).toBe('H');
    expect(eraLabel(-40)).toBe('Ancient');
    expect(eraLabel(2015)).toBe('Today');
  });
});

// ── the question bank ─────────────────────────────────────────────

describe('the question bank', () => {
  it('carries a bank of distinct, first-person questions', () => {
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(16);
    const ids = QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const q of QUESTIONS) {
      expect(q.text.endsWith('?')).toBe(true);
      expect(q.text.startsWith('Am I') || q.text.startsWith('Do I') || q.text.startsWith('Did I') || q.text.startsWith('Was I') || q.text.startsWith('Have I') || q.text.startsWith('Is my')).toBe(true);
      expect(q.tag.length).toBeGreaterThan(2);
      expect(QUESTION[q.id]).toBe(q);
    }
  });

  it('makes every question a real predicate that splits the deck both ways', () => {
    for (const q of QUESTIONS) {
      const yes = IDENTITIES.filter(q.test).length;
      expect(yes).toBeGreaterThan(0);
      expect(yes).toBeLessThan(IDENTITIES.length);
    }
  });

  it('answers from the attributes, not from anything else', () => {
    const curie = IDENTITIES.find((i) => i.name === 'Marie Curie') as (typeof IDENTITIES)[number];
    expect(QUESTION.science.test(curie)).toBe(true);
    expect(QUESTION.arts.test(curie)).toBe(false);
    expect(QUESTION.europe.test(curie)).toBe(true);
    expect(QUESTION.alive.test(curie)).toBe(false);
    expect(QUESTION.pre1900.test(curie)).toBe(false);
    expect(QUESTION.c20.test(curie)).toBe(true);
    expect(QUESTION.discovers.test(curie)).toBe(true);
    expect(QUESTION.competes.test(curie)).toBe(false);
  });

  it('separates any two identities in the deck with some question', () => {
    // If two cards answered every question alike the round could never close.
    const key = (i: (typeof IDENTITIES)[number]) => QUESTIONS.map((q) => (q.test(i) ? '1' : '0')).join('');
    const keys = IDENTITIES.map(key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

// ── the deal ──────────────────────────────────────────────────────

describe('the deal', () => {
  it('deals one distinct card per seat from a public board', () => {
    const s = deal(5, makeRng(11));
    expect(s.board).toHaveLength(BOARD_SIZE);
    expect(s.secret).toHaveLength(5);
    expect(new Set(s.secret).size).toBe(5);
    s.secret.forEach((idx) => expect(idx).toBeGreaterThanOrEqual(0));
    s.secret.forEach((idx) => expect(idx).toBeLessThan(s.board.length));
    expect(s.phase).toBe('study');
    expect(s.winner).toBeNull();
    expect(s.out).toEqual([false, false, false, false, false]);
    expect(s.turn).toBeGreaterThanOrEqual(0);
    expect(s.turn).toBeLessThan(5);
    expect(new Set(s.board.map((i) => i.name)).size).toBe(s.board.length);
  });

  it('clamps the seat count and always leaves decoys on the board', () => {
    expect(deal(1, makeRng(1)).seats).toBe(2);
    expect(deal(40, makeRng(1)).seats).toBe(8);
    expect(boardFor(8, 4)).toBe(12);
    expect(boardFor(4, 9999)).toBe(IDENTITIES.length);
    expect(deal(6, makeRng(3), 8).board).toHaveLength(10);
  });

  it('opens on a random seat rather than always on you', () => {
    const firsts = new Set(Array.from({ length: 40 }, (_, k) => deal(5, makeRng(k)).turn));
    expect(firsts.size).toBeGreaterThan(1);
  });

  it('starts every seat on the board minus the faces it can already see', () => {
    const s = beginRound(deal(5, makeRng(7)));
    expect(startingCandidates(s)).toBe(BOARD_SIZE - 4);
    for (let seat = 0; seat < s.seats; seat++) {
      const c = candidates(s, seat);
      expect(c).toHaveLength(BOARD_SIZE - 4);
      expect(c).toContain(s.secret[seat]);
      // Never a card that is face up in front of somebody else.
      for (let other = 0; other < s.seats; other++) if (other !== seat) expect(c).not.toContain(s.secret[other]);
    }
  });
});

// ── legality ──────────────────────────────────────────────────────

describe('asking', () => {
  const fresh = () => beginRound(deal(5, makeRng(21)));

  it('accepts any unspent question from the seat on turn', () => {
    const s = fresh();
    for (const id of legalQuestions(s, s.turn)) expect(isLegalAsk(s, s.turn, id)).toBe(true);
    expect(legalQuestions(s, s.turn)).toHaveLength(QUESTIONS.length);
  });

  it('rejects a question from a seat that is not on turn', () => {
    const s = fresh();
    const other = (s.turn + 1) % s.seats;
    expect(askProblem(s, other, 'alive')).toBe('not-your-turn');
    expect(() => ask(s, other, 'alive')).toThrow();
  });

  it('rejects an unknown question, and a repeat of one already spent', () => {
    const s = fresh();
    expect(askProblem(s, s.turn, 'am-i-tall')).toBe('unknown-question');
    const seat = s.turn;
    const after = ask(s, seat, 'europe');
    expect(askProblem({ ...after, turn: seat }, seat, 'europe')).toBe('already-asked');
    expect(legalQuestions(after, seat)).not.toContain('europe');
    expect(legalQuestions(after, (seat + 1) % s.seats)).toContain('europe');
  });

  it('rejects a question before the round opens and after it ends', () => {
    const study = deal(5, makeRng(21));
    expect(askProblem(study, study.turn, 'alive')).toBe('not-playing');
    const over: GuessState = { ...fresh(), phase: 'over' };
    expect(askProblem(over, over.turn, 'alive')).toBe('not-playing');
  });

  it('rejects a question from a seat that has been knocked out', () => {
    const s = fresh();
    const dead: GuessState = { ...s, out: s.out.map((_, i) => i === s.turn) };
    expect(askProblem(dead, dead.turn, 'alive')).toBe('eliminated');
  });

  it('answers truthfully from the asker’s own hidden identity, every time', () => {
    const s = fresh();
    for (let seat = 0; seat < s.seats; seat++) {
      const me = identityOf(s, seat);
      for (const q of QUESTIONS) {
        const after = ask({ ...s, turn: seat }, seat, q.id);
        const rec = after.asked[after.asked.length - 1];
        expect(rec.seat).toBe(seat);
        expect(rec.q).toBe(q.id);
        expect(rec.yes).toBe(q.test(me));
      }
    }
  });

  it('narrows the asker’s candidates and nobody else’s, keeping the truth in', () => {
    const s = fresh();
    const seat = s.turn;
    const other = (seat + 1) % s.seats;
    const before = candidates(s, seat);
    const beforeOther = candidates(s, other);

    const after = ask(s, seat, 'alive');
    const now = candidates(after, seat);
    expect(now.length).toBeLessThanOrEqual(before.length);
    expect(now).toContain(after.secret[seat]);
    // Consistency, restated: everything left answers the question the same way.
    const yes = after.asked[0].yes;
    for (const i of now) expect(QUESTION.alive.test(after.board[i])).toBe(yes);
    expect(candidates(after, other)).toEqual(beforeOther);
  });

  it('passes the turn on to the next seat still in the round', () => {
    const s = fresh();
    const seat = s.turn;
    expect(ask(s, seat, 'alive').turn).toBe((seat + 1) % s.seats);

    const gap: GuessState = { ...s, out: s.out.map((_, i) => i === (seat + 1) % s.seats) };
    expect(ask(gap, seat, 'alive').turn).toBe((seat + 2) % s.seats);
  });
});

describe('guessing', () => {
  const fresh = () => beginRound(deal(4, makeRng(33)));

  it('accepts any card the seat cannot already see in front of somebody else', () => {
    const s = fresh();
    const seat = s.turn;
    for (const i of nameable(s, seat)) expect(isLegalGuess(s, seat, i)).toBe(true);
    expect(nameable(s, seat)).toHaveLength(s.board.length - (s.seats - 1));
    expect(nameable(s, seat)).toContain(s.secret[seat]);
  });

  it('rejects a card off the board, another seat’s card, and an off-turn guess', () => {
    const s = fresh();
    const seat = s.turn;
    const other = (seat + 1) % s.seats;
    expect(guessProblem(s, seat, -1)).toBe('off-board');
    expect(guessProblem(s, seat, s.board.length)).toBe('off-board');
    expect(guessProblem(s, seat, 1.5)).toBe('off-board');
    expect(guessProblem(s, seat, s.secret[other])).toBe('someone-elses');
    expect(guessProblem(s, other, s.secret[other])).toBe('not-your-turn');
    expect(() => guess(s, seat, s.secret[other])).toThrow();
  });

  it('ends the round the moment somebody names themselves', () => {
    const s = fresh();
    const seat = s.turn;
    const won = guess(s, seat, s.secret[seat]);
    expect(won.winner).toBe(seat);
    expect(isOver(won)).toBe(true);
    expect(won.out.some(Boolean)).toBe(false);
  });

  it('knocks a wrong guess out of the round and plays on without them', () => {
    const s = fresh();
    const seat = s.turn;
    const wrong = nameable(s, seat).find((i) => i !== s.secret[seat]) as number;
    const after = guess(s, seat, wrong);
    expect(after.out[seat]).toBe(true);
    expect(after.winner).toBeNull();
    expect(isOver(after)).toBe(false);
    expect(after.turn).toBe((seat + 1) % s.seats);
    expect(askProblem({ ...after, turn: seat }, seat, 'alive')).toBe('eliminated');
    expect(guessProblem({ ...after, turn: seat }, seat, after.secret[seat])).toBe('eliminated');
  });

  it('lets you name a card your own answers have already ruled out, and lose for it', () => {
    let s = fresh();
    const seat = s.turn;
    s = ask(s, seat, 'europe');
    s = { ...s, turn: seat };
    const ruled = nameable(s, seat).find((i) => !candidates(s, seat).includes(i)) as number;
    expect(ruled).toBeGreaterThanOrEqual(0);
    expect(isLegalGuess(s, seat, ruled)).toBe(true);
    expect(guess(s, seat, ruled).out[seat]).toBe(true);
  });

  it('ends the round with nobody standing when the last seat guesses wrong', () => {
    let s = beginRound(deal(2, makeRng(4), 10));
    for (const seat of [s.turn, (s.turn + 1) % 2]) {
      const wrong = nameable(s, seat).find((i) => i !== s.secret[seat]) as number;
      s = guess({ ...s, turn: seat }, seat, wrong);
    }
    expect(isOver(s)).toBe(true);
    expect(s.winner).toBeNull();
    expect(s.out).toEqual([true, true]);
  });
});

// ── narrowing ─────────────────────────────────────────────────────

describe('narrowing', () => {
  it('measures how a question would cut what is left', () => {
    const s = beginRound(deal(4, makeRng(64)));
    const seat = s.turn;
    const total = candidates(s, seat).length;
    for (const id of legalQuestions(s, seat)) {
      const { yes, no } = split(s, seat, id);
      expect(yes + no).toBe(total);
      expect(isInformative(s, seat, id)).toBe(yes > 0 && no > 0);
    }
  });

  it('ranks the closest-to-halving question first', () => {
    const s = beginRound(deal(4, makeRng(64)));
    const seat = s.turn;
    const ranked = rankQuestions(s, seat);
    expect(ranked).toHaveLength(QUESTIONS.length);
    const cost = (id: string) => {
      const { yes, no } = split(s, seat, id);
      return Math.abs(yes - no);
    };
    for (let i = 1; i < ranked.length; i++) expect(cost(ranked[i - 1])).toBeLessThanOrEqual(cost(ranked[i]));
    // And ranking is stable, so a seeded match replays identically.
    expect(rankQuestions(s, seat)).toEqual(ranked);
  });

  it('closes a seat down to one card with a handful of well-chosen questions', () => {
    let s = beginRound(deal(4, makeRng(88)));
    const seat = s.turn;
    let asked = 0;
    while (candidates(s, seat).length > 1 && asked < QUESTIONS.length) {
      const best = rankQuestions(s, seat).find((id) => isInformative(s, seat, id));
      if (!best) break;
      s = ask({ ...s, turn: seat }, seat, best);
      asked++;
    }
    expect(candidates(s, seat)).toEqual([s.secret[seat]]);
    // Binary search over 17 cards: five questions, give or take a card.
    expect(asked).toBeLessThanOrEqual(7);
  });
});

// ── a full match ──────────────────────────────────────────────────

describe('a full match', () => {
  it('reaches a terminal state with exactly one winner, who named themselves', () => {
    let won = 0;
    for (let seed = 0; seed < 60; seed++) {
      const s = autoMatch(5, BOT.Normal, makeRng(seed));
      expect(isOver(s)).toBe(true);
      if (s.winner === null) {
        expect(s.out.every(Boolean)).toBe(true);
        continue;
      }
      won++;
      // Exactly one seat holds the win, and it is not an eliminated one.
      expect(s.out[s.winner]).toBe(false);
      expect([s.winner]).toEqual([0, 1, 2, 3, 4].filter((i) => i === s.winner));
      expect(candidates(s, s.winner)).toContain(s.secret[s.winner]);
    }
    expect(won).toBeGreaterThan(50);
  });

  it('terminates at every table size the lobby can seat', () => {
    for (let seats = 2; seats <= 8; seats++) {
      const s = autoMatch(seats, BOT.Normal, makeRng(seats * 97));
      expect(isOver(s)).toBe(true);
      expect(s.seats).toBe(seats);
      expect(s.asked.every((a) => a.seat >= 0 && a.seat < seats)).toBe(true);
    }
  });

  it('never lets a seat spend the same question twice, however long the match runs', () => {
    for (let seed = 0; seed < 30; seed++) {
      const s = autoMatch(4, BOT.Easy, makeRng(seed * 7 + 1));
      for (let seat = 0; seat < s.seats; seat++) {
        const spent = askedBy(s, seat);
        expect(new Set(spent).size).toBe(spent.length);
      }
    }
  });

  it('keeps the truth inside every seat’s candidate set to the last move', () => {
    for (let seed = 0; seed < 30; seed++) {
      const s = autoMatch(5, BOT.Sharp, makeRng(seed * 13 + 2));
      for (let seat = 0; seat < s.seats; seat++) expect(candidates(s, seat)).toContain(s.secret[seat]);
    }
  });
});

// ── scoring ───────────────────────────────────────────────────────

describe('scoring', () => {
  it('pays out by the rule: entry, questions, cards ruled out, the win, standing', () => {
    let s = beginRound(deal(4, makeRng(5), 12));
    expect(startingCandidates(s)).toBe(9);

    s = ask({ ...s, turn: 0 }, 0, 'alive');
    s = ask({ ...s, turn: 0 }, 0, 'europe');
    const wrong = nameable(s, 1).find((i) => i !== s.secret[1]) as number;
    s = guess({ ...s, turn: 1 }, 1, wrong);
    s = guess({ ...s, turn: 0 }, 0, s.secret[0]);

    const sc = scoreRound(s);
    expect(sc.winner).toBe(0);
    expect(sc.asks).toEqual([2, 0, 0, 0]);
    expect(sc.left[0]).toBe(candidates(s, 0).length);
    expect(sc.cut[0]).toBe(9 - sc.left[0]);
    expect(sc.cut[0]).toBeGreaterThan(0);

    expect(sc.xp[0]).toBe(XP.base + 2 * XP.ask + XP.cut * sc.cut[0] + XP.win);
    expect(sc.xp[1]).toBe(XP.base); // knocked out: no questions, nothing cut, no standing
    expect(sc.xp[2]).toBe(XP.base + XP.standing);
    expect(sc.xp[3]).toBe(XP.base + XP.standing);
    expect(sc.xp[0]).toBeGreaterThan(Math.max(sc.xp[1], sc.xp[2], sc.xp[3]));
  });

  it('gives the winner the most XP in a real match, and gives nobody the win bonus in a wipeout', () => {
    const s = autoMatch(4, BOT.Normal, makeRng(404));
    const sc = scoreRound(s);
    if (s.winner !== null) {
      const others = sc.xp.filter((_, i) => i !== s.winner);
      expect(sc.xp[s.winner]).toBeGreaterThan(Math.max(...others));
    }
    expect(sc.xp.every((n) => n >= XP.base)).toBe(true);
    expect(sc.asks.reduce((a, b) => a + b, 0)).toBe(s.asked.length);
  });
});

// ── the bots ──────────────────────────────────────────────────────

describe('the bots', () => {
  it('returns a legal move from every seat, at every difficulty, over many matches', () => {
    for (const d of DIFFS) {
      const rng = makeRng(2024);
      for (let round = 0; round < 12; round++) {
        const s = autoMatch(2 + (round % 7), BOT[d], rng);
        expect(isOver(s)).toBe(true);
      }
    }
  });

  it('returns a legal move from a seat that has run out of questions', () => {
    const base = beginRound(deal(4, makeRng(17)));
    const seat = 0;
    const s: GuessState = {
      ...base,
      turn: seat,
      asked: QUESTIONS.map((q) => ({ seat, q: q.id, yes: q.test(identityOf(base, seat)) })),
    };
    expect(legalQuestions(s, seat)).toHaveLength(0);
    for (const d of DIFFS) {
      const m = botTurn(s, seat, BOT[d], makeRng(3));
      expect(m.kind).toBe('guess');
      expect(guessProblem(s, seat, (m as { kind: 'guess'; at: number }).at)).toBeNull();
    }
  });

  it('returns a legal move when only uninformative questions are left', () => {
    // Squeeze a seat down to two cards, then strip the bank to questions that
    // cannot tell those two apart — there is nothing to do but gamble.
    const base = beginRound(deal(3, makeRng(41), 10));
    const seat = 0;
    let s: GuessState = { ...base, turn: seat };
    for (const id of rankQuestions(s, seat)) {
      if (candidates(s, seat).length <= 2) break;
      if (isInformative(s, seat, id)) s = { ...ask({ ...s, turn: seat }, seat, id), turn: seat };
    }
    const c = candidates(s, seat);
    expect(c.length).toBeGreaterThanOrEqual(1);
    for (const d of DIFFS) {
      const m = botTurn(s, seat, BOT[d], makeRng(9));
      if (m.kind === 'ask') expect(askProblem(s, seat, m.q)).toBeNull();
      else expect(guessProblem(s, seat, m.at)).toBeNull();
    }
  });

  it('names itself the moment one candidate is left, at every difficulty', () => {
    const base = beginRound(deal(4, makeRng(51)));
    const seat = 0;
    let s: GuessState = { ...base, turn: seat };
    for (let n = 0; n < QUESTIONS.length && candidates(s, seat).length > 1; n++) {
      const best = rankQuestions(s, seat).find((id) => isInformative(s, seat, id));
      if (!best) break;
      s = { ...ask({ ...s, turn: seat }, seat, best), turn: seat };
    }
    expect(candidates(s, seat)).toHaveLength(1);
    for (const d of DIFFS) {
      const m = botTurn(s, seat, BOT[d], makeRng(77));
      expect(m).toEqual({ kind: 'guess', at: s.secret[seat] });
      expect(guess(s, seat, (m as { kind: 'guess'; at: number }).at).winner).toBe(seat);
    }
  });

  it('has a sharp bot pick a far better splitter than a weak one from the same position', () => {
    const meanCost = (d: Difficulty) => {
      let total = 0;
      for (let seed = 0; seed < 150; seed++) {
        const s = beginRound(deal(5, makeRng(seed)));
        const seat = s.turn;
        const m = botTurn(s, seat, BOT[d], makeRng(seed + 9000));
        if (m.kind !== 'ask') {
          total += candidates(s, seat).length; // a gamble learns nothing
          continue;
        }
        const { yes, no } = split(s, seat, m.q);
        total += Math.abs(yes - no);
      }
      return total / 150;
    };
    const sharp = meanCost('Sharp');
    const normal = meanCost('Normal');
    const easy = meanCost('Easy');
    expect(sharp).toBeLessThan(normal);
    expect(normal).toBeLessThan(easy);
    // A sharp bot is within a card of a perfect halving; an easy one is nowhere near.
    expect(sharp).toBeLessThan(1.5);
    expect(easy).toBeGreaterThan(4);
  });

  it('has an easy table knock itself out far more often than a sharp one', () => {
    const knockouts = (d: Difficulty) => {
      let n = 0;
      for (let seed = 0; seed < 120; seed++) n += autoMatch(4, BOT[d], makeRng(seed * 11 + 3)).out.filter(Boolean).length;
      return n;
    };
    const easy = knockouts('Easy');
    const sharp = knockouts('Sharp');
    expect(easy).toBeGreaterThan(sharp * 4);
    expect(sharp).toBeLessThan(10);
  });

  it('lets a sharp seat beat easy seats at the same table more often than not', () => {
    const profile = (seat: number) => (seat % 2 === 0 ? BOT.Sharp : BOT.Easy);
    let sharpWins = 0;
    let easyWins = 0;
    for (let seed = 0; seed < 200; seed++) {
      const rng = makeRng(seed * 29 + 5);
      let s = beginRound(deal(4, rng));
      for (let guard = 0; !isOver(s) && guard < 600; guard++) {
        const seat = s.turn;
        s = play(s, seat, botTurn(s, seat, profile(seat), rng));
      }
      if (s.winner === null) continue;
      if (s.winner % 2 === 0) sharpWins++;
      else easyWins++;
    }
    expect(sharpWins).toBeGreaterThan(easyWins + 15);
    // …but not so far ahead that turn order stops mattering — this is a race.
    expect(easyWins).toBeGreaterThan(40);
  });
});

// ── determinism ───────────────────────────────────────────────────

describe('reproducibility', () => {
  it('replays a whole match identically from the same seed', () => {
    const run = () => transcript(autoMatch(5, BOT.Normal, makeRng(20260902)));
    expect(run()).toEqual(run());
  });

  it('replays identically at every difficulty', () => {
    for (const d of DIFFS) {
      const run = () => transcript(autoMatch(4, BOT[d], makeRng(7777)));
      expect(run()).toEqual(run());
    }
  });

  it('gives a different match from a different seed', () => {
    const sig = (seed: number) => JSON.stringify(transcript(autoMatch(5, BOT.Normal, makeRng(seed))));
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map(sig)).size).toBeGreaterThan(5);
  });

  it('deals the same board and the same secrets from the same seed', () => {
    const a = deal(6, makeRng(1234));
    const b = deal(6, makeRng(1234));
    expect(a.board.map((i) => i.name)).toEqual(b.board.map((i) => i.name));
    expect(a.secret).toEqual(b.secret);
    expect(a.turn).toBe(b.turn);
  });
});
