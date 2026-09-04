/**
 * Keeping the session between launches.
 *
 * The refresh token is the durable credential — anyone holding it can mint id
 * tokens for the account until it is revoked — so it goes through `storage`,
 * which is the platform keystore on a phone. The id token expires in an hour
 * and is refreshed on demand; there is no point storing it separately.
 *
 * The scheduling decisions here are pure functions taking `now`, so the tests
 * can drive expiry without waiting an hour or stubbing the clock.
 */

import { getItem, removeItem, setItem } from './storage';
import { type Account, type Credentials, type Tokens } from './firebase';

const KEY = 'loophole.session.v1';

export interface StoredSession {
  refreshToken: string;
  account: Account;
}

/**
 * Refresh a little before the token actually dies. A request that starts at
 * 59:59 and arrives at 60:01 fails for no good reason; a minute of margin
 * covers the round trip and any clock skew between phone and server.
 */
export const REFRESH_MARGIN_MS = 60_000;

export function needsRefresh(tokens: Pick<Tokens, 'expiresAt'> | null, now: number): boolean {
  if (!tokens) return true;
  return now >= tokens.expiresAt - REFRESH_MARGIN_MS;
}

/** Parses what came out of the keystore, tolerating anything that is not ours. */
export function parseSession(raw: string | null): StoredSession | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (typeof v?.refreshToken !== 'string' || !v.refreshToken) return null;
    if (typeof v?.account?.uid !== 'string' || !v.account.uid) return null;
    return {
      refreshToken: v.refreshToken,
      account: {
        uid: v.account.uid,
        email: typeof v.account.email === 'string' ? v.account.email : '',
        name: typeof v.account.name === 'string' ? v.account.name : '',
      },
    };
  } catch {
    // Corrupt or from an older shape. Treat as signed out rather than throwing
    // on launch — the worst case is one extra sign-in.
    return null;
  }
}

export const serialiseSession = (c: Pick<Credentials, 'refreshToken' | 'account'>): string =>
  JSON.stringify({ refreshToken: c.refreshToken, account: c.account });

/**
 * Every keystore call is wrapped: SecureStore throws on a device with no
 * hardware keystore and on web, where it is unavailable. A session that cannot
 * be saved is not worth crashing over — you just sign in again next launch.
 */
export async function saveSession(c: Pick<Credentials, 'refreshToken' | 'account'>): Promise<void> {
  // Not fatal if it does not land — the session simply will not survive a
  // restart, and the cost of that is signing in again.
  await setItem(KEY, serialiseSession(c));
}

export async function loadSession(): Promise<StoredSession | null> {
  return parseSession(await getItem(KEY));
}

export async function clearSession(): Promise<void> {
  await removeItem(KEY);
}
