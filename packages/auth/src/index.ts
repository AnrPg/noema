/**
 * @noema/auth
 *
 * Authentication utilities and state management for Noema clients.
 */

// Store
export {
  useAuthStore,
  selectUser,
  selectSettings,
  selectIsAuthenticated,
  selectIsLoading,
  selectIsInitialized,
  selectAuthError,
  selectUserRoles,
} from './store.js';

// Context
export {
  AuthProvider,
  useAuth,
  type AuthProviderProps,
  type AuthContextValue,
} from './context.js';

// Guards
export {
  AuthGuard,
  GuestGuard,
  AdminGuard,
  type AuthGuardProps,
  type GuestGuardProps,
  type AdminGuardProps,
} from './guards.js';

// Types
export type { AuthState, AuthActions, AuthStore } from './types.js';
