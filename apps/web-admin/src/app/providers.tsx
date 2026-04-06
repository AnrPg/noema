/**
 * Root Providers - Admin
 */

'use client';

import type { JSX, ReactNode } from 'react';
import { ApiRequestError, configureApiClient } from '@noema/api-client';
import { AuthProvider, useAuthStore } from '@noema/auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

function shouldRetryRequest(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;

  if (error instanceof ApiRequestError) {
    if (error.status === 0) return false;
    if ([400, 401, 403, 404, 409, 422].includes(error.status)) return false;
    if (process.env.NODE_ENV === 'development' && error.status >= 500) return false;
    if (error.status >= 500) return true;
  }

  return failureCount < 1;
}

// Configure API client.
configureApiClient({
  baseUrl: process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:8080/api',
  getAccessToken: () => useAuthStore.getState().accessToken,
  onUnauthorized: () => {
    useAuthStore.getState().reset();
  },
});

export function Providers({ children }: { children: ReactNode }): JSX.Element {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
            retry: shouldRetryRequest,
          },
          mutations: {
            retry: false,
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
