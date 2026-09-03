import { ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { store, type State } from '../store/useStore';
import { BADGES } from '../data/progression';
import { DIM, gameByName, type Category } from '../data/games';
import { FRIENDS, grad } from '../data/people';
import { useTheme, type Tokens } from '../theme/theme';
import { Avatar, Chevron, Glass, Glyph, Gradient, H, Kicker, P, Radar, Ring, Tap, gradStops } from '../components/base';
import { FadeIn } from '../components/GameChrome';

/**
 * The design paints a few tints straight in rgba rather than through a token —
 * they are the same in Day and Night, exactly as in the web build, so they stay
 * literal here too. Everything theme-dependent comes from `useTheme()`.
 */
const TINT_14 = 'rgba(150,180,255,0.14)';
const LINE_35 = 'rgba(150,180,255,0.35)';
const RADAR_FILL = 'rgba(150,180,255,0.28)';

/** The fixture's `NEON` holds CSS custom properties, so resolve it from the palette. */
const neonFor = (t: Tokens, cat: Category) => (cat === 'Deduction' ? t.acc : cat === 'Board' ? t.cyan : t.lime);

/** `BADGES` carries its tints the same way. */
function paint(t: Tokens, css: string): string {
  const m = /^var\(--([A-Za-z0-9]+)\)$/.exec(css);
  if (!m) return css;
  const v = t[m[1] as keyof Tokens];
  return typeof v === 'string' ? v : t.ink;
}

/** `DIM` is a `linear-gradient(160deg,…)` string; 160° as start/end fractions. */
const DIM_START = { x: 0.33, y: 0.03 };
const DIM_END = { x: 0.67, y: 0.97 };

const TRIO = [
  { k: 'MATCHES', v: '208' },
  { k: 'WIN RATE', v: '68%' },
  { k: 'ODD ONE', v: '5.1' },
];

const SHARED = ['Imposter Quiz', 'UNO', 'Connect 4', 'GeoGuesser'];

/** 12 · Player card — someone else's profile, with Challenge and Message. */
export default function PlayerCard({ s }: { s: State }) {
  const t = useTheme();
  const who = FRIENDS.find((f) => f.name === s.who) ?? FRIENDS[0];

  return (
    <FadeIn style={{ flex: 1, minHeight: 0, paddingTop: 62, paddingBottom: 34 }}>
      {/* header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 10 }}>
        <Tap onPress={() => store.go('friends')} label="Back">
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 14,
              backgroundColor: TINT_14,
              borderWidth: 1,
              borderColor: LINE_35,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Chevron dir="left" size={17} color={t.accLt} />
          </View>
        </Tap>
        <Kicker color={t.acc} tracking={1.5} style={{ marginRight: 'auto' }}>
          PLAYER CARD
        </Kicker>
        <Tap onPress={() => store.openDm(who.name)} label={`Message ${who.name}`}>
          <Glass radius={14} elevated={false} style={{ width: 36, height: 36 }}>
            <View style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}>
              <Glyph d="M21 12a8 8 0 01-8 8H8l-5 3 1.5-5A8 8 0 1121 12z" size={16} width={2.2} />
            </View>
          </Glass>
        </Tap>
      </View>

      {/* body */}
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8, alignItems: 'center' }}
      >
        {/* the ring, the avatar and the level badge */}
        <View style={{ width: 104, height: 104, alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
          <Ring size={104} pct={0.44} thickness={5} color={t.g2}>
            {/* the CSS inset the disc by 5, leaving a ring of page colour inside the sweep */}
            <View
              style={{
                width: 94,
                height: 94,
                borderRadius: 47,
                backgroundColor: t.bg,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Avatar mark={who.mark} grad={grad(who.gi)} size={86} fontSize={32} />
            </View>
          </Ring>
          <View style={{ position: 'absolute', bottom: -6, left: 0, right: 0, alignItems: 'center' }}>
            <View
              style={{
                paddingHorizontal: 11,
                paddingVertical: 4,
                borderRadius: 8,
                backgroundColor: t.cyan,
                shadowColor: t.acc,
                shadowOffset: { width: 0, height: 0 },
                shadowRadius: 14,
                shadowOpacity: 0.7,
                elevation: 6,
              }}
            >
              <H size={9} color={t.onCyan}>
                LVL {who.lvl}
              </H>
            </View>
          </View>
        </View>

        <H size={21} style={{ marginTop: 16 }}>
          {who.name}
        </H>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6 }}>
          <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: t.lime }} />
          <P size={11.5} weight={400} color={t.dim}>
            {who.status}
          </P>
        </View>

        {/* the two actions */}
        <View style={{ flexDirection: 'row', gap: 9, alignSelf: 'stretch', marginTop: 16 }}>
          <Tap
            onPress={() => store.flash(`Challenge sent to ${who.name}`)}
            label="Challenge"
            style={{ flex: 1.3 }}
          >
            <Gradient radius={999}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: 14,
                }}
              >
                <Glyph d="M13 2L4 14h6l-1 8 9-12h-6z" size={16} color="#fff" width={2.4} />
                <H size={13} color="#fff">
                  Challenge
                </H>
              </View>
            </Gradient>
          </Tap>
          <Tap onPress={() => store.openDm(who.name)} label="Message" style={{ flex: 1 }}>
            <Glass radius={15} borderColor={t.line2}>
              <View style={{ padding: 14, alignItems: 'center' }}>
                <H size={13}>Message</H>
              </View>
            </Glass>
          </Tap>
        </View>

        {/* the stat trio */}
        <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'stretch', marginTop: 10 }}>
          {TRIO.map((x) => (
            <Glass key={x.k} radius={15} style={{ flex: 1 }}>
              <View style={{ paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center' }}>
                <H size={19}>{x.v}</H>
                <P size={9} weight={400} color={t.dim2} style={{ letterSpacing: 0.9, marginTop: 4 }}>
                  {x.k}
                </P>
              </View>
            </Glass>
          ))}
        </View>

        {/* the shared-games rail */}
        <Kicker style={{ alignSelf: 'stretch', marginTop: 20, marginBottom: 10 }}>GAMES YOU BOTH PLAY</Kicker>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ alignSelf: 'stretch', flexGrow: 0 }}
          contentContainerStyle={{ flexDirection: 'row', gap: 9, paddingBottom: 4 }}
        >
          {SHARED.map((n) => {
            const g = gameByName(n);
            const neon = neonFor(t, g.cat);
            return (
              <Tap key={n} onPress={() => store.flash(`Challenge: ${n}`)} label={n}>
                <Glass radius={18} style={{ width: 96 }}>
                  <View style={{ padding: 12, gap: 9, alignItems: 'flex-start' }}>
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 13,
                        overflow: 'hidden',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <LinearGradient
                        colors={gradStops(DIM[g.cat])}
                        start={DIM_START}
                        end={DIM_END}
                        style={StyleSheet.absoluteFill}
                      />
                      <Glyph d={g.d} size={18} color={neon} width={1.8} />
                    </View>
                    {/* two lines' worth of box, so every tile in the rail is the
                        same height — the web got that from flex stretch */}
                    <H size={10.5} numberOfLines={2} style={{ lineHeight: 12.6, minHeight: 25.2, textAlign: 'left' }}>
                      {g.name}
                    </H>
                  </View>
                </Glass>
              </Tap>
            );
          })}
        </ScrollView>

        {/* the performance matrix */}
        <Kicker style={{ alignSelf: 'stretch', marginTop: 20, marginBottom: 2 }}>PERFORMANCE MATRIX</Kicker>
        <View style={{ alignSelf: 'stretch', alignItems: 'center', paddingVertical: 4 }}>
          <Radar points="110,22 192,70 148,158 68,142 34,80" stroke={t.g2} fill={RADAR_FILL} size={204} />
        </View>

        {/* the badge row */}
        <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'stretch' }}>
          {BADGES.map((b) => {
            const tint = paint(t, b.neon);
            return (
              <View key={b.name} accessible accessibilityRole="image" accessibilityLabel={b.name} style={{ flex: 1 }}>
                <Glass radius={15}>
                  <View style={{ aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }}>
<Glyph d={b.d} size={19} color={tint} width={1.8} glow={tint} />
                  </View>
                </Glass>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </FadeIn>
  );
}
