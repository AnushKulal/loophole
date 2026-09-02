import { store, type State } from '../store/useStore';
import { CATEGORIES, CAT_ICON, DIM, GAMES, NEON } from '../data/games';
import { DIFFICULTIES, MODES, optionsFor } from '../lib/options';
import { ArrowRight, Glyph, ScreenHeader, Stepper, ToggleRow } from '../components/Primitives';
import { body, cta, ellipsis, glass, head, kicker, outfit, row, screen } from '../components/ui';

/** 06 · Game setup — category, game, who's playing, then per-category options. */
export default function GameSetup({ s }: { s: State }) {
  const { label, steppers, rules } = optionsFor(s.cat);
  const catGames = GAMES.filter((g) => g.cat === s.cat);

  return (
    <div style={{ ...screen('62px 0 0') }}>
      <ScreenHeader onBack={store.toHome} title="Game setup" />

      <div style={body('0 20px')} className="scroll">
        {/* 01 category */}
        <div style={{ ...kicker('var(--dim2)', '.16em'), margin: '4px 0 10px' }}>01 · CATEGORY</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {CATEGORIES.map((c) => {
            const on = s.cat === c;
            return (
              <button
                key={c}
                onClick={() => store.setCat(c)}
                aria-pressed={on}
                style={{
                  appearance: 'none',
                  flex: 1,
                  padding: '13px 10px',
                  borderRadius: 18,
                  background: on ? 'rgba(150,180,255,.14)' : 'var(--panel)',
                  border: `1px solid ${on ? NEON[c] : 'var(--line)'}`,
                  cursor: 'pointer',
                  color: 'var(--ink)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 9,
                  alignItems: 'flex-start',
                }}
              >
                <div style={{ width: 30, height: 30, borderRadius: 12, background: DIM[c], display: 'grid', placeItems: 'center', color: NEON[c] }}>
                  <Glyph d={CAT_ICON[c]} size={16} />
                </div>
                <div style={head(12.5)}>{c}</div>
              </button>
            );
          })}
        </div>

        {/* 02 game */}
        <div style={{ ...kicker('var(--dim2)', '.16em'), margin: '20px 0 10px' }}>02 · GAME</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
          {catGames.map((g) => {
            const on = s.game === g.name;
            return (
              <button
                key={g.name}
                onClick={() => store.pickGame(g.name)}
                aria-pressed={on}
                style={{
                  appearance: 'none',
                  padding: 12,
                  borderRadius: 18,
                  background: on ? 'rgba(150,180,255,.14)' : 'var(--panel)',
                  border: `1px solid ${on ? 'var(--acc)' : 'var(--line)'}`,
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: 'var(--ink)',
                  ...row,
                  gap: 10,
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    flex: 'none',
                    borderRadius: 14,
                    background: DIM[g.cat],
                    border: '1px solid var(--line)',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <Glyph d={g.d} size={18} stroke={NEON[g.cat]} width={1.8} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ ...head(12), ...ellipsis }}>{g.name}</div>
                  <div style={{ fontSize: 9.5, color: 'var(--dim2)', marginTop: 2 }}>{g.players} players</div>
                </div>
                {on && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: 'var(--acc)',
                      display: 'grid',
                      placeItems: 'center',
                      boxShadow: '0 0 10px rgba(150,180,255,.8)',
                    }}
                  >
                    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="var(--onAcc)" strokeWidth={3.6} strokeLinecap="round" aria-hidden>
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* 03 who's playing */}
        <div style={{ ...kicker('var(--dim2)', '.16em'), margin: '20px 0 10px' }}>03 · WHO'S PLAYING</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {MODES.map((m) => {
            const on = s.mode === m.key;
            return (
              <button
                key={m.key}
                onClick={() => store.setMode(m.key)}
                role="radio"
                aria-checked={on}
                style={{
                  appearance: 'none',
                  ...row,
                  gap: 12,
                  padding: '13px 14px',
                  borderRadius: 18,
                  background: on ? 'rgba(150,180,255,.14)' : 'var(--panel)',
                  border: `1px solid ${on ? 'var(--acc)' : 'var(--line)'}`,
                  cursor: 'pointer',
                  color: 'var(--ink)',
                  textAlign: 'left',
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    flex: 'none',
                    borderRadius: '50%',
                    background: on ? 'var(--acc)' : 'transparent',
                    border: `2px solid ${on ? 'var(--acc)' : 'var(--line2)'}`,
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  {on && (
                    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="var(--onAcc)" strokeWidth={3.6} strokeLinecap="round" aria-hidden>
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div>
                  <div style={head(13.5)}>{m.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--dim2)', marginTop: 2 }}>{m.hint}</div>
                </div>
              </button>
            );
          })}

          {s.mode !== 'friends' && (
            <div style={{ ...row, gap: 10, padding: '11px 14px', ...glass(18), animation: 'vSlide .25s' }}>
              <div style={{ font: `600 13px 'Plus Jakarta Sans Variable','Plus Jakarta Sans',sans-serif`, marginRight: 'auto' }}>Bot skill</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {DIFFICULTIES.map((d) => {
                  const on = s.diff === d;
                  return (
                    <button
                      key={d}
                      onClick={() => store.setDiff(d)}
                      aria-pressed={on}
                      style={{
                        appearance: 'none',
                        padding: '9px 13px',
                        borderRadius: 12,
                        background: on ? 'var(--acc)' : 'transparent',
                        border: `1px solid ${on ? 'var(--acc)' : 'var(--line2)'}`,
                        color: on ? 'var(--onAcc)' : 'var(--dim)',
                        cursor: 'pointer',
                        font: `800 11px ${outfit}`,
                      }}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 04 options */}
        <div style={{ ...kicker('var(--dim2)', '.16em'), margin: '20px 0 10px' }}>04 · {label.toUpperCase()}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, paddingBottom: 10 }}>
          {steppers.map((sp) => (
            <Stepper
              key={sp.key}
              name={sp.name}
              hint={sp.hint}
              value={sp.fmt(s.opt[sp.key] as number)}
              onDec={() => store.step(sp.key, -sp.step, sp.min, sp.max)}
              onInc={() => store.step(sp.key, sp.step, sp.min, sp.max)}
            />
          ))}
          {rules.map((r) => (
            <ToggleRow key={r.key} name={r.name} hint={r.hint} on={!!s.opt[r.key]} onToggle={() => store.toggleOpt(r.key)} />
          ))}
        </div>
      </div>

      <div style={{ padding: '12px 20px 4px', background: 'linear-gradient(180deg,transparent,var(--bg) 45%)' }}>
        <button onClick={store.enterLobby} style={cta}>
          Create lobby
          <ArrowRight />
        </button>
      </div>
    </div>
  );
}
