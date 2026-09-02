import { useEffect, useRef } from 'react';
import { store } from '../store/useStore';
import type { Screen, State } from '../store/store';
import { RULES } from '../data/games';
import { Close, Glyph } from './Primitives';
import { glass, head, jakarta, kicker, outfit, row } from './ui';

/** The five soft light pools the glass refracts. */
export function LightPools() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background:
          'radial-gradient(120% 70% at 50% -10%,rgba(170,196,255,.34),transparent 66%),' +
          'radial-gradient(70% 42% at 10% 28%,rgba(139,164,255,.24),transparent 70%),' +
          'radial-gradient(80% 45% at 94% 60%,rgba(77,212,240,.18),transparent 72%),' +
          'radial-gradient(64% 36% at 24% 92%,rgba(52,211,166,.16),transparent 70%),' +
          'radial-gradient(50% 30% at 84% 96%,rgba(248,160,124,.13),transparent 72%)',
      }}
    />
  );
}

const TABS = [
  { key: 'HOME', d: 'M4 11l8-7 8 7v8a2 2 0 01-2 2H6a2 2 0 01-2-2z', on: (s: Screen) => s === 'home' || s === 'all', go: () => store.toHome() },
  {
    key: 'PLAY',
    d: 'M7 12.5h3M8.5 11v3M16 11.5v.01M18 13.5v.01',
    rect: true,
    on: (s: Screen) => s === 'config',
    go: () => store.go('config'),
  },
  { key: 'RANKS', d: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0z', on: (s: Screen) => s === 'board', go: () => store.go('board') },
  { key: 'YOU', d: 'M4.5 20a7.5 7.5 0 0115 0', circle: true, on: (s: Screen) => s === 'profile', go: () => store.go('profile') },
];

/** The floating glass tab bar. It holds its place on every tabbed screen. */
export function TabBar({ scr }: { scr: Screen }) {
  return (
    <nav
      style={{
        flex: 'none',
        margin: '6px 16px 28px',
        padding: 7,
        ...glass(20),
        display: 'grid',
        gridTemplateColumns: 'repeat(4,1fr)',
        gap: 4,
      }}
    >
      {TABS.map((t) => {
        const on = t.on(scr);
        return (
          <button
            key={t.key}
            onClick={t.go}
            aria-current={on ? 'page' : undefined}
            style={{
              appearance: 'none',
              border: 0,
              borderRadius: 14,
              padding: '11px 0',
              cursor: 'pointer',
              background: on ? 'var(--gradv)' : 'transparent',
              color: on ? '#fff' : 'var(--dim2)',
              boxShadow: on ? '0 0 16px rgba(150,180,255,.5)' : 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              font: `700 9px ${outfit}`,
            }}
          >
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
              {t.rect && <rect x="2" y="7" width="20" height="11" rx="5.5" />}
              {t.circle && <circle cx="12" cy="8" r="3.6" />}
              <path d={t.d} />
            </svg>
            {t.key}
          </button>
        );
      })}
    </nav>
  );
}

/** Table chat as a glass bottom sheet. */
export function ChatSheet({ s }: { s: State }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [s.chat.length]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 7,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        background: 'rgba(6,9,15,.5)',
      }}
    >
      <button onClick={store.closeChat} style={{ flex: 1, appearance: 'none', background: 'transparent', border: 0, cursor: 'default' }} aria-label="Close chat" />
      <div
        style={{
          borderRadius: '24px 24px 0 0',
          background: 'var(--panel)',
          border: '1px solid var(--line2)',
          backdropFilter: 'blur(26px) saturate(1.5)',
          WebkitBackdropFilter: 'blur(26px) saturate(1.5)',
          boxShadow: 'var(--spec)',
          padding: '16px 18px 30px',
          animation: 'vSlide .25s',
        }}
      >
        <div style={{ ...row, gap: 10, marginBottom: 14 }}>
          <div style={{ width: 34, height: 4, borderRadius: 999, background: 'var(--line2)', marginRight: 'auto' }} />
          <div style={kicker()}>TABLE CHAT</div>
          <button
            onClick={store.closeChat}
            style={{
              appearance: 'none',
              width: 30,
              height: 30,
              borderRadius: 10,
              background: 'transparent',
              border: '1px solid var(--line)',
              cursor: 'pointer',
              color: 'var(--dim)',
              display: 'grid',
              placeItems: 'center',
            }}
            aria-label="Close chat"
          >
            <Close size={14} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 190, overflowY: 'auto' }} className="scroll">
          {s.chat.map(([who, text], i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline', animation: 'vSlide .25s' }}>
              <div style={{ font: `800 10.5px ${outfit}`, color: who === 'You' ? 'var(--accLt)' : 'var(--dim)', minWidth: 46 }}>{who}</div>
              <div style={{ font: `500 13px/1.4 ${jakarta}`, color: 'var(--ink)' }}>{text}</div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            store.sendChat(s.chatInput.trim());
          }}
          style={{ ...row, gap: 9, marginTop: 14 }}
        >
          <div style={{ flex: 1, ...row, padding: '12px 15px', borderRadius: 999, background: 'var(--panel2)', border: '1px solid var(--line)' }}>
            <input
              value={s.chatInput}
              onChange={(e) => store.setChatInput(e.target.value)}
              placeholder="Say something"
              aria-label="Message the table"
              style={{
                flex: 1,
                minWidth: 0,
                appearance: 'none',
                background: 'transparent',
                border: 0,
                outline: 'none',
                color: 'var(--ink)',
                font: `500 13.5px ${jakarta}`,
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              appearance: 'none',
              width: 44,
              height: 44,
              flex: 'none',
              borderRadius: 14,
              background: 'var(--gradv)',
              border: 0,
              cursor: 'pointer',
              boxShadow: 'var(--glow)',
              display: 'grid',
              placeItems: 'center',
            }}
            aria-label="Send"
          >
            <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" aria-hidden>
              <path d="M4 12l16-8-7 8 7 8z" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}

