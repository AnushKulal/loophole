import { store, type State } from '../store/useStore';
import { BADGES, TINTS } from '../data/progression';
import { GAMES } from '../data/games';
import { MARKS } from '../data/people';
import { Bar, Glyph, ScreenHeader } from '../components/Primitives';
import { Radar } from '../components/Radar';
import { body, glass, head, kicker, outfit, row, screen, track } from '../components/ui';

const TRIO = [
  { k: 'MATCHES', v: '142' },
  { k: 'WIN RATE', v: '61%' },
  { k: 'ODD ONE', v: '4.2' },
];

const PER_GAME = [
  { name: 'Imposter Quiz', rate: '73%', neon: 'var(--acc)', gi: 2 },
  { name: 'GeoGuesser', rate: '58%', neon: 'var(--acc)', gi: 5 },
  { name: 'UNO', rate: '48%', neon: 'var(--cyan)', gi: 6 },
  { name: 'Connect 4', rate: '75%', neon: 'var(--cyan)', gi: 11 },
  { name: 'Chess', rate: '20%', neon: 'var(--g2)', gi: 9 },
];

const HISTORY = [
  { game: 'Imposter Quiz', when: 'Tonight', result: 'SURVIVED', tint: 'var(--lime)', bg: 'rgba(52,211,166,.16)', xp: '+320' },
  { game: 'Connect 4', when: 'Tonight', result: 'WON', tint: 'var(--lime)', bg: 'rgba(52,211,166,.16)', xp: '+180' },
  { game: 'Ludo', when: 'Yesterday', result: 'LOST', tint: 'var(--pink)', bg: 'rgba(244,144,192,.16)', xp: '+20' },
  { game: "Liar's Bar", when: 'Sunday', result: 'LOST', tint: 'var(--pink)', bg: 'rgba(244,144,192,.16)', xp: '+30' },
];

