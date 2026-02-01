// =============================================================================
// AUTH GUARD COMPONENT
// =============================================================================
// Protects routes that require authentication by redirecting to login

import { useEffect } from "react";
import { router, useSegments, useRootNavigationState } from "expo-router";
import { useAuthStore } from "@/stores/auth.store";

interface AuthGuardProps {
  children: React.ReactNode;
}

/**
 * AuthGuard component that wraps protected content.
 * Redirects unauthenticated users to the login page.
 *
 * @example
 * // Wrap your protected screen content
 * export default function ProtectedScreen() {
 *   return (
 *     <AuthGuard>
 *       <YourContent />
 *     </AuthGuard>
 *   );
 * }
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, isHydrated } = useAuthStore();
  const segments = useSegments();
  const navigationState = useRootNavigationState();

  useEffect(() => {
    // Wait for navigation to be ready and auth to be hydrated
    if (!navigationState?.key || !isHydrated) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (!isAuthenticated && !inAuthGroup) {
      // Redirect to login if not authenticated and not already in auth group
      router.replace("/(auth)/login");
    }
  }, [isAuthenticated, isHydrated, segments, navigationState?.key]);

  // Show nothing while checking auth (or could show a loading spinner)
  if (!isHydrated) {
    return null;
  }

  // If not authenticated and not in auth group, don't render children
  // (redirect will happen in useEffect)
  if (!isAuthenticated && segments[0] !== "(auth)") {
    return null;
  }

  return <>{children}</>;
}

/**
 * Hook to check if user is authenticated and redirect if not.
 * Use this in individual screens that need protection.
 *
 * @returns Object with isAuthenticated and isLoading states
 *
 * @example
 * export default function ProtectedScreen() {
 *   const { isAuthenticated, isLoading } = useRequireAuth();
 *
 *   if (isLoading || !isAuthenticated) {
 *     return <LoadingSpinner />;
 *   }
 *
 *   return <YourContent />;
 * }
 */
export function useRequireAuth() {
  const { isAuthenticated, isHydrated } = useAuthStore();
  const navigationState = useRootNavigationState();

  useEffect(() => {
    // Wait for navigation to be ready and auth to be hydrated
    if (!navigationState?.key || !isHydrated) return;

    if (!isAuthenticated) {
      router.replace("/(auth)/login");
    }
  }, [isAuthenticated, isHydrated, navigationState?.key]);

  return {
    isAuthenticated,
    isLoading: !isHydrated,
  };
}

export default AuthGuard;
