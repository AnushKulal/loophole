import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';
import { store, type State } from '../store/useStore';
import type { QuizPhase } from '../store/store';
import { ANSWERS, MARKS, OTHERS, grad } from '../data/people';
import { TINTS } from '../data/progression';
import { useTheme } from '../theme/theme';
import { font } from '../theme/tokens';
import { ArrowRight, Avatar, CloseIcon, Glass, Glyph, Gradient, H, Kicker, P, Ring, Tap } from '../components/base';
import { FadeIn } from '../components/GameChrome';
import { Loop } from './Splash';

const HUD: Record<QuizPhase, string> = {
  reveal: 'R1 · DEAL',
  q: 'R1 · YOUR CARD',
  answer: 'R1 · ANSWER',
  compare: 'R1 · REVEAL',
  discuss: 'R1 · DISCUSS',
  vote: 'R1 · VOTE',
  out: 'R1 · RESULT',
};

const QUESTION = 'Name a fruit that is green.';
const SUGGESTIONS = ['Apple', 'Guava', 'Lime', 'Grapes'];

/**
 * The accent-glass tint every quiz surface is washed with. It is the one colour
 * the palette does not carry as a token — the web build writes it literally too.
 */
const A = (o: number) => `rgba(150,180,255,${o})`;

/** `linear-gradient(160deg, …)` expressed as start/end fractions of the box. */
const G160_START = { x: 0.33, y: 0.03 };
const G160_END = { x: 0.67, y: 0.97 };
/** `linear-gradient(150deg, …)`, the result banner's wash. */
const G150_START = { x: 0.25, y: 0.07 };
const G150_END = { x: 0.75, y: 0.93 };

/** The card back's printed art — indigo falling to a pink corner. */
const BACK = ['rgba(168,186,255,0.3)', 'rgba(120,140,240,0.1)', 'rgba(244,144,192,0.08)'] as [string, string, string];

/** White scrims that sit on the result banner, which is coloured in both themes. */
const SCRIM = 'rgba(255,255,255,0.12)';
const SCRIM_HI = 'rgba(255,255,255,0.22)';

// ── animation ─────────────────────────────────────────────────────
// The CSS keyframes this screen leans on: vPop, vDots, vPulse, vShine.

