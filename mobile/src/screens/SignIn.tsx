import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { Rect } from 'react-native-svg';
import { store } from '../store/useStore';
import type { State } from '../store/store';
import { useTheme } from '../theme/theme';
import { ArrowRight, Glass, Glyph, Gradient, H, P, Tap } from '../components/base';
import { FadeIn } from '../components/GameChrome';
import { font } from '../theme/tokens';
import { backend } from '../auth/auth';
import {
  confirmProblem,
  emailProblem,
  formProblem,
  nameProblem,
  passwordProblem,
  type Field,
} from '../auth/validate';
import { rate, requirementsFor } from '../auth/strength';

type Mode = 'signIn' | 'signUp';

/**
 * One field: a label you can still read once you have typed, the input, and
 * whatever is wrong with it directly underneath.
 *
 * The label is a real element rather than placeholder text. A placeholder
 * disappears the moment anyone types into it, which leaves a screen of filled
 * boxes nobody can label — worst for the people who most need the label, since
 * a screen reader has nothing to announce and a returning user has nothing to
 * check their autofill against.
 *
 * The error sits under its own field rather than in a summary at the bottom.
 * One message for a whole form makes you work out which box it means.
 */
function LabelledField({
  label,
  hint,
  icon,
  problem,
  children,
  trailing,
}: {
  label: string;
  hint?: string;
  icon: React.ReactNode;
  /** Shown only once the field has been touched — see `touched` below. */
  problem: string | null;
  children: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  const t = useTheme();
  const bad = !!problem;

  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 6, paddingHorizontal: 2 }}>
        <H size={9.5} color={bad ? t.pink : t.dim2} style={{ letterSpacing: 1.2 }}>
          {label.toUpperCase()}
        </H>
        {!!hint && !bad && (
          <P size={10.5} weight={400} color={t.dim2} numberOfLines={1} style={{ marginLeft: 'auto' }}>
            {hint}
          </P>
        )}
      </View>

      <Glass radius={16} borderColor={bad ? t.pink : undefined}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 15 }}>
          {icon}
          {children}
          {trailing}
        </View>
      </Glass>

      {bad && (
        <P
          size={12}
          weight={500}
          color={t.pink}
          // Android announces this as it appears; without it a screen reader
          // user has to go looking for the reason their form did not send.
          accessibilityLiveRegion="polite"
          style={{ marginTop: 6, marginLeft: 2, lineHeight: 16 }}
        >
          {problem}
        </P>
      )}
    </View>
  );
}

