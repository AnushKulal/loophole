import { describe, expect, it } from 'vitest';
import { BOT, makeRng, type BotProfile, type Difficulty, type Rng } from './contract';
import {
  CLUE_FIELDS,
  DIRECTIONS,
  FIELDS,
  MAX_COUNT,
  MIN_COUNT,
  PAINT_NAMES,
  ROUNDS,
  attrs,
  blankStats,
  botClues,
  botFields,
  botVote,
  civilianFields,
  clueFrom,
  clueOptions,
  describeWith,
  imposterFields,
  isImposter,
  legalDescription,
  legalRef,
  legalVote,
  makeScene,
  mutate,
  mutationText,
  newRound,
  otherValue,
  phrase,
  pieces,
  resolveRound,
  sceneFor,
  standings,
  suspicion,
  valueOf,
  winnerOf,
  withValue,
  type AttrRef,
  type Clue,
  type Field,
  type SeatStat,
} from './imposterVideo';

// ── a whole match, every seat played by a bot ──────────────────────

interface Sim {
  stats: SeatStat[];
  winner: number;
  /** One line per round — who was odd, who went out, was it a catch. */
  log: string[];
  catches: number;
  imposterRounds: number;
  /** Rounds where an imposter's own words were contradicted by the table. */
  exposed: number;
}

/** Plays a full match. `imp` lets a test scale the imposter apart from the table. */
function simulate(seed: number, table: BotProfile, imp = table, seats = 5, odd = 1): Sim {
  const rng: Rng = makeRng(seed);
  const stats = blankStats(seats);
  const log: string[] = [];
  let catches = 0;
  let exposed = 0;
  let imposterRounds = 0;
  let last: number[] = [];

  for (let r = 0; r < ROUNDS; r++) {
    const setup = newRound(seats, odd, rng, last);
    last = setup.imposters;

    const clues: Clue[] = [];
    for (let s = 0; s < seats; s++) {
      const said = botClues(s, setup, isImposter(setup, s) ? imp : table, rng);
      expect(said.length).toBe(CLUE_FIELDS);
      for (const c of said) {
        expect(c.seat).toBe(s);
        expect(c.ref.actor).toBe(setup.focus);
        expect(legalRef(sceneFor(setup, s), c.ref)).toBe(true);
      }
      clues.push(...said);
    }

    for (const i of setup.imposters) {
      imposterRounds++;
      const mine = clues.filter((c) => c.seat === i);
      const clash = mine.some((m) => clues.some((c) => c.seat !== i && c.ref.field === m.ref.field && c.value !== m.value));
      if (clash) exposed++;
    }

    const votes: number[] = [];
    for (let s = 0; s < seats; s++) {
      const v = botVote(s, clues, setup, seats, isImposter(setup, s) ? imp : table, rng);
      expect(legalVote(s, v, seats)).toBe(true);
      if (isImposter(setup, s)) expect(setup.imposters).not.toContain(v);
      votes.push(v);
    }

    const out = resolveRound(votes, setup.imposters, seats);
    if (out.caught) catches++;
    out.gains.forEach((g, s) => (stats[s].score += g));
    out.correct.forEach((ok, s) => {
      if (ok) stats[s].correct++;
    });
    setup.imposters.forEach((i) => {
      stats[i].imposter++;
      if (!out.caught) stats[i].survived++;
    });
    log.push(`r${r} focus=${setup.focus} imp=${setup.imposters.join(',')} out=${out.ejected} caught=${out.caught}`);
  }

  return { stats, winner: winnerOf(stats), log, catches, imposterRounds, exposed };
}

// ── scene generation ──────────────────────────────────────────────

