import { store, type State } from '../store/useStore';
import { BRACKET, INBOX, ROUND_LABELS, SEASON, TINTS, inboxId } from '../data/progression';
import { ANSWERS, MARKS, OTHERS, grad } from '../data/people';
import { Chevron, Close, EmptyState, Glyph, ScreenHeader } from '../components/Primitives';
import { body, glass, head, kicker, outfit, row, screen } from '../components/ui';

/** 17 · Inbox — invites and requests, emptying to a real empty state. */
export function Inbox({ s }: { s: State }) {
  const items = INBOX.filter((x) => !s.inboxGone.includes(inboxId(x)));

  return (
    <div style={{ ...screen('62px 0 0') }}>
      <ScreenHeader
        onBack={store.toHome}
        title="Inbox"
        radius={11}
        right={
          <div style={{ padding: '5px 11px', borderRadius: 8, background: 'var(--acc)', color: 'var(--onAcc)', font: `800 10.5px ${outfit}` }}>
            {items.length} NEW
          </div>
        }
      />

      <div style={body('0 20px 8px')} className="scroll">
        {items.length === 0 && (
          <EmptyState
            d="M3 8l9 6 9-6"
            title="Nothing waiting"
            blurb="Invites and friend requests land here. Open a lobby and someone will turn up."
            action={{ label: 'Create a lobby', onClick: () => store.go('config') }}
            pad="60px 20px"
            tile={64}
          />
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {items.map((x) => (
            <div key={inboxId(x)} style={{ ...row, gap: 11, padding: '12px 13px', ...glass(16), animation: 'vSlide .3s' }}>
              <div style={{ width: 42, height: 42, flex: 'none', borderRadius: '50%', background: grad(x.gi), display: 'grid', placeItems: 'center', font: `800 16px ${outfit}`, color: '#fff' }}>
                {x.mark}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <div style={{ ...head(13), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.title}</div>
                  <div style={{ fontSize: 9.5, color: 'var(--dim2)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>{x.when}</div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>
                  {x.who} · {x.sub}
                </div>
              </div>
              <button
                onClick={() => store.dismissInbox(inboxId(x))}
                style={{
                  appearance: 'none',
                  width: 32,
                  height: 32,
                  flex: 'none',
                  borderRadius: 10,
                  background: 'transparent',
                  border: '1px solid var(--line)',
                  cursor: 'pointer',
                  color: 'var(--dim2)',
                  display: 'grid',
                  placeItems: 'center',
                }}
                aria-label={`Dismiss ${x.title}`}
              >
                <Close size={14} />
              </button>
              <button
                onClick={() => store.acceptInbox(inboxId(x), x.kind, x.who)}
                style={{ appearance: 'none', height: 32, padding: '0 13px', flex: 'none', borderRadius: 10, background: 'var(--gradv)', border: 0, cursor: 'pointer', color: '#fff', font: `800 11.5px ${outfit}`, boxShadow: 'var(--glow)' }}
              >
                {x.act}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 19 · Season pass — the reward track you claim from. */
export function SeasonPass({ s }: { s: State }) {
  return (
    <div style={{ ...screen('62px 0 0') }}>
      <ScreenHeader
        onBack={store.toHome}
        title="Season 2"
        radius={11}
        right={<div style={{ font: `700 10px ${outfit}`, color: 'var(--dim2)', whiteSpace: 'nowrap' }}>18 days left</div>}
        pad="0 20px 12px"
      />

      <div style={{ padding: '0 20px 16px' }}>
        <div
          style={{
            padding: 18,
            borderRadius: 18,
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
                'linear-gradient(rgba(255,255,255,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.07) 1px,transparent 1px)',
              backgroundSize: '18px 18px',
            }}
          />
          <div style={{ position: 'relative' }}>
            <div style={{ font: `800 9.5px ${outfit}`, letterSpacing: '.16em', opacity: 0.85 }}>GLASSHOUSE</div>
            <div style={{ font: `800 27px/1 ${outfit}`, letterSpacing: '-.02em', margin: '9px 0 6px' }}>Level 24</div>
            <div style={{ fontSize: 12, opacity: 0.9 }}>12,450 / 15,000 XP</div>
            <div style={{ height: 7, borderRadius: 999, background: 'rgba(255,255,255,.22)', marginTop: 12, overflow: 'hidden' }}>
              <div style={{ width: '68%', height: '100%', borderRadius: 999, background: '#fff', boxShadow: '0 0 12px rgba(255,255,255,.8)' }} />
            </div>
          </div>
        </div>
      </div>

      <div style={body('0 20px 8px')} className="scroll">
        <div style={{ ...kicker(), margin: '2px 0 10px' }}>REWARD TRACK</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {SEASON.map((t) => {
            const claimed = s.claimed.includes(t.lvl);
            const state = claimed ? 'claimed' : t.state;
            const label = claimed ? 'CLAIMED' : state === 'claim' ? 'CLAIM' : state === 'unlocked' ? 'OWNED' : `LVL ${t.lvl}`;
            return (
              <button
                key={t.lvl}
                onClick={() => store.claimTier(t.lvl, t.name, t.state)}
                style={{
                  appearance: 'none',
                  ...row,
                  gap: 12,
                  padding: '12px 13px',
                  borderRadius: 16,
                  background: state === 'claim' ? 'var(--gradv)' : 'var(--panel)',
                  border: `1px solid ${state === 'claim' ? 'transparent' : 'var(--line)'}`,
                  backdropFilter: 'var(--blur)',
                  WebkitBackdropFilter: 'var(--blur)',
                  boxShadow: 'var(--spec)',
                  cursor: 'pointer',
                  color: state === 'locked' ? 'var(--dim2)' : 'var(--ink)',
                  textAlign: 'left',
                }}
              >
                <div
                  style={{
                    width: 42,
                    height: 42,
                    flex: 'none',
                    borderRadius: 13,
                    background: 'var(--tile)',
                    border: '1px solid var(--line)',
                    display: 'grid',
                    placeItems: 'center',
                    font: `800 10px ${outfit}`,
                    color: 'var(--dim)',
                  }}
                >
                  LVL {t.lvl}
                </div>
                <div style={{ marginRight: 'auto' }}>
                  <div style={head(13.5)}>{t.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--dim2)', marginTop: 2 }}>Season reward</div>
                </div>
                <div style={{ padding: '6px 12px', borderRadius: 9, background: 'var(--tile)', border: '1px solid var(--line)', font: `800 10px ${outfit}`, whiteSpace: 'nowrap' }}>
                  {label}
                </div>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => store.go('shop')}
          style={{
            appearance: 'none',
            width: '100%',
            marginTop: 14,
            ...row,
            gap: 10,
            padding: '14px 16px',
            borderRadius: 14,
            background: 'var(--panel)',
            border: '1px solid var(--line2)',
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
              width: 34,
              height: 34,
              flex: 'none',
              borderRadius: 11,
              background: 'linear-gradient(160deg,rgba(139,164,255,.4),rgba(139,164,255,.12))',
              display: 'grid',
              placeItems: 'center',
              color: 'var(--acc)',
            }}
          >
            <Glyph d="M4 7h16l-1.5 12H5.5zM9 7a3 3 0 016 0" size={17} />
          </div>
          <div style={{ marginRight: 'auto' }}>
            <div style={head(13)}>Tint shop</div>
            <div style={{ fontSize: 10.5, color: 'var(--dim2)', marginTop: 2 }}>Spend XP on avatar glass</div>
          </div>
          <Chevron size={16} stroke="var(--acc)" />
        </button>
      </div>
    </div>
  );
}

/** 20 · Tint shop — equipping actually changes your avatar everywhere. */
export function TintShop({ s }: { s: State }) {
  return (
    <div style={{ ...screen('62px 0 0') }}>
      <ScreenHeader
        onBack={() => store.go('season')}
        title="Tint shop"
        radius={11}
        pad="0 20px 12px"
        right={
          <div style={{ padding: '5px 11px', borderRadius: 8, background: 'var(--tile)', border: '1px solid var(--line)', font: `800 10.5px ${outfit}`, color: 'var(--accLt)', whiteSpace: 'nowrap' }}>
            12,450 XP
          </div>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '6px 20px 16px' }}>
        <div
          style={{
            width: 82,
            height: 82,
            borderRadius: '50%',
            background: TINTS[s.tint].grad,
            display: 'grid',
            placeItems: 'center',
            font: `800 32px ${outfit}`,
            color: '#fff',
            boxShadow: 'inset 0 2px 1px rgba(255,255,255,.5),0 12px 28px rgba(4,10,20,.5)',
          }}
        >
          {MARKS[s.mark]}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--dim)' }}>Live preview · tap a tint to equip</div>
      </div>

      <div style={body('0 20px 8px')} className="scroll">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {TINTS.map((t, i) => {
            const on = s.tint === i;
            return (
              <button
                key={t.name}
                onClick={() => store.equipTint(i)}
                aria-pressed={on}
                style={{
                  appearance: 'none',
                  padding: 13,
                  borderRadius: 16,
                  background: 'var(--panel)',
                  border: `1px solid ${on ? 'var(--acc)' : 'var(--line)'}`,
                  backdropFilter: 'var(--blur)',
                  WebkitBackdropFilter: 'var(--blur)',
                  boxShadow: on ? '0 0 18px rgba(139,164,255,.6)' : 'none',
                  cursor: 'pointer',
                  color: 'var(--ink)',
                  ...row,
                  gap: 11,
                  textAlign: 'left',
                }}
              >
                <div style={{ width: 40, height: 40, flex: 'none', borderRadius: '50%', background: t.grad, boxShadow: 'inset 0 1.5px 1px rgba(255,255,255,.5),0 6px 14px rgba(4,10,20,.4)' }} />
                <div style={{ minWidth: 0 }}>
                  <div style={head(12.5)}>{t.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--dim2)', marginTop: 2 }}>{t.cost ? `${t.cost} XP` : 'Owned'}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** 22 · Spectate — watch a table, answers landing live. */
export function Spectate() {
  return (
    <div style={{ ...screen('62px 0 34px') }}>
      <ScreenHeader
        onBack={store.toHome}
        title="Divya's table"
        subtitle="Imposter Quiz · round 2"
        radius={11}
        right={
          <div style={{ ...row, gap: 6, padding: '6px 11px', borderRadius: 999, background: 'rgba(244,144,192,.16)', border: '1px solid rgba(244,144,192,.4)' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--pink)', animation: 'vPulse 1.2s infinite' }} />
            <div style={{ font: `800 10px ${outfit}`, color: 'var(--pink)' }}>38</div>
          </div>
        }
      />

      <div style={{ padding: '0 20px 14px' }}>
        <div style={{ padding: 16, ...glass(18) }}>
          <div style={{ ...kicker(), marginBottom: 8 }}>THE QUESTION</div>
          <div style={{ font: `800 22px/1.15 ${outfit}`, letterSpacing: '-.02em' }}>Name a fruit that is green.</div>
          <div style={{ ...row, gap: 8, marginTop: 12, fontSize: 11.5, color: 'var(--dim)' }}>
            <Glyph d="M3 3l18 18M10.6 10.7a2 2 0 002.8 2.8M6.1 6.3C4 7.7 2 12 2 12s3.5 6 10 6c1.6 0 3-.4 4.2-1" size={14} width={2.2} />
            One player's question is different — you can't see whose
          </div>
        </div>
      </div>

      <div style={body('0 20px')} className="scroll">
        <div style={{ ...kicker(), marginBottom: 10 }}>ANSWERS AS THEY LAND</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {OTHERS.map((p, i) => (
            <div key={p.name} style={{ ...row, gap: 11, padding: '11px 13px', ...glass(14) }}>
              <div style={{ width: 34, height: 34, flex: 'none', borderRadius: '50%', background: grad(p.gi), display: 'grid', placeItems: 'center', font: `800 13px ${outfit}`, color: '#fff' }}>
                {p.mark}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--dim)', marginRight: 'auto' }}>{p.name}</div>
              <div style={head(15)}>{ANSWERS[i][1]}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '14px 20px 0' }}>
        <button
          onClick={store.enterLobby}
          style={{ appearance: 'none', width: '100%', padding: 16, borderRadius: 999, ...glass(999), border: '1px solid var(--line2)', cursor: 'pointer', color: 'var(--ink)', font: `800 14px ${outfit}` }}
        >
          Ask to join next round
        </button>
      </div>
    </div>
  );
}

/** 21 · Bracket — an eight-player cup, live. */
export function Bracket({ s }: { s: State }) {
  const winners = new Set(['Divya', 'Rohan', 'Meera', 'Arjun']);

  return (
    <div style={{ ...screen('62px 0 0') }}>
      <ScreenHeader
        onBack={() => store.go('board')}
        title="Friday Cup"
        subtitle="8 players · Imposter Quiz"
        radius={11}
        pad="0 20px 12px"
        right={
          <div style={{ padding: '5px 11px', borderRadius: 8, background: 'rgba(52,211,166,.16)', border: '1px solid rgba(52,211,166,.4)', color: 'var(--lime)', font: `800 10px ${outfit}` }}>
            LIVE
          </div>
        }
      />

      <div style={body('0 20px 8px')} className="scroll">
        {BRACKET.map((round, ri) => (
          <div key={ri} style={{ marginBottom: 18 }}>
            <div style={{ ...kicker('var(--dim2)', '.16em'), marginBottom: 9 }}>{ROUND_LABELS[ri]}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {round.map(([a, b], pi) => (
                <div key={pi} style={{ ...glass(14), overflow: 'hidden' }}>
                  <div style={{ ...row, gap: 9, padding: '11px 13px' }}>
                    <div style={{ ...head(12.5), marginRight: 'auto' }}>{a === 'Arjun' ? s.myName : a}</div>
                    {ri < 2 && winners.has(a) && <div style={{ font: `800 9px ${outfit}`, color: 'var(--lime)' }}>WON</div>}
                  </div>
                  <div style={{ height: 1, background: 'var(--line)' }} />
                  <div style={{ ...row, gap: 9, padding: '11px 13px' }}>
                    <div style={{ ...head(12.5), color: 'var(--dim)', marginRight: 'auto' }}>{b === 'Arjun' ? s.myName : b}</div>
                    {(a === 'Arjun' || b === 'Arjun') && <div style={{ font: `800 9px ${outfit}`, color: 'var(--accLt)' }}>YOUR SIDE</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
