import { useRef, type ReactNode } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path, Polygon, Line as SvgLine, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../theme/theme';
import { font, radius as R, fade } from '../theme/tokens';
import { curve, duration, scaled, USE_NATIVE_DRIVER } from '../theme/motion';
import { useReducedMotion } from './motion';

/**
 * The design-system primitives, rebuilt for React Native.
 *
 * Three CSS features the design leans on have no RN equivalent, so they are
 * reconstructed here rather than approximated per-screen:
 *   backdrop-filter  -> a layered translucent fill (see Glass)
 *   inset box-shadow -> an explicit specular rim drawn over the pane
 *   conic-gradient   -> an SVG arc with a dashed stroke
 */

// ── type ──────────────────────────────────────────────────────────

/** Structural type: Outfit, tight tracking. The design's headings and labels. */
export function H({
  size = 14,
  weight = 800,
  color,
  style,
  children,
  numberOfLines,
}: {
  size?: number;
  weight?: 800 | 700 | 600 | 500;
  color?: string;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
}) {
  const t = useTheme();
  const family = weight === 800 ? font.h : weight === 700 ? font.h7 : weight === 600 ? font.h6 : font.h5;
  return (
    <Text numberOfLines={numberOfLines} style={[{ fontFamily: family, fontSize: size, color: color ?? t.ink }, style]}>
      {children}
    </Text>
  );
}

/** Prose: Plus Jakarta Sans. */
export function P({
  size = 12,
  weight = 500,
  color,
  style,
  children,
  numberOfLines,
}: {
  size?: number;
  weight?: 400 | 500 | 600 | 700;
  color?: string;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
}) {
  const t = useTheme();
  const family = weight === 400 ? font.bodyR : weight === 600 ? font.bodySb : weight === 700 ? font.bodyB : font.body;
  return (
    <Text numberOfLines={numberOfLines} style={[{ fontFamily: family, fontSize: size, color: color ?? t.dim }, style]}>
      {children}
    </Text>
  );
}

/** The small all-caps label that opens most sections. */
export function Kicker({ children, color, tracking = 1.4, style }: { children: ReactNode; color?: string; tracking?: number; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return (
    <Text style={[{ fontFamily: font.h, fontSize: 9.5, letterSpacing: tracking, color: color ?? t.dim2 }, style]}>{children}</Text>
  );
}

// ── surfaces ──────────────────────────────────────────────────────

/**
 * A translucent pane: a tinted fill, a hairline border and a faint top rim.
 *
 * There is deliberately no native blur here any more. `expo-blur` renders into
 * its own surface, and Android does not clip a native surface to its parent's
 * corner radius — so every card had a hard-edged rectangle sitting inside its
 * rounded outline, in both themes. It also tinted far more heavily than on iOS,
 * which bleached day mode.
 *
 * What the design actually needs from `backdrop-filter` is a surface that reads
 * as lifted off a coloured ground. A translucent fill over the light pools does
 * that, and does it identically on every platform.
 *
 * The rule this file now follows: every layer carries its own `borderRadius`.
 * Nothing relies on the parent clipping it.
 */
export function Glass({
  style,
  radius = R.xl,
  children,
  elevated = true,
  borderColor,
  fill,
}: {
  style?: StyleProp<ViewStyle>;
  radius?: number;
  children?: ReactNode;
  /** Drop shadow under the pane. Off for panes inside a scrolling list. */
  elevated?: boolean;
  borderColor?: string;
  /** Overrides the panel tint, for the few surfaces that sit brighter. */
  fill?: string;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        elevated && {
          borderRadius: radius,
          shadowColor: t.shadowColor,
          shadowOffset: { width: 0, height: 6 },
          shadowRadius: 14,
          shadowOpacity: t.shadowOpacity,
          elevation: 3,
        },
        style,
      ]}
    >
      <View
        style={{
          borderRadius: radius,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: borderColor ?? t.line,
          backgroundColor: fill ?? t.panel,
        }}
      >
        {/* A little more light at the top than the bottom, which is what sells
            a pane as tilted toward a light source. Its own radius, so the
            corners stay round even where clipping would not save us. */}
        <LinearGradient
          colors={[t.panelTop, fade(t.panelTop)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
          pointerEvents="none"
        />
        {/* The specular rim. Kept faint — at full strength it reads as a bright
            bar stuck to the top edge rather than as light catching an edge. */}
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: radius * 0.5,
            right: radius * 0.5,
            height: 1,
            backgroundColor: t.rim,
            opacity: t.rimOpacity,
          }}
          pointerEvents="none"
        />
        {children}
      </View>
    </View>
  );
}