describe('makeScene', () => {
  it('builds a legal spec: 2–4 distinct shapes, distinct tints, an unused backdrop', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const s = makeScene(makeRng(seed));
      expect(s.actors.length).toBeGreaterThanOrEqual(2);
      expect(s.actors.length).toBeLessThanOrEqual(4);

      const kinds = new Set(s.actors.map((a) => a.kind));
      const tints = new Set(s.actors.map((a) => a.colour));
      const lanes = s.actors.map((a) => a.lane);
      expect(kinds.size).toBe(s.actors.length);
      expect(tints.size).toBe(s.actors.length);
      expect(new Set(lanes).size).toBe(s.actors.length);
      expect(lanes.slice().sort((a, b) => a - b)).toEqual(lanes);
      expect(tints.has(s.bg)).toBe(false);

      for (const a of s.actors) {
        expect(a.count).toBeGreaterThanOrEqual(MIN_COUNT);
        expect(a.count).toBeLessThanOrEqual(4);
        expect(DIRECTIONS).toContain(a.dir);
        expect(PAINT_NAMES).toContain(a.colour);
        expect(a.lane).toBeGreaterThanOrEqual(0);
        expect(a.lane).toBeLessThanOrEqual(3);
      }
    }
  });

  it('is reproducible from a seed and varies between seeds', () => {
    expect(makeScene(makeRng(77))).toEqual(makeScene(makeRng(77)));
    const many = new Set(Array.from({ length: 40 }, (_, i) => JSON.stringify(makeScene(makeRng(i + 1)))));
    expect(many.size).toBeGreaterThan(20);
  });
});

// ── the mutation ──────────────────────────────────────────────────

describe('mutate', () => {
  it('changes exactly one attribute and reports which', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const truth = makeScene(makeRng(seed));
      const { scene: cut, diff } = mutate(truth, makeRng(seed * 31 + 7));

      expect(FIELDS).toContain(diff.field);
      expect(diff.actor).toBeGreaterThanOrEqual(0);
      expect(diff.actor).toBeLessThan(truth.actors.length);
      expect(diff.from).not.toBe(diff.to);
      expect(valueOf(truth, diff)).toBe(diff.from);
      expect(valueOf(cut, diff)).toBe(diff.to);

      expect(cut.bg).toBe(truth.bg);
      expect(cut.actors.length).toBe(truth.actors.length);
      const changed = attrs(truth).filter((r) => valueOf(truth, r) !== valueOf(cut, r));
      expect(changed).toEqual([{ actor: diff.actor, field: diff.field }]);
      cut.actors.forEach((a, i) => {
        expect(a.kind).toBe(truth.actors[i].kind);
        expect(a.lane).toBe(truth.actors[i].lane);
        expect(a.speed).toBe(truth.actors[i].speed);
      });
    }
  });

  it('lands on the actor it is told to', () => {
    const truth = makeScene(makeRng(88));
    for (let i = 0; i < truth.actors.length; i++) {
      for (let seed = 1; seed <= 30; seed++) {
        expect(mutate(truth, makeRng(seed), i).diff.actor).toBe(i);
      }
    }
  });

  it('leaves the original scene alone', () => {
    const truth = makeScene(makeRng(9));
    const before = JSON.stringify(truth);
    mutate(truth, makeRng(4));
    expect(JSON.stringify(truth)).toBe(before);
  });

  it('keeps mutated counts inside 1–5 and mutated tints unclaimed', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const truth = makeScene(makeRng(seed));
      const { scene: cut, diff } = mutate(truth, makeRng(seed * 13 + 5));
      if (diff.field === 'count') {
        const n = cut.actors[diff.actor].count;
        expect(n).toBeGreaterThanOrEqual(MIN_COUNT);
        expect(n).toBeLessThanOrEqual(MAX_COUNT);
        expect(Math.abs(n - truth.actors[diff.actor].count)).toBe(1);
      }
      if (diff.field === 'colour') {
        const tints = cut.actors.map((a) => a.colour);
        expect(new Set(tints).size).toBe(tints.length);
        expect(tints).not.toContain(cut.bg);
      }
      if (diff.field === 'dir') expect(DIRECTIONS).toContain(cut.actors[diff.actor].dir);
    }
  });

  it('otherValue always offers a different, legal value', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const scene = makeScene(makeRng(seed));
      for (const ref of attrs(scene)) {
        const v = otherValue(scene, ref, makeRng(seed * 3 + ref.actor));
        expect(v).not.toBe(valueOf(scene, ref));
        expect(valueOf(withValue(scene, ref, v), ref)).toBe(v);
      }
    }
  });

  it('describes the change in words', () => {
    const truth = makeScene(makeRng(21));
    const { diff } = mutate(truth, makeRng(3));
    expect(mutationText(truth, diff)).toMatch(/\S/);
    expect(mutationText(truth, diff)).toContain(truth.actors[diff.actor].kind);
  });
});

