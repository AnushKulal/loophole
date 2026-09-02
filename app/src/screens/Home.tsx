import { useRef } from 'react';
import { store, type State } from '../store/useStore';
import { TINTS } from '../data/progression';
import { DIM, FEATURED, GAME_LEVEL, GAME_XP, NEON, NEON_ON_DARK, gameByName } from '../data/games';
import { MARKS } from '../data/people';
import { Bar, Chevron, Glyph } from '../components/Primitives';
import { glass, head, outfit, row, screen, track } from '../components/ui';

/** 04 · Home — your card, the season bar, quick actions and the game rail. */
export default function Home({ s }: { s: State }) {
  const railRef = useRef<HTMLDivElement>(null);
  const myGrad = TINTS[s.tint].grad;

  /** Advance the rail one card, looping back at the end. */
  const slideRail = () => {
    const el = railRef.current;
    if (!el) return;
    const next = el.scrollLeft + 208;
    el.scrollTo({ left: next >= el.scrollWidth - el.clientWidth - 8 ? 0 : next, behavior: 'smooth' });
  };

  const headerBtn = {
    appearance: 'none' as const,
    width: 42,
    height: 42,
    borderRadius: 15,
    ...glass(15),
    cursor: 'pointer',
    display: 'grid' as const,
    placeItems: 'center' as const,
    position: 'relative' as const,
  };

  return (
    <div style={{ ...screen('62px 0 6px') }}>
      {/* identity + shortcuts */}
      <div style={{ ...row, gap: 12, padding: '0 20px 16px' }}>
        <button
          onClick={() => store.go('profile')}
          style={{
            appearance: 'none',
            position: 'relative',
            width: 46,
            height: 46,
            borderRadius: 18,
            background: myGrad,
            border: 0,
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
            font: `800 19px ${outfit}`,
            color: '#fff',
            boxShadow: 'var(--glow)',
          }}
          aria-label="Your profile"
        >
          {MARKS[s.mark]}
          <div
            style={{
              position: 'absolute',
              bottom: -5,
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '2px 7px',
              borderRadius: 7,
              background: 'var(--acc)',
              font: `800 8px ${outfit}`,
              color: 'var(--onAcc)',
            }}
          >
            LVL 24
          </div>
        </button>

        <div style={{ marginRight: 'auto' }}>
          <div style={{ fontSize: 11.5, color: 'var(--dim)' }}>Good evening</div>
          <div style={head(17)}>{s.myName}</div>
        </div>

        <button onClick={() => store.go('inbox')} style={{ ...headerBtn, color: 'var(--ink)' }} className="hov-acc" aria-label="Inbox">
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <rect x="2.5" y="5" width="19" height="14" rx="3" />
            <path d="M3 8l9 6 9-6" />
          </svg>
          {store.inboxCount > 0 && (
            <div
              style={{
                position: 'absolute',
                top: -4,
                right: -4,
                minWidth: 16,
                height: 16,
                padding: '0 4px',
                borderRadius: 6,
                background: 'var(--pink)',
                color: 'var(--onPink)',
                font: `800 9.5px ${outfit}`,
                display: 'grid',
                placeItems: 'center',
              }}
            >
              {store.inboxCount}
            </div>
          )}
        </button>

        <button onClick={() => store.go('board')} style={{ ...headerBtn, color: 'var(--gold)' }} className="hov-gold" aria-label="Rankings">
          <Glyph d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0z" size={19} />
        </button>

        <button onClick={() => store.go('settings')} style={{ ...headerBtn, color: 'var(--ink)' }} className="hov-acc" aria-label="Settings">
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <circle cx="12" cy="12" r="3.2" />
            <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.5 5.5l2 2M16.5 16.5l2 2M18.5 5.5l-2 2M7.5 16.5l-2 2" />
          </svg>
        </button>
      </div>

      {/* season progress */}
      <div style={{ padding: '0 20px' }}>
        <div style={{ padding: '14px 16px', ...glass(18), ...row, gap: 12 }}>
          <button
            onClick={() => store.go('season')}
            style={{ appearance: 'none', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', flex: 1, minWidth: 0, textAlign: 'left', color: 'var(--ink)' }}
          >
            <div style={{ display: 'flex', fontSize: 9.5, letterSpacing: '.1em', color: 'var(--dim2)' }}>
              <span style={{ marginRight: 'auto' }}>SEASON 2 · PROGRESS TO LVL 25</span>
              <span style={{ color: 'var(--accLt)', fontWeight: 700 }}>12,450 / 15,000 XP</span>
            </div>
            <div style={{ ...track(6), marginTop: 8 }}>
              <div style={{ width: '68%', height: '100%', background: 'var(--gradv)', boxShadow: '0 0 10px rgba(150,180,255,.8)' }} />
            </div>
          </button>
          <div style={{ font: `800 11px ${outfit}`, color: 'var(--lime)', whiteSpace: 'nowrap' }}>#12</div>
        </div>
      </div>

      {/* create / join / friends */}
      <div style={{ display: 'flex', gap: 10, padding: '14px 20px 0' }}>
        <button
          onClick={() => store.go('config')}
          style={{
            appearance: 'none',
            flex: 1.35,
            textAlign: 'left',
            border: 0,
            borderRadius: 20,
            padding: 18,
            cursor: 'pointer',
            background: 'var(--gradv)',
            boxShadow: 'var(--glow)',
            backdropFilter: 'var(--blur)',
            WebkitBackdropFilter: 'var(--blur)',
            position: 'relative',
            overflow: 'hidden',
            color: '#fff',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage:
                'linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px)',
              backgroundSize: '16px 16px',
            }}
          />
          <div style={{ position: 'relative' }}>
            <div style={{ width: 36, height: 36, borderRadius: 14, background: 'rgba(255,255,255,.22)', display: 'grid', placeItems: 'center', marginBottom: 14 }}>
              <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
            </div>
            <div style={{ font: `800 20px/1.05 ${outfit}`, letterSpacing: '-.02em' }}>
              Create
              <br />
              lobby
            </div>
            <div style={{ fontSize: 11, opacity: 0.88, marginTop: 7 }}>Pick game · set rules</div>
          </div>
        </button>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!s.joinOpen ? (
            <button
              onClick={store.openJoin}
              className="hov-cyan"
              style={{
                appearance: 'none',
                flex: 1,
                textAlign: 'left',
                padding: 14,
                borderRadius: 20,
                background: 'var(--panel)',
                border: '1px solid rgba(150,180,255,.35)',
                backdropFilter: 'var(--blur)',
                WebkitBackdropFilter: 'var(--blur)',
                boxShadow: 'var(--spec)',
                cursor: 'pointer',
                color: 'var(--ink)',
              }}
            >
              <div style={{ width: 32, height: 32, borderRadius: 13, background: 'rgba(150,180,255,.14)', display: 'grid', placeItems: 'center', marginBottom: 10 }}>
                <Glyph d="M15 7h3a4 4 0 010 8h-3M9 17H6a4 4 0 010-8h3M8 12h8" size={17} stroke="var(--cyan)" width={2.2} />
              </div>
              <div style={head(13)}>Join code</div>
            </button>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                store.enterLobby();
              }}
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 20,
                background: 'var(--panel)',
                border: '1px solid var(--cyan)',
                backdropFilter: 'var(--blur)',
                WebkitBackdropFilter: 'var(--blur)',
                boxShadow: 'var(--spec)',
                animation: 'vUp .2s',
              }}
            >
              <input
                value={s.codeInput}
                onChange={(e) => store.setCode(e.target.value)}
                maxLength={6}
                placeholder="K7QX2M"
                aria-label="Room code"
                autoFocus
                style={{
                  width: '100%',
                  appearance: 'none',
                  background: 'transparent',
                  border: 0,
                  outline: 'none',
                  color: 'var(--ink)',
                  font: `800 17px ${outfit}`,
                  letterSpacing: '.14em',
                  textAlign: 'center',
                  textTransform: 'uppercase',
                }}
              />
              <button
                type="submit"
                style={{
                  appearance: 'none',
                  width: '100%',
                  marginTop: 8,
                  padding: 9,
                  borderRadius: 12,
                  border: 0,
                  background: 'var(--cyan)',
                  cursor: 'pointer',
                  font: `800 11px ${outfit}`,
                  color: 'var(--onCyan)',
                }}
              >
                JOIN
              </button>
            </form>
          )}

          <button
            onClick={() => store.go('friends')}
            className="hov-lime"
            style={{
              appearance: 'none',
              flex: 1,
              textAlign: 'left',
              padding: 14,
              borderRadius: 20,
              background: 'var(--panel)',
              border: '1px solid rgba(150,180,255,.3)',
              backdropFilter: 'var(--blur)',
              WebkitBackdropFilter: 'var(--blur)',
              boxShadow: 'var(--spec)',
              cursor: 'pointer',
              color: 'var(--ink)',
            }}
          >
            <div style={{ ...row, gap: 6, marginBottom: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 13, background: 'rgba(150,180,255,.14)', display: 'grid', placeItems: 'center' }}>
                <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="var(--lime)" strokeWidth={2.2} aria-hidden>
                  <circle cx="9" cy="8" r="3.2" />
                  <path d="M2.5 20a6.5 6.5 0 0113 0M17 11a3 3 0 100-6" />
                </svg>
              </div>
              <div style={{ marginLeft: 'auto', padding: '2px 7px', borderRadius: 7, background: 'var(--pink)', font: `800 8.5px ${outfit}`, color: 'var(--onPink)' }}>2</div>
            </div>
            <div style={head(13)}>Friends</div>
          </button>
        </div>
      </div>

      {/* continue playing */}
      <div style={{ ...row, gap: 10, padding: '20px 20px 10px' }}>
        <div style={{ font: `800 10px ${outfit}`, letterSpacing: '.16em', color: 'var(--acc)', marginRight: 'auto' }}>CONTINUE PLAYING</div>
        <button
          onClick={slideRail}
          style={{
            appearance: 'none',
            width: 32,
            height: 32,
            borderRadius: 12,
            background: 'rgba(150,180,255,.14)',
            border: '1px solid rgba(150,180,255,.35)',
            cursor: 'pointer',
            color: 'var(--accLt)',
            display: 'grid',
            placeItems: 'center',
          }}
          aria-label="Next game"
        >
          <Chevron size={15} />
        </button>
      </div>

      <div
        ref={railRef}
        className="rail"
        style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '0 20px 4px', scrollSnapType: 'x mandatory', scrollBehavior: 'smooth' }}
      >
        {FEATURED.map((name) => {
          const g = gameByName(name);
          return (
            <button
              key={name}
              onClick={() => store.pickGame(name)}
              className="hov-acc"
              style={{
                appearance: 'none',
                flex: 'none',
                width: 196,
                scrollSnapAlign: 'center',
                border: '1px solid rgba(150,180,255,.3)',
                borderRadius: 20,
                padding: 0,
                background: 'var(--panel)',
                cursor: 'pointer',
                textAlign: 'left',
                color: 'var(--ink)',
                overflow: 'hidden',
                boxShadow: '0 0 20px rgba(150,180,255,.12)',
              }}
            >
              <div style={{ height: 98, background: DIM[g.cat], position: 'relative', display: 'grid', placeItems: 'center' }}>
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundImage:
                      'linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px)',
                    backgroundSize: '18px 18px',
                  }}
                />
                <Glyph d={g.d} size={40} stroke={NEON[g.cat]} width={1.6} glow={NEON[g.cat]} style={{ position: 'relative' }} />
                <div
                  style={{
                    position: 'absolute',
                    top: 9,
                    left: 9,
                    padding: '4px 8px',
                    borderRadius: 7,
                    background: 'rgba(0,0,0,.5)',
                    border: '1px solid rgba(255,255,255,.12)',
                    font: `800 8px ${outfit}`,
                    letterSpacing: '.1em',
                    color: NEON_ON_DARK[g.cat],
                  }}
                >
                  {g.cat.toUpperCase()}
                </div>
              </div>
              <div style={{ padding: '11px 13px 13px' }}>
                <div style={head(14)}>{g.name}</div>
                <div style={{ ...row, gap: 6, marginTop: 6 }}>
                  <div style={{ fontSize: 9.5, color: 'var(--dim2)', marginRight: 'auto' }}>{g.players} players</div>
                  <div style={{ font: `800 8.5px ${outfit}`, color: NEON[g.cat] }}>{GAME_LEVEL[g.name] ?? 'LVL 1'}</div>
                </div>
                <div style={{ marginTop: 7 }}>
                  <Bar pct={GAME_XP[g.name] ?? '12%'} fill={NEON[g.cat]} height={3} glow={NEON[g.cat]} />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* library */}
      <div style={{ padding: '16px 20px 0' }}>
        <button
          onClick={() => store.go('all')}
          className="hov-acc-glow"
          style={{
            appearance: 'none',
            width: '100%',
            ...row,
            gap: 12,
            padding: '14px 16px',
            borderRadius: 18,
            background: 'var(--panel)',
            border: '1px solid rgba(150,180,255,.4)',
            backdropFilter: 'var(--blur)',
            WebkitBackdropFilter: 'var(--blur)',
            boxShadow: 'var(--spec)',
            cursor: 'pointer',
            color: 'var(--ink)',
            textAlign: 'left',
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              flex: 'none',
              borderRadius: 14,
              background: 'rgba(150,180,255,.16)',
              border: '1px solid rgba(150,180,255,.35)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Glyph d="M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v6H4zM14 15h6v6h-6z" size={18} stroke="var(--accLt)" />
          </div>
          <div style={{ marginRight: 'auto' }}>
            <div style={head(13.5)}>All games</div>
            <div style={{ fontSize: 10, color: 'var(--dim2)', marginTop: 2 }}>14 titles · 3 categories</div>
          </div>
          <Chevron stroke="var(--acc)" />
        </button>
      </div>

      {/* live lobby nudge */}
      <div style={{ padding: '12px 20px 0' }}>
        <button
          onClick={store.enterLobby}
          style={{
            appearance: 'none',
            width: '100%',
            ...row,
            gap: 10,
            padding: '12px 15px',
            borderRadius: 18,
            background: 'rgba(150,180,255,.09)',
            border: '1px solid rgba(150,180,255,.28)',
            cursor: 'pointer',
            textAlign: 'left',
            color: 'var(--ink)',
          }}
        >
          <Glyph d="M12 3a9 9 0 100 18 9 9 0 000-18zM12 8v4l3 2" size={16} stroke="var(--lime)" style={{ flex: 'none' }} />
          <div style={{ fontSize: 11, color: 'var(--dim)', lineHeight: 1.4 }}>
            Divya has a lobby open · <span style={{ color: 'var(--lime)', fontWeight: 700 }}>tap to join</span>
          </div>
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 8 }} />
    </div>
  );
}
