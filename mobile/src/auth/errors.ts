/**
 * Firebase's error codes, translated.
 *
 * The REST API answers with things like `EMAIL_NOT_FOUND` and
 * `TOO_MANY_ATTEMPTS_TRY_LATER : Access to this account has been temporarily
 * disabled...`. Shown raw they read as a crash. Each one here becomes a
 * sentence that says what happened and what to do about it.
 */

import type { Field } from './validate';

export interface AuthError {
  /** What to show the person. */
  message: string;
  /** Which input to outline and focus, when the error points at one. */
  field?: Field;
  /** True when trying the same thing again might work — a network blip. */
  retryable?: boolean;
}

const TABLE: Record<string, AuthError> = {
  EMAIL_EXISTS: {
    message: 'That email already has an account. Sign in instead.',
    field: 'email',
  },
  EMAIL_NOT_FOUND: {
    message: 'No account with that email. Create one below.',
    field: 'email',
  },
  INVALID_PASSWORD: {
    message: 'Wrong password.',
    field: 'password',
  },
  // Newer projects return this instead of distinguishing the two above, so that
  // a stranger cannot use the error to discover which emails are registered.
  INVALID_LOGIN_CREDENTIALS: {
    message: 'That email and password do not match.',
    field: 'password',
  },
  INVALID_EMAIL: {
    message: 'That is not a valid email address.',
    field: 'email',
  },
  MISSING_PASSWORD: { message: 'Enter a password.', field: 'password' },
  WEAK_PASSWORD: {
    message: 'That password is too weak — use at least six characters.',
    field: 'password',
  },
  USER_DISABLED: {
    message: 'This account has been disabled.',
  },
  TOO_MANY_ATTEMPTS_TRY_LATER: {
    message: 'Too many attempts. Wait a few minutes and try again.',
    retryable: true,
  },
  OPERATION_NOT_ALLOWED: {
    message:
      'Email sign-in is switched off for this project. Enable Email/Password under Authentication in the Firebase console.',
  },
  TOKEN_EXPIRED: { message: 'Your session expired. Sign in again.' },
  USER_NOT_FOUND: { message: 'Your session expired. Sign in again.' },
  INVALID_REFRESH_TOKEN: { message: 'Your session expired. Sign in again.' },
  INVALID_GRANT_TYPE: { message: 'Your session expired. Sign in again.' },
  API_KEY_INVALID: {
    message: 'The Firebase API key is wrong. Check EXPO_PUBLIC_FIREBASE_API_KEY.',
  },
};

export const NETWORK: AuthError = {
  message: 'Could not reach the server. Check your connection and try again.',
  retryable: true,
};

export const UNCONFIGURED: AuthError = {
  message: 'No Firebase project is configured for this build, so accounts are unavailable.',
};

/**
 * Not every failure comes back as a SCREAMING_CODE. A rejected API key answers
 * with an English sentence, so these are matched on their prose.
 */
const PROSE: [RegExp, AuthError][] = [
  [
    /api key not valid/i,
    {
      message:
        'The Firebase API key for this build is not valid. Check the apiKey in app.json against your project settings.',
    },
  ],
  [
    /identity ?toolkit.*(has not been used|is disabled)/i,
    {
      message:
        'The Identity Toolkit API is switched off for this project. Enable Authentication in the Firebase console.',
    },
  ],
];

/**
 * Firebase suffixes some codes with a colon and prose — `TOO_MANY_ATTEMPTS_TRY_LATER
 * : Access to this account...`. Match on the code, drop the prose.
 */
export function toAuthError(raw: string | undefined): AuthError {
  const text = (raw ?? '').trim();
  if (!text) return NETWORK;

  const code = text.split(':')[0].trim().toUpperCase();
  if (TABLE[code]) return TABLE[code];

  for (const [pattern, error] of PROSE) {
    if (pattern.test(text)) return error;
  }

  // An unmapped failure is still worth showing verbatim — it is a real answer
  // from the server, and hiding it behind "something went wrong" helps nobody
  // debug. Codes read better with the underscores knocked out.
  const looksLikeCode = /^[A-Z0-9_]+$/.test(code);
  return { message: looksLikeCode ? `Sign-in failed (${code}).` : `Sign-in failed. ${text}` };
}

/** True for the codes that mean the stored session is no longer usable. */
export function isSessionDead(raw: string | undefined): boolean {
  const code = (raw ?? '').split(':')[0].trim().toUpperCase();
  return (
    code === 'TOKEN_EXPIRED' ||
    code === 'USER_NOT_FOUND' ||
    code === 'USER_DISABLED' ||
    code === 'INVALID_REFRESH_TOKEN' ||
    code === 'INVALID_GRANT_TYPE' ||
    code === 'INVALID_ID_TOKEN'
  );
}
