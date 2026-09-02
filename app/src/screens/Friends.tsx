import { useState } from 'react';
import { store, type State } from '../store/useStore';
import { CANDIDATES, FRIENDS, grad } from '../data/people';
import { EmptyState, Glyph, ScreenHeader } from '../components/Primitives';
import { body, ellipsis, glass, head, jakarta, kicker, outfit, row, screen } from '../components/ui';

const REQUESTS = [
  { name: 'Aditya', mark: '◈', gi: 6, mutual: '3 mutual friends' },
  { name: 'Priya', mark: '△', gi: 4, mutual: '1 mutual friend' },
];

/** 14 · Friends — requests, the list, and per-row message / invite. */
export default function Friends({ s }: { s: State }) {
  const [query, setQuery] = useState('');
  const list = s.empty
    ? []
    : FRIENDS.filter((f) => !query || f.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div style={{ ...screen('62px 0 0') }}>
      <ScreenHeader
        onBack={store.toHome}
        title="Friends"
        pad="0 20px 12px"
        right={
          <button
            onClick={() => store.go('add')}
            style={{
              appearance: 'none',
              height: 36,
              padding: '0 14px',
              borderRadius: 13,
              background: 'var(--gradv)',
              border: 0,
              cursor: 'pointer',
              color: '#fff',
              font: `800 12px ${outfit}`,
              boxShadow: 'var(--glow)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.8} strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add
          </button>
        }
      />

      <div style={{ padding: '0 20px 12px' }}>
        <div style={{ ...row, gap: 10, padding: '12px 14px', ...glass(15) }}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--dim2)" strokeWidth={2.2} aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M16.5 16.5L21 21" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or #tag"
            aria-label="Search friends"
            style={{ flex: 1, minWidth: 0, appearance: 'none', background: 'transparent', border: 0, outline: 'none', color: 'var(--ink)', font: `500 13.5px ${jakarta}` }}
          />
        </div>
      </div>

      <div style={body('0 20px 8px')} className="scroll">
        <div style={{ ...kicker(), margin: '2px 0 9px' }}>REQUESTS · {REQUESTS.length}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {REQUESTS.map((q) => (
            <div key={q.name} style={{ ...row, gap: 11, padding: '11px 13px', borderRadius: 18, background: 'rgba(150,180,255,.11)', border: '1px solid rgba(150,180,255,.35)' }}>
              <div style={{ width: 40, height: 40, flex: 'none', borderRadius: '50%', background: grad(q.gi), display: 'grid', placeItems: 'center', font: `800 16px ${outfit}`, color: '#fff' }}>
                {q.mark}
              </div>
              <div style={{ marginRight: 'auto' }}>
                <div style={head(13.5)}>{q.name}</div>
                <div style={{ fontSize: 11, color: 'var(--dim2)', marginTop: 2 }}>{q.mutual}</div>
              </div>
              <button
                onClick={() => store.flash(`${q.name} added`)}
                style={{ appearance: 'none', padding: '9px 14px', borderRadius: 12, background: 'var(--gradv)', border: 0, cursor: 'pointer', color: '#fff', font: `800 11.5px ${outfit}` }}
              >
                Accept
              </button>
            </div>
          ))}
        </div>

        {s.empty ? (
          <EmptyState
            d="M2.5 20a6.5 6.5 0 0113 0M18 8v6M15 11h6"
            title="No friends yet"
            blurb="Loophole is no fun alone. Add someone, or share a room code and they'll appear here."
            action={{ label: 'Find people', onClick: () => store.go('add') }}
          />
        ) : (
          <div style={{ ...kicker(), margin: '20px 0 9px' }}>ALL FRIENDS · {FRIENDS.length}</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {list.map((f) => (
            <div key={f.name} style={{ ...row, gap: 10, padding: '10px 12px', ...glass(18) }}>
              <button
                onClick={() => store.openPlayer(f.name)}
                style={{ appearance: 'none', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', ...row, gap: 11, flex: 1, textAlign: 'left', color: 'var(--ink)', minWidth: 0 }}
              >
                <div style={{ width: 42, height: 42, flex: 'none', borderRadius: '50%', background: grad(f.gi), display: 'grid', placeItems: 'center', font: `800 16px ${outfit}`, color: '#fff', position: 'relative' }}>
                  {f.mark}
                  <div style={{ position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: '50%', background: f.dot, border: '2.5px solid var(--bg)' }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ ...row, gap: 6 }}>
                    <div style={head(13.5)}>{f.name}</div>
                    <div style={{ font: `800 8.5px ${outfit}`, color: 'var(--accLt)', whiteSpace: 'nowrap' }}>LVL {f.lvl}</div>
                    {f.name === 'Divya' && (
                      <div
                        style={{
                          minWidth: 17,
                          height: 17,
                          padding: '0 5px',
                          borderRadius: 7,
                          background: 'var(--pink)',
                          color: 'var(--onPink)',
                          font: `800 9.5px ${outfit}`,
                          display: 'grid',
                          placeItems: 'center',
                        }}
                      >
                        2
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--dim2)', marginTop: 2, ...ellipsis }}>{f.status}</div>
                </div>
              </button>
              <button
                onClick={() => store.openDm(f.name)}
                className="hov-accLt"
                style={{
                  appearance: 'none',
                  width: 36,
                  height: 36,
                  flex: 'none',
                  borderRadius: 13,
                  background: 'var(--panel2)',
                  border: '1px solid var(--line)',
                  backdropFilter: 'var(--blur)',
                  WebkitBackdropFilter: 'var(--blur)',
                  boxShadow: 'var(--spec)',
                  cursor: 'pointer',
                  color: 'var(--ink)',
                  display: 'grid',
                  placeItems: 'center',
                }}
                aria-label={`Message ${f.name}`}
              >
                <Glyph d="M21 12a8 8 0 01-8 8H8l-5 3 1.5-5A8 8 0 1121 12z" size={16} width={2.2} />
              </button>
              <button
                onClick={() => store.flash(`Invite sent to ${f.name}`)}
                style={{
                  appearance: 'none',
                  height: 36,
                  padding: '0 12px',
                  flex: 'none',
                  borderRadius: 12,
                  background: 'rgba(150,180,255,.14)',
                  border: '1px solid rgba(150,180,255,.3)',
                  cursor: 'pointer',
                  color: 'var(--lime)',
                  font: `800 11px ${outfit}`,
                }}
              >
                Invite
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 18 · Add friends — live filtering, with a real no-results state. */
export function AddFriends({ s }: { s: State }) {
  const results = CANDIDATES.filter((c) => !s.addQuery || c.name.toLowerCase().startsWith(s.addQuery.toLowerCase()));

  const chip = {
    appearance: 'none' as const,
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    background: 'var(--panel)',
    border: '1px solid var(--line)',
    cursor: 'pointer',
    color: 'var(--ink)',
    font: `800 11.5px ${outfit}`,
  };

  return (
    <div style={{ ...screen('62px 0 34px') }}>
      <ScreenHeader onBack={() => store.go('friends')} title="Add friends" radius={11} />

      <div style={{ padding: '0 20px 14px' }}>
        <div style={{ ...row, gap: 10, padding: '13px 15px', borderRadius: 14, background: 'var(--panel)', border: '1px solid var(--line2)', backdropFilter: 'var(--blur)', WebkitBackdropFilter: 'var(--blur)', boxShadow: 'var(--spec)' }}>
          <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="var(--acc)" strokeWidth={2.2} aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M16.5 16.5L21 21" />
          </svg>
          <input
            value={s.addQuery}
            onChange={(e) => store.setAddQuery(e.target.value)}
            placeholder="Name or #tag"
            aria-label="Search for people"
            style={{ flex: 1, minWidth: 0, appearance: 'none', background: 'transparent', border: 0, outline: 'none', color: 'var(--ink)', font: `500 14px ${jakarta}` }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button onClick={() => store.flash('Point the camera at their code')} style={chip}>
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <path d="M14 14h3v3h-3zM19 19h2v2h-2z" />
            </svg>
            Scan code
          </button>
          <button onClick={() => store.flash('Invite link copied')} style={chip}>
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
              <path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7M12 16V3M8 7l4-4 4 4" />
            </svg>
            Share invite
          </button>
        </div>
      </div>

      <div style={body('0 20px 8px')} className="scroll">
        <div style={{ ...kicker(), margin: '2px 0 9px' }}>SUGGESTED</div>

        {results.length === 0 && (
          <EmptyState
            d="M16.5 16.5L21 21"
            title="No one by that name"
            blurb="Check the spelling, or share your invite link instead."
            pad="40px 20px"
            tile={56}
          />
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {results.map((c) => {
            const sent = s.sent.includes(c.name);
            return (
              <div key={c.name} style={{ ...row, gap: 11, padding: '11px 13px', ...glass(16) }}>
                <div style={{ width: 42, height: 42, flex: 'none', borderRadius: '50%', background: grad(c.gi), display: 'grid', placeItems: 'center', font: `800 16px ${outfit}`, color: '#fff' }}>
                  {c.mark}
                </div>
                <div style={{ marginRight: 'auto', minWidth: 0 }}>
                  <div style={head(13.5)}>{c.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>{c.why}</div>
                </div>
                {sent ? (
                  <div style={{ height: 34, padding: '0 12px', borderRadius: 10, background: 'transparent', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', color: 'var(--dim2)', font: `800 11px ${outfit}` }}>
                    SENT
                  </div>
                ) : (
                  <button
                    onClick={() => store.sendRequest(c.name)}
                    style={{ appearance: 'none', height: 34, padding: '0 14px', borderRadius: 10, background: 'var(--gradv)', border: 0, cursor: 'pointer', color: '#fff', font: `800 11.5px ${outfit}`, boxShadow: 'var(--glow)' }}
                  >
                    Add
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
