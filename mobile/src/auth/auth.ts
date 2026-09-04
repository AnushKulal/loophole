/**
 * The auth surface the rest of the app uses.
 *
 * Screens never touch Firebase directly — they call these five functions and
 * read `state.auth` off the store. That boundary is the point: swapping the
 * provider means rewriting this file and nothing else.
 *
 * Live tokens are held here in a module variable rather than in app state.
 * They are a credential, not something to render, and keeping them out of the
 * state object means they never reach a screen, a log line, or a snapshot.
 */

import { isConfigured } from './config';
import * as fb from './firebase';
import { FirebaseAuthError, type Account, type Credentials } from './firebase';
import { isSessionDead, toAuthError, UNCONFIGURED, type AuthError } from './errors';
import { clearSession, loadSession, needsRefresh, saveSession } from './session';

export type { Account, AuthError };

let tokens: { idToken: string; refreshToken: string; expiresAt: number } | null = null;

/** The clock, injectable so tests can move it without waiting. */
let clock = () => Date.now();
export const __setClock = (fn: () => number) => {
  clock = fn;
};

export const currentAccount = (): Account | null => account;
let account: Account | null = null;

function adopt(c: Credentials) {
  tokens = { idToken: c.idToken, refreshToken: c.refreshToken, expiresAt: c.expiresAt };
  account = c.account;
}

function forget() {
  tokens = null;
  account = null;
}

export class AuthFailure extends Error {
  constructor(public detail: AuthError) {
    super(detail.message);
    this.name = 'AuthFailure';
  }
}

const fail = (e: unknown): never => {
  if (e instanceof FirebaseAuthError && e.code === 'NOT_CONFIGURED') throw new AuthFailure(UNCONFIGURED);
  throw new AuthFailure(toAuthError(e instanceof FirebaseAuthError ? e.code : undefined));
};

export async function signUp(email: string, password: string, name: string): Promise<Account> {
  try {
    const c = await fb.signUp(email, password, name, clock());
    adopt(c);
    await saveSession(c);
    return c.account;
  } catch (e) {
    return fail(e);
  }
}

export async function signIn(email: string, password: string): Promise<Account> {
  try {
    const c = await fb.signIn(email, password, clock());
    // signInWithPassword omits displayName on some projects; fetch it so the
    // home screen greets you by name rather than by the local part of an email.
    if (!c.account.name) {
      const full = await fb.lookup(c.idToken).catch(() => null);
      if (full?.name) c.account = { ...c.account, name: full.name };
    }
    adopt(c);
    await saveSession(c);
    return c.account;
  } catch (e) {
    return fail(e);
  }
}

export async function sendPasswordReset(email: string): Promise<void> {
  try {
    await fb.sendPasswordReset(email);
  } catch (e) {
    fail(e);
  }
}

export async function signOut(): Promise<void> {
  forget();
  await clearSession();
}

/**
 * Called once on launch. Returns the account if a stored session still works.
 *
 * A refresh token that the server rejects means the session is genuinely over —
 * revoked, deleted, disabled — so it is cleared. Any other failure is treated as
 * "cannot tell right now": the stored session is kept so a plane-mode launch
 * does not silently sign you out.
 */
export async function restore(): Promise<Account | null> {
  if (!isConfigured()) return null;

  const stored = await loadSession();
  if (!stored) return null;

  try {
    const fresh = await fb.refresh(stored.refreshToken, clock());
    tokens = fresh;
    account = stored.account;

    // The stored copy can be stale if the name changed on another device.
    const live = await fb.lookup(fresh.idToken).catch(() => null);
    if (live) account = { ...live, name: live.name || stored.account.name };

    await saveSession({ refreshToken: fresh.refreshToken, account });
    return account;
  } catch (e) {
    const code = e instanceof FirebaseAuthError ? e.code : undefined;
    if (isSessionDead(code)) {
      await clearSession();
      forget();
    }
    return null;
  }
}

/**
 * A valid id token, refreshed if it is close to expiring.
 *
 * Nothing calls this yet — the games are local. It is here because it is the
 * one piece that is easy to get wrong later, when something does need to make
 * an authenticated request.
 */
export async function idToken(): Promise<string | null> {
  if (!tokens) return null;
  if (!needsRefresh(tokens, clock())) return tokens.idToken;

  try {
    const fresh = await fb.refresh(tokens.refreshToken, clock());
    tokens = fresh;
    if (account) await saveSession({ refreshToken: fresh.refreshToken, account });
    return fresh.idToken;
  } catch (e) {
    if (isSessionDead(e instanceof FirebaseAuthError ? e.code : undefined)) {
      await clearSession();
      forget();
    }
    return null;
  }
}

/** Test seam — drops in-memory credentials without touching the keystore. */
export const __reset = () => forget();
