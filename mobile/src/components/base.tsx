import { type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path, Polygon, Line as SvgLine, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../theme/theme';
import { font, radius as R } from '../theme/tokens';

/**
 * The design-system primitives, rebuilt for React Native.
 *
 * Three CSS features the design leans on have no RN equivalent, so they are
 * reconstructed here rather than approximated per-screen:
 *   backdrop-filter  -> a real native blur layer (expo-blur)
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
 * A translucent pane: native blur, a tinted fill, a hairline border and the
 * bright top rim that reads as a specular highlight. This is the core surface
 * of the whole design.
 */
export function Glass({
  style,
  radius = R.xl,
  children,
  intensity,
  elevated = true,
  borderColor,
}: {
  style?: StyleProp<ViewStyle>;
  radius?: number;
  children?: ReactNode;
  intensity?: number;
  /** Drop shadow under the pane. Off for panes inside a scrolling list. */
  elevated?: boolean;
  borderColor?: string;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        elevated && {
          borderRadius: radius,
          shadowColor: t.shadowColor,
          shadowOffset: { width: 0, height: 8 },
          shadowRadius: 18,
          shadowOpacity: t.shadowOpacity,
          elevation: 6,
        },
        style,
      ]}
    >
      <View style={{ borderRadius: radius, overflow: 'hidden', borderWidth: 1, borderColor: borderColor ?? t.line }}>
        <BlurView
          intensity={intensity ?? t.blurIntensity}
          tint={t.blurTint}
          // Android needs the Dimezis implementation for a true backdrop blur.
          experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
          style={StyleSheet.absoluteFill}
        />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: t.panel }]} />
        {/* specular rim — the inset highlight the CSS drew with box-shadow */}
        <LinearGradient
          colors={[t.rim, 'transparent']}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, opacity: 0.55 }}
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
          shadowColor: t.acc,
          shadowOffset: { width: 0, height: 8 },
          shadowRadius: 20,
          shadowOpacity: 0.5,
          elevation: 8,
        },
        style,
      ]}
    >
      <View style={{ borderRadius: radius, overflow: 'hidden' }}>
        <LinearGradient
          colors={(colors ?? t.gradv) as [string, string, ...string[]]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={[t.rim, 'transparent']}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, opacity: 0.7 }}
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
export function Tap({
  onPress,
  style,
  children,
  label,
  disabled,
}: {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [style, pressed && !disabled && { opacity: 0.72 }]}
    >
      {children}
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
        <LinearGradient colors={t.gradv as [string, string, ...string[]]} style={StyleSheet.absoluteFill} />
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
