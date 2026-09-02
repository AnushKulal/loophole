import { describe, expect, it } from 'vitest';
import { BOT, makeRng, type BotProfile, type Rng } from './contract';
import {
  affinity,
  beginClues,
  botClue,
  botVote,
  castVote,
  civFit,
  clampOdd,
  clueProblem,
  deal,
  fitVector,
  isImposter,
  isLegalClue,
  isLegalVote,
  legalClues,
  norm,
  openVote,
  scoreRound,
  similarity,
  submitClue,
  suggestions,
  toSpeak,
  voteProblem,
  WORD_PAIRS,
  type ImposterState,
} from './imposterWord';

const DIFFS = ['Easy', 'Normal', 'Sharp'] as const;

/** Run a whole round with every seat played by a bot. */
function autoRound(seats: number, odd: number, bot: BotProfile, rng: Rng): ImposterState {
  let s = beginClues(deal(seats, odd, rng));
  while (s.phase === 'clues') {
    const seat = toSpeak(s);
    expect(seat).not.toBeNull();
    s = submitClue(s, seat as number, botClue(s, seat as number, bot, rng));
  }
  s = openVote(s);
  for (let seat = 0; seat < s.seats; seat++) s = castVote(s, seat, botVote(s, seat, bot, rng));
  return s;
}

// ── the bank ──────────────────────────────────────────────────────

