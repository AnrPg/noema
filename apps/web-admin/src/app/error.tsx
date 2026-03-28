'use client';

import { useEffect } from 'react';
import { AdminErrorScene } from '@/components/admin-error-scene';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  useEffect(() => {
    console.error('[apps/web-admin error boundary]', error);
  }, [error]);

  return <AdminErrorScene variant="error" error={error} onRetry={reset} />;
}
