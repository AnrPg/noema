'use client';

/**
 * @noema/web - Session Summary Page
 *
 * /session/[sessionId]/summary — post-session review page.
 *
 * Sections:
 *   1. Header — "Session Complete" + formatted date
 *   2. Vitals — SessionSummaryVitals grid (total, accuracy, time, mode)
 *   3. Lane Breakdown — two-column retention vs calibration comparison
 *   4. Card Results — scrollable CardResultsTable
 *   5. Post-Session Reflection — conditional (when attempts > 0 and accuracy < 100%)
 *   6. Next Actions — 3 CTA buttons (new session / dashboard / knowledge graph)
 */

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@noema/ui';
import type { SessionId } from '@noema/types';

import { useSession, useSessionAttempts } from '@noema/api-client';

import { SessionSummaryVitals } from '@/components/session/session-summary-vitals';
import { CardResultsTable } from '@/components/session/card-results-table';
import { PostSessionReflection } from '@/components/session/post-session-reflection';

// ============================================================================
// Helpers
// ============================================================================

/** Formats an ISO date string as a human-readable date, e.g. "March 6, 2026". */
function formatDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return isoString;
  }
}

/** Grade >= 3 counts as a passing attempt for accuracy calculation. */
const PASSING_GRADE = 3;

// ============================================================================
// SessionSummaryPage
// ============================================================================

export default function SessionSummaryPage(): React.JSX.Element {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId as SessionId;

  const {
    data: sessionData,
    isLoading: sessionLoading,
    isError: sessionError,
    refetch: refetchSession,
  } = useSession(sessionId);
  const {
    data: attemptsData,
    isLoading: attemptsLoading,
    isError: attemptsError,
    refetch: refetchAttempts,
  } = useSessionAttempts(sessionId);

  const isLoading = sessionLoading || attemptsLoading;

  // ── Error state ────────────────────────────────────────────────────────────

  if (sessionError || attemptsError) {
    return (
      <div className="flex h-screen items-center justify-center flex-col gap-4">
        <p className="text-sm text-destructive">Failed to load session summary.</p>
        <button
          type="button"
          className="text-xs text-primary hover:underline"
          onClick={() => {
            void refetchSession();
            void refetchAttempts();
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Loading state ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <div className="animate-pulse rounded-xl bg-muted h-20" />
        <div className="animate-pulse rounded-xl bg-muted h-40" />
        <div className="animate-pulse rounded-xl bg-muted h-64" />
      </div>
    );
  }

  // ── Data extraction ────────────────────────────────────────────────────────

  const session = sessionData?.data ?? null;
  const attempts = Array.isArray(attemptsData?.data) ? attemptsData.data : [];

  // ── Derived accuracy ───────────────────────────────────────────────────────

  const total = attempts.length;
  const passing = attempts.filter((a) => a.grade >= PASSING_GRADE).length;
  const accuracy = total > 0 ? Math.round((passing / total) * 100) : 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  const startedAt = session?.startedAt ?? '';
  const completedAt = session?.completedAt ?? null;
  const mode = session?.mode ?? 'standard';

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      {/* ── Section 1: Header ────────────────────────────────────────────── */}
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Session Complete</h1>
        {startedAt !== '' && (
          <p className="text-sm text-muted-foreground">{formatDate(startedAt)}</p>
        )}
      </header>

      {/* ── Section 2: Vitals ────────────────────────────────────────────── */}
      {session !== null && (
        <section aria-label="Session vitals">
          <SessionSummaryVitals session={{ startedAt, completedAt, mode }} attempts={attempts} />
        </section>
      )}

      {/* ── Section 3: Accuracy ──────────────────────────────────────────── */}
      <section aria-label="Accuracy">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Accuracy
        </h2>
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Overall Accuracy</span>
            <span className="text-lg font-semibold">
              {total > 0 ? `${String(accuracy)}%` : '—'}
            </span>
            <span className="text-xs text-muted-foreground">
              ({String(passing)}/{String(total)} cards)
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            This percentage reflects how many cards you marked as Good or Easy this session. Lane-specific
            breakdowns will appear once each attempt is tagged with a lane on the server.
          </p>
        </div>
      </section>

      {/* ── Section 4: Card Results ──────────────────────────────────────── */}
      <section aria-label="Card results">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Card Results
        </h2>
        <CardResultsTable attempts={attempts} />
      </section>

      {/* ── Section 5: Post-Session Reflection (conditional) ─────────────── */}
      {total > 0 && accuracy < 100 && (
        <section aria-label="Post-session reflection">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Reflection
          </h2>
          <PostSessionReflection sessionId={sessionId} />
        </section>
      )}

      {/* ── Section 6: Next Actions ──────────────────────────────────────── */}
      <section aria-label="Next actions">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          What&apos;s Next?
        </h2>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/session/new">Start Another Session</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to Dashboard</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/knowledge">Knowledge Graph</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
