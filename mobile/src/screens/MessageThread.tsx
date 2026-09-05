import { useEffect, useRef } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { store, type State } from '../store/useStore';
import { FRIENDS, GRADV, grad } from '../data/people';
import { useTheme } from '../theme/theme';
import { Avatar, Chevron, Glass, Glyph, Gradient, H, P, Tap } from '../components/base';
import { FadeIn } from '../components/GameChrome';
import { font } from '../theme/tokens';

const QUICK = ['Join my lobby', 'One more?', 'Code incoming'];

/**
 * The design paints these three tints straight in rgba rather than through a
 * token — they are identical in Day and Night, exactly as in the web build.
 */
const TINT_14 = 'rgba(150,180,255,0.14)';
const LINE_30 = 'rgba(150,180,255,0.3)';
const LINE_35 = 'rgba(150,180,255,0.35)';

/** `linear-gradient(160deg,…)`, as the start/end fractions expo-linear-gradient wants. */
const G_START = { x: 0.33, y: 0.03 };
const G_END = { x: 0.67, y: 0.97 };

/** One dot of the typing indicator — the `vDots` keyframe, 1s, staggered. */
function Dot({ delay }: { delay: number }) {
  const t = useTheme();
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    // A `delay` inside the sequence would stretch every cycle; the CSS offsets
    // the phase once, so the start is what gets deferred here.
    const start = setTimeout(() => loop.start(), delay);
    return () => {
      clearTimeout(start);
      loop.stop();
    };
  }, [v, delay]);

  return (
    <Animated.View
      style={{
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: t.dim,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }],
      }}
    />
  );
}

/**
 * One message. Mine is the indigo glass with its bottom-right corner tucked in;
 * theirs is a flat panel with the bottom-left tucked instead. The corners are
 * asymmetric, so the fill is a `LinearGradient` behind the text rather than the
 * `Gradient` primitive, which rounds all four corners equally.
 */
function Bubble({ mine, text, delay }: { mine: boolean; text: string; delay: number }) {
  const t = useTheme();
  return (
    <FadeIn delay={delay} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '76%' }}>
      <View
        style={{
          paddingVertical: 11,
          paddingHorizontal: 15,
          borderTopLeftRadius: 14,
          borderTopRightRadius: 14,
          borderBottomRightRadius: mine ? 4 : 14,
          borderBottomLeftRadius: mine ? 14 : 4,
          borderWidth: 1,
          borderColor: t.line,
          overflow: 'hidden',
          backgroundColor: mine ? 'transparent' : t.panel,
        }}
      >
        {mine && (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: t.accFill }]} />
        )}
        {/* `13.5px/1.4` — RN wants the leading in pixels */}
        <P size={13.5} color={mine ? '#fff' : t.ink} style={{ lineHeight: 18.9 }}>
          {text}
        </P>
      </View>
    </FadeIn>
  );
}

/** 15 · Message thread — a real DM with quick replies and a typing indicator. */
export default function MessageThread({ s }: { s: State }) {
  const t = useTheme();
  const who = FRIENDS.find((f) => f.name === s.dmWith);
  const messages = (s.dmWith && s.threads[s.dmWith]) || [];
  const listRef = useRef<ScrollView>(null);

  // The web pinned a trailing element with `scrollIntoView`; here the list is
  // told to run to its own end once the new bubble has been laid out.
  useEffect(() => {
    const id = requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    return () => cancelAnimationFrame(id);
  }, [messages.length, s.typing]);

  const send = () => store.sendDm(s.dmInput.trim());

  return (
    <FadeIn style={{ flex: 1, minHeight: 0, paddingTop: 62 }}>
      {/* header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 20,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: t.line,
        }}
      >
        <Tap onPress={() => store.go('friends')} label="Back">
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 14,
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

        <Tap
          onPress={() => s.dmWith && store.openPlayer(s.dmWith)}
          label={s.dmWith ?? 'Player'}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: 'auto' }}
        >
          <Avatar mark={who?.mark ?? ''} grad={who ? grad(who.gi) : GRADV} size={38} fontSize={15} />
          <View>
            <H size={14.5}>{s.dmWith ?? ''}</H>
            <P size={10.5} weight={400} color={t.dim2}>
              {who?.status ?? ''}
            </P>
          </View>
        </Tap>

        <Tap onPress={() => store.flash(`Lobby invite sent to ${s.dmWith}`)} label="Invite">
          <View
            style={{
              height: 34,
              paddingHorizontal: 13,
              borderRadius: 12,
              backgroundColor: TINT_14,
              borderWidth: 1,
              borderColor: LINE_30,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <H size={11.5} color={t.lime}>
              Invite
            </H>
          </View>
        </Tap>
      </View>

      {/* thread */}
      <ScrollView
        ref={listRef}
        style={{ flex: 1, minHeight: 0 }}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 20, paddingBottom: 8, gap: 8 }}
      >
        {messages.map(([from, text], i) => (
          <Bubble key={i} mine={from === 'me'} text={text} delay={Math.min(i * 60, 400)} />
        ))}

        {s.typing && (
          <Glass radius={14} elevated={false} style={{ alignSelf: 'flex-start' }}>
            <View
              accessible
              accessibilityLabel={`${s.dmWith} is typing`}
              style={{ flexDirection: 'row', gap: 5, paddingVertical: 13, paddingHorizontal: 15 }}
            >
              {[0, 150, 300].map((d) => (
                <Dot key={d} delay={d} />
              ))}
            </View>
          </Glass>
        )}
      </ScrollView>

      {/* quick replies */}
      <View style={{ paddingBottom: 8 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 20 }}
        >
          {QUICK.map((q) => (
            <Tap key={q} onPress={() => store.sendDm(q)} label={q}>
              <Glass radius={12}>
                <View style={{ paddingVertical: 8, paddingHorizontal: 14 }}>
                  <P size={11.5} weight={600} color={t.dim}>
                    {q}
                  </P>
                </View>
              </Glass>
            </Tap>
          ))}
        </ScrollView>
      </View>

      {/* composer */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8, paddingHorizontal: 18, paddingBottom: 30 }}>
        <Glass radius={15} style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 16 }}>
            <TextInput
              value={s.dmInput}
              onChangeText={store.setDmInput}
              onSubmitEditing={send}
              returnKeyType="send"
              submitBehavior="submit"
              placeholder="Message…"
              placeholderTextColor={t.dim2}
              accessibilityLabel={`Message ${s.dmWith}`}
              style={{ flex: 1, minWidth: 0, padding: 0, color: t.ink, fontFamily: font.body, fontSize: 13.5 }}
            />
          </View>
        </Glass>

        <Tap onPress={send} label="Send">
          <Gradient radius={16} style={{ width: 46, height: 46 }}>
            <View style={{ width: 46, height: 46, alignItems: 'center', justifyContent: 'center' }}>
              <Glyph d="M4 12l16-8-7 8 7 8z" size={20} color="#fff" width={2.4} />
            </View>
          </Gradient>
        </Tap>
      </View>
    </FadeIn>
  );
}
