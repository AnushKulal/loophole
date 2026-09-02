import { store, type State } from '../store/useStore';
import { CATEGORIES, DIM, GAMES, GAME_LEVEL, GAME_XP, NEON, type Category } from '../data/games';
import { Bar, Glyph, ScreenHeader } from '../components/Primitives';
import { body, ellipsis, glass, head, outfit, row, screen } from '../components/ui';

/** 05 · All games — the full library behind category filters. */
export default function AllGames({ s }: { s: State }) {
  const filters: ('All' | Category)[] = ['All', ...CATEGORIES];
  const list = s.libCat === 'All' ? GAMES : GAMES.filter((g) => g.cat === s.libCat);
  const label = s.libCat === 'All' ? '14 titles' : `${s.libCat} · ${list.length}`;

  return (
    <div style={{ ...screen('62px 0 6px', 'vUp .28s') }}>
      <ScreenHeader
        onBack={store.toHome}
        title="All games"
        right={<div style={{ font: `700 10px ${outfit}`, color: 'var(--dim2)', whiteSpace: 'nowrap' }}>{label}</div>}
      />

      <div className="rail" style={{ display: 'flex', gap: 6, padding: '0 20px 14px', overflowX: 'auto' }}>
        {filters.map((c) => {
          const on = s.libCat === c;
          const count = c === 'All' ? 14 : GAMES.filter((g) => g.cat === c).length;
          return (
            <button
              key={c}
              onClick={() => store.setLibCat(c)}
              aria-pressed={on}
              style={{
                appearance: 'none',
                flex: 'none',
                ...row,
                gap: 6,
                padding: '8px 14px',
                borderRadius: 999,
                border: `1px solid ${on ? 'var(--acc)' : 'var(--line2)'}`,
                background: on ? 'var(--acc)' : 'transparent',
                color: on ? 'var(--onAcc)' : 'var(--dim)',
                cursor: 'pointer',
                font: `700 11.5px ${outfit}`,
                whiteSpace: 'nowrap',
              }}
            >
              {c}
              <span style={{ fontSize: 9.5, opacity: 0.7 }}>{count}</span>
            </button>
          );
        })}
      </div>

      <div style={body('0 20px 8px')} className="scroll">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {list.map((g) => (
            <button
              key={g.name}
              onClick={() => store.pickGame(g.name)}
              className="hov-tile"
              style={{
                appearance: 'none',
                padding: 13,
                ...glass(18),
                cursor: 'pointer',
                textAlign: 'left',
                color: 'var(--ink)',
                display: 'flex',
                flexDirection: 'column',
                gap: 11,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 15,
                  background: DIM[g.cat],
                  border: '1px solid var(--line)',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Glyph d={g.d} size={21} stroke={NEON[g.cat]} width={1.8} glow={NEON[g.cat]} />
              </div>
              <div style={{ width: '100%', minWidth: 0 }}>
                <div style={{ ...head(12.5), ...ellipsis }}>{g.name}</div>
                <div style={{ ...row, gap: 6, marginTop: 4 }}>
                  <div style={{ fontSize: 9.5, color: 'var(--dim2)', marginRight: 'auto' }}>{g.players} players</div>
                  <div style={{ font: `800 8.5px ${outfit}`, color: NEON[g.cat] }}>{GAME_LEVEL[g.name] ?? 'LVL 1'}</div>
                </div>
                <div style={{ marginTop: 7 }}>
                  <Bar pct={GAME_XP[g.name] ?? '12%'} fill={NEON[g.cat]} height={3} />
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
