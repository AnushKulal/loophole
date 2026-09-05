import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Circle, Rect } from 'react-native-svg';
import { store, type State } from '../store/useStore';
import type { Screen } from '../store/store';
import { RULES } from '../data/games';
import { findGame } from '../game/registry';
import { useTheme } from '../theme/theme';
import { CloseIcon, Glass, Glyph, Gradient, H, Kicker, P, Tap } from './base';
import { FadeIn } from './GameChrome';
import { font, radius as R, raised } from '../theme/tokens';

/**
 * The app-wide furniture that sits outside any one screen: the floating tab
 * bar, the table-chat sheet, the how-to-play modal, the offline banner and the
 * toast. Ported from the web build's `components/Chrome.tsx`.
 *
 * Two CSS features the design leans on have no RN equivalent and are handled
 * here rather than approximated per component:
 *   `border-radius: 24px 24px 0 0` — `Glass` rounds all four corners, so the
 *     chat sheet is pushed 24px past the bottom of a clipping overlay and its
 *     padding compensated, which hides the two bottom corners.
 *   `animation: vSlide/vUp` — `<FadeIn>`, exactly as RN_PORTING prescribes.
 */

/**
 * Colours the design paints straight in rgba rather than through a token: the
 * modal scrims, the badge fill on a rules step, and the amber of the
 * connection-lost banner. They are identical in Day and Night, as in the web
 * build, so they stay literals here.
 */
const SCRIM_CHAT = 'rgba(6,9,15,0.5)';
const SCRIM_RULES = 'rgba(6,9,15,0.68)';
const BADGE_FROM = 'rgba(139,164,255,0.4)';
const BADGE_TO = 'rgba(139,164,255,0.12)';
const BADGE_LINE = 'rgba(139,164,255,0.35)';
const ALERT = '#ec8a6a';
const ALERT_FILL = 'rgba(236,138,106,0.16)';
const ALERT_LINE = 'rgba(236,138,106,0.45)';
const ALERT_INK = '#2a0f0a';

/** `linear-gradient(160deg,…)`, as the start/end fractions expo-linear-gradient wants. */
const G_START = { x: 0.33, y: 0.03 };
const G_END = { x: 0.67, y: 0.97 };

// ── tab bar ───────────────────────────────────────────────────────

interface TabDef {
  key: string;
  d: string;
  /** The pill behind the joystick glyph. */
  rect?: boolean;
  /** The head above the shoulders glyph. */
  circle?: boolean;
  on: (s: Screen) => boolean;
  go: () => void;
}

const TABS: TabDef[] = [
  {
    key: 'HOME',
    d: 'M4 11l8-7 8 7v8a2 2 0 01-2 2H6a2 2 0 01-2-2z',
    on: (s) => s === 'home' || s === 'all',
    go: () => store.toHome(),
  },
  {
    key: 'PLAY',
    d: 'M7 12.5h3M8.5 11v3M16 11.5v.01M18 13.5v.01',
    rect: true,
    on: (s) => s === 'config',
    go: () => store.go('config'),
  },
  {
    key: 'RANKS',
    d: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0z',
    on: (s) => s === 'board',
    go: () => store.go('board'),
  },
  {
    key: 'YOU',
    d: 'M4.5 20a7.5 7.5 0 0115 0',
    circle: true,
    on: (s) => s === 'profile',
    go: () => store.go('profile'),
  },
];

/** The floating glass tab bar. It holds its place on every tabbed screen. */
export function TabBar({ scr }: { scr: Screen }) {
  const t = useTheme();

  return (
    <Glass radius={20} style={{ marginTop: 6, marginHorizontal: 16, marginBottom: 28 }}>
      <View style={{ flexDirection: 'row', gap: 4, padding: 7 }}>
        {TABS.map((tab) => {
          const on = tab.on(scr);
          const tint = on ? '#fff' : t.dim2;
          const cell = (
            <View style={{ paddingVertical: 11, alignItems: 'center', gap: 4 }}>
              <Glyph
                d={tab.d}
                size={20}
                color={tint}
                width={2}
                extra={
                  tab.rect ? (
                    <Rect x={2} y={7} width={20} height={11} rx={5.5} stroke={tint} strokeWidth={2} fill="none" />
                  ) : tab.circle ? (
                    <Circle cx={12} cy={8} r={3.6} stroke={tint} strokeWidth={2} fill="none" />
                  ) : undefined
                }
              />
              <H size={9} weight={700} color={tint}>
                {tab.key}
              </H>
            </View>
          );

          return (
            <Pressable
              key={tab.key}
              onPress={tab.go}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={tab.key}
              style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.72 }]}
            >
              {on ? (
                // `0 0 16px rgba(150,180,255,.5)` — an even bloom, so the glow is
                // drawn here rather than with Gradient's offset drop shadow.
                // The fill is repeated on this node deliberately: Android
                // shapes the elevation shadow from the background drawable, and
                // without one it drew a sharp indigo rectangle inside the pill.
                <Gradient radius={14} glow={false} style={raised(t, 14, t.accFill, 'low')}>
                  {cell}
                </Gradient>
              ) : (
                <View style={{ borderRadius: 14 }}>{cell}</View>
              )}
            </Pressable>
          );
        })}
      </View>
    </Glass>
  );
}

