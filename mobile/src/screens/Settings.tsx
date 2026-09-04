import { Pressable, ScrollView, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { store, type State } from '../store/useStore';
import { PREFS } from '../data/progression';
import { THEMES, useTheme, type Tokens } from '../theme/theme';
import { Chevron, Glass, Glyph, H, Kicker, P, Switch, Tap } from '../components/base';
import { FadeIn } from '../components/GameChrome';

/**
 * The fixed accent wash behind the back chevron and under the sign-out button.
 * The design paints these straight in rgba rather than through a token — they
 * read the same in Day and Night, exactly as in the web build.
 */
const TINT_14 = 'rgba(150,180,255,0.14)';
const LINE_35 = 'rgba(150,180,255,0.35)';
const TINT_12 = 'rgba(150,180,255,0.12)';
const LINE_30 = 'rgba(150,180,255,0.3)';

/**
 * The two appearance cards are frozen previews of a theme, not chrome, so each
 * paints in *its own* ground and ink rather than the palette currently active.
 * Three of the four come straight off the theme module; the Night card's ink is
 * the one value the design writes as a literal.
 */
const NIGHT_BG = THEMES.dark.bg;
const NIGHT_INK = '#f4f4f5';
const DAY_BG = THEMES.light.bg;
const DAY_INK = THEMES.light.ink;

/** The muted second bar of a preview swatch — dark ink on Day, light on Night. */
const SWATCH_DIM_ON_LIGHT = 'rgba(27,16,48,0.25)';
const SWATCH_DIM_ON_DARK = 'rgba(255,255,255,0.25)';

/** The fixtures paint with CSS custom properties; resolve them off the palette. */
function paint(t: Tokens, css: string): string {
  const m = /^var\(--([A-Za-z0-9]+)\)$/.exec(css);
  if (!m) return css;
  const v = t[m[1] as keyof Tokens];
  return typeof v === 'string' ? v : t.ink;
}

/**
 * The two-bar swatch above each card's name. The wide bar is the live accent
 * ramp; the short one stands in for muted text against that card's ground.
 */
function Swatch({ light }: { light: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 4, marginBottom: 11 }}>
      <LinearGradient
        colors={[t.g2, t.acc]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ width: 28, height: 8, borderRadius: 999 }}
      />
      <View
        style={{
          width: 13,
          height: 8,
          borderRadius: 999,
          backgroundColor: light ? SWATCH_DIM_ON_LIGHT : SWATCH_DIM_ON_DARK,
        }}
      />
    </View>
  );
}

/** One of the two appearance previews. Tapping it switches the whole app over. */
function ThemeCard({
  name,
  blurb,
  bg,
  ink,
  border,
  light,
  on,
  onPress,
}: {
  name: string;
  blurb: string;
  bg: string;
  ink: string;
  border: string;
  light: boolean;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={name}
      style={({ pressed }) => [
        {
          flex: 1,
          padding: 15,
          borderRadius: 18,
          backgroundColor: bg,
          borderWidth: 2,
          borderColor: border,
        },
        pressed && { opacity: 0.72 },
      ]}
    >
      <Swatch light={light} />
      <H size={13} color={ink}>
        {name}
      </H>
      {/* the browser dimmed this line with `opacity`, not a colour, and gave it
          its default 1.4 leading — which RN needs spelled out in pixels */}
      <P size={10.5} weight={400} color={ink} style={{ opacity: 0.55, marginTop: 3, lineHeight: 14.7 }}>
        {blurb}
      </P>
    </Pressable>
  );
}

/** A glass row carrying a glyph, a name, a hint and a switch. */
function ToggleRow({
  name,
  hint,
  on,
  onToggle,
  icon,
}: {
  name: string;
  hint: string;
  on: boolean;
  onToggle: () => void;
  icon: { d: string; neon: string };
}) {
  const t = useTheme();
  return (
    <Glass radius={18}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 }}>
        {/* `rgba(255,255,255,.05)` on the web; `tile` is that plaque in both themes */}
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 14,
            backgroundColor: t.tile,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Glyph d={icon.d} color={paint(t, icon.neon)} width={1.9} />
        </View>
        <View style={{ marginRight: 'auto', flexShrink: 1, minWidth: 0 }}>
          <P size={13.5} weight={600} color={t.ink}>
            {name}
          </P>
          <P size={10.5} weight={400} color={t.dim2} style={{ marginTop: 2 }}>
            {hint}
          </P>
        </View>
        <Switch on={on} onPress={onToggle} label={name} />
      </View>
    </Glass>
  );
}

/** 16 · Settings — appearance, preferences, sign out. */
export default function Settings({ s }: { s: State }) {
  const t = useTheme();
  const dark = s.theme === 'dark';

  return (
    <FadeIn style={{ flex: 1, minHeight: 0, paddingTop: 62, paddingBottom: 34 }}>
      {/* header — fixed */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 14 }}>
        <Tap onPress={store.toHome} label="Back">
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 14,
              backgroundColor: TINT_14,
              borderWidth: 1,
              borderColor: LINE_35,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Chevron dir="left" size={17} color={t.accLt} />
          </View>
        </Tap>
        <H size={15}>Settings</H>
      </View>

      {/* everything else — scrolls */}
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
      >
        <Kicker tracking={1.33} style={{ marginBottom: 10 }}>
          APPEARANCE
        </Kicker>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <ThemeCard
            name="Night"
            blurb="Default. Built for the room."
            bg={NIGHT_BG}
            ink={NIGHT_INK}
            border={dark ? t.acc : 'transparent'}
            light={false}
            on={dark}
            onPress={() => store.setTheme('dark')}
          />
          <ThemeCard
            name="Day"
            blurb="For daylight and dentists."
            bg={DAY_BG}
            ink={DAY_INK}
            border={dark ? 'transparent' : t.g2}
            light
            on={!dark}
            onPress={() => store.setTheme('light')}
          />
        </View>

        <Kicker tracking={1.33} style={{ marginTop: 20, marginBottom: 10 }}>
          PREFERENCES
        </Kicker>
        <View style={{ gap: 8 }}>
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
        </View>

        {!!s.auth.user && (
          <View style={{ marginTop: 18, alignItems: 'center', gap: 3 }}>
            <P size={12} color={t.dim2}>
              Signed in as
            </P>
            <P size={13.5} weight={600} color={t.dim}>
              {s.auth.user.email}
            </P>
          </View>
        )}

        <Tap onPress={store.signOut} label="Sign out" style={{ width: '100%', marginTop: 12 }}>
          <View
            style={{
              padding: 15,
              borderRadius: 15,
              backgroundColor: TINT_12,
              borderWidth: 1,
              borderColor: LINE_30,
              alignItems: 'center',
            }}
          >
            <H size={14} color={t.pink}>
              Sign out
            </H>
          </View>
        </Tap>
      </ScrollView>
    </FadeIn>
  );
}
