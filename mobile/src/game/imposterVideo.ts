/**
 * Imposter Video — the Imposter Word deduction loop, played over a clip.
 *
 * There is no video file: a round generates a *scene spec* from the RNG (a
 * backdrop wash plus two to four actors, each a shape with its own tint, count,
 * direction and speed) which the screen draws as animated SVG. Everyone watches
 * the same clip — except the imposters, whose cut has exactly ONE attribute of
 * one actor changed.
 *
 * After the clip the round names a **focus** actor, the one the mutation landed
 * on, and every seat describes two of its three attributes: colour, count,
 * motion. An imposter that mentions the changed attribute contradicts the table
 * outright; one that hedges onto the two it shares says nothing anybody can
 * disagree with. Then everyone votes — the table scores by catching an imposter,
 * the imposter scores by surviving.
 *
 * Pure data in, pure data out: no React, no DOM, no clock. Every random choice
 * comes from the `Rng` handed in, so a seeded match replays exactly.
 */

import { makeRng, pick, shuffle, type BotProfile, type Rng } from './contract';

// ── the scene spec ────────────────────────────────────────────────

export type ShapeKind = 'circle' | 'square' | 'triangle' | 'diamond' | 'star' | 'ring';

/** How an actor moves. `orbit` and `bounce` stay put; the rest travel across the frame. */
export type Direction = 'left' | 'right' | 'up' | 'down' | 'orbit' | 'bounce';

export type SpeedName = 'slow' | 'steady' | 'fast';

/** The three attributes a description — and a mutation — can be about. */
export type Field = 'colour' | 'count' | 'dir';

export const KINDS: ShapeKind[] = ['circle', 'square', 'triangle', 'diamond', 'star', 'ring'];
export const DIRECTIONS: Direction[] = ['left', 'right', 'up', 'down', 'orbit', 'bounce'];
export const SPEEDS: SpeedName[] = ['slow', 'steady', 'fast'];
export const FIELDS: Field[] = ['colour', 'count', 'dir'];

/** Fewest and most copies of one actor that can appear. */
export const MIN_COUNT = 1;
export const MAX_COUNT = 5;

/** How many of the focus actor's three attributes each seat describes. */
export const CLUE_FIELDS = 2;

/**
 * The most often an imposter bot manages to hedge onto an attribute it shares.
 * It caps below 1 because an imposter cannot really know which detail is off —
 * a perfect one would be uncatchable, which is not a game.
 */
export const HEDGE_CAP = 0.75;

/** How much of a bot's `blunder` becomes a misremembered clue. */
export const SLIP = 0.5;

/** A tint for a shape, from the palette the card and avatar gradients already use. */
export interface Paint {
  name: string;
  from: string;
  to: string;
}

/** The seven scene tints — the UNO card faces plus three of the avatar fills. */
export const PAINTS: Paint[] = [
  { name: 'coral', from: '#ec8a6a', to: '#b84a44' },
  { name: 'indigo', from: '#7d92f0', to: '#3f4fbe' },
  { name: 'teal', from: '#3fb99a', to: '#136a5c' },
  { name: 'amber', from: '#dfa25e', to: '#b06a2e' },
  { name: 'violet', from: '#a78cf0', to: '#5b3fb8' },
  { name: 'rose', from: '#dc7aa8', to: '#9c3c68' },
  { name: 'sky', from: '#57b7d8', to: '#1f6c9c' },
];

export const PAINT_NAMES = PAINTS.map((p) => p.name);

export function paintOf(name: string): Paint {
  return PAINTS.find((p) => p.name === name) ?? PAINTS[0];
}

/** Loop-speed multiplier — a `fast` actor crosses the frame 2.5× quicker than a `slow` one. */
export const SPEED: Record<SpeedName, number> = { slow: 0.62, steady: 1, fast: 1.55 };

/** True when the direction carries the actor across the frame rather than in place. */
export const travels = (d: Direction) => d === 'left' || d === 'right' || d === 'up' || d === 'down';

export interface Actor {
  kind: ShapeKind;
  /** A `Paint.name`. */
  colour: string;
  count: number;
  dir: Direction;
  speed: SpeedName;
  /** Which of the four horizontal bands the actor occupies, 0 = top. */
  lane: number;
}

export interface Scene {
  /** A `Paint.name` for the backdrop wash. Never an actor's tint, never described. */
  bg: string;
  actors: Actor[];
}

/** One describable attribute of one actor. */
export interface AttrRef {
  actor: number;
  field: Field;
}

