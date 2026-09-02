import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { store, type State } from '../store/useStore';
import { CATEGORIES, CAT_ICON, DIM, GAMES, type Category, type Game } from '../data/games';
import { DIFFICULTIES, MODES, optionsFor } from '../lib/options';
import { useTheme, type Tokens } from '../theme/theme';
import { Chevron, Cta, Glass, Glyph, H, Kicker, P, Switch, Tap, gradStops } from '../components/base';
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

/** The fill behind any selected tile — the design's one literal tint. */
const SELECTED = 'rgba(150,180,255,0.14)';

/** The tick the design drops on a chosen game and on a checked radio. */
const Tick = ({ size = 11, color }: { size?: number; color: string }) => (
  <Glyph d="M5 13l4 4L19 7" size={size} color={color} width={3.6} />
);

/** A labelled −/+ control on a glass row. */
function Stepper({
  name,
  hint,
  value,
  onDec,
  onInc,
}: {
  name: string;
  hint: string;
  value: string;
  onDec: () => void;
  onInc: () => void;
}) {
  const t = useTheme();
  const btn = {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: t.panel2,
    borderWidth: 1,
    borderColor: t.line,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    shadowColor: t.shadowColor,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    shadowOpacity: t.shadowOpacity * 0.6,
    elevation: 3,
  };

  return (
    <Glass radius={18}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11, paddingHorizontal: 14 }}>
        <View style={{ marginRight: 'auto', flexShrink: 1, minWidth: 0 }}>
          <P size={13.5} weight={600} color={t.ink}>
            {name}
          </P>
          <P size={10.5} weight={400} color={t.dim2} style={{ marginTop: 2 }}>
            {hint}
          </P>
        </View>

        <Tap onPress={onDec} label={`Decrease ${name}`}>
          <View style={btn}>
            <H size={18} color={t.ink}>
              –
            </H>
          </View>
        </Tap>

        <H size={15} color={t.accLt} style={{ minWidth: 56, textAlign: 'center' }}>
          {value}
        </H>

        <Tap onPress={onInc} label={`Increase ${name}`}>
          <View style={btn}>
            <H size={18} color={t.ink}>
              +
            </H>
          </View>
        </Tap>
      </View>
    </Glass>
  );
}

/** A glass row carrying a name, a hint and a switch. */
function ToggleRow({ name, hint, on, onToggle }: { name: string; hint: string; on: boolean; onToggle: () => void }) {
  const t = useTheme();
  return (
    <Glass radius={18}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 }}>
        <View style={{ marginRight: 'auto', flexShrink: 1, minWidth: 0 }}>
          <P size={13.5} weight={600} color={t.ink}>
            {name}
          </P>
          <P size={10.5} weight={400} color={t.dim2} style={{ marginTop: 2 }}>
            {hint}
          </P>
        </View>
        <Switch on={on} onPress={onToggle} label={name} />
      </View>
    </Glass>
  );
}

/** One of the three category tiles in step 01. */
function CatTile({ cat, on }: { cat: Category; on: boolean }) {
  const t = useTheme();
  const neon = neonFor(t, cat);

  return (
    <Pressable
      onPress={() => store.setCat(cat)}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={cat}
      style={({ pressed }) => [
        {
          flex: 1,
          paddingVertical: 13,
          paddingHorizontal: 10,
          borderRadius: 18,
          backgroundColor: on ? SELECTED : t.panel,
          borderWidth: 1,
          borderColor: on ? neon : t.line,
          gap: 9,
          alignItems: 'flex-start',
        },
        pressed && { opacity: 0.72 },
      ]}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 12,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <LinearGradient colors={gradStops(DIM[cat])} start={DIM_START} end={DIM_END} style={StyleSheet.absoluteFill} />
        <Glyph d={CAT_ICON[cat]} size={16} color={neon} />
      </View>
      <H size={12.5}>{cat}</H>
    </Pressable>
  );
}

/** One cell of the 2-up game grid in step 02. */
function GameCell({ g, on }: { g: Game; on: boolean }) {
  const t = useTheme();
  const neon = neonFor(t, g.cat);

  return (
    <Pressable
      onPress={() => store.pickGame(g.name)}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={g.name}
      style={({ pressed }) => [
        {
          flex: 1,
          padding: 12,
          borderRadius: 18,
          backgroundColor: on ? SELECTED : t.panel,
          borderWidth: 1,
          borderColor: on ? t.acc : t.line,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        },
        pressed && { opacity: 0.72 },
      ]}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: t.line,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <LinearGradient colors={gradStops(DIM[g.cat])} start={DIM_START} end={DIM_END} style={StyleSheet.absoluteFill} />
        <Glyph d={g.d} size={18} color={neon} width={1.8} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <H size={12} numberOfLines={1}>
          {g.name}
        </H>
        <P size={9.5} weight={400} color={t.dim2} style={{ marginTop: 2 }}>
          {g.players} players
        </P>
      </View>

      {on && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: t.acc,
            alignItems: 'center',
            justifyContent: 'center',
            // `box-shadow: 0 0 10px rgba(150,180,255,.8)` — the glow on the tick.
            shadowColor: t.acc,
            shadowOffset: { width: 0, height: 0 },
            shadowRadius: 10,
            shadowOpacity: 0.8,
            elevation: 6,
          }}
        >
          <Tick color={t.onAcc} />
        </View>
      )}
    </Pressable>
  );
}