/** The advisory strength bar, and the one rule that is actually enforced. */
function PasswordMeter({ password }: { password: string }) {
  const t = useTheme();
  const r = rate(password);
  const reqs = requirementsFor(password);

  if (!password) {
    return (
      <View style={{ marginTop: -4, marginBottom: 12, paddingHorizontal: 2 }}>
        {reqs.map((req) => (
          <P key={req.label} size={11.5} weight={400} color={t.dim2}>
            {req.label}
          </P>
        ))}
      </View>
    );
  }

  const tone = r.score === 'strong' ? t.lime : r.score === 'fair' ? t.gold : t.pink;

  return (
    <View style={{ marginTop: -4, marginBottom: 12, paddingHorizontal: 2, gap: 7 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, height: 4, borderRadius: 999, backgroundColor: t.track, overflow: 'hidden' }}>
          <View style={{ width: `${Math.round(r.fill * 100)}%`, height: '100%', backgroundColor: tone }} />
        </View>
        <P size={11} weight={700} color={tone} accessibilityLabel={`Password strength: ${r.label}`}>
          {r.label}
        </P>
      </View>

      {reqs.map((req) => (
        <View key={req.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          {/* A rule you watch yourself satisfy is one you never fail. */}
          <Glyph
            d={req.met ? 'M4 12.5l5 5L20 7' : 'M5 12h14'}
            size={13}
            color={req.met ? t.lime : t.dim2}
            width={2.4}
          />
          <P size={11.5} weight={400} color={req.met ? t.lime : t.dim2}>
            {req.label}
          </P>
        </View>
      ))}

      {!!r.hint && (
        <P size={11.5} weight={400} color={t.dim2}>
          {r.hint}
        </P>
      )}
    </View>
  );
}

/** 02 · Sign in — a real account, or a plain reason why not. */
export default function SignIn({ s }: { s: State }) {
  const t = useTheme();
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);

  /**
   * Which fields have been left, or tried.
   *
   * Validation waits for this rather than firing on the first keystroke:
   * telling somebody their email is invalid while they are still on the third
   * character of it is technically true and reads as nagging.
   */
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [serverField, setServerField] = useState<Field | null>(null);

  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const nameRef = useRef<TextInput>(null);

  // Firebase when a project is configured, this phone otherwise. Either way
  // there is a real form here — the difference is only how far the account
  // travels, and the copy below says which one you are getting.
  const onDevice = backend() === 'device';
  const { busy, error, notice } = s.auth;

  const signUp = mode === 'signUp';
  const mark = (f: Field) => () => setTouched((was) => ({ ...was, [f]: true }));

  // Live, per-field, but only once the field has been touched.
  const shown = (f: Field, problem: string | null) => (touched[f] ? problem : null);
  const emailBad = shown('email', emailProblem(email));
  const nameBad = signUp ? shown('name', nameProblem(name)) : null;
  const passwordBad = shown('password', passwordProblem(password));
  const confirmBad = signUp ? shown('confirm', confirmProblem(password, confirm)) : null;

  /**
   * The server's objection, shown against the field it names.
   *
   * A wrong password or an address already registered cannot be known here, so
   * these arrive after a round trip; they go in the same slot as the local
   * message so a field never shows two complaints at once.
   */
  const serverMsg = error?.message ?? null;
  const at = (f: Field, local: string | null) =>
    local ?? (serverField === f && serverMsg ? serverMsg : null);

  const swap = (to: Mode) => {
    setMode(to);
    setTouched({});
    setServerField(null);
    store.clearAuthMessage();
  };

  const edit = (set: (v: string) => void) => (v: string) => {
    set(v);
    // Their objection was about what was there a moment ago.
    if (error) {
      setServerField(null);
      store.clearAuthMessage();
    }
  };

  const submit = () => {
    if (busy) return;
    const found = formProblem(mode, { email, password, confirm, name });
    if (found) {
      // Reveal every message at once, so the form is not answered one
      // complaint at a time.
      setTouched({ email: true, name: true, password: true, confirm: true });
      ({ email: undefined, name: nameRef, password: passwordRef, confirm: confirmRef })[found[0]]?.current?.focus();
      return;
    }
    setServerField(mode === 'signIn' ? 'password' : 'email');
    if (mode === 'signIn') store.signIn(email, password);
    else store.signUp(email, password, name);
  };

  /**
   * On Firebase this only needs an address. On a device account there is
   * nowhere to send a link, so the password field doubles as "the one you want
   * instead" and has to be valid before this will do anything.
   */
  const forgot = () => {
    if (busy) return;
    const found = formProblem('signIn', {
      email,
      // Off-device the password is irrelevant to a reset; on-device it *is*
      // the reset, so it has to pass the same rules as a new one.
      password: onDevice ? password : 'ignored',
      confirm: '',
      name: '',
    });
    if (found) {
      setTouched({ email: true, password: true });
      return;
    }
    store.resetPassword(email, onDevice ? password : undefined);
  };

  const input = { flex: 1, padding: 0, color: t.ink, fontFamily: font.body, fontSize: 15 } as const;

  return (
    <FadeIn style={{ flex: 1, minHeight: 0 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, minHeight: 0 }}>
        <ScrollView
          style={{ flex: 1, minHeight: 0 }}
          contentContainerStyle={{ flexGrow: 1, paddingTop: 78, paddingHorizontal: 26, paddingBottom: 44 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <H size={10} color={t.acc} style={{ letterSpacing: 1.8 }}>
            {signUp ? 'CREATE ACCOUNT' : 'SIGN IN'}
          </H>
          <H size={32} style={{ letterSpacing: -0.64, lineHeight: 35, marginTop: 12, marginBottom: 8 }}>
            {signUp ? 'Get a name on the board' : 'Welcome back'}
          </H>
          <P size={14} color={t.dim} style={{ lineHeight: 20, marginBottom: 26, maxWidth: 300 }}>
            {signUp
              ? 'Takes a moment. Your name is what the table sees when you sit down.'
              : onDevice
                ? 'Your account lives on this phone. Everything you unlock is kept between sessions.'
                : 'Your account carries your level, your tint and your friends between devices.'}
          </P>

          <LabelledField
            label="Email address"
            icon={
              <Glyph
                d="M3 8l9 6 9-6"
                size={18}
                color={t.acc}
                width={2}
                extra={<Rect x={2.5} y={5} width={19} height={14} rx={3} fill="none" stroke={t.acc} strokeWidth={2} />}
              />
            }
            problem={at('email', emailBad)}
          >
            <TextInput
              value={email}
              onChangeText={edit(setEmail)}
              onBlur={mark('email')}
              placeholder="you@example.com"
              placeholderTextColor={t.dim2}
              accessibilityLabel="Email address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              inputMode="email"
              returnKeyType="next"
              editable={!busy}
              onSubmitEditing={() => (signUp ? nameRef : passwordRef).current?.focus()}
              style={input}
            />
          </LabelledField>

          {signUp && (
            <LabelledField
              label="Display name"
              hint="What the table sees"
              icon={<Glyph d="M12 3a4 4 0 100 8 4 4 0 000-8zM4 21a8 8 0 0116 0" size={18} color={t.cyan} width={2} />}
              problem={at('name', nameBad)}
            >
              <TextInput
                ref={nameRef}
                value={name}
                onChangeText={edit(setName)}
                onBlur={mark('name')}
                placeholder="Anush"
                placeholderTextColor={t.dim2}
                accessibilityLabel="Display name"
                autoCapitalize="words"
                autoComplete="name"
                maxLength={24}
                returnKeyType="next"
                editable={!busy}
                onSubmitEditing={() => passwordRef.current?.focus()}
                style={input}
              />
            </LabelledField>
          )}

          <LabelledField
            label="Password"
            icon={
              <Glyph
                d="M8 10V7a4 4 0 018 0v3"
                size={18}
                color={t.acc}
                width={2}
                extra={<Rect x={4.5} y={10} width={15} height={10} rx={2.5} fill="none" stroke={t.acc} strokeWidth={2} />}
              />
            }
            problem={at('password', passwordBad)}
            trailing={
              // A visibility toggle rather than a second field to re-type into:
              // you can check what you typed instead of typing it twice.
              <Tap onPress={() => setShow(!show)} label={show ? 'Hide password' : 'Show password'}>
                <P size={12} weight={700} color={t.accLt}>
                  {show ? 'HIDE' : 'SHOW'}
                </P>
              </Tap>
            }
          >
            <TextInput
              ref={passwordRef}
              value={password}
              onChangeText={edit(setPassword)}
              onBlur={mark('password')}
              placeholder={signUp ? 'At least 6 characters' : 'Your password'}
              placeholderTextColor={t.dim2}
              accessibilityLabel="Password"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={signUp ? 'new-password' : 'current-password'}
              secureTextEntry={!show}
              returnKeyType={signUp ? 'next' : 'go'}
              editable={!busy}
              onSubmitEditing={() => (signUp ? confirmRef.current?.focus() : submit())}
              style={input}
            />
          </LabelledField>

          {signUp && <PasswordMeter password={password} />}

          {signUp && (
            <LabelledField
              label="Confirm password"
              hint={confirm && password === confirm ? 'Matches' : undefined}
              icon={
                <Glyph
                  d="M4 12.5l5 5L20 7"
                  size={18}
                  color={confirm && password === confirm ? t.lime : t.g2}
                  width={2.2}
                />
              }
              problem={at('confirm', confirmBad)}
            >
              <TextInput
                ref={confirmRef}
                value={confirm}
                onChangeText={edit(setConfirm)}
                onBlur={mark('confirm')}
                placeholder="Type it once more"
                placeholderTextColor={t.dim2}
                accessibilityLabel="Confirm password"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!show}
                returnKeyType="go"
                editable={!busy}
                onSubmitEditing={submit}
                style={input}
              />
            </LabelledField>
          )}

          {/* Whatever the server said that belongs to no single field. */}
          {!!serverMsg && !serverField && (
            <P
              size={13}
              color={t.pink}
              accessibilityLiveRegion="polite"
              style={{ marginTop: 2, marginBottom: 10, lineHeight: 18 }}
            >
              {serverMsg}
            </P>
          )}
          {!!notice && !serverMsg && (
            <P
              size={13}
              color={t.g2}
              accessibilityLiveRegion="polite"
              style={{ marginTop: 2, marginBottom: 10, lineHeight: 18 }}
            >
              {notice}
            </P>
          )}

          <Tap onPress={submit} label={signUp ? 'Create account' : 'Sign in'} style={{ marginTop: 6 }} disabled={busy}>
            <Gradient radius={999}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 17,
                  paddingHorizontal: 20,
                  opacity: busy ? 0.7 : 1,
                }}
              >
                <H size={15.5} weight={700} color="#fff" style={{ marginRight: 'auto' }}>
                  {busy ? 'Just a moment…' : signUp ? 'Create account' : 'Sign in'}
                </H>
                {busy ? <ActivityIndicator color="#fff" /> : <ArrowRight />}
              </View>
            </Gradient>
          </Tap>

          {!signUp && (
            <Tap onPress={forgot} label="Forgot your password?" style={{ alignSelf: 'center', marginTop: 14 }} disabled={busy}>
              <P size={13} weight={600} color={t.dim}>
                {onDevice ? 'Reset the password on this phone' : 'Forgot your password?'}
              </P>
            </Tap>
          )}

          <View style={{ flex: 1, minHeight: 18 }} />

          <Tap
            onPress={() => swap(signUp ? 'signIn' : 'signUp')}
            label={signUp ? 'I already have an account' : 'Create new account'}
            disabled={busy}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 13,
                padding: 9,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: t.line2,
              }}
            >
              <Gradient radius={14} glow={false} style={{ width: 38, height: 38 }}>
                <View style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}>
                  <Glyph d={signUp ? 'M11 6l-6 6 6 6M5 12h14' : 'M12 5v14M5 12h14'} size={19} color="#fff" width={2.6} />
                </View>
              </Gradient>
              <H size={14.5}>{signUp ? 'I already have an account' : 'Create new account'}</H>
            </View>
          </Tap>
        </ScrollView>
      </KeyboardAvoidingView>
    </FadeIn>
  );
}
