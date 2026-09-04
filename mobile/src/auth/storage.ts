import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Where credentials are kept.
 *
 * On a phone that is the platform keystore, which is the only appropriate home
 * for a refresh token or a password hash. `expo-secure-store` has no keystore
 * to talk to in a browser, so the web build falls back to `localStorage` —
 * weaker, and worth being explicit about: web here is the verification harness
 * and the PWA, not the shipping target. Anything genuinely sensitive should not
 * rely on the web path.
 *
 * Every call is wrapped. A device with no hardware keystore, a browser with
 * site data blocked, a private window — all of these throw, and none of them
 * are worth crashing over. The cost of a failed write is signing in again.
 */

const web = Platform.OS === 'web';

export async function getItem(key: string): Promise<string | null> {
  try {
    if (web) return globalThis.localStorage?.getItem(key) ?? null;
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setItem(key: string, value: string): Promise<boolean> {
  try {
    if (web) {
      globalThis.localStorage?.setItem(key, value);
      return true;
    }
    await SecureStore.setItemAsync(key, value);
    return true;
  } catch {
    return false;
  }
}

export async function removeItem(key: string): Promise<void> {
  try {
    if (web) {
      globalThis.localStorage?.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  } catch {
    /* nothing stored, or nowhere to store it */
  }
}