/** 06 · Game setup — category, game, who's playing, then per-category options. */
export default function GameSetup({ s }: { s: State }) {
  const t = useTheme();
  const { label, steppers, rules } = optionsFor(s.cat);
  const catGames = GAMES.filter((g) => g.cat === s.cat);
  // CSS grid `1fr 1fr` becomes rows of two, so cells in a row share a height.
  const rows = Array.from({ length: Math.ceil(catGames.length / 2) }, (_, r) => catGames.slice(r * 2, r * 2 + 2));

  return (
    <FadeIn style={{ flex: 1, minHeight: 0, paddingTop: 62 }}>
      {/* header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 14 }}>
        <Tap onPress={store.toHome} label="Back">
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 14,
              backgroundColor: SELECTED,
              borderWidth: 1,
              borderColor: 'rgba(150,180,255,0.35)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Chevron dir="left" size={17} color={t.accLt} />
          </View>
        </Tap>
        <H size={15}>Game setup</H>
      </View>

      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20 }}
      >
        {/* 01 category */}
        <Kicker tracking={1.5} style={{ marginTop: 4, marginBottom: 10 }}>
          01 · CATEGORY
        </Kicker>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {CATEGORIES.map((c) => (
            <CatTile key={c} cat={c} on={s.cat === c} />
          ))}
        </View>

        {/* 02 game */}
        <Kicker tracking={1.5} style={{ marginTop: 20, marginBottom: 10 }}>
          02 · GAME
        </Kicker>
        <View style={{ gap: 9 }}>
          {rows.map((cells, r) => (
            <View key={r} style={{ flexDirection: 'row', gap: 9 }}>
              {cells.map((g) => (
                <GameCell key={g.name} g={g} on={s.game === g.name} />
              ))}
              {cells.length < 2 && <View style={{ flex: 1 }} />}
            </View>
          ))}
        </View>

        {/* 03 who's playing */}
        <Kicker tracking={1.5} style={{ marginTop: 20, marginBottom: 10 }}>
          {"03 · WHO'S PLAYING"}
        </Kicker>
        <View style={{ gap: 8 }} accessibilityRole="radiogroup">
          {MODES.map((m) => {
            const on = s.mode === m.key;
            return (
              <Pressable
                key={m.key}
                onPress={() => store.setMode(m.key)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={m.name}
                style={({ pressed }) => [
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingVertical: 13,
                    paddingHorizontal: 14,
                    borderRadius: 18,
                    backgroundColor: on ? SELECTED : t.panel,
                    borderWidth: 1,
                    borderColor: on ? t.acc : t.line,
                  },
                  pressed && { opacity: 0.72 },
                ]}
              >
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: on ? t.acc : 'transparent',
                    borderWidth: 2,
                    borderColor: on ? t.acc : t.line2,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {on && <Tick color={t.onAcc} />}
                </View>
                <View style={{ flexShrink: 1, minWidth: 0 }}>
                  <H size={13.5}>{m.name}</H>
                  <P size={11} weight={400} color={t.dim2} style={{ marginTop: 2 }}>
                    {m.hint}
                  </P>
                </View>
              </Pressable>
            );
          })}

          {s.mode !== 'friends' && (
            <FadeIn>
              <Glass radius={18}>
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 14 }}
                >
                  <P size={13} weight={600} color={t.ink} style={{ marginRight: 'auto' }}>
                    Bot skill
                  </P>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {DIFFICULTIES.map((d) => {
                      const on = s.diff === d;
                      return (
                        <Pressable
                          key={d}
                          onPress={() => store.setDiff(d)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={d}
                          style={({ pressed }) => [
                            {
                              paddingVertical: 9,
                              paddingHorizontal: 13,
                              borderRadius: 12,
                              backgroundColor: on ? t.acc : 'transparent',
                              borderWidth: 1,
                              borderColor: on ? t.acc : t.line2,
                            },
                            pressed && { opacity: 0.72 },
                          ]}
                        >
                          <H size={11} color={on ? t.onAcc : t.dim}>
                            {d}
                          </H>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </Glass>
            </FadeIn>
          )}
        </View>

        {/* 04 options */}
        <Kicker tracking={1.5} style={{ marginTop: 20, marginBottom: 10 }}>
          {`04 · ${label.toUpperCase()}`}
        </Kicker>
        <View style={{ gap: 9, paddingBottom: 10 }}>
          {steppers.map((sp) => (
            <Stepper
              key={sp.key}
              name={sp.name}
              hint={sp.hint}
              value={sp.fmt(s.opt[sp.key] as number)}
              onDec={() => store.step(sp.key, -sp.step, sp.min, sp.max)}
              onInc={() => store.step(sp.key, sp.step, sp.min, sp.max)}
            />
          ))}
          {rules.map((r) => (
            <ToggleRow key={r.key} name={r.name} hint={r.hint} on={!!s.opt[r.key]} onToggle={() => store.toggleOpt(r.key)} />
          ))}
        </View>
      </ScrollView>

      {/* pinned action */}
      <View style={{ paddingTop: 12, paddingHorizontal: 20, paddingBottom: 4 }}>
        <LinearGradient
          colors={[`${t.bg}00`, t.bg] as [string, string]}
          locations={[0, 0.45]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <Cta label="Create lobby" onPress={store.enterLobby} />
      </View>
    </FadeIn>
  );
}
