import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, View } from 'react-native';
import { Circle } from 'react-native-svg';
import { store, type State } from '../store/useStore';
import { AWARDS } from '../data/progression';
import { useTheme, type Tokens } from '../theme/theme';
import { Avatar, Glass, Glyph, Gradient, H, Kicker, P, Tap } from '../components/base';
import { FadeIn } from '../components/GameChrome';

/** The design's one literal tint — the fill and rim of the winning row and the XP chip. */
const TINT = 'rgba(150,180,255,0.14)';
const TINT_LINE = 'rgba(150,180,255,0.35)';
const WIN_FILL = 'rgba(150,180,255,0.16)';

/** `AWARDS` carries CSS custom properties as tints; resolve them off the palette. */
function paint(t: Tokens, css: string): string {
  const m = /^var\(--([A-Za-z0-9]+)\)$/.exec(css);
  if (!m) return css;
  const v = t[m[1] as keyof Tokens];
  return typeof v === 'string' ? v : t.ink;
}

/**
 * The twelve confetti squares. The web drives these with the `vFall` keyframe —
 * translateY -30 → 640 while rotating 400°, fading in by 12% and out at the end.
 */
const CONFETTI = Array.from({ length: 12 }, (_, i) => ({
  left: `${4 + i * 8}%` as `${number}%`,
  /** Index into the acc / acc / ink / g2 / g2 / ink cycle. */
  slot: i % 6,
  duration: (2.2 + (i % 4) * 0.5) * 1000,
  delay: i * 180,
  size: i % 3 === 0 ? 9 : 6,
}));

function Confetti() {
  const t = useTheme();
  const cycle = [t.acc, t.acc, t.ink, t.g2, t.g2, t.ink];
  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}
    >
      {CONFETTI.map((c, i) => (
        <Fleck key={i} {...c} color={cycle[c.slot]} />
      ))}
    </View>
  );
}

function Fleck({
  left,
  size,
  duration,
  delay,
  color,
}: {
  left: `${number}%`;
  size: number;
  duration: number;
  delay: number;
  color: string;
}) {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // The CSS delay lands once, before the loop — so it is a sequence, not a
    // delayed timing inside the loop (which would re-delay every fall).
    const run = Animated.sequence([
      Animated.delay(delay),
      Animated.loop(Animated.timing(v, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true })),
    ]);
    run.start();
    return () => run.stop();
  }, [v, duration, delay]);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: -20,
        left,
        width: size,
        height: size,
        borderRadius: 2,
        backgroundColor: color,
        opacity: v.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 1, 0] }),
        transform: [
          { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-30, 640] }) },
          { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '400deg'] }) },
        ],
      }}
    />
  );
}

