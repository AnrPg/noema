'use client';

import '@/styles/globals.css';
import { useEffect } from 'react';
import { AdminErrorScene } from '@/components/admin-error-scene';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  useEffect(() => {
    console.error('[apps/web-admin global error boundary]', error);
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body className="bg-background text-foreground font-sans antialiased">
        <AdminErrorScene variant="error" error={error} onRetry={reset} />
      </body>
    </html>
  );
}
