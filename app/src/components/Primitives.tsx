import type { CSSProperties, ReactNode } from 'react';
import { bare, glass, head, iconBtn, jakarta, outfit, row, track } from './ui';

/** A stroked 24×24 icon. Every glyph in the design is one path on this grid. */
export function Glyph({
  d,
  size = 18,
  stroke = 'currentColor',
  width = 2,
  glow,
  style,
}: {
  d: string;
  size?: number;
  stroke?: string;
  width?: number;
  /** Colour of the drop-shadow bloom, when the glyph should read as lit. */
  glow?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...(glow ? { filter: `drop-shadow(0 0 6px ${glow})` } : null), ...style }}
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

export const ArrowRight = ({ size = 19, stroke = '#fff' }: { size?: number; stroke?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={stroke}
    strokeWidth={2.6}
    strokeLinecap="round"
    style={{ marginLeft: 'auto' }}
    aria-hidden
  >
    <path d="M5 12h13M12 5l7 7-7 7" />
  </svg>
);

export const Chevron = ({ size = 17, stroke = 'currentColor' }: { size?: number; stroke?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={2.4} aria-hidden>
    <path d="M9 5l7 7-7 7" />
  </svg>
);

export const Close = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" aria-hidden>
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

/** Back chevron, in the tinted square used at the top-left of most screens. */
export function BackButton({ onClick, radius = 14, label = 'Back' }: { onClick: () => void; radius?: number; label?: string }) {
  return (
    <button onClick={onClick} style={iconBtn(radius)} aria-label={label}>
      <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden>
        <path d="M15 5l-7 7 7 7" />
      </svg>
    </button>
  );
}

/** A tinted-glass disc carrying a player's mark. */
export function Avatar({
  mark,
  grad,
  size,
  radius = '50%',
  fontSize,
  color = '#fff',
  style,
  children,
}: {
  mark: string;
  grad: string;
  size: number;
  radius?: number | string;
  fontSize?: number;
  color?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        flex: 'none',
        borderRadius: radius,
        background: grad,
        display: 'grid',
        placeItems: 'center',
        font: `800 ${fontSize ?? Math.round(size * 0.38)}px ${outfit}`,
        color,
        position: 'relative',
        ...style,
      }}
    >
      {mark}
      {children}
    </div>
  );
}

/** Header strip: back button, title, optional trailing content. */
export function ScreenHeader({
  onBack,
  title,
  subtitle,
  kickerText,
  radius = 14,
  right,
  pad = '0 20px 14px',
}: {
  onBack?: () => void;
  title?: string;
  subtitle?: string;
  /** Small caps label used instead of a title on the profile screens. */
  kickerText?: string;
  radius?: number;
  right?: ReactNode;
  pad?: string;
}) {
  return (
    <div style={{ ...row, gap: 10, padding: pad }}>
      {onBack && <BackButton onClick={onBack} radius={radius} />}
      {kickerText && (
        <div style={{ font: `800 9.5px ${outfit}`, letterSpacing: '.16em', color: 'var(--acc)', marginRight: 'auto' }}>
          {kickerText}
        </div>
      )}
      {title && (
        <div style={subtitle ? { marginRight: 'auto' } : { ...head(15), marginRight: right ? 'auto' : undefined }}>
          {subtitle ? (
            <>
              <div style={head(14.5)}>{title}</div>
              <div style={{ fontSize: 10.5, color: 'var(--dim2)', marginTop: 1 }}>{subtitle}</div>
            </>
          ) : (
            title
          )}
        </div>
      )}
      {right}
    </div>
  );
}

/** The pill toggle used for rules and preferences. */
export function Switch({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      aria-label={label}
      style={{
        appearance: 'none',
        width: 54,
        height: 30,
        flex: 'none',
        borderRadius: 999,
        background: on ? 'var(--gradv)' : 'var(--track)',
        border: `1px solid ${on ? 'transparent' : 'var(--line2)'}`,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        padding: 3,
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 2px 6px rgba(0,0,0,.4)',
          marginLeft: on ? 24 : 2,
          transition: 'margin-left .18s',
        }}
      />
    </button>
  );
}

