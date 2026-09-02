import { ScrollView, View } from 'react-native';
import { store, type State } from '../store/useStore';
import { BRACKET, ROUND_LABELS } from '../data/progression';
import { useTheme } from '../theme/theme';
import { Chevron, Glass, H, Kicker, P, Tap } from '../components/base';
import { FadeIn } from '../components/GameChrome';

/**
 * The design paints the header's back tile straight in rgba rather than through
 * a token — it reads the same in Day and Night, exactly as in the web build, so
 * it stays literal here. Everything theme-dependent comes from `useTheme()`.
 */
const TINT_14 = 'rgba(150,180,255,0.14)';
const LINE_35 = 'rgba(150,180,255,0.35)';

/** The LIVE pill's wash and hairline — the web writes both as lime literals. */
const LIVE_BG = 'rgba(52,211,166,0.16)';
const LIVE_LINE = 'rgba(52,211,166,0.4)';

/** Whoever has already come through their tie. */
const WINNERS = new Set(['Divya', 'Rohan', 'Meera', 'Arjun']);

/** 21 · Bracket — an eight-player cup, live. */
export default function Bracket({ s }: { s: State }) {
  const t = useTheme();

  return (
    <FadeIn style={{ flex: 1, minHeight: 0, paddingTop: 62 }}>
      {/* header — fixed */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 12 }}>
        <Tap onPress={() => store.go('board')} label="Back">
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

        <View style={{ marginRight: 'auto', flexShrink: 1, minWidth: 0 }}>
          <H size={14.5} numberOfLines={1}>
            Friday Cup
          </H>
          <P size={10.5} weight={400} color={t.dim2} numberOfLines={1} style={{ marginTop: 1 }}>
            8 players · Imposter Quiz
          </P>
        </View>

        <View
          style={{
            paddingVertical: 5,
            paddingHorizontal: 11,
            borderRadius: 8,
            backgroundColor: LIVE_BG,
            borderWidth: 1,
            borderColor: LIVE_LINE,
          }}
        >
          <H size={10} color={t.lime}>
            LIVE
          </H>
        </View>
      </View>

      {/* the three rounds — scrolls */}
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
      >
        {BRACKET.map((round, ri) => (
          <View key={ri} style={{ marginBottom: 18 }}>
            {/* the design tracks these labels at .16em on 9.5px — 1.52 in RN */}
            <Kicker tracking={1.52} style={{ marginBottom: 9 }}>
              {ROUND_LABELS[ri]}
            </Kicker>

            <View style={{ gap: 9 }}>
              {round.map(([a, b], pi) => {
                // your own seat carries whatever name you signed in with
                const top = a === 'Arjun' ? s.myName : a;
                const bottom = b === 'Arjun' ? s.myName : b;
                const mine = a === 'Arjun' || b === 'Arjun';

                return (
                  <Glass key={pi} radius={14} elevated={false}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 9,
                        paddingVertical: 11,
                        paddingHorizontal: 13,
                      }}
                    >
                      <H size={12.5} numberOfLines={1} style={{ marginRight: 'auto', flexShrink: 1 }}>
                        {top}
                      </H>
                      {ri < 2 && WINNERS.has(a) && (
                        <H size={9} color={t.lime}>
                          WON
                        </H>
                      )}
                    </View>

                    <View style={{ height: 1, backgroundColor: t.line }} />

                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 9,
                        paddingVertical: 11,
                        paddingHorizontal: 13,
                      }}
                    >
                      <H size={12.5} color={t.dim} numberOfLines={1} style={{ marginRight: 'auto', flexShrink: 1 }}>
                        {bottom}
                      </H>
                      {mine && (
                        <H size={9} color={t.accLt}>
                          YOUR SIDE
                        </H>
                      )}
                    </View>
                  </Glass>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </FadeIn>
  );
}
