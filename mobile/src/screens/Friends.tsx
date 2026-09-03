import { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { Circle } from 'react-native-svg';
import { store, type State } from '../store/useStore';
import { FRIENDS, grad } from '../data/people';
import { useTheme, type Tokens } from '../theme/theme';
import { Avatar, Chevron, Glass, Glyph, Gradient, H, Kicker, P, Tap } from '../components/base';
import { FadeIn } from '../components/GameChrome';
import { font } from '../theme/tokens';

/**
 * The design paints a few tints straight in rgba rather than through a token —
 * they are the same in Day and Night, exactly as in the web build, so they stay
 * literal here too. Everything theme-dependent comes from `useTheme()`.
 */
const TINT_11 = 'rgba(150,180,255,0.11)';
const TINT_14 = 'rgba(150,180,255,0.14)';
const LINE_30 = 'rgba(150,180,255,0.3)';
const LINE_35 = 'rgba(150,180,255,0.35)';

/** `FRIENDS` carries the presence dot as a CSS custom property. */
const dotColor = (t: Tokens, css: string) => (css === 'var(--ink)' ? t.ink : css);

const REQUESTS = [
  { name: 'Aditya', mark: '◈', gi: 6, mutual: '3 mutual friends' },
  { name: 'Priya', mark: '△', gi: 4, mutual: '1 mutual friend' },
];

/** The magnifier — a circle and a stroke, drawn on the same 24×24 grid. */
function SearchIcon({ color }: { color: string }) {
  return (
    <Glyph
      d="M16.5 16.5L21 21"
      size={16}
      color={color}
      width={2.2}
      extra={<Circle cx="11" cy="11" r="7" stroke={color} strokeWidth={2.2} fill="none" />}
    />
  );
}

/** Centred empty state: glyph tile, headline, blurb, action. */
function EmptyState({
  d,
  title,
  blurb,
  action,
}: {
  d: string;
  title: string;
  blurb: string;
  action: { label: string; onPress: () => void };
}) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 13, paddingVertical: 44, paddingHorizontal: 20 }}>
      <Glass radius={20} elevated={false} style={{ width: 62, height: 62 }}>
        <View style={{ width: 60, height: 60, alignItems: 'center', justifyContent: 'center' }}>
          <Glyph d={d} size={27} color={t.dim2} width={1.7} />
        </View>
      </Glass>
      <H size={16}>{title}</H>
      {/* the browser gave this its default 1.4 leading; RN needs it in pixels */}
      <P size={12.5} weight={400} color={t.dim} style={{ maxWidth: 215, textAlign: 'center', lineHeight: 17.5 }}>
        {blurb}
      </P>
      <Tap onPress={action.onPress} label={action.label}>
        <Gradient radius={999}>
          <View style={{ paddingVertical: 13, paddingHorizontal: 22 }}>
            <H size={13} color="#fff">
              {action.label}
            </H>
          </View>
        </Gradient>
      </Tap>
    </View>
  );
}

