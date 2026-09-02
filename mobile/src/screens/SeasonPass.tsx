import { ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { store, type State } from '../store/useStore';
import { SEASON } from '../data/progression';
import { useTheme } from '../theme/theme';
import { Chevron, Glass, Glyph, Gradient, H, Kicker, P, Tap } from '../components/base';
import { FadeIn } from '../components/GameChrome';

/**
 * The design paints the header's back tile straight in rgba rather than through
 * a token — it reads the same in Day and Night, exactly as in the web build, so
 * it stays literal here. Everything theme-dependent comes from `useTheme()`.
 */
const TINT_14 = 'rgba(150,180,255,0.14)';
const LINE_35 = 'rgba(150,180,255,0.35)';

/**
 * The banner sits on the indigo gradient in both themes, so its ink, its grid
 * and its progress track are white literals in the web build too.
 */
const ON_BANNER = '#fff';
const GRID_LINE = 'rgba(255,255,255,0.07)';
const BANNER_TRACK = 'rgba(255,255,255,0.22)';

/** The shop tile's `linear-gradient(160deg,…)`, written as a literal in the design. */
const SHOP_TILE = ['rgba(139,164,255,0.4)', 'rgba(139,164,255,0.12)'] as [string, string];
const DIM_START = { x: 0.33, y: 0.03 };
const DIM_END = { x: 0.67, y: 0.97 };

/**
 * The banner's graph paper. CSS drew it with two repeating linear-gradients on
 * an 18px tile; RN has no repeating background, so the lines are laid out
 * explicitly and over-drawn past the banner, which clips them.
 */
const GRID = 18;
const COLS = Array.from({ length: 23 }, (_, i) => i * GRID);
const ROWS = Array.from({ length: 11 }, (_, i) => i * GRID);

function GridOverlay() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {ROWS.map((y) => (
        <View key={`h${y}`} style={{ position: 'absolute', left: 0, right: 0, top: y, height: 1, backgroundColor: GRID_LINE }} />
      ))}
      {COLS.map((x) => (
        <View key={`v${x}`} style={{ position: 'absolute', top: 0, bottom: 0, left: x, width: 1, backgroundColor: GRID_LINE }} />
      ))}
    </View>
  );
}

/** 19 · Season pass — the reward track you claim from. */
export default function SeasonPass({ s }: { s: State }) {
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
              borderRadius: 11,
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
        <H size={15} style={{ marginRight: 'auto' }}>
          Season 2
        </H>
        <H size={10} weight={700} color={t.dim2} numberOfLines={1}>
          18 days left
        </H>
      </View>

      {/* the season banner — also fixed, above the scrolling track */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
        <Gradient radius={18}>
          <GridOverlay />
          <View style={{ padding: 18 }}>
            <Kicker tracking={1.52} color={ON_BANNER} style={{ opacity: 0.85 }}>
              GLASSHOUSE
            </Kicker>
            <H size={27} color={ON_BANNER} style={{ letterSpacing: -0.54, lineHeight: 27, marginTop: 9, marginBottom: 6 }}>
              Level 24
            </H>
            <P size={12} weight={400} color={ON_BANNER} style={{ opacity: 0.9 }}>
              12,450 / 15,000 XP
            </P>
            <View style={{ height: 7, borderRadius: 999, backgroundColor: BANNER_TRACK, marginTop: 12, overflow: 'hidden' }}>
              <View style={{ width: '68%', height: '100%', borderRadius: 999, backgroundColor: ON_BANNER }} />
            </View>
          </View>
        </Gradient>
      </View>

      {/* the reward track — scrolls */}
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
      >
        <Kicker tracking={1.33} style={{ marginTop: 2, marginBottom: 10 }}>
          REWARD TRACK
        </Kicker>

        <View style={{ gap: 9 }}>
          {SEASON.map((tier) => {
            const claimed = s.claimed.includes(tier.lvl);
            const state = claimed ? 'claimed' : tier.state;
            const label = claimed ? 'CLAIMED' : state === 'claim' ? 'CLAIM' : state === 'unlocked' ? 'OWNED' : `LVL ${tier.lvl}`;
            // the web sets one `color` on the button and lets the name and the
            // badge inherit it; RN has no inheritance, so it is passed to both
            const ink = state === 'locked' ? t.dim2 : t.ink;

            const inner = (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 12,
                  paddingHorizontal: 13,
                }}
              >
                <View
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 13,
                    backgroundColor: t.tile,
                    borderWidth: 1,
                    borderColor: t.line,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <H size={10} color={t.dim}>{`LVL ${tier.lvl}`}</H>
                </View>

                <View style={{ marginRight: 'auto', flexShrink: 1, minWidth: 0 }}>
                  <H size={13.5} color={ink}>
                    {tier.name}
                  </H>
                  <P size={11} weight={400} color={t.dim2} style={{ marginTop: 2 }}>
                    Season reward
                  </P>
                </View>

                <View
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    borderRadius: 9,
                    backgroundColor: t.tile,
                    borderWidth: 1,
                    borderColor: t.line,
                  }}
                >
                  <H size={10} color={ink} numberOfLines={1}>
                    {label}
                  </H>
                </View>
              </View>
            );

            return (
              <Tap key={tier.lvl} onPress={() => store.claimTier(tier.lvl, tier.name, tier.state)} label={tier.name}>
                {/* the claimable tier is the only row painted in indigo glass; the
                    web gave it `--spec` and no drop shadow, so the glow is off */}
                {state === 'claim' ? (
                  <Gradient radius={16} glow={false}>
                    {inner}
                  </Gradient>
                ) : (
                  <Glass radius={16} elevated={false}>
                    {inner}
                  </Glass>
                )}
              </Tap>
            );
          })}
        </View>

        <Tap onPress={() => store.go('shop')} label="Tint shop" style={{ marginTop: 14 }}>
          <Glass radius={14} elevated={false} borderColor={t.line2}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 16 }}>
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 11,
                  overflow: 'hidden',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <LinearGradient colors={SHOP_TILE} start={DIM_START} end={DIM_END} style={StyleSheet.absoluteFill} />
                <Glyph d="M4 7h16l-1.5 12H5.5zM9 7a3 3 0 016 0" size={17} color={t.acc} />
              </View>
              <View style={{ marginRight: 'auto', flexShrink: 1, minWidth: 0 }}>
                <H size={13}>Tint shop</H>
                <P size={10.5} weight={400} color={t.dim2} style={{ marginTop: 2 }}>
                  Spend XP on avatar glass
                </P>
              </View>
              <Chevron size={16} color={t.acc} />
            </View>
          </Glass>
        </Tap>
      </ScrollView>
    </FadeIn>
  );
}
