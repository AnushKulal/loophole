/**
 * Firebase Authentication over its REST API.
 *
 * Deliberately not the `firebase` JS SDK. The SDK's React Native persistence
 * has moved between versions and drags in a native-adjacent dependency for what
 * is, underneath, four HTTP calls. These endpoints are stable, identical on
 * every platform, and testable with nothing but fetch — which is why the tests
 * next door can drive them for real.
 *
 * https://firebase.google.com/docs/reference/rest/auth
 */

import { firebaseConfig, isConfigured, type FirebaseConfig } from './config';

const IDENTITY = 'https://identitytoolkit.googleapis.com/v1/accounts';
const SECURE_TOKEN = 'https://securetoken.googleapis.com/v1/token';

/** Thrown with Firebase's own code so errors.ts can translate it. */
export class FirebaseAuthError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = 'FirebaseAuthError';
  }
}

export interface Tokens {
  idToken: string;
  refreshToken: string;
  /** Absolute epoch milliseconds, not the relative seconds Firebase returns. */
  expiresAt: number;
}

export interface Account {
  uid: string;
  email: string;
  name: string;
}

export interface Credentials extends Tokens {
  account: Account;
}

/**
 * How long to wait before giving up on a request.
 *
 * fetch has no timeout of its own: a connection that opens and then stalls —
 * a captive portal, a dead cell handover — hangs indefinitely, and the sign-in
 * button spins forever with no way back. Fifteen seconds is long enough for a
 * slow connection and short enough to stay believable.
 */
export const REQUEST_TIMEOUT_MS = 15_000;

/** Network failures and Firebase's error envelope both land here as a code. */
async function post(url: string, body: unknown): Promise<any> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: abort.signal,
    });
  } catch {
    // fetch only rejects for transport failures and our own abort, and both
    // mean the same thing to the person waiting: it did not get through.
    throw new FirebaseAuthError('');
  } finally {
    clearTimeout(timer);
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new FirebaseAuthError(json?.error?.message ?? `HTTP_${res.status}`);
  return json;
}

const key = (c: FirebaseConfig) => `key=${encodeURIComponent(c.apiKey)}`;

function guard(c: FirebaseConfig) {
  if (!isConfigured(c)) throw new FirebaseAuthError('NOT_CONFIGURED');
}

/** Seconds-from-now to an absolute deadline, using the caller's clock. */
const deadline = (expiresIn: string, now: number) => now + Number(expiresIn) * 1000;

function toCredentials(r: any, name: string, now: number): Credentials {
  return {
    idToken: r.idToken,
    refreshToken: r.refreshToken,
    expiresAt: deadline(r.expiresIn, now),
    account: { uid: r.localId, email: r.email, name: r.displayName || name },
  };
}

/**
 * Create an account, then immediately set the display name — Firebase's sign-up
 * call takes no name, and an account with no name shows up blank everywhere.
 */
export async function signUp(
  email: string,
  password: string,
  name: string,
  now: number,
  c: FirebaseConfig = firebaseConfig,
): Promise<Credentials> {
  guard(c);
  const r = await post(`${IDENTITY}:signUp?${key(c)}`, {
    email: email.trim(),
    password,
    returnSecureToken: true,
  });

  // If naming fails the account still exists and is signed in, so carry on with
  // the name we were given rather than stranding a half-made account.
  await post(`${IDENTITY}:update?${key(c)}`, {
    idToken: r.idToken,
    displayName: name.trim(),
    returnSecureToken: false,
  }).catch(() => undefined);

  return toCredentials(r, name.trim(), now);
}

export async function signIn(
  email: string,
  password: string,
  now: number,
  c: FirebaseConfig = firebaseConfig,
): Promise<Credentials> {
  guard(c);
  const r = await post(`${IDENTITY}:signInWithPassword?${key(c)}`, {
    email: email.trim(),
    password,
    returnSecureToken: true,
  });
  return toCredentials(r, '', now);
}

export async function sendPasswordReset(
  email: string,
  c: FirebaseConfig = firebaseConfig,
): Promise<void> {
  guard(c);
  await post(`${IDENTITY}:sendOobCode?${key(c)}`, {
    requestType: 'PASSWORD_RESET',
    email: email.trim(),
  });
}

/** Exchanges a refresh token for a fresh id token. */
export async function refresh(
  refreshToken: string,
  now: number,
  c: FirebaseConfig = firebaseConfig,
): Promise<Tokens> {
  guard(c);
  const r = await post(`${SECURE_TOKEN}?${key(c)}`, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  return {
    idToken: r.id_token,
    refreshToken: r.refresh_token,
    expiresAt: deadline(r.expires_in, now),
  };
}

/** Reads the account behind an id token — used to re-hydrate after a refresh. */
export async function lookup(
  idToken: string,
  c: FirebaseConfig = firebaseConfig,
): Promise<Account> {
  guard(c);
  const r = await post(`${IDENTITY}:lookup?${key(c)}`, { idToken });
  const u = r.users?.[0];
  if (!u) throw new FirebaseAuthError('USER_NOT_FOUND');
  return { uid: u.localId, email: u.email, name: u.displayName || '' };
}

/** Permanently deletes the signed-in account. */
export async function deleteAccount(
  idToken: string,
  c: FirebaseConfig = firebaseConfig,
): Promise<void> {
  guard(c);
  await post(`${IDENTITY}:delete?${key(c)}`, { idToken });
}
