import { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Rect } from 'react-native-svg';
import { store } from '../store/useStore';
import { useTheme } from '../theme/theme';
import { ArrowRight, Glass, Glyph, Gradient, H, P, Tap } from '../components/base';
import { FadeIn } from '../components/GameChrome';
import { font } from '../theme/tokens';

/** 02 · Sign in — one field, or a provider. */
export default function SignIn() {
  const t = useTheme();
  const [handle, setHandle] = useState('');
  const go = () => store.go('onboard');

  return (
    <FadeIn style={{ flex: 1, minHeight: 0 }}>
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={{ flexGrow: 1, paddingTop: 82, paddingHorizontal: 26, paddingBottom: 44 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <H size={10} color={t.acc} style={{ letterSpacing: 1.8 }}>
          SIGN IN
        </H>
        <H size={32} style={{ letterSpacing: -0.64, lineHeight: 35, marginTop: 12, marginBottom: 8 }}>
          Welcome back
        </H>
        <P size={14} color={t.dim} style={{ lineHeight: 20, marginBottom: 24, maxWidth: 272 }}>
          One field. Email or phone — we'll work out which and send a code if we need one.
        </P>

        {/* the one field */}
        <Glass radius={18}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, paddingHorizontal: 16 }}>
            <Glyph
              d="M3 8l9 6 9-6"
              size={18}
              color={t.acc}
              width={2}
              extra={<Rect x={2.5} y={5} width={19} height={14} rx={3} fill="none" stroke={t.acc} strokeWidth={2} />}
            />
            <TextInput
              value={handle}
              onChangeText={setHandle}
              placeholder="Email or phone number"
              placeholderTextColor={t.dim2}
              accessibilityLabel="Email or phone number"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={go}
              style={{ flex: 1, padding: 0, color: t.ink, fontFamily: font.body, fontSize: 15 }}
            />
          </View>
        </Glass>

        <Tap onPress={go} label="Continue" style={{ marginTop: 10 }}>
          <Gradient radius={999}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 17, paddingHorizontal: 20 }}>
              <H size={15.5} weight={700} color="#fff" style={{ marginRight: 'auto' }}>
                Continue
              </H>
              <ArrowRight />
            </View>
          </Gradient>
        </Tap>

        {/* or */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 24 }}>
          <View style={{ height: 1, flex: 1, backgroundColor: t.line }} />
          <H size={9} color={t.dim2} style={{ letterSpacing: 1.44 }}>
            OR
          </H>
          <View style={{ height: 1, flex: 1, backgroundColor: t.line }} />
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Tap onPress={go} label="Google" style={{ flex: 1 }}>
            <Glass radius={18}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, padding: 15 }}>
                <LinearGradient
                  colors={[t.g2, t.ink]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ width: 20, height: 20, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}
                >
                  <H size={11} color={t.bg}>
                    G
                  </H>
                </LinearGradient>
                <P size={13.5} weight={600} color={t.ink}>
                  Google
                </P>
              </View>
            </Glass>
          </Tap>

          <Tap onPress={go} label="Phone" style={{ flex: 1 }}>
            <Glass radius={18}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, padding: 15 }}>
                <Glyph
                  d="M11 18.5h2"
                  size={17}
                  color={t.cyan}
                  width={2}
                  extra={<Rect x={6} y={2.5} width={12} height={19} rx={3} fill="none" stroke={t.cyan} strokeWidth={2} />}
                />
                <P size={13.5} weight={600} color={t.ink}>
                  Phone
                </P>
              </View>
            </Glass>
          </Tap>
        </View>

        <View style={{ flex: 1, minHeight: 18 }} />

        <Tap onPress={go} label="Create new account">
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 13,
              padding: 9,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: t.line2,
            }}
          >
            <Gradient radius={14} glow={false} style={{ width: 38, height: 38 }}>
              <View style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}>
                <Glyph d="M12 5v14M5 12h14" size={19} color="#fff" width={2.6} />
              </View>
            </Gradient>
            <H size={14.5}>Create new account</H>
          </View>
        </Tap>
      </ScrollView>
    </FadeIn>
  );
}
