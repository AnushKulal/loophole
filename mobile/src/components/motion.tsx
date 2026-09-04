import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  curve,
  duration,
  isReducedMotion,
  scaled,
  travel,
  USE_NATIVE_DRIVER,
  watchReducedMotion,
  type CurveName,
} from '../theme/motion';

/**
 * The animation primitives the screens use.
 *
 * Everything here animates `transform` and `opacity` only. Those two composite
 * on the GPU without a layout pass, which is the difference between motion that
 * holds 60fps on a mid-range phone and motion that stutters on one.
 */

/** Subscribes to the OS reduced-motion setting. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(isReducedMotion);
  useEffect(() => watchReducedMotion(setReduced), []);
  return reduced;
}

/** Runs `fn` once on mount, and again whenever `deps` change. */
function useOnMount(fn: () => void | (() => void)) {
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    return fn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

type Direction = 'up' | 'down' | 'left' | 'right' | 'none';

const OFFSET: Record<Direction, [number, number]> = {
  up: [0, 1],
  down: [0, -1],
  left: [1, 0],
  right: [-1, 0],
  none: [0, 0],
};

/**
 * An element arriving: fades in while travelling a short distance to rest.
 *
 * `delay` is how choreography happens — a shared element leads, the rest of the
 * screen follows 50-100ms behind, so the eye has something to track rather than
 * everything appearing at once.
 */
export function Enter({
  children,
  style,
  from = 'up',
  distance = travel.medium,
  delay = 0,
  ms = duration.medium4,
  easing = 'decelerate',
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  from?: Direction;
  distance?: number;
  delay?: number;
  ms?: number;
  easing?: CurveName;
}) {
  const p = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();

  useOnMount(() => {
    const anim = Animated.timing(p, {
      toValue: 1,
      duration: scaled(ms),
      delay: scaled(delay),
      easing: curve[easing],
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    anim.start();
    return () => anim.stop();
  });

  const [dx, dy] = OFFSET[from];
  // Reduced motion keeps the fade and drops the travel: the setting objects to
  // movement, not to a state change being visible.
  const shift = (axis: number) =>
    reduced || axis === 0
      ? 0
      : p.interpolate({ inputRange: [0, 1], outputRange: [axis * distance, 0] });

  return (
    <Animated.View
      style={[
        style,
        { opacity: p, transform: [{ translateX: shift(dx) as never }, { translateY: shift(dy) as never }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * A list whose rows arrive one after another.
 *
 * The stagger is small — 40ms — because the point is a sense of the list
 * assembling, not a queue the user watches. Rows past the tenth arrive with the
 * tenth: a long list should not make someone wait to read the bottom of it.
 */
export function Stagger({
  children,
  step = 40,
  cap = 10,
  ...rest
}: {
  children: ReactNode[];
  step?: number;
  cap?: number;
} & Omit<Parameters<typeof Enter>[0], 'children' | 'delay'>) {
  return (
    <>
      {children.map((child, i) => (
        <Enter key={i} delay={Math.min(i, cap) * step} {...rest}>
          {child}
        </Enter>
      ))}
    </>
  );
}

/**
 * Press feedback: the surface dips slightly under a finger and comes back.
 *
 * 100ms down, 200ms back. Down has to be immediate or the touch feels ignored;
 * coming back is the part that can afford to be seen. The scale is deliberately
 * small — 0.97 reads as a press, 0.9 reads as a bug.
 */
export function Press({
  children,
  onPress,
  label,
  disabled,
  style,
  scale = 0.97,
  dim = 0.9,
}: {
  children: ReactNode;
  onPress: () => void;
  label?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  scale?: number;
  dim?: number;
}) {
  const p = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();

  const to = useCallback(
    (v: number, ms: number) =>
      Animated.timing(p, {
        toValue: v,
        duration: scaled(ms),
        easing: v === 1 ? curve.accelerate : curve.decelerate,
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start(),
    [p],
  );

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => to(1, duration.short2)}
      onPressOut={() => to(0, duration.short4)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={style}
    >
      <Animated.View
        style={{
          opacity: p.interpolate({ inputRange: [0, 1], outputRange: [1, dim] }),
          transform: [
            { scale: reduced ? 1 : (p.interpolate({ inputRange: [0, 1], outputRange: [1, scale] }) as never) },
          ],
        }}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}

/**
 * Crossfades between screens.
 *
 * The outgoing screen accelerates away over 250ms while the incoming one
 * decelerates in over 400 and rises the last 16px. The asymmetry is the whole
 * point: the eye should land on what arrived, not follow what left.
 *
 * `depth` says which way the stack is moving. Going deeper, the new screen
 * comes from the right; coming back, from the left — matching the direction a
 * finger would have swiped.
 */
export function ScreenTransition({
  screenKey,
  depth = 'none',
  children,
  style,
}: {
  /** Changing this remounts the child and replays the entry. */
  screenKey: string;
  depth?: 'in' | 'out' | 'none';
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const from = depth === 'in' ? 'left' : depth === 'out' ? 'right' : 'up';
  return (
    <View style={[{ flex: 1, minHeight: 0 }, style]}>
      <Enter
        key={screenKey}
        from={from}
        distance={depth === 'none' ? travel.medium : travel.large}
        ms={duration.medium4}
        easing="decelerate"
        style={{ flex: 1, minHeight: 0 }}
      >
        {children}
      </Enter>
    </View>
  );
}

/**
 * A number that counts to its new value rather than snapping.
 *
 * Used for XP and scores, where the change is the information. Everything else
 * should just render the number.
 */
export function useCountUp(value: number, ms = duration.long2): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const p = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (value === from.current) return;
    if (isReducedMotion()) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = from.current;
    p.setValue(0);
    const id = p.addListener(({ value: t }) => setShown(Math.round(start + (value - start) * t)));
    const anim = Animated.timing(p, {
      toValue: 1,
      duration: ms,
      easing: curve.standard,
      // A listener on every frame needs the JS-side driver.
      useNativeDriver: false,
    });
    anim.start(() => {
      from.current = value;
    });
    return () => {
      anim.stop();
      p.removeListener(id);
    };
  }, [value, ms, p]);

  return shown;
}

/**
 * A bar that grows to its value on mount and animates between values after.
 *
 * Takes a fraction 0..1 and gives back a width percentage to hand to a style.
 */
export function useProgress(fraction: number, ms = duration.long1): Animated.AnimatedInterpolation<string> {
  const p = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.timing(p, {
      toValue: Math.max(0, Math.min(1, fraction)),
      duration: scaled(ms),
      easing: curve.standard,
      // Width is a layout property, so this one cannot composite on the GPU.
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [fraction, ms, p]);

  return p.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
}

/**
 * A gentle pulse, for something waiting on its own — a live badge, a turn
 * indicator. Stops entirely under reduced motion rather than slowing down,
 * since a repeating animation is exactly what that setting is protecting
 * against.
 */
export function Pulse({
  children,
  style,
  min = 0.55,
  ms = 1200,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  min?: number;
  ms?: number;
}) {
  const p = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      p.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(p, { toValue: min, duration: ms, easing: curve.standard, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(p, { toValue: 1, duration: ms, easing: curve.standard, useNativeDriver: USE_NATIVE_DRIVER }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [p, reduced, min, ms]);

  return <Animated.View style={[style, { opacity: p }]}>{children}</Animated.View>;
}