/** 11 · My profile — level ring, stats, achievements, matrix, per-game and history. */
export default function Profile({ s }: { s: State }) {
  const myGrad = TINTS[s.tint].grad;

  return (
    <div style={{ ...screen('62px 0 0') }}>
      <ScreenHeader
        onBack={store.toHome}
        kickerText="PLAYER CARD"
        pad="0 20px 10px"
        right={
          <button
            onClick={() => store.go('settings')}
            style={{ ...glass(14), appearance: 'none', width: 36, height: 36, cursor: 'pointer', color: 'var(--ink)', display: 'grid', placeItems: 'center' }}
            aria-label="Settings"
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <circle cx="12" cy="12" r="3" />
              <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
            </svg>
          </button>
        }
      />

      <div style={{ ...body('0 20px 10px'), display: 'flex', flexDirection: 'column', alignItems: 'center' }} className="scroll">
        {/* level ring */}
        <div style={{ position: 'relative', width: 112, height: 112, display: 'grid', placeItems: 'center', marginTop: 6 }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'conic-gradient(var(--acc) 68%, var(--track) 0)' }} />
          <div style={{ position: 'absolute', inset: 5, borderRadius: '50%', background: 'var(--bg)' }} />
          <div style={{ position: 'relative', width: 92, height: 92, borderRadius: '50%', background: myGrad, display: 'grid', placeItems: 'center', font: `800 34px ${outfit}`, color: '#fff' }}>
            {MARKS[s.mark]}
          </div>
          <div
            style={{
              position: 'absolute',
              bottom: -6,
              padding: '4px 12px',
              borderRadius: 8,
              background: 'var(--acc)',
              font: `800 9.5px ${outfit}`,
              color: 'var(--onAcc)',
              boxShadow: '0 0 14px rgba(150,180,255,.7)',
            }}
          >
            LVL 24
          </div>
        </div>

        <div style={{ ...head(22), marginTop: 18 }}>{s.myName}</div>
        <div style={{ fontSize: 11.5, color: 'var(--accLt)', marginTop: 5 }}>Odd One specialist · Chennai</div>

        <div style={{ width: '100%', marginTop: 16, padding: '12px 14px', ...glass(15) }}>
          <div style={{ display: 'flex', fontSize: 9.5, letterSpacing: '.1em', color: 'var(--dim2)' }}>
            <span style={{ marginRight: 'auto' }}>PROGRESS TO LVL 25</span>
            <span style={{ color: 'var(--accLt)', fontWeight: 700 }}>12,450 / 15,000 XP</span>
          </div>
          <div style={{ ...track(6), marginTop: 8 }}>
            <div style={{ width: '68%', height: '100%', background: 'var(--gradv)', boxShadow: '0 0 10px rgba(150,180,255,.8)' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, width: '100%', marginTop: 10 }}>
          {TRIO.map((t) => (
            <div key={t.k} style={{ flex: 1, padding: '12px 10px', ...glass(15), textAlign: 'center' }}>
              <div style={head(19)}>{t.v}</div>
              <div style={{ fontSize: 9, letterSpacing: '.1em', color: 'var(--dim2)', marginTop: 4 }}>{t.k}</div>
            </div>
          ))}
        </div>

        <div style={{ width: '100%', display: 'flex', alignItems: 'baseline', margin: '20px 0 10px' }}>
          <div style={{ ...kicker(), marginRight: 'auto' }}>ACHIEVEMENTS</div>
          <div style={{ fontSize: 10, color: 'var(--acc)' }}>5 of 24</div>
        </div>
        <div style={{ width: '100%', display: 'flex', gap: 8 }}>
          {BADGES.map((b) => (
            <div key={b.name} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ width: '100%', aspectRatio: '1', ...glass(15), display: 'grid', placeItems: 'center', color: b.neon }}>
                <Glyph d={b.d} size={20} width={1.8} glow={b.neon} />
              </div>
              <div style={{ fontSize: 9.5, color: 'var(--dim2)', textAlign: 'center', lineHeight: 1.2 }}>{b.name}</div>
            </div>
          ))}
        </div>

        <div style={{ width: '100%', ...kicker(), margin: '20px 0 2px' }}>PERFORMANCE MATRIX</div>
        <div style={{ width: '100%', display: 'grid', placeItems: 'center', padding: '4px 0' }}>
          <Radar points="110,30 186,72 152,152 74,148 38,74" stroke="var(--acc)" fill="rgba(150,180,255,.34)" spokes />
        </div>

        <div style={{ width: '100%', ...kicker(), margin: '14px 0 10px' }}>PER GAME</div>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {PER_GAME.map((p) => (
            <div key={p.name} style={{ ...row, gap: 11, padding: '10px 13px', ...glass(15) }}>
              <div style={{ width: 32, height: 32, flex: 'none', borderRadius: 13, background: 'rgba(255,255,255,.05)', display: 'grid', placeItems: 'center', color: p.neon }}>
                <Glyph d={GAMES[p.gi].d} size={17} width={1.8} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline' }}>
                  <div style={{ ...head(12.5), marginRight: 'auto' }}>{p.name}</div>
                  <div style={{ font: `800 11.5px ${outfit}`, color: p.neon }}>{p.rate}</div>
                </div>
                <div style={{ marginTop: 6 }}>
                  <Bar pct={p.rate} fill={p.neon} glow={p.neon} />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ width: '100%', ...kicker(), margin: '20px 0 10px' }}>RECENT</div>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {HISTORY.map((h) => (
            <div key={h.game + h.when} style={{ ...row, gap: 10, padding: '11px 13px', ...glass(15) }}>
              <div style={{ ...head(12.5), marginRight: 'auto' }}>{h.game}</div>
              <div style={{ fontSize: 10, color: 'var(--dim2)' }}>{h.when}</div>
              <div style={{ font: `800 10px ${outfit}`, color: 'var(--accLt)' }}>{h.xp}</div>
              <div style={{ padding: '4px 9px', borderRadius: 8, background: h.bg, color: h.tint, font: `800 9px ${outfit}` }}>{h.result}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
