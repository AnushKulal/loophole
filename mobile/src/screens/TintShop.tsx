import { ScrollView, View } from 'react-native';
import { store, type State } from '../store/useStore';
import { TINTS, type Tint } from '../data/progression';
import { MARKS } from '../data/people';
import { useTheme } from '../theme/theme';
import { Avatar, Chevron, Glass, Gradient, H, P, Tap, gradStops } from '../components/base';
import { FadeIn } from '../components/GameChrome';

/**
 * The design paints the header's back tile straight in rgba rather than through
 * a token — it is the same in Day and Night, exactly as in the web build, so it
 * stays literal here. Everything theme-dependent comes from `useTheme()`.
 */
const TINT_14 = 'rgba(150,180,255,0.14)';
const LINE_35 = 'rgba(150,180,255,0.35)';

/** The tints two to a row, mirroring the web's `1fr 1fr` grid. */
const ROWS: Tint[][] = Array.from({ length: Math.ceil(TINTS.length / 2) }, (_, r) => TINTS.slice(r * 2, r * 2 + 2));

/**
 * A tint swatch. The web draws it as a circle carrying two shadows: an inset
 * specular rim and a drop shadow. RN has no inset shadow, so the rim comes from
 * `<Gradient>` — which paints exactly that highlight along its top edge — and
 * the drop shadow sits on the wrapper, where the matching radius keeps it round.
 */
function Swatch({ grad, size }: { grad: string; size: number }) {
  const t = useTheme();
  const r = size / 2;
  return (
    <View
      style={{
        borderRadius: r,
        shadowColor: t.shadowColor,
        shadowOffset: { width: 0, height: 6 },
        shadowRadius: 14,
        shadowOpacity: 0.4,
        elevation: 5,
      }}
    >
      <Gradient colors={gradStops(grad)} radius={r} glow={false}>
        <View style={{ width: size, height: size }} />
      </Gradient>
    </View>
  );
}

/** 20 · Tint shop — equipping actually changes your avatar everywhere. */
export default function TintShop({ s }: { s: State }) {
  const t = useTheme();

  return (
    <FadeIn style={{ flex: 1, minHeight: 0, paddingTop: 62 }}>
      {/* header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 12 }}>
        <Tap onPress={() => store.go('season')} label="Back">
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
          Tint shop
        </H>
        <View
          style={{
            paddingVertical: 5,
            paddingHorizontal: 11,
            borderRadius: 8,
            backgroundColor: t.tile,
            borderWidth: 1,
            borderColor: t.line,
          }}
        >
          <H size={10.5} color={t.accLt} numberOfLines={1}>
            12,450 XP
          </H>
        </View>
      </View>

      {/* live preview — the equipped tint, on your own mark */}
      <View style={{ alignItems: 'center', gap: 10, paddingTop: 6, paddingHorizontal: 20, paddingBottom: 16 }}>
        <View
          style={{
            borderRadius: 41,
            shadowColor: t.shadowColor,
            shadowOffset: { width: 0, height: 12 },
            shadowRadius: 28,
            shadowOpacity: 0.5,
            elevation: 8,
          }}
        >
          <Avatar mark={MARKS[s.mark]} grad={TINTS[s.tint].grad} size={82} fontSize={32} />
        </View>
        <P size={11.5} weight={400} color={t.dim}>
          Live preview · tap a tint to equip
        </P>
      </View>

      {/* the shop grid — scrolls */}
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
      >
        <View style={{ gap: 10 }}>
          {ROWS.map((cells, r) => (
            <View key={r} style={{ flexDirection: 'row', gap: 10 }}>
              {cells.map((tint, c) => {
                const i = r * 2 + c;
                const on = s.tint === i;
                return (
                  <Tap
                    key={tint.name}
                    onPress={() => store.equipTint(i)}
                    label={tint.name}
                    style={[
                      { flex: 1 },
                      on && {
                        // the equipped tile's `0 0 18px` bloom, as the four RN shadow props
                        borderRadius: 16,
                        shadowColor: t.acc,
                        shadowOffset: { width: 0, height: 0 },
                        shadowRadius: 18,
                        shadowOpacity: 0.6,
                        elevation: 7,
                      },
                    ]}
                  >
                    <Glass radius={16} elevated={false} borderColor={on ? t.acc : t.line}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13 }}>
                        <Swatch grad={tint.grad} size={40} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <H size={12.5} numberOfLines={1}>
                            {tint.name}
                          </H>
                          <P size={10} weight={400} color={t.dim2} numberOfLines={1} style={{ marginTop: 2 }}>
                            {tint.cost ? `${tint.cost} XP` : 'Owned'}
                          </P>
                        </View>
                      </View>
                    </Glass>
                  </Tap>
                );
              })}
              {cells.length < 2 && <View style={{ flex: 1 }} />}
            </View>
          ))}
        </View>
      </ScrollView>
    </FadeIn>
  );
}