/** The single attribute the imposters' cut changes. */
export interface Mutation extends AttrRef {
  from: string;
  to: string;
}

// ── generation ────────────────────────────────────────────────────

/** A fresh scene: two to four actors, each a distinct shape with its own tint. */
export function makeScene(rng: Rng = makeRng(1)): Scene {
  const n = 2 + Math.floor(rng() * 3); // 2–4
  const kinds = shuffle(KINDS, rng).slice(0, n);
  const tints = shuffle(PAINT_NAMES, rng);
  const lanes = shuffle([0, 1, 2, 3], rng)
    .slice(0, n)
    .sort((a, b) => a - b);

  const actors: Actor[] = kinds.map((kind, i) => ({
    kind,
    colour: tints[i],
    count: MIN_COUNT + Math.floor(rng() * 4), // 1–4; 5 only ever arrives by mutation
    dir: pick(DIRECTIONS, rng),
    speed: pick(SPEEDS, rng),
    lane: lanes[i],
  }));

  return { bg: tints[n], actors };
}

/** Every attribute of a scene, actor-major. */
export function attrs(scene: Scene): AttrRef[] {
  const out: AttrRef[] = [];
  scene.actors.forEach((_, actor) => FIELDS.forEach((field) => out.push({ actor, field })));
  return out;
}

export function legalRef(scene: Scene, ref: AttrRef): boolean {
  return (
    Number.isInteger(ref.actor) &&
    ref.actor >= 0 &&
    ref.actor < scene.actors.length &&
    FIELDS.indexOf(ref.field) >= 0
  );
}

/** The value of one attribute, as the string the table compares. */
export function valueOf(scene: Scene, ref: AttrRef): string {
  if (!legalRef(scene, ref)) throw new Error(`no such attribute: ${ref.actor}.${ref.field}`);
  const a = scene.actors[ref.actor];
  if (ref.field === 'colour') return a.colour;
  if (ref.field === 'count') return String(a.count);
  return a.dir;
}

/** A copy of the scene with one attribute set to `value`. */
export function withValue(scene: Scene, ref: AttrRef, value: string): Scene {
  if (!legalRef(scene, ref)) throw new Error(`no such attribute: ${ref.actor}.${ref.field}`);
  const next: Scene = { bg: scene.bg, actors: scene.actors.map((a) => ({ ...a })) };
  const a = next.actors[ref.actor];
  if (ref.field === 'colour') a.colour = value;
  else if (ref.field === 'count') a.count = Number(value);
  else a.dir = value as Direction;
  return next;
}

/**
 * A plausible different value for an attribute: an unclaimed tint, a count one
 * either side, or another direction. Used both for the imposter's cut and for a
 * bot misremembering what it watched.
 */
export function otherValue(scene: Scene, ref: AttrRef, rng: Rng): string {
  const a = scene.actors[ref.actor];
  if (ref.field === 'colour') {
    const used = new Set([scene.bg, ...scene.actors.map((x) => x.colour)]);
    const free = PAINT_NAMES.filter((n) => !used.has(n));
    return free.length ? pick(free, rng) : pick(PAINT_NAMES.filter((n) => n !== a.colour), rng);
  }
  if (ref.field === 'count') {
    const opts = [a.count - 1, a.count + 1].filter((n) => n >= MIN_COUNT && n <= MAX_COUNT);
    return String(pick(opts, rng));
  }
  return pick(
    DIRECTIONS.filter((d) => d !== a.dir),
    rng,
  );
}

/**
 * The imposters' cut: the same scene with exactly one colour, count or direction
 * changed on `actor` (a random actor when none is named), plus a record of the change.
 */
export function mutate(scene: Scene, rng: Rng = makeRng(2), actor?: number): { scene: Scene; diff: Mutation } {
  const i = actor ?? Math.floor(rng() * scene.actors.length);
  const ref: AttrRef = { actor: i, field: pick(FIELDS, rng) };
  const to = otherValue(scene, ref, rng);
  return { scene: withValue(scene, ref, to), diff: { ...ref, from: valueOf(scene, ref), to } };
}

// ── phrasing ──────────────────────────────────────────────────────

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five'];
export const word = (n: number) => WORDS[n] ?? String(n);

export const plural = (k: ShapeKind, n: number) => (n === 1 ? k : `${k}s`);

export const MOTION: Record<Direction, string> = {
  left: 'drift left',
  right: 'drift right',
  up: 'float up',
  down: 'fall down',
  orbit: 'circle the middle',
  bounce: 'bounce in place',
};