/** Scales and fades a highlight card in, standing in for the `vPop` keyframe. */
function Pop({ children }: { children: ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // The spring's overshoot is the keyframe's 1.04 bounce.
    Animated.spring(v, { toValue: 1, friction: 6, tension: 150, useNativeDriver: true }).start();
  }, [v]);
  return (
    <Animated.View
      style={{
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

/** 10 · Results — the scoreboard, post-game highlights and what to do next. */
export default function Results({ s }: { s: State }) {
  const t = useTheme();
  const r = s.result;
  if (!r) return null;
  const won = !!r.rows[0]?.win;

  return (
    <FadeIn style={{ flex: 1, minHeight: 0, paddingTop: 62, paddingBottom: 38 }}>
      {won && <Confetti />}

      {/* headline — fixed */}
      <View style={{ paddingHorizontal: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <Kicker color={t.accLt} tracking={1.33}>
            {r.game}
          </Kicker>
          <View
            style={{
              marginLeft: 'auto',
              paddingVertical: 5,
              paddingHorizontal: 11,
              borderRadius: 10,
              backgroundColor: TINT,
              borderWidth: 1,
              borderColor: TINT_LINE,
            }}
          >
            <H size={11} color={t.lime}>
              {r.xp} XP
            </H>
          </View>
        </View>

        <H size={40} style={{ letterSpacing: -1.2, lineHeight: 38.4, marginTop: 12, marginBottom: 8 }}>
          {r.head}
        </H>
        <P size={13.5} weight={400} color={t.dim}>
          {r.kicker}
        </P>
      </View>

      {/* scoreboard, highlights and the note — scrolls */}
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 18, paddingHorizontal: 20 }}
      >
        <View style={{ gap: 8 }}>
          {r.rows.map((x, i) => (
            <FadeIn key={i} delay={i * 80}>
              <View
                style={[
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    borderRadius: 18,
                    backgroundColor: x.win ? WIN_FILL : t.panel,
                    borderWidth: 1,
                    borderColor: x.win ? t.acc : t.line,
                  },
                  // the winner's `0 0 20px` bloom, as the four RN shadow props
                  !!x.win && {
                    shadowColor: t.acc,
                    shadowOffset: { width: 0, height: 0 },
                    shadowRadius: 20,
                    shadowOpacity: 0.3,
                    elevation: 8,
                  },
                ]}
              >
                <H size={11} color={t.dim2} style={{ minWidth: 12 }}>
                  {i + 1}
                </H>
                <Avatar mark={x.mark} grad={x.grad} size={38} fontSize={15} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <H size={14.5}>{x.n}</H>
                  <P size={11} weight={400} color={t.dim2} style={{ marginTop: 2 }}>
                    {x.d}
                  </P>
                </View>
                <H size={14} color={t.accLt}>
                  {x.s}
                </H>
              </View>
            </FadeIn>
          ))}
        </View>

        <Kicker tracking={1.33} style={{ marginTop: 18, marginBottom: 9 }}>
          HIGHLIGHTS
        </Kicker>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ flexDirection: 'row', gap: 9, paddingBottom: 4 }}
        >
          {AWARDS.map((a) => {
            const tint = paint(t, a.tint);
            return (
              <Pop key={a.name}>
                <Glass radius={16} elevated={false} style={{ width: 150 }}>
                  <View style={{ padding: 13 }}>
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 11,
                        backgroundColor: t.tile,
                        borderWidth: 1,
                        borderColor: t.line,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 10,
                      }}
                    >
<Glyph d={a.d} size={18} color={tint} width={1.8} glow={tint} />
                    </View>
                    <H size={12.5}>{a.name}</H>
                    <P size={10.5} weight={400} color={t.dim} style={{ marginTop: 3, lineHeight: 14.2 }}>
                      {a.sub}
                    </P>
                  </View>
                </Glass>
              </Pop>
            );
          })}
        </ScrollView>

        <Glass radius={15} elevated={false} style={{ marginTop: 14 }}>
          <View style={{ flexDirection: 'row', gap: 9, paddingVertical: 13, paddingHorizontal: 15 }}>
            <View style={{ marginTop: 1 }}>
              <Glyph
                d="M12 8v.01M12 11v5"
                size={16}
                width={2.2}
                color={t.accLt}
                extra={<Circle cx={12} cy={12} r={9} stroke={t.accLt} strokeWidth={2.2} fill="none" />}
              />
            </View>
            <P size={12} weight={400} color={t.dim} style={{ flex: 1 }}>
              {r.note}
            </P>
          </View>
        </Glass>
      </ScrollView>

      {/* what to do next — fixed */}
      <View style={{ paddingTop: 14, paddingHorizontal: 20 }}>
        <Tap onPress={store.startGame} label="Play again">
          <Gradient radius={999}>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 17, paddingHorizontal: 20 }}
            >
              <H size={15.5} weight={700} color="#fff" style={{ marginRight: 'auto' }}>
                Play again
              </H>
              <Glyph d="M20 12a8 8 0 11-2.3-5.7M20 4v4h-4" size={19} width={2.6} color="#fff" />
            </View>
          </Gradient>
        </Tap>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 9 }}>
          <Tap onPress={() => store.go('all')} label="Change game" style={{ flex: 1 }}>
            <Glass radius={15} elevated={false} borderColor={t.line2}>
              <View style={{ padding: 14, alignItems: 'center' }}>
                <H size={13}>Change game</H>
              </View>
            </Glass>
          </Tap>
          <Tap onPress={store.toHome} label="Leave lobby" style={{ flex: 1 }}>
            <View
              style={{
                padding: 14,
                borderRadius: 15,
                backgroundColor: 'transparent',
                borderWidth: 1,
                borderColor: 'transparent',
                alignItems: 'center',
              }}
            >
              <H size={13} color={t.pink}>
                Leave lobby
              </H>
            </View>
          </Tap>
        </View>
      </View>
    </FadeIn>
  );
}
