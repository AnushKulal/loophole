import { describe, expect, it } from 'vitest';
import { BOT, makeRng, type BotProfile, type Rng } from './contract';
import {
  BLUFF_PRIOR,
  CHAMBERS,
  DECK,
  HAND,
  JOKERS,
  MAX_PLAY,
  PER_RANK,
  TABLE_RANKS,
  TRUTH_PER_DECK,
  accept,
  aliveSeats,
  bluffOdds,
  botChallenge,
  botPlay,
  buildDeck,
  callLiar,
  canAct,
  claimText,
  clicksOf,
  copiesFor,
  danger,
  dealRound,
  decideProblem,
  hyperAtLeast,
  isLegalPlay,
  isTruth,
  judgeOdds,
  legalPlays,
  lieOdds,
  nextActive,
  nextRound,
  placeOf,
  playCards,
  playProblem,
  pullTrigger,
  seenTruth,
  startMatch,
  truthDealt,
  willFire,
  xpFor,
  type LiarState,
  type Rank,
  type Seat,
  type TableRank,
} from './liarsBar';

const DIFFS = ['Easy', 'Normal', 'Sharp'] as const;

/** A hand-built table, so a rule can be tested without waiting for a deal. */
function rig(hands: Rank[][], rank: TableRank = 'K', over: Partial<LiarState> = {}): LiarState {
  let id = 0;
  const players: Seat[] = hands.map<Seat>((h) => ({
    hand: h.map((r) => ({ r, id: id++ })),
    played: [],
    revolver: { live: 3, spent: 0 },
    alive: true,
  }));
  return {
    seats: hands.length,
    copies: copiesFor(hands.length),
    rank,
    players,
    claim: null,
    turn: 0,
    decider: null,
    showdown: null,
    phase: 'play',
    round: 1,
    dealt: hands.reduce((n, h) => n + h.length, 0),
    out: [],
    winner: null,
    log: [],
    nextId: id,
    ...over,
  };
}

/** A match where each seat plays to its own profile, to a last one standing. */
function duel(profiles: BotProfile[], rng: Rng): LiarState {
  let s = startMatch(profiles.length, rng);
  for (let step = 0; step < 20000 && s.phase !== 'over'; step++) {
    if (s.phase === 'play') s = playCards(s, s.turn, botPlay(s, s.turn, profiles[s.turn], rng));
    else if (s.phase === 'challenge') {
      const d = s.decider as number;
      s = botChallenge(s, d, profiles[d], rng) ? callLiar(s, d) : accept(s, d);
    } else if (s.phase === 'showdown') s = pullTrigger(s);
    else s = nextRound(s, rng);
  }
  return s;
}

/** Every seat played by a bot, all the way to the last one standing. */
function autoMatch(seats: number, bot: BotProfile, rng: Rng, check = false): LiarState {
  let s = startMatch(seats, rng);
  for (let step = 0; step < 20000 && s.phase !== 'over'; step++) {
    if (s.phase === 'play') {
      const seat = s.turn;
      const idx = botPlay(s, seat, bot, rng);
      if (check) expect(playProblem(s, seat, idx)).toBeNull();
      s = playCards(s, seat, idx);
    } else if (s.phase === 'challenge') {
      const seat = s.decider as number;
      if (check) expect(decideProblem(s, seat)).toBeNull();
      s = botChallenge(s, seat, bot, rng) ? callLiar(s, seat) : accept(s, seat);
    } else if (s.phase === 'showdown') {
      s = pullTrigger(s);
    } else {
      s = nextRound(s, rng);
    }
  }
  return s;
}

// ── the deck ──────────────────────────────────────────────────────

