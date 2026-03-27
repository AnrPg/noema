'use client';

import { useEffect } from 'react';
import { ErrorPageScene } from '@/components/error-page-scene';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  useEffect(() => {
    console.error('[apps/web error boundary]', error);
  }, [error]);

  return <ErrorPageScene variant="error" error={error} onRetry={reset} />;
}