/** The indigo glass of every primary action. */
export function Gradient({
  colors,
  style,
  radius = R.pill,
  children,
  glow = true,
}: {
  colors?: string[];
  style?: StyleProp<ViewStyle>;
  radius?: number;
  children?: ReactNode;
  glow?: boolean;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        glow && {
          borderRadius: radius,
          shadowColor: t.shadowColor,
          shadowOffset: { width: 0, height: 4 },
          shadowRadius: 10,
          shadowOpacity: t.shadowOpacity,
          // Android renders shadowColor as a tinted spot shadow, and an indigo
          // one at elevation 8 bled a milky halo around every primary surface.
          elevation: 2,
        },
        style,
      ]}
    >
      <View style={{ borderRadius: radius, overflow: 'hidden', backgroundColor: colors?.[0] ?? t.accFill }}>
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: radius * 0.5,
            right: radius * 0.5,
            height: 1,
            backgroundColor: t.rim,
            opacity: 0.35,
          }}
          pointerEvents="none"
        />
        {children}
      </View>
    </View>
  );
}

/** Parses the `linear-gradient(...)` strings the fixture data carries. */
export function gradStops(css: string): [string, string, ...string[]] {
  const hits = css.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/g);
  if (!hits || hits.length < 2) return ['#7d92f0', '#3f4fbe'];
  return hits as [string, string, ...string[]];
}

/** A player's avatar disc, filled with their tint. */
export function Avatar({
  mark,
  grad,
  size,
  radius: rad,
  fontSize,
  color = '#fff',
  style,
  children,
}: {
  mark: string;
  /** A CSS gradient string from the fixture data. */
  grad: string;
  size: number;
  radius?: number;
  fontSize?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const r = rad ?? size / 2;
  return (
    <View style={[{ width: size, height: size }, style]}>
      <LinearGradient
        colors={gradStops(grad)}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={{ width: size, height: size, borderRadius: r, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ fontFamily: font.h, fontSize: fontSize ?? Math.round(size * 0.38), color }}>{mark}</Text>
      </LinearGradient>
      {children}
    </View>
  );
}

// ── icons ─────────────────────────────────────────────────────────

/** A stroked 24×24 icon. Every glyph in the design is one path on this grid. */
export function Glyph({
  d,
  size = 18,
  color,
  width = 2,
  glow,
  extra,
}: {
  d: string;
  size?: number;
  color?: string;
  width?: number;
  /**
   * Colour of the bloom around the stroke — the design's
   * `filter: drop-shadow(0 0 6px …)`. React Native has no such filter, and a
   * shadow on the wrapping View renders as a square halo, so the bloom is the
   * same path drawn wide and translucent underneath.
   */
  glow?: string;
  /** Additional shapes drawn on the same grid — the rects and circles a few icons need. */
  extra?: ReactNode;
}) {
  const t = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {extra}
      {glow && (
        <Path
          d={d}
          stroke={glow}
          strokeWidth={width + 3.5}
          strokeOpacity={0.22}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      <Path d={d} stroke={color ?? t.ink} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export const ArrowRight = ({ size = 19, color = '#fff' }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M5 12h13M12 5l7 7-7 7" stroke={color} strokeWidth={2.6} strokeLinecap="round" />
  </Svg>
);

export const Chevron = ({ size = 17, color, dir = 'right' }: { size?: number; color?: string; dir?: 'right' | 'left' }) => {
  const t = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={dir === 'right' ? 'M9 5l7 7-7 7' : 'M15 5l-7 7 7 7'} stroke={color ?? t.ink} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
};

export const CloseIcon = ({ size = 16, color }: { size?: number; color?: string }) => {
  const t = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M18 6L6 18M6 6l12 12" stroke={color ?? t.ink} strokeWidth={2.6} strokeLinecap="round" />
    </Svg>
  );
};

/**
 * The progress ring. CSS drew these with `conic-gradient`; here it is an SVG
 * circle with a dashed stroke, which gives the same hard-edged sweep.
 */
export function Ring({
  size,
  pct,
  thickness = 5,
  color,
  trackColor,
  children,
}: {
  size: number;
  /** 0–1. */
  pct: number;
  thickness?: number;
  color?: string;
  trackColor?: string;
  children?: ReactNode;
}) {
  const t = useTheme();
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, pct));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor ?? t.track} strokeWidth={thickness} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color ?? t.acc}
          strokeWidth={thickness}
          fill="none"
          strokeDasharray={`${c * clamped} ${c}`}
          strokeLinecap="butt"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}

/**
 * The five-axis performance matrix on the profile screens.
 *
 * The viewBox is padded past the polygon so the axis labels have room — at a
 * tight 0 0 220 190 the outer ones ("BOARD", "SURVIVAL") are clipped by the
 * edge, since a middle-anchored label extends half its width either side.
 */
