import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * expo-crypto is a native module. These tests are about the account logic
 * around it — uniqueness, salting, the deliberate vagueness of the sign-in
 * error — so the digest is replaced by a deterministic stand-in. It is not
 * SHA-256 and does not need to be; what matters is that the same input gives
 * the same output and different inputs do not.
 */
vi.mock('expo-crypto', () => {
  let n = 0;
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digestStringAsync: async (_algo: string, value: string) =>
      'digest:' + [...value].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(16),
    randomUUID: () => `uuid-${++n}`,
  };
});

const { __clear } = await import('./__stubs__/storage');
const local = await import('./local');

beforeEach(() => __clear());

describe('device accounts', () => {
  it('creates an account and signs back into it', async () => {
    const made = await local.signUp('Player@Example.com ', 'secret123', ' Anush ');
    expect(made.email).toBe('Player@Example.com');
    expect(made.name).toBe('Anush');
    expect(made.uid).toMatch(/^local:/);

    const back = await local.signIn('player@example.com', 'secret123');
    expect(back.uid).toBe(made.uid);
  });

  it('treats the address case-insensitively, the way every mail system does', async () => {
    await local.signUp('a@b.co', 'secret123', 'A');
    await expect(local.signUp('A@B.CO', 'secret123', 'A')).rejects.toMatchObject({ code: 'EMAIL_EXISTS' });
    await expect(local.signIn('A@B.Co', 'secret123')).resolves.toBeTruthy();
  });

  it('gives the same answer for a wrong password and an unknown address', async () => {
    await local.signUp('a@b.co', 'secret123', 'A');
    const wrongPassword = await local.signIn('a@b.co', 'nope123').catch((e) => e);
    const noAccount = await local.signIn('ghost@b.co', 'secret123').catch((e) => e);
    // Distinguishing them would let a stranger discover which addresses are
    // registered, which is why Firebase stopped doing it too.
    expect(wrongPassword.code).toBe('INVALID_LOGIN_CREDENTIALS');
    expect(noAccount.code).toBe(wrongPassword.code);
  });

  it('never keeps the password itself', async () => {
    await local.signUp('a@b.co', 'hunter2000', 'A');
    const raw = (await (await import('./__stubs__/storage')).getItem('loophole.localAccounts.v1')) ?? '';
    expect(raw).not.toContain('hunter2000');
    expect(raw).toContain('salt');
  });

  it('salts per account, so two people with one password do not share a hash', async () => {
    await local.signUp('a@b.co', 'samePassword', 'A');
    await local.signUp('c@d.co', 'samePassword', 'C');
    const raw = (await (await import('./__stubs__/storage')).getItem('loophole.localAccounts.v1')) ?? '';
    const hashes = [...raw.matchAll(/"hash":"([^"]+)"/g)].map((m) => m[1]);
    expect(hashes).toHaveLength(2);
    expect(hashes[0]).not.toBe(hashes[1]);
  });

  it('changes a password in place and invalidates the old one', async () => {
    await local.signUp('a@b.co', 'secret123', 'A');
    await local.resetPassword('a@b.co', 'newsecret');
    await expect(local.signIn('a@b.co', 'secret123')).rejects.toMatchObject({
      code: 'INVALID_LOGIN_CREDENTIALS',
    });
    await expect(local.signIn('a@b.co', 'newsecret')).resolves.toBeTruthy();
  });

  it('will not reset a password for an address with no account', async () => {
    await expect(local.resetPassword('ghost@b.co', 'newsecret')).rejects.toMatchObject({
      code: 'EMAIL_NOT_FOUND',
    });
  });

  it('finds an account by uid, which is how a stored session is restored', async () => {
    const made = await local.signUp('a@b.co', 'secret123', 'A');
    expect(await local.byUid(made.uid)).toMatchObject({ email: 'a@b.co', name: 'A' });
    expect(await local.byUid('local:nobody')).toBeNull();
  });

  it('keeps several accounts side by side', async () => {
    await local.signUp('a@b.co', 'secret123', 'A');
    await local.signUp('c@d.co', 'secret123', 'C');
    expect(await local.count()).toBe(2);
    expect((await local.signIn('c@d.co', 'secret123')).name).toBe('C');
  });
});