/** `vPop` — scale 0.82 → 1.04 → 1 with a fade, after a stagger delay. */
function Pop({ delay = 0, children, style }: { delay?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.sequence([
      Animated.delay(delay),
      Animated.spring(v, { toValue: 1, friction: 5, tension: 150, useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [v, delay]);
  return (
    <Animated.View
      style={[
        { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) }] },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** `vDots` — a slow bob between 30% and full opacity, offset per seat. */
function Bobble({ delay = 0, children }: { delay?: number; children: ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.sequence([
      Animated.delay(delay),
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ),
    ]);
    anim.start();
    return () => anim.stop();
  }, [v, delay]);
  return (
    <Animated.View
      style={{
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

/** `vPulse` — opacity 1 ⇄ 0.45 on a 1.6s cycle. */
function Pulse({ children }: { children: ReactNode }) {
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.45, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(v, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={{ opacity: v }}>{children}</Animated.View>;
}

/** `vShine` — a 70px band sweeping the card back, then holding off-frame. */
function Shine() {
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(x, { toValue: 1, duration: 1980, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.delay(1620),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [x]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        width: 70,
        // translateX(-130% → 330%) of a 70px band, held at 12°.
        transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [-91, 231] }) }, { rotate: '12deg' }],
      }}
    >
      <LinearGradient
        colors={['transparent', A(0.35), 'transparent'] as [string, string, string]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

// ── decoration ────────────────────────────────────────────────────

/**
 * The dot grid printed on the card back. CSS tiled a radial-gradient; RN has no
 * repeating background, so it is an SVG pattern of one dot per 22×22 cell.
 */
function DotGrid() {
  return (
    <View style={[StyleSheet.absoluteFill, { opacity: 0.5 }]} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="quizDots" patternUnits="userSpaceOnUse" width={22} height={22}>
            <Circle cx={11} cy={11} r={1.3} fill="rgba(255,255,255,0.16)" />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#quizDots)" />
      </Svg>
    </View>
  );
}

/** A soft light bloom — `radial-gradient(circle, tint, transparent 70%)`. */
function Bloom({
  id,
  size,
  color,
  opacity,
  style,
}: {
  id: string;
  size: number;
  color: string;
  opacity: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={opacity} />
            <Stop offset="70%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

// ── shared pieces ─────────────────────────────────────────────────

/** The indigo pill every phase ends on. Label left, optional trailing icon. */
function Primary({
  label,
  onPress,
  icon,
  center,
}: {
  label: string;
  onPress: () => void;
  icon?: ReactNode;
  center?: boolean;
}) {
  return (
    <Tap onPress={onPress} label={label}>
      <Gradient radius={999}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: center ? 'center' : 'flex-start',
            gap: 12,
            paddingVertical: 17,
            paddingHorizontal: 20,
          }}
        >
          <H size={15.5} weight={700} color="#fff">
            {label}
          </H>
          {icon}
        </View>
      </Gradient>
    </Tap>
  );
}

/**
 * A phase body: `6px 20px 34px`, with the footer pinned at the bottom the way
 * the web build's `flex:1` spacer pins it, and the rest scrolling above it.
 */
function Phase({
  children,
  footer,
  gap = 14,
  center,
}: {
  children: ReactNode;
  footer?: ReactNode;
  /** The spacer's `minHeight` — the least breathing room above the footer. */
  gap?: number;
  center?: boolean;
}) {
  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 6, paddingHorizontal: 20, alignItems: center ? 'center' : undefined }}
      >
        {children}
      </ScrollView>
      <View style={{ paddingTop: gap, paddingHorizontal: 20, paddingBottom: 34 }}>{footer}</View>
    </View>
  );
}

/** 08 · Imposter Quiz — deal, read, answer, reveal, discuss, vote, result. */
export default function ImposterQuiz({ s }: { s: State }) {
  const t = useTheme();
  const myGrad = TINTS[s.tint].grad;
  const myMark = MARKS[s.mark];

  /** Height of the deal phase's card area — the stacked deck is sized off it. */
  const [deckH, setDeckH] = useState(0);
  /** Height of the question card, so its inner spacer has room to push. */
  const [cardH, setCardH] = useState(0);

  /** Everyone at the table, you last. */
  const readers = [
    ...OTHERS.map((p, i) => ({ mark: p.mark, grad: grad(p.gi), delay: i * 160 })),
    { mark: myMark, grad: myGrad, delay: 640 },
  ];

  const answerCards = [
    ...ANSWERS.map(([name, text], i) => ({
      name,
      text,
      mark: OTHERS[i].mark,
      grad: grad(OTHERS[i].gi),
      mine: false,
      delay: i * 110,
    })),
    { name: s.myName, text: s.myAnswer || '—', mark: myMark, grad: myGrad, mine: true, delay: 440 },
  ];

  const voteRows = [OTHERS.slice(0, 2), OTHERS.slice(2, 4)];

  return (
    <View style={{ flex: 1, minHeight: 0, paddingTop: 60 }}>
      {/* hud */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 20, paddingBottom: 12 }}>
        <Glass radius={10} elevated={false} style={{ marginRight: 'auto' }}>
          <View style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
            <H size={9.5} color={t.accLt} style={{ letterSpacing: 1.14 }}>
              {HUD[s.qp]}
            </H>
          </View>
        </Glass>

        <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 3.5,
              backgroundColor: t.acc,
              shadowColor: t.acc,
              shadowOffset: { width: 0, height: 0 },
              shadowRadius: 8,
              shadowOpacity: 1,
              elevation: 4,
            }}
          />
          <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: t.track }} />
          <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: t.track }} />
        </View>

        <Tap onPress={store.enterLobby} label="Leave">
          <Glass radius={14} elevated={false} style={{ width: 36, height: 36 }}>
            <View style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}>
              <CloseIcon />
            </View>
          </Glass>
        </Tap>
      </View>

      {/* ── deal ─────────────────────────────────────────────────── */}
      {s.qp === 'reveal' && (
        <View style={{ flex: 1, minHeight: 0, paddingTop: 6, paddingHorizontal: 20, paddingBottom: 34 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 }}>
            {readers.map((r, i) => (
              <Pop key={i} delay={r.delay}>
                <Avatar mark={r.mark} grad={r.grad} size={28} fontSize={11} />
              </Pop>
            ))}
            <P size={10.5} weight={400} color={t.dim2} style={{ marginLeft: 2 }}>
              5 cards dealt
            </P>
          </View>

          <View style={{ flex: 1, minHeight: 0 }} onLayout={(e) => setDeckH(e.nativeEvent.layout.height)}>
            {/* the rest of the deck, stacked behind */}
            <Glass
              radius={24}
              elevated={false}
              style={{
                position: 'absolute',
                top: 20,
                left: 12,
                right: 12,
                height: deckH * 0.7,
                transform: [{ rotate: '-4deg' }],
              }}
            >
              <View style={{ height: Math.max(0, deckH * 0.7 - 2) }} />
            </Glass>
            <View
              style={{
                position: 'absolute',
                top: 10,
                left: 6,
                right: 6,
                height: deckH * 0.74,
                borderRadius: 24,
                backgroundColor: t.panel2,
                transform: [{ rotate: '3deg' }],
              }}
            />

            <Tap onPress={() => store.setQp('q')} label="Tap to read your card" style={{ flex: 1 }}>
              <View
                style={{
                  flex: 1,
                  borderRadius: 26,
                  shadowColor: t.acc,
                  shadowOffset: { width: 0, height: 0 },
                  shadowRadius: 34,
                  shadowOpacity: 0.3,
                  elevation: 10,
                }}
              >
                <View
                  style={{ flex: 1, borderRadius: 26, overflow: 'hidden', borderWidth: 1, borderColor: A(0.5) }}
                >
                  <LinearGradient
                    colors={BACK}
                    locations={[0, 0.55, 1]}
                    start={G160_START}
                    end={G160_END}
                    style={StyleSheet.absoluteFill}
                  />
                  <DotGrid />
                  <Shine />

                  <View
                    style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}
                    pointerEvents="none"
                  >
                    {/* translate(-50%,-56%) — 6% of the 140px mark, above centre */}
                    <View style={{ alignItems: 'center', justifyContent: 'center', transform: [{ translateY: -8.4 }] }}>
                      <Loop size={140} color={A(0.45)} width={1} />
                      <H
                        size={66}
                        color="#fff"
                        style={{
                          position: 'absolute',
                          textShadowColor: A(0.9),
                          textShadowOffset: { width: 0, height: 0 },
                          textShadowRadius: 24,
                        }}
                      >
                        ?
                      </H>
                    </View>
                  </View>

                  <View style={{ flex: 1, padding: 24, justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View
                        style={{
                          paddingVertical: 5,
                          paddingHorizontal: 11,
                          borderRadius: 8,
                          backgroundColor: A(0.28),
                          borderWidth: 1,
                          borderColor: A(0.5),
                        }}
                      >
                        <H size={9} color={t.accLt} style={{ letterSpacing: 0.9 }}>
                          GENERAL PACK
                        </H>
                      </View>
                      <View
                        style={{
                          paddingVertical: 5,
                          paddingHorizontal: 11,
                          borderRadius: 8,
                          backgroundColor: 'rgba(0,0,0,0.4)',
                          borderWidth: 1,
                          borderColor: 'rgba(255,255,255,0.12)',
                        }}
                      >
                        <H size={9} color="#fff">
                          {`${s.opt.odd} ODD ONE`}
                        </H>
                      </View>
                    </View>

                    <View>
                      <H size={27} color="#fff" style={{ letterSpacing: -0.54, lineHeight: 28.35 }}>
                        {'Tap to read\nyour card'}
                      </H>
                      <View
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 9, opacity: 0.75 }}
                      >
                        <Glyph
                          d="M3 3l18 18M10.6 10.7a2 2 0 002.8 2.8M6.1 6.3C4 7.7 2 12 2 12s3.5 6 10 6c1.6 0 3-.4 4.2-1M9.9 6.2A8.7 8.7 0 0112 6c6.5 0 10 6 10 6s-.9 1.5-2.5 3"
                          size={14}
                          width={2.2}
                          color="#fff"
                        />
                        <P size={12} weight={400} color="#fff">
                          {"Don't let them see the screen"}
                        </P>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            </Tap>
          </View>
        </View>
      )}

      {/* ── your card ────────────────────────────────────────────── */}
      {s.qp === 'q' && (
        <FadeIn style={{ flex: 1, minHeight: 0, paddingTop: 6, paddingHorizontal: 20, paddingBottom: 34 }}>
          <View
            onLayout={(e) => setCardH(e.nativeEvent.layout.height)}
            style={{
              flex: 1,
              minHeight: 0,
              borderRadius: 26,
              shadowColor: t.acc,
              shadowOffset: { width: 0, height: 0 },
              shadowRadius: 28,
              shadowOpacity: 0.16,
              elevation: 6,
            }}
          >
            <Glass radius={26} elevated={false} borderColor={A(0.4)} style={{ flex: 1, minHeight: 0 }}>
              {/* Glass sizes to its content, so the pane is held open to the
                  measured height and the inner spacer does the rest. */}
              <View style={{ minHeight: Math.max(0, cardH - 2) }}>
                <Bloom id="qCardBloom" size={190} color={A(1)} opacity={0.4} style={{ right: -30, bottom: -60 }} />

                <View style={{ flex: 1, padding: 24 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View
                      style={{ paddingVertical: 5, paddingHorizontal: 11, borderRadius: 8, backgroundColor: A(0.2) }}
                    >
                      <H size={9} color={t.accLt} style={{ letterSpacing: 1.08 }}>
                        YOUR QUESTION
                      </H>
                    </View>
                    <P size={10.5} weight={400} color={t.dim2} style={{ marginLeft: 'auto' }}>
                      Round 1 of 3
                    </P>
                  </View>

                  <H
                    size={70}
                    color={A(0.25)}
                    style={{ lineHeight: 49, marginTop: 14, marginBottom: -12, includeFontPadding: false }}
                  >
                    “
                  </H>
                  <H size={31} style={{ letterSpacing: -0.775, lineHeight: 35.34 }}>
                    {QUESTION}
                  </H>

                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 9,
                      marginTop: 16,
                      paddingVertical: 12,
                      paddingHorizontal: 14,
                      borderRadius: 15,
                      backgroundColor: A(0.1),
                      borderWidth: 1,
                      borderColor: A(0.3),
                    }}
                  >
                    <Glyph
                      d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"
                      size={16}
                      width={2.2}
                      color={t.pink}
                      extra={<Circle cx={12} cy={12} r={2.4} stroke={t.pink} strokeWidth={2.2} fill="none" />}
                    />
                    <P size={12} weight={400} color={t.ink} style={{ lineHeight: 16.8, flexShrink: 1 }}>
                      One of you got a{' '}
                      <P size={12} weight={700} color={t.ink}>
                        different
                      </P>{' '}
                      question. It might be you.
                    </P>
                  </View>

                  <View style={{ flex: 1, minHeight: 14 }} />

                  <View>
                    <H size={9} color={t.dim2} style={{ letterSpacing: 1.26, marginBottom: 9 }}>
                      READING NOW
                    </H>
                    <View style={{ flexDirection: 'row', gap: 7 }}>
                      {readers.map((r, i) => (
                        <Bobble key={i} delay={r.delay}>
                          <Avatar mark={r.mark} grad={r.grad} size={34} fontSize={13} />
                        </Bobble>
                      ))}
                    </View>
                  </View>
                </View>
              </View>
            </Glass>
          </View>

          <View style={{ marginTop: 12 }}>
            <Primary label="Got it — let me answer" onPress={() => store.setQp('answer')} icon={<ArrowRight />} />
          </View>
        </FadeIn>
      )}

      {/* ── answer ───────────────────────────────────────────────── */}
      {s.qp === 'answer' && (
        <Phase
          gap={14}
          footer={
            <>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 9,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  borderRadius: 15,
                  backgroundColor: A(0.1),
                  borderWidth: 1,
                  borderColor: A(0.3),
                  marginBottom: 10,
                }}
              >
                <Glyph
                  d="M12 7v5l3 2"
                  size={15}
                  width={2.2}
                  color={t.accLt}
                  extra={<Circle cx={12} cy={12} r={9} stroke={t.accLt} strokeWidth={2.2} fill="none" />}
                />
                <P size={11.5} weight={400} color={t.dim} style={{ flexShrink: 1 }}>
                  Answers stay hidden until everyone locks in.
                </P>
              </View>
              <Primary label="Lock it in" center onPress={() => store.setQp('compare')} />
            </>
          }
        >
          <FadeIn>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <P size={12} weight={400} color={t.dim} style={{ flex: 1 }}>
                {QUESTION}
              </P>
              <Pulse>
                <View
                  style={{
                    paddingVertical: 5,
                    paddingHorizontal: 11,
                    borderRadius: 10,
                    backgroundColor: A(0.14),
                    borderWidth: 1,
                    borderColor: A(0.35),
                  }}
                >
                  <H size={11.5} color={t.pink}>
                    0:22
                  </H>
                </View>
              </Pulse>
            </View>

            <Glass radius={20} elevated={false} borderColor={A(0.4)}>
              <View style={{ padding: 18 }}>
                <H size={9} color={t.dim2} style={{ letterSpacing: 1.26, marginBottom: 8 }}>
                  YOUR ANSWER
                </H>
                <TextInput
                  value={s.myAnswer}
                  onChangeText={store.setAnswer}
                  accessibilityLabel="Your answer"
                  placeholderTextColor={t.dim2}
                  style={{
                    fontFamily: font.h,
                    fontSize: 28,
                    color: t.ink,
                    padding: 0,
                    includeFontPadding: false,
                  }}
                />
                {/* `--gradv` as a 2px rule; the Gradient primitive's specular rim
                    would wash out a bar this thin, so the wash is drawn direct. */}
                <LinearGradient
                  colors={t.gradv as [string, string, ...string[]]}
                  locations={[0, 0.45, 1]}
                  start={G160_START}
                  end={G160_END}
                  style={{
                    height: 2,
                    borderRadius: 999,
                    marginTop: 10,
                    shadowColor: t.acc,
                    shadowOffset: { width: 0, height: 0 },
                    shadowRadius: 10,
                    shadowOpacity: 0.8,
                    elevation: 4,
                  }}
                />
              </View>
            </Glass>

            <H size={9} color={t.dim2} style={{ letterSpacing: 1.26, marginTop: 18, marginBottom: 9 }}>
              QUICK PICKS
            </H>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {SUGGESTIONS.map((pick) => (
                <Tap key={pick} onPress={() => store.setAnswer(pick)} label={pick}>
                  <Glass radius={13} elevated={false}>
                    <View style={{ paddingVertical: 10, paddingHorizontal: 15 }}>
                      <P size={12.5} weight={600} color={t.ink}>
                        {pick}
                      </P>
                    </View>
                  </Glass>
                </Tap>
              ))}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 }}>
              {OTHERS.map((p) => (
                <Pop key={p.name}>
                  <Avatar mark={p.mark} grad={grad(p.gi)} size={34} fontSize={12} />
                </Pop>
              ))}
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  borderWidth: 2,
                  borderColor: t.line2,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <H size={12} color={t.dim2}>
                  {myMark}
                </H>
              </View>
              <P size={11} weight={400} color={t.dim2} style={{ marginLeft: 4 }}>
                4 of 5 in
              </P>
            </View>
          </FadeIn>
        </Phase>
      )}

      {/* ── reveal ───────────────────────────────────────────────── */}
      {s.qp === 'compare' && (
        <Phase gap={14} footer={<Primary label="Start discussion" center onPress={() => store.setQp('discuss')} />}>
          <H size={22} style={{ letterSpacing: -0.22 }}>
            All five at once
          </H>
          <P size={12.5} weight={400} color={t.dim} style={{ marginTop: 6, marginBottom: 14 }}>
            Nobody could copy.
          </P>
          <View style={{ gap: 8 }}>
            {answerCards.map((a, i) => (
              <FadeIn key={i} delay={a.delay}>
                <Glass radius={18} elevated={false} borderColor={a.mine ? t.acc : t.line}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 11,
                      paddingVertical: 11,
                      paddingHorizontal: 13,
                    }}
                  >
                    <Avatar mark={a.mark} grad={a.grad} size={36} fontSize={14} />
                    <View style={{ marginRight: 'auto', flexShrink: 1, minWidth: 0 }}>
                      <P size={10.5} weight={400} color={t.dim2}>
                        {a.name}
                      </P>
                      <H size={17}>{a.text}</H>
                    </View>
                    {a.mine && (
                      <View
                        style={{ paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8, backgroundColor: A(0.24) }}
                      >
                        <H size={9.5} color={t.accLt}>
                          YOURS
                        </H>
                      </View>
                    )}
                  </View>
                </Glass>
              </FadeIn>
            ))}
          </View>
        </Phase>
      )}

      {/* ── discussion ───────────────────────────────────────────── */}
      {s.qp === 'discuss' && (
        <Phase
          gap={12}
          center
          footer={
            <Tap onPress={() => store.setQp('vote')} label="Skip to vote">
              <Glass radius={18} elevated={false} borderColor={t.line2}>
                <View style={{ padding: 16, alignItems: 'center' }}>
                  <H size={14.5} weight={700}>
                    Skip to vote
                  </H>
                </View>
              </Glass>
            </Tap>
          }
        >
          <Kicker tracking={1.33} style={{ alignSelf: 'flex-start' }}>
            TALK IT OUT
          </Kicker>

          <View style={{ marginTop: 14, marginBottom: 6 }}>
            <Ring size={200} thickness={14} pct={1 - s.secs / Math.max(1, s.opt.discuss)}>
              <View
                style={{
                  width: 172,
                  height: 172,
                  borderRadius: 86,
                  backgroundColor: t.bg,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <H size={56} style={{ letterSpacing: -1.68 }}>
                  {`0:${String(s.secs).padStart(2, '0')}`}
                </H>
              </View>
            </Ring>
          </View>

          <View style={{ alignSelf: 'stretch', gap: 6, marginTop: 6 }}>
            {answerCards.map((a, i) => (
              <Glass key={i} radius={15} elevated={false}>
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 12 }}
                >
                  <Avatar mark={a.mark} grad={a.grad} size={28} fontSize={11} />
                  <P size={12} weight={400} color={t.dim} style={{ marginRight: 'auto', flexShrink: 1 }}>
                    {a.name}
                  </P>
                  <H size={13.5}>{a.text}</H>
                </View>
              </Glass>
            ))}
          </View>
        </Phase>
      )}

      {/* ── vote ─────────────────────────────────────────────────── */}
      {s.qp === 'vote' && (
        <Phase
          gap={14}
          footer={
            s.vote ? (
              <FadeIn>
                <View
                  style={{
                    padding: 15,
                    borderRadius: 18,
                    backgroundColor: A(0.16),
                    borderWidth: 1,
                    borderColor: t.acc,
                  }}
                >
                  <H size={14}>{`You voted ${s.vote}`}</H>
                  <P size={11.5} weight={400} color={t.dim} style={{ marginTop: 3 }}>
                    Waiting on the others…
                  </P>
                </View>
              </FadeIn>
            ) : (
              <P size={11.5} weight={400} color={t.dim2}>
                One tap. No takebacks.
              </P>
            )
          }
        >
          <FadeIn>
            <Kicker color={t.pink} tracking={1.33}>
              VOTE
            </Kicker>
            <H size={25} style={{ letterSpacing: -0.5, lineHeight: 27.5, marginTop: 8, marginBottom: 16 }}>
              {'Who had the\ndifferent question?'}
            </H>
            <View style={{ gap: 10 }}>
              {voteRows.map((cells, r) => (
                <View key={r} style={{ flexDirection: 'row', gap: 10 }}>
                  {cells.map((p) => {
                    const on = s.vote === p.name;
                    return (
                      <Pressable
                        key={p.name}
                        onPress={() => store.castVote(p.name)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        accessibilityLabel={p.name}
                        style={({ pressed }) => [
                          {
                            flex: 1,
                            borderRadius: 20,
                            padding: 15,
                            gap: 11,
                            alignItems: 'flex-start',
                            backgroundColor: on ? A(0.16) : t.panel,
                            borderWidth: 1,
                            borderColor: on ? t.acc : t.line,
                          },
                          pressed && { opacity: 0.72 },
                        ]}
                      >
                        <Avatar mark={p.mark} grad={grad(p.gi)} size={48} fontSize={18} />
                        <H size={14}>{p.name}</H>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          </FadeIn>
        </Phase>
      )}

      {/* ── result ───────────────────────────────────────────────── */}
      {s.qp === 'out' && (
        <Phase gap={16} footer={<Primary label="Scoreboard" onPress={store.finishQuiz} icon={<ArrowRight />} />}>
          <FadeIn>
            <View
              style={{
                borderRadius: 24,
                shadowColor: t.acc,
                shadowOffset: { width: 0, height: 0 },
                shadowRadius: 30,
                shadowOpacity: 0.45,
                elevation: 10,
              }}
            >
              <View style={{ borderRadius: 24, overflow: 'hidden' }}>
                <LinearGradient
                  colors={[t.g2, t.acc, t.g2] as [string, string, string]}
                  locations={[0, 0.55, 1]}
                  start={G150_START}
                  end={G150_END}
                  style={StyleSheet.absoluteFill}
                />
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    right: -20,
                    bottom: -50,
                    width: 170,
                    height: 170,
                    borderRadius: 85,
                    backgroundColor: SCRIM,
                  }}
                />

                <View style={{ padding: 24 }}>
                  <View
                    style={{
                      width: 54,
                      height: 54,
                      borderRadius: 20,
                      backgroundColor: SCRIM_HI,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 14,
                    }}
                  >
                    <H size={22} color="#fff">
                      ◐
                    </H>
                  </View>
                  <H size={32} color="#fff" style={{ letterSpacing: -0.64, lineHeight: 32 }}>
                    {'Karthik\nvoted out'}
                  </H>
                  <P size={13} weight={400} color="#fff" style={{ marginTop: 11, opacity: 0.92 }}>
                    He said tomato. He was a civilian.
                  </P>
                </View>
              </View>
            </View>

            <Glass radius={18} elevated={false} style={{ marginTop: 14 }}>
              <View style={{ flexDirection: 'row', gap: 11, padding: 15 }}>
                <Avatar mark={myMark} grad={myGrad} size={32} fontSize={13} />
                <View style={{ flexShrink: 1, minWidth: 0 }}>
                  <H size={14.5}>You were the odd one out</H>
                  <P size={12} weight={400} color={t.dim} style={{ marginTop: 3 }}>
                    Your question asked for green. Apple covered you.
                  </P>
                </View>
              </View>
            </Glass>
          </FadeIn>
        </Phase>
      )}
    </View>
  );
}
