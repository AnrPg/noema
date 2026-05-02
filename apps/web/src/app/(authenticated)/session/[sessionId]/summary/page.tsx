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
 *   4. Post-Session Reflection — conditional when steps were evaluated
 *   5. Next Actions — 3 CTA buttons (new session / dashboard / knowledge graph)
 */

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@noema/ui';
import type { SessionId, UserId } from '@noema/types';

import {
  useMe,
  useDueConcepts,
  useStabilitySummary,
  useSession,
} from '@noema/api-client';

import { SessionSummaryVitals } from '@/components/session/session-summary-vitals';
import { PostSessionReflection } from '@/components/session/post-session-reflection';
import { useActiveStudyMode } from '@/hooks/use-active-study-mode';
import { getStudyModeShortLabel } from '@/lib/study-mode';

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

// ============================================================================
// SessionSummaryPage
// ============================================================================

export default function SessionSummaryPage(): React.JSX.Element {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId as SessionId;
  const activeStudyMode = useActiveStudyMode();
  const { data: me } = useMe();
  const currentUserId = (me?.id ?? '') as UserId;

  const {
    data: sessionData,
    isLoading: sessionLoading,
    isError: sessionError,
    refetch: refetchSession,
  } = useSession(sessionId);
  const stabilitySummary = useStabilitySummary(currentUserId, {
    enabled: currentUserId !== '',
    studyMode: activeStudyMode,
  });
  const dueConcepts = useDueConcepts(
    { studyMode: activeStudyMode, limit: 200 },
    { enabled: currentUserId !== '' }
  );
  const dueConceptList = dueConcepts.data?.data.concepts ?? [];
  const modeSnapshotUnavailable = stabilitySummary.isError || dueConcepts.isError;

  const isLoading = sessionLoading;

  // ── Error state ────────────────────────────────────────────────────────────

  if (sessionError) {
    return (
      <div className="flex h-screen items-center justify-center flex-col gap-4">
        <p className="text-sm text-destructive">Failed to load session summary.</p>
        <button
          type="button"
          className="text-xs text-primary hover:underline"
          onClick={() => {
            void refetchSession();
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
  const stepsEvaluated = session?.stats.stepsEvaluated ?? 0;
  const stepsSkipped = session?.stats.stepsSkipped ?? 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  const startedAt = session?.startedAt ?? '';
  const completedAt = session?.completedAt ?? null;
  const mode = session?.learningMode ?? 'exploration';

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
          <SessionSummaryVitals
            session={{
              startedAt,
              completedAt,
              mode,
            }}
            stepStats={session.stats}
          />
        </section>
      )}

      {/* ── Section 3: Step Completion ───────────────────────────────────── */}
      <section aria-label="Accuracy">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Step Completion
        </h2>
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Evaluated steps</span>
            <span className="text-lg font-semibold">{String(stepsEvaluated)}</span>
            <span className="text-xs text-muted-foreground">{String(stepsSkipped)} skipped</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Canonical answer evaluation now lives in metacognition. This summary reports the
            session-service step counters and the mode-scoped schedule snapshot below.
          </p>
        </div>
      </section>

      <section aria-label="Mode-scoped progress">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Mode Snapshot
        </h2>
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {getStudyModeShortLabel(activeStudyMode)} mode stability
            </span>
            {stabilitySummary.isLoading ? (
              <span className="text-sm text-muted-foreground">Loading…</span>
            ) : modeSnapshotUnavailable ? (
              <>
                <span className="text-sm text-muted-foreground">
                  Mode snapshot is temporarily unavailable.
                </span>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => {
                    void stabilitySummary.refetch();
                    void dueConcepts.refetch();
                  }}
                >
                  Retry snapshot
                </button>
              </>
            ) : (
              <>
                <span className="text-lg font-semibold">
                  {stabilitySummary.data !== undefined
                    ? `${String(stabilitySummary.data.stableConcepts)}/${String(stabilitySummary.data.totalConcepts)} stable`
                    : '—'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {stabilitySummary.data !== undefined
                    ? `${String(stabilitySummary.data.unstableConcepts)} unstable, reasoning avg ${
                        stabilitySummary.data.averageReasoning === null
                          ? '—'
                          : `${String(Math.round(stabilitySummary.data.averageReasoning * 100))}%`
                      }`
                    : 'Stability snapshot unavailable'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {dueConcepts.data !== undefined
                    ? `${String(dueConceptList.length)} due concepts, ${String(
                        dueConceptList.filter((concept) => concept.algorithm === 'fsrs').length
                      )} FSRS, ${String(
                        dueConceptList.filter((concept) => concept.algorithm === 'hlr').length
                      )} HLR`
                    : 'Scheduler snapshot unavailable'}
                </span>
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            This snapshot uses the same mode-scoped stability read model as Goals and the knowledge
            graph, so post-session review stays aligned with your longer-term progress.
          </p>
        </div>
      </section>

      {/* ── Section 5: Post-Session Reflection (conditional) ─────────────── */}
      {stepsEvaluated > 0 && (
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
