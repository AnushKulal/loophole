import { useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Circle, Rect } from 'react-native-svg';
import { store, type State } from '../store/useStore';
import { TINTS } from '../data/progression';
import { DIM, FEATURED, GAME_LEVEL, GAME_XP, gameByName, type Category } from '../data/games';
import { MARKS } from '../data/people';
import { useTheme } from '../theme/theme';
import { NEON_ON_DARK, font, type Tokens, fade } from '../theme/tokens';
import { Avatar, Bar, Chevron, Glass, Glyph, H, P, Tap, gradStops } from '../components/base';
import { FadeIn } from '../components/GameChrome';

/**
 * The design paints a few tints straight in rgba rather than through a token —
 * they are the same in Day and Night, exactly as in the web build, so they stay
 * literal here too. Everything theme-dependent comes from `useTheme()`.
 */
const TINT_14 = 'rgba(150,180,255,0.14)';
const TINT_16 = 'rgba(150,180,255,0.16)';
const LINE_28 = 'rgba(150,180,255,0.28)';
const LINE_30 = 'rgba(150,180,255,0.3)';
const LINE_35 = 'rgba(150,180,255,0.35)';
const LINE_40 = 'rgba(150,180,255,0.4)';
const CARD_GLOW = '#96b4ff';

/** Card width plus the rail gap — one press of the arrow advances exactly this. */
const STEP = 208;

/** The fixture's `NEON` holds CSS custom properties, so resolve it from the palette. */
const neonFor = (t: Tokens, cat: Category) => (cat === 'Deduction' ? t.acc : cat === 'Board' ? t.cyan : t.lime);

/**
 * The faint rule grid the design lays over the tile art. CSS drew it with a
 * repeating `background-image`; RN has no such thing, so it is an SVG pattern
 * of one horizontal and one vertical hairline per cell.
 */
/**
 * The faint graph-paper texture on the big cards.
 *
 * Drawn as plain Views rather than an SVG pattern. react-native-svg renders
 * into its own surface, and Android does not clip a native surface to the
 * parent's corner radius — so the texture showed up as a hard-edged rectangle
 * sitting inside every rounded card, with the pattern's own outer edge reading
 * as a border. A handful of 1px Views clip like any other view and cost less.
 *
 * `onLayout` rather than a fixed count: the cards differ in size and a fixed
 * count would either run out early on the tall one or overdraw on the small.
 */
function GridWash({ cell, opacity }: { cell: number; opacity: number }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const ink = `rgba(255,255,255,${opacity})`;

  const lines = [];
  for (let x = cell; x < size.w; x += cell) {
    lines.push(<View key={`v${x}`} style={{ position: 'absolute', left: x, top: 0, bottom: 0, width: 1, backgroundColor: ink }} />);
  }
  for (let y = cell; y < size.h; y += cell) {
    lines.push(<View key={`h${y}`} style={{ position: 'absolute', top: y, left: 0, right: 0, height: 1, backgroundColor: ink }} />);
  }

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
      }}
    >
      {lines}
    </View>
  );
}

