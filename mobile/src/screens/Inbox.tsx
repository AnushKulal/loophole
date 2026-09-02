import { ScrollView, View } from 'react-native';
import { store, type State } from '../store/useStore';
import { INBOX, inboxId } from '../data/progression';
import { grad } from '../data/people';
import { useTheme } from '../theme/theme';
import { Avatar, Chevron, CloseIcon, Glass, Glyph, Gradient, H, P, Tap } from '../components/base';
import { FadeIn } from '../components/GameChrome';

/**
 * The design paints the header's back tile straight in rgba rather than through
 * a token — it is the same in Day and Night, exactly as in the web build, so it
 * stays literal here. Everything theme-dependent comes from `useTheme()`.
 */
const TINT_14 = 'rgba(150,180,255,0.14)';
const LINE_35 = 'rgba(150,180,255,0.35)';

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
    <View style={{ alignItems: 'center', gap: 13, paddingVertical: 60, paddingHorizontal: 20 }}>
      <Glass radius={20} elevated={false} style={{ width: 64, height: 64 }}>
        <View style={{ width: 62, height: 62, alignItems: 'center', justifyContent: 'center' }}>
          <Glyph d={d} size={28} color={t.dim2} width={1.7} />
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

/** 17 · Inbox — invites and requests, emptying to a real empty state. */
export default function Inbox({ s }: { s: State }) {
  const t = useTheme();
  const items = INBOX.filter((x) => !s.inboxGone.includes(inboxId(x)));

  return (
    <FadeIn style={{ flex: 1, minHeight: 0, paddingTop: 62 }}>
      {/* header */}
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
        <H size={15} style={{ marginRight: 'auto' }}>
          Inbox
        </H>
        <View style={{ paddingVertical: 5, paddingHorizontal: 11, borderRadius: 8, backgroundColor: t.acc }}>
          <H size={10.5} color={t.onAcc}>
            {items.length} NEW
          </H>
        </View>
      </View>

      {/* body */}
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
      >
        {items.length === 0 && (
          <EmptyState
            d="M3 8l9 6 9-6"
            title="Nothing waiting"
            blurb="Invites and friend requests land here. Open a lobby and someone will turn up."
            action={{ label: 'Create a lobby', onPress: () => store.go('config') }}
          />
        )}

        <View style={{ gap: 9 }}>
          {items.map((x) => (
            <FadeIn key={inboxId(x)}>
              <Glass radius={16} elevated={false}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 11,
                    paddingVertical: 12,
                    paddingHorizontal: 13,
                  }}
                >
                  <Avatar mark={x.mark} grad={grad(x.gi)} size={42} fontSize={16} />

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                      <H size={13} numberOfLines={1} style={{ flexShrink: 1 }}>
                        {x.title}
                      </H>
                      <P size={9.5} weight={400} color={t.dim2} numberOfLines={1} style={{ marginLeft: 'auto' }}>
                        {x.when}
                      </P>
                    </View>
                    <P size={11} weight={400} color={t.dim} style={{ marginTop: 2 }}>
                      {x.who} · {x.sub}
                    </P>
                  </View>

                  <Tap onPress={() => store.dismissInbox(inboxId(x))} label={`Dismiss ${x.title}`}>
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 10,
                        backgroundColor: 'transparent',
                        borderWidth: 1,
                        borderColor: t.line,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <CloseIcon size={14} color={t.dim2} />
                    </View>
                  </Tap>

                  <Tap onPress={() => store.acceptInbox(inboxId(x), x.kind, x.who)} label={x.act}>
                    <Gradient radius={10}>
                      <View style={{ height: 32, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' }}>
                        <H size={11.5} color="#fff">
                          {x.act}
                        </H>
                      </View>
                    </Gradient>
                  </Tap>
                </View>
              </Glass>
            </FadeIn>
          ))}
        </View>
      </ScrollView>
    </FadeIn>
  );
}
