import { store, type State } from '../store/useStore';
import { buildSeats } from '../lib/seats';
import { chipsFor } from '../lib/options';
import { ArrowRight, BackButton, Glyph } from '../components/Primitives';
import { glass, head, kicker, outfit, row, screen } from '../components/ui';

const ROOM = 'K7QX2M';

/** 07 · Lobby — the room code, the seats, the agreed rules and the start button. */
export default function Lobby({ s }: { s: State }) {
  const { seats, canStart, joinedLabel } = buildSeats(s);
  const chips = chipsFor(s);
  const modeChip = s.mode === 'friends' ? 'Friends only' : s.mode === 'bots' ? `Bots · ${s.diff}` : `Bots fill · ${s.diff}`;

  return (
    <div style={{ ...screen('62px 0 40px') }}>
      <div style={{ ...row, gap: 10, padding: '0 20px 14px' }}>
        <BackButton onClick={() => store.go('config')} />
        <div style={{ marginRight: 'auto' }}>
          <div style={head(15)}>{s.game}</div>
          <div style={{ fontSize: 10.5, color: 'var(--dim2)', marginTop: 1 }}>{joinedLabel}</div>
        </div>
        <div
          style={{
            ...row,
            gap: 6,
            padding: '6px 11px',
            borderRadius: 999,
            background: 'rgba(150,180,255,.14)',
            border: '1px solid rgba(150,180,255,.35)',
          }}
        >
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--lime)', animation: 'vPulse 1.4s infinite' }} />
          <div style={{ font: `800 10px ${outfit}`, color: 'var(--lime)' }}>LIVE</div>
        </div>
      </div>

      {/* room code */}
      <div style={{ padding: '0 20px' }}>
        <button
          onClick={() => store.copyCode(ROOM)}
          className="hov-acc"
          style={{
            appearance: 'none',
            width: '100%',
            borderRadius: 20,
            padding: 18,
            background: 'var(--panel)',
            border: '1px dashed var(--line2)',
            cursor: 'pointer',
            color: 'var(--ink)',
            ...row,
            gap: 14,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: 60,
              background: 'linear-gradient(90deg,transparent,rgba(150,180,255,.22),transparent)',
              animation: 'vShine 4s ease-in-out infinite',
            }}
          />
          <div style={{ textAlign: 'left', position: 'relative' }}>
            <div style={{ font: `800 9px ${outfit}`, letterSpacing: '.16em', color: 'var(--dim2)', marginBottom: 5 }}>ROOM CODE · TAP TO SHARE</div>
            <div style={{ font: `800 32px ${outfit}`, letterSpacing: '.16em', color: 'var(--accLt)' }}>{ROOM}</div>
          </div>
          {s.copied ? (
            <div
              style={{
                marginLeft: 'auto',
                padding: '7px 12px',
                borderRadius: 10,
                background: 'var(--lime)',
                color: 'var(--onLime)',
                font: `800 11px ${outfit}`,
                animation: 'vPop .25s',
              }}
            >
              COPIED
            </div>
          ) : (
            <div
              style={{
                marginLeft: 'auto',
                width: 38,
                height: 38,
                borderRadius: 14,
                background: 'var(--panel2)',
                border: '1px solid var(--line)',
                backdropFilter: 'var(--blur)',
                WebkitBackdropFilter: 'var(--blur)',
                boxShadow: 'var(--spec)',
                display: 'grid',
                placeItems: 'center',
                position: 'relative',
              }}
            >
              <Glyph d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3M12 3v13M7 8l5-5 5 5" size={17} width={2.2} />
            </div>
          )}
        </button>
      </div>

      {/* seats */}
      <div style={{ padding: '18px 20px 0' }}>
        <div style={{ ...kicker('var(--dim2)', '.16em'), marginBottom: 12 }}>PLAYERS</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 11 }}>
          {seats.map((p, i) => (
            <button
              key={i}
              onClick={() => {
                if (p.kind === 'you') store.go('profile');
                else if (p.kind === 'human') store.openPlayer(p.name);
                else if (p.kind === 'bot') store.flash(`Bot skill: ${s.diff}`);
                else store.go('friends');
              }}
              style={{
                appearance: 'none',
                background: 'transparent',
                border: 0,
                padding: 0,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                animation: 'vPop .34s',
              }}
            >
              <div style={{ position: 'relative', width: 62, height: 62, display: 'grid', placeItems: 'center' }}>
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${p.ring}`, boxShadow: p.ringGlow }} />
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: '50%',
                    background: p.grad,
                    display: 'grid',
                    placeItems: 'center',
                    font: `800 20px ${outfit}`,
                    color: p.markColor,
                  }}
                >
                  {p.mark}
                </div>
                {p.tag && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: -6,
                      padding: '2px 8px',
                      borderRadius: 7,
                      background: p.tagBg,
                      color: p.tagColor,
                      font: `800 8px ${outfit}`,
                    }}
                  >
                    {p.tag}
                  </div>
                )}
              </div>
              <div style={{ font: `700 12px ${outfit}`, color: p.color, marginTop: 4 }}>{p.name}</div>
              <div style={{ fontSize: 9.5, color: 'var(--dim2)', marginTop: -4 }}>{p.sub}</div>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            onClick={() => store.go('friends')}
            className="hov-acc"
            style={{
              appearance: 'none',
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: 12,
              borderRadius: 15,
              background: 'var(--panel)',
              border: '1px solid var(--line2)',
              backdropFilter: 'var(--blur)',
              WebkitBackdropFilter: 'var(--blur)',
              boxShadow: 'var(--spec)',
              cursor: 'pointer',
              color: 'var(--ink)',
              font: `800 12px ${outfit}`,
            }}
          >
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" aria-hidden>
              <circle cx="9" cy="8" r="3.4" />
              <path d="M2.5 20a6.5 6.5 0 0113 0M18 8v6M15 11h6" />
            </svg>
            Invite friends
          </button>
          <button
            onClick={() => store.go('config')}
            style={{
              appearance: 'none',
              flex: 1,
              padding: 12,
              borderRadius: 15,
              background: 'rgba(150,180,255,.12)',
              border: '1px solid rgba(150,180,255,.35)',
              cursor: 'pointer',
              color: 'var(--cyan)',
              font: `800 12px ${outfit}`,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
            }}
          >
            {modeChip}
          </button>
        </div>
      </div>

      {/* rules */}
      <div style={{ padding: '18px 20px 0' }}>
        <div style={{ ...row, marginBottom: 9 }}>
          <div style={{ ...kicker('var(--dim2)', '.16em'), marginRight: 'auto' }}>RULES</div>
          <button
            onClick={store.openRules}
            style={{ appearance: 'none', background: 'transparent', border: 0, color: 'var(--accLt)', font: `700 11px ${outfit}`, cursor: 'pointer', marginRight: 12 }}
          >
            How to play
          </button>
          <button
            onClick={() => store.go('config')}
            style={{ appearance: 'none', background: 'transparent', border: 0, color: 'var(--accLt)', font: `700 11px ${outfit}`, cursor: 'pointer' }}
          >
            Edit
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {chips.map((c) => (
            <button
              key={c}
              onClick={() => store.go('config')}
              className="hov-ink"
              style={{
                appearance: 'none',
                padding: '8px 12px',
                ...glass(10),
                color: 'var(--dim)',
                font: `600 11px 'Plus Jakarta Sans Variable','Plus Jakarta Sans',sans-serif`,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flex: 'none',
              }}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 16 }} />

      <div style={{ padding: '0 20px' }}>
        <button
          onClick={store.startGame}
          disabled={!canStart}
          style={{
            appearance: 'none',
            width: '100%',
            ...row,
            gap: 12,
            padding: '18px 22px',
            borderRadius: 18,
            border: `1px solid ${canStart ? 'transparent' : 'var(--line)'}`,
            background: canStart ? 'var(--gradv)' : 'var(--panel)',
            boxShadow: canStart ? '0 0 22px rgba(150,180,255,.35)' : 'none',
            cursor: canStart ? 'pointer' : 'default',
            font: `800 16px ${outfit}`,
            color: canStart ? '#fff' : 'var(--dim2)',
          }}
        >
          {canStart ? 'Start game' : 'Waiting for players'}
          <ArrowRight size={21} stroke="currentColor" />
        </button>
      </div>
    </div>
  );
}
