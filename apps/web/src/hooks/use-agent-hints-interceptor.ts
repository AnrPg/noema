/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/**
 * Agent Hints Interceptor
 *
 * Subscribes to TanStack Query's QueryCache and automatically extracts
 * agentHints from every IApiResponse<T>, pushing them into useCopilotStore
 * keyed by the current route.
 *
 * Expiry: per-hint setTimeout schedules markPageExpiring → 300ms fade → clearPage.
 * A 30s polling interval catches orphaned hints (e.g. stored hints whose timers
 * were cancelled when the component unmounted and remounted).
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

const FADE_DURATION_MS = 300;

// ============================================================================
// Type guard
// ============================================================================

function hasAgentHints(data: unknown): data is { agentHints: IAgentHints } {
  if (typeof data !== 'object' || data === null) return false;
  const record = data as Record<string, unknown>;
  return (
    'agentHints' in record &&
    typeof record['agentHints'] === 'object' &&
    record['agentHints'] !== null
  );
}

// ============================================================================
// Helpers
// ============================================================================

/** Look up validity ms, treating undefined (noUncheckedIndexedAccess) as null. */
function lookupValidityMs(period: ValidityPeriod): number | null {
  return VALIDITY_MS[period] ?? null;
}

// ============================================================================
// Hook
// ============================================================================

export function useAgentHintsInterceptor(): void {
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const pushHints = useCopilotStore((s) => s.pushHints);
  const clearPage = useCopilotStore((s) => s.clearPage);
  const markPageExpiring = useCopilotStore((s) => s.markPageExpiring);
  const setActivePage = useCopilotStore((s) => s.setActivePage);

  useEffect(() => {
    setActivePage(pathname);
  }, [pathname, setActivePage]);

  useEffect(() => {
    const cache = queryClient.getQueryCache();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    // Helper: schedule fade + clear for a page
    const scheduleExpiry = (pageKey: string, expiryMs: number): void => {
      const timerId = setTimeout(() => {
        markPageExpiring(pageKey);
        const clearId = setTimeout(() => {
          clearPage(pageKey);
          timers.delete(clearId);
        }, FADE_DURATION_MS);
        timers.add(clearId);
        timers.delete(timerId);
      }, expiryMs);
      timers.add(timerId);
    };

    // Subscribe to QueryCache for successful query results
    const unsubscribe = cache.subscribe((event) => {
      if (event.type !== 'updated') return;
      if (event.action.type !== 'success') return;

      const data: unknown = event.query.state.data;
      if (!hasAgentHints(data)) return;

      const hints = data.agentHints;
      pushHints(pathname, hints);

      const expiryMs = lookupValidityMs(hints.validityPeriod);
      if (expiryMs !== null) {
        scheduleExpiry(pathname, expiryMs);
      }
    });

    // 30s polling interval: re-check stored hints against their validity periods.
    // Catches orphaned hints whose original timers were cancelled on unmount.
    const pollId = setInterval(() => {
      const state = useCopilotStore.getState();
      const now = Date.now();
      for (const [pageKey, pageHints] of Object.entries(state.hintsByPage)) {
        const receivedAt = state.lastReceivedAt[pageKey];
        if (typeof receivedAt !== 'number') continue;
        // Use the shortest validity period among all hints for this page
        const minExpiry = pageHints.reduce<number | null>((min, h: IAgentHints) => {
          const ms = lookupValidityMs(h.validityPeriod);
          if (ms === null) return min;
          return min === null ? ms : Math.min(min, ms);
        }, null);
        if (minExpiry !== null && now - receivedAt >= minExpiry) {
          if (!state.expiringPages.has(pageKey)) {
            markPageExpiring(pageKey);
            const clearId = setTimeout(() => {
              clearPage(pageKey);
              timers.delete(clearId);
            }, FADE_DURATION_MS);
            timers.add(clearId);
          }
        }
      }
    }, 30_000);

    return () => {
      unsubscribe();
      clearInterval(pollId);
      timers.forEach((id) => {
        clearTimeout(id);
      });
      timers.clear();
    };
  }, [queryClient, pathname, pushHints, clearPage, markPageExpiring]);
}
