import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { store, type State } from '../store/useStore';
import { MARKS, PODIUM, RANKS, grad, type PodiumEntry } from '../data/people';
import { TINTS } from '../data/progression';
import { useTheme, type Tokens } from '../theme/theme';
import { bloom } from '../theme/tokens';
import { Avatar, Bar, Chevron, Glass, Glyph, H, Kicker, P, Tap } from '../components/base';
import { FadeIn } from '../components/GameChrome';

const SCOPES: State['scope'][] = ['Global', 'Friends', 'Region'];

/** The design's fixed accent wash — the tinted square behind the back chevron. */
const TINT = 'rgba(150,180,255,0.14)';
const TINT_LINE = 'rgba(150,180,255,0.35)';
/** Your own row is painted with the same literal, one step brighter… */
const YOU_FILL = 'rgba(150,180,255,0.16)';
/** …and lit by a `0 0 22px rgba(150,180,255,.3)` bloom, as the four shadow props. */
const YOU_GLOW = 'rgb(150,180,255)';

/** `PODIUM` carries its tier colours as CSS custom properties; resolve them off the palette. */
function paint(t: Tokens, css: string): string {
  const m = /^var\(--([A-Za-z0-9]+)\)$/.exec(css);
  if (!m) return css;
  const v = t[m[1] as keyof Tokens];
  return typeof v === 'string' ? v : t.ink;
}

/** The rank fixtures carry percentage strings; a track wants a 0–1 fraction. */
const pctOf = (bar: string): number => parseFloat(bar) / 100;

/** `linear-gradient(160deg,…)`, as the start/end fractions expo-linear-gradient wants. */
const G_START = { x: 0.33, y: 0.03 };
const G_END = { x: 0.67, y: 0.97 };

/**
 * The XP track. `Bar` fills with a flat colour; these rows fill with the indigo
 * glass gradient, so the track is rebuilt here around a `LinearGradient`. The
 * fill's `0 0 8px` glow is clipped by the track's own overflow, in CSS as here.
 */
function XpBar({ pct }: { pct: number }) {
  const t = useTheme();
  return (
    <View style={{ height: 4, borderRadius: 999, backgroundColor: t.track, overflow: 'hidden', marginTop: 6 }}>
      <View style={{ width: `${Math.max(0, Math.min(1, pct)) * 100}%`, height: '100%' }}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: t.accFill }]} />
      </View>
    </View>
  );
}

/** One podium step: a tier-coloured ring, the player's disc, and a place badge. */
function PodiumStep({ p }: { p: PodiumEntry }) {
  const t = useTheme();
  const neon = paint(t, p.neon);
  const ring = p.place === 1 ? 72 : 58;

  return (
    <Tap
      onPress={() => store.openPlayer(p.name)}
      label={p.name}
      style={{ alignItems: 'center', gap: 6, marginBottom: p.place === 1 ? 18 : 0 }}
    >
      <View style={{ width: ring, height: ring, alignItems: 'center', justifyContent: 'center' }}>
        {/* the tier ring — a 2px rim with an 18px bloom of the same colour */}
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: ring / 2,
            borderWidth: 2,
            borderColor: neon,
            ...bloom(neon, 18, 0.8),
          }}
        />
        {/* `calc(100% - 11px)` — the disc sits 5.5px inside the rim */}
        <Avatar mark={p.mark} grad={grad(p.place + 1)} size={ring - 11} fontSize={18} />
        <View
          style={{
            position: 'absolute',
            bottom: -8,
            paddingVertical: 3,
            paddingHorizontal: 8,
            borderRadius: 7,
            backgroundColor: neon,
          }}
        >
          <H size={8.5} color={t.onAcc}>
            {p.rank}
          </H>
        </View>
      </View>
      <H size={11.5} style={{ marginTop: 6 }}>
        {p.name}
      </H>
      <P size={9.5} weight={400} color={t.dim2} numberOfLines={1}>
        {p.pts} XP
      </P>
    </Tap>
  );
}

