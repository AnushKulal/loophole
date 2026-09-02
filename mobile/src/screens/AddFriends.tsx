import type { ReactNode } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { Circle, Rect } from 'react-native-svg';
import { store, type State } from '../store/useStore';
import { CANDIDATES, grad } from '../data/people';
import { useTheme } from '../theme/theme';
import { Avatar, Chevron, Glass, Glyph, Gradient, H, Kicker, P, Tap } from '../components/base';
import { FadeIn } from '../components/GameChrome';
import { font } from '../theme/tokens';

/**
 * The tinted accent wash behind the back chevron. The design paints it straight
 * in rgba rather than through a token — it is the same in Day and Night, as in
 * the web build, so it stays literal here. Everything else comes from the theme.
 */
const TINT_14 = 'rgba(150,180,255,0.14)';
const LINE_35 = 'rgba(150,180,255,0.35)';

/** The magnifier — a circle and a stroke, drawn on the same 24×24 grid. */
function SearchIcon({ color, size = 17 }: { color: string; size?: number }) {
  return (
    <Glyph
      d="M16.5 16.5L21 21"
      size={size}
      color={color}
      width={2.2}
      extra={<Circle cx="11" cy="11" r="7" stroke={color} strokeWidth={2.2} fill="none" />}
    />
  );
}

/** One of the two secondary actions under the search field. */
function ActionChip({ label, onPress, icon }: { label: string; onPress: () => void; icon: ReactNode }) {
  const t = useTheme();
  return (
    <Tap onPress={onPress} label={label} style={{ flex: 1 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: 12,
          borderRadius: 12,
          backgroundColor: t.panel,
          borderWidth: 1,
          borderColor: t.line,
        }}
      >
        {icon}
        <H size={11.5}>{label}</H>
      </View>
    </Tap>
  );
}

/** 18 · Add friends — live filtering, with a real no-results state. */
export default function AddFriends({ s }: { s: State }) {
  const t = useTheme();
  const results = CANDIDATES.filter(
    (c) => !s.addQuery || c.name.toLowerCase().startsWith(s.addQuery.toLowerCase()),
  );

  return (
    <FadeIn style={{ flex: 1, minHeight: 0, paddingTop: 62, paddingBottom: 34 }}>
      {/* header — fixed */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 14 }}>
        <Tap onPress={() => store.go('friends')} label="Back">
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
        <H size={15}>Add friends</H>
      </View>

      {/* search and the two secondary actions — fixed */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 14 }}>
        <Glass radius={14} borderColor={t.line2}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 15 }}>
            <SearchIcon color={t.acc} />
            <TextInput
              value={s.addQuery}
              onChangeText={store.setAddQuery}
              placeholder="Name or #tag"
              placeholderTextColor={t.dim2}
              accessibilityLabel="Search for people"
              autoCapitalize="none"
              autoCorrect={false}
              style={{ flex: 1, minWidth: 0, padding: 0, color: t.ink, fontFamily: font.body, fontSize: 14 }}
            />
          </View>
        </Glass>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <ActionChip
            label="Scan code"
            onPress={() => store.flash('Point the camera at their code')}
            icon={
              <Glyph
                d="M14 14h3v3h-3zM19 19h2v2h-2z"
                size={15}
                color={t.ink}
                width={2.2}
                extra={
                  <>
                    <Rect x="3" y="3" width="7" height="7" stroke={t.ink} strokeWidth={2.2} fill="none" />
                    <Rect x="14" y="3" width="7" height="7" stroke={t.ink} strokeWidth={2.2} fill="none" />
                    <Rect x="3" y="14" width="7" height="7" stroke={t.ink} strokeWidth={2.2} fill="none" />
                  </>
                }
              />
            }
          />
          <ActionChip
            label="Share invite"
            onPress={() => store.flash('Invite link copied')}
            icon={<Glyph d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7M12 16V3M8 7l4-4 4 4" size={15} color={t.ink} width={2.2} />}
          />
        </View>
      </View>

      {/* suggestions — scrolls */}
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
      >
        <Kicker tracking={1.33} style={{ marginTop: 2, marginBottom: 9 }}>
          SUGGESTED
        </Kicker>

        {results.length === 0 && (
          <View style={{ alignItems: 'center', gap: 13, paddingVertical: 40, paddingHorizontal: 20 }}>
            <Glass radius={18} elevated={false} style={{ width: 56, height: 56 }}>
              <View style={{ width: 54, height: 54, alignItems: 'center', justifyContent: 'center' }}>
                <Glyph d="M16.5 16.5L21 21" size={24} color={t.dim2} width={1.7} />
              </View>
            </Glass>
            <H size={16}>No one by that name</H>
            {/* the browser gave this its default 1.4 leading; RN needs it in pixels */}
            <P size={12.5} weight={400} color={t.dim} style={{ maxWidth: 215, textAlign: 'center', lineHeight: 17.5 }}>
              Check the spelling, or share your invite link instead.
            </P>
          </View>
        )}

        <View style={{ gap: 9 }}>
          {results.map((c) => {
            const sent = s.sent.includes(c.name);
            return (
              <Glass key={c.name} radius={16} elevated={false}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11, paddingHorizontal: 13 }}>
                  <Avatar mark={c.mark} grad={grad(c.gi)} size={42} fontSize={16} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <H size={13.5} numberOfLines={1}>
                      {c.name}
                    </H>
                    <P size={11} weight={400} color={t.dim} numberOfLines={1} style={{ marginTop: 2 }}>
                      {c.why}
                    </P>
                  </View>
                  {sent ? (
                    <View
                      style={{
                        height: 34,
                        paddingHorizontal: 12,
                        borderRadius: 10,
                        backgroundColor: 'transparent',
                        borderWidth: 1,
                        borderColor: t.line,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <H size={11} color={t.dim2}>
                        SENT
                      </H>
                    </View>
                  ) : (
                    <Tap onPress={() => store.sendRequest(c.name)} label="Add">
                      <Gradient radius={10}>
                        <View style={{ height: 34, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }}>
                          <H size={11.5} color="#fff">
                            Add
                          </H>
                        </View>
                      </Gradient>
                    </Tap>
                  )}
                </View>
              </Glass>
            );
          })}
        </View>
      </ScrollView>
    </FadeIn>
  );
}
