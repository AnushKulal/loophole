import { describe, expect, it } from 'vitest';
import { isConfigured } from './config';
import { confirmProblem, emailProblem, formProblem, nameProblem, passwordProblem } from './validate';
import { isSessionDead, toAuthError } from './errors';
import { needsRefresh, parseSession, serialiseSession, REFRESH_MARGIN_MS } from './session';

describe('config', () => {
  it('is unconfigured until both halves are present', () => {
    expect(isConfigured({ apiKey: '', projectId: '' })).toBe(false);
    expect(isConfigured({ apiKey: 'k', projectId: '' })).toBe(false);
    expect(isConfigured({ apiKey: '', projectId: 'p' })).toBe(false);
    expect(isConfigured({ apiKey: 'k', projectId: 'p' })).toBe(true);
  });
});

describe('email validation', () => {
  it('accepts the addresses stricter patterns wrongly reject', () => {
    for (const ok of [
      'a@b.co',
      'anush+loophole@gmail.com',
      'first.last@sub.domain.example',
      'x@y.technology',
    ]) {
      expect(emailProblem(ok), ok).toBeNull();
    }
  });

  it('rejects what is definitely not an address', () => {
    for (const bad of ['', '   ', 'nope', 'no@domain', 'two@@at.com', 'sp ace@x.com', '@x.com', 'a@.com']) {
      expect(emailProblem(bad), bad).toBeTruthy();
    }
  });

  it('ignores surrounding whitespace, since keyboards add it', () => {
    expect(emailProblem('  a@b.co  ')).toBeNull();
  });
});

describe('password validation', () => {
  it('matches the six-character floor the server enforces', () => {
    expect(passwordProblem('12345')).toContain('at least 6 characters');
    expect(passwordProblem('123456')).toBeNull();
  });

  it('does not trim — a space is a legitimate character in a password', () => {
    expect(passwordProblem('  a  b')).toBeNull();
  });

  it('asks for a confirmation that matches', () => {
    expect(confirmProblem('secret1', '')).toBeTruthy();
    expect(confirmProblem('secret1', 'secret2')).toContain('do not match');
    expect(confirmProblem('secret1', 'secret1')).toBeNull();
  });
});

describe('name validation', () => {
  it('bounds the length at both ends', () => {
    expect(nameProblem('')).toBeTruthy();
    expect(nameProblem('a')).toContain('too short');
    expect(nameProblem('x'.repeat(24))).toBeNull();
    expect(nameProblem('x'.repeat(25))).toContain('too long');
  });
});

describe('formProblem', () => {
  const full = { email: 'a@b.co', password: 'secret1', confirm: 'secret1', name: 'Anush' };

  it('passes a complete form in either mode', () => {
    expect(formProblem('signIn', full)).toBeNull();
    expect(formProblem('signUp', full)).toBeNull();
  });

  it('ignores name and confirm when signing in', () => {
    expect(formProblem('signIn', { ...full, name: '', confirm: '' })).toBeNull();
    expect(formProblem('signUp', { ...full, name: '' })).toEqual(['name', expect.any(String)]);
  });

  it('reports the topmost problem first, so focus lands where reading starts', () => {
    const broken = { email: 'nope', password: '1', confirm: '', name: '' };
    expect(formProblem('signUp', broken)?.[0]).toBe('email');
    expect(formProblem('signUp', { ...broken, email: 'a@b.co' })?.[0]).toBe('name');
    expect(formProblem('signUp', { ...broken, email: 'a@b.co', name: 'Anush' })?.[0]).toBe('password');
  });
});

describe('error translation', () => {
  it('turns Firebase codes into something a person can act on', () => {
    expect(toAuthError('EMAIL_EXISTS').message).toContain('already has an account');
    expect(toAuthError('EMAIL_EXISTS').field).toBe('email');
    expect(toAuthError('INVALID_PASSWORD').field).toBe('password');
    expect(toAuthError('OPERATION_NOT_ALLOWED').message).toContain('Firebase console');
  });

  it('strips the prose Firebase appends after a colon', () => {
    const raw = 'TOO_MANY_ATTEMPTS_TRY_LATER : Access to this account has been temporarily disabled';
    expect(toAuthError(raw).message).toContain('Too many attempts');
    expect(toAuthError(raw).retryable).toBe(true);
  });

  it('reads an empty code as the network, which is what an empty code means', () => {
    expect(toAuthError('').retryable).toBe(true);
    expect(toAuthError(undefined).message).toContain('Could not reach');
  });

  it('surfaces an unmapped code rather than hiding it', () => {
    expect(toAuthError('SOME_NEW_CODE').message).toContain('SOME_NEW_CODE');
  });

  // Firebase answers a bad key with an English sentence, not a code — verified
  // against the live endpoint. Matched on prose so it does not surface as
  // "Sign-in failed (API KEY NOT VALID. PLEASE PASS A VALID API KEY.)".
  it('recognises the failures Firebase reports as prose', () => {
    expect(toAuthError('API key not valid. Please pass a valid API key.').message).toContain(
      'apiKey in app.json',
    );
    expect(
      toAuthError('Identity Toolkit API has not been used in project 123 before').message,
    ).toContain('Enable Authentication');
  });

  it('passes through unrecognised prose intact rather than shouting it', () => {
    const m = toAuthError('Something specific went wrong upstream').message;
    expect(m).toContain('Something specific went wrong upstream');
    expect(m).not.toContain('(');
  });

  it('knows which codes mean the stored session is finished', () => {
    for (const dead of ['TOKEN_EXPIRED', 'USER_NOT_FOUND', 'USER_DISABLED', 'INVALID_REFRESH_TOKEN']) {
      expect(isSessionDead(dead), dead).toBe(true);
    }
    // A network blip must NOT count, or plane mode signs you out.
    expect(isSessionDead('')).toBe(false);
    expect(isSessionDead('TOO_MANY_ATTEMPTS_TRY_LATER')).toBe(false);
  });
});

describe('session', () => {
  const session = { refreshToken: 'r1', account: { uid: 'u1', email: 'a@b.co', name: 'Anush' } };

  it('round-trips', () => {
    expect(parseSession(serialiseSession(session))).toEqual(session);
  });

  it('treats anything unrecognisable as signed out rather than throwing on launch', () => {
    for (const junk of [null, '', 'not json', '{}', '{"refreshToken":""}', '{"refreshToken":"r"}', '[]']) {
      expect(parseSession(junk as string | null), String(junk)).toBeNull();
    }
  });

  it('fills in missing profile fields instead of rejecting the session', () => {
    const partial = parseSession('{"refreshToken":"r","account":{"uid":"u"}}');
    expect(partial).toEqual({ refreshToken: 'r', account: { uid: 'u', email: '', name: '' } });
  });

  it('refreshes early enough that an in-flight request does not expire mid-air', () => {
    const expiresAt = 1_000_000;
    expect(needsRefresh({ expiresAt }, expiresAt - REFRESH_MARGIN_MS - 1)).toBe(false);
    expect(needsRefresh({ expiresAt }, expiresAt - REFRESH_MARGIN_MS)).toBe(true);
    expect(needsRefresh({ expiresAt }, expiresAt + 1)).toBe(true);
  });

  it('treats no tokens at all as needing a refresh', () => {
    expect(needsRefresh(null, 0)).toBe(true);
  });
});
