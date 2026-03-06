/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
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
 *
 * Note: The eslint-disable directives above suppress no-unsafe-* rules that
 * fire because the @noema/api-client package has not been built yet (no dist/).
 * Once packages are built these suppressions should be removed.
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

  const { data: sessionData, isLoading: sessionLoading } = useSession(sessionId);
  const { data: attemptsData, isLoading: attemptsLoading } = useSessionAttempts(sessionId);

  const isLoading = sessionLoading || attemptsLoading;

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

  const session = (sessionData as any)?.data ?? null;
  const attempts: {
    id: string;
    cardId: string;
    grade: number;
    confidenceBefore: number | null;
    confidenceAfter: number | null;
    hintDepthUsed: number;
    dwellTimeMs: number;
  }[] = (attemptsData as any)?.data ?? [];

  // ── Derived accuracy ───────────────────────────────────────────────────────

  const total = attempts.length;
  const passing = attempts.filter((a) => a.grade >= PASSING_GRADE).length;
  const accuracy = total > 0 ? Math.round((passing / total) * 100) : 0;

  // ── Lane breakdown ─────────────────────────────────────────────────────────
  //
  // The session queue doesn't directly tag each attempt with its originating
  // lane. We use a simple approximation: the first half of the attempts array
  // is treated as the Retention Lane (pre-loaded from the scheduled SRS queue)
  // and the second half as the Calibration Lane (injected cards for weak areas).
  // This is a display-only heuristic — no scheduling decisions are made here.

  const midpoint = Math.ceil(total / 2);
  const retentionAttempts = attempts.slice(0, midpoint);
  const calibrationAttempts = attempts.slice(midpoint);

  const retentionPassing = retentionAttempts.filter((a) => a.grade >= PASSING_GRADE).length;
  const retentionAccuracy =
    retentionAttempts.length > 0
      ? Math.round((retentionPassing / retentionAttempts.length) * 100)
      : 0;

  const calibrationPassing = calibrationAttempts.filter((a) => a.grade >= PASSING_GRADE).length;
  const calibrationAccuracy =
    calibrationAttempts.length > 0
      ? Math.round((calibrationPassing / calibrationAttempts.length) * 100)
      : 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  const startedAt: string = (session?.startedAt as string | undefined) ?? '';
  const completedAt: string | null = (session?.completedAt as string | null | undefined) ?? null;
  const mode: string = (session?.mode as string | undefined) ?? 'standard';

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

      {/* ── Section 3: Lane Breakdown ────────────────────────────────────── */}
      <section aria-label="Lane breakdown">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Lane Breakdown
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Retention Lane */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Retention Lane
            </p>
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              {String(retentionAttempts.length)}
              <span className="ml-1 text-sm font-normal text-muted-foreground">cards</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Accuracy:{' '}
              <span className="font-medium text-foreground">{String(retentionAccuracy)}%</span>
            </p>
          </div>

          {/* Calibration Lane */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Calibration Lane
            </p>
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              {String(calibrationAttempts.length)}
              <span className="ml-1 text-sm font-normal text-muted-foreground">cards</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Accuracy:{' '}
              <span className="font-medium text-foreground">{String(calibrationAccuracy)}%</span>
            </p>
          </div>
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
