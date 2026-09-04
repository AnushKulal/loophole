/**
 * Accounts that live on the phone.
 *
 * Used when no Firebase project is configured, so that "sign in" is a working
 * feature out of the box rather than a screen explaining why it is switched
 * off. Everything the app currently does — every game, the ladder, the tint —
 * runs locally anyway, so a local account is not a lesser thing here; it is
 * only weaker in that it cannot follow you to another phone.
 *
 * The password is stored as a salted SHA-256 hash rather than in the clear.
 * That is worth saying plainly: on a device where the keystore is already
 * compromised this buys nothing, and it is not a substitute for a real backend.
 * What it does buy is that the obvious accident — a password sitting readable
 * in app storage, reused from the person's email — does not happen.
 */

import * as Crypto from 'expo-crypto';
import { getItem, setItem } from './storage';
import type { Account } from './firebase';
import { FirebaseAuthError } from './firebase';

const KEY = 'loophole.localAccounts.v1';

interface Record_ {
  uid: string;
  email: string;
  name: string;
  salt: string;
  hash: string;
}

type Table = Record<string, Record_>;

const normalise = (email: string) => email.trim().toLowerCase();

async function hash(password: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${password}`);
}

async function load(): Promise<Table> {
  const raw = await getItem(KEY);
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Table) : {};
  } catch {
    // Corrupt: treat as no accounts rather than failing to boot.
    return {};
  }
}

async function save(table: Table): Promise<void> {
  // A write that cannot land means the account would vanish on restart, which
  // is worth saying rather than pretending the sign-up worked.
  if (!(await setItem(KEY, JSON.stringify(table)))) {
    throw new FirebaseAuthError('STORAGE_UNAVAILABLE');
  }
}

const toAccount = (r: Record_): Account => ({ uid: r.uid, email: r.email, name: r.name });

export async function signUp(email: string, password: string, name: string): Promise<Account> {
  const id = normalise(email);
  const table = await load();
  if (table[id]) throw new FirebaseAuthError('EMAIL_EXISTS');

  const salt = Crypto.randomUUID();
  const record: Record_ = {
    uid: `local:${Crypto.randomUUID()}`,
    email: email.trim(),
    name: name.trim(),
    salt,
    hash: await hash(password, salt),
  };
  table[id] = record;
  await save(table);
  return toAccount(record);
}

export async function signIn(email: string, password: string): Promise<Account> {
  const table = await load();
  const record = table[normalise(email)];
  // One message for both "no such account" and "wrong password", the same way
  // Firebase's newer projects answer, so the error cannot be used to find out
  // which addresses are registered.
  if (!record) throw new FirebaseAuthError('INVALID_LOGIN_CREDENTIALS');
  if ((await hash(password, record.salt)) !== record.hash) {
    throw new FirebaseAuthError('INVALID_LOGIN_CREDENTIALS');
  }
  return toAccount(record);
}

/**
 * There is no email to send a reset to, so this changes the password directly
 * for someone who is holding the phone. Weaker than an emailed link, and the
 * screen says so rather than implying a mail is on its way.
 */
export async function resetPassword(email: string, next: string): Promise<void> {
  const table = await load();
  const id = normalise(email);
  const record = table[id];
  if (!record) throw new FirebaseAuthError('EMAIL_NOT_FOUND');
  const salt = Crypto.randomUUID();
  table[id] = { ...record, salt, hash: await hash(next, salt) };
  await save(table);
}

/** The signed-in account is remembered by uid; this looks it back up. */
export async function byUid(uid: string): Promise<Account | null> {
  const table = await load();
  const found = Object.values(table).find((r) => r.uid === uid);
  return found ? toAccount(found) : null;
}

export async function count(): Promise<number> {
  return Object.keys(await load()).length;
}
