// =============================================================================
// AUTH STATE - Shared state to avoid circular dependencies
// =============================================================================
// This module provides a simple way to share auth state between api.ts and
// auth.store.ts without creating circular imports.

type AuthStateListener = (isAuthenticated: boolean) => void;

let _isAuthenticated = false;
const listeners: Set<AuthStateListener> = new Set();

export const authState = {
  get isAuthenticated() {
    return _isAuthenticated;
  },

  setAuthenticated(value: boolean) {
    if (_isAuthenticated !== value) {
      _isAuthenticated = value;
      listeners.forEach((listener) => listener(value));
    }
  },

  subscribe(listener: AuthStateListener) {
    listeners.add(listener);
    // Return unsubscribe function
    return () => {
      listeners.delete(listener);
    };
  },
};

// React hook to use auth state
import { useSyncExternalStore, useCallback } from "react";

export function useIsAuthenticated(): boolean {
  const subscribe = useCallback((onStoreChange: () => void) => {
    return authState.subscribe(onStoreChange);
  }, []);

  const getSnapshot = useCallback(() => {
    return authState.isAuthenticated;
  }, []);

  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => false, // Server snapshot
  );
}
