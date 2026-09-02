import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Circle } from 'react-native-svg';
import { store, type State } from '../store/useStore';
import { GRADS, MARKS } from '../data/people';
import { useTheme } from '../theme/theme';
import { font } from '../theme/tokens';
import { ArrowRight, Glass, Glyph, Gradient, H, Kicker, Tap, gradStops } from '../components/base';
import { FadeIn } from '../components/GameChrome';

/** The three-step progress pips; the first two are lit. */
const STEPS = [true, true, false];

/** The marks laid out four to a row, mirroring the web's `repeat(4,1fr)` grid. */
const ROWS = Array.from({ length: Math.ceil(MARKS.length / 4) }, (_, r) => MARKS.slice(r * 4, r * 4 + 4));

/** 03 · Onboarding — name yourself and pick a mark. */
export default function Onboarding({ s }: { s: State }) {
  const t = useTheme();

  return (
    <FadeIn style={{ flex: 1, minHeight: 0, paddingTop: 82, paddingHorizontal: 26, paddingBottom: 44 }}>
      <View style={{ flexDirection: 'row', gap: 5, marginBottom: 22 }}>
        {STEPS.map((on, i) => (
          <View
            key={i}
            style={[
              { height: 4, flex: 1, borderRadius: 999, backgroundColor: on ? t.acc : t.track },
              on && {
                shadowColor: t.acc,
                shadowOffset: { width: 0, height: 0 },
                shadowRadius: 8,
                shadowOpacity: 0.8,
                elevation: 3,
              },
            ]}
          />
        ))}
      </View>

      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <H size={28} style={{ letterSpacing: -0.56, lineHeight: 30.8 }}>
          {'Create your\nplayer card'}
        </H>

        <Glass radius={18} style={{ marginTop: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, paddingHorizontal: 16 }}>
            <Glyph
              d="M4.5 20a7.5 7.5 0 0115 0"
              size={18}
              color={t.acc}
              extra={<Circle cx="12" cy="8" r="3.6" stroke={t.acc} strokeWidth={2} fill="none" />}
            />
            <TextInput
              value={s.myName}
              onChangeText={(v) => store.setName(v)}
              accessibilityLabel="Your name"
              selectionColor={t.acc}
              placeholderTextColor={t.dim2}
              style={{
                flex: 1,
                height: 22,
                padding: 0,
                includeFontPadding: false,
                textAlignVertical: 'center',
                fontFamily: font.bodySb,
                fontSize: 16,
                color: t.ink,
              }}
            />
          </View>
        </Glass>

        <Kicker tracking={1.5} style={{ marginTop: 22, marginBottom: 12 }}>
          CHOOSE A MARK
        </Kicker>

        <View style={{ gap: 11 }}>
          {ROWS.map((cells, r) => (
            <View key={r} style={{ flexDirection: 'row', gap: 11 }}>
              {cells.map((m, c) => {
                const i = r * 4 + c;
                const on = s.mark === i;
                return (
                  <Tap key={m} onPress={() => store.pickMark(i)} label={`Mark ${i + 1}`} style={{ flex: 1 }}>
                    <Gradient colors={gradStops(GRADS[i % GRADS.length])} radius={18} glow={on}>
                      <View style={{ aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }}>
                        <H size={21} color="#fff">
                          {m}
                        </H>
                      </View>
                      {on && (
                        <View
                          pointerEvents="none"
                          style={[StyleSheet.absoluteFill, { borderRadius: 18, borderWidth: 2, borderColor: t.acc }]}
                        />
                      )}
                    </Gradient>
                  </Tap>
                );
              })}
              {cells.length < 4 &&
                Array.from({ length: 4 - cells.length }, (_, p) => <View key={`pad${p}`} style={{ flex: 1 }} />)}
            </View>
          ))}
        </View>

        <View style={{ flex: 1, minHeight: 18 }} />
      </ScrollView>

      <Tap onPress={() => store.go('home')} label="Enter Loophole">
        <Gradient radius={999}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 18, paddingHorizontal: 22 }}>
            <H size={15.5} weight={700} color="#fff" style={{ marginRight: 'auto' }}>
              Enter Loophole
            </H>
            <ArrowRight />
          </View>
        </Gradient>
      </Tap>
    </FadeIn>
  );
}
