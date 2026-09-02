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
  /** Native blur tint — expo-blur needs to know which way to lean. */
  blurTint: 'dark' | 'light';
  blurIntensity: number;
  /** The bright top rim that reads as a specular highlight. */
  rim: string;
  rimLow: string;
  shadowColor: string;
  shadowOpacity: number;
  /** The five soft light pools the glass refracts, as radial-ish overlays. */
  pools: { colors: string[]; style: { top?: number | string; left?: number | string; right?: number | string; bottom?: number | string; width: number; height: number } }[];
}

const poolsFor = (a: string, b: string, c: string, d: string, e: string): Tokens['pools'] => [
  { colors: [a, 'transparent'], style: { top: -180, left: -60, width: 560, height: 460 } },
  { colors: [b, 'transparent'], style: { top: 150, left: -140, width: 420, height: 380 } },
  { colors: [c, 'transparent'], style: { top: 420, right: -150, width: 440, height: 380 } },
  { colors: [d, 'transparent'], style: { bottom: 40, left: -120, width: 400, height: 340 } },
  { colors: [e, 'transparent'], style: { bottom: -60, right: -110, width: 340, height: 300 } },
];

export const dark: Tokens = {
  bg: '#0a1018',
  bg2: '#101a28',
  panel: 'rgba(190,215,255,0.09)',
  panel2: 'rgba(190,215,255,0.16)',
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
  blurTint: 'dark',
  blurIntensity: 40,
  rim: 'rgba(255,255,255,0.5)',
  rimLow: 'rgba(255,255,255,0.14)',
  shadowColor: '#040a14',
  shadowOpacity: 0.55,
  pools: poolsFor(
    'rgba(170,196,255,0.34)',
    'rgba(139,164,255,0.24)',
    'rgba(77,212,240,0.18)',
    'rgba(52,211,166,0.16)',
    'rgba(248,160,124,0.13)',
  ),
};

export const light: Tokens = {
  bg: '#e7edf7',
  bg2: '#f6f9fd',
  panel: 'rgba(255,255,255,0.58)',
  panel2: 'rgba(255,255,255,0.82)',
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
  blurTint: 'light',
  blurIntensity: 55,
  rim: 'rgba(255,255,255,1)',
  rimLow: 'rgba(255,255,255,0.6)',
  shadowColor: '#16202e',
  shadowOpacity: 0.16,
  pools: poolsFor(
    'rgba(140,170,255,0.3)',
    'rgba(120,150,255,0.22)',
    'rgba(90,200,230,0.18)',
    'rgba(70,200,165,0.16)',
    'rgba(248,160,124,0.14)',
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
