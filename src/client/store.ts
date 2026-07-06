import { createInitialState, type State } from '../shared/journal.ts';
import type { Operator } from '../shared/types.ts';

export type ConnectionStatus = 'connecting' | 'connected' | 'offline';

export interface ClientState {
  connection: ConnectionStatus;
  you: Operator | null;
  serverTimeOffsetMs: number;
  seq: number;
  data: State;
}

export function createInitialClientState(): ClientState {
  return {
    connection: 'connecting',
    you: null,
    serverTimeOffsetMs: 0,
    seq: 0,
    data: createInitialState(),
  };
}

export function createStore<T>(initial: T) {
  let state = initial;
  const subscribers = new Set<(state: T) => void>();

  return {
    get(): T {
      return state;
    },
    set(patch: Partial<T> | ((state: T) => T)): void {
      state = typeof patch === 'function' ? (patch as (s: T) => T)(state) : { ...state, ...patch };
      for (const fn of subscribers) fn(state);
    },
    subscribe(fn: (state: T) => void): () => void {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  };
}

export const store = createStore<ClientState>(createInitialClientState());
