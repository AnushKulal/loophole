import { describe, expect, it } from 'vitest';
import { dark, fade, light } from './tokens';

/**
 * `fade` exists because of an Android-only rendering bug, and these tests exist
 * because that class of bug reaches a phone and nothing else. A gradient stop
 * of `transparent` is `rgba(0,0,0,0)`, and Android interpolates in straight
 * alpha — so every highlight in the app faded through grey toward black on a
 * device while looking correct in every browser.
 */
describe('fade', () => {
  it('keeps the hue and drops only the alpha', () => {
    expect(fade('rgba(255,255,255,0.5)')).toBe('rgba(255,255,255,0)');
    expect(fade('rgb(190, 215, 255)')).toBe('rgba(190,215,255,0)');
  });

  it('reads the hex notations the palette is written in', () => {
    expect(fade('#ffffff')).toBe('rgba(255,255,255,0)');
    expect(fade('#8ba4ff')).toBe('rgba(139,164,255,0)');
    expect(fade('#fff')).toBe('rgba(255,255,255,0)');
    // Shorthand doubles each digit: #abc is #aabbcc, not #0a0b0c.
    expect(fade('#abc')).toBe('rgba(170,187,204,0)');
    expect(fade('#8ba4ffcc')).toBe('rgba(139,164,255,0)');
  });

  it('tolerates whitespace, since these come from tokens and templates', () => {
    expect(fade('  #ffffff  ')).toBe('rgba(255,255,255,0)');
  });

  it('never produces the black it exists to avoid, for any colour in the palette', () => {
    for (const theme of [dark, light]) {
      for (const [name, value] of Object.entries(theme)) {
        if (typeof value !== 'string' || !/^(#|rgba?\()/.test(value)) continue;
        const faded = fade(value);
        expect(faded, `${name}: ${value}`).toMatch(/^rgba\(\d+,\d+,\d+,0\)$/);
        // The one wrong answer is the one React Native's `transparent` gives.
        if (!/^(#0{3,8}$|rgba?\(\s*0[\s,]+0[\s,]+0)/.test(value)) {
          expect(faded, `${name} faded to black`).not.toBe('rgba(0,0,0,0)');
        }
      }
    }
  });

  it('falls back to a transparent black rather than an invalid colour', () => {
    // A stop React Native cannot parse crashes the gradient; black-at-zero is
    // wrong in the same way `transparent` was, but it still renders.
    expect(fade('not a colour')).toBe('rgba(0,0,0,0)');
    expect(fade('')).toBe('rgba(0,0,0,0)');
  });
});