// ── legality ──────────────────────────────────────────────────────

describe('legal moves', () => {
  const scene = makeScene(makeRng(5));

  it('accepts every attribute of the clip as a statement', () => {
    for (const ref of attrs(scene)) {
      expect(legalRef(scene, ref)).toBe(true);
      const c = clueFrom(0, scene, ref);
      expect(c.value).toBe(valueOf(scene, ref));
      expect(c.text).toBe(phrase(scene, ref));
    }
  });

  it('offers exactly the focus actor’s three attributes as chips', () => {
    for (let focus = 0; focus < scene.actors.length; focus++) {
      const opts = clueOptions(scene, focus);
      expect(opts.length).toBe(3);
      expect(opts.every((o) => o.actor === focus)).toBe(true);
      expect(new Set(opts.map((o) => o.field)).size).toBe(3);
    }
  });

  it('rejects a statement about an actor that is not in the clip', () => {
    const bad: AttrRef[] = [
      { actor: -1, field: 'colour' },
      { actor: scene.actors.length, field: 'count' },
      { actor: 1.5, field: 'dir' },
      { actor: 0, field: 'speed' as never },
    ];
    for (const ref of bad) {
      expect(legalRef(scene, ref)).toBe(false);
      expect(() => clueFrom(0, scene, ref)).toThrow();
    }
  });

  it('accepts a description of two different attributes and nothing else', () => {
    expect(legalDescription(['colour', 'count'])).toBe(true);
    expect(legalDescription(['dir', 'colour'])).toBe(true);
    expect(legalDescription(['colour'])).toBe(false);
    expect(legalDescription(['colour', 'count', 'dir'])).toBe(false);
    expect(legalDescription(['colour', 'colour'])).toBe(false);
    expect(legalDescription([])).toBe(false);
    expect(legalDescription(['colour', 'speed' as Field])).toBe(false);

    expect(describeWith(0, scene, 0, ['colour', 'dir']).length).toBe(2);
    expect(() => describeWith(0, scene, 0, ['colour'])).toThrow(/different attributes/);
    expect(() => describeWith(0, scene, 0, ['count', 'count'])).toThrow(/different attributes/);
  });

  it('accepts a vote for anyone but yourself', () => {
    expect(legalVote(0, 1, 5)).toBe(true);
    expect(legalVote(4, 0, 5)).toBe(true);
    expect(legalVote(2, 2, 5)).toBe(false);
    expect(legalVote(0, 5, 5)).toBe(false);
    expect(legalVote(0, -1, 5)).toBe(false);
    expect(legalVote(0, 1.5, 5)).toBe(false);
  });

  it('refuses to resolve a round containing an illegal vote', () => {
    expect(() => resolveRound([1, 0, 1, 1, 1], [1], 5)).not.toThrow();
    expect(() => resolveRound([0, 0, 1, 1, 1], [1], 5)).toThrow(/illegal vote/);
    expect(() => resolveRound([1, 0, 9, 1, 1], [1], 5)).toThrow(/illegal vote/);
    expect(() => resolveRound([1, 0, 1], [1], 5)).toThrow(/expected 5 votes/);
  });
});

// ── reading the table ─────────────────────────────────────────────