export const FIELD_LABEL: Record<Field, string> = { colour: 'COLOUR', count: 'HOW MANY', dir: 'MOTION' };

/** The clue text a seat says out loud when it describes `ref`. */
export function phrase(scene: Scene, ref: AttrRef): string {
  const a = scene.actors[ref.actor];
  if (ref.field === 'colour') return `${a.count === 1 ? 'a' : 'the'} ${a.colour} ${plural(a.kind, a.count)}`;
  if (ref.field === 'count') return `${word(a.count)} ${plural(a.kind, a.count)}`;
  return `the ${plural(a.kind, a.count)} ${MOTION[a.dir]}`;
}

/** The reveal line: what the imposters' cut actually changed. */
export function mutationText(scene: Scene, diff: Mutation): string {
  const a = scene.actors[diff.actor];
  const many = plural(a.kind, 2);
  if (diff.field === 'colour') return `their ${many} were ${diff.to}, not ${diff.from}`;
  if (diff.field === 'count') return `they counted ${word(Number(diff.to))} ${many}, not ${word(Number(diff.from))}`;
  return `their ${many} ${MOTION[diff.to as Direction]} instead of ${MOTION[diff.from as Direction]}`;
}

// ── what reads loudest ────────────────────────────────────────────

const FIELD_WEIGHT: Record<Field, number> = { count: 3, colour: 2.6, dir: 2.2 };

/** The scene's attributes ordered by how loudly they read on screen. */
export function salience(scene: Scene): AttrRef[] {
  const scored = attrs(scene).map((ref) => {
    const a = scene.actors[ref.actor];
    let w = FIELD_WEIGHT[ref.field];
    if (ref.field === 'count') w += Math.min(a.count, MAX_COUNT) * 0.12;
    if (ref.field === 'dir' && !travels(a.dir)) w += 0.5;
    w -= ref.actor * 0.18;
    return { ref, w };
  });
  scored.sort(
    (x, y) => y.w - x.w || x.ref.actor - y.ref.actor || FIELDS.indexOf(x.ref.field) - FIELDS.indexOf(y.ref.field),
  );
  return scored.map((s) => s.ref);
}

/** The three chips a seat chooses from, most obvious first. */
export function clueOptions(scene: Scene, focus: number): AttrRef[] {
  return salience(scene).filter((r) => r.actor === focus);
}

// ── clues ─────────────────────────────────────────────────────────

export interface Clue {
  seat: number;
  ref: AttrRef;
  /** The compared value — `teal`, `3`, `orbit`. */
  value: string;
  /** What the seat said. */
  text: string;
}

export function clueFrom(seat: number, seen: Scene, ref: AttrRef): Clue {
  if (!legalRef(seen, ref)) throw new Error(`illegal clue: ${ref.actor}.${ref.field}`);
  return { seat, ref, value: valueOf(seen, ref), text: phrase(seen, ref) };
}

/** A description is exactly `CLUE_FIELDS` distinct attributes of the focus actor. */
export function legalDescription(fields: Field[]): boolean {
  return (
    fields.length === CLUE_FIELDS &&
    new Set(fields).size === CLUE_FIELDS &&
    fields.every((f) => FIELDS.indexOf(f) >= 0)
  );
}

/** Turn a seat's chosen fields into the clues it puts on the table. */
export function describeWith(seat: number, seen: Scene, focus: number, fields: Field[]): Clue[] {
  if (!legalDescription(fields)) throw new Error(`a description is ${CLUE_FIELDS} different attributes`);
  return fields.map((field) => clueFrom(seat, seen, { actor: focus, field }));
}

/**
 * How odd each seat sounds on the evidence of the clues alone, 0–1.
 *
 * Each statement is scored by how much of the rest of the table backs it up.
 * Flatly contradicted scores 1, fully corroborated scores 0, and a statement
 * nobody else made scores 0.5 — unknown, not innocent, which is what makes a
 * hedging imposter's silence on the changed attribute cost it something.
 */
export function suspicion(clues: Clue[], seats: number): number[] {
  const total = new Array<number>(seats).fill(0);
  const said = new Array<number>(seats).fill(0);
  for (const c of clues) {
    if (c.seat < 0 || c.seat >= seats) continue;
    const others = clues.filter((o) => o.seat !== c.seat && o.ref.actor === c.ref.actor && o.ref.field === c.ref.field);
    const agree = others.length ? others.filter((o) => o.value === c.value).length / others.length : 0.5;
    total[c.seat] += 1 - agree;
    said[c.seat]++;
  }
  return total.map((v, i) => (said[i] ? v / said[i] : 0));
}

