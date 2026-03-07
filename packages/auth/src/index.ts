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
  selectIsSessionExpired,
  selectAuthError,
  selectUserRoles,
} from './store.js';

// Context
export {
  AuthProvider,
  useAuth,
  type IAuthProviderProps,
  type IAuthContextValue,
} from './context.js';
// Backward-compat aliases
export type {
  IAuthProviderProps as AuthProviderProps,
  IAuthContextValue as AuthContextValue,
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
export type {
  IAuthState,
  IAuthActions,
  IAuthStore,
  // Backward-compat aliases
  AuthState,
  AuthActions,
  AuthStore,
} from './types.js';
