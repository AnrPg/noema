'use client';

import { ToastProvider } from '@/components/toast-provider';
import { useAgentHintsInterceptor } from '@/hooks/use-agent-hints-interceptor';
import { ApiRequestError, configureApiClient, configureHlrClient } from '@noema/api-client';
import { AuthProvider, useAuthStore } from '@noema/auth';
import { ThemeProvider } from '@noema/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

configureApiClient({
  baseUrl: process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:8080/api',
  getAccessToken: () => useAuthStore.getState().accessToken,
  onUnauthorized: () => {
    const state = useAuthStore.getState();
    if (state.isInitialized && state.isAuthenticated) {
      state.setSessionExpired(true);
    }
  },
});

configureHlrClient(process.env['NEXT_PUBLIC_HLR_URL'] ?? 'http://localhost:8020');

// Inner component so it has access to QueryClientProvider context
function QueryCacheWatcher(): null {
  useAgentHintsInterceptor();
  return null;
}

function shouldRetryRequest(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;

  if (error instanceof ApiRequestError) {
    if (error.status === 0) return false;
    if ([400, 401, 403, 404, 409, 422].includes(error.status)) return false;
    if (error.status >= 500) return true;
  }

  return failureCount < 1;
}

export function Providers({ children }: { children: React.ReactNode }): React.JSX.Element {
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
      <QueryCacheWatcher />
      <ThemeProvider defaultTheme="dark">
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
