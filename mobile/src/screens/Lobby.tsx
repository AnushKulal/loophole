import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Circle } from 'react-native-svg';
import { store, type State } from '../store/useStore';
import { buildSeats, type Seat } from '../lib/seats';
import { chipsFor } from '../lib/options';
import { useTheme, type Tokens } from '../theme/theme';
import { ArrowRight, Avatar, Chevron, Glass, Glyph, Gradient, H, Kicker, P, Tap } from '../components/base';
import { FadeIn } from '../components/GameChrome';

const ROOM = 'K7QX2M';

/** The design's one literal tint — the fill and rim of every accented control. */
const TINT = 'rgba(150,180,255,0.14)';
const TINT_SOFT = 'rgba(150,180,255,0.12)';
const TINT_LINE = 'rgba(150,180,255,0.35)';
/** The band the room-code shine sweeps across, and its transparent ends. */
const SHINE = 'rgba(150,180,255,0.22)';
const SHINE_OFF = 'rgba(150,180,255,0)';

/** `lib/seats.ts` paints with CSS custom properties; resolve them off the palette. */
function paint(t: Tokens, css: string): string {
  const m = /^var\(--([A-Za-z0-9]+)\)$/.exec(css);
  if (!m) return css;
  const v = t[m[1] as keyof Tokens];
  return typeof v === 'string' ? v : t.ink;
}

/** A seat's `0 0 14px rgba(…)` bloom, restated as the four RN shadow props. */
function glow(css: string): ViewStyle | null {
  const m = /^0 0 (\d+(?:\.\d+)?)px rgba?\(([^)]+)\)$/.exec(css);
  if (!m) return null;
  const parts = m[2].split(',').map((x) => x.trim());
  return {
    shadowColor: `rgb(${parts.slice(0, 3).join(',')})`,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: Number(m[1]),
    shadowOpacity: parts.length > 3 ? Number(parts[3]) : 1,
    elevation: 6,
  };
}

/** Springs its children in, standing in for the `vPop` keyframe. */
function Pop({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: 1, friction: 6, tension: 220, useNativeDriver: true }).start();
  }, [v]);
  return (
    <Animated.View
      style={[
        {
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) }],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * The `vShine` keyframe: a 60px band that crosses the card over 55% of a four
 * second cycle, then waits out the rest. Percentages there are of the band, so
 * −130%/330% become −78/198 px.
 */
function Shine() {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        // The keyframe parks the band off-card from 55% to 100%; holding the
        // end value keeps the whole sequence on the native driver.
        Animated.timing(v, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        width: 60,
        transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [-78, 198] }) }, { rotate: '12deg' }],
      }}
    >
      <LinearGradient
        colors={[SHINE_OFF, SHINE, SHINE_OFF]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

/** The `vPulse` dot next to the LIVE label. */
function LiveDot() {
  const t = useTheme();
  const v = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.45, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(v, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);

  return <Animated.View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.lime, opacity: v }} />;
}

/** One seat: the ringed disc, its HOST/BOT badge, the name and the status line. */
function SeatCell({ p, onPress }: { p: Seat; onPress: () => void }) {
  const t = useTheme();
  const ringGlow = glow(p.ringGlow);
  // The invite slot has no fill at all, so it cannot go through `gradStops`.
  const empty = p.grad === 'transparent';

  return (
    <Pop style={{ flex: 1 }}>
      <Tap onPress={onPress} label={p.name} style={{ alignItems: 'center', gap: 8 }}>
        <View style={{ width: 62, height: 62, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={[
              {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                borderRadius: 31,
                borderWidth: 2,
                borderColor: paint(t, p.ring),
              },
              ringGlow,
            ]}
          />
          {empty ? (
            <View style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' }}>
              <H size={20} color={paint(t, p.markColor)}>
                {p.mark}
              </H>
            </View>
          ) : (
            <Avatar mark={p.mark} grad={p.grad} size={52} fontSize={20} color={paint(t, p.markColor)} />
          )}
          {!!p.tag && (
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: -6, alignItems: 'center' }}>
              <View style={{ paddingVertical: 2, paddingHorizontal: 8, borderRadius: 7, backgroundColor: paint(t, p.tagBg) }}>
                <H size={8} color={paint(t, p.tagColor)}>
                  {p.tag}
                </H>
              </View>
            </View>
          )}
        </View>

        <H size={12} weight={700} color={paint(t, p.color)} style={{ marginTop: 4 }} numberOfLines={1}>
          {p.name}
        </H>
        <P size={9.5} color={t.dim2} style={{ marginTop: -4 }} numberOfLines={1}>
          {p.sub}
        </P>
      </Tap>
    </Pop>
  );
}