export function Radar({
  points,
  stroke,
  fill,
  size = 212,
  spokes = false,
}: {
  points: string;
  stroke: string;
  fill: string;
  size?: number;
  spokes?: boolean;
}) {
  const t = useTheme();
  const VB = { x: -22, y: -6, w: 264, h: 206 };
  const h = (size * VB.h) / VB.w;

  const axes = [
    { label: 'BLUFF', x: 110, y: 10 },
    { label: 'SPEED', x: 208, y: 66 },
    { label: 'VOTES', x: 172, y: 182 },
    { label: 'SURVIVAL', x: 48, y: 182 },
    { label: 'BOARD', x: 12, y: 66 },
  ];
  const verts: [number, number][] = [
    [110, 18],
    [197, 68],
    [164, 166],
    [56, 166],
    [23, 68],
  ];

  return (
    <Svg width={size} height={h} viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`} accessibilityLabel="Performance matrix">
      <Polygon points="110,18 197,68 164,166 56,166 23,68" fill="none" stroke={t.line2} strokeWidth={1} />
      <Polygon points="110,60 154,86 137,136 83,136 66,86" fill="none" stroke={t.line} strokeWidth={1} />
      {spokes && verts.map(([x, y]) => <SvgLine key={`${x}-${y}`} x1={110} y1={92} x2={x} y2={y} stroke={t.line} />)}
      <Polygon points={points} fill={fill} stroke={stroke} strokeWidth={2} />
      {axes.map((a) => (
        <SvgText key={a.label} x={a.x} y={a.y} fill={t.dim} fontSize={9.5} fontFamily={font.h} textAnchor="middle">
          {a.label}
        </SvgText>
      ))}
    </Svg>
  );
}

// ── controls ──────────────────────────────────────────────────────

/** A pressable that dims on touch, the RN stand-in for the design's hovers. */
/**
 * Every tappable surface in the app.
 *
 * The press dips the surface to 0.97 and dims it slightly: 100ms down on an
 * accelerating curve, 200ms back on a decelerating one. Down has to be
 * immediate or the touch reads as ignored; the return is the part that can
 * afford to be watched. The scale is small on purpose — 0.97 reads as a press,
 * anything deeper reads as a bug.
 *
 * `scale` can be turned off for surfaces where shrinking would look wrong: a
 * full-bleed row, or something already inside a transform.
 */
export function Tap({
  onPress,
  style,
  children,
  label,
  disabled,
  scale = true,
}: {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  label?: string;
  disabled?: boolean;
  scale?: boolean;
}) {
  const p = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();

  const to = (v: number) =>
    Animated.timing(p, {
      toValue: v,
      duration: scaled(v === 1 ? duration.short2 : duration.short4),
      easing: v === 1 ? curve.accelerate : curve.decelerate,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => !disabled && to(1)}
      onPressOut={() => !disabled && to(0)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={style}
    >
      <Animated.View
        style={{
          opacity: disabled ? 0.55 : p.interpolate({ inputRange: [0, 1], outputRange: [1, 0.82] }),
          transform:
            scale && !reduced
              ? [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [1, 0.97] }) }]
              : undefined,
        }}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}

/** The full-width primary action: label left, icon right. */
export function Cta({ label, onPress, icon, style }: { label: string; onPress: () => void; icon?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Tap onPress={onPress} label={label} style={style}>
      <Gradient radius={R.pill}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 17, paddingHorizontal: 22 }}>
          <H size={15.5} weight={700} color="#fff" style={{ marginRight: 'auto' }}>
            {label}
          </H>
          {icon ?? <ArrowRight />}
        </View>
      </Gradient>
    </Tap>
  );
}

/** A thin progress bar. */
export function Bar({ pct, fill, height = 4, style }: { pct: number; fill: string; height?: number; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View style={[{ height, borderRadius: 999, backgroundColor: t.track, overflow: 'hidden' }, style]}>
      <View style={{ width: `${Math.max(0, Math.min(1, pct)) * 100}%`, height: '100%', backgroundColor: fill }} />
    </View>
  );
}

/** The pill toggle used for rules and preferences. */
export function Switch({ on, onPress, label }: { on: boolean; onPress: () => void; label: string }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      style={{ width: 54, height: 30, borderRadius: 999, borderWidth: 1, borderColor: on ? 'transparent' : t.line2, justifyContent: 'center', overflow: 'hidden' }}
    >
      {on ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: t.accFill }]} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: t.track }]} />
      )}
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: '#fff',
          marginLeft: on ? 28 : 3,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowRadius: 6,
          shadowOpacity: 0.4,
          elevation: 3,
        }}
      />
    </Pressable>
  );
}

/** A small tinted chip — counts, tags, statuses. */
export function Chip({
  children,
  bg,
  color,
  border,
  style,
}: {
  children: ReactNode;
  bg?: string;
  color?: string;
  border?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          paddingHorizontal: 11,
          paddingVertical: 5,
          borderRadius: 10,
          backgroundColor: bg ?? 'rgba(150,180,255,0.14)',
          borderWidth: border ? 1 : 0,
          borderColor: border,
        },
        style,
      ]}
    >
      <Text style={{ fontFamily: font.h, fontSize: 10, color: color ?? t.accLt }}>{children}</Text>
    </View>
  );
}

export const R_ = R;