/** A labelled −/+ control on a glass row. */
export function Stepper({
  name,
  hint,
  value,
  onDec,
  onInc,
}: {
  name: string;
  hint: string;
  value: string;
  onDec: () => void;
  onInc: () => void;
}) {
  const btn: CSSProperties = {
    appearance: 'none',
    width: 44,
    height: 44,
    flex: 'none',
    borderRadius: 15,
    background: 'var(--panel2)',
    border: '1px solid var(--line)',
    backdropFilter: 'var(--blur)',
    WebkitBackdropFilter: 'var(--blur)',
    boxShadow: 'var(--spec)',
    cursor: 'pointer',
    color: 'var(--ink)',
    font: `800 18px ${outfit}`,
  };
  return (
    <div style={{ ...row, gap: 11, padding: '11px 14px', ...glass(18) }}>
      <div style={{ marginRight: 'auto' }}>
        <div style={{ font: `600 13.5px ${jakarta}` }}>{name}</div>
        <div style={{ fontSize: 10.5, color: 'var(--dim2)', marginTop: 2 }}>{hint}</div>
      </div>
      <button onClick={onDec} style={btn} className="hov-accLt" aria-label={`Decrease ${name}`}>
        –
      </button>
      <div style={{ minWidth: 56, textAlign: 'center', font: `800 15px ${outfit}`, color: 'var(--accLt)' }}>{value}</div>
      <button onClick={onInc} style={btn} className="hov-accLt" aria-label={`Increase ${name}`}>
        +
      </button>
    </div>
  );
}

/** A glass row carrying a name, a hint and a switch. */
export function ToggleRow({
  name,
  hint,
  on,
  onToggle,
  icon,
}: {
  name: string;
  hint: string;
  on: boolean;
  onToggle: () => void;
  icon?: { d: string; neon: string };
}) {
  return (
    <div style={{ ...row, gap: 12, padding: '12px 14px', ...glass(18) }}>
      {icon && (
        <div
          style={{
            width: 36,
            height: 36,
            flex: 'none',
            borderRadius: 14,
            background: 'rgba(255,255,255,.05)',
            display: 'grid',
            placeItems: 'center',
            color: icon.neon,
          }}
        >
          <Glyph d={icon.d} width={1.9} />
        </div>
      )}
      <div style={{ marginRight: 'auto' }}>
        <div style={{ font: `600 13.5px ${jakarta}` }}>{name}</div>
        <div style={{ fontSize: 10.5, color: 'var(--dim2)', marginTop: 2 }}>{hint}</div>
      </div>
      <Switch on={on} onClick={onToggle} label={name} />
    </div>
  );
}

/** A thin progress bar. */
export function Bar({ pct, fill, height = 4, glow }: { pct: string; fill: string; height?: number; glow?: string }) {
  return (
    <div style={track(height)}>
      <div style={{ width: pct, height: '100%', background: fill, boxShadow: glow ? `0 0 8px ${glow}` : undefined }} />
    </div>
  );
}

/** Centred empty state: glyph tile, headline, blurb, optional action. */
export function EmptyState({
  d,
  title,
  blurb,
  action,
  pad = '44px 20px',
  tile = 62,
}: {
  d: string;
  title: string;
  blurb: string;
  action?: { label: string; onClick: () => void };
  pad?: string;
  tile?: number;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 13, padding: pad, textAlign: 'center' }}>
      <div
        style={{
          width: tile,
          height: tile,
          ...glass(tile > 60 ? 20 : 18),
          display: 'grid',
          placeItems: 'center',
          color: 'var(--dim2)',
        }}
      >
        <Glyph d={d} size={Math.round(tile * 0.43)} width={1.7} />
      </div>
      <div style={head(16)}>{title}</div>
      <div style={{ fontSize: 12.5, color: 'var(--dim)', maxWidth: 215 }}>{blurb}</div>
      {action && (
        <button
          onClick={action.onClick}
          style={{
            appearance: 'none',
            padding: '13px 22px',
            borderRadius: 999,
            border: 0,
            background: 'var(--gradv)',
            boxShadow: 'var(--glow)',
            cursor: 'pointer',
            color: '#fff',
            font: `800 13px ${outfit}`,
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/** A borderless button wrapping arbitrary content. */
export function Tap({
  onClick,
  style,
  children,
  className,
  ariaLabel,
}: {
  onClick: () => void;
  style?: CSSProperties;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <button onClick={onClick} style={{ ...bare, ...style }} className={className} aria-label={ariaLabel}>
      {children}
    </button>
  );
}
