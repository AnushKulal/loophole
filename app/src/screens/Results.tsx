import { store, type State } from '../store/useStore';
import { AWARDS } from '../data/progression';
import { Glyph } from '../components/Primitives';
import { body, glass, head, kicker, outfit, row, screen } from '../components/ui';

const CONFETTI = Array.from({ length: 12 }, (_, i) => ({
  left: `${4 + i * 8}%`,
  bg: ['var(--acc)', 'var(--acc)', 'var(--ink)', 'var(--g2)', 'var(--g2)', 'var(--ink)'][i % 6],
  anim: `vFall ${2.2 + (i % 4) * 0.5}s linear ${i * 0.18}s infinite`,
  size: `${i % 3 === 0 ? 9 : 6}px`,
}));

/** 10 · Results — the scoreboard, post-game highlights and what to do next. */
export default function Results({ s }: { s: State }) {
  const r = s.result;
  if (!r) return null;
  const won = !!r.rows[0]?.win;

  return (
    <div style={{ ...screen('62px 0 38px') }}>
      {won && (
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          {CONFETTI.map((c, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                top: -20,
                left: c.left,
                width: c.size,
                height: c.size,
                borderRadius: 2,
                background: c.bg,
                animation: c.anim,
              }}
            />
          ))}
        </div>
      )}

      <div style={{ padding: '0 20px', position: 'relative' }}>
        <div style={{ ...row, gap: 9 }}>
          <div style={kicker('var(--accLt)')}>{r.game}</div>
          <div
            style={{
              marginLeft: 'auto',
              padding: '5px 11px',
              borderRadius: 10,
              background: 'rgba(150,180,255,.14)',
              border: '1px solid rgba(150,180,255,.35)',
              color: 'var(--lime)',
              font: `800 11px ${outfit}`,
            }}
          >
            {r.xp} XP
          </div>
        </div>
        <div style={{ font: `800 40px/.96 ${outfit}`, letterSpacing: '-.03em', margin: '12px 0 8px' }}>{r.head}</div>
        <div style={{ fontSize: 13.5, color: 'var(--dim)' }}>{r.kicker}</div>
      </div>

      <div style={body('18px 20px 0')} className="scroll">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {r.rows.map((x, i) => (
            <div
              key={i}
              style={{
                ...row,
                gap: 12,
                padding: '12px 14px',
                borderRadius: 18,
                background: x.win ? 'rgba(150,180,255,.16)' : 'var(--panel)',
                border: `1px solid ${x.win ? 'var(--acc)' : 'var(--line)'}`,
                boxShadow: x.win ? '0 0 20px rgba(150,180,255,.3)' : 'none',
                animation: 'vSlide .4s both',
                animationDelay: `${i * 80}ms`,
              }}
            >
              <div style={{ font: `800 11px ${outfit}`, color: 'var(--dim2)', minWidth: 12 }}>{i + 1}</div>
              <div style={{ width: 38, height: 38, flex: 'none', borderRadius: '50%', background: x.grad, display: 'grid', placeItems: 'center', font: `800 15px ${outfit}`, color: '#fff' }}>
                {x.mark}
              </div>
              <div style={{ marginRight: 'auto' }}>
                <div style={head(14.5)}>{x.n}</div>
                <div style={{ fontSize: 11, color: 'var(--dim2)', marginTop: 2 }}>{x.d}</div>
              </div>
              <div style={{ font: `800 14px ${outfit}`, color: 'var(--accLt)' }}>{x.s}</div>
            </div>
          ))}
        </div>

        <div style={{ ...kicker(), margin: '18px 0 9px' }}>HIGHLIGHTS</div>
        <div className="rail" style={{ display: 'flex', gap: 9, overflowX: 'auto', paddingBottom: 4 }}>
          {AWARDS.map((a) => (
            <div key={a.name} style={{ flex: 'none', width: 150, padding: 13, ...glass(16), animation: 'vPop .34s' }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 11,
                  background: 'var(--tile)',
                  border: '1px solid var(--line)',
                  display: 'grid',
                  placeItems: 'center',
                  color: a.tint,
                  marginBottom: 10,
                }}
              >
                <Glyph d={a.d} width={1.8} glow={a.tint} />
              </div>
              <div style={head(12.5)}>{a.name}</div>
              <div style={{ fontSize: 10.5, color: 'var(--dim)', marginTop: 3, lineHeight: 1.35 }}>{a.sub}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 9, marginTop: 14, padding: '13px 15px', ...glass(15) }}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--accLt)" strokeWidth={2.2} style={{ flex: 'none', marginTop: 1 }} aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v.01M12 11v5" />
          </svg>
          <p style={{ fontSize: 12, color: 'var(--dim)', margin: 0 }}>{r.note}</p>
        </div>
      </div>

      <div style={{ padding: '14px 20px 0' }}>
        <button
          onClick={store.startGame}
          style={{
            appearance: 'none',
            width: '100%',
            ...row,
            gap: 12,
            padding: '17px 20px',
            borderRadius: 999,
            border: 0,
            background: 'var(--gradv)',
            boxShadow: 'var(--glow)',
            cursor: 'pointer',
            font: `700 15.5px ${outfit}`,
            color: '#fff',
          }}
        >
          Play again
          <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" style={{ marginLeft: 'auto' }} aria-hidden>
            <path d="M20 12a8 8 0 11-2.3-5.7M20 4v4h-4" />
          </svg>
        </button>
        <div style={{ display: 'flex', gap: 10, marginTop: 9 }}>
          <button
            onClick={() => store.go('all')}
            style={{ appearance: 'none', flex: 1, padding: 14, borderRadius: 15, ...glass(15), border: '1px solid var(--line2)', cursor: 'pointer', color: 'var(--ink)', font: `800 13px ${outfit}` }}
          >
            Change game
          </button>
          <button
            onClick={store.toHome}
            style={{ appearance: 'none', flex: 1, padding: 14, borderRadius: 15, background: 'transparent', border: '1px solid transparent', cursor: 'pointer', color: 'var(--pink)', font: `800 13px ${outfit}` }}
          >
            Leave lobby
          </button>
        </div>
      </div>
    </div>
  );
}
