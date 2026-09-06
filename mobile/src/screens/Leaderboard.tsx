import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { store, type State } from '../store/useStore';
import { MARKS, PODIUM, RANKS, grad, type PodiumEntry } from '../data/people';
import { TINTS } from '../data/progression';
import { useTheme, type Tokens } from '../theme/theme';
import { bloom } from '../theme/tokens';
import { Avatar, Bar, Chevron, Glass, Glyph, H, Kicker, P, Tap } from '../components/base';
import { barFor, commas, podium as podiumOf, restOf, type BoardRow } from '../social/scores';
import { FadeIn } from '../components/GameChrome';

const SCOPES: State['scope'][] = ['Global', 'Friends', 'Region'];

/**
 * Region is a fixture-only scope.
 *
 * Nobody's region is collected anywhere, so a live board cannot answer it, and
 * a tab that quietly shows the global list under another name is worse than one
 * that is not there.
 */
const LIVE_SCOPES: State['scope'][] = ['Global', 'Friends'];

/** "1st", "2nd", "3rd" — the badge on a podium step. */
const ordinal = (n: number): string => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};

/** The three podium colours, by place. */
const PODIUM_NEON = ['var(--gold)', 'var(--cyan)', 'var(--pink)'];

/** One row, from either source — the fixtures or the real board. */
interface Row {
  key: string;
  place: number;
  name: string;
  mark: string;
  /** Index into the avatar palette. */
  gi: number;
  pts: string;
  /** How far through the current level, 0–1. */
  bar: number;
  neon: string;
  /** Absent for a fixture row, which is also how a tap knows not to navigate. */
  uid?: string;
}

const fromBoard = (r: BoardRow): Row => ({
  key: r.uid,
  uid: r.uid,
  place: r.place,
  name: r.name,
  mark: r.mark,
  gi: r.gi,
  pts: commas(r.xp),
  bar: barFor(r),
  neon: PODIUM_NEON[r.place - 1] ?? 'var(--acc)',
});

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
function PodiumStep({ p }: { p: Row }) {
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
        <Avatar mark={p.mark} grad={grad(p.gi)} size={ring - 11} fontSize={18} />
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
            {ordinal(p.place)}
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
  const { live, board, myRow, boardLoading } = s.social;

  /**
   * Live or fixtures, in one shape.
   *
   * The fixture podium and ladder are two differently-shaped arrays; the real
   * board is one ordered list. Both become `Row[]` here so everything below
   * renders once rather than twice.
   */
  const rows: Row[] = live
    ? board.map(fromBoard)
    : [
        ...PODIUM.slice().sort((a, b) => a.place - b.place),
        ...RANKS.map((r) => ({ ...r, place: r.n, mark: r.mark, name: r.name })),
      ].map((r: any, i) => ({
        key: r.name,
        place: r.place ?? i + 1,
        name: r.name,
        mark: r.mark,
        gi: (r.place ?? i + 1) + 1,
        pts: r.pts,
        bar: r.bar ? pctOf(r.bar) : 1 - i * 0.06,
        neon: r.neon ?? PODIUM_NEON[i] ?? 'var(--acc)',
      }));

  const top = podiumOf(rows as never) as unknown as Row[];
  const ladder = restOf(rows as never) as unknown as Row[];
  const scopes = live ? LIVE_SCOPES : SCOPES;
  const you = live ? (myRow ? fromBoard(myRow) : null) : null;

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
        {scopes.map((n) => {
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
        {top.map((p) => (
          <PodiumStep key={p.key} p={p} />
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
        {live && !board.length && !boardLoading && (
          <View style={{ alignItems: 'center', gap: 10, paddingVertical: 44, paddingHorizontal: 20 }}>
            <H size={15}>Nobody has scored yet</H>
            {/* Says what actually counts, since a bot game not appearing here
                otherwise reads as the board being broken. */}
            <P size={12.5} weight={400} color={t.dim} style={{ maxWidth: 240, textAlign: 'center', lineHeight: 17.5 }}>
              Matches against a friend are what count. Open a room, play one, and
              you will both be on here.
            </P>
          </View>
        )}

        <View style={{ gap: 7 }}>
          {ladder.map((r) => (
            <Tap key={r.key} onPress={() => store.openPlayer(r.name)} label={r.name}>
              <Glass radius={15} elevated={false}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12 }}>
                  <H size={11} color={t.dim2} style={{ minWidth: 13 }}>
                    {r.place}
                  </H>
                  <Avatar mark={r.mark} grad={grad(r.gi)} size={32} fontSize={12} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                      <H size={12} numberOfLines={1} style={{ marginRight: 'auto' }}>
                        {r.name}
                      </H>
                      <H size={10} weight={700} color={t.accLt} numberOfLines={1}>
                        {r.pts} XP
                      </H>
                    </View>
                    <XpBar pct={r.bar} />
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
            {you ? you.place : 12}
          </H>
          <Avatar mark={MARKS[s.mark]} grad={TINTS[s.tint].grad} size={32} fontSize={12} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <H size={12} style={{ marginRight: 'auto' }}>
                You
              </H>
              <H size={9} weight={700} color={t.lime} numberOfLines={1}>
                {/* The real one says where you are; the fixture keeps its
                    original copy, which was never about a real total. */}
                {you ? `${you.pts} XP` : 'LEVEL UP SOON'}
              </H>
            </View>
            <Bar pct={you ? you.bar : 0.68} fill={t.lime} height={4} style={{ marginTop: 6 }} />
          </View>
        </View>
      </View>
    </FadeIn>
  );
}