describe('the deck', () => {
  it('is six Kings, six Queens, six Aces and two jokers', () => {
    const d = buildDeck();
    expect(d).toHaveLength(DECK);
    expect(DECK).toBe(20);
    for (const r of TABLE_RANKS) expect(d.filter((x) => x === r)).toHaveLength(PER_RANK);
    expect(d.filter((x) => x === 'J')).toHaveLength(JOKERS);
    expect(TRUTH_PER_DECK).toBe(PER_RANK + JOKERS);
  });

  it('shuffles in a second deck only when five seats or more need a hand', () => {
    expect(copiesFor(2)).toBe(1);
    expect(copiesFor(4)).toBe(1);
    expect(copiesFor(5)).toBe(2);
    expect(copiesFor(6)).toBe(2);
    expect(buildDeck(2)).toHaveLength(40);
  });

  it('treats a joker as any table card and nothing else as a match', () => {
    expect(isTruth({ r: 'J', id: 0 }, 'K')).toBe(true);
    expect(isTruth({ r: 'J', id: 0 }, 'A')).toBe(true);
    expect(isTruth({ r: 'K', id: 0 }, 'K')).toBe(true);
    expect(isTruth({ r: 'Q', id: 0 }, 'K')).toBe(false);
  });

  it('names a claim the way the table says it out loud', () => {
    expect(claimText('K', 1)).toBe('1 King');
    expect(claimText('A', 3)).toBe('3 Aces');
  });
});

// ── the deal ──────────────────────────────────────────────────────

