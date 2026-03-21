'use client';

/**
 * @noema/web - Session Start Page
 *
 * /session/new — configure and launch a new study session.
 * Three sections: mode selection, card source, and session settings.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Play } from 'lucide-react';
import { useAuth } from '@noema/auth';
import { useCards, useReviewQueue, useStartSession } from '@noema/api-client';
import type { IDeckQueryInput } from '@noema/api-client';
import type { CardId } from '@noema/types';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@noema/ui';

import { ModeSelector, MODE_TO_API } from '@/components/session/mode-selector';
import type { PhilosophicalMode } from '@/components/session/mode-selector';
import { LaneMixSlider } from '@/components/session/lane-mix-slider';
import { DeckQueryFilter } from '@/components/deck-query-filter';

// ============================================================================
// SessionNewPage
// ============================================================================

export default function SessionNewPage(): React.JSX.Element {
  const router = useRouter();
  const { user } = useAuth();

  // ── Section 1: Mode ──────────────────────────────────────────────────────
  const [mode, setMode] = React.useState<PhilosophicalMode>('exploration');

  // ── Section 2: Card source ───────────────────────────────────────────────
  const [useQuickStart, setUseQuickStart] = React.useState(true);
  const [customQuery, setCustomQuery] = React.useState<IDeckQueryInput>({});
  const [showCandidates, setShowCandidates] = React.useState(false);

  // ── Section 3: Settings ──────────────────────────────────────────────────
  const [retentionPct, setRetentionPct] = React.useState(80);
  const [sessionSize, setSessionSize] = React.useState(20);
  const [startError, setStartError] = React.useState<string | null>(null);

  // ── API hooks ────────────────────────────────────────────────────────────
  const reviewQueue = useReviewQueue(
    { limit: sessionSize },
    { enabled: useQuickStart && user?.id !== undefined }
  );
  const sessionCandidates = useCards(
    { ...customQuery, limit: sessionSize },
    { enabled: !useQuickStart && showCandidates && user?.id !== undefined }
  );

  const startSession = useStartSession();

  // ── Derived values ───────────────────────────────────────────────────────
  const queue = reviewQueue.data?.data;
  const retentionCount = queue?.retentionDue;
  const calibrationCount = queue?.calibrationDue;

  // ── Start handler ────────────────────────────────────────────────────────
  async function handleStart(): Promise<void> {
    setStartError(null);
    let cardIds: CardId[] | undefined;

    if (useQuickStart && queue !== undefined) {
      cardIds = queue.cards.slice(0, sessionSize).map((card) => card.cardId as CardId);
    } else if (!useQuickStart && sessionCandidates.data !== undefined) {
      cardIds = sessionCandidates.data.data.items.slice(0, sessionSize).map((card) => card.id);
    }

    try {
      const response = await startSession.mutateAsync({
        mode: MODE_TO_API[mode],
        ...(cardIds !== undefined ? { cardIds } : {}),
      });

      const sessionId = response.data.id as string;
      router.push(`/session/${sessionId}`);
    } catch (err) {
      setStartError(
        err instanceof Error ? err.message : 'Failed to start session. Please try again.'
      );
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Start a Session</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure your study session and begin reviewing.
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Section 1 — Mode Selection                                          */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle>Session Mode</CardTitle>
        </CardHeader>
        <CardContent>
          <ModeSelector value={mode} onChange={setMode} />
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Section 2 — Card Source                                             */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle>Card Source</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Toggle row */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setUseQuickStart(true);
              }}
              className={[
                'rounded-md px-4 py-2 text-sm font-medium transition-colors',
                useQuickStart
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-background text-foreground hover:bg-muted',
              ].join(' ')}
            >
              Quick Start
            </button>
            <button
              type="button"
              onClick={() => {
                setUseQuickStart(false);
              }}
              className={[
                'rounded-md px-4 py-2 text-sm font-medium transition-colors',
                !useQuickStart
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-background text-foreground hover:bg-muted',
              ].join(' ')}
            >
              Custom Build
            </button>
          </div>

          {/* Quick Start panel */}
          {useQuickStart && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Uses your dual-lane plan — optimally chosen cards based on your schedule.
              </p>
              {reviewQueue.isLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Loading your queue…
                </div>
              )}
              {reviewQueue.isSuccess && queue !== undefined && (
                <p className="text-sm text-foreground">
                  <span className="font-medium text-blue-600 dark:text-blue-400">
                    {String(queue.retentionDue)} retention
                  </span>{' '}
                  +{' '}
                  <span className="font-medium text-amber-600 dark:text-amber-400">
                    {String(queue.calibrationDue)} calibration
                  </span>{' '}
                  cards due now.
                </p>
              )}
            </div>
          )}

          {/* Custom Build panel */}
          {!useQuickStart && (
            <div className="flex flex-col gap-4">
              <DeckQueryFilter query={customQuery} onChange={setCustomQuery} />

              <button
                type="button"
                onClick={() => {
                  setShowCandidates((prev) => !prev);
                }}
                className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                {showCandidates ? 'Hide candidates' : 'Preview candidates'}
              </button>

              {showCandidates && (
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  {sessionCandidates.isLoading && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Loading candidates…
                    </div>
                  )}
                  {sessionCandidates.isSuccess &&
                    (sessionCandidates.data.data.items.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No candidates match the current filters.
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-1.5">
                        {sessionCandidates.data.data.items.map((candidate) => (
                          <li
                            key={candidate.id as string}
                            className="flex items-center justify-between text-sm"
                          >
                            <span className="font-mono text-xs text-muted-foreground">
                              {candidate.id as string}
                            </span>
                            <span className="text-xs font-medium text-muted-foreground">
                              {candidate.cardType}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Section 3 — Session Settings                                        */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle>Session Settings</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {/* Lane mix slider */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">Lane Mix</label>
            <LaneMixSlider
              retentionPct={retentionPct}
              onChange={setRetentionPct}
              {...(retentionCount !== undefined ? { retentionCount } : {})}
              {...(calibrationCount !== undefined ? { calibrationCount } : {})}
            />
          </div>

          {/* Session size input */}
          <div className="flex flex-col gap-2">
            <label htmlFor="session-size" className="text-sm font-medium text-foreground">
              Session Size
            </label>
            <div className="flex items-center gap-3">
              <input
                id="session-size"
                type="number"
                min={5}
                max={100}
                value={sessionSize}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (val >= 5 && val <= 100) {
                    setSessionSize(val);
                  }
                }}
                className="w-24 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <span className="text-sm text-muted-foreground">cards (5 – 100)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Start Button                                                         */}
      {/* ------------------------------------------------------------------ */}
      {startError !== null && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {startError}
        </div>
      )}
      <Button
        className="w-full"
        size="lg"
        disabled={startSession.isPending}
        onClick={() => {
          void handleStart();
        }}
      >
        {startSession.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            Starting…
          </>
        ) : (
          <>
            <Play className="mr-2 h-4 w-4" aria-hidden="true" />
            Start Session
          </>
        )}
      </Button>
    </div>
  );
}
