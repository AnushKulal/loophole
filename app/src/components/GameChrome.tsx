import type { CSSProperties, ReactNode } from 'react';
import { Close, Glyph } from './Primitives';
import { ellipsis, glass, head, outfit, row } from './ui';

/**
 * The furniture every playable game shares: the HUD strip, the seat row, the
 * modal overlay and the emote bar. Games compose these so all fourteen titles
 * read as one app rather than fourteen separate screens.
 */

const headerBtn: CSSProperties = {
  appearance: 'none',
  width: 36,
  height: 36,
  flex: 'none',
  borderRadius: 11,
  background: 'var(--panel)',
  border: '1px solid var(--line)',
  backdropFilter: 'var(--blur)',
  WebkitBackdropFilter: 'var(--blur)',
  cursor: 'pointer',
  color: 'var(--ink)',
  display: 'grid',
  placeItems: 'center',
  position: 'relative',
};

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
  /** The left-hand status pill — "UNO · 7 CARDS", "R1 · VOTE". */
  hud: string;
  /** Anything that sits between the pill and the buttons, like a score chip. */
  extra?: ReactNode;
  onRules?: () => void;
  onChat?: () => void;
  chatCount?: number;
  onExit: () => void;
}) {
  return (
    <div style={{ ...row, gap: 9, padding: '0 20px 12px' }}>
      <div
        style={{
          padding: '6px 12px',
          ...glass(10),
          font: `800 9.5px ${outfit}`,
          letterSpacing: '.12em',
          color: 'var(--dim)',
          marginRight: 'auto',
          whiteSpace: 'nowrap',
        }}
      >
        {hud}
      </div>
      {extra}
      {onRules && (
        <button onClick={onRules} style={headerBtn} aria-label="How to play">
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M9.5 9.5a2.5 2.5 0 114 2V13M12 17v.01" />
          </svg>
        </button>
      )}
      {onChat && (
        <button onClick={onChat} style={headerBtn} aria-label="Table chat">
          <Glyph d="M21 12a8 8 0 01-8 8H8l-5 3 1.5-5A8 8 0 1121 12z" size={16} width={2.2} />
          {!!chatCount && (
            <div
              style={{
                position: 'absolute',
                top: -4,
                right: -4,
                minWidth: 15,
                height: 15,
                padding: '0 4px',
                borderRadius: 6,
                background: 'var(--pink)',
                color: 'var(--onPink)',
                font: `800 9px ${outfit}`,
                display: 'grid',
                placeItems: 'center',
              }}
            >
              {chatCount}
            </div>
          )}
        </button>
      )}
      <button onClick={onExit} style={headerBtn} aria-label="Leave">
        <Close />
      </button>
    </div>
  );
}

/** A chip for the header's `extra` slot — a score, a timer, a turn counter. */
export function HudChip({ children, tint = 'var(--lime)' }: { children: ReactNode; tint?: string }) {
  return (
    <div
      style={{
        padding: '6px 11px',
        borderRadius: 10,
        background: 'rgba(150,180,255,.14)',
        border: '1px solid rgba(150,180,255,.35)',
        color: tint,
        font: `800 11px ${outfit}`,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </div>
  );
}

export interface SeatInfo {
  name: string;
  mark: string;
  grad: string;
  /** The line under the name — "7 cards", "2 tokens home". */
  sub: string;
  /** Ring and glow this seat when it is their turn. */
  active?: boolean;
  /** Dim the seat once they are out. */
  out?: boolean;
}

/** The opponent row along the top of a table game. */
export function SeatStrip({ seats, onSeat }: { seats: SeatInfo[]; onSeat?: (i: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 9, padding: '0 20px 14px' }}>
      {seats.map((p, i) => {
        const inner = (
          <>
            <div
              style={{
                width: 30,
                height: 30,
                flex: 'none',
                borderRadius: '50%',
                background: p.grad,
                display: 'grid',
                placeItems: 'center',
                font: `800 12px ${outfit}`,
                color: '#fff',
              }}
            >
              {p.mark}
            </div>
            <div style={{ minWidth: 0, textAlign: 'left' }}>
              <div style={{ ...head(11), ...ellipsis }}>{p.name}</div>
              <div style={{ fontSize: 9.5, color: 'var(--dim2)' }}>{p.sub}</div>
            </div>
          </>
        );
        const style: CSSProperties = {
          flex: 1,
          ...row,
          gap: 9,
          padding: '9px 10px',
          borderRadius: 14,
          background: 'var(--panel)',
          border: `1px solid ${p.active ? 'var(--acc)' : 'transparent'}`,
          backdropFilter: 'var(--blur)',
          WebkitBackdropFilter: 'var(--blur)',
          boxShadow: p.active ? '0 0 14px rgba(139,164,255,.7)' : 'none',
          opacity: p.out ? 0.45 : 1,
          minWidth: 0,
        };
        return onSeat ? (
          <button key={i} onClick={() => onSeat(i)} style={{ ...style, appearance: 'none', cursor: 'pointer', color: 'var(--ink)' }}>
            {inner}
          </button>
        ) : (
          <div key={i} style={style}>
            {inner}
          </div>
        );
      })}
    </div>
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
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(6,9,15,.72)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 6,
        animation: 'vUp .25s',
      }}
      role="dialog"
      aria-modal
      aria-label={label ?? title}
    >
      <div
        style={{
          width,
          maxWidth: 'calc(100% - 44px)',
          padding: 24,
          borderRadius: 22,
          background: 'var(--panel)',
          border: '1px solid var(--line2)',
          backdropFilter: 'var(--blur)',
          WebkitBackdropFilter: 'var(--blur)',
          boxShadow: 'var(--spec)',
        }}
      >
        {title && <div style={{ font: `800 26px/1.05 ${outfit}`, letterSpacing: '-.02em' }}>{title}</div>}
        {blurb && <div style={{ fontSize: 12.5, color: 'var(--dim)', margin: '8px 0 18px' }}>{blurb}</div>}
        {children}
      </div>
    </div>
  );
}

