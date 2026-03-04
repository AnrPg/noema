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
import { usePathname, useRouter } from 'next/navigation';

export function SessionExpiryModal(): React.JSX.Element | null {
  const isSessionExpired = useAuthStore((s) => s.isSessionExpired);
  const setSessionExpired = useAuthStore((s) => s.setSessionExpired);
  const reset = useAuthStore((s) => s.reset);
  const pathname = usePathname();
  const router = useRouter();

  if (!isSessionExpired) return null;

  const handleSignInAgain = (): void => {
    reset();
    setSessionExpired(false);
    const encoded = encodeURIComponent(pathname);
    router.push(`/login?redirect=${encoded}` as never);
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-background/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-expiry-title"
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
          <p className="text-sm text-muted-foreground">
            Your session has expired. Please sign in again to continue.
          </p>
        </div>
        <Button className="w-full" onClick={handleSignInAgain}>
          Sign in again
        </Button>
      </div>
    </div>
  );
}
