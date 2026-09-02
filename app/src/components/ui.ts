import type { CSSProperties } from 'react';

/** Type ramp. The design sets Outfit for anything structural, Jakarta for prose. */
export const outfit = "'Outfit Variable','Outfit',sans-serif";
export const jakarta = "'Plus Jakarta Sans Variable','Plus Jakarta Sans',sans-serif";

export const head = (size: number, weight = 800, extra: CSSProperties = {}): CSSProperties => ({
  font: `${weight} ${size}px ${outfit}`,
  ...extra,
});

/** The small all-caps section labels that organise every screen. */
export const kicker = (color = 'var(--dim2)', tracking = '.14em'): CSSProperties => ({
  font: `800 9.5px ${outfit}`,
  letterSpacing: tracking,
  color,
});

/** A translucent pane with a specular rim — the core surface of the theme. */
export const glass = (radius = 18): CSSProperties => ({
  borderRadius: radius,
  background: 'var(--panel)',
  border: '1px solid var(--line)',
  backdropFilter: 'var(--blur)',
  WebkitBackdropFilter: 'var(--blur)',
  boxShadow: 'var(--spec)',
});

/** The indigo glass used for every primary action. */
export const primary = (radius: number | string = 999): CSSProperties => ({
  appearance: 'none',
  borderRadius: radius,
  border: 0,
  background: 'var(--gradv)',
  boxShadow: 'var(--glow)',
  backdropFilter: 'var(--blur)',
  WebkitBackdropFilter: 'var(--blur)',
  cursor: 'pointer',
  color: '#fff',
});

/** A full-width primary button with its label left and a trailing icon. */
export const cta: CSSProperties = {
  ...primary(999),
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '17px 20px',
  font: `700 15.5px ${outfit}`,
};

/** Resets a <button> back to a plain surface. */
export const bare: CSSProperties = {
  appearance: 'none',
  background: 'transparent',
  border: 0,
  padding: 0,
  cursor: 'pointer',
  color: 'var(--ink)',
  textAlign: 'left',
};

/** The round-cornered icon button used for back arrows and header actions. */
export const iconBtn = (radius = 14): CSSProperties => ({
  appearance: 'none',
  width: 36,
  height: 36,
  flex: 'none',
  borderRadius: radius,
  background: 'rgba(150,180,255,.14)',
  border: '1px solid rgba(150,180,255,.35)',
  cursor: 'pointer',
  color: 'var(--accLt)',
  display: 'grid',
  placeItems: 'center',
});

/** The same button in glass, for actions that sit on the right of a header. */
export const glassIconBtn = (radius = 14): CSSProperties => ({
  ...glass(radius),
  appearance: 'none',
  width: 36,
  height: 36,
  flex: 'none',
  cursor: 'pointer',
  color: 'var(--ink)',
  display: 'grid',
  placeItems: 'center',
});

/** A progress track — used for XP, per-game win rates and card levels. */
export const track = (h: number): CSSProperties => ({
  height: h,
  borderRadius: 999,
  background: 'var(--track)',
  overflow: 'hidden',
});

/** A screen that fills the device column and scrolls internally. */
export const screen = (padding: string, anim = 'vUp .3s'): CSSProperties => ({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  padding,
  position: 'relative',
  zIndex: 1,
  minHeight: 0,
  animation: anim,
});

/** The scrolling body inside a screen with a fixed header. */
export const body = (padding: string): CSSProperties => ({
  flex: 1,
  overflowY: 'auto',
  padding,
  minHeight: 0,
});

export const row: CSSProperties = { display: 'flex', alignItems: 'center' };

export const ellipsis: CSSProperties = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

/** Spacer that pushes the following content to the bottom of a flex column. */
export const spacer = (min = 14): CSSProperties => ({ flex: 1, minHeight: min });
