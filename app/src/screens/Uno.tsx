import { store, type State } from '../store/useStore';
import { COLOURS, UC, UNAME, cardGrad, faceOf, isValid } from '../game/uno';
import { OTHERS, grad } from '../data/people';
import { Close, Glyph } from '../components/Primitives';
import { ellipsis, glass, head, outfit, row } from '../components/ui';

const EMOTES = ['👀', '🤔', '😐', '🔥', '🤝'];

/** 23 · UNO — a full 108-card round against three bots. */
export default function Uno({ s }: { s: State }) {
  const u = s.uno;
  if (!u) return null;

  const myTurn = u.turn === 0 && u.winner === null;
  const dot = UC[u.colour as 'R' | 'B' | 'G' | 'Y']?.[0] ?? '#dbe6ff';

  const headerBtn = {
    appearance: 'none' as const,
    width: 36,
    height: 36,
    borderRadius: 11,
    background: 'var(--panel)',
    border: '1px solid var(--line)',
    cursor: 'pointer',
    color: 'var(--ink)',
    display: 'grid' as const,
    placeItems: 'center' as const,
    position: 'relative' as const,
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '60px 0 26px', position: 'relative', zIndex: 1, minHeight: 0 }}>
      <div style={{ ...row, gap: 9, padding: '0 20px 12px' }}>
        <div
          style={{
            padding: '6px 12px',
            borderRadius: 10,
            background: 'var(--panel)',
            border: '1px solid var(--line)',
            backdropFilter: 'var(--blur)',
            WebkitBackdropFilter: 'var(--blur)',
            boxShadow: 'var(--spec)',
            font: `800 9.5px ${outfit}`,
            letterSpacing: '.12em',
            color: 'var(--dim)',
            marginRight: 'auto',
            whiteSpace: 'nowrap',
          }}
        >
          UNO · {u.hands[0].length} CARDS
        </div>
        <button onClick={store.openRules} style={headerBtn} aria-label="How to play">
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M9.5 9.5a2.5 2.5 0 114 2V13M12 17v.01" />
          </svg>
        </button>
        <button onClick={store.openChat} style={headerBtn} aria-label="Table chat">
          <Glyph d="M21 12a8 8 0 01-8 8H8l-5 3 1.5-5A8 8 0 1121 12z" size={16} width={2.2} />
          <div
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              minWidth: 15,
              height: 15,
              padding: '0 4px',
              borderRadius: 6,
              background: 'var(--pink)',
              color: 'var(--onPink)',
              font: `800 9px ${outfit}`,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            {s.chat.length}
          </div>
        </button>
        <button onClick={store.enterLobby} style={headerBtn} aria-label="Leave">
          <Close />
        </button>
      </div>

      {/* opponents */}
      <div style={{ display: 'flex', gap: 9, padding: '0 20px 14px' }}>
        {[1, 2, 3].map((p) => {
          const active = u.turn === p;
          const o = OTHERS[p - 1];
          return (
            <div
              key={p}
              style={{
                flex: 1,
                ...row,
                gap: 9,
                padding: '9px 10px',
                borderRadius: 14,
                background: 'var(--panel)',
                border: `1px solid ${active ? 'var(--acc)' : 'transparent'}`,
                backdropFilter: 'var(--blur)',
                WebkitBackdropFilter: 'var(--blur)',
                boxShadow: active ? '0 0 14px rgba(139,164,255,.7)' : 'none',
              }}
            >
              <div style={{ width: 30, height: 30, flex: 'none', borderRadius: '50%', background: grad(o.gi), display: 'grid', placeItems: 'center', font: `800 12px ${outfit}`, color: '#fff' }}>
                {o.mark}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ ...head(11), ...ellipsis }}>{o.name}</div>
                <div style={{ fontSize: 9.5, color: 'var(--dim2)' }}>{u.hands[p].length} cards</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* table */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, minHeight: 0, position: 'relative' }}>
        {s.emote && <div style={{ position: 'absolute', top: 6, fontSize: 40, animation: 'vFloat 1.5s ease-in-out', zIndex: 3 }}>{s.emote}</div>}

        <div style={{ ...row, gap: 8, padding: '7px 14px', borderRadius: 999, ...glass(999) }}>
          <div style={{ width: 9, height: 9, borderRadius: '50%', background: dot, boxShadow: `0 0 10px ${dot}` }} />
          <div style={{ font: `800 11px ${outfit}` }}>{UNAME[u.colour]}</div>
        </div>

        <div style={{ ...row, gap: 16 }}>
          <button
            onClick={store.unoDraw}
            style={{
              appearance: 'none',
              width: 74,
              height: 106,
              borderRadius: 16,
              background: 'linear-gradient(160deg,rgba(190,215,255,.22),rgba(190,215,255,.07))',
              border: '1px solid var(--line2)',
              backdropFilter: 'var(--blur)',
              WebkitBackdropFilter: 'var(--blur)',
              boxShadow: 'var(--spec)',
              cursor: 'pointer',
              color: 'var(--ink)',
              display: 'grid',
              placeItems: 'center',
              position: 'relative',
            }}
            aria-label="Draw a card"
          >
            <Glyph d="M12 5v14M5 12h14" size={26} />
            <div style={{ position: 'absolute', bottom: 9, font: `800 8.5px ${outfit}`, letterSpacing: '.1em', color: 'var(--dim2)' }}>DRAW</div>
          </button>

          <div
            style={{
              width: 86,
              height: 124,
              borderRadius: 18,
              background: cardGrad(u.top.c),
              boxShadow: 'inset 0 1.5px 1px rgba(255,255,255,.6),inset 0 -2px 1px rgba(255,255,255,.2),0 14px 30px rgba(4,10,20,.55)',
              display: 'grid',
              placeItems: 'center',
              animation: 'vPop .3s',
            }}
          >
            <div style={{ font: `800 44px ${outfit}`, color: '#fff', textShadow: '0 2px 10px rgba(0,0,0,.35)' }}>{faceOf(u.top.v)}</div>
          </div>
        </div>

        <div style={{ font: `700 12.5px ${outfit}`, color: 'var(--dim)' }}>{u.log}</div>
      </div>

      {/* emotes */}
      <div style={{ display: 'flex', gap: 7, padding: '0 20px 10px', justifyContent: 'center' }}>
        {EMOTES.map((e) => (
          <button
            key={e}
            onClick={() => store.react(e)}
            className="hov-acc"
            style={{
              appearance: 'none',
              width: 38,
              height: 38,
              borderRadius: 12,
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              backdropFilter: 'var(--blur)',
              WebkitBackdropFilter: 'var(--blur)',
              cursor: 'pointer',
              fontSize: 17,
              lineHeight: 1,
            }}
            aria-label={`React ${e}`}
          >
            {e}
          </button>
        ))}
      </div>

      {/* your hand — playable cards lift and brighten */}
      <div className="rail" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '14px 20px 6px', alignItems: 'flex-end' }}>
        {u.hands[0].map((c, i) => {
          const playable = myTurn && isValid(c, u);
          return (
            <button
              key={i}
              onClick={() => store.unoPlay(i)}
              aria-label={`${UNAME[c.c]} ${c.v}`}
              style={{
                appearance: 'none',
                flex: 'none',
                width: 62,
                height: 92,
                borderRadius: 14,
                background: cardGrad(c.c),
                border: 0,
                cursor: 'pointer',
                boxShadow: playable
                  ? '0 0 0 2px rgba(255,255,255,.75), 0 8px 18px rgba(4,10,20,.5)'
                  : 'inset 0 1px 0 rgba(255,255,255,.35), 0 6px 14px rgba(4,10,20,.45)',
                transform: `translateY(${playable ? -10 : 0}px)`,
                opacity: playable ? 1 : 0.55,
                transition: 'transform .16s',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <div style={{ font: `800 26px ${outfit}`, color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,.3)' }}>{faceOf(c.v)}</div>
            </button>
          );
        })}
      </div>

      {/* wild colour picker */}
      {u.need && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(6,9,15,.72)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 6,
            animation: 'vUp .2s',
          }}
          role="dialog"
          aria-modal
          aria-label="Pick a colour"
        >
          <div style={{ width: 270, padding: 22, borderRadius: 22, background: 'var(--panel)', border: '1px solid var(--line2)', backdropFilter: 'var(--blur)', WebkitBackdropFilter: 'var(--blur)', boxShadow: 'var(--spec)' }}>
            <div style={{ ...head(17), marginBottom: 4 }}>Pick a colour</div>
            <div style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 16 }}>Everyone has to follow it.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {COLOURS.map((c) => (
                <button
                  key={c}
                  onClick={() => u.pending !== null && store.unoPlay(u.pending, c)}
                  style={{
                    appearance: 'none',
                    padding: '16px 12px',
                    borderRadius: 14,
                    background: cardGrad(c),
                    border: 0,
                    cursor: 'pointer',
                    font: `800 12.5px ${outfit}`,
                    color: '#fff',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,.45),0 8px 18px rgba(4,10,20,.4)',
                  }}
                >
                  {UNAME[c]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* round over */}
      {u.winner !== null && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(6,9,15,.72)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 6,
            animation: 'vUp .25s',
          }}
          role="dialog"
          aria-modal
        >
          <div style={{ width: 280, padding: 24, borderRadius: 22, background: 'var(--panel)', border: '1px solid var(--line2)', backdropFilter: 'var(--blur)', WebkitBackdropFilter: 'var(--blur)', boxShadow: 'var(--spec)' }}>
            <div style={{ font: `800 26px/1.05 ${outfit}`, letterSpacing: '-.02em' }}>
              {u.winner === 0 ? 'You went out' : `${OTHERS[u.winner - 1].name} went out`}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--dim)', margin: '8px 0 18px' }}>Hand emptied. That's the round.</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={store.unoStart}
                style={{ appearance: 'none', flex: 1, padding: 14, borderRadius: 12, background: 'var(--panel2)', border: '1px solid var(--line)', cursor: 'pointer', color: 'var(--ink)', font: `800 13px ${outfit}` }}
              >
                Again
              </button>
              <button
                onClick={store.finishUno}
                style={{ appearance: 'none', flex: 1, padding: 14, borderRadius: 12, background: 'var(--gradv)', border: 0, cursor: 'pointer', color: '#fff', font: `800 13px ${outfit}`, boxShadow: 'var(--glow)' }}
              >
                Scoreboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
