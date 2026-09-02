import { useState } from 'react';
import { store, type State } from '../store/useStore';
import { GRADS, MARKS } from '../data/people';
import { ArrowRight, Glyph } from '../components/Primitives';
import { glass, head, jakarta, outfit, primary, screen, spacer } from '../components/ui';

/** The interlocking-rings mark. */
export function Loop({ size = 38, stroke = '#fff', width = 2 }: { size?: number; stroke?: string; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={width} aria-hidden>
      <circle cx="8.6" cy="12" r="5.2" />
      <circle cx="15.4" cy="12" r="5.2" />
    </svg>
  );
}

/** 01 · Splash — tap anywhere to enter. */
export function Splash() {
  const tiles = [
    { d: 'M9 9a3 3 0 114 2.8V13M12 17v.01M3 12a9 9 0 1018 0 9 9 0 00-18 0', tint: '139,164,255', c: 'var(--acc)', delay: '0s' },
    { d: 'M3 12a9 9 0 1018 0 9 9 0 00-18 0M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18', tint: '77,212,240', c: 'var(--cyan)', delay: '.6s' },
    { d: 'M3 15h14v-4H3zM7 11V8h6v3M17 13h4M5 19h10', tint: '52,211,166', c: 'var(--lime)', delay: '1.2s' },
  ];

  return (
    <button
      onClick={() => store.go('login')}
      style={{
        ...screen('80px 28px 66px', 'none'),
        justifyContent: 'center',
        gap: 30,
        appearance: 'none',
        background: 'transparent',
        border: 0,
        cursor: 'pointer',
        textAlign: 'left',
        color: 'var(--ink)',
        width: '100%',
      }}
      aria-label="Enter Loophole"
    >
      <div style={{ display: 'flex', gap: 9 }}>
        {tiles.map((t) => (
          <div
            key={t.c}
            style={{
              width: 46,
              height: 46,
              borderRadius: 16,
              background: `linear-gradient(160deg,rgba(${t.tint},.36),rgba(${t.tint},.1))`,
              border: `1px solid rgba(${t.tint},.5)`,
              backdropFilter: 'var(--blur)',
              WebkitBackdropFilter: 'var(--blur)',
              boxShadow: 'var(--spec)',
              display: 'grid',
              placeItems: 'center',
              animation: `vFloat 4s ease-in-out ${t.delay} infinite`,
            }}
          >
            <Glyph d={t.d} size={22} stroke={t.c} width={1.8} glow={t.c} />
          </div>
        ))}
      </div>

      <div>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 26,
            background: 'var(--gradv)',
            display: 'grid',
            placeItems: 'center',
            boxShadow: '0 0 30px rgba(150,180,255,.6)',
            marginBottom: 22,
          }}
        >
          <Loop />
        </div>
        <div style={{ font: `800 12px ${outfit}`, letterSpacing: '.2em', color: 'var(--accLt)' }}>GAME NIGHT, RANKED</div>
        <div style={{ font: `800 52px/1 ${outfit}`, letterSpacing: '-.03em', marginTop: 12 }}>Loophole</div>
        <p style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--dim)', margin: '14px 0 0', maxWidth: 278 }}>
          Fourteen party games, one lobby, one ladder. Somebody at this table is lying.
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '17px 22px',
          borderRadius: 18,
          background: 'var(--gradv)',
          boxShadow: 'var(--glow)',
          backdropFilter: 'var(--blur)',
          WebkitBackdropFilter: 'var(--blur)',
          animation: 'vGlow 2.6s infinite',
        }}
      >
        <div style={{ font: `700 16px ${outfit}`, color: '#fff' }}>Enter</div>
        <ArrowRight size={21} />
      </div>
    </button>
  );
}

