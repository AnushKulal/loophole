/**
 * Stands in for expo-secure-store under vitest.
 *
 * The keystore is a device capability with no node equivalent. The tests cover
 * the pure serialise/parse/expiry logic around it, not the store itself; these
 * throw so that any test accidentally depending on real persistence fails
 * loudly rather than passing against a fake that always works.
 */
const unavailable = () => Promise.reject(new Error('SecureStore is unavailable in tests'));
export const getItemAsync = unavailable;
export const setItemAsync = unavailable;
export const deleteItemAsync = unavailable;
