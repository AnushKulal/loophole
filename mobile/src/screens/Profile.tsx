import { ScrollView, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Circle } from 'react-native-svg';
import { store, type State } from '../store/useStore';
import { BADGES, TINTS } from '../data/progression';
import { GAMES } from '../data/games';
import { MARKS } from '../data/people';
import { useTheme, type Tokens } from '../theme/theme';
import { Avatar, Bar, Chevron, Glass, Glyph, H, Kicker, P, Radar, Ring, Tap } from '../components/base';
import { FadeIn } from '../components/GameChrome';

/** The design's fixed accent wash — the tinted square behind the back chevron. */
const TINT = 'rgba(150,180,255,0.14)';
const TINT_LINE = 'rgba(150,180,255,0.35)';
/** The matrix polygon's fill, the one literal the radar carries. */
const RADAR_FILL = 'rgba(150,180,255,0.34)';

/** The fixtures paint with CSS custom properties; resolve them off the palette. */
function paint(t: Tokens, css: string): string {
  const m = /^var\(--([A-Za-z0-9]+)\)$/.exec(css);
  if (!m) return css;
  const v = t[m[1] as keyof Tokens];
  return typeof v === 'string' ? v : t.ink;
}

/** The win-rate fixtures are percentage strings; `Bar` wants a 0–1 fraction. */
const pctOf = (rate: string): number => parseFloat(rate) / 100;

const TRIO = [
  { k: 'MATCHES', v: '142' },
  { k: 'WIN RATE', v: '61%' },
  { k: 'ODD ONE', v: '4.2' },
];

const PER_GAME = [
  { name: 'Imposter Quiz', rate: '73%', neon: 'var(--acc)', gi: 2 },
  { name: 'GeoGuesser', rate: '58%', neon: 'var(--acc)', gi: 5 },
  { name: 'UNO', rate: '48%', neon: 'var(--cyan)', gi: 6 },
  { name: 'Connect 4', rate: '75%', neon: 'var(--cyan)', gi: 11 },
  { name: 'Chess', rate: '20%', neon: 'var(--g2)', gi: 9 },
];

const HISTORY = [
  { game: 'Imposter Quiz', when: 'Tonight', result: 'SURVIVED', tint: 'var(--lime)', bg: 'rgba(52,211,166,0.16)', xp: '+320' },
  { game: 'Connect 4', when: 'Tonight', result: 'WON', tint: 'var(--lime)', bg: 'rgba(52,211,166,0.16)', xp: '+180' },
  { game: 'Ludo', when: 'Yesterday', result: 'LOST', tint: 'var(--pink)', bg: 'rgba(244,144,192,0.16)', xp: '+20' },
  { game: "Liar's Bar", when: 'Sunday', result: 'LOST', tint: 'var(--pink)', bg: 'rgba(244,144,192,0.16)', xp: '+30' },
];