/** 02 · Sign in — one field, or a provider. */
export function SignIn() {
  const [handle, setHandle] = useState('');
  const go = () => store.go('onboard');

  return (
    <div style={{ ...screen('82px 26px 44px') }}>
      <div style={{ font: `800 10px ${outfit}`, letterSpacing: '.18em', color: 'var(--acc)' }}>SIGN IN</div>
      <div style={{ font: `800 32px/1.1 ${outfit}`, letterSpacing: '-.02em', margin: '12px 0 8px' }}>Welcome back</div>
      <p style={{ fontSize: 14, color: 'var(--dim)', margin: '0 0 24px', maxWidth: 272 }}>
        One field. Email or phone — we'll work out which and send a code if we need one.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '15px 16px', ...glass(18) }}>
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--acc)" strokeWidth={2} aria-hidden>
            <rect x="2.5" y="5" width="19" height="14" rx="3" />
            <path d="M3 8l9 6 9-6" />
          </svg>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="Email or phone number"
            aria-label="Email or phone number"
            style={{
              flex: 1,
              minWidth: 0,
              appearance: 'none',
              background: 'transparent',
              border: 0,
              outline: 'none',
              color: 'var(--ink)',
              font: `500 15px ${jakarta}`,
            }}
          />
        </div>
        <button
          type="submit"
          style={{ ...primary(999), marginTop: 10, display: 'flex', alignItems: 'center', gap: 12, padding: '17px 20px', font: `700 15.5px ${outfit}`, width: '100%' }}
        >
          Continue
          <ArrowRight />
        </button>
      </form>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0' }}>
        <div style={{ height: 1, flex: 1, background: 'var(--line)' }} />
        <div style={{ font: `800 9px ${outfit}`, letterSpacing: '.16em', color: 'var(--dim2)' }}>OR</div>
        <div style={{ height: 1, flex: 1, background: 'var(--line)' }} />
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={go}
          className="hov-acc"
          style={{
            appearance: 'none',
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 9,
            padding: 15,
            ...glass(18),
            cursor: 'pointer',
            color: 'var(--ink)',
            font: `600 13.5px ${jakarta}`,
          }}
        >
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: 8,
              background: 'linear-gradient(135deg,var(--g2),var(--ink))',
              display: 'grid',
              placeItems: 'center',
              font: `800 11px ${outfit}`,
              color: 'var(--bg)',
            }}
          >
            G
          </div>
          Google
        </button>
        <button
          onClick={go}
          className="hov-cyan"
          style={{
            appearance: 'none',
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 9,
            padding: 15,
            ...glass(18),
            cursor: 'pointer',
            color: 'var(--ink)',
            font: `600 13.5px ${jakarta}`,
          }}
        >
          <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth={2} aria-hidden>
            <rect x="6" y="2.5" width="12" height="19" rx="3" />
            <path d="M11 18.5h2" />
          </svg>
          Phone
        </button>
      </div>

      <div style={spacer(18)} />

      <button
        onClick={go}
        className="hov-acc"
        style={{
          appearance: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 13,
          padding: 9,
          borderRadius: 18,
          background: 'transparent',
          border: '1px solid var(--line2)',
          cursor: 'pointer',
          color: 'var(--ink)',
        }}
      >
        <div style={{ width: 38, height: 38, flex: 'none', borderRadius: 14, background: 'var(--gradv)', display: 'grid', placeItems: 'center' }}>
          <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
        </div>
        <div style={head(14.5)}>Create new account</div>
      </button>
    </div>
  );
}

/** 03 · Onboarding — name yourself and pick a mark. */
export function Onboarding({ s }: { s: State }) {
  return (
    <div style={{ ...screen('82px 26px 44px') }}>
      <div style={{ display: 'flex', gap: 5, marginBottom: 22 }}>
        {[true, true, false].map((on, i) => (
          <div
            key={i}
            style={{
              height: 4,
              flex: 1,
              borderRadius: 999,
              background: on ? 'var(--acc)' : 'rgba(255,255,255,.12)',
              boxShadow: on ? '0 0 8px rgba(150,180,255,.8)' : undefined,
            }}
          />
        ))}
      </div>

      <div style={{ font: `800 28px/1.1 ${outfit}`, letterSpacing: '-.02em' }}>
        Create your
        <br />
        player card
      </div>

      <div style={{ marginTop: 20, padding: '15px 16px', ...glass(18), display: 'flex', alignItems: 'center', gap: 12 }}>
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--acc)" strokeWidth={2} aria-hidden>
          <circle cx="12" cy="8" r="3.6" />
          <path d="M4.5 20a7.5 7.5 0 0115 0" />
        </svg>
        <input
          value={s.myName}
          onChange={(e) => store.setName(e.target.value)}
          aria-label="Your name"
          style={{
            flex: 1,
            minWidth: 0,
            appearance: 'none',
            background: 'transparent',
            border: 0,
            outline: 'none',
            color: 'var(--ink)',
            font: `600 16px ${jakarta}`,
          }}
        />
      </div>

      <div style={{ font: `800 9.5px ${outfit}`, letterSpacing: '.16em', color: 'var(--dim2)', margin: '22px 0 12px' }}>CHOOSE A MARK</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 11 }}>
        {MARKS.map((m, i) => (
          <button
            key={m}
            onClick={() => store.pickMark(i)}
            aria-label={`Mark ${i + 1}`}
            aria-pressed={s.mark === i}
            style={{
              appearance: 'none',
              aspectRatio: '1',
              borderRadius: 18,
              background: GRADS[i % GRADS.length],
              border: `2px solid ${s.mark === i ? 'var(--acc)' : 'transparent'}`,
              boxShadow: s.mark === i ? '0 0 18px rgba(150,180,255,.7)' : 'none',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              font: `800 21px ${outfit}`,
              color: '#fff',
            }}
          >
            {m}
          </button>
        ))}
      </div>

      <div style={spacer(18)} />

      <button
        onClick={() => store.go('home')}
        style={{ ...primary(999), display: 'flex', alignItems: 'center', gap: 12, padding: '18px 22px', font: `700 15.5px ${outfit}` }}
      >
        Enter Loophole
        <ArrowRight />
      </button>
    </div>
  );
}