// ── table chat ────────────────────────────────────────────────────

/** Table chat as a glass bottom sheet. */
export function ChatSheet({ s }: { s: State }) {
  const t = useTheme();
  const listRef = useRef<ScrollView>(null);

  // The web pinned a trailing element with `scrollIntoView`; here the list is
  // told to run to its own end once the new line has been laid out.
  useEffect(() => {
    const id = requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    return () => cancelAnimationFrame(id);
  }, [s.chat.length]);

  const send = () => store.sendChat(s.chatInput.trim());

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 7,
        justifyContent: 'flex-end',
        backgroundColor: SCRIM_CHAT,
        // clips the sheet's two bottom corners — see the note at the top
        overflow: 'hidden',
      }}
    >
      {/* The scrim dismisses too. Named apart from the ✕ so the two dismiss
          targets stay individually addressable by an accessibility query. */}
      <Tap onPress={store.closeChat} label="Dismiss chat" style={{ flex: 1 }}>
        <View style={{ flex: 1 }} />
      </Tap>

      <FadeIn>
        <Glass radius={24} borderColor={t.line2} style={{ marginBottom: -24 }}>
          {/* 16 / 18 / 30, plus the 24 that hangs off the bottom of the frame */}
          <View style={{ paddingTop: 16, paddingHorizontal: 18, paddingBottom: 54 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <View style={{ width: 34, height: 4, borderRadius: 999, backgroundColor: t.line2, marginRight: 'auto' }} />
              <Kicker>TABLE CHAT</Kicker>
              <Tap onPress={store.closeChat} label="Close chat">
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: t.line,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CloseIcon size={14} color={t.dim} />
                </View>
              </Tap>
            </View>

            <ScrollView
              ref={listRef}
              style={{ maxHeight: 190 }}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
              contentContainerStyle={{ gap: 7 }}
            >
              {s.chat.map(([who, text], i) => (
                <FadeIn key={i}>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'baseline' }}>
                    <H size={10.5} color={who === 'You' ? t.accLt : t.dim} style={{ minWidth: 46 }}>
                      {who}
                    </H>
                    {/* `13px/1.4` — RN wants the leading in pixels */}
                    <P size={13} color={t.ink} style={{ flex: 1, lineHeight: 18.2 }}>
                      {text}
                    </P>
                  </View>
                </FadeIn>
              ))}
            </ScrollView>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 14 }}>
              <View
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 12,
                  paddingHorizontal: 15,
                  borderRadius: 999,
                  backgroundColor: t.panel2,
                  borderWidth: 1,
                  borderColor: t.line,
                }}
              >
                <TextInput
                  value={s.chatInput}
                  onChangeText={store.setChatInput}
                  onSubmitEditing={send}
                  returnKeyType="send"
                  submitBehavior="submit"
                  placeholder="Say something"
                  placeholderTextColor={t.dim2}
                  accessibilityLabel="Message the table"
                  style={{ flex: 1, minWidth: 0, padding: 0, color: t.ink, fontFamily: font.body, fontSize: 13.5 }}
                />
              </View>

              <Tap onPress={send} label="Send">
                <Gradient radius={14} style={{ width: 44, height: 44 }}>
                  <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                    <Glyph d="M4 12l16-8-7 8 7 8z" size={19} color="#fff" width={2.4} />
                  </View>
                </Gradient>
              </Tap>
            </View>
          </View>
        </Glass>
      </FadeIn>
    </View>
  );
}

