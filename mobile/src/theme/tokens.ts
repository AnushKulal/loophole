/**
 * The tinted-glass palette, ported from the design's CSS custom properties to
 * plain values React Native can consume. Same numbers, same roles — the web
 * build's `tokens.css` and this file are two renderings of one palette.
 */

export interface Tokens {
  bg: string;
  bg2: string;
  /** Fill behind a glass pane, layered over the native blur. */
  panel: string;
  panel2: string;
  line: string;
  line2: string;
  ink: string;
  dim: string;
  dim2: string;
  g2: string;
  g3: string;
  tile: string;
  acc: string;
  acc2: string;
  accLt: string;
  cyan: string;
  lime: string;
  pink: string;
  gold: string;
  track: string;
  /** Legible foreground on a solid fill of the matching accent. */
  onAcc: string;
  onPink: string;
  onLime: string;
  onCyan: string;
  /** The indigo glass of every primary action, as gradient stops. */
  gradv: string[];
  /**
   * Which theme this is. A handful of places need to pick between two literal
   * colours rather than a token — a chess disc, a Ludo seat label — and this is
   * the honest way to ask. They used to read `blurTint`, which meant the same
   * thing only by accident.
   */
  isDark: boolean;
  /**
   * A touch more light at the top of a pane than the bottom. This is what
   * carries the sense of a lit surface now that there is no native blur —
   * transparent at the bottom so the pool colour behind still shows through.
   */
  panelTop: string;
  /** The hairline that reads as light catching the top edge. */
  rim: string;
  rimLow: string;
  /** Kept low deliberately: at full strength the rim reads as a stuck-on bar. */
  rimOpacity: number;
  shadowColor: string;
  shadowOpacity: number;
  /**
   * The five soft light pools the glass refracts.
   *
   * Colour and alpha are kept apart on purpose. They used to be one `rgba()`
   * string handed to an SVG `stop-color`, and react-native-svg's Android
   * renderer drops the alpha channel there — so every pool drew at full
   * strength on a phone while looking correct in a browser. Splitting them
   * means the alpha goes to `stop-opacity`, which every renderer honours.
   */
  pools: { rgb: string; alpha: number }[];
}

type Pool = [rgb: string, alpha: number];

const poolsFor = (...five: Pool[]): Tokens['pools'] => five.map(([rgb, alpha]) => ({ rgb, alpha }));

export const dark: Tokens = {
  bg: '#0a1018',
  bg2: '#101a28',
  panel: 'rgba(150,180,235,0.10)',
  panel2: 'rgba(160,190,240,0.17)',
  line: 'rgba(200,222,255,0.22)',
  line2: 'rgba(200,222,255,0.36)',
  ink: '#eef4ff',
  dim: 'rgba(238,244,255,0.72)',
  dim2: 'rgba(238,244,255,0.56)',
  g2: '#9fb3d1',
  g3: '#7688a6',
  tile: 'rgba(190,215,255,0.1)',
  acc: '#8ba4ff',
  acc2: '#6d7ff0',
  accLt: '#c6d4ff',
  cyan: '#4dd4f0',
  lime: '#34d3a6',
  pink: '#f490c0',
  gold: '#f9c46b',
  track: 'rgba(200,222,255,0.14)',
  onAcc: '#0a1018',
  onPink: '#2a0d1d',
  onLime: '#04241b',
  onCyan: '#062733',
  gradv: ['rgba(168,186,255,0.6)', 'rgba(112,132,242,0.34)', 'rgba(92,112,224,0.24)'],
  isDark: true,
  panelTop: 'rgba(190,215,255,0.07)',
  rim: 'rgba(255,255,255,0.55)',
  rimOpacity: 0.5,
  rimLow: 'rgba(255,255,255,0.14)',
  shadowColor: '#040a14',
  shadowOpacity: 0.55,
  pools: poolsFor(
    ['#aac4ff', 0.34],
    ['#8ba4ff', 0.24],
    ['#4dd4f0', 0.18],
    ['#34d3a6', 0.16],
    ['#f8a07c', 0.13],
  ),
};

