import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { store } from '../store/useStore';
import type { State } from '../store/store';
import { useTheme } from '../theme/theme';
import { Glass, Glyph, Gradient, H, P, ArrowRight } from '../components/base';

/** The interlocking-rings brand mark. */
export function Loop({ size = 38, color = '#fff', width = 2 }: { size?: number; color?: string; width?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="8.6" cy="12" r="5.2" stroke={color} strokeWidth={width} />
      <Circle cx="15.4" cy="12" r="5.2" stroke={color} strokeWidth={width} />
    </Svg>
  );
}

/** A tile that drifts up and down, standing in for the `vFloat` keyframe. */
function FloatTile({ d, tint, color, delay }: { d: string; tint: string; color: string; delay: number }) {
  const y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(y, { toValue: -8, duration: 2000, delay, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [y, delay]);

  return (
    <Animated.View style={{ transform: [{ translateY: y }] }}>
      <Glass radius={16} borderColor={`rgba(${tint},0.5)`} style={{ width: 46, height: 46 }}>
        <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: `rgba(${tint},0.22)` }}>
          <Glyph d={d} size={22} color={color} width={1.8} />
        </View>
      </Glass>
    </Animated.View>
  );
}

/** 01 · Splash — tap anywhere to enter. */
export default function Splash({ s }: { s: State }) {
  const t = useTheme();
  const [waiting, setWaiting] = useState(false);

  // Tapping before the stored session has been checked leaves the button
  // waiting rather than sending you to a sign-in screen you do not need.
  const checking = waiting && s.auth.status === 'unknown';

  return (
    <Pressable
      onPress={() => {
        setWaiting(true);
        store.enter();
      }}
      accessibilityRole="button"
      accessibilityLabel="Enter Loophole"
      style={{ flex: 1, justifyContent: 'center', gap: 30, paddingHorizontal: 28, paddingTop: 80, paddingBottom: 66 }}
    >
      <View style={{ flexDirection: 'row', gap: 9 }}>
        <FloatTile d="M9 9a3 3 0 114 2.8V13M12 17v.01M3 12a9 9 0 1018 0 9 9 0 00-18 0" tint="139,164,255" color={t.acc} delay={0} />
        <FloatTile
          d="M3 12a9 9 0 1018 0 9 9 0 00-18 0M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"
          tint="77,212,240"
          color={t.cyan}
          delay={600}
        />
        <FloatTile d="M3 15h14v-4H3zM7 11V8h6v3M17 13h4M5 19h10" tint="52,211,166" color={t.lime} delay={1200} />
      </View>

      <View>
        <Gradient radius={26} style={{ width: 72, height: 72, marginBottom: 22 }}>
          <View style={{ width: 72, height: 72, alignItems: 'center', justifyContent: 'center' }}>
            <Loop />
          </View>
        </Gradient>
        <H size={12} color={t.accLt} style={{ letterSpacing: 2.4 }}>
          GAME NIGHT, RANKED
        </H>
        <H size={52} style={{ letterSpacing: -1.5, marginTop: 12, lineHeight: 54 }}>
          Loophole
        </H>
        <P size={15} style={{ lineHeight: 22, marginTop: 14, maxWidth: 278 }}>
          Fourteen party games, one lobby, one ladder. Somebody at this table is lying.
        </P>
      </View>

      <Gradient radius={18}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 17, paddingHorizontal: 22 }}>
          <H size={16} weight={700} color="#fff" style={{ marginRight: 'auto' }}>
            {checking ? 'Just a moment…' : 'Enter'}
          </H>
          {checking ? <ActivityIndicator color="#fff" /> : <ArrowRight size={21} />}
        </View>
      </Gradient>
    </Pressable>
  );
}
