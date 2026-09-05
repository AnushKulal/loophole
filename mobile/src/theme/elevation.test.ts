import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bloom, withAlpha, dark, light } from './tokens';

/**
 * The one Android rule this codebase keeps rediscovering the hard way.
 *
 * Android takes an elevation shadow's *shape* from the view's background
 * drawable. A view with a radius and no fill has none to offer, so the platform
 * falls back to the bounding rectangle and draws a sharp-cornered shadow behind
 * a rounded card — and where the design tints that shadow, as it does with the
 * indigo accent, the result is a hard rectangle sitting inside the card.
 *
 * iOS reads `shadowColor`/`shadowRadius` and never looks at the background, and
 * react-native-web renders `box-shadow` correctly, so nothing in the harness
 * can see it. Four separate rounds of "the buttons look weird" traced back to
 * this. Hence a test that reads the source: it is the only detector that runs
 * here.
 *
 * Two ways to satisfy it — give the view a `backgroundColor` (see `raised`), or
 * drop `elevation` and glow with `bloom`, which draws through a path that reads
 * `borderRadius` directly.
 */

const SRC = fileURLToPath(new URL('..', import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** The `{…}` or `[…]` literal enclosing `at`, one nesting level out per call. */
function enclosing(src: string, at: number, levels: number): string | null {
  let i = at;
  for (let n = 0; n < levels; n++) {
    let depth = 0;
    for (i = i - 1; i >= 0; i--) {
      const c = src[i];
      if (c === '}' || c === ']') depth++;
      else if (c === '{' || c === '[') {
        if (depth === 0) break;
        depth--;
      }
    }
    if (i < 0) return null;
  }
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      depth--;
      if (depth === 0) return src.slice(i, j + 1);
    }
  }
  return null;
}

describe('elevation always has a background to take its shape from', () => {
  const files = walk(SRC).filter((f) => !f.endsWith(join('theme', 'tokens.ts')));

  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const hits: number[] = [];
    for (let i = src.indexOf('elevation:'); i !== -1; i = src.indexOf('elevation:', i + 1)) hits.push(i);
    if (!hits.length) continue;

    it(file.slice(SRC.length), () => {
      for (const at of hits) {
        const line = src.slice(0, at).split('\n').length;
        // Widen outwards: the style may be one object in a `style={[…]}` array
        // whose fill lives in the base object beside it.
        const scopes = [1, 2, 3].map((n) => enclosing(src, at, n)).filter((s): s is string => s !== null);
        const found = scopes.some((s) => s.includes('backgroundColor'));
        expect(
          found,
          `${file.slice(SRC.length)}:${line} sets elevation with no backgroundColor in scope. ` +
            'On Android that shadow will be drawn as a rectangle, whatever the borderRadius says. ' +
            'Give the view a fill (see `raised`), or replace the shadow props with `bloom`.',
        ).toBe(true);
      }
    });
  }
});

describe('bloom', () => {
  it('rounds with the view rather than boxing it', () => {
    // The whole point: no elevation, so no outline, so nothing to square off.
    const s = bloom('#8ba4ff', 18, 0.8);
    expect(s).not.toHaveProperty('elevation');
    expect(s.boxShadow).toBe('0px 0px 18px rgba(139,164,255,0.8)');
  });

  it('offsets downwards for a drop shadow', () => {
    expect(bloom('#040a14', 20, 0.55, 10).boxShadow).toBe('0px 10px 20px rgba(4,10,20,0.55)');
  });

  it('carries a translucent token through at full strength by default', () => {
    expect(bloom('rgba(150,180,255,0.3)', 22).boxShadow).toBe('0px 0px 22px rgba(150,180,255,0.3)');
  });
});

describe('withAlpha', () => {
  it('multiplies through an alpha the colour already has', () => {
    // Fading something translucent has to dim it, not revive it.
    expect(withAlpha('rgba(150,180,255,0.4)', 0.5)).toBe('rgba(150,180,255,0.2)');
  });

  it('reads #rrggbbaa and #rgba', () => {
    expect(withAlpha('#8ba4ff80', 1)).toBe('rgba(139,164,255,0.502)');
    expect(withAlpha('#f008', 1)).toBe('rgba(255,0,0,0.533)');
  });

  it('leaves a colour it cannot parse alone', () => {
    expect(withAlpha('transparent', 0.5)).toBe('transparent');
  });

  it('works on both palettes', () => {
    for (const t of [dark, light]) {
      expect(withAlpha(t.acc, 0.5)).toMatch(/^rgba\(\d+,\d+,\d+,[\d.]+\)$/);
      expect(withAlpha(t.accFill, 0.5)).toMatch(/^rgba\(\d+,\d+,\d+,[\d.]+\)$/);
    }
  });
});