/** 13 · Leaderboard — podium, ranked rows, and a sticky "you". */
export default function Leaderboard({ s }: { s: State }) {
  const t = useTheme();

  return (
    <FadeIn style={{ flex: 1, minHeight: 0, paddingTop: 62 }}>
      {/* header — fixed */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 12 }}>
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
        <H size={15} style={{ marginRight: 'auto' }}>
          Rankings
        </H>
{/* the cup opens the tournament bracket */}
        <Tap onPress={() => store.go('bracket')} label="Friday Cup bracket">
          <Glyph d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0z" size={19} color={t.gold} glow={t.gold} />
        </Tap>
      </View>

      {/* scope */}
      <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 20, paddingBottom: 16 }}>
        {SCOPES.map((n) => {
          const on = s.scope === n;
          return (
            <Pressable
              key={n}
              onPress={() => store.setScope(n)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={n}
              style={({ pressed }) => [
                {
                  flex: 1,
                  paddingVertical: 9,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: on ? t.acc : t.line2,
                  backgroundColor: on ? t.acc : 'transparent',
                  alignItems: 'center',
                },
                pressed && { opacity: 0.72 },
              ]}
            >
              <H size={11.5} weight={700} color={on ? t.onAcc : t.dim}>
                {n}
              </H>
            </Pressable>
          );
        })}
      </View>

      {/* podium — 2nd, 1st (lifted 18px), 3rd */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          justifyContent: 'center',
          gap: 16,
          paddingHorizontal: 20,
          paddingBottom: 18,
        }}
      >
        {PODIUM.map((p) => (
          <PodiumStep key={p.name} p={p} />
        ))}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 10 }}>
        <Kicker color={t.dim2} tracking={1.52} style={{ marginRight: 'auto' }}>
          TOP PERFORMERS
        </Kicker>
        <Glyph d="M4 6h16M4 12h10M4 18h6" size={15} color={t.dim2} />
      </View>

      {/* the ladder — scrolls */}
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20 }}
      >
        <View style={{ gap: 7 }}>
          {RANKS.map((r) => (
            <Tap key={r.name} onPress={() => store.openPlayer(r.name)} label={r.name}>
              <Glass radius={15} elevated={false}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12 }}>
                  <H size={11} color={t.dim2} style={{ minWidth: 13 }}>
                    {r.n}
                  </H>
                  <Avatar mark={r.mark} grad={grad(r.n)} size={32} fontSize={12} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                      <H size={12} numberOfLines={1} style={{ marginRight: 'auto' }}>
                        {r.name}
                      </H>
                      <H size={10} weight={700} color={t.accLt} numberOfLines={1}>
                        {r.pts} XP
                      </H>
                    </View>
                    <XpBar pct={pctOf(r.bar)} />
                  </View>
                </View>
              </Glass>
            </Tap>
          ))}
        </View>
      </ScrollView>

      {/* your standing, pinned */}
      <View style={{ paddingTop: 12, paddingHorizontal: 20 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingVertical: 11,
            paddingHorizontal: 12,
            borderRadius: 15,
            backgroundColor: YOU_FILL,
            borderWidth: 1,
            borderColor: t.acc,
            ...bloom(YOU_GLOW, 22, 0.3),
          }}
        >
          <H size={11} color={t.accLt} style={{ minWidth: 13 }}>
            12
          </H>
          <Avatar mark={MARKS[s.mark]} grad={TINTS[s.tint].grad} size={32} fontSize={12} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <H size={12} style={{ marginRight: 'auto' }}>
                You
              </H>
              <H size={9} weight={700} color={t.lime} numberOfLines={1}>
                LEVEL UP SOON
              </H>
            </View>
            <Bar pct={0.68} fill={t.lime} height={4} style={{ marginTop: 6 }} />
          </View>
        </View>
      </View>
    </FadeIn>
  );
}
