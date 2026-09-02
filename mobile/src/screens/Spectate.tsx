import { useEffect, useRef } from 'react';
import { Animated, Easing, ScrollView, View } from 'react-native';
import { store } from '../store/useStore';
import { ANSWERS, OTHERS, grad } from '../data/people';
import { useTheme } from '../theme/theme';
import { Avatar, Chevron, Glass, Glyph, H, Kicker, P, Tap } from '../components/base';
import { FadeIn } from '../components/GameChrome';

/**
 * The design paints the back tile and the viewer pill straight in rgba rather
 * than through a token — they read the same in Day and Night, exactly as in the
 * web build, so they stay literal here. Everything else comes from `useTheme()`.
 */
const TINT_14 = 'rgba(150,180,255,0.14)';
const LINE_35 = 'rgba(150,180,255,0.35)';
const PINK_16 = 'rgba(244,144,192,0.16)';
const PINK_40 = 'rgba(244,144,192,0.4)';

/** The `vPulse` dot in the viewer-count pill — 1.2s, opacity 1 → .45 → 1. */
function ViewerDot() {
  const t = useTheme();
  const v = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.45, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(v, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);

  return <Animated.View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.pink, opacity: v }} />;
}

/** 22 · Spectate — watch a table, answers landing live. */
export default function Spectate() {
  const t = useTheme();

  return (
    <FadeIn style={{ flex: 1, minHeight: 0, paddingTop: 62, paddingBottom: 34 }}>
      {/* header — fixed */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 14 }}>
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

        <View style={{ marginRight: 'auto', flexShrink: 1, minWidth: 0 }}>
          <H size={14.5} numberOfLines={1}>
            {"Divya's table"}
          </H>
          <P size={10.5} weight={400} color={t.dim2} numberOfLines={1} style={{ marginTop: 1 }}>
            Imposter Quiz · round 2
          </P>
        </View>

        <View
          accessible
          accessibilityLabel="38 watching"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingVertical: 6,
            paddingHorizontal: 11,
            borderRadius: 999,
            backgroundColor: PINK_16,
            borderWidth: 1,
            borderColor: PINK_40,
          }}
        >
          <ViewerDot />
          <H size={10} color={t.pink}>
            38
          </H>
        </View>
      </View>

      {/* the question — fixed */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 14 }}>
        <Glass radius={18}>
          <View style={{ padding: 16 }}>
            <Kicker tracking={1.33} style={{ marginBottom: 8 }}>
              THE QUESTION
            </Kicker>
            {/* 22px at 1.15 leading and -.02em tracking, both converted to px */}
            <H size={22} style={{ letterSpacing: -0.44, lineHeight: 25.3 }}>
              Name a fruit that is green.
            </H>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <Glyph
                d="M3 3l18 18M10.6 10.7a2 2 0 002.8 2.8M6.1 6.3C4 7.7 2 12 2 12s3.5 6 10 6c1.6 0 3-.4 4.2-1"
                size={14}
                width={2.2}
                color={t.dim}
              />
              {/* the browser gave this its default 1.4 leading; RN needs it in pixels */}
              <P size={11.5} color={t.dim} style={{ flex: 1, lineHeight: 16 }}>
                {"One player's question is different — you can't see whose"}
              </P>
            </View>
          </View>
        </Glass>
      </View>

      {/* answers — the only scrolling region */}
      <ScrollView style={{ flex: 1, minHeight: 0 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }}>
        <Kicker tracking={1.33} style={{ marginBottom: 10 }}>
          ANSWERS AS THEY LAND
        </Kicker>
        <View style={{ gap: 8 }}>
          {OTHERS.map((p, i) => (
            <Glass key={p.name} radius={14} elevated={false}>
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11, paddingHorizontal: 13 }}
              >
                <Avatar mark={p.mark} grad={grad(p.gi)} size={34} fontSize={13} />
                <P size={11.5} color={t.dim} numberOfLines={1} style={{ marginRight: 'auto', flexShrink: 1 }}>
                  {p.name}
                </P>
                <H size={15}>{ANSWERS[i][1]}</H>
              </View>
            </Glass>
          ))}
        </View>
      </ScrollView>

      {/* join request — fixed */}
      <View style={{ paddingTop: 14, paddingHorizontal: 20 }}>
        <Tap onPress={store.enterLobby} label="Ask to join next round">
          <Glass radius={999} borderColor={t.line2}>
            <View style={{ padding: 16, alignItems: 'center' }}>
              <H size={14}>Ask to join next round</H>
            </View>
          </Glass>
        </Tap>
      </View>
    </FadeIn>
  );
}