describe('the deal', () => {
  it('gives every living seat five cards, a table card and a loaded revolver', () => {
    const s = startMatch(4, makeRng(11));
    expect(s.seats).toBe(4);
    expect(s.round).toBe(1);
    expect(s.phase).toBe('play');
    expect(TABLE_RANKS).toContain(s.rank);
    expect(s.dealt).toBe(4 * HAND);
    for (const p of s.players) {
      expect(p.hand).toHaveLength(HAND);
      expect(p.played).toHaveLength(0);
      expect(p.alive).toBe(true);
      expect(p.revolver.spent).toBe(0);
      expect(p.revolver.live).toBeGreaterThanOrEqual(0);
      expect(p.revolver.live).toBeLessThan(CHAMBERS);
    }
    // Every card in play is distinct, and the hands are a real subset of a deck.
    const ids = s.players.flatMap((p) => p.hand.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never deals more of a rank than the shuffled decks hold', () => {
    for (let seed = 0; seed < 60; seed++) {
      const s = startMatch(4, makeRng(seed));
      const all = s.players.flatMap((p) => p.hand.map((c) => c.r));
      for (const r of TABLE_RANKS) expect(all.filter((x) => x === r).length).toBeLessThanOrEqual(PER_RANK);
      expect(all.filter((x) => x === 'J').length).toBeLessThanOrEqual(JOKERS);
    }
  });

  it('seats six at the table by shuffling a second deck in', () => {
    const s = startMatch(6, makeRng(3));
    expect(s.copies).toBe(2);
    expect(s.dealt).toBe(30);
    s.players.forEach((p) => expect(p.hand).toHaveLength(HAND));
  });

  it('deals nothing to a seat that has been shot out', () => {
    let s = startMatch(4, makeRng(5));
    s = { ...s, players: s.players.map((p, i) => (i === 2 ? { ...p, alive: false } : p)) };
    s = dealRound(s, makeRng(6), 0);
    expect(s.players[2].hand).toHaveLength(0);
    expect(s.dealt).toBe(3 * HAND);
    expect(aliveSeats(s)).toEqual([0, 1, 3]);
    expect(canAct(s, 2)).toBe(false);
    expect(nextActive(s, 1)).toBe(3);
  });
});

// ── legality ──────────────────────────────────────────────────────

describe('playing cards', () => {
  const s = rig([
    ['K', 'K', 'Q', 'A', 'J'],
    ['K', 'Q', 'Q', 'A', 'A'],
  ]);

  it('accepts one, two or three cards from the seat on turn', () => {
    expect(isLegalPlay(s, 0, [0])).toBe(true);
    expect(isLegalPlay(s, 0, [4, 0])).toBe(true);
    expect(isLegalPlay(s, 0, [0, 1, 2])).toBe(true);
  });

  it('rejects a play from a seat that is not on turn or a phase that is not play', () => {
    expect(playProblem(s, 1, [0])).toBe('not-your-turn');
    expect(playProblem({ ...s, phase: 'challenge', decider: 1 }, 0, [0])).toBe('not-your-turn');
    expect(() => playCards(s, 1, [0])).toThrow();
  });

  it('rejects nothing, four cards, cards off the hand and the same card twice', () => {
    expect(playProblem(s, 0, [])).toBe('no-cards');
    expect(playProblem(s, 0, [0, 1, 2, 3])).toBe('too-many');
    expect(playProblem(s, 0, [5])).toBe('off-hand');
    expect(playProblem(s, 0, [-1])).toBe('off-hand');
    expect(playProblem(s, 0, [1.5])).toBe('off-hand');
    expect(playProblem(s, 0, [0, 0])).toBe('same-card');
    expect(MAX_PLAY).toBe(3);
  });

  it('offers every one-, two- and three-card shape of a five-card hand', () => {
    const shapes = legalPlays(s, 0);
    expect(shapes).toHaveLength(5 + 10 + 10);
    for (const idx of shapes) expect(isLegalPlay(s, 0, idx)).toBe(true);
  });

  it('moves the cards out of the hand and hands the decision to the next seat', () => {
    const n = playCards(s, 0, [0, 2]);
    expect(n.players[0].hand.map((c) => c.r)).toEqual(['K', 'A', 'J']);
    expect(n.players[0].played.map((c) => c.r)).toEqual(['K', 'Q']);
    expect(n.claim?.seat).toBe(0);
    expect(n.claim?.cards).toHaveLength(2);
    expect(n.phase).toBe('challenge');
    expect(n.decider).toBe(1);
  });

  it('passes the play to whoever lets a claim stand', () => {
    const n = accept(playCards(s, 0, [0]), 1);
    expect(n.phase).toBe('play');
    expect(n.turn).toBe(1);
    expect(n.claim).toBeNull();
    expect(n.decider).toBeNull();
    // Only the seat being asked may answer.
    expect(decideProblem(playCards(s, 0, [0]), 0)).toBe('not-deciding');
    expect(() => accept(playCards(s, 0, [0]), 0)).toThrow();
    expect(() => callLiar(n, 0)).toThrow();
  });

  it('skips a seat that has run out of cards when choosing who judges', () => {
    const three = rig([
      ['K', 'Q'],
      [],
      ['A', 'A'],
    ]);
    const n = playCards(three, 0, [0]);
    expect(n.decider).toBe(2);
  });

  it('burns the round out when nobody is left holding cards', () => {
    const two = rig([['K'], []]);
    const n = playCards(two, 0, [0]);
    expect(n.phase).toBe('exhausted');
    expect(n.decider).toBeNull();
  });
});

// ── the showdown ──────────────────────────────────────────────────

describe('calling liar', () => {
  const table = () =>
    rig([
      ['K', 'K', 'J', 'Q', 'A'],
      ['K', 'Q', 'Q', 'A', 'A'],
    ]);

  it('shoots the liar when the claim was false', () => {
    const s = callLiar(playCards(table(), 0, [3]), 1); // a Queen claimed as a King
    expect(s.phase).toBe('showdown');
    expect(s.showdown?.honest).toBe(false);
    expect(s.showdown?.shooter).toBe(0);
    expect(s.showdown?.caller).toBe(1);
  });

  it('shoots the caller when the claim was true', () => {
    const s = callLiar(playCards(table(), 0, [0, 1]), 1); // two real Kings
    expect(s.showdown?.honest).toBe(true);
    expect(s.showdown?.shooter).toBe(1);
  });

  it('counts a joker as the table card, so a joker claim is honest', () => {
    const s = callLiar(playCards(table(), 0, [0, 2]), 1); // King + Joker
    expect(s.showdown?.honest).toBe(true);
    expect(s.showdown?.shooter).toBe(1);
  });

  it('calls a mixed claim a lie — one wrong card is enough', () => {
    const s = callLiar(playCards(table(), 0, [0, 2, 4]), 1); // King, Joker, Ace
    expect(s.showdown?.honest).toBe(false);
    expect(s.showdown?.shooter).toBe(0);
  });
});

// ── the revolver ──────────────────────────────────────────────────

describe('the revolver', () => {
  it('clicks on a chamber that is not the live one and fires on the one that is', () => {
    expect(willFire({ live: 0, spent: 0 })).toBe(true);
    expect(willFire({ live: 3, spent: 0 })).toBe(false);
    expect(willFire({ live: 3, spent: 3 })).toBe(true);
  });

  it('gets deadlier with every click, reaching a certainty on the sixth', () => {
    expect(danger({ live: 5, spent: 0 })).toBeCloseTo(1 / 6, 6);
    expect(danger({ live: 5, spent: 3 })).toBeCloseTo(1 / 3, 6);
    expect(danger({ live: 5, spent: 5 })).toBe(1);
  });

  it('spends a chamber and leaves the shooter standing on a click', () => {
    let s = rig([
      ['K', 'Q'],
      ['K', 'Q'],
    ]);
    s.players[0].revolver = { live: 4, spent: 1 };
    s = pullTrigger(callLiar(playCards(s, 0, [1]), 1)); // a Queen: seat 0 lied
    expect(s.showdown?.fired).toBe(false);
    expect(s.players[0].alive).toBe(true);
    expect(s.players[0].revolver.spent).toBe(2);
    expect(s.phase).toBe('shot');
    expect(s.winner).toBeNull();
    expect(s.out).toEqual([]);
  });

  it('takes the shooter out on the live chamber and ends the match at the last seat standing', () => {
    let s = rig([
      ['K', 'Q'],
      ['K', 'Q'],
    ]);
    s.players[0].revolver = { live: 2, spent: 2 };
    s = pullTrigger(callLiar(playCards(s, 0, [1]), 1));
    expect(s.showdown?.fired).toBe(true);
    expect(s.players[0].alive).toBe(false);
    expect(s.players[0].hand).toHaveLength(0);
    expect(s.out).toEqual([0]);
    expect(s.phase).toBe('over');
    expect(s.winner).toBe(1);
  });

  it('keeps three seats playing when one of them goes out', () => {
    let s = rig([
      ['K', 'Q'],
      ['K', 'Q'],
      ['K', 'Q'],
    ]);
    s.players[1].revolver = { live: 0, spent: 0 };
    s = pullTrigger(callLiar(playCards(s, 0, [0]), 1)); // a real King: the caller pulls
    expect(s.showdown?.shooter).toBe(1);
    expect(s.players[1].alive).toBe(false);
    expect(s.phase).toBe('shot');
    expect(s.winner).toBeNull();
    expect(aliveSeats(s)).toEqual([0, 2]);
  });

  it('refuses a pull when nobody has been called', () => {
    expect(() => pullTrigger(rig([['K'], ['Q']]))).toThrow();
  });

  it('is fixed for the match, so six pulls always kill', () => {
    for (let seed = 0; seed < 30; seed++) {
      const s = startMatch(4, makeRng(seed));
      s.players.forEach((p) => {
        let spent = 0;
        while (!willFire({ ...p.revolver, spent })) spent++;
        expect(spent).toBeLessThan(CHAMBERS);
      });
    }
  });
});

// ── the round restarts ────────────────────────────────────────────

describe('the round restarts', () => {
  it('deals again after a shot, with the survivor opening', () => {
    let s = rig([
      ['K', 'Q'],
      ['K', 'Q'],
      ['K', 'Q'],
    ]);
    s = pullTrigger(callLiar(playCards(s, 0, [1]), 1));
    expect(s.phase).toBe('shot');
    const n = nextRound(s, makeRng(9));
    expect(n.round).toBe(2);
    expect(n.phase).toBe('play');
    expect(n.turn).toBe(0); // seat 0 pulled and survived, so seat 0 opens
    expect(n.claim).toBeNull();
    expect(n.showdown).toBeNull();
    n.players.forEach((p) => {
      expect(p.hand).toHaveLength(HAND);
      expect(p.played).toHaveLength(0);
    });
  });

  it('deals again when every hand empties with nobody calling', () => {
    let s = rig([['K'], ['Q', 'Q']]);
    s = accept(playCards(s, 0, [0]), 1);
    expect(s.turn).toBe(1);
    s = playCards(s, 1, [0, 1]);
    expect(s.phase).toBe('exhausted');
    const n = nextRound(s, makeRng(2));
    expect(n.round).toBe(2);
    expect(n.phase).toBe('play');
    n.players.forEach((p) => expect(p.hand).toHaveLength(HAND));
  });

  it('opens the next round on the seat after one that was shot out', () => {
    let s = rig([
      ['K', 'Q'],
      ['K', 'Q'],
      ['K', 'Q'],
    ]);
    s.players[1].revolver = { live: 0, spent: 0 };
    s = pullTrigger(callLiar(playCards(s, 0, [0]), 1));
    const n = nextRound(s, makeRng(4));
    expect(n.turn).toBe(2);
    expect(n.players[1].hand).toHaveLength(0);
  });

  it('does nothing when asked to deal in the middle of a round', () => {
    const s = rig([['K'], ['Q']]);
    expect(nextRound(s, makeRng(1))).toBe(s);
  });
});

// ── reading a claim ───────────────────────────────────────────────

describe('reading a claim', () => {
  it('counts the table cards that were dealt, jokers included', () => {
    expect(truthDealt(rig([[], [], [], []], 'K', { dealt: 20 }))).toBe(8);
    expect(truthDealt(rig([[], [], []], 'K', { dealt: 15 }))).toBe(6);
  });

  it('prices a hypergeometric draw', () => {
    expect(hyperAtLeast(8, 15, 5, 0)).toBe(1);
    expect(hyperAtLeast(0, 15, 5, 1)).toBe(0);
    // All four of the remaining Kings in one five-card hand: C(4,4)·C(11,1)/C(15,5).
    expect(hyperAtLeast(4, 15, 5, 4)).toBeCloseTo(11 / 3003, 8);
    expect(hyperAtLeast(4, 15, 5, 5)).toBe(0);
    expect(hyperAtLeast(8, 15, 5, 1)).toBeGreaterThan(hyperAtLeast(8, 15, 5, 3));
  });

  it('reads a plausible claim at about the bluffing rate and an impossible one at certainty', () => {
    const easy = lieOdds({ pool: 15, unknownTruth: 8, claimerCards: 5, count: 1 });
    expect(easy).toBeGreaterThan(BLUFF_PRIOR - 0.02);
    expect(easy).toBeLessThan(BLUFF_PRIOR + 0.05);
    expect(lieOdds({ pool: 15, unknownTruth: 0, claimerCards: 5, count: 1 })).toBe(1);
  });

  it('gets more suspicious the more cards are claimed', () => {
    const at = (n: number) => lieOdds({ pool: 15, unknownTruth: 8, claimerCards: 5, count: n });
    expect(at(1)).toBeLessThan(at(2));
    expect(at(2)).toBeLessThan(at(3));
  });

  it('smells a lie when the judge is sitting on the table cards themselves', () => {
    // You hold four Kings; a claim of three Kings has almost nowhere to come from.
    const s = rig(
      [
        ['K', 'K', 'K', 'K', 'Q'],
        ['Q', 'Q', 'A', 'A', 'A'],
        ['A', 'A', 'A', 'Q', 'Q'],
        ['Q', 'J', 'J', 'K', 'K'],
      ],
      'K',
    );
    const claimed = playCards({ ...s, turn: 1 }, 1, [0, 1, 2]);
    expect(seenTruth(claimed, 0)).toBe(4);
    expect(judgeOdds(claimed, 0)).toBeGreaterThan(0.85);
    // A seat holding none of them has no reason to doubt it nearly as much.
    expect(judgeOdds(claimed, 2)).toBeLessThan(judgeOdds(claimed, 0));
  });

  it('lets a claimer see how exposed its own lie is', () => {
    const s = rig(
      [
        ['Q', 'Q', 'Q', 'A', 'A'],
        ['K', 'K', 'K', 'K', 'Q'],
        ['A', 'A', 'A', 'Q', 'Q'],
        ['Q', 'J', 'J', 'K', 'K'],
      ],
      'K',
    );
    expect(bluffOdds(s, 0, 1)).toBeLessThan(bluffOdds(s, 0, 3));
    expect(bluffOdds(s, 0, 3)).toBeLessThanOrEqual(1);
  });
});

// ── a full match ──────────────────────────────────────────────────

describe('a full match', () => {
  it('reaches a last seat standing, with everybody else shot out', () => {
    for (let seed = 0; seed < 40; seed++) {
      const s = autoMatch(4, BOT.Normal, makeRng(seed));
      expect(s.phase).toBe('over');
      expect(s.winner).not.toBeNull();
      expect(aliveSeats(s)).toEqual([s.winner]);
      expect(s.out).toHaveLength(s.seats - 1);
      expect(new Set(s.out).size).toBe(s.out.length);
      expect(s.out).not.toContain(s.winner);
      s.out.forEach((i) => {
        expect(s.players[i].alive).toBe(false);
        expect(s.players[i].revolver.spent).toBeLessThanOrEqual(CHAMBERS);
      });
    }
  });

  it('finishes with every table size the lobby can seat', () => {
    for (let seats = 2; seats <= 6; seats++) {
      const s = autoMatch(seats, BOT.Normal, makeRng(seats * 97 + 1));
      expect(s.phase).toBe('over');
      expect(aliveSeats(s)).toHaveLength(1);
    }
  });

  it('only ever kills somebody on their own live chamber', () => {
    for (let seed = 0; seed < 25; seed++) {
      const s = autoMatch(4, BOT.Sharp, makeRng(seed * 7 + 3));
      s.out.forEach((i) => expect(s.players[i].revolver.spent).toBe(s.players[i].revolver.live + 1));
      const win = s.players[s.winner as number];
      expect(win.revolver.spent).toBeLessThanOrEqual(win.revolver.live);
    }
  });

  it('ranks the table by who went out when, and pays the survivor most', () => {
    const s = autoMatch(4, BOT.Normal, makeRng(1234));
    const win = s.winner as number;
    expect(placeOf(s, win)).toBe(1);
    expect(placeOf(s, s.out[0])).toBe(4); // first out, last place
    expect(placeOf(s, s.out[2])).toBe(2);
    const xp = [0, 1, 2, 3].map((i) => xpFor(s, i));
    expect(Math.max(...xp)).toBe(xp[win]);
    expect(xpFor(s, s.out[2])).toBeGreaterThan(xpFor(s, s.out[0]));
    // Clicks survived are every pull but the fatal one.
    expect(clicksOf(s, s.out[0])).toBe(s.players[s.out[0]].revolver.spent - 1);
    expect(clicksOf(s, win)).toBe(s.players[win].revolver.spent);
  });

  it('pays exactly what the scoring rule says', () => {
    const s = rig([['K'], ['K'], ['K']], 'K', {
      winner: 1,
      out: [2, 0],
      players: [
        { hand: [], played: [], revolver: { live: 2, spent: 3 }, alive: false },
        { hand: [], played: [], revolver: { live: 4, spent: 2 }, alive: true },
        { hand: [], played: [], revolver: { live: 0, spent: 1 }, alive: false },
      ],
    });
    expect(xpFor(s, 1)).toBe(40 + 60 * 2 + 55 * 2 + 240); // won, two clicks survived
    expect(xpFor(s, 0)).toBe(40 + 60 * 2 + 55 * 1); // second out, two clicks
    expect(xpFor(s, 2)).toBe(40 + 0 + 0); // first out, on the first pull
  });
});

// ── the bots ──────────────────────────────────────────────────────

describe('bots', () => {
  it('plays a legal claim and a legal decision from every position, at every difficulty', () => {
    for (const d of DIFFS) {
      for (let seed = 0; seed < 12; seed++) {
        const s = autoMatch(4, BOT[d], makeRng(seed * 13 + 5), true);
        expect(s.phase).toBe('over');
      }
    }
  });

  it('plays legally from a hand of pure junk, a hand of pure table cards and a single card', () => {
    const hands: Rank[][] = [
      ['Q', 'Q', 'A', 'A', 'A'],
      ['K', 'K', 'K', 'J', 'J'],
      ['Q'],
      ['J'],
      ['K', 'Q'],
    ];
    for (const d of DIFFS) {
      const rng = makeRng(42);
      for (const h of hands) {
        const s = rig([h, ['Q', 'A', 'K', 'A', 'Q'], ['A', 'A', 'Q', 'Q', 'K']], 'K');
        for (let n = 0; n < 30; n++) {
          const idx = botPlay(s, 0, BOT[d], rng);
          expect(playProblem(s, 0, idx)).toBeNull();
          expect(idx.length).toBeLessThanOrEqual(Math.min(MAX_PLAY, h.length));
        }
      }
    }
  });

  it('never claims from an empty hand', () => {
    const s = rig([[], ['K', 'Q']], 'K');
    for (const d of DIFFS) expect(botPlay(s, 0, BOT[d], makeRng(1))).toEqual([]);
  });

  it('answers only when it is the one being asked', () => {
    const s = playCards(rig([['K', 'Q'], ['K', 'Q'], ['K', 'Q']]), 0, [0]);
    expect(s.decider).toBe(1);
    for (const d of DIFFS) {
      expect(botChallenge(s, 2, BOT[d], makeRng(3))).toBe(false);
      expect(botChallenge(s, 0, BOT[d], makeRng(3))).toBe(false);
      expect(typeof botChallenge(s, 1, BOT[d], makeRng(3))).toBe('boolean');
    }
  });

  it('tells the truth far more often when it is sharp than when it is careless', () => {
    const honest = (d: (typeof DIFFS)[number]) => {
      let good = 0;
      for (let seed = 0; seed < 300; seed++) {
        const rng = makeRng(seed * 17 + 1);
        const s = startMatch(4, rng);
        const idx = botPlay(s, 0, BOT[d], rng);
        if (idx.every((i) => isTruth(s.players[0].hand[i], s.rank))) good++;
      }
      return good;
    };
    const sharp = honest('Sharp');
    const easy = honest('Easy');
    expect(sharp).toBeGreaterThan(easy + 40);
    // It still has to shift its junk, so it is never simply honest all match.
    expect(sharp).toBeLessThan(300);
  });

  it('always calls a claim its own hand makes impossible', () => {
    // Seat 0 holds four Kings and a joker: all five table cards are accounted
    // for, so seat 1 claiming three of them cannot be telling the truth.
    const s = playCards(
      {
        ...rig(
          [
            ['K', 'K', 'K', 'K', 'J'],
            ['Q', 'Q', 'A', 'A', 'A'],
            ['A', 'A', 'Q', 'Q', 'J'],
            ['Q', 'A', 'Q', 'A', 'K'],
          ],
          'K',
        ),
        turn: 1,
      },
      1,
      [0, 1, 2],
    );
    expect(s.decider).toBe(2);
    const seen: LiarState = { ...s, decider: 0 };
    for (const d of DIFFS) {
      let calls = 0;
      for (let seed = 0; seed < 50; seed++) if (botChallenge(seen, 0, BOT[d], makeRng(seed))) calls++;
      expect(calls).toBeGreaterThan(50 * (1 - BOT[d].blunder) - 4);
    }
  });

  it('lets a claim it has no reason to doubt stand, most of the time', () => {
    const s = playCards(
      {
        ...rig(
          [
            ['Q', 'Q', 'A', 'A', 'A'],
            ['K', 'K', 'A', 'Q', 'Q'],
            ['A', 'A', 'Q', 'Q', 'J'],
            ['Q', 'A', 'K', 'K', 'J'],
          ],
          'K',
        ),
        turn: 1,
      },
      1,
      [0],
    );
    const seen: LiarState = { ...s, decider: 0 };
    let calls = 0;
    for (let seed = 0; seed < 200; seed++) if (botChallenge(seen, 0, BOT.Sharp, makeRng(seed))) calls++;
    expect(calls).toBeLessThan(40);
  });

  it('catches a bluffer more often when it is sharp than when it is careless', () => {
    const caught = (d: (typeof DIFFS)[number]) => {
      let hits = 0;
      for (let seed = 0; seed < 400; seed++) {
        const rng = makeRng(seed * 29 + 11);
        let s = startMatch(4, rng);
        // Seat 0 always shoves its worst three cards forward as a lie.
        const junk = s.players[0].hand
          .map((c, i) => ({ c, i }))
          .filter((x) => !isTruth(x.c, s.rank))
          .map((x) => x.i);
        if (junk.length < 3) continue;
        s = playCards(s, 0, junk.slice(0, 3));
        if (botChallenge(s, s.decider as number, BOT[d], rng)) hits++;
      }
      return hits;
    };
    const sharp = caught('Sharp');
    const easy = caught('Easy');
    expect(sharp).toBeGreaterThan(easy);
    expect(sharp).toBeGreaterThan(40);
  });

  it('wins the bar off a careless bot far more often than it loses it, head to head', () => {
    const rate = (a: BotProfile, b: BotProfile) => {
      let wins = 0;
      for (let seed = 0; seed < 300; seed++) if (duel([a, b], makeRng(seed * 11 + 3)).winner === 0) wins++;
      return wins / 300;
    };
    expect(rate(BOT.Sharp, BOT.Easy)).toBeGreaterThan(0.6);
    // The same match from the other chair, so it is the profile winning and not the seat.
    expect(rate(BOT.Easy, BOT.Sharp)).toBeLessThan(0.4);
  });

  it('takes far more than its share of a table of mixed difficulties', () => {
    const wins = [0, 0, 0, 0];
    for (let seed = 0; seed < 300; seed++) {
      wins[duel([BOT.Easy, BOT.Normal, BOT.Sharp, BOT.Easy], makeRng(seed * 7 + 5)).winner as number]++;
    }
    expect(wins[2]).toBeGreaterThan(300 * 0.4); // the sharp seat, against a 25% share
    expect(wins[1]).toBeGreaterThan(wins[0]);
    // and it is still beatable — the careless seats take the bar sometimes
    expect(wins[0] + wins[3]).toBeGreaterThan(20);
  });

  it('grows shy of calling as its own cylinder runs down', () => {
    const base = playCards(
      {
        ...rig(
          [
            ['K', 'K', 'K', 'Q', 'Q'],
            ['Q', 'Q', 'A', 'A', 'A'],
            ['A', 'A', 'Q', 'Q', 'J'],
            ['Q', 'A', 'K', 'J', 'K'],
          ],
          'K',
        ),
        turn: 1,
      },
      1,
      [0, 1],
    );
    const at = (spent: number) => {
      const players = base.players.slice();
      players[0] = { ...players[0], revolver: { live: 5, spent } };
      const s: LiarState = { ...base, players, decider: 0 };
      let calls = 0;
      for (let seed = 0; seed < 200; seed++) if (botChallenge(s, 0, BOT.Sharp, makeRng(seed))) calls++;
      return calls;
    };
    expect(at(0)).toBeGreaterThan(at(4));
  });
});

// ── determinism ───────────────────────────────────────────────────

describe('reproducibility', () => {
  const sig = (s: LiarState) => ({
    winner: s.winner,
    out: s.out,
    round: s.round,
    rank: s.rank,
    revolvers: s.players.map((p) => ({ ...p.revolver })),
    log: s.log,
  });

  it('replays a whole match identically from the same seed', () => {
    const run = () => sig(autoMatch(4, BOT.Normal, makeRng(20260902)));
    expect(run()).toEqual(run());
  });

  it('replays the deal identically and differently from a different seed', () => {
    const hands = (seed: number) =>
      JSON.stringify(startMatch(4, makeRng(seed)).players.map((p) => p.hand.map((c) => c.r)));
    expect(hands(7)).toBe(hands(7));
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map(hands)).size).toBeGreaterThan(6);
  });

  it('gives different matches from different seeds', () => {
    const winners = new Set<number | null>();
    const lengths = new Set<number>();
    for (let seed = 0; seed < 30; seed++) {
      const s = autoMatch(4, BOT.Normal, makeRng(seed * 5 + 2));
      winners.add(s.winner);
      lengths.add(s.round);
    }
    expect(winners.size).toBeGreaterThan(1);
    expect(lengths.size).toBeGreaterThan(1);
  });

  it('lets any seat win, so the bots are beatable as well as beating', () => {
    const wins = [0, 0, 0, 0];
    for (let seed = 0; seed < 120; seed++) wins[autoMatch(4, BOT.Sharp, makeRng(seed * 3 + 1)).winner as number]++;
    wins.forEach((w) => expect(w).toBeGreaterThan(0));
  });
});
