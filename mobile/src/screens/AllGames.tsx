import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { store, type State } from '../store/useStore';
import { CATEGORIES, DIM, GAMES, GAME_LEVEL, GAME_XP, type Category, type Game } from '../data/games';
import { useTheme, type Tokens } from '../theme/theme';
import { Bar, Chevron, Glass, Glyph, H, P, Tap, gradStops } from '../components/base';
import { FadeIn } from '../components/GameChrome';

/**
 * The fixture data carries `NEON` as CSS custom properties, which RN cannot
 * resolve — the same three category accents come off the theme instead.
 */
const neonFor = (t: Tokens, cat: Category): string =>
  cat === 'Deduction' ? t.acc : cat === 'Board' ? t.cyan : t.lime;

/** `DIM` is a `linear-gradient(160deg,…)` string; 160° as start/end fractions. */
const DIM_START = { x: 0.33, y: 0.03 };
const DIM_END = { x: 0.67, y: 0.97 };

/** The XP fixtures are percentage strings; `Bar` wants a 0–1 fraction. */
const xpOf = (name: string): number => parseFloat(GAME_XP[name] ?? '12%') / 100;

/** One library tile: glyph plaque, title, players, level and an XP bar. */
function GameTile({ g }: { g: Game }) {
  const t = useTheme();
  const neon = neonFor(t, g.cat);

  return (
    <Tap onPress={() => store.pickGame(g.name)} label={g.name} style={{ flex: 1 }}>
      <Glass radius={18}>
        <View style={{ padding: 13, gap: 11 }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 15,
              borderWidth: 1,
              borderColor: t.line,
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
            {/* CSS lit the glyph with a drop-shadow filter; RN has none,
                so the bloom is a shaped shadow on the wrapper. */}
            <View style={{ shadowColor: neon, shadowOffset: { width: 0, height: 0 }, shadowRadius: 6, shadowOpacity: 0.9 }}>
              <Glyph d={g.d} size={21} color={neon} width={1.8} />
            </View>
          </View>

          <View style={{ minWidth: 0 }}>
            <H size={12.5} numberOfLines={1}>
              {g.name}
            </H>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <P size={9.5} weight={400} color={t.dim2} style={{ marginRight: 'auto' }}>
                {g.players} players
              </P>
              <H size={8.5} color={neon}>
                {GAME_LEVEL[g.name] ?? 'LVL 1'}
              </H>
            </View>
            <Bar pct={xpOf(g.name)} fill={neon} height={3} style={{ marginTop: 7 }} />
          </View>
        </View>
      </Glass>
    </Tap>
  );
}

/** 05 · All games — the full library behind category filters. */
export default function AllGames({ s }: { s: State }) {
  const t = useTheme();
  const filters: ('All' | Category)[] = ['All', ...CATEGORIES];
  const list = s.libCat === 'All' ? GAMES : GAMES.filter((g) => g.cat === s.libCat);
  const label = s.libCat === 'All' ? '14 titles' : `${s.libCat} · ${list.length}`;
  // CSS grid `1fr 1fr` becomes rows of two, so tiles in a row share a height.
  const rows = Array.from({ length: Math.ceil(list.length / 2) }, (_, r) => list.slice(r * 2, r * 2 + 2));

  return (
    <FadeIn style={{ flex: 1, minHeight: 0, paddingTop: 62, paddingBottom: 6 }}>
      {/* header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 14 }}>
        <Tap onPress={store.toHome} label="Back">
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 14,
              backgroundColor: 'rgba(150,180,255,0.14)',
              borderWidth: 1,
              borderColor: 'rgba(150,180,255,0.35)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Chevron dir="left" size={17} color={t.accLt} />
          </View>
        </Tap>
        <H size={15} style={{ marginRight: 'auto' }}>
          All games
        </H>
        <H size={10} weight={700} color={t.dim2} numberOfLines={1}>
          {label}
        </H>
      </View>

      {/* category rail */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, marginBottom: 14 }}
        contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20 }}
      >
        {filters.map((c) => {
          const on = s.libCat === c;
          const count = c === 'All' ? 14 : GAMES.filter((g) => g.cat === c).length;
          return (
            <Pressable
              key={c}
              onPress={() => store.setLibCat(c)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={c}
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: on ? t.acc : t.line2,
                  backgroundColor: on ? t.acc : 'transparent',
                },
                pressed && { opacity: 0.72 },
              ]}
            >
              <H size={11.5} weight={700} color={on ? t.onAcc : t.dim}>
                {c}
              </H>
              <H size={9.5} weight={700} color={on ? t.onAcc : t.dim} style={{ opacity: 0.7 }}>
                {count}
              </H>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* the library */}
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
      >
        <View style={{ gap: 10 }}>
          {rows.map((cells, r) => (
            <View key={r} style={{ flexDirection: 'row', gap: 10 }}>
              {cells.map((g) => (
                <GameTile key={g.name} g={g} />
              ))}
              {cells.length < 2 && <View style={{ flex: 1 }} />}
            </View>
          ))}
        </View>
      </ScrollView>
    </FadeIn>
  );
}
