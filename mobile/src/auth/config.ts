/**
 * Firebase client configuration.
 *
 * These two values are *public* client config. They identify the project; they
 * do not authorise anything. Every Firebase web app ships them in its bundle
 * and Firebase's own documentation says to treat them as public — access is
 * controlled by the project's auth settings and security rules, not by hiding
 * these. They are committed on purpose so that a clone of this repo builds and
 * runs without a setup step.
 *
 * Plain constants rather than app.json's `extra`: `expo-constants` does not
 * carry `extra` into a web export, so config read that way is present on the
 * APK and absent in the browser — which is exactly the sort of difference that
 * gets discovered late. This file resolves identically on every platform.
 *
 * A fork points at its own project either by editing DEFAULTS or by setting
 * EXPO_PUBLIC_FIREBASE_API_KEY and EXPO_PUBLIC_FIREBASE_PROJECT_ID in a `.env`
 * file, which Expo inlines at build time.
 */

export interface FirebaseConfig {
  apiKey: string;
  projectId: string;
}

/** Filled in from the Firebase console. Empty means accounts are switched off. */
const DEFAULTS: FirebaseConfig = {
  apiKey: '',
  projectId: '',
};

export const firebaseConfig: FirebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || DEFAULTS.apiKey,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || DEFAULTS.projectId,
};

/**
 * False until a project is wired up. The sign-in screen checks this so an
 * unconfigured build says so plainly instead of failing on every tap with a
 * network error nobody can act on.
 */
export const isConfigured = (c: FirebaseConfig = firebaseConfig): boolean =>
  c.apiKey.length > 0 && c.projectId.length > 0;