// ── the round ─────────────────────────────────────────────────────

export const ROUNDS = 3;
/** Points for naming an imposter. */
export const CATCH_POINTS = 2;
/** Points an imposter banks for surviving the vote. */
export const SURVIVE_POINTS = 3;

export interface RoundSetup {
  /** What the table saw. */
  scene: Scene;
  /** What the imposters saw. */
  shown: Scene;
  /** The actor everybody describes. The mutation is always on it. */
  focus: number;
  diff: Mutation;
  /** Seats holding the mutated cut, ascending. */
  imposters: number[];
}

/**
 * Deal a round. `odd` is the lobby's imposter count, clamped so at least two
 * seats stay honest. `avoid` keeps last round's imposters out of the hat when
 * there is room to.
 */
export function newRound(seats: number, odd: number, rng: Rng = makeRng(3), avoid: number[] = []): RoundSetup {
  const scene = makeScene(rng);
  const focus = Math.floor(rng() * scene.actors.length);
  const m = mutate(scene, rng, focus);
  const k = Math.max(1, Math.min(Math.floor(odd) || 1, seats - 2));
  const all = Array.from({ length: seats }, (_, i) => i);
  const fresh = all.filter((i) => !avoid.includes(i));
  const pool = fresh.length >= k ? fresh : all;
  const imposters = shuffle(pool, rng)
    .slice(0, k)
    .sort((a, b) => a - b);
  return { scene, shown: m.scene, focus, diff: m.diff, imposters };
}

/** The cut a seat watched. */
export const sceneFor = (setup: RoundSetup, seat: number): Scene =>
  setup.imposters.includes(seat) ? setup.shown : setup.scene;

export const isImposter = (setup: RoundSetup, seat: number) => setup.imposters.includes(seat);

// ── bots ──────────────────────────────────────────────────────────

/**
 * An honest seat has nothing to hide, so which two of the three attributes it
 * mentions is arbitrary — and spreading evenly is what gives the table coverage
 * of the changed one. Skill shows up in the vote, not here.
 */
export function civilianFields(rng: Rng): Field[] {
  const skip = Math.floor(rng() * FIELDS.length);
  return FIELDS.filter((_, i) => i !== skip);
}

/**
 * An imposter hedges: it skips the attribute its cut changed, so nothing it says
 * can be contradicted. It pulls that off `min(skill × (1 − blunder), HEDGE_CAP)`
 * of the time — otherwise it describes arbitrarily and may walk straight into it.
 */
export function imposterFields(diff: Mutation, p: BotProfile, rng: Rng): Field[] {
  const hedge = Math.min(p.skill * (1 - p.blunder), HEDGE_CAP);
  if (rng() < hedge) return FIELDS.filter((f) => f !== diff.field);
  return civilianFields(rng);
}

/** Which attributes a bot seat talks about this round. */
export function botFields(seat: number, setup: RoundSetup, p: BotProfile, rng: Rng): Field[] {
  return isImposter(setup, seat) ? imposterFields(setup.diff, p, rng) : civilianFields(rng);
}

/**
 * A bot's whole description. An honest seat misremembers one of its two
 * statements `blunder × SLIP` of the time, which is why a careless table throws
 * up false leads and a sharp one does not.
 */
export function botClues(seat: number, setup: RoundSetup, p: BotProfile, rng: Rng): Clue[] {
  const seen = sceneFor(setup, seat);
  const clues = describeWith(seat, seen, setup.focus, botFields(seat, setup, p, rng));
  if (!isImposter(setup, seat) && rng() < p.blunder * SLIP) {
    const i = Math.floor(rng() * clues.length);
    const ref = clues[i].ref;
    clues[i] = clueFrom(seat, withValue(seen, ref, otherValue(seen, ref, rng)), ref);
  }
  return clues;
}

export function legalVote(seat: number, target: number, seats: number): boolean {
  return Number.isInteger(target) && target >= 0 && target < seats && target !== seat;
}

/**
 * A bot's vote. Honest seats go for the loudest contradiction; imposters push the
 * same read but never at a fellow imposter, so the pack stays together. Below
 * `skill × (1 − blunder)` the vote scatters, and seats that read equally odd are
 * separated at random rather than by seat order.
 */
