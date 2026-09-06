import { describe, expect, it } from 'vitest';
import { allMet, rate, requirementsFor } from './strength';
import { MIN_PASSWORD, passwordProblem } from './validate';

describe('rate', () => {
  it('says nothing about an empty field', () => {
    expect(rate('')).toMatchObject({ score: 'none', label: '', hint: null });
  });

  it('counts down the characters still needed', () => {
    expect(rate('abc').hint).toBe('3 more characters');
    expect(rate('abcde').hint).toBe('1 more character');
  });

  it('rates a bare minimum password weak', () => {
    expect(rate('abcdef').score).toBe('weak');
  });

  it('rewards length', () => {
    const short = rate('abcdefgh');
    const long = rate('abcdefghijklmnop');
    expect(long.fill).toBeGreaterThan(short.fill);
  });

  it('rewards variety over repetition', () => {
    // "aaaaaaaaaaaa" is long without being much of a password.
    expect(rate('aaaaaaaaaaaa').fill).toBeLessThan(rate('correct horse b').fill);
  });

  it('reaches strong for something genuinely good', () => {
    expect(rate('Tr0ub4dor&3xtra').score).toBe('strong');
    expect(rate('Tr0ub4dor&3xtra').hint).toBeNull();
  });

  it('has a fill between 0 and 1 for anything', () => {
    for (const p of ['', 'a', 'abcdef', 'Tr0ub4dor&3xtra', 'x'.repeat(200)]) {
      const r = rate(p);
      expect(r.fill, p).toBeGreaterThanOrEqual(0);
      expect(r.fill, p).toBeLessThanOrEqual(1);
    }
  });

  it('never refuses anything the server would accept', () => {
    // Strength advises; the rule is what blocks. A password the server takes
    // must never be reported as impossible here.
    for (const p of ['abcdef', 'password', '111111']) {
      expect(passwordProblem(p), p).toBeNull();
      expect(rate(p).score, p).not.toBe('none');
    }
  });
});

describe('requirementsFor', () => {
  it('lists only the rule that is actually enforced', () => {
    // Inventing "needs an uppercase letter" would describe a rule the server
    // does not have, and turn people away from passwords it would accept.
    const reqs = requirementsFor('');
    expect(reqs).toHaveLength(1);
    expect(reqs[0].label).toContain(String(MIN_PASSWORD));
  });

  it('ticks as the rule is satisfied', () => {
    expect(requirementsFor('abc')[0].met).toBe(false);
    expect(requirementsFor('abcdef')[0].met).toBe(true);
  });

  it('agrees exactly with the validator that gates submission', () => {
    // If these ever disagree, the form shows a green tick beside a field the
    // submit button refuses.
    for (const p of ['', 'a', 'abcde', 'abcdef', 'abcdefgh']) {
      expect(allMet(p), p).toBe(passwordProblem(p) === null);
    }
  });
});
