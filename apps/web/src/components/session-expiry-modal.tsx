/**
 * Session Expiry Modal
 *
 * Displayed when the API returns a 401 after the user was authenticated
 * (token refresh failed). Non-dismissable — user must sign in again.
 * Wired to the auth store's `isSessionExpired` flag.
 */

'use client';

import { useAuthStore } from '@noema/auth';
import { Button } from '@noema/ui';
import { LogIn } from 'lucide-react';
import type { Route } from 'next';
import { usePathname, useRouter } from 'next/navigation';

export function SessionExpiryModal(): React.JSX.Element | null {
  const isSessionExpired = useAuthStore((s) => s.isSessionExpired);
  const reset = useAuthStore((s) => s.reset);
  const pathname = usePathname();
  const router = useRouter();

  if (!isSessionExpired) return null;

  const handleSignInAgain = (): void => {
    // Navigate first so AuthGuard's onUnauthenticated doesn't race with our redirect.
    const encoded = encodeURIComponent(pathname);
    router.push((`/login?redirect=${encoded}` as Route));
    reset();
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-background/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-expiry-title"
      aria-describedby="session-expiry-desc"
      // Trap Tab inside the modal — the only focusable element is the button below.
      onKeyDown={(e) => {
        if (e.key === 'Tab') e.preventDefault();
      }}
    >
      <div className="mx-4 w-full max-w-sm rounded-lg border bg-card p-6 shadow-lg space-y-4">
        <div className="space-y-2 text-center">
          <div className="flex justify-center">
            <div className="rounded-full bg-[hsl(var(--synapse-400)/0.1)] p-3">
              <LogIn className="h-6 w-6 text-[hsl(var(--synapse-400))]" />
            </div>
          </div>
          <h2 id="session-expiry-title" className="text-lg font-semibold">
            Session expired
          </h2>
          <p id="session-expiry-desc" className="text-sm text-muted-foreground">
            Your session has expired. Please sign in again to continue.
          </p>
        </div>
        {/* autoFocus moves keyboard focus into the modal on open */}
        <Button autoFocus className="w-full" onClick={handleSignInAgain}>
          Sign in again
        </Button>
      </div>
    </div>
  );
}
