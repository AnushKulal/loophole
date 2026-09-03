import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { Animated, Easing, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/theme';
import { Avatar, Chip, CloseIcon, Glass, Glyph, Gradient, H, P, Tap } from './base';
import { font, radius as R } from '../theme/tokens';

/**
 * The furniture every playable game shares: the HUD strip, the seat row, the
 * modal overlay and the emote bar. Games compose these so all fourteen titles
 * read as one app rather than fourteen separate screens.
 */

/** The outer frame of a game screen: full height, internal scrolling only. */
export function GameShell({ children, pad = 60 }: { children: ReactNode; pad?: number }) {
  return <View style={{ flex: 1, paddingTop: pad, paddingBottom: 26, minHeight: 0 }}>{children}</View>;
}

function IconBtn({ onPress, label, children, badge }: { onPress: () => void; label: string; children: ReactNode; badge?: number }) {
  const t = useTheme();
  return (
    <Tap onPress={onPress} label={label}>
      <Glass radius={11} elevated={false} style={{ width: 36, height: 36 }}>
        <View style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}>{children}</View>
      </Glass>
      {!!badge && (
        <View
          style={{
            position: 'absolute',
            top: -4,
            right: -4,
            minWidth: 15,
            height: 15,
            paddingHorizontal: 4,
            borderRadius: 6,
            backgroundColor: t.pink,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <H size={9} color={t.onPink}>
            {badge}
          </H>
        </View>
      )}
    </Tap>
  );
}

/**
 * The bar across the top of every game: a status pill on the left, then
 * optional extras, then how-to-play, chat and leave.
 */
export function GameHeader({
  hud,
  extra,
  onRules,
  onChat,
  chatCount,
  onExit,
}: {
  hud: string;
  extra?: ReactNode;
  onRules?: () => void;
  onChat?: () => void;
  chatCount?: number;
  onExit: () => void;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 20, paddingBottom: 12 }}>
      <Glass radius={10} elevated={false} style={{ marginRight: 'auto' }}>
        <View style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
          <H size={9.5} color={t.dim} style={{ letterSpacing: 1.2 }}>
            {hud}
          </H>
        </View>
      </Glass>
      {extra}
      {onRules && (
        <IconBtn onPress={onRules} label="How to play">
          <Glyph d="M9.5 9.5a2.5 2.5 0 114 2V13M12 17v.01" size={16} width={2.2} extra={undefined} />
        </IconBtn>
      )}
      {onChat && (
        <IconBtn onPress={onChat} label="Table chat" badge={chatCount}>
          <Glyph d="M21 12a8 8 0 01-8 8H8l-5 3 1.5-5A8 8 0 1121 12z" size={16} width={2.2} />
        </IconBtn>
      )}
      <IconBtn onPress={onExit} label="Leave">
        <CloseIcon />
      </IconBtn>
    </View>
  );
}

/** A chip for the header's `extra` slot — a score, a timer, a turn counter. */
export function HudChip({ children, tint }: { children: ReactNode; tint?: string }) {
  const t = useTheme();
  return (
    <Chip bg="rgba(150,180,255,0.14)" border="rgba(150,180,255,0.35)" color={tint ?? t.lime}>
      {children}
    </Chip>
  );
}

export interface SeatInfo {
  name: string;
  mark: string;
  grad: string;
  /** The line under the name — "7 cards", "2 tokens home". */
  sub: string;
  active?: boolean;
  out?: boolean;
}

/**
 * The opponent row along the top of a table game.
 *
 * Up to three seats fit side by side with the name beside the avatar. Past that
 * the row is too narrow for a name — "Karthik" truncates to "Ka…" — so the seats
 * stack the label under the avatar instead, the same shape the lobby uses.
 */