export function botVote(seat: number, clues: Clue[], setup: RoundSetup, seats: number, p: BotProfile, rng: Rng): number {
  const all: number[] = [];
  for (let i = 0; i < seats; i++) if (i !== seat) all.push(i);
  if (!all.length) throw new Error('nobody to vote for');

  const trimmed = isImposter(setup, seat) ? all.filter((i) => !isImposter(setup, i)) : all;
  const pool = trimmed.length ? trimmed : all;

  if (rng() >= p.skill * (1 - p.blunder)) return pick(pool, rng);

  const sus = suspicion(clues, seats);
  const top = Math.max(...pool.map((i) => sus[i]));
  return pick(
    pool.filter((i) => sus[i] >= top - 1e-9),
    rng,
  );
}

// ── resolution ────────────────────────────────────────────────────

export interface RoundOutcome {
  /** Votes received, per seat. */
  tally: number[];
  /** Seat voted out. A tie goes to the lowest seat among the tied. */
  ejected: number;
  /** True when the ejected seat held the mutated cut. */
  caught: boolean;
  /** Points scored this round, per seat. */
  gains: number[];
  /** Which seats read it right — an honest seat that named an imposter. */
  correct: boolean[];
}

/**
 * Count the vote and pay out. Honest seats bank `CATCH_POINTS` for naming an
 * imposter whether or not the table followed them; imposters bank
 * `SURVIVE_POINTS` each when none of them is ejected.
 */
export function resolveRound(votes: number[], imposters: number[], seats: number): RoundOutcome {
  if (votes.length !== seats) throw new Error(`expected ${seats} votes, got ${votes.length}`);
  votes.forEach((t, s) => {
    if (!legalVote(s, t, seats)) throw new Error(`seat ${s} cast an illegal vote: ${t}`);
  });

  const tally = new Array<number>(seats).fill(0);
  votes.forEach((t) => tally[t]++);

  let ejected = 0;
  for (let i = 1; i < seats; i++) if (tally[i] > tally[ejected]) ejected = i;
  const caught = imposters.includes(ejected);

  const gains = new Array<number>(seats).fill(0);
  const correct = votes.map((t, s) => imposters.includes(t) && !imposters.includes(s));
  correct.forEach((ok, s) => {
    if (ok) gains[s] += CATCH_POINTS;
  });
  if (!caught) imposters.forEach((i) => (gains[i] += SURVIVE_POINTS));

  return { tally, ejected, caught, gains, correct };
}

// ── standings ─────────────────────────────────────────────────────

export interface SeatStat {
  seat: number;
  score: number;
  /** Rounds this seat named an imposter. */
  correct: number;
  /** Rounds this seat was the imposter and lived. */
  survived: number;
  /** Rounds this seat was the imposter. */
  imposter: number;
}

export const blankStats = (seats: number): SeatStat[] =>
  Array.from({ length: seats }, (_, seat) => ({ seat, score: 0, correct: 0, survived: 0, imposter: 0 }));

/** Highest score wins; then sharper reads, then more survivals, then seat order. */
export function standings(stats: SeatStat[]): SeatStat[] {
  return stats
    .slice()
    .sort((a, b) => b.score - a.score || b.correct - a.correct || b.survived - a.survived || a.seat - b.seat);
}

/** The single winner of a finished match. */
export const winnerOf = (stats: SeatStat[]): number => standings(stats)[0].seat;

// ── drawing data ──────────────────────────────────────────────────

/** One drawn copy of an actor, on a 0–100 square field. */
export interface Piece {
  actor: number;
  /** Which copy within the actor, 0-based. */
  index: number;
  kind: ShapeKind;
  colour: string;
  x: number;
  y: number;
  /** Half-extent of the shape, in field units. */
  r: number;
}

/** Where every shape sits before it starts moving. Pure — one scene always lays out the same. */
export function pieces(scene: Scene): Piece[] {
  const out: Piece[] = [];
  scene.actors.forEach((a, actor) => {
    const n = Math.max(1, a.count);
    const step = n === 1 ? 0 : Math.min(24, 68 / (n - 1));
    const r = Math.max(5.5, 12 - n * 1.2);
    const y = 20 + a.lane * 20;
    for (let i = 0; i < n; i++) {
      out.push({ actor, index: i, kind: a.kind, colour: a.colour, x: 50 + (i - (n - 1) / 2) * step, y, r });
    }
  });
  return out;
}

/** The ten points of a five-pointed star, as an SVG polygon string. */
export function starPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.44;
    const th = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(cx + rad * Math.cos(th)).toFixed(2)},${(cy + rad * Math.sin(th)).toFixed(2)}`);
  }
  return pts.join(' ');
}
