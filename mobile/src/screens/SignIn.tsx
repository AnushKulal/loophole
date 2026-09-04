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
import { formProblem, type Field } from '../auth/validate';

type Mode = 'signIn' | 'signUp';

/** One labelled input, outlined in red when it is the field at fault. */
function Row({
  icon,
  bad,
  children,
}: {
  icon: React.ReactNode;
  bad: boolean;
  children: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <Glass radius={18} borderColor={bad ? t.pink : undefined} style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, paddingHorizontal: 16 }}>
        {icon}
        {children}
      </View>
    </Glass>
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
  const [local, setLocal] = useState<[Field, string] | null>(null);

  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const nameRef = useRef<TextInput>(null);

  // Firebase when a project is configured, this phone otherwise. Either way
  // there is a real form here — the difference is only how far the account
  // travels, and the copy below says which one you are getting.
  const onDevice = backend() === 'device';
  const { busy, error, notice } = s.auth;

  // A local validation failure and a server error occupy the same slot; local
  // wins because it is the more specific of the two and was raised last.
  const problem = local ?? (error ? ([error.field ?? null, error.message] as [Field | null, string]) : null);
  const badField = problem?.[0] ?? null;
  const message = problem?.[1] ?? null;

  const swap = (to: Mode) => {
    setMode(to);
    setLocal(null);
    store.clearAuthMessage();
  };

  const edit = (set: (v: string) => void) => (v: string) => {
    set(v);
    if (local || error) {
      setLocal(null);
      store.clearAuthMessage();
    }
  };

  const submit = () => {
    if (busy) return;
    const found = formProblem(mode, { email, password, confirm, name });
    if (found) {
      setLocal(found);
      ({ email: undefined, name: nameRef, password: passwordRef, confirm: confirmRef })[found[0]]?.current?.focus();
      return;
    }
    setLocal(null);
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
    if (found) return setLocal(found);
    setLocal(null);
    store.resetPassword(email, onDevice ? password : undefined);
  };

  const input = {
    flex: 1,
    padding: 0,
    color: t.ink,
    fontFamily: font.body,
    fontSize: 15,
  } as const;

  return (
    <FadeIn style={{ flex: 1, minHeight: 0 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, minHeight: 0 }}
      >
        <ScrollView
          style={{ flex: 1, minHeight: 0 }}
          contentContainerStyle={{ flexGrow: 1, paddingTop: 82, paddingHorizontal: 26, paddingBottom: 44 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <H size={10} color={t.acc} style={{ letterSpacing: 1.8 }}>
            {mode === 'signIn' ? 'SIGN IN' : 'CREATE ACCOUNT'}
          </H>
          <H size={32} style={{ letterSpacing: -0.64, lineHeight: 35, marginTop: 12, marginBottom: 8 }}>
            {mode === 'signIn' ? 'Welcome back' : 'Get a name on the board'}
          </H>
          <P size={14} color={t.dim} style={{ lineHeight: 20, marginBottom: 24, maxWidth: 290 }}>
            {mode === 'signUp'
              ? 'Six characters is the minimum. Pick something you have not used elsewhere.'
              : onDevice
                ? 'Your account lives on this phone. Everything you unlock is kept between sessions.'
                : 'Your account carries your level, your tint and your friends between devices.'}
          </P>

          <Row
            bad={badField === 'email'}
            icon={
              <Glyph
                d="M3 8l9 6 9-6"
                size={18}
                color={t.acc}
                width={2}
                extra={<Rect x={2.5} y={5} width={19} height={14} rx={3} fill="none" stroke={t.acc} strokeWidth={2} />}
              />
            }
          >
            <TextInput
              value={email}
              onChangeText={edit(setEmail)}
              placeholder="Email address"
              placeholderTextColor={t.dim2}
              accessibilityLabel="Email address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              inputMode="email"
              returnKeyType="next"
              editable={!busy}
              onSubmitEditing={() => (mode === 'signUp' ? nameRef : passwordRef).current?.focus()}
              style={input}
            />
          </Row>

          {mode === 'signUp' && (
            <Row
              bad={badField === 'name'}
              icon={<Glyph d="M12 3a4 4 0 100 8 4 4 0 000-8zM4 21a8 8 0 0116 0" size={18} color={t.cyan} width={2} />}
            >
              <TextInput
                ref={nameRef}
                value={name}
                onChangeText={edit(setName)}
                placeholder="Display name"
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
            </Row>
          )}

          <Row
            bad={badField === 'password'}
            icon={
              <Glyph
                d="M8 10V7a4 4 0 018 0v3"
                size={18}
                color={t.acc}
                width={2}
                extra={<Rect x={4.5} y={10} width={15} height={10} rx={2.5} fill="none" stroke={t.acc} strokeWidth={2} />}
              />
            }
          >
            <TextInput
              ref={passwordRef}
              value={password}
              onChangeText={edit(setPassword)}
              placeholder="Password"
              placeholderTextColor={t.dim2}
              accessibilityLabel="Password"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
              secureTextEntry={!show}
              returnKeyType={mode === 'signIn' ? 'go' : 'next'}
              editable={!busy}
              onSubmitEditing={() => (mode === 'signIn' ? submit() : confirmRef.current?.focus())}
              style={input}
            />
            <Tap onPress={() => setShow(!show)} label={show ? 'Hide password' : 'Show password'}>
              <P size={12} weight={600} color={t.dim}>
                {show ? 'Hide' : 'Show'}
              </P>
            </Tap>
          </Row>

          {mode === 'signUp' && (
            <Row
              bad={badField === 'confirm'}
              icon={<Glyph d="M4 12.5l5 5L20 7" size={18} color={t.g2} width={2.2} />}
            >
              <TextInput
                ref={confirmRef}
                value={confirm}
                onChangeText={edit(setConfirm)}
                placeholder="Confirm password"
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
            </Row>
          )}

          {!!message && (
            <P size={13} color={t.pink} style={{ marginTop: 2, marginBottom: 8, lineHeight: 18 }}>
              {message}
            </P>
          )}
          {!!notice && !message && (
            <P size={13} color={t.g2} style={{ marginTop: 2, marginBottom: 8, lineHeight: 18 }}>
              {notice}
            </P>
          )}

          <Tap onPress={submit} label={mode === 'signIn' ? 'Sign in' : 'Create account'} style={{ marginTop: 6 }} disabled={busy}>
            <Gradient radius={999}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 17, paddingHorizontal: 20, opacity: busy ? 0.7 : 1 }}>
                <H size={15.5} weight={700} color="#fff" style={{ marginRight: 'auto' }}>
                  {busy ? 'Just a moment…' : mode === 'signIn' ? 'Sign in' : 'Create account'}
                </H>
                {busy ? <ActivityIndicator color="#fff" /> : <ArrowRight />}
              </View>
            </Gradient>
          </Tap>

          {mode === 'signIn' && (
            <Tap onPress={forgot} label="Forgot your password?" style={{ alignSelf: 'center', marginTop: 14 }} disabled={busy}>
              <P size={13} weight={600} color={t.dim}>
                {onDevice ? 'Reset the password on this phone' : 'Forgot your password?'}
              </P>
            </Tap>
          )}

          <View style={{ flex: 1, minHeight: 18 }} />

          <Tap
              onPress={() => swap(mode === 'signIn' ? 'signUp' : 'signIn')}
              label={mode === 'signIn' ? 'Create new account' : 'I already have an account'}
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
                    <Glyph
                      d={mode === 'signIn' ? 'M12 5v14M5 12h14' : 'M11 6l-6 6 6 6M5 12h14'}
                      size={19}
                      color="#fff"
                      width={2.6}
                    />
                  </View>
                </Gradient>
              <H size={14.5}>{mode === 'signIn' ? 'Create new account' : 'I already have an account'}</H>
            </View>
          </Tap>
        </ScrollView>
      </KeyboardAvoidingView>
    </FadeIn>
  );
}