// ── how to play ───────────────────────────────────────────────────

/** How-to-play, reachable from the lobby and from inside a game. */
export function RulesSheet({ game }: { game: string }) {
  const t = useTheme();
  // Each playable title carries its own rules; `RULES` in the fixture data only
  // ever covered the original four. Falling back to it showed UNO's rules for
  // every other game, so the registry is consulted first.
  const steps = findGame(game)?.rules ?? RULES[game] ?? [];

  return (
    <View
      accessibilityViewIsModal
      accessibilityLabel={`How to play ${game}`}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 7,
        backgroundColor: SCRIM_RULES,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <FadeIn style={{ width: '100%' }}>
        <Glass radius={22} borderColor={t.line2}>
          <View style={{ padding: 22 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <Kicker color={t.acc} style={{ marginRight: 'auto' }}>
                HOW TO PLAY
              </Kicker>
              <Tap onPress={store.closeRules} label="Close">
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: t.line,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CloseIcon size={14} color={t.dim} />
                </View>
              </Tap>
            </View>

            {/* 24px head, `line-height:1.05` and `letter-spacing:-.02em` in pixels */}
            <H size={24} style={{ lineHeight: 25.2, letterSpacing: -0.48, marginBottom: 18 }}>
              {game}
            </H>

            <View style={{ gap: 12 }}>
              {steps.map((step, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                  <View
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 9,
                      borderWidth: 1,
                      borderColor: BADGE_LINE,
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    <LinearGradient colors={[BADGE_FROM, BADGE_TO]} start={G_START} end={G_END} style={StyleSheet.absoluteFill} />
                    <H size={11} color={t.accLt}>
                      {i + 1}
                    </H>
                  </View>
                  {/* `13px/1.45` */}
                  <P size={13} weight={400} color={t.ink} style={{ flex: 1, lineHeight: 18.85 }}>
                    {step}
                  </P>
                </View>
              ))}
            </View>

            <Tap onPress={store.closeRules} label="Got it" style={{ marginTop: 20 }}>
              <Gradient radius={R.pill}>
                <View style={{ paddingVertical: 15, paddingHorizontal: 15, alignItems: 'center' }}>
                  <H size={14} color="#fff">
                    Got it
                  </H>
                </View>
              </Gradient>
            </Tap>
          </View>
        </Glass>
      </FadeIn>
    </View>
  );
}

// ── status strips ─────────────────────────────────────────────────

/** Connection-lost banner. Your seat is held while it shows. */
export function OfflineBanner() {
  const t = useTheme();

  return (
    <FadeIn style={{ position: 'absolute', left: 0, right: 0, top: 44, zIndex: 9, paddingHorizontal: 16 }}>
      <Glass radius={14} borderColor={ALERT_LINE}>
        <View
          accessibilityLiveRegion="polite"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingVertical: 11,
            paddingHorizontal: 14,
            backgroundColor: ALERT_FILL,
          }}
        >
          <Glyph
            d="M3 3l18 18M8.5 16.4a5 5 0 017 0M5 12.7a9 9 0 013.5-2.2M19 12.7a9 9 0 00-6-2.6M12 20v.01"
            size={16}
            color={ALERT}
            width={2.2}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <H size={11.5}>Connection lost</H>
            <P size={10.5} weight={400} color={t.dim}>
              Your seat is held for 60 seconds
            </P>
          </View>
          <Tap onPress={store.toggleOffline} label="RETRY">
            <View
              style={{
                height: 28,
                paddingHorizontal: 11,
                borderRadius: 8,
                backgroundColor: ALERT,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <H size={10.5} color={ALERT_INK}>
                RETRY
              </H>
            </View>
          </Tap>
        </View>
      </Glass>
    </FadeIn>
  );
}

/** Transient confirmation, floating above the tab bar. */
export function Toast({ text }: { text: string }) {
  return (
    <FadeIn style={{ position: 'absolute', left: 20, right: 20, bottom: 120, zIndex: 8 }}>
      <Gradient radius={15}>
        <View accessible accessibilityLiveRegion="polite" style={{ paddingVertical: 13, paddingHorizontal: 16 }}>
          <H size={13} weight={700} color="#fff">
            {text}
          </H>
        </View>
      </Gradient>
    </FadeIn>
  );
}
