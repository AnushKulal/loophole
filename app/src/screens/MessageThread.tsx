import { useEffect, useRef } from 'react';
import { store, type State } from '../store/useStore';
import { FRIENDS, GRADV, grad } from '../data/people';
import { BackButton } from '../components/Primitives';
import { glass, head, jakarta, outfit, row, screen } from '../components/ui';

const QUICK = ['Join my lobby', 'One more?', 'Code incoming'];

/** 15 · Message thread — a real DM with quick replies and a typing indicator. */
export default function MessageThread({ s }: { s: State }) {
  const who = FRIENDS.find((f) => f.name === s.dmWith);
  const messages = (s.dmWith && s.threads[s.dmWith]) || [];
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages.length, s.typing]);

  return (
    <div style={{ ...screen('62px 0 0') }}>
      <div style={{ ...row, gap: 10, padding: '0 20px 12px', borderBottom: '1px solid var(--line)' }}>
        <BackButton onClick={() => store.go('friends')} />
        <button
          onClick={() => s.dmWith && store.openPlayer(s.dmWith)}
          style={{ appearance: 'none', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', ...row, gap: 10, marginRight: 'auto', color: 'var(--ink)', textAlign: 'left' }}
        >
          <div style={{ width: 38, height: 38, flex: 'none', borderRadius: '50%', background: who ? grad(who.gi) : GRADV, display: 'grid', placeItems: 'center', font: `800 15px ${outfit}`, color: '#fff' }}>
            {who?.mark}
          </div>
          <div>
            <div style={head(14.5)}>{s.dmWith}</div>
            <div style={{ fontSize: 10.5, color: 'var(--dim2)' }}>{who?.status}</div>
          </div>
        </button>
        <button
          onClick={() => store.flash(`Lobby invite sent to ${s.dmWith}`)}
          style={{
            appearance: 'none',
            height: 34,
            padding: '0 13px',
            borderRadius: 12,
            background: 'rgba(150,180,255,.14)',
            border: '1px solid rgba(150,180,255,.3)',
            cursor: 'pointer',
            color: 'var(--lime)',
            font: `800 11.5px ${outfit}`,
          }}
        >
          Invite
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 8px', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8 }} className="scroll">
        {messages.map(([from, text], i) => {
          const mine = from === 'me';
          return (
            <div
              key={i}
              style={{
                alignSelf: mine ? 'flex-end' : 'flex-start',
                maxWidth: '76%',
                padding: '11px 15px',
                borderRadius: mine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                background: mine ? 'var(--gradv)' : 'var(--panel)',
                color: mine ? '#fff' : 'var(--ink)',
                border: '1px solid var(--line)',
                font: `500 13.5px/1.4 ${jakarta}`,
                animation: 'vSlide .3s both',
                animationDelay: `${Math.min(i * 60, 400)}ms`,
              }}
            >
              {text}
            </div>
          );
        })}

        {s.typing && (
          <div style={{ alignSelf: 'flex-start', display: 'flex', gap: 5, padding: '13px 15px', borderRadius: '18px 14px 14px 4px', ...glass(14) }}>
            {[0, 0.15, 0.3].map((d) => (
              <div key={d} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--dim)', animation: `vDots 1s ${d}s infinite` }} />
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="rail" style={{ padding: '0 20px 8px', display: 'flex', gap: 7, overflowX: 'auto' }}>
        {QUICK.map((q) => (
          <button
            key={q}
            onClick={() => store.sendDm(q)}
            className="hov-ink"
            style={{ appearance: 'none', flex: 'none', padding: '8px 14px', ...glass(12), color: 'var(--dim)', cursor: 'pointer', font: `600 11.5px ${jakarta}`, whiteSpace: 'nowrap' }}
          >
            {q}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          store.sendDm(s.dmInput.trim());
        }}
        style={{ ...row, gap: 10, padding: '8px 18px 30px' }}
      >
        <div style={{ flex: 1, ...row, gap: 10, padding: '12px 16px', ...glass(15) }}>
          <input
            value={s.dmInput}
            onChange={(e) => store.setDmInput(e.target.value)}
            placeholder="Message…"
            aria-label={`Message ${s.dmWith}`}
            style={{ flex: 1, minWidth: 0, appearance: 'none', background: 'transparent', border: 0, outline: 'none', color: 'var(--ink)', font: `500 13.5px ${jakarta}` }}
          />
        </div>
        <button
          type="submit"
          style={{ appearance: 'none', width: 46, height: 46, flex: 'none', borderRadius: 16, background: 'var(--gradv)', border: 0, cursor: 'pointer', boxShadow: 'var(--glow)', display: 'grid', placeItems: 'center' }}
          aria-label="Send"
        >
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" aria-hidden>
            <path d="M4 12l16-8-7 8 7 8z" />
          </svg>
        </button>
      </form>
    </div>
  );
}