export function SeatStrip({ seats, onSeat }: { seats: SeatInfo[]; onSeat?: (i: number) => void }) {
  const t = useTheme();
  const stacked = seats.length > 3;

  return (
    <View style={{ flexDirection: 'row', gap: stacked ? 6 : 9, paddingHorizontal: 20, paddingBottom: 14 }}>
      {seats.map((p, i) => {
        const body = (
          <Glass
            radius={14}
            elevated={false}
            borderColor={p.active ? t.acc : 'transparent'}
            style={{ flex: 1, opacity: p.out ? 0.45 : 1 }}
          >
            <View
              style={
                stacked
                  ? { alignItems: 'center', gap: 5, paddingVertical: 9, paddingHorizontal: 4 }
                  : { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 9 }
              }
            >
              <Avatar mark={p.mark} grad={p.grad} size={stacked ? 28 : 30} fontSize={stacked ? 11 : 12} />
              <View style={stacked ? { alignItems: 'center', width: '100%' } : { flex: 1, minWidth: 0 }}>
                <H size={stacked ? 10 : 11} numberOfLines={1}>
                  {p.name}
                </H>
                <P size={9.5} color={t.dim2} numberOfLines={1}>
                  {p.sub}
                </P>
              </View>
            </View>
          </Glass>
        );
        return onSeat ? (
          <Tap key={i} onPress={() => onSeat(i)} label={p.name} style={{ flex: 1 }}>
            {body}
          </Tap>
        ) : (
          <View key={i} style={{ flex: 1 }}>
            {body}
          </View>
        );
      })}
    </View>
  );
}

/** The blurred full-frame dialog games use for pickers and round-over cards. */
export function GameOverlay({
  title,
  blurb,
  children,
  width = 280,
  label,
}: {
  title?: string;
  blurb?: string;
  children: ReactNode;
  width?: number;
  label?: string;
}) {
  const t = useTheme();
  return (
    <View
      accessibilityViewIsModal
      accessibilityLabel={label ?? title}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(6,9,15,0.72)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 6,
        padding: 22,
      }}
    >
      <Glass radius={R.card} style={{ width, maxWidth: '100%' }}>
        <View style={{ padding: 24 }}>
          {title && (
            <H size={26} style={{ letterSpacing: -0.5, lineHeight: 28 }}>
              {title}
            </H>
          )}
          {blurb && (
            <P size={12.5} color={t.dim} style={{ marginTop: 8, marginBottom: 18 }}>
              {blurb}
            </P>
          )}
          {children}
        </View>
      </Glass>
    </View>
  );
}

/** The paired buttons at the foot of a round-over overlay. */
export function OverlayActions({
  secondary,
  primary,
}: {
  secondary: { label: string; onPress: () => void };
  primary: { label: string; onPress: () => void };
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Tap onPress={secondary.onPress} label={secondary.label} style={{ flex: 1 }}>
        <View
          style={{
            padding: 14,
            borderRadius: 12,
            backgroundColor: t.panel2,
            borderWidth: 1,
            borderColor: t.line,
            alignItems: 'center',
          }}
        >
          <H size={13}>{secondary.label}</H>
        </View>
      </Tap>
      <Tap onPress={primary.onPress} label={primary.label} style={{ flex: 1 }}>
        <Gradient radius={12}>
          <View style={{ padding: 14, alignItems: 'center' }}>
            <H size={13} color="#fff">
              {primary.label}
            </H>
          </View>
        </Gradient>
      </Tap>
    </View>
  );
}

export const EMOTES = ['👀', '🤔', '😐', '🔥', '🤝'];

/** Tap emotes that float over the table. */
export function EmoteBar({ onEmote }: { onEmote: (e: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 7, paddingHorizontal: 20, paddingBottom: 10, justifyContent: 'center' }}>
      {EMOTES.map((e) => (
        <Tap key={e} onPress={() => onEmote(e)} label={`React ${e}`}>
          <Glass radius={12} elevated={false} style={{ width: 38, height: 38 }}>
            <View style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
              <H size={17} style={{ fontFamily: font.body }}>
                {e}
              </H>
            </View>
          </Glass>
        </Tap>
      ))}
    </View>
  );
}

/** The floating emote, shown over the table for a moment after a tap. */
export function FloatingEmote({ emote }: { emote: string | null }) {
  const y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!emote) return;
    y.setValue(0);
    Animated.timing(y, { toValue: -30, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [emote, y]);

  if (!emote) return null;
  return (
    <Animated.Text style={{ position: 'absolute', top: 6, fontSize: 40, zIndex: 3, transform: [{ translateY: y }] }}>
      {emote}
    </Animated.Text>
  );
}

/** A line of status text under the table — whose turn it is, what just happened. */
export function TableLog({ text }: { text: string }) {
  const t = useTheme();
  return (
    <H size={12.5} weight={700} color={t.dim} style={{ textAlign: 'center', paddingHorizontal: 20 }}>
      {text}
    </H>
  );
}

/** Fades and lifts its children in, standing in for the `vUp` keyframe. */
export function FadeIn({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 300, delay, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [v, delay]);
  return (
    <Animated.View
      style={[{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }, style]}
    >
      {children}
    </Animated.View>
  );
}
