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

/** Centre and radii, matching the design's five `radial-gradient` positions. */
const LAYOUT = [
  { cx: '50%', cy: '-10%', rx: '60%', ry: '35%' },
  { cx: '10%', cy: '28%', rx: '35%', ry: '21%' },
  { cx: '94%', cy: '60%', rx: '40%', ry: '22%' },
  { cx: '24%', cy: '92%', rx: '32%', ry: '18%' },
  { cx: '84%', cy: '96%', rx: '25%', ry: '15%' },
];

export function Background() {
  const t = useTheme();

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: t.bg }]} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          {t.pools.map((pool, i) => (
            <RadialGradient key={i} id={`pool${i}`} cx="50%" cy="50%" r="50%">
              {/* The alpha rides on stop-opacity, never inside stopColor: the
                  Android renderer ignores an alpha channel there, which drew
                  every pool at full strength on a phone while a browser showed
                  it correctly. */}
              <Stop offset="0%" stopColor={pool.rgb} stopOpacity={pool.alpha} />
              <Stop offset="60%" stopColor={pool.rgb} stopOpacity={pool.alpha * 0.35} />
              <Stop offset="100%" stopColor={pool.rgb} stopOpacity={0} />
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