export const light: Tokens = {
  bg: '#e7edf7',
  bg2: '#f6f9fd',
  panel: 'rgba(255,255,255,0.72)',
  panel2: 'rgba(255,255,255,0.9)',
  line: 'rgba(22,32,46,0.12)',
  line2: 'rgba(22,32,46,0.22)',
  ink: '#16202e',
  dim: 'rgba(22,32,46,0.74)',
  dim2: 'rgba(22,32,46,0.64)',
  g2: '#5b6b82',
  g3: '#79899e',
  tile: 'rgba(255,255,255,0.6)',
  acc: '#4f5fd6',
  acc2: '#3f4dc0',
  accLt: '#3a48b8',
  cyan: '#0b6f88',
  lime: '#0a6f57',
  pink: '#a13c63',
  gold: '#8f6420',
  track: 'rgba(22,32,46,0.13)',
  onAcc: '#ffffff',
  onPink: '#ffffff',
  onLime: '#ffffff',
  onCyan: '#ffffff',
  gradv: ['#6d7ff0', '#4a58cc', '#3f4dc0'],
  isDark: false,
  panelTop: 'rgba(255,255,255,0.5)',
  rim: 'rgba(255,255,255,1)',
  rimOpacity: 0.7,
  rimLow: 'rgba(255,255,255,0.6)',
  shadowColor: '#16202e',
  shadowOpacity: 0.16,
  pools: poolsFor(
    ['#8caaff', 0.3],
    ['#7896ff', 0.22],
    ['#5ac8e6', 0.18],
    ['#46c8a5', 0.16],
    ['#f8a07c', 0.14],
  ),
};

export type ThemeName = 'dark' | 'light';
export const THEMES: Record<ThemeName, Tokens> = { dark, light };

/**
 * Category accent for labels on a chip that stays dark in both themes — the
 * theme accent goes deep in Day mode and would drop such a label to ~2.4:1.
 */
export const NEON_ON_DARK = {
  Deduction: '#8ba4ff',
  Board: '#4dd4f0',
  Arcade: '#34d3a6',
} as const;

/** Type ramp. Outfit carries anything structural, Jakarta carries prose. */
export const font = {
  h: 'Outfit_800ExtraBold',
  h7: 'Outfit_700Bold',
  h6: 'Outfit_600SemiBold',
  h5: 'Outfit_500Medium',
  body: 'PlusJakartaSans_500Medium',
  bodyR: 'PlusJakartaSans_400Regular',
  bodySb: 'PlusJakartaSans_600SemiBold',
  bodyB: 'PlusJakartaSans_700Bold',
} as const;

/** The design's radius scale. Nothing in this system is square. */
export const radius = { sm: 8, md: 12, lg: 15, xl: 18, xxl: 20, card: 22, pane: 26, pill: 999 } as const;

/**
 * The zero-alpha end of a gradient, in the *same* hue as its start.
 *
 * React Native resolves the keyword `transparent` to `rgba(0,0,0,0)` — black,
 * with no alpha. Android interpolates gradient stops in straight (rather than
 * premultiplied) alpha, so a white highlight fading to `transparent` travels
 * through grey towards black on its way out, leaving a dirty smear where the
 * highlight should simply disappear.
 *
 * iOS and browsers premultiply and look correct, which is why every gradient in
 * this app read fine in the harness and wrong on a phone.
 *
 * `fade('#fff')` gives `rgba(255,255,255,0)` — the same colour, gone.
 */
export function fade(color: string): string {
  const rgb = toRgb(color);
  return rgb ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)` : 'rgba(0,0,0,0)';
}

/** Channel values from the colour notations this codebase actually uses. */
function toRgb(color: string): [number, number, number] | null {
  const c = color.trim();

  const fn = c.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (fn) return [Number(fn[1]), Number(fn[2]), Number(fn[3])];

  const hex = c.match(/^#([0-9a-f]{3,8})$/i)?.[1];
  if (!hex) return null;
  // #rgb and #rgba are shorthand: each digit doubles.
  if (hex.length === 3 || hex.length === 4) {
    return [0, 1, 2].map((i) => parseInt(hex[i] + hex[i], 16)) as [number, number, number];
  }
  if (hex.length === 6 || hex.length === 8) {
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  }
  return null;
}