/** 11 · My profile — level ring, stats, achievements, matrix, per-game and history. */
export default function Profile({ s }: { s: State }) {
  const t = useTheme();
  const myGrad = TINTS[s.tint].grad;

  return (
    <FadeIn style={{ flex: 1, minHeight: 0, paddingTop: 62 }}>
      {/* header — fixed */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 10 }}>
        <Tap onPress={store.toHome} label="Back">
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
        <Kicker color={t.acc} tracking={1.52} style={{ marginRight: 'auto' }}>
          PLAYER CARD
        </Kicker>
        <Tap onPress={() => store.go('settings')} label="Settings">
          <Glass radius={14} elevated={false} style={{ width: 36, height: 36 }}>
            <View style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}>
              <Glyph
                d="M12 3v3M12 18v3M3 12h3M18 12h3"
                size={16}
                width={2}
                extra={<Circle cx={12} cy={12} r={3} stroke={t.ink} strokeWidth={2} fill="none" />}
              />
            </View>
          </Glass>
        </Tap>
      </View>

      {/* the card itself — scrolls */}
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 20, paddingBottom: 10 }}
      >
        {/* level ring — the CSS conic sweep, drawn as a 5px stroked arc */}
        <View style={{ width: 112, height: 112, alignItems: 'center', justifyContent: 'center', marginTop: 6 }}>
          <Ring size={112} pct={0.68} thickness={5} color={t.acc}>
            {/* the `inset: 5` disc the web lays over the middle of the sweep */}
            <View
              style={{ position: 'absolute', top: 5, left: 5, width: 102, height: 102, borderRadius: 51, backgroundColor: t.bg }}
            />
            <Avatar mark={MARKS[s.mark]} grad={myGrad} size={92} fontSize={34} />
          </Ring>
          <View
            style={{
              position: 'absolute',
              bottom: -6,
              paddingVertical: 4,
              paddingHorizontal: 12,
              borderRadius: 8,
              backgroundColor: t.acc,
              // the badge's `0 0 14px` bloom, as the four RN shadow props
              shadowColor: t.acc,
              shadowOffset: { width: 0, height: 0 },
              shadowRadius: 14,
              shadowOpacity: 0.7,
              elevation: 6,
            }}
          >
            <H size={9.5} color={t.onAcc}>
              LVL 24
            </H>
          </View>
        </View>

        <H size={22} style={{ marginTop: 18 }}>
          {s.myName}
        </H>
        <P size={11.5} weight={400} color={t.accLt} style={{ marginTop: 5 }}>
          Odd One specialist · Chennai
        </P>

        {/* progress to the next level */}
        <Glass radius={15} elevated={false} style={{ width: '100%', marginTop: 16 }}>
          <View style={{ paddingVertical: 12, paddingHorizontal: 14 }}>
            <View style={{ flexDirection: 'row' }}>
              <P size={9.5} weight={400} color={t.dim2} style={{ marginRight: 'auto', letterSpacing: 0.95 }}>
                PROGRESS TO LVL 25
              </P>
              <P size={9.5} weight={700} color={t.accLt} style={{ letterSpacing: 0.95 }}>
                12,450 / 15,000 XP
              </P>
            </View>
            {/* the fill's glow sits inside an `overflow: hidden` track, so it never shows */}
            <View style={{ height: 6, borderRadius: 999, backgroundColor: t.track, overflow: 'hidden', marginTop: 8 }}>
              <LinearGradient
                colors={t.gradv as [string, string, ...string[]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ width: '68%', height: '100%' }}
              />
            </View>
          </View>
        </Glass>

        {/* the stat trio */}
        <View style={{ flexDirection: 'row', gap: 8, width: '100%', marginTop: 10 }}>
          {TRIO.map((x) => (
            <Glass key={x.k} radius={15} elevated={false} style={{ flex: 1 }}>
              <View style={{ paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center' }}>
                <H size={19}>{x.v}</H>
                <P size={9} weight={400} color={t.dim2} style={{ letterSpacing: 0.9, marginTop: 4 }}>
                  {x.k}
                </P>
              </View>
            </Glass>
          ))}
        </View>

        <View style={{ width: '100%', flexDirection: 'row', alignItems: 'baseline', marginTop: 20, marginBottom: 10 }}>
          <Kicker tracking={1.33} style={{ marginRight: 'auto' }}>
            ACHIEVEMENTS
          </Kicker>
          <P size={10} weight={400} color={t.acc}>
            5 of 24
          </P>
        </View>

        <View style={{ width: '100%', flexDirection: 'row', gap: 8 }}>
          {BADGES.map((b) => {
            const neon = paint(t, b.neon);
            return (
              <View key={b.name} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                <Glass radius={15} elevated={false} style={{ width: '100%' }}>
                  <View style={{ width: '100%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }}>
<Glyph d={b.d} size={20} color={neon} width={1.8} glow={neon} />
                  </View>
                </Glass>
                <P size={9.5} weight={400} color={t.dim2} style={{ textAlign: 'center', lineHeight: 11.4 }}>
                  {b.name}
                </P>
              </View>
            );
          })}
        </View>

        <Kicker tracking={1.33} style={{ width: '100%', marginTop: 20, marginBottom: 2 }}>
          PERFORMANCE MATRIX
        </Kicker>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel="Performance matrix"
          style={{ width: '100%', alignItems: 'center', paddingVertical: 4 }}
        >
          <Radar points="110,30 186,72 152,152 74,148 38,74" stroke={t.acc} fill={RADAR_FILL} spokes />
        </View>

        <Kicker tracking={1.33} style={{ width: '100%', marginTop: 14, marginBottom: 10 }}>
          PER GAME
        </Kicker>
        <View style={{ width: '100%', gap: 8 }}>
          {PER_GAME.map((p) => {
            const neon = paint(t, p.neon);
            return (
              <Glass key={p.name} radius={15} elevated={false}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 10, paddingHorizontal: 13 }}>
                  {/* `rgba(255,255,255,.05)` on the web; `tile` is that plaque in both themes */}
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 13,
                      backgroundColor: t.tile,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Glyph d={GAMES[p.gi].d} size={17} color={neon} width={1.8} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                      <H size={12.5} numberOfLines={1} style={{ marginRight: 'auto', flexShrink: 1 }}>
                        {p.name}
                      </H>
                      <H size={11.5} color={neon}>
                        {p.rate}
                      </H>
                    </View>
                    <Bar pct={pctOf(p.rate)} fill={neon} style={{ marginTop: 6 }} />
                  </View>
                </View>
              </Glass>
            );
          })}
        </View>

        <Kicker tracking={1.33} style={{ width: '100%', marginTop: 20, marginBottom: 10 }}>
          RECENT
        </Kicker>
        <View style={{ width: '100%', gap: 8 }}>
          {HISTORY.map((h) => (
            <Glass key={h.game + h.when} radius={15} elevated={false}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 13 }}>
                <H size={12.5} numberOfLines={1} style={{ marginRight: 'auto', flexShrink: 1 }}>
                  {h.game}
                </H>
                <P size={10} weight={400} color={t.dim2}>
                  {h.when}
                </P>
                <H size={10} color={t.accLt}>
                  {h.xp}
                </H>
                <View style={{ paddingVertical: 4, paddingHorizontal: 9, borderRadius: 8, backgroundColor: h.bg }}>
                  <H size={9} color={paint(t, h.tint)}>
                    {h.result}
                  </H>
                </View>
              </View>
            </Glass>
          ))}
        </View>
      </ScrollView>
    </FadeIn>
  );
}