describe('suspicion', () => {
  const scene = makeScene(makeRng(12));
  const say = (seat: number, fields: Field[]) => describeWith(seat, scene, 0, fields);

  it('is flat when the whole table agrees', () => {
    const clues = [0, 1, 2, 3, 4].flatMap((s) => say(s, ['colour', 'count']));
    const sus = suspicion(clues, 5);
    expect(sus).toEqual([0, 0, 0, 0, 0]);
  });

  it('puts the seat that contradicts the table at the top', () => {
    const clues = [0, 1, 2, 3].flatMap((s) => say(s, ['colour', 'count']));
    const odd = say(4, ['colour', 'count']);
    odd[0] = { ...odd[0], value: 'nonsense', text: 'nonsense' };
    clues.push(...odd);
    const sus = suspicion(clues, 5);
    expect(sus[4]).toBeGreaterThan(Math.max(sus[0], sus[1], sus[2], sus[3]));
    expect(sus[4]).toBeCloseTo(0.5, 6);
  });

  it('half-blames a seat for a statement nobody else corroborates', () => {
    const clues = [0, 1, 2, 3].flatMap((s) => say(s, ['colour', 'count']));
    clues.push(...say(4, ['colour', 'dir']));
    const sus = suspicion(clues, 5);
    expect(sus[0]).toBe(0);
    expect(sus[4]).toBeCloseTo(0.25, 6);
  });

  it('names the imposter more often than chance on real rounds', () => {
    let hit = 0;
    let rounds = 0;
    for (let seed = 1; seed <= 600; seed++) {
      const rng = makeRng(seed * 3 + 1);
      const setup = newRound(5, 1, rng);
      const clues = Array.from({ length: 5 }, (_, s) => botClues(s, setup, BOT.Normal, rng)).flat();
      const sus = suspicion(clues, 5);
      const top = Math.max(...sus);
      const leaders = sus.map((v, i) => ({ v, i })).filter((x) => x.v >= top - 1e-9);
      // credit the read only when it points at one seat
      if (leaders.length === 1) {
        rounds++;
        if (leaders[0].i === setup.imposters[0]) hit++;
      }
    }
    expect(rounds).toBeGreaterThan(200);
    // one seat in five, so a coin-flip read would land on 0.2
    expect(hit / rounds).toBeGreaterThan(0.45);
  });
});

// ── scoring ───────────────────────────────────────────────────────

describe('resolveRound', () => {
  it('ejects the seat with the most votes', () => {
    const out = resolveRound([3, 3, 3, 0, 3], [3], 5);
    expect(out.tally).toEqual([1, 0, 0, 4, 0]);
    expect(out.ejected).toBe(3);
    expect(out.caught).toBe(true);
  });

  it('pays the table for catching the imposter and the imposter nothing', () => {
    const out = resolveRound([3, 3, 3, 0, 3], [3], 5);
    expect(out.gains).toEqual([2, 2, 2, 0, 2]);
    expect(out.correct).toEqual([true, true, true, false, true]);
  });

  it('pays a surviving imposter and still rewards the seats who read it right', () => {
    // seats 0 and 1 name the imposter (3), but the table ejects 2
    const out = resolveRound([3, 3, 0, 2, 2], [3], 5);
    expect(out.ejected).toBe(2);
    expect(out.caught).toBe(false);
    expect(out.gains).toEqual([2, 2, 0, 3, 0]);
  });

  it('never pays an imposter for voting a fellow imposter', () => {
    const out = resolveRound([1, 0, 0, 0, 0], [0, 1], 5);
    expect(out.correct[1]).toBe(false);
    expect(out.gains[1]).toBe(0);
    expect(out.caught).toBe(true);
  });

  it('breaks a tied vote toward the lowest seat', () => {
    const out = resolveRound([1, 2, 1, 2, 1], [4], 5);
    expect(out.tally[1]).toBe(3);
    expect(out.ejected).toBe(1);
    const tied = resolveRound([2, 3, 3, 2], [0], 4);
    expect(tied.tally).toEqual([0, 0, 2, 2]);
    expect(tied.ejected).toBe(2);
    expect(tied.caught).toBe(false);
  });
});

// ── bots ──────────────────────────────────────────────────────────