/** The paired buttons at the foot of a round-over overlay. */
export function OverlayActions({
  secondary,
  primary,
}: {
  secondary: { label: string; onClick: () => void };
  primary: { label: string; onClick: () => void };
}) {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <button
        onClick={secondary.onClick}
        style={{
          appearance: 'none',
          flex: 1,
          padding: 14,
          borderRadius: 12,
          background: 'var(--panel2)',
          border: '1px solid var(--line)',
          cursor: 'pointer',
          color: 'var(--ink)',
          font: `800 13px ${outfit}`,
        }}
      >
        {secondary.label}
      </button>
      <button
        onClick={primary.onClick}
        style={{
          appearance: 'none',
          flex: 1,
          padding: 14,
          borderRadius: 12,
          background: 'var(--gradv)',
          border: 0,
          cursor: 'pointer',
          color: '#fff',
          font: `800 13px ${outfit}`,
          boxShadow: 'var(--glow)',
        }}
      >
        {primary.label}
      </button>
    </div>
  );
}

export const EMOTES = ['👀', '🤔', '😐', '🔥', '🤝'];

/** Tap emotes that float over the table. */
export function EmoteBar({ onEmote }: { onEmote: (e: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 7, padding: '0 20px 10px', justifyContent: 'center' }}>
      {EMOTES.map((e) => (
        <button
          key={e}
          onClick={() => onEmote(e)}
          className="hov-acc"
          style={{
            appearance: 'none',
            width: 38,
            height: 38,
            borderRadius: 12,
            background: 'var(--panel)',
            border: '1px solid var(--line)',
            backdropFilter: 'var(--blur)',
            WebkitBackdropFilter: 'var(--blur)',
            cursor: 'pointer',
            fontSize: 17,
            lineHeight: 1,
          }}
          aria-label={`React ${e}`}
        >
          {e}
        </button>
      ))}
    </div>
  );
}

/** The floating emote, shown over the table for a moment after a tap. */
export function FloatingEmote({ emote }: { emote: string | null }) {
  if (!emote) return null;
  return <div style={{ position: 'absolute', top: 6, fontSize: 40, animation: 'vFloat 1.5s ease-in-out', zIndex: 3 }}>{emote}</div>;
}

/** The outer frame of a game screen: full height, internal scrolling only. */
export function GameShell({ children, pad = '60px 0 26px' }: { children: ReactNode; pad?: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: pad, position: 'relative', zIndex: 1, minHeight: 0 }}>
      {children}
    </div>
  );
}

/** A line of status text under the table — whose turn it is, what just happened. */
export function TableLog({ text }: { text: string }) {
  return <div style={{ font: `700 12.5px ${outfit}`, color: 'var(--dim)', textAlign: 'center', padding: '0 20px' }}>{text}</div>;
}
