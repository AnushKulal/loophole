/**
 * Whether the social features are actually live, and the calls that make them so.
 *
 * The app has two ways to be signed in. A Firebase account exists on a server
 * and can be referenced by other people; a device account is a real password
 * hashed into this phone's keystore and nothing more. Friends are meaningless
 * for the second kind — there is nobody to ask and nowhere to record it — so
 * every screen checks `isLive()` and shows the fixtures instead, labelled.
 *
 * That is the honest arrangement rather than the flattering one: the alternative
 * is a friends list that looks real, accepts requests, and forgets them.
 */

import * as auth from '../auth/auth';
import type { Ctx } from '../net/firestore';
import { act, getProfiles, myEdges, publishProfile, searchByHandle, type Profile } from './service';
import type { Action, Edge, View } from './cycle';

/** A Firestore context, or null when there is no account to act as. */
export async function ctx(): Promise<Ctx | null> {
  if (auth.backend() !== 'firebase') return null;
  const idToken = await auth.idToken();
  return idToken ? { idToken } : null;
}

/**
 * True when friends can actually work: a project is configured *and* the
 * session is a Firebase one. A configured build whose user signed in before
 * configuration still holds a device session, so both halves are checked.
 */
export const isLive = (): boolean => auth.backend() === 'firebase' && !!auth.currentAccount();

/** Everything the Friends and Inbox screens need, in two round trips. */
export async function loadSocial(
  c: Ctx,
  me: string,
): Promise<{ edges: Edge[]; people: Record<string, Profile> }> {
  const edges = await myEdges(c, me);
  const others = edges.map((e) => (e.pair[0] === me ? e.pair[1] : e.pair[0]));
  const found = await getProfiles(c, others);
  const people: Record<string, Profile> = {};
  for (const [uid, p] of found) people[uid] = p;
  return { edges, people };
}

/**
 * Search, minus yourself and anyone who has blocked you.
 *
 * Filtering here rather than in the screen keeps the "a block is silent" rule
 * in one place — someone who blocked you simply does not come back, which is
 * indistinguishable from their not existing.
 */
export async function findPeople(
  c: Ctx,
  me: string,
  query: string,
  edges: Edge[],
): Promise<Profile[]> {
  const hidden = new Set(
    edges
      .filter((e) => e.state === 'blocked')
      .map((e) => (e.pair[0] === me ? e.pair[1] : e.pair[0])),
  );
  const found = await searchByHandle(c, query);
  return found.filter((p) => p.uid !== me && !hidden.has(p.uid));
}

/** Apply a friend action and report the resulting relationship. */
export async function applyAction(
  c: Ctx,
  me: string,
  them: string,
  action: Action,
  now: number,
): Promise<View> {
  return act(c, me, them, action, now);
}

/**
 * Say you are here.
 *
 * A merge of the whole profile rather than just the timestamp, so a name or
 * mark changed on this device reaches the friends list of everyone who can see
 * it without a separate "save profile" step.
 */
export async function touchPresence(c: Ctx, p: Profile): Promise<void> {
  await publishProfile(c, p);
}