/** One of the three glass squares at the top right of the header. */
function HeaderBtn({ onPress, label, children, badge }: { onPress: () => void; label: string; children: ReactNode; badge?: number }) {
  const t = useTheme();
  return (
    <Tap onPress={onPress} label={label}>
      <Glass radius={15} style={{ width: 42, height: 42 }}>
        <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>{children}</View>
      </Glass>
      {!!badge && (
        <View
          style={{
            position: 'absolute',
            top: -4,
            right: -4,
            minWidth: 16,
            height: 16,
            paddingHorizontal: 4,
            borderRadius: 6,
            backgroundColor: t.pink,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <H size={9.5} color={t.onPink}>
            {badge}
          </H>
        </View>
      )}
    </Tap>
  );
}

/** 04 · Home — your card, the season bar, quick actions and the game rail. */
export default function Home({ s }: { s: State }) {
  const t = useTheme();
  const myGrad = TINTS[s.tint].grad;

  // RN has no `scrollLeft` getter, so the rail's offset (and the two widths the
  // wrap-around test needs) are tracked in refs as the rail scrolls.
  const railRef = useRef<ScrollView>(null);
  const offset = useRef(0);
  const contentW = useRef(0);
  const viewW = useRef(0);

  /** Advance the rail one card, looping back at the end. */
  const slideRail = () => {
    const next = offset.current + STEP;
    const to = next >= contentW.current - viewW.current - 8 ? 0 : next;
    offset.current = to;
    railRef.current?.scrollTo({ x: to, animated: true });
  };

  return (
    <FadeIn style={{ flex: 1, minHeight: 0, paddingTop: 62, paddingBottom: 6 }}>
      {/* identity + shortcuts */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 16 }}>
        <Tap onPress={() => store.go('profile')} label="Your profile">
          <Avatar
            mark={MARKS[s.mark]}
            grad={myGrad}
            size={46}
            radius={18}
            fontSize={19}
            style={{
              borderRadius: 18,
              shadowColor: t.acc,
              shadowOffset: { width: 0, height: 8 },
              shadowRadius: 20,
              shadowOpacity: 0.5,
              elevation: 8,
            }}
          >
            <View style={{ position: 'absolute', bottom: -5, left: 0, right: 0, alignItems: 'center' }}>
              <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7, backgroundColor: t.acc }}>
                <H size={8} color={t.onAcc}>
                  LVL 24
                </H>
              </View>
            </View>
          </Avatar>
        </Tap>

        <View style={{ marginRight: 'auto' }}>
          <P size={11.5} color={t.dim}>
            Good evening
          </P>
          <H size={17} numberOfLines={1}>
            {s.myName}
          </H>
        </View>

        <HeaderBtn onPress={() => store.go('inbox')} label="Inbox" badge={store.inboxCount}>
          <Glyph
            d="M3 8l9 6 9-6"
            size={18}
            color={t.ink}
            width={2}
            extra={<Rect x={2.5} y={5} width={19} height={14} rx={3} fill="none" stroke={t.ink} strokeWidth={2} />}
          />
        </HeaderBtn>

        <HeaderBtn onPress={() => store.go('board')} label="Rankings">
          <Glyph d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0z" size={19} color={t.gold} />
        </HeaderBtn>

        <HeaderBtn onPress={() => store.go('settings')} label="Settings">
          <Glyph
            d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.5 5.5l2 2M16.5 16.5l2 2M18.5 5.5l-2 2M7.5 16.5l-2 2"
            size={18}
            color={t.ink}
            width={2}
            extra={<Circle cx="12" cy="12" r="3.2" fill="none" stroke={t.ink} strokeWidth={2} />}
          />
        </HeaderBtn>
      </View>

      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* season progress */}
        <View style={{ paddingHorizontal: 20 }}>
          <Glass radius={18}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 }}>
              <Tap onPress={() => store.go('season')} label="Season 2 progress to level 25" style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row' }}>
                  <P size={9.5} color={t.dim2} numberOfLines={1} style={{ letterSpacing: 0.95, marginRight: 'auto', flexShrink: 1 }}>
                    SEASON 2 · PROGRESS TO LVL 25
                  </P>
                  <P size={9.5} weight={700} color={t.accLt} numberOfLines={1} style={{ letterSpacing: 0.95 }}>
                    12,450 / 15,000 XP
                  </P>
                </View>
                <View style={{ height: 6, borderRadius: 999, backgroundColor: t.track, overflow: 'hidden', marginTop: 8 }}>
                  <LinearGradient
                    colors={t.gradv as [string, string, ...string[]]}
                    start={{ x: 0.2, y: 0 }}
                    end={{ x: 0.8, y: 1 }}
                    style={{ width: '68%', height: '100%' }}
                  />
                </View>
              </Tap>
              <H size={11} color={t.lime}>
                #12
              </H>
            </View>
          </Glass>
        </View>

        {/* create / join / friends */}
        <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 14 }}>
          {/* This tile stretches to the taller right-hand column, and `Gradient`
              clips to its own content, so the indigo glass is layered here. */}
          <Tap onPress={() => store.go('config')} label="Create lobby" style={{ flex: 1.35 }}>
            <View
              style={{
                flex: 1,
                borderRadius: 20,
                shadowColor: t.acc,
                shadowOffset: { width: 0, height: 8 },
                shadowRadius: 20,
                shadowOpacity: 0.5,
                elevation: 8,
              }}
            >
              <View style={{ flex: 1, borderRadius: 20, overflow: 'hidden' }}>
                <LinearGradient
                  colors={t.gradv as [string, string, ...string[]]}
                  start={{ x: 0.2, y: 0 }}
                  end={{ x: 0.8, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <LinearGradient
                  colors={[t.rim, fade(t.rim)]}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, opacity: 0.7 }}
                  pointerEvents="none"
                />
                <GridWash cell={16} opacity={0.06} />
                <View style={{ padding: 18 }}>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 14,
                      backgroundColor: 'rgba(255,255,255,0.22)',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 14,
                    }}
                  >
                    <Glyph d="M12 5v14M5 12h14" size={19} color="#fff" width={2.6} />
                  </View>
                  <H size={20} color="#fff" style={{ lineHeight: 21, letterSpacing: -0.4 }}>
                    {'Create\nlobby'}
                  </H>
                  <P size={11} color="#fff" style={{ opacity: 0.88, marginTop: 7 }}>
                    Pick game · set rules
                  </P>
                </View>
              </View>
            </View>
          </Tap>

          <View style={{ flex: 1, gap: 10 }}>
            {!s.joinOpen ? (
              <Tap onPress={store.openJoin} label="Join code" style={{ flex: 1 }}>
                <Glass radius={20} borderColor={LINE_35} style={{ flex: 1 }}>
                  <View style={{ padding: 14 }}>
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 13,
                        backgroundColor: TINT_14,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 10,
                      }}
                    >
                      <Glyph d="M15 7h3a4 4 0 010 8h-3M9 17H6a4 4 0 010-8h3M8 12h8" size={17} color={t.cyan} width={2.2} />
                    </View>
                    <H size={13}>Join code</H>
                  </View>
                </Glass>
              </Tap>
            ) : (
              <FadeIn style={{ flex: 1 }}>
                <Glass radius={20} borderColor={t.cyan} style={{ flex: 1 }}>
                  <View style={{ padding: 12 }}>
                    <TextInput
                      value={s.codeInput}
                      onChangeText={store.setCode}
                      maxLength={6}
                      placeholder="K7QX2M"
                      placeholderTextColor={t.dim2}
                      accessibilityLabel="Room code"
                      autoFocus
                      autoCapitalize="characters"
                      autoCorrect={false}
                      selectionColor={t.cyan}
                      returnKeyType="go"
                      onSubmitEditing={store.enterLobby}
                      style={{
                        width: '100%',
                        padding: 0,
                        color: t.ink,
                        fontFamily: font.h,
                        fontSize: 17,
                        letterSpacing: 2.38,
                        textAlign: 'center',
                      }}
                    />
                    <Tap onPress={store.enterLobby} label="JOIN" style={{ marginTop: 8 }}>
                      <View style={{ paddingVertical: 9, borderRadius: 12, backgroundColor: t.cyan, alignItems: 'center' }}>
                        <H size={11} color={t.onCyan}>
                          JOIN
                        </H>
                      </View>
                    </Tap>
                  </View>
                </Glass>
              </FadeIn>
            )}

            <Tap onPress={() => store.go('friends')} label="Friends" style={{ flex: 1 }}>
              <Glass radius={20} borderColor={LINE_30} style={{ flex: 1 }}>
                <View style={{ padding: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 13,
                        backgroundColor: TINT_14,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Glyph
                        d="M2.5 20a6.5 6.5 0 0113 0M17 11a3 3 0 100-6"
                        size={17}
                        color={t.lime}
                        width={2.2}
                        extra={<Circle cx="9" cy="8" r="3.2" fill="none" stroke={t.lime} strokeWidth={2.2} />}
                      />
                    </View>
                    <View
                      style={{
                        marginLeft: 'auto',
                        paddingHorizontal: 7,
                        paddingVertical: 2,
                        borderRadius: 7,
                        backgroundColor: t.pink,
                      }}
                    >
                      <H size={8.5} color={t.onPink}>
                        2
                      </H>
                    </View>
                  </View>
                  <H size={13}>Friends</H>
                </View>
              </Glass>
            </Tap>
          </View>
        </View>

        {/* continue playing */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10 }}>
          <H size={10} color={t.acc} style={{ letterSpacing: 1.6, marginRight: 'auto' }}>
            CONTINUE PLAYING
          </H>
          <Tap onPress={slideRail} label="Next game">
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 12,
                backgroundColor: TINT_14,
                borderWidth: 1,
                borderColor: LINE_35,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Chevron size={15} color={t.accLt} />
            </View>
          </Tap>
        </View>

        <ScrollView
          ref={railRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={STEP}
          decelerationRate="fast"
          scrollEventThrottle={16}
          onLayout={(e) => {
            viewW.current = e.nativeEvent.layout.width;
          }}
          onContentSizeChange={(w) => {
            contentW.current = w;
          }}
          onScroll={(e) => {
            offset.current = e.nativeEvent.contentOffset.x;
            contentW.current = e.nativeEvent.contentSize.width;
            viewW.current = e.nativeEvent.layoutMeasurement.width;
          }}
          contentContainerStyle={{ gap: 12, paddingHorizontal: 20, paddingBottom: 4 }}
        >
          {FEATURED.map((name) => {
            const g = gameByName(name);
            const neon = neonFor(t, g.cat);
            return (
              <Tap
                key={name}
                onPress={() => store.pickGame(name)}
                label={g.name}
                style={{
                  width: 196,
                  borderRadius: 20,
                  shadowColor: CARD_GLOW,
                  shadowOffset: { width: 0, height: 0 },
                  shadowRadius: 20,
                  shadowOpacity: 0.12,
                }}
              >
                <View
                  style={{
                    borderRadius: 20,
                    overflow: 'hidden',
                    borderWidth: 1,
                    borderColor: LINE_30,
                    backgroundColor: t.panel,
                  }}
                >
                  <View style={{ height: 98, alignItems: 'center', justifyContent: 'center' }}>
                    <LinearGradient
                      colors={gradStops(DIM[g.cat])}
                      start={{ x: 0.15, y: 0 }}
                      end={{ x: 0.85, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                    <GridWash cell={18} opacity={0.05} />
<Glyph d={g.d} size={40} color={neon} width={1.6} glow={neon} />
                    <View
                      style={{
                        position: 'absolute',
                        top: 9,
                        left: 9,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 7,
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        borderWidth: 1,
                        borderColor: 'rgba(255,255,255,0.12)',
                      }}
                    >
                      <H size={8} color={NEON_ON_DARK[g.cat]} style={{ letterSpacing: 0.8 }}>
                        {g.cat.toUpperCase()}
                      </H>
                    </View>
                  </View>

                  <View style={{ paddingTop: 11, paddingHorizontal: 13, paddingBottom: 13 }}>
                    <H size={14} numberOfLines={1}>
                      {g.name}
                    </H>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                      <P size={9.5} color={t.dim2} style={{ marginRight: 'auto' }}>
                        {g.players} players
                      </P>
                      <H size={8.5} color={neon}>
                        {GAME_LEVEL[g.name] ?? 'LVL 1'}
                      </H>
                    </View>
                    <Bar
                      pct={parseFloat(GAME_XP[g.name] ?? '12%') / 100}
                      fill={neon}
                      height={3}
                      style={{ marginTop: 7 }}
                    />
                  </View>
                </View>
              </Tap>
            );
          })}
        </ScrollView>

        {/* library */}
        <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
          <Tap onPress={() => store.go('all')} label="All games">
            <Glass radius={18} borderColor={LINE_40}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 14,
                    backgroundColor: TINT_16,
                    borderWidth: 1,
                    borderColor: LINE_35,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Glyph d="M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v6H4zM14 15h6v6h-6z" size={18} color={t.accLt} />
                </View>
                <View style={{ marginRight: 'auto' }}>
                  <H size={13.5}>All games</H>
                  <P size={10} color={t.dim2} style={{ marginTop: 2 }}>
                    14 titles · 3 categories
                  </P>
                </View>
                <Chevron color={t.acc} />
              </View>
            </Glass>
          </Tap>
        </View>

        {/* live lobby nudge */}
        <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
          <Tap onPress={store.enterLobby} label="Divya has a lobby open, tap to join">
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingVertical: 12,
                paddingHorizontal: 15,
                borderRadius: 18,
                backgroundColor: 'rgba(150,180,255,0.09)',
                borderWidth: 1,
                borderColor: LINE_28,
              }}
            >
              <Glyph d="M12 3a9 9 0 100 18 9 9 0 000-18zM12 8v4l3 2" size={16} color={t.lime} />
              <P size={11} color={t.dim} style={{ flex: 1, lineHeight: 15.4 }}>
                Divya has a lobby open ·{' '}
                <P size={11} weight={700} color={t.lime}>
                  tap to join
                </P>
              </P>
            </View>
          </Tap>
        </View>

        <View style={{ flex: 1, minHeight: 8 }} />
      </ScrollView>
    </FadeIn>
  );
}
