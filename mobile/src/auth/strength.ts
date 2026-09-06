/**
 * How good a password is, as opposed to whether it is allowed.
 *
 * These are two different questions and the form asks them separately. The
 * *rule* is six characters, because that is Firebase's floor and the only thing
 * the server will actually refuse — a checklist demanding an uppercase letter
 * and a digit would be describing rules nobody enforces, and the first person
 * to be turned away by an invented rule for a password the server would have
 * accepted is being lied to.
 *
 * Strength advises instead. It never blocks anything: it says "this is weak"
 * and lets you go anyway, which is the honest position for a party-games app
 * that is not guarding anybody's money.
 *
 * Deliberately not a cracking estimate. A real one needs a dictionary and a
 * megabyte of data; this is a legibility heuristic — longer and more varied is
 * better — and it is labelled as advice so nobody mistakes it for a guarantee.
 */

import { MIN_PASSWORD } from './validate';

export type Strength = 'none' | 'weak' | 'fair' | 'strong';

export interface Rated {
  score: Strength;
  /** 0–1, for the bar. */
  fill: number;
  label: string;
  /** What would most improve it, or null when there is nothing worth saying. */
  hint: string | null;
}

const has = {
  lower: (p: string) => /[a-z]/.test(p),
  upper: (p: string) => /[A-Z]/.test(p),
  digit: (p: string) => /\d/.test(p),
  symbol: (p: string) => /[^A-Za-z0-9]/.test(p),
};

/** Distinct characters — "aaaaaaaa" is long without being much of a password. */
const variety = (p: string) => new Set(p).size;

export function rate(password: string): Rated {
  if (!password) return { score: 'none', fill: 0, label: '', hint: null };

  if (password.length < MIN_PASSWORD) {
    return {
      score: 'weak',
      fill: Math.min(0.25, password.length / (MIN_PASSWORD * 4)),
      label: 'Too short',
      hint: `${MIN_PASSWORD - password.length} more character${MIN_PASSWORD - password.length === 1 ? '' : 's'}`,
    };
  }

  let points = 0;
  if (password.length >= 8) points++;
  if (password.length >= 12) points++;
  if (password.length >= 16) points++;
  if (has.lower(password) && has.upper(password)) points++;
  if (has.digit(password)) points++;
  if (has.symbol(password)) points++;
  // Repetition is what makes a long password a bad one.
  if (variety(password) >= 6) points++;

  if (points <= 2) {
    return {
      score: 'weak',
      fill: 0.33,
      label: 'Weak',
      hint: password.length < 12 ? 'A longer one is harder to guess' : 'Try mixing in another kind of character',
    };
  }
  if (points <= 4) {
    return {
      score: 'fair',
      fill: 0.66,
      label: 'Fair',
      hint: password.length < 12 ? 'A few more characters would help' : null,
    };
  }
  return { score: 'strong', fill: 1, label: 'Strong', hint: null };
}

/**
 * The requirements a person can see themselves satisfying.
 *
 * One entry, because there is one rule. It is a list rather than a sentence so
 * that the day a second rule exists, the form does not need rewriting — and so
 * it can tick, which is the whole reason the article's advice is right: a rule
 * you watch yourself satisfy is one you never fail.
 */
export interface Requirement {
  label: string;
  met: boolean;
}

export const requirementsFor = (password: string): Requirement[] => [
  { label: `At least ${MIN_PASSWORD} characters`, met: password.length >= MIN_PASSWORD },
];

export const allMet = (password: string): boolean => requirementsFor(password).every((r) => r.met);
