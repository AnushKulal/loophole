import { useSyncExternalStore } from 'react';
import { store, type State } from './store';

/** Subscribe to the whole app state. */
export function useStore(): State {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export { store };
export type { State };
