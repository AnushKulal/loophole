/**
 * An in-memory stand-in for the keystore adapter under vitest.
 *
 * The real one imports React Native for its Platform check, which does not
 * parse in the plain-node environment the engines test in. This behaves like a
 * working store so the tests exercise real round-trips rather than a store that
 * always fails.
 */
const memory = new Map<string, string>();

export const getItem = async (key: string) => memory.get(key) ?? null;
export const setItem = async (key: string, value: string) => {
  memory.set(key, value);
  return true;
};
export const removeItem = async (key: string) => {
  memory.delete(key);
};

/** Test-only: empties the store between cases. */
export const __clear = () => memory.clear();
