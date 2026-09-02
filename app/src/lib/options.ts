import type { Options, State } from '../store/store';

export interface StepperSpec {
  key: keyof Options;
  name: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
}

export interface RuleSpec {
  key: keyof Options;
  name: string;
  hint: string;
}

export interface SetupOptions {
  label: string;
  steppers: StepperSpec[];
  rules: RuleSpec[];
}

/** Each category configures a different thing, so step 04 swaps its whole option set. */
export function optionsFor(cat: State['cat']): SetupOptions {
  if (cat === 'Deduction')
    return {
      label: 'Round options',
      steppers: [
        { key: 'timer', name: 'Answer timer', hint: 'Time to write your answer', min: 15, max: 120, step: 15, fmt: (v) => `${v}s` },
        { key: 'odd', name: 'Odd ones out', hint: 'Players with the other question', min: 1, max: 3, step: 1, fmt: String },
        { key: 'discuss', name: 'Discussion', hint: 'Before voting opens', min: 30, max: 180, step: 15, fmt: (v) => `${v}s` },
      ],
      rules: [{ key: 'spin', name: 'Category packs', hint: 'General, food, cinema' }],
    };

  if (cat === 'Board')
    return {
      label: 'Table rules',
      steppers: [
        { key: 'players', name: 'Players', hint: 'Seats at the table', min: 2, max: 6, step: 1, fmt: String },
        { key: 'turn', name: 'Turn timer', hint: 'Auto-skip after', min: 10, max: 60, step: 5, fmt: (v) => `${v}s` },
      ],
      rules: [
        { key: 'stack', name: 'Stacking', hint: 'Answer a +2 with a +2' },
        { key: 'safe', name: 'Safe zones', hint: 'No captures on marked cells' },
      ],
    };

  return {
    label: 'Match setup',
    steppers: [
      { key: 'match', name: 'Match length', hint: 'Minutes per round', min: 2, max: 10, step: 1, fmt: (v) => `${v} min` },
      { key: 'lives', name: 'Lives', hint: 'Respawns per player', min: 1, max: 5, step: 1, fmt: String },
    ],
    rules: [{ key: 'spin', name: 'Random arena', hint: 'Map picked at drop-in' }],
  };
}

/** The chosen options, restated as editable chips in the lobby. */
export function chipsFor(s: State): string[] {
  const o = s.opt;
  if (s.cat === 'Deduction') return [`${o.timer}s answer`, `${o.odd} odd one`, `${o.discuss}s discussion`, 'General pack'];
  if (s.cat === 'Board')
    return [`${o.players} players`, `${o.turn}s turns`, o.stack ? 'Stacking on' : 'Stacking off', o.safe ? 'Safe zones' : 'No safe zones'];
  return [`${o.match} min`, `${o.lives} lives`, 'Rooftops arena'];
}

export const MODES = [
  { key: 'friends' as const, name: 'Friends only', hint: 'Invite real players' },
  { key: 'mix' as const, name: 'Friends + bots', hint: 'Bots fill empty seats' },
  { key: 'bots' as const, name: 'Vs bots', hint: 'Start instantly, solo' },
];

export const DIFFICULTIES = ['Easy', 'Normal', 'Sharp'] as const;