/** 07 · Lobby — the room code, the seats, the agreed rules and the start button. */
export default function Lobby({ s }: { s: State }) {
  const t = useTheme();
  const { seats, canStart, joinedLabel } = buildSeats(s);
  const chips = chipsFor(s);
  const modeChip = s.mode === 'friends' ? 'Friends only' : s.mode === 'bots' ? `Bots · ${s.diff}` : `Bots fill · ${s.diff}`;
  // CSS grid `repeat(3,1fr)` becomes rows of three, padded so cells keep their width.
  const rows = Array.from({ length: Math.ceil(seats.length / 3) }, (_, r) => seats.slice(r * 3, r * 3 + 3));

  const openSeat = (p: Seat) => {
    if (p.kind === 'you') store.go('profile');
    else if (p.kind === 'human') store.openPlayer(p.name);
    else if (p.kind === 'bot') store.flash(`Bot skill: ${s.diff}`);
    else store.go('friends');
  };

  return (
    <FadeIn style={{ flex: 1, minHeight: 0, paddingTop: 62, paddingBottom: 40 }}>
      {/* header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 14 }}>
        <Tap onPress={() => store.go('config')} label="Back">
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 14,
              backgroundColor: TINT,
              borderWidth: 1,
              borderColor: TINT_LINE,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Chevron dir="left" size={17} color={t.accLt} />
          </View>
        </Tap>

        <View style={{ marginRight: 'auto', flexShrink: 1, minWidth: 0 }}>
          <H size={15} numberOfLines={1}>
            {s.game}
          </H>
          <P size={10.5} color={t.dim2} style={{ marginTop: 1 }} numberOfLines={1}>
            {joinedLabel}
          </P>
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingVertical: 6,
            paddingHorizontal: 11,
            borderRadius: 999,
            backgroundColor: TINT,
            borderWidth: 1,
            borderColor: TINT_LINE,
          }}
        >
          <LiveDot />
          <H size={10} color={t.lime}>
            LIVE
          </H>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20 }}
      >
        {/* room code */}
        <Tap
          onPress={() => store.copyCode(ROOM)}
          label={`Room code ${ROOM}, tap to share`}
          style={{
            borderRadius: 20,
            padding: 18,
            backgroundColor: t.panel,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: t.line2,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            overflow: 'hidden',
          }}
        >
          <Shine />
          <View>
            <H size={9} color={t.dim2} style={{ letterSpacing: 1.44, marginBottom: 5 }}>
              ROOM CODE · TAP TO SHARE
            </H>
            <H size={32} color={t.accLt} style={{ letterSpacing: 5.12 }}>
              {ROOM}
            </H>
          </View>

          {s.copied ? (
            <Pop style={{ marginLeft: 'auto' }}>
              <View style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10, backgroundColor: t.lime }}>
                <H size={11} color={t.onLime}>
                  COPIED
                </H>
              </View>
            </Pop>
          ) : (
            <View
              style={{
                marginLeft: 'auto',
                width: 38,
                height: 38,
                borderRadius: 14,
                backgroundColor: t.panel2,
                borderWidth: 1,
                borderColor: t.line,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Glyph d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3M12 3v13M7 8l5-5 5 5" size={17} width={2.2} />
            </View>
          )}
        </Tap>

        {/* seats */}
        <View style={{ marginTop: 18 }}>
          <Kicker tracking={1.52} style={{ marginBottom: 12 }}>
            PLAYERS
          </Kicker>

          <View style={{ gap: 11 }}>
            {rows.map((cells, r) => (
              <View key={r} style={{ flexDirection: 'row', gap: 11 }}>
                {cells.map((p, i) => (
                  <SeatCell key={r * 3 + i} p={p} onPress={() => openSeat(p)} />
                ))}
                {Array.from({ length: 3 - cells.length }, (_, k) => (
                  <View key={`pad-${k}`} style={{ flex: 1 }} />
                ))}
              </View>
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
            <Tap onPress={() => store.go('friends')} label="Invite friends" style={{ flex: 1 }}>
              <Glass radius={15} elevated={false} borderColor={t.line2}>
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12 }}
                >
                  <Glyph
                    d="M2.5 20a6.5 6.5 0 0113 0M18 8v6M15 11h6"
                    size={15}
                    width={2.3}
                    color={t.ink}
                    extra={<Circle cx={9} cy={8} r={3.4} stroke={t.ink} strokeWidth={2.3} fill="none" />}
                  />
                  <H size={12}>Invite friends</H>
                </View>
              </Glass>
            </Tap>

            <Tap onPress={() => store.go('config')} label={modeChip} style={{ flex: 1 }}>
              <View
                style={{
                  padding: 12,
                  borderRadius: 15,
                  backgroundColor: TINT_SOFT,
                  borderWidth: 1,
                  borderColor: TINT_LINE,
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                <H size={12} color={t.cyan} numberOfLines={1}>
                  {modeChip}
                </H>
              </View>
            </Tap>
          </View>
        </View>

        {/* rules */}
        <View style={{ marginTop: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 9 }}>
            <Kicker tracking={1.52} style={{ marginRight: 'auto' }}>
              RULES
            </Kicker>
            <Tap onPress={store.openRules} label="How to play" style={{ marginRight: 12 }}>
              <H size={11} weight={700} color={t.accLt}>
                How to play
              </H>
            </Tap>
            <Tap onPress={() => store.go('config')} label="Edit">
              <H size={11} weight={700} color={t.accLt}>
                Edit
              </H>
            </Tap>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
            {chips.map((c) => (
              <Tap key={c} onPress={() => store.go('config')} label={c}>
                <Glass radius={10} elevated={false}>
                  <View style={{ paddingVertical: 8, paddingHorizontal: 12 }}>
                    <P size={11} weight={600} color={t.dim} numberOfLines={1}>
                      {c}
                    </P>
                  </View>
                </Glass>
              </Tap>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* start */}
      <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
        <Tap
          onPress={store.startGame}
          disabled={!canStart}
          label={canStart ? 'Start game' : 'Waiting for players'}
        >
          {canStart ? (
            <Gradient radius={18}>
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 18, paddingHorizontal: 22 }}
              >
                <H size={16} color="#fff" style={{ marginRight: 'auto' }}>
                  Start game
                </H>
                <ArrowRight size={21} />
              </View>
            </Gradient>
          ) : (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 18,
                paddingHorizontal: 22,
                borderRadius: 18,
                backgroundColor: t.panel,
                borderWidth: 1,
                borderColor: t.line,
              }}
            >
              <H size={16} color={t.dim2} style={{ marginRight: 'auto' }}>
                Waiting for players
              </H>
              <ArrowRight size={21} color={t.dim2} />
            </View>
          )}
        </Tap>
      </View>
    </FadeIn>
  );
}
