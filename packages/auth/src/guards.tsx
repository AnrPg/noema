/**
 * @noema/auth - Route Guards
 *
 * Components for protecting routes based on auth state.
 */

'use client';

import { useEffect, type ReactNode } from 'react';
import { useAuth } from './context.js';

// ============================================================================
// Types
// ============================================================================

export interface AuthGuardProps {
  children: ReactNode;
  /** Fallback while loading */
  fallback?: ReactNode;
  /** Redirect URL when not authenticated (for use in layouts) */
  redirectTo?: string;
  /** Called when not authenticated */
  onUnauthenticated?: (() => void) | undefined;
  /** Required roles (any of) */
  roles?: string[];
  /** Called when role check fails */
  onUnauthorized?: (() => void) | undefined;
}

export interface GuestGuardProps {
  children: ReactNode;
  /** Fallback while loading */
  fallback?: ReactNode;
  /** Redirect URL when already authenticated (for use in layouts) */
  redirectTo?: string;
  /** Called when already authenticated */
  onAuthenticated?: (() => void) | undefined;
}

// ============================================================================
// Auth Guard
// ============================================================================

/**
 * Protects routes that require authentication.
 * Optionally checks for specific roles.
 */
export function AuthGuard({
  children,
  fallback = null,
  onUnauthenticated,
  roles,
  onUnauthorized,
}: AuthGuardProps) {
  const { isAuthenticated, isLoading, isInitialized, hasRole } = useAuth();

  useEffect(() => {
    if (!isInitialized || isLoading) return;

    if (!isAuthenticated) {
      onUnauthenticated?.();
      return;
    }

    if (roles && roles.length > 0) {
      const hasRequiredRole = roles.some(hasRole);
      if (!hasRequiredRole) {
        onUnauthorized?.();
      }
    }
  }, [
    isAuthenticated,
    isLoading,
    isInitialized,
    roles,
    hasRole,
    onUnauthenticated,
    onUnauthorized,
  ]);

  // Show loading fallback
  if (!isInitialized || isLoading) {
    return <>{fallback}</>;
  }

  // Not authenticated
  if (!isAuthenticated) {
    return <>{fallback}</>;
  }

  // Check roles
  if (roles && roles.length > 0) {
    const hasRequiredRole = roles.some(hasRole);
    if (!hasRequiredRole) {
      return <>{fallback}</>;
    }
  }

  return <>{children}</>;
}

// ============================================================================
// Guest Guard
// ============================================================================

/**
 * Protects routes that should only be visible to guests (non-authenticated users).
 * Used for login/register pages.
 */
export function GuestGuard({ children, fallback = null, onAuthenticated }: GuestGuardProps) {
  const { isAuthenticated, isLoading, isInitialized } = useAuth();

  useEffect(() => {
    if (!isInitialized || isLoading) return;

    if (isAuthenticated) {
      onAuthenticated?.();
    }
  }, [isAuthenticated, isLoading, isInitialized, onAuthenticated]);

  // Show loading fallback
  if (!isInitialized || isLoading) {
    return <>{fallback}</>;
  }

  // Already authenticated
  if (isAuthenticated) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

// ============================================================================
// Admin Guard
// ============================================================================

export interface AdminGuardProps {
  children: ReactNode;
  fallback?: ReactNode;
  onUnauthenticated?: () => void;
  onUnauthorized?: () => void;
}

/**
 * Protects admin-only routes.
 */
export function AdminGuard({
  children,
  fallback = null,
  onUnauthenticated,
  onUnauthorized,
}: AdminGuardProps) {
  return (
    <AuthGuard
      fallback={fallback}
      onUnauthenticated={onUnauthenticated}
      onUnauthorized={onUnauthorized}
      roles={['admin']}
    >
      {children}
    </AuthGuard>
  );
}
