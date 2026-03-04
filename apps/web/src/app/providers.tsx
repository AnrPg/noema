'use client';

import { configureApiClient } from '@noema/api-client';
import { AuthProvider, useAuthStore } from '@noema/auth';
import { ThemeProvider } from '@noema/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { useAgentHintsInterceptor } from '@/hooks/use-agent-hints-interceptor';
import { ToastProvider } from '@/components/toast-provider';

configureApiClient({
  baseUrl: process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:8080/api',
  getAccessToken: () => useAuthStore.getState().accessToken,
});

// Inner component so it has access to QueryClientProvider context
function QueryCacheWatcher(): null {
  useAgentHintsInterceptor();
  return null;
}

export function Providers({ children }: { children: React.ReactNode }): React.JSX.Element {
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
