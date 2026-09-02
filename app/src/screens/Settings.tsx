import { store, type State } from '../store/useStore';
import { PREFS } from '../data/progression';
import { ScreenHeader, ToggleRow } from '../components/Primitives';
import { body, kicker, outfit, screen } from '../components/ui';

/** 16 · Settings — appearance, preferences, sign out. */
export default function Settings({ s }: { s: State }) {
  const dark = s.theme === 'dark';

  const swatch = (light: boolean) => (
    <div style={{ display: 'flex', gap: 4, marginBottom: 11 }}>
      <div style={{ width: 28, height: 8, borderRadius: 999, background: 'linear-gradient(90deg,var(--g2),var(--acc))' }} />
      <div style={{ width: 13, height: 8, borderRadius: 999, background: light ? 'rgba(27,16,48,.25)' : 'rgba(255,255,255,.25)' }} />
    </div>
  );

  return (
    <div style={{ ...screen('62px 0 34px') }}>
      <ScreenHeader onBack={store.toHome} title="Settings" />

      <div style={body('0 20px 8px')} className="scroll">
        <div style={{ ...kicker(), marginBottom: 10 }}>APPEARANCE</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => store.setTheme('dark')}
            aria-pressed={dark}
            style={{
              appearance: 'none',
              flex: 1,
              padding: 15,
              borderRadius: 18,
              background: '#0a1018',
              border: `2px solid ${dark ? 'var(--acc)' : 'transparent'}`,
              cursor: 'pointer',
              textAlign: 'left',
              color: '#f4f4f5',
            }}
          >
            {swatch(false)}
            <div style={{ font: `800 13px ${outfit}` }}>Night</div>
            <div style={{ fontSize: 10.5, opacity: 0.55, marginTop: 3 }}>Default. Built for the room.</div>
          </button>
          <button
            onClick={() => store.setTheme('light')}
            aria-pressed={!dark}
            style={{
              appearance: 'none',
              flex: 1,
              padding: 15,
              borderRadius: 18,
              background: '#e7edf7',
              border: `2px solid ${dark ? 'transparent' : 'var(--g2)'}`,
              cursor: 'pointer',
              textAlign: 'left',
              color: '#16202e',
            }}
          >
            {swatch(true)}
            <div style={{ font: `800 13px ${outfit}` }}>Day</div>
            <div style={{ fontSize: 10.5, opacity: 0.55, marginTop: 3 }}>For daylight and dentists.</div>
          </button>
        </div>

        <div style={{ ...kicker(), margin: '20px 0 10px' }}>PREFERENCES</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {PREFS.map((p) => (
            <ToggleRow
              key={p.key}
              name={p.name}
              hint={p.hint}
              on={s.pref[p.key]}
              onToggle={() => store.togglePref(p.key)}
              icon={{ d: p.d, neon: p.neon }}
            />
          ))}
        </div>

        <button
          onClick={store.signOut}
          style={{
            appearance: 'none',
            width: '100%',
            marginTop: 18,
            padding: 15,
            borderRadius: 15,
            background: 'rgba(150,180,255,.12)',
            border: '1px solid rgba(150,180,255,.3)',
            cursor: 'pointer',
            color: 'var(--pink)',
            font: `800 14px ${outfit}`,
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