describe('word bank', () => {
  it('carries at least thirty pairs, each with clues for both words', () => {
    expect(WORD_PAIRS.length).toBeGreaterThanOrEqual(30);
    for (const p of WORD_PAIRS) {
      expect(p.civ).not.toBe(p.imp);
      expect(p.both.length).toBeGreaterThanOrEqual(3);
      expect(p.civOnly.length).toBeGreaterThanOrEqual(3);
      expect(p.impOnly.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('never repeats a clue inside one pair', () => {
    for (const p of WORD_PAIRS) {
      const all = [...p.both, ...p.civOnly, ...p.impOnly].map(norm);
      expect(new Set(all).size).toBe(all.length);
      expect(all).not.toContain(norm(p.civ));
      expect(all).not.toContain(norm(p.imp));
    }
  });

  it('ranks a civilian-only clue above a shared one above an imposter-only one', () => {
    for (const p of WORD_PAIRS) {
      const civ = civFit(p.civOnly[0], p);
      const both = civFit(p.both[0], p);
      const imp = civFit(p.impOnly[0], p);
      expect(civ).toBeGreaterThan(both);
      expect(both).toBeGreaterThan(imp);
    }
  });

  it('offers every seat a legal clue in its own word, whichever word it holds', () => {
    const rng = makeRng(4);
    for (let i = 0; i < WORD_PAIRS.length; i++) {
      const s = deal(5, 2, rng);
      for (let seat = 0; seat < s.seats; seat++) {
        const pool = legalClues(s, seat);
        expect(pool.length).toBeGreaterThanOrEqual(6);
        // A seat is only ever offered clues about the word it can actually see.
        const own = isImposter(s, seat) ? [...s.pair.both, ...s.pair.impOnly] : [...s.pair.both, ...s.pair.civOnly];
        for (const c of pool) expect(own).toContain(c);
      }
    }
  });
});

// ── clue semantics ────────────────────────────────────────────────

describe('clue fit', () => {
  const beach = WORD_PAIRS[0]; // Beach / Desert

  it('places an unknown clue near the middle rather than condemning it', () => {
    const [civ, imp] = fitVector('seahorse', beach);
    // Between the imposter-only floor and the civilian-only ceiling, and close
    // enough to a shared clue that typing your own words is not a death sentence.
    for (const v of [civ, imp]) {
      expect(v).toBeGreaterThan(civFit(beach.impOnly[0], beach));
      expect(v).toBeLessThan(civFit(beach.civOnly[0], beach));
      expect(Math.abs(v - civFit(beach.both[0], beach))).toBeLessThan(0.1);
    }
  });

  it('marks an unknown clue that leans on the imposter word', () => {
    const [civ, imp] = fitVector('camels', beach);
    expect(imp).toBeGreaterThan(0.85);
    expect(civ).toBeLessThan(0.6);
    expect(civ).toBeLessThan(civFit('waves', beach));
  });

  it('treats the secret word itself as a perfect fit for that word', () => {
    expect(civFit('beach', beach)).toBe(1);
    expect(civFit('desert', beach)).toBeCloseTo(0.12, 5);
  });

  it('scores similarity between 0 and 1, symmetrically', () => {
    expect(similarity('sand', 'sand')).toBe(1);
    expect(similarity('sandy', 'sand')).toBeGreaterThan(0.7);
    expect(similarity('sand', 'sandy')).toBe(similarity('sandy', 'sand'));
    expect(similarity('sand', 'monologue')).toBeLessThan(0.2);
    expect(similarity('', 'sand')).toBe(0);
  });

  it('rates two shared clues as more alike than a shared and an imposter clue', () => {
    expect(affinity(beach.both[0], beach.both[1], beach)).toBeGreaterThan(
      affinity(beach.both[0], beach.impOnly[0], beach),
    );
  });
});

// ── the deal ──────────────────────────────────────────────────────

describe('deal', () => {
  it('gives everyone but the odd ones the same word', () => {
    const s = deal(5, 1, makeRng(11));
    expect(s.imposters).toHaveLength(1);
    expect(s.words.filter((w) => w === s.pair.civ)).toHaveLength(4);
    expect(s.words[s.imposters[0]]).toBe(s.pair.imp);
    expect(s.phase).toBe('reveal');
    expect(s.order.slice().sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });

  it('honours the odd-ones-out option and keeps at least two civilians', () => {
    expect(deal(5, 3, makeRng(2)).imposters).toHaveLength(3);
    expect(deal(4, 3, makeRng(2)).imposters).toHaveLength(2);
    expect(deal(3, 9, makeRng(2)).imposters).toHaveLength(1);
    expect(clampOdd(0, 5)).toBe(1);
    expect(clampOdd(7, 5)).toBe(3);
  });
});

// ── legality ──────────────────────────────────────────────────────

describe('clue legality', () => {
  const fresh = () => beginClues(deal(5, 1, makeRng(7)));

  it('accepts a plain one-word clue from the seat whose turn it is', () => {
    const s = fresh();
    const seat = toSpeak(s) as number;
    expect(isLegalClue(s, seat, legalClues(s, seat)[0])).toBe(true);
    expect(isLegalClue(s, seat, '  Sandy  ')).toBe(true);
  });

  it('rejects a clue from a seat that is not on turn', () => {
    const s = fresh();
    const other = s.order[1];
    expect(clueProblem(s, other, 'sand')).toBe('not-your-turn');
    expect(() => submitClue(s, other, 'sand')).toThrow();
  });

  it('rejects empty, multi-word, over-long and non-letter clues', () => {
    const s = fresh();
    const seat = toSpeak(s) as number;
    expect(clueProblem(s, seat, '   ')).toBe('empty');
    expect(clueProblem(s, seat, 'two words')).toBe('multi-word');
    expect(clueProblem(s, seat, 'a')).toBe('too-short');
    expect(clueProblem(s, seat, 'extraordinarily')).toBe('too-long');
    expect(clueProblem(s, seat, 'sand4')).toBe('bad-chars');
  });

  it('rejects saying your own word, or an inflection of it', () => {
    const s = fresh();
    const seat = toSpeak(s) as number;
    const mine = s.words[seat];
    expect(clueProblem(s, seat, mine)).toBe('the-word');
    expect(clueProblem(s, seat, mine.toUpperCase())).toBe('the-word');
    expect(clueProblem(s, seat, `${mine}s`)).toBe('the-word');
  });

  it('rejects a clue somebody has already said', () => {
    let s = fresh();
    const first = toSpeak(s) as number;
    const said = legalClues(s, first)[0];
    s = submitClue(s, first, said);
    const next = toSpeak(s) as number;
    expect(clueProblem(s, next, said.toUpperCase())).toBe('duplicate');
    expect(legalClues(s, next)).not.toContain(said);
  });

  it('refuses clues once the clue round is over', () => {
    let s = fresh();
    while (s.phase === 'clues') {
      const seat = toSpeak(s) as number;
      s = submitClue(s, seat, legalClues(s, seat)[0]);
    }
    expect(s.phase).toBe('discuss');
    expect(toSpeak(s)).toBeNull();
    expect(clueProblem(s, 0, 'sand')).toBe('not-your-turn');
  });
});

describe('vote legality', () => {
  const upToVote = () => {
    let s = beginClues(deal(5, 1, makeRng(21)));
    while (s.phase === 'clues') {
      const seat = toSpeak(s) as number;
      s = submitClue(s, seat, legalClues(s, seat)[0]);
    }
    return openVote(s);
  };

  it('accepts a vote for another seat and rejects the rest', () => {
    const s = upToVote();
    expect(isLegalVote(s, 0, 3)).toBe(true);
    expect(voteProblem(s, 0, 0)).toBe('self');
    expect(voteProblem(s, 0, 5)).toBe('off-table');
    expect(voteProblem(s, 0, -1)).toBe('off-table');
    expect(voteProblem(s, 0, 1.5)).toBe('off-table');
    expect(() => castVote(s, 0, 0)).toThrow();
  });

  it('rejects a second vote from the same seat', () => {
    const s = castVote(upToVote(), 0, 2);
    expect(voteProblem(s, 0, 3)).toBe('already-voted');
    expect(s.votes[0]).toBe(2);
  });

  it('rejects any vote before voting opens', () => {
    const s = beginClues(deal(5, 1, makeRng(21)));
    expect(voteProblem(s, 0, 1)).toBe('not-voting');
  });
});

// ── a full round ──────────────────────────────────────────────────

describe('a full round', () => {
  it('reaches the reveal with one clue and one vote per seat', () => {
    const s = autoRound(5, 1, BOT.Normal, makeRng(99));
    expect(s.phase).toBe('result');
    expect(s.clues.every((c) => typeof c === 'string' && c.length > 1)).toBe(true);
    expect(new Set(s.clues).size).toBe(5);
    expect(s.votes.every((v) => v !== null)).toBe(true);
    s.votes.forEach((v, seat) => expect(v).not.toBe(seat));
  });

  it('declares exactly one winning side, and the sides do not overlap', () => {
    for (let seed = 0; seed < 60; seed++) {
      const s = autoRound(5, 1, BOT.Normal, makeRng(seed));
      const sc = scoreRound(s);
      expect(['table', 'imposters']).toContain(sc.winner);
      // The winning side is exactly the side the ejection decided.
      expect(sc.winner === 'table').toBe(sc.caught);
      const winners = s.words.map((_, i) => (sc.winner === 'table' ? !isImposter(s, i) : isImposter(s, i)));
      expect(winners.filter(Boolean).length).toBeGreaterThan(0);
      expect(winners.filter(Boolean).length).toBeLessThan(s.seats);
    }
  });

  it('ejects the seat with the most votes, and nobody on a tie', () => {
    let s = autoRound(4, 1, BOT.Normal, makeRng(5));
    // Overwrite the tally by hand so the rule itself is under test.
    s = { ...s, votes: [1, 2, 1, 1] };
    let sc = scoreRound(s);
    expect(sc.counts).toEqual([0, 3, 1, 0]);
    expect(sc.ejected).toBe(1);

    sc = scoreRound({ ...s, votes: [1, 2, 3, 1] });
    expect(sc.counts).toEqual([0, 2, 1, 1]);
    expect(sc.ejected).toBe(1);

    sc = scoreRound({ ...s, votes: [1, 0, 3, 2] });
    expect(sc.top).toEqual([0, 1, 2, 3]);
    expect(sc.ejected).toBeNull();
    expect(sc.caught).toBe(false);
    expect(sc.winner).toBe('imposters');
  });

  it('gives the table the round only when an odd one is ejected', () => {
    const s = autoRound(5, 1, BOT.Sharp, makeRng(3));
    const odd = s.imposters[0];
    const town = [0, 1, 2, 3, 4].find((i) => i !== odd) as number;

    const caught = scoreRound({ ...s, votes: s.votes.map(() => odd) as number[] });
    expect(caught.ejected).toBe(odd);
    expect(caught.caught).toBe(true);
    expect(caught.winner).toBe('table');

    const missed = scoreRound({ ...s, votes: s.votes.map(() => town) as number[] });
    expect(missed.ejected).toBe(town);
    expect(missed.caught).toBe(false);
    expect(missed.winner).toBe('imposters');
  });

  it('pays out by the rule: reading it right, surviving, and the winning side', () => {
    let s = beginClues(deal(4, 1, makeRng(31)));
    while (s.phase === 'clues') {
      const seat = toSpeak(s) as number;
      s = submitClue(s, seat, legalClues(s, seat)[0]);
    }
    s = openVote(s);
    const odd = s.imposters[0];
    const town = [0, 1, 2, 3].filter((i) => i !== odd);

    // Everybody votes the odd one out: the table wins.
    const win = scoreRound({ ...s, votes: s.votes.map(() => odd) as number[] });
    expect(win.winner).toBe('table');
    town.forEach((i) => expect(win.xp[i]).toBe(20 + 100 + 80)); // read it right, on the winning side
    expect(win.xp[odd]).toBe(20 + 40); // ejected: base plus the odd-seat allowance

    // Everybody votes a civilian: the odd one survives.
    const away = scoreRound({ ...s, votes: s.votes.map(() => town[0]) as number[] });
    expect(away.winner).toBe('imposters');
    expect(away.xp[odd]).toBe(20 + 40 + 200 + 80);
    expect(away.xp[town[1]]).toBe(20); // voted a civilian, lost the round
  });

  it('runs a round with three odd ones out and catches any one of them', () => {
    const s = autoRound(6, 3, BOT.Normal, makeRng(77));
    expect(s.imposters).toHaveLength(3);
    const forced = scoreRound({ ...s, votes: s.votes.map(() => s.imposters[2]) as number[] });
    expect(forced.caught).toBe(true);
    expect(forced.winner).toBe('table');
    // The two who were not ejected still collect the survival bonus.
    expect(forced.xp[s.imposters[0]]).toBe(20 + 40 + 200);
  });
});

// ── the bots ──────────────────────────────────────────────────────

describe('bots', () => {
  it('gives a legal clue from every seat, at every difficulty, over many deals', () => {
    for (const d of DIFFS) {
      const rng = makeRng(1234);
      for (let round = 0; round < 40; round++) {
        let s = beginClues(deal(5, round % 3 === 0 ? 2 : 1, rng));
        while (s.phase === 'clues') {
          const seat = toSpeak(s) as number;
          const clue = botClue(s, seat, BOT[d], rng);
          expect(clueProblem(s, seat, clue)).toBeNull();
          s = submitClue(s, seat, clue);
        }
        expect(s.phase).toBe('discuss');
      }
    }
  });

  it('votes legally from every seat, at every difficulty, and never for itself', () => {
    for (const d of DIFFS) {
      const rng = makeRng(555);
      for (let round = 0; round < 40; round++) {
        let s = beginClues(deal(2 + (round % 5), 1, rng));
        while (s.phase === 'clues') {
          const seat = toSpeak(s) as number;
          s = submitClue(s, seat, botClue(s, seat, BOT[d], rng));
        }
        s = openVote(s);
        for (let seat = 0; seat < s.seats; seat++) {
          const target = botVote(s, seat, BOT[d], rng);
          expect(isLegalVote(s, seat, target)).toBe(true);
          s = castVote(s, seat, target);
        }
        expect(s.phase).toBe('result');
      }
    }
  });

  it('votes legally even when a seat never gave a clue', () => {
    const rng = makeRng(8);
    const s: ImposterState = { ...beginClues(deal(4, 1, rng)), phase: 'vote', clues: ['sand', null, 'waves', null] };
    for (const d of DIFFS)
      for (let seat = 0; seat < 4; seat++) expect(isLegalVote(s, seat, botVote(s, seat, BOT[d], rng))).toBe(true);
  });

  it('has a sharp imposter hide in a shared clue where a careless one exposes itself', () => {
    const sharp = { skill: 1, depth: 3, blunder: 0, think: 0 };
    const sloppy = { skill: 0, depth: 1, blunder: 0, think: 0 };
    let sharpSafe = 0;
    let sloppySafe = 0;

    for (let seed = 0; seed < 200; seed++) {
      const base = beginClues(deal(5, 1, makeRng(seed)));
      const odd = base.imposters[0];
      // Put the odd one on turn so both profiles face the identical position.
      const s: ImposterState = { ...base, order: [odd, ...base.order.filter((i) => i !== odd)], turn: 0 };
      if (base.pair.both.includes(botClue(s, odd, sharp, makeRng(seed + 1)))) sharpSafe++;
      if (base.pair.both.includes(botClue(s, odd, sloppy, makeRng(seed + 1)))) sloppySafe++;
    }
    expect(sharpSafe).toBeGreaterThan(160);
    expect(sloppySafe).toBeLessThan(sharpSafe - 40);
  });

  it('has a sharp table catch a careless imposter far more often than an easy table does', () => {
    const catchRate = (d: (typeof DIFFS)[number]) => {
      let caught = 0;
      for (let seed = 0; seed < 200; seed++) {
        const rng = makeRng(seed * 31 + 7);
        let s = beginClues(deal(5, 1, rng));
        while (s.phase === 'clues') {
          const seat = toSpeak(s) as number;
          // The odd one always blurts out a clue only its own word explains.
          const clue = isImposter(s, seat)
            ? (legalClues(s, seat).find((c) => s.pair.impOnly.includes(c)) as string)
            : botClue(s, seat, BOT[d], rng);
          s = submitClue(s, seat, clue);
        }
        s = openVote(s);
        for (let seat = 0; seat < s.seats; seat++) s = castVote(s, seat, botVote(s, seat, BOT[d], rng));
        if (scoreRound(s).caught) caught++;
      }
      return caught;
    };

    const sharp = catchRate('Sharp');
    const easy = catchRate('Easy');
    expect(sharp).toBeGreaterThan(170);
    expect(easy).toBeLessThan(sharp);
  });

  it('lets a well-hidden odd one get away against a sharp table often enough to be a game', () => {
    let survived = 0;
    for (let seed = 0; seed < 200; seed++) {
      const rng = makeRng(seed * 13 + 5);
      let s = beginClues(deal(5, 1, rng));
      while (s.phase === 'clues') {
        const seat = toSpeak(s) as number;
        const clue = isImposter(s, seat)
          ? (legalClues(s, seat).find((c) => s.pair.both.includes(c)) as string)
          : botClue(s, seat, BOT.Sharp, rng);
        s = submitClue(s, seat, clue);
      }
      s = openVote(s);
      for (let seat = 0; seat < s.seats; seat++) s = castVote(s, seat, botVote(s, seat, BOT.Sharp, rng));
      if (!scoreRound(s).caught) survived++;
    }
    expect(survived).toBeGreaterThan(20);
    expect(survived).toBeLessThan(180);
  });
});

// ── determinism ───────────────────────────────────────────────────

describe('reproducibility', () => {
  it('replays a whole match identically from the same seed', () => {
    const run = () => {
      const s = autoRound(5, 1, BOT.Normal, makeRng(20260902));
      return { pair: s.pair.civ, imposters: s.imposters, order: s.order, clues: s.clues, votes: s.votes, score: scoreRound(s) };
    };
    expect(run()).toEqual(run());
  });

  it('gives a different match from a different seed', () => {
    const sig = (seed: number) => JSON.stringify(autoRound(5, 1, BOT.Normal, makeRng(seed)).clues);
    const sigs = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(sig));
    expect(sigs.size).toBeGreaterThan(4);
  });

  it('draws the same suggestions for a seat from the same seed', () => {
    const s = beginClues(deal(5, 1, makeRng(64)));
    expect(suggestions(s, 0, makeRng(9), 4)).toEqual(suggestions(s, 0, makeRng(9), 4));
    expect(suggestions(s, 0, makeRng(9), 4)).toHaveLength(4);
    // Every suggestion is legal once that seat is on turn.
    const onTurn: ImposterState = { ...s, order: [0, ...s.order.filter((i) => i !== 0)], turn: 0 };
    for (const c of suggestions(s, 0, makeRng(9), 4)) expect(isLegalClue(onTurn, 0, c)).toBe(true);
  });
});
