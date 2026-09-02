import { store, type State } from '../store/useStore';
import { BADGES } from '../data/progression';
import { DIM, NEON, gameByName } from '../data/games';
import { FRIENDS, grad } from '../data/people';
import { Glyph, ScreenHeader } from '../components/Primitives';
import { Radar } from '../components/Radar';
import { body, glass, head, kicker, outfit, row, screen } from '../components/ui';

const TRIO = [
  { k: 'MATCHES', v: '208' },
  { k: 'WIN RATE', v: '68%' },
  { k: 'ODD ONE', v: '5.1' },
];

const SHARED = ['Imposter Quiz', 'UNO', 'Connect 4', 'GeoGuesser'];

/** 12 · Player card — someone else's profile, with Challenge and Message. */
export default function PlayerCard({ s }: { s: State }) {
  const who = FRIENDS.find((f) => f.name === s.who) ?? FRIENDS[0];

  return (
    <div style={{ ...screen('62px 0 34px') }}>
      <ScreenHeader
        onBack={() => store.go('friends')}
        kickerText="PLAYER CARD"
        pad="0 20px 10px"
        right={
          <button
            onClick={() => store.openDm(who.name)}
            style={{ ...glass(14), appearance: 'none', width: 36, height: 36, cursor: 'pointer', color: 'var(--ink)', display: 'grid', placeItems: 'center' }}
            aria-label={`Message ${who.name}`}
          >
            <Glyph d="M21 12a8 8 0 01-8 8H8l-5 3 1.5-5A8 8 0 1121 12z" size={16} width={2.2} />
          </button>
        }
      />

      <div style={{ ...body('0 20px 8px'), display: 'flex', flexDirection: 'column', alignItems: 'center' }} className="scroll">
        <div style={{ position: 'relative', width: 104, height: 104, display: 'grid', placeItems: 'center', marginTop: 4 }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'conic-gradient(var(--g2) 44%, var(--track) 0)' }} />
          <div style={{ position: 'absolute', inset: 5, borderRadius: '50%', background: 'var(--bg)' }} />
          <div style={{ position: 'relative', width: 86, height: 86, borderRadius: '50%', background: grad(who.gi), display: 'grid', placeItems: 'center', font: `800 32px ${outfit}`, color: '#fff' }}>
            {who.mark}
          </div>
          <div
            style={{
              position: 'absolute',
              bottom: -6,
              padding: '4px 11px',
              borderRadius: 8,
              background: 'var(--cyan)',
              font: `800 9px ${outfit}`,
              color: 'var(--onCyan)',
              boxShadow: '0 0 14px rgba(150,180,255,.7)',
            }}
          >
            LVL {who.lvl}
          </div>
        </div>

        <div style={{ ...head(21), marginTop: 16 }}>{who.name}</div>
        <div style={{ ...row, gap: 7, marginTop: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--lime)' }} />
          <div style={{ fontSize: 11.5, color: 'var(--dim)' }}>{who.status}</div>
        </div>

        <div style={{ display: 'flex', gap: 9, width: '100%', marginTop: 16 }}>
          <button
            onClick={() => store.flash(`Challenge sent to ${who.name}`)}
            style={{
              appearance: 'none',
              flex: 1.3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: 14,
              borderRadius: 999,
              border: 0,
              background: 'var(--gradv)',
              boxShadow: 'var(--glow)',
              cursor: 'pointer',
              color: '#fff',
              font: `800 13px ${outfit}`,
            }}
          >
            <Glyph d="M13 2L4 14h6l-1 8 9-12h-6z" size={16} stroke="#fff" width={2.4} />
            Challenge
          </button>
          <button
            onClick={() => store.openDm(who.name)}
            style={{ appearance: 'none', flex: 1, padding: 14, borderRadius: 15, ...glass(15), border: '1px solid var(--line2)', cursor: 'pointer', color: 'var(--ink)', font: `800 13px ${outfit}` }}
          >
            Message
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, width: '100%', marginTop: 10 }}>
          {TRIO.map((t) => (
            <div key={t.k} style={{ flex: 1, padding: '12px 10px', ...glass(15), textAlign: 'center' }}>
              <div style={head(19)}>{t.v}</div>
              <div style={{ fontSize: 9, letterSpacing: '.1em', color: 'var(--dim2)', marginTop: 4 }}>{t.k}</div>
            </div>
          ))}
        </div>

        <div style={{ width: '100%', ...kicker(), margin: '20px 0 10px' }}>GAMES YOU BOTH PLAY</div>
        <div className="rail" style={{ width: '100%', display: 'flex', gap: 9, overflowX: 'auto', paddingBottom: 4 }}>
          {SHARED.map((n) => {
            const g = gameByName(n);
            return (
              <button
                key={n}
                onClick={() => store.flash(`Challenge: ${n}`)}
                className="hov-acc"
                style={{
                  appearance: 'none',
                  flex: 'none',
                  width: 96,
                  padding: 12,
                  ...glass(18),
                  cursor: 'pointer',
                  color: 'var(--ink)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 9,
                  alignItems: 'flex-start',
                }}
              >
                <div style={{ width: 34, height: 34, borderRadius: 13, background: DIM[g.cat], display: 'grid', placeItems: 'center' }}>
                  <Glyph d={g.d} size={18} stroke={NEON[g.cat]} width={1.8} />
                </div>
                <div style={{ font: `800 10.5px ${outfit}`, lineHeight: 1.2, textAlign: 'left' }}>{g.name}</div>
              </button>
            );
          })}
        </div>

        <div style={{ width: '100%', ...kicker(), margin: '20px 0 2px' }}>PERFORMANCE MATRIX</div>
        <div style={{ width: '100%', display: 'grid', placeItems: 'center', padding: '4px 0' }}>
          <Radar points="110,22 192,70 148,158 68,142 34,80" stroke="var(--g2)" fill="rgba(150,180,255,.28)" width={204} height={176} />
        </div>

        <div style={{ width: '100%', display: 'flex', gap: 8 }}>
          {BADGES.map((b) => (
            <div key={b.name} style={{ flex: 1, aspectRatio: '1', ...glass(15), display: 'grid', placeItems: 'center', color: b.neon }} title={b.name}>
              <Glyph d={b.d} size={19} width={1.8} glow={b.neon} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
