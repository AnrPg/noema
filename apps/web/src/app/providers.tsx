/**
 * Root Providers
 */

'use client';

import { configureApiClient } from '@noema/api-client';
import { AuthProvider, useAuthStore } from '@noema/auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

// Configure API client
configureApiClient({
  baseUrl: process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3002',
  getAccessToken: () => useAuthStore.getState().accessToken,
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
