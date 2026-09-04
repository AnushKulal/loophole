import { AccessibilityInfo, Easing, Platform, type EasingFunction } from 'react-native';

/**
 * The app's motion vocabulary.
 *
 * Durations and curves come from Material 3's motion tokens, which is what
 * Android users' muscle memory is calibrated to. Nothing here is decorative:
 * every animation in the app should be answering one of four questions —
 * did my touch land, where did this come from, what changed, what matters now.
 * If a motion answers none of them, it should not exist.
 *
 * Two rules the numbers encode:
 *
 * Duration scales with distance and area. A toggle is 100ms; a full screen
 * arriving is 400. Anything past 500 reads as sluggish, anything under 100
 * reads as a jump cut.
 *
 * Entry is slower than exit. The eye needs time to land on what arrived; it
 * needs no time at all to stop caring about what left. So a screen enters over
 * 400ms on a decelerating curve and leaves over 250 on an accelerating one.
 */

export const duration = {
  /** Ripples, press states — the acknowledgement of a touch. */
  short1: 50,
  short2: 100,
  /** Small things arriving: a tooltip, a chip, an icon swap. */
  short3: 150,
  short4: 200,
  /** The standard band. Most state changes live here. */
  medium1: 250,
  medium2: 300,
  medium3: 350,
  medium4: 400,
  /** Full-screen work. */
  long1: 450,
  long2: 500,
} as const;

/**
 * Curves, as react-native Easing functions.
 *
 * `standard` for anything moving between two on-screen positions; `decelerate`
 * for arrivals, `accelerate` for departures. Linear is deliberately absent —
 * nothing in the physical world starts and stops at a constant rate, and it is
 * the single fastest way to make motion feel cheap.
 */
export const curve = {
  /** cubic-bezier(0.4, 0, 0.2, 1) — on-screen movement. */
  standard: Easing.bezier(0.4, 0, 0.2, 1),
  /** cubic-bezier(0, 0, 0, 1) — entering the screen. */
  decelerate: Easing.bezier(0, 0, 0, 1),
  /** cubic-bezier(0.3, 0, 1, 1) — leaving the screen. */
  accelerate: Easing.bezier(0.3, 0, 1, 1),
  /** Material 3's expressive curve, for the one or two hero moments. */
  emphasized: Easing.bezier(0.05, 0.7, 0.1, 1),
} as const;

export type CurveName = keyof typeof curve;

/** Springs, for anything a finger is driving — sheets, drags, pull-to-refresh. */
export const spring = {
  /** Settles without overshoot. Good for sheets and panels. */
  firm: { damping: 26, stiffness: 260, mass: 1 },
  /** A little overshoot, for something that should feel alive. */
  bouncy: { damping: 15, stiffness: 220, mass: 1 },
} as const;

/**
 * Whether the OS asks for reduced motion.
 *
 * Read once at startup and cached, because every animated component would
 * otherwise hit the bridge on mount. `useReducedMotion` in animation.ts is how
 * components read it.
 */
let reduced = false;
export const isReducedMotion = () => reduced;

export function watchReducedMotion(onChange: (v: boolean) => void): () => void {
  let alive = true;
  AccessibilityInfo.isReduceMotionEnabled()
    .then((v) => {
      if (!alive) return;
      reduced = v;
      onChange(v);
    })
    .catch(() => {
      /* older platforms simply do not answer; the default of false stands */
    });

  const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
    reduced = v;
    onChange(v);
  });
  return () => {
    alive = false;
    sub.remove();
  };
}

/**
 * Scales a duration to nothing when reduced motion is on.
 *
 * Reduced motion does not mean "no state change" — it means no *movement*.
 * Components keep animating opacity (which is what the setting permits) and
 * simply arrive at the new position immediately.
 */
export const scaled = (ms: number) => (reduced ? 0 : ms);

/**
 * How far an entering element travels before settling.
 *
 * Small, on purpose. A screen that slides a whole width feels like a carousel;
 * 16-24px reads as "this arrived" without the eye having to chase it.
 */
export const travel = {
  small: 8,
  medium: 16,
  large: 24,
} as const;

/**
 * Native driver is available for transform and opacity — the two properties
 * that composite on the GPU without a layout pass. Everything in this app
 * animates one of those two, which is why this is always true. It is a named
 * constant so the reason survives.
 */
export const USE_NATIVE_DRIVER = Platform.OS !== 'web';

export type { EasingFunction };