/** How-to-play, reachable from the lobby and from inside a game. */
export function RulesSheet({ game }: { game: string }) {
  const steps = RULES[game] ?? RULES.UNO;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 7,
        background: 'rgba(6,9,15,.68)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
      role="dialog"
      aria-modal
      aria-label={`How to play ${game}`}
    >
      <div
        style={{
          width: '100%',
          padding: 22,
          borderRadius: 22,
          background: 'var(--panel)',
          border: '1px solid var(--line2)',
          backdropFilter: 'blur(26px) saturate(1.5)',
          WebkitBackdropFilter: 'blur(26px) saturate(1.5)',
          boxShadow: 'var(--spec)',
          animation: 'vUp .22s',
        }}
      >
        <div style={{ ...row, gap: 10, marginBottom: 16 }}>
          <div style={{ ...kicker('var(--acc)'), marginRight: 'auto' }}>HOW TO PLAY</div>
          <button
            onClick={store.closeRules}
            style={{
              appearance: 'none',
              width: 30,
              height: 30,
              borderRadius: 10,
              background: 'transparent',
              border: '1px solid var(--line)',
              cursor: 'pointer',
              color: 'var(--dim)',
              display: 'grid',
              placeItems: 'center',
            }}
            aria-label="Close"
          >
            <Close size={14} />
          </button>
        </div>
        <div style={{ ...head(24), lineHeight: 1.05, letterSpacing: '-.02em', marginBottom: 18 }}>{game}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {steps.map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div
                style={{
                  width: 26,
                  height: 26,
                  flex: 'none',
                  borderRadius: 9,
                  background: 'linear-gradient(160deg,rgba(139,164,255,.4),rgba(139,164,255,.12))',
                  border: '1px solid rgba(139,164,255,.35)',
                  display: 'grid',
                  placeItems: 'center',
                  font: `800 11px ${outfit}`,
                  color: 'var(--accLt)',
                }}
              >
                {i + 1}
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--ink)' }}>{t}</div>
            </div>
          ))}
        </div>
        <button
          onClick={store.closeRules}
          style={{
            appearance: 'none',
            width: '100%',
            marginTop: 20,
            padding: 15,
            borderRadius: 999,
            border: 0,
            background: 'var(--gradv)',
            boxShadow: 'var(--glow)',
            cursor: 'pointer',
            color: '#fff',
            font: `800 14px ${outfit}`,
          }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}

/** Connection-lost banner. Your seat is held while it shows. */
export function OfflineBanner() {
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 44, zIndex: 9, padding: '0 16px', animation: 'vSlide .25s' }} role="status">
      <div
        style={{
          ...row,
          gap: 10,
          padding: '11px 14px',
          borderRadius: 14,
          background: 'rgba(236,138,106,.16)',
          border: '1px solid rgba(236,138,106,.45)',
          backdropFilter: 'var(--blur)',
          WebkitBackdropFilter: 'var(--blur)',
          boxShadow: 'var(--spec)',
        }}
      >
        <Glyph d="M3 3l18 18M8.5 16.4a5 5 0 017 0M5 12.7a9 9 0 013.5-2.2M19 12.7a9 9 0 00-6-2.6M12 20v.01" size={16} stroke="#ec8a6a" width={2.2} style={{ flex: 'none' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={head(11.5)}>Connection lost</div>
          <div style={{ fontSize: 10.5, color: 'var(--dim)' }}>Your seat is held for 60 seconds</div>
        </div>
        <button
          onClick={store.toggleOffline}
          style={{
            appearance: 'none',
            height: 28,
            padding: '0 11px',
            borderRadius: 8,
            background: '#ec8a6a',
            border: 0,
            cursor: 'pointer',
            color: '#2a0f0a',
            font: `800 10.5px ${outfit}`,
          }}
        >
          RETRY
        </button>
      </div>
    </div>
  );
}

/** Transient confirmation, floating above the tab bar. */
export function Toast({ text }: { text: string }) {
  return (
    <div
      role="status"
      style={{
        position: 'absolute',
        left: 20,
        right: 20,
        bottom: 120,
        padding: '13px 16px',
        borderRadius: 15,
        background: 'var(--gradv)',
        boxShadow: 'var(--glow)',
        backdropFilter: 'var(--blur)',
        WebkitBackdropFilter: 'var(--blur)',
        color: '#fff',
        font: `700 13px ${outfit}`,
        animation: 'vSlide .25s',
        zIndex: 8,
      }}
    >
      {text}
    </div>
  );
}
