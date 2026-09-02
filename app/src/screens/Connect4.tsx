import { store, type State } from '../store/useStore';
import { COLS, ROWS } from '../game/connect4';
import { GRADBOT, GRADV, MARKS } from '../data/people';
import { TINTS } from '../data/progression';
import { Close } from '../components/Primitives';
import { glass, head, outfit, row } from '../components/ui';

/** 09 · Connect 4 — really playable, against a bot that blocks and wins. */
export default function Connect4({ s }: { s: State }) {
  const myGrad = TINTS[s.tint].grad;
  const oppName = s.mode === 'friends' ? 'Divya' : 'Bot';
  const oppMark = s.mode === 'friends' ? '▲' : 'B';
  const live = !s.winner;

  const panel = (active: boolean) => ({
    flex: 1,
    ...row,
    gap: 10,
    padding: '11px 12px',
    borderRadius: 18,
    background: active ? 'rgba(150,180,255,.16)' : 'var(--panel)',
    border: `1px solid ${active ? 'var(--acc)' : 'var(--line)'}`,
  });

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '60px 0 38px', position: 'relative', zIndex: 1, minHeight: 0 }}>
      <div style={{ ...row, gap: 9, padding: '0 20px 14px' }}>
        <div style={{ padding: '6px 12px', ...glass(10), font: `800 9.5px ${outfit}`, letterSpacing: '.12em', color: 'var(--dim)', marginRight: 'auto', whiteSpace: 'nowrap' }}>
          CONNECT 4 · BO3
        </div>
        <div style={{ padding: '6px 11px', borderRadius: 10, background: 'rgba(150,180,255,.14)', border: '1px solid rgba(150,180,255,.35)', color: 'var(--lime)', font: `800 11px ${outfit}` }}>
          1 – 0
        </div>
        <button onClick={store.enterLobby} style={{ ...glass(14), appearance: 'none', width: 36, height: 36, cursor: 'pointer', color: 'var(--ink)', display: 'grid', placeItems: 'center' }} aria-label="Leave">
          <Close />
        </button>
      </div>

      {/* the two seats */}
      <div style={{ display: 'flex', gap: 10, padding: '0 20px 14px' }}>
        <div style={panel(live && s.turn === 'you')}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: myGrad, display: 'grid', placeItems: 'center', font: `800 13px ${outfit}`, color: '#fff' }}>
            {MARKS[s.mark]}
          </div>
          <div>
            <div style={head(12.5)}>{s.myName}</div>
            <div style={{ fontSize: 10, color: 'var(--dim2)' }}>{live && s.turn === 'you' ? 'Your turn' : 'Violet'}</div>
          </div>
        </div>
        <div
          style={{
            ...panel(live && s.turn === 'bot'),
            background: live && s.turn === 'bot' ? 'rgba(150,180,255,.14)' : 'var(--panel)',
            borderColor: live && s.turn === 'bot' ? 'var(--g2)' : 'var(--line)',
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'linear-gradient(135deg,var(--g2),var(--ink))',
              display: 'grid',
              placeItems: 'center',
              font: `800 13px ${outfit}`,
              color: 'var(--onAcc)',
            }}
          >
            {oppMark}
          </div>
          <div>
            <div style={head(12.5)}>{oppName}</div>
            <div style={{ fontSize: 10, color: 'var(--dim2)' }}>{live && s.turn === 'bot' ? 'Thinking…' : 'Cyan'}</div>
          </div>
        </div>
      </div>

      {/* board */}
      <div style={{ padding: '0 14px' }}>
        <div
          style={{
            display: 'flex',
            gap: 6,
            padding: 11,
            borderRadius: 24,
            background: 'var(--panel)',
            border: '1px solid rgba(150,180,255,.28)',
            backdropFilter: 'var(--blur)',
            WebkitBackdropFilter: 'var(--blur)',
            boxShadow: '0 0 24px rgba(150,180,255,.12)',
          }}
        >
          {Array.from({ length: COLS }, (_, c) => (
            <button
              key={c}
              onClick={() => store.drop(c)}
              aria-label={`Drop in column ${c + 1}`}
              style={{
                appearance: 'none',
                flex: 1,
                background: 'transparent',
                border: 0,
                borderRadius: 18,
                padding: 0,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              {Array.from({ length: ROWS }, (_, r) => {
                const idx = r * COLS + c;
                const v = s.board[idx];
                const wi = s.winLine.indexOf(idx);
                return (
                  <div
                    key={r}
                    style={{
                      aspectRatio: '1',
                      borderRadius: '50%',
                      background: v === 'you' ? GRADV : v === 'bot' ? GRADBOT : 'rgba(255,255,255,.05)',
                      boxShadow:
                        wi >= 0
                          ? '0 0 0 3px var(--ink), 0 0 16px rgba(150,180,255,.6)'
                          : v
                            ? '0 4px 12px rgba(0,0,0,.45)'
                            : 'inset 0 0 0 1px rgba(255,255,255,.08)',
                      animation:
                        wi >= 0
                          ? `vWave 1.1s ease-in-out ${wi * 0.11}s infinite`
                          : idx === s.lastIdx
                            ? 'vDrop .4s cubic-bezier(.3,1.35,.5,1)'
                            : 'none',
                    }}
                  />
                );
              })}
            </button>
          ))}
        </div>
      </div>

      <div style={{ ...row, gap: 10, padding: '16px 20px 0' }}>
        <div
          style={{
            width: 9,
            height: 9,
            borderRadius: '50%',
            background: s.winner ? 'var(--ink)' : s.turn === 'you' ? 'var(--acc)' : 'var(--g2)',
            animation: 'vPulse 1.2s infinite',
          }}
        />
        <div style={head(14)}>{s.winner ? 'Board closed' : s.turn === 'you' ? 'Your move — tap a column' : 'Thinking…'}</div>
      </div>

      <div style={{ flex: 1, minHeight: 12 }} />

      {s.winner ? (
        <div style={{ padding: '0 20px', animation: 'vUp .25s' }}>
          <div
            style={{
              borderRadius: 20,
              padding: 18,
              background: 'var(--panel)',
              border: '1px solid rgba(150,180,255,.4)',
              backdropFilter: 'var(--blur)',
              WebkitBackdropFilter: 'var(--blur)',
              boxShadow: '0 0 24px rgba(150,180,255,.16)',
            }}
          >
            <div style={{ ...head(24), letterSpacing: '-.02em' }}>
              {s.winner === 'you' ? 'Four in a row' : s.winner === 'bot' ? 'They got four' : 'Draw'}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--dim)', margin: '6px 0 14px' }}>
              {s.winner === 'you' ? 'Clean. Take the scoreboard.' : s.winner === 'bot' ? 'It saw the diagonal.' : 'Board full.'}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={store.resetC4}
                style={{ appearance: 'none', flex: 1, padding: 14, borderRadius: 15, background: 'var(--panel2)', border: '1px solid var(--line)', cursor: 'pointer', color: 'var(--ink)', font: `800 13px ${outfit}` }}
              >
                Rematch
              </button>
              <button
                onClick={store.finishC4}
                style={{ appearance: 'none', flex: 1, padding: 14, borderRadius: 15, background: 'var(--gradv)', border: 0, cursor: 'pointer', color: '#fff', font: `800 13px ${outfit}`, boxShadow: 'var(--glow)' }}
              >
                Scoreboard
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: '0 20px', fontSize: 11.5, color: 'var(--dim2)' }}>
          Tap a column to drop. Four in a line wins — across, down or diagonal.
        </div>
      )}
    </div>
  );
}
