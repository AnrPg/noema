/**
 * Agent Hints Interceptor
 *
 * Subscribes to TanStack Query's QueryCache and automatically extracts
 * agentHints from every IApiResponse<T>, pushing them into useCopilotStore
 * keyed by the current route.
 */

'use client';

import type { IAgentHints, ValidityPeriod } from '@noema/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useCopilotStore } from '@/stores/copilot-store';

// ============================================================================
// Validity → expiry ms mapping
// ============================================================================

const VALIDITY_MS: Record<ValidityPeriod, number | null> = {
  immediate: 30_000,
  short: 5 * 60_000,
  medium: 60 * 60_000,
  long: 24 * 60 * 60_000,
  indefinite: null,
};

// ============================================================================
// Type guard: check if data is IApiResponse-shaped with agentHints
// ============================================================================

function hasAgentHints(data: unknown): data is { agentHints: IAgentHints } {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const record = data as Record<string, unknown>;
  return (
    'agentHints' in record &&
    typeof record['agentHints'] === 'object' &&
    record['agentHints'] !== null
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useAgentHintsInterceptor(): void {
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const pushHints = useCopilotStore((s) => s.pushHints);
  const clearPage = useCopilotStore((s) => s.clearPage);
  const setActivePage = useCopilotStore((s) => s.setActivePage);

  // Update active page key when route changes
  useEffect(() => {
    setActivePage(pathname);
  }, [pathname, setActivePage]);

  // Subscribe to QueryCache for successful query results
  useEffect(() => {
    const cache = queryClient.getQueryCache();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const unsubscribe = cache.subscribe((event) => {
      if (event.type !== 'updated') {
        return;
      }
      if (event.action.type !== 'success') {
        return;
      }

      const data: unknown = event.query.state.data;
      if (!hasAgentHints(data)) {
        return;
      }

      const hints = data.agentHints;
      pushHints(pathname, hints);

      // Schedule expiry based on validityPeriod
      const expiryMs = VALIDITY_MS[hints.validityPeriod];
      if (expiryMs !== null) {
        const timerId = setTimeout(() => {
          clearPage(pathname);
          timers.delete(timerId);
        }, expiryMs);
        timers.add(timerId);
      }
    });

    return () => {
      unsubscribe();
      timers.forEach((id) => {
        clearTimeout(id);
      });
      timers.clear();
    };
  }, [queryClient, pathname, pushHints, clearPage]);
}
