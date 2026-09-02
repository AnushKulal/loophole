import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { useTheme } from '../theme/theme';

/**
 * The five soft light pools behind everything, so the glass has colour to
 * refract.
 *
 * React Native has no radial gradient, and faking one with a linear wash on a
 * rounded view leaves a hard circular edge. SVG does support radial gradients,
 * so the pools are drawn as ellipses with a transparent outer stop — which is
 * exactly what the CSS `radial-gradient(... , transparent NN%)` did.
 */

interface Pool {
  cx: string;
  cy: string;
  rx: string;
  ry: string;
  color: string;
  opacity: number;
}

const LAYOUT: Omit<Pool, 'color'>[] = [
  { cx: '50%', cy: '-8%', rx: '62%', ry: '38%', opacity: 1 },
  { cx: '10%', cy: '28%', rx: '42%', ry: '26%', opacity: 1 },
  { cx: '94%', cy: '60%', rx: '46%', ry: '28%', opacity: 1 },
  { cx: '24%', cy: '92%', rx: '38%', ry: '24%', opacity: 1 },
  { cx: '84%', cy: '96%', rx: '30%', ry: '20%', opacity: 1 },
];

export function Background() {
  const t = useTheme();
  const colors = t.pools.map((p) => p.colors[0]);

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: t.bg }]} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          {LAYOUT.map((_, i) => (
            <RadialGradient key={i} id={`pool${i}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={colors[i]} stopOpacity={1} />
              <Stop offset="65%" stopColor={colors[i]} stopOpacity={0.35} />
              <Stop offset="100%" stopColor={colors[i]} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {LAYOUT.map((p, i) => (
          <Ellipse key={i} cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry} fill={`url(#pool${i})`} />
        ))}
      </Svg>
    </View>
  );
}
