'use client';

import { configureApiClient, configureHlrClient } from '@noema/api-client';
import { AuthProvider, useAuthStore } from '@noema/auth';
import { ThemeProvider } from '@noema/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAgentHintsInterceptor } from '@/hooks/use-agent-hints-interceptor';
import { ToastProvider } from '@/components/toast-provider';

// Inner component so it has access to QueryClientProvider context
function QueryCacheWatcher(): null {
  useAgentHintsInterceptor();
  return null;
}

export function Providers({ children }: { children: React.ReactNode }): React.JSX.Element {
  useEffect(() => {
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
    configureHlrClient(process.env['NEXT_PUBLIC_HLR_URL'] ?? 'http://localhost:3005');
  }, []);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60 * 1000, refetchOnWindowFocus: false },
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