describe('bots', () => {
  const levels: Difficulty[] = ['Easy', 'Normal', 'Sharp'];

  it('describes two legal attributes of the clip it saw, from every seat of every position', () => {
    for (const d of levels) {
      const p = BOT[d];
      for (let seed = 1; seed <= 120; seed++) {
        for (const seats of [4, 5, 6, 8]) {
          const rng = makeRng(seed * 101 + seats);
          const setup = newRound(seats, seed % 2 === 0 ? 2 : 1, rng);
          for (let s = 0; s < seats; s++) {
            const fields = botFields(s, setup, p, rng);
            expect(legalDescription(fields)).toBe(true);
            const said = botClues(s, setup, p, rng);
            expect(said.length).toBe(CLUE_FIELDS);
            for (const c of said) {
              expect(c.ref.actor).toBe(setup.focus);
              expect(legalRef(sceneFor(setup, s), c.ref)).toBe(true);
              expect(c.text).toMatch(/\S/);
            }
          }
        }
      }
    }
  });

  it('returns a legal vote from every seat, never itself, never a partner', () => {
    for (const d of levels) {
      const p = BOT[d];
      for (let seed = 1; seed <= 120; seed++) {
        for (const seats of [4, 5, 7]) {
          const rng = makeRng(seed * 37 + seats);
          const setup = newRound(seats, seed % 3 === 0 ? 2 : 1, rng);
          const clues = Array.from({ length: seats }, (_, s) => botClues(s, setup, p, rng)).flat();
          for (let s = 0; s < seats; s++) {
            const v = botVote(s, clues, setup, seats, p, rng);
            expect(legalVote(s, v, seats)).toBe(true);
            if (isImposter(setup, s)) expect(setup.imposters).not.toContain(v);
          }
        }
      }
    }
  });

  it('votes sensibly with no clues at all', () => {
    const rng = makeRng(1);
    const setup = newRound(5, 1, rng);
    for (const d of levels) {
      for (let s = 0; s < 5; s++) expect(legalVote(s, botVote(s, [], setup, 5, BOT[d], rng), 5)).toBe(true);
    }
  });

  it('an honest seat spreads its two statements evenly over the three attributes', () => {
    const seen: Record<string, number> = {};
    const rng = makeRng(99);
    for (let i = 0; i < 900; i++) seen[civilianFields(rng).join('+')] = (seen[civilianFields(rng).join('+')] ?? 0) + 1;
    expect(Object.keys(seen).length).toBe(3);
    for (const k of Object.keys(seen)) expect(seen[k]).toBeGreaterThan(150);
  });

  it('scales: a sharper imposter hedges off the changed attribute far more often', () => {
    const hedged = (d: Difficulty) => {
      const p = BOT[d];
      let safe = 0;
      for (let seed = 1; seed <= 800; seed++) {
        const rng = makeRng(seed * 7 + 1);
        const setup = newRound(5, 1, rng);
        const fields = imposterFields(setup.diff, p, rng);
        expect(legalDescription(fields)).toBe(true);
        if (!fields.includes(setup.diff.field)) safe++;
      }
      return safe;
    };
    const easy = hedged('Easy');
    const normal = hedged('Normal');
    const sharp = hedged('Sharp');
    expect(normal).toBeGreaterThan(easy);
    expect(sharp).toBeGreaterThan(normal);
    // even a Sharp imposter walks into it sometimes — it is not clairvoyant
    expect(sharp).toBeLessThan(800);
  });
});

// ── a whole match ─────────────────────────────────────────────────