/** 14 · Friends — requests, the list, and per-row message / invite. */
export default function Friends({ s }: { s: State }) {
  const t = useTheme();
  const [query, setQuery] = useState('');
  const list = s.empty
    ? []
    : FRIENDS.filter((f) => !query || f.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <FadeIn style={{ flex: 1, minHeight: 0, paddingTop: 62 }}>
      {/* header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 12 }}>
        <Tap onPress={store.toHome} label="Back">
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
        <H size={15} style={{ marginRight: 'auto' }}>
          Friends
        </H>
        <Tap onPress={() => store.go('add')} label="Add">
          <Gradient radius={13}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14 }}>
              <Glyph d="M12 5v14M5 12h14" size={14} color="#fff" width={2.8} />
              <H size={12} color="#fff">
                Add
              </H>
            </View>
          </Gradient>
        </Tap>
      </View>

      {/* search */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
        <Glass radius={15}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14 }}>
            <SearchIcon color={t.dim2} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search name or #tag"
              placeholderTextColor={t.dim2}
              accessibilityLabel="Search friends"
              style={{ flex: 1, minWidth: 0, padding: 0, color: t.ink, fontFamily: font.body, fontSize: 13.5 }}
            />
          </View>
        </Glass>
      </View>

      {/* body */}
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
      >
        <Kicker tracking={1.33} style={{ marginTop: 2, marginBottom: 9 }}>
          REQUESTS · {REQUESTS.length}
        </Kicker>

        <View style={{ gap: 8 }}>
          {REQUESTS.map((q) => (
            <View
              key={q.name}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 11,
                paddingVertical: 11,
                paddingHorizontal: 13,
                borderRadius: 18,
                backgroundColor: TINT_11,
                borderWidth: 1,
                borderColor: LINE_35,
              }}
            >
              <Avatar mark={q.mark} grad={grad(q.gi)} size={40} fontSize={16} />
              <View style={{ marginRight: 'auto', minWidth: 0 }}>
                <H size={13.5}>{q.name}</H>
                <P size={11} weight={400} color={t.dim2} style={{ marginTop: 2 }}>
                  {q.mutual}
                </P>
              </View>
              <Tap onPress={() => store.flash(`${q.name} added`)} label="Accept">
                <Gradient radius={12} glow={false}>
                  <View style={{ paddingVertical: 9, paddingHorizontal: 14 }}>
                    <H size={11.5} color="#fff">
                      Accept
                    </H>
                  </View>
                </Gradient>
              </Tap>
            </View>
          ))}
        </View>

        {s.empty ? (
          <EmptyState
            d="M2.5 20a6.5 6.5 0 0113 0M18 8v6M15 11h6"
            title="No friends yet"
            blurb="Loophole is no fun alone. Add someone, or share a room code and they'll appear here."
            action={{ label: 'Find people', onPress: () => store.go('add') }}
          />
        ) : (
          <Kicker tracking={1.33} style={{ marginTop: 20, marginBottom: 9 }}>
            ALL FRIENDS · {FRIENDS.length}
          </Kicker>
        )}

        <View style={{ gap: 8 }}>
          {list.map((f) => (
            <Glass key={f.name} radius={18} elevated={false}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12 }}>
                <Tap
                  onPress={() => store.openPlayer(f.name)}
                  label={f.name}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 11, flex: 1, minWidth: 0 }}
                >
                  <Avatar mark={f.mark} grad={grad(f.gi)} size={42} fontSize={16}>
                    <View
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        right: 0,
                        width: 12,
                        height: 12,
                        borderRadius: 6,
                        backgroundColor: dotColor(t, f.dot),
                        borderWidth: 2.5,
                        borderColor: t.bg,
                      }}
                    />
                  </Avatar>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <H size={13.5} numberOfLines={1} style={{ flexShrink: 1 }}>
                        {f.name}
                      </H>
                      <H size={8.5} color={t.accLt} numberOfLines={1}>
                        LVL {f.lvl}
                      </H>
                      {f.name === 'Divya' && (
                        <View
                          style={{
                            minWidth: 17,
                            height: 17,
                            paddingHorizontal: 5,
                            borderRadius: 7,
                            backgroundColor: t.pink,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <H size={9.5} color={t.onPink}>
                            2
                          </H>
                        </View>
                      )}
                    </View>
                    <P size={11} weight={400} color={t.dim2} numberOfLines={1} style={{ marginTop: 2 }}>
                      {f.status}
                    </P>
                  </View>
                </Tap>

                <Tap onPress={() => store.openDm(f.name)} label={`Message ${f.name}`}>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 13,
                      backgroundColor: t.panel2,
                      borderWidth: 1,
                      borderColor: t.line,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Glyph d="M21 12a8 8 0 01-8 8H8l-5 3 1.5-5A8 8 0 1121 12z" size={16} width={2.2} />
                  </View>
                </Tap>

                {/* Someone already at a table cannot be invited to yours — offer
                    to watch theirs instead. */}
                <Tap
                  onPress={() =>
                    f.status.includes('In a lobby')
                      ? store.go('spectate')
                      : store.flash(`Invite sent to ${f.name}`)
                  }
                  label={f.status.includes('In a lobby') ? `Watch ${f.name}` : `Invite ${f.name}`}
                >
                  <View
                    style={{
                      height: 36,
                      paddingHorizontal: 12,
                      borderRadius: 12,
                      backgroundColor: TINT_14,
                      borderWidth: 1,
                      borderColor: LINE_30,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <H size={11} color={t.lime}>
                      {f.status.includes('In a lobby') ? 'Watch' : 'Invite'}
                    </H>
                  </View>
                </Tap>
              </View>
            </Glass>
          ))}
        </View>
      </ScrollView>
    </FadeIn>
  );
}
