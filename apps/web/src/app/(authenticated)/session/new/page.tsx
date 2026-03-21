'use client';

/**
 * @noema/web - Session Start Page
 *
 * /session/new — configure and launch a new study session.
 * Three sections: mode selection, card source, and session settings.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Loader2, Play } from 'lucide-react';
import { useAuth } from '@noema/auth';
import { useCards, useCard, useReviewQueue, useStartSession } from '@noema/api-client';
import type { IDeckQueryInput } from '@noema/api-client';
import type { CardId } from '@noema/types';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@noema/ui';

import { ModeSelector } from '@/components/session/mode-selector';
import type { PhilosophicalMode } from '@/components/session/mode-selector';
import { LaneMixSlider } from '@/components/session/lane-mix-slider';
import { CardRenderer } from '@/components/card-renderers';
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
  const [previewIndex, setPreviewIndex] = React.useState(0);

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
  const previewCandidateIds = React.useMemo(
    () => sessionCandidates.data?.data.items.map((candidate) => candidate.id) ?? [],
    [sessionCandidates.data]
  );
  const previewCandidateId =
    previewCandidateIds.length > 0
      ? previewCandidateIds[Math.min(previewIndex, previewCandidateIds.length - 1)]
      : undefined;
  const { data: previewCard, isLoading: previewCardLoading } = useCard(
    (previewCandidateId ?? '') as CardId,
    { enabled: showCandidates && previewCandidateId !== undefined }
  );

  React.useEffect(() => {
    setPreviewIndex(0);
  }, [showCandidates, customQuery, sessionSize]);

  // ── Start handler ────────────────────────────────────────────────────────
  async function handleStart(): Promise<void> {
    setStartError(null);
    let cardIds: CardId[] = [];

    if (useQuickStart) {
      const queueResponse = queue ?? (await reviewQueue.refetch()).data?.data;

      if (queueResponse === undefined) {
        setStartError(
          'We could not load your review queue yet, so we do not know which cards are safe to start. Please refresh or wait a moment and try again.'
        );
        return;
      }

      cardIds = queueResponse.cards.slice(0, sessionSize).map((card) => card.cardId as CardId);

      if (cardIds.length === 0) {
        setStartError(
          'Quick Start is empty right now. You are caught up on due reviews, so try Custom Build or come back when more cards are due.'
        );
        return;
      }
    } else {
      const candidateResponse = sessionCandidates.data ?? (await sessionCandidates.refetch()).data;
      const candidateItems = candidateResponse?.data.items ?? [];

      if (candidateItems.length === 0) {
        setStartError(
          'This custom build has no matching cards yet. Adjust the filters or widen the session size, then try again.'
        );
        return;
      }

      cardIds = candidateItems.slice(0, sessionSize).map((card) => card.id);
    }

    try {
      const response = await startSession.mutateAsync({
        learningMode: mode,
        deckQueryId: createClientDeckQueryId(),
        config: {
          maxCards: sessionSize,
          sessionTimeoutHours: 24,
          ...(customQuery.cardTypes !== undefined ? { cardTypes: customQuery.cardTypes } : {}),
        },
        initialCardIds: cardIds,
      });

      const sessionId = response.data.id as string;
      router.push(`/session/${sessionId}`);
    } catch (err) {
      setStartError(formatStartSessionError(err));
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
                      <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              Candidate {String(previewIndex + 1)} of{' '}
                              {String(sessionCandidates.data.data.items.length)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Previewing the cards that will be eligible for this session.
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={previewIndex === 0}
                              onClick={() => {
                                setPreviewIndex((current) => Math.max(0, current - 1));
                              }}
                            >
                              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                              Prev
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={
                                previewIndex >= sessionCandidates.data.data.items.length - 1
                              }
                              onClick={() => {
                                setPreviewIndex((current) =>
                                  Math.min(
                                    sessionCandidates.data.data.items.length - 1,
                                    current + 1
                                  )
                                );
                              }}
                            >
                              Next
                              <ChevronRight className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </div>
                        </div>

                        {previewCardLoading ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            Loading card preview…
                          </div>
                        ) : previewCard !== undefined ? (
                          <div className="space-y-3">
                            <CardRenderer card={previewCard} mode="preview" isRevealed={false} />
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>{previewCard.cardType}</span>
                              <span>{formatDifficultyLabel(previewCard.difficulty)}</span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            We found candidates, but this card preview could not be loaded just now.
                          </p>
                        )}

                        <div className="flex items-center justify-center gap-2">
                          {previewCandidateIds.map((candidateId, index) => (
                            <button
                              key={candidateId as string}
                              type="button"
                              aria-label={`Go to candidate ${String(index + 1)}`}
                              aria-pressed={index === previewIndex}
                              className={[
                                'h-2.5 w-2.5 rounded-full transition-colors',
                                index === previewIndex ? 'bg-primary' : 'bg-muted-foreground/30',
                              ].join(' ')}
                              onClick={() => {
                                setPreviewIndex(index);
                              }}
                            />
                          ))}
                        </div>
                      </div>
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

function createClientDeckQueryId(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  const values = new Uint8Array(21);

  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.getRandomValues === 'function'
  ) {
    globalThis.crypto.getRandomValues(values);
  } else {
    for (let index = 0; index < values.length; index += 1) {
      values[index] = Math.floor(Math.random() * alphabet.length);
    }
  }

  return `deck_${Array.from(values, (value) => alphabet[value % alphabet.length]).join('')}`;
}

function formatDifficultyLabel(difficulty: unknown): string {
  if (typeof difficulty === 'number' && Number.isFinite(difficulty)) {
    return `Difficulty ${(difficulty * 100).toFixed(0)}%`;
  }

  if (typeof difficulty === 'string' && difficulty.trim() !== '') {
    return difficulty.replace(/_/g, ' ');
  }

  return 'Difficulty unavailable';
}

function formatStartSessionError(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
    const code = 'code' in error && typeof error.code === 'string' ? error.code : '';
    const status = 'status' in error && typeof error.status === 'number' ? error.status : undefined;

    if (
      code === 'VALIDATION_ERROR' ||
      message.toLowerCase().includes('invalid start session input')
    ) {
      return 'We could not start the session because the app sent an incomplete session setup. Please refresh the page and try again; if you are using Custom Build, keep at least one candidate available.';
    }

    if (status === 400) {
      return `We could not start the session because the request was rejected by the server. ${message !== '' ? message : 'Please review your filters and try again.'}`;
    }
  }

  return error instanceof Error ? error.message : 'Failed to start session. Please try again.';
}