describe('a full match', () => {
  it('reaches a terminal state with exactly one winner', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const sim = simulate(seed, BOT.Normal);
      expect(sim.log.length).toBe(ROUNDS);
      const table = standings(sim.stats);
      expect(table.length).toBe(5);
      expect(table[0].seat).toBe(sim.winner);
      expect(table.filter((r) => r.seat === sim.winner).length).toBe(1);
      for (let i = 1; i < table.length; i++) expect(table[i - 1].score).toBeGreaterThanOrEqual(table[i].score);
      expect(sim.stats.reduce((n, s) => n + s.imposter, 0)).toBe(ROUNDS);
      expect(sim.stats.reduce((n, s) => n + s.score, 0)).toBeGreaterThan(0);
    }
  });

  it('both sides can win — imposters get caught and imposters survive', () => {
    let caught = 0;
    let survived = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const sim = simulate(seed, BOT.Normal);
      caught += sim.catches;
      survived += sim.imposterRounds - sim.catches;
    }
    expect(caught).toBeGreaterThan(100);
    expect(survived).toBeGreaterThan(100);
  });

  it('every seat wins some matches — nobody is structurally doomed', () => {
    const wins = new Array(5).fill(0);
    for (let seed = 1; seed <= 400; seed++) wins[simulate(seed, BOT.Normal).winner]++;
    for (const w of wins) expect(w).toBeGreaterThan(30);
  });

  it('scales: a sharper table catches more imposters', () => {
    const rate = (d: Difficulty) => {
      let n = 0;
      for (let seed = 1; seed <= 400; seed++) n += simulate(seed, BOT[d], BOT.Normal).catches;
      return n;
    };
    const easy = rate('Easy');
    const normal = rate('Normal');
    const sharp = rate('Sharp');
    expect(normal).toBeGreaterThan(easy);
    expect(sharp).toBeGreaterThan(normal);
  });

  it('scales: a sharper imposter is caught less often', () => {
    const caught = (d: Difficulty) => {
      let n = 0;
      for (let seed = 1; seed <= 400; seed++) n += simulate(seed, BOT.Normal, BOT[d]).catches;
      return n;
    };
    const easy = caught('Easy');
    const sharp = caught('Sharp');
    expect(sharp).toBeLessThan(easy);
  });

  it('honours the lobby imposter count and keeps two seats honest', () => {
    for (const odd of [1, 2, 3]) {
      for (let seed = 1; seed <= 40; seed++) {
        const setup = newRound(5, odd, makeRng(seed));
        expect(setup.imposters.length).toBe(Math.min(odd, 3));
        expect(new Set(setup.imposters).size).toBe(setup.imposters.length);
        expect(5 - setup.imposters.length).toBeGreaterThanOrEqual(2);
      }
    }
    expect(newRound(4, 0, makeRng(1)).imposters.length).toBe(1);
    expect(newRound(8, 3, makeRng(1)).imposters.length).toBe(3);
  });

  it('always mutates the actor the round asks about', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const setup = newRound(5, 1, makeRng(seed));
      expect(setup.diff.actor).toBe(setup.focus);
      expect(setup.focus).toBeLessThan(setup.scene.actors.length);
      // honest seats and imposters differ on exactly one attribute of that actor
      const changed = attrs(setup.scene).filter((r) => valueOf(setup.scene, r) !== valueOf(setup.shown, r));
      expect(changed).toEqual([{ actor: setup.focus, field: setup.diff.field }]);
      for (let s = 0; s < 5; s++) {
        expect(sceneFor(setup, s)).toEqual(isImposter(setup, s) ? setup.shown : setup.scene);
      }
    }
  });

  it('deals a fresh imposter when it can', () => {
    const rng = makeRng(404);
    const a = newRound(5, 1, rng);
    const b = newRound(5, 1, rng, a.imposters);
    expect(b.imposters).not.toEqual(a.imposters);
  });

  it('is reproducible from a seed and differs between seeds', () => {
    const a = simulate(2024, BOT.Sharp);
    const b = simulate(2024, BOT.Sharp);
    expect(b.log).toEqual(a.log);
    expect(b.stats).toEqual(a.stats);
    expect(b.winner).toBe(a.winner);
    expect(simulate(2025, BOT.Sharp).log).not.toEqual(a.log);
  });
});

// ── the picture ───────────────────────────────────────────────────

describe('pieces', () => {
  it('lays every copy out inside the frame, deterministically', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const scene = makeScene(makeRng(seed));
      const ps = pieces(scene);
      expect(ps.length).toBe(scene.actors.reduce((n, a) => n + a.count, 0));
      expect(pieces(scene)).toEqual(ps);
      for (const p of ps) {
        expect(p.x - p.r).toBeGreaterThan(0);
        expect(p.x + p.r).toBeLessThan(100);
        expect(p.y - p.r).toBeGreaterThan(0);
        expect(p.y + p.r).toBeLessThan(100);
      }
      scene.actors.forEach((a, i) => expect(ps.filter((p) => p.actor === i).length).toBe(a.count));
    }
  });

  it('redraws a mutated count with the mutated number of shapes', () => {
    const truth = makeScene(makeRng(31));
    let cut = mutate(truth, makeRng(1));
    let guard = 1;
    while (cut.diff.field !== 'count' && guard < 200) cut = mutate(truth, makeRng(++guard));
    expect(cut.diff.field).toBe('count');
    const before = pieces(truth).filter((p) => p.actor === cut.diff.actor).length;
    const after = pieces(cut.scene).filter((p) => p.actor === cut.diff.actor).length;
    expect(after).toBe(Number(cut.diff.to));
    expect(after).not.toBe(before);
  });
});
