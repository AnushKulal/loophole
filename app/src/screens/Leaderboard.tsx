import { store, type State } from '../store/useStore';
import { PODIUM, RANKS, MARKS, grad } from '../data/people';
import { TINTS } from '../data/progression';
import { Glyph, ScreenHeader } from '../components/Primitives';
import { body, glass, head, kicker, outfit, row, screen, track } from '../components/ui';

const SCOPES: State['scope'][] = ['Global', 'Friends', 'Region'];

/** 13 · Leaderboard — podium, ranked rows, and a sticky "you". */
export default function Leaderboard({ s }: { s: State }) {
  return (
    <div style={{ ...screen('62px 0 0') }}>
      <ScreenHeader
        onBack={store.toHome}
        title="Rankings"
        pad="0 20px 12px"
        right={<Glyph d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0z" size={19} stroke="var(--gold)" glow="var(--gold)" />}
      />

      <div style={{ display: 'flex', gap: 6, padding: '0 20px 16px' }}>
        {SCOPES.map((n) => {
          const on = s.scope === n;
          return (
            <button
              key={n}
              onClick={() => store.setScope(n)}
              aria-pressed={on}
              style={{
                appearance: 'none',
                flex: 1,
                padding: '9px 0',
                borderRadius: 999,
                border: `1px solid ${on ? 'var(--acc)' : 'var(--line2)'}`,
                background: on ? 'var(--acc)' : 'transparent',
                color: on ? 'var(--onAcc)' : 'var(--dim)',
                cursor: 'pointer',
                font: `700 11.5px ${outfit}`,
              }}
            >
              {n}
            </button>
          );
        })}
      </div>

      {/* podium */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 16, padding: '0 20px 18px' }}>
        {PODIUM.map((p) => {
          const ring = p.place === 1 ? 72 : 58;
          return (
            <button
              key={p.name}
              onClick={() => store.openPlayer(p.name)}
              style={{
                appearance: 'none',
                background: 'transparent',
                border: 0,
                padding: 0,
                cursor: 'pointer',
                color: 'var(--ink)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                marginBottom: p.place === 1 ? 18 : 0,
              }}
            >
              <div style={{ position: 'relative', width: ring, height: ring, display: 'grid', placeItems: 'center' }}>
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${p.neon}`, boxShadow: `0 0 18px ${p.neon}` }} />
                <div
                  style={{
                    width: 'calc(100% - 11px)',
                    height: 'calc(100% - 11px)',
                    borderRadius: '50%',
                    background: grad(p.place + 1),
                    display: 'grid',
                    placeItems: 'center',
                    font: `800 18px ${outfit}`,
                    color: '#fff',
                  }}
                >
                  {p.mark}
                </div>
                <div
                  style={{
                    position: 'absolute',
                    bottom: -8,
                    padding: '3px 8px',
                    borderRadius: 7,
                    background: p.neon,
                    color: 'var(--onAcc)',
                    font: `800 8.5px ${outfit}`,
                  }}
                >
                  {p.rank}
                </div>
              </div>
              <div style={{ ...head(11.5), marginTop: 6 }}>{p.name}</div>
              <div style={{ fontSize: 9.5, color: 'var(--dim2)', whiteSpace: 'nowrap' }}>{p.pts} XP</div>
            </button>
          );
        })}
      </div>

      <div style={{ ...row, padding: '0 20px 10px' }}>
        <div style={{ ...kicker('var(--dim2)', '.16em'), marginRight: 'auto' }}>TOP PERFORMERS</div>
        <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="var(--dim2)" strokeWidth={2} aria-hidden>
          <path d="M4 6h16M4 12h10M4 18h6" />
        </svg>
      </div>

      <div style={body('0 20px')} className="scroll">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {RANKS.map((r) => (
            <button
              key={r.name}
              onClick={() => store.openPlayer(r.name)}
              className="hov-row"
              style={{ appearance: 'none', ...row, gap: 10, padding: '10px 12px', ...glass(15), cursor: 'pointer', color: 'var(--ink)', textAlign: 'left' }}
            >
              <div style={{ font: `800 11px ${outfit}`, color: 'var(--dim2)', minWidth: 13 }}>{r.n}</div>
              <div style={{ width: 32, height: 32, flex: 'none', borderRadius: '50%', background: grad(r.n), display: 'grid', placeItems: 'center', font: `800 12px ${outfit}`, color: '#fff' }}>
                {r.mark}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <div style={{ ...head(12), marginRight: 'auto' }}>{r.name}</div>
                  <div style={{ font: `700 10px ${outfit}`, color: 'var(--accLt)', whiteSpace: 'nowrap' }}>{r.pts} XP</div>
                </div>
                <div style={{ ...track(4), marginTop: 6 }}>
                  <div style={{ width: r.bar, height: '100%', background: 'var(--gradv)', boxShadow: '0 0 8px rgba(150,180,255,.7)' }} />
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* your standing, pinned */}
      <div style={{ padding: '12px 20px 0' }}>
        <div
          style={{
            ...row,
            gap: 10,
            padding: '11px 12px',
            borderRadius: 15,
            background: 'rgba(150,180,255,.16)',
            border: '1px solid var(--acc)',
            boxShadow: '0 0 22px rgba(150,180,255,.3)',
          }}
        >
          <div style={{ font: `800 11px ${outfit}`, color: 'var(--accLt)', minWidth: 13 }}>12</div>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: TINTS[s.tint].grad, display: 'grid', placeItems: 'center', font: `800 12px ${outfit}`, color: '#fff' }}>
            {MARKS[s.mark]}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <div style={{ ...head(12), marginRight: 'auto' }}>You</div>
              <div style={{ font: `700 9px ${outfit}`, color: 'var(--lime)', whiteSpace: 'nowrap' }}>LEVEL UP SOON</div>
            </div>
            <div style={{ ...track(4), marginTop: 6 }}>
              <div style={{ width: '68%', height: '100%', background: 'var(--lime)', boxShadow: '0 0 8px rgba(150,180,255,.7)' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
