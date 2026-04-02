'use client';

/**
 * @noema/web - Active Session Page
 *
 * /session/[sessionId] — the core review loop.
 *
 * Layout:
 *   SessionBar (sticky top, 48px)
 *   AdaptiveCheckpoint (banner, if active)
 *   Card Area (flex-1, centered)
 *     - PreAnswerConfidence (if not revealed)
 *     - CardRenderer (interactive mode)
 *     - Reveal button (if not revealed)
 *   ResponseControls (sticky bottom, if revealed)
 *   PauseOverlay (absolute z-20, if paused)
 *   Abandon confirmation dialog (z-30, if open)
 */

import * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@noema/ui';
import { AttemptOutcome, HintDepth, Rating, type SessionId } from '@noema/types';
import type {
  IAdaptiveCheckpointDirectiveDto,
  IEvaluateCheckpointInput,
  IRecordAttemptInput,
  ISessionDto,
  ISessionQueueItem,
} from '@noema/api-client/session';

import {
  useAbandonSession,
  useCompleteSession,
  useEvaluateCheckpoint,
  usePauseSession,
  useRecordAttempt,
  useResumeSession,
  useSession,
  useSessionQueue,
} from '@noema/api-client/session';
import { useCard } from '@noema/api-client';

import { useSessionStore } from '@/stores/session-store';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { SessionBar } from '@/components/session/session-bar';
import { PauseOverlay } from '@/components/session/pause-overlay';
import { PreAnswerConfidence } from '@/components/session/pre-answer-confidence';
import { ResponseControls } from '@/components/session/response-controls';
import type { Grade } from '@/components/session/response-controls';
import { AdaptiveCheckpoint } from '@/components/session/adaptive-checkpoint';
import { CardRenderer } from '@/components/card-renderers';
import { SessionCardView } from '@/components/session/session-card-view';
import { formatApiErrorMessage } from '@/lib/api-errors';
import {
  supportsSessionSidePresentation,
  type ISessionPresentationPreferences,
} from '@/lib/session-card-sides';

// ============================================================================
// ActiveSessionPage
// ============================================================================

export default function ActiveSessionPage(): React.JSX.Element {
  const params = useParams();
  const router = useRouter();

  // ── Route param — extracted before any hooks so the value is stable ───────
  const raw = params['sessionId'];
  const sessionId = (typeof raw === 'string' ? raw : '') as SessionId;

  // ── Store ─────────────────────────────────────────────────────────────────
  const {
    pendingAttempt,
    elapsedTime,
    isPaused,
    setConfidenceBefore,
    setConfidenceAfter,
    setIsPaused,
    resetAttempt,
    tickElapsedTime,
    clear,
  } = useSessionStore();

  // ── Local state ───────────────────────────────────────────────────────────
  const [isRevealed, setIsRevealed] = useState(false);
  const [checkpoint, setCheckpoint] = useState<IAdaptiveCheckpointDirectiveDto | null>(null);
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [orderedQueue, setOrderedQueue] = useState<ISessionQueueItem[]>([]);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(0);
  const attemptInFlightRef = useRef(false);
  const initializedSessionRef = useRef<string | null>(null);

  // Track card timings for attempt payloads
  const cardStartRef = useRef<number>(Date.now());
  const revealTimeRef = useRef<number | null>(null);

  // ── API — session data ────────────────────────────────────────────────────
  const {
    data: sessionData,
    isLoading: sessionLoading,
    isError: sessionError,
    refetch: refetchSession,
  } = useSession(sessionId);

  const {
    data: queueData,
    isLoading: queueLoading,
    isError: queueError,
    refetch: refetchQueue,
  } = useSessionQueue(sessionId);
  const sessionDto: ISessionDto | null = sessionData?.data ?? null;
  const totalCards = sessionDto?.cardIds.length ?? 0;
  const lane = sessionDto?.mode === 'standard' ? 'retention' : null;
  const initialQueueItems = queueData?.data.items ?? [];
  const initialQueueLength = initialQueueItems.length;
  const activeQueue =
    orderedQueue.length > 0 || initialQueueLength === 0 ? orderedQueue : initialQueueItems;
  const completedCardCount = Math.min(currentQueueIndex, totalCards);

  // ── Current card ──────────────────────────────────────────────────────────
  const currentItem = activeQueue[currentQueueIndex];
  const currentCardId = currentItem?.cardId ?? ('' as SessionId);

  // useCard uses select: (r) => r.data — so cardData is already ICardDto | undefined
  const {
    data: card,
    isLoading: cardLoading,
    isError: cardError,
    error: cardErrorDetails,
    refetch: refetchCard,
  } = useCard(currentCardId as Parameters<typeof useCard>[0], {
    enabled: currentCardId !== '',
  });

  // ── API — mutations ───────────────────────────────────────────────────────
  const recordAttempt = useRecordAttempt(sessionId);
  const evaluateCheckpoint = useEvaluateCheckpoint(sessionId);
  const pauseSession = usePauseSession();
  const resumeSession = useResumeSession();
  const completeSession = useCompleteSession();
  const abandonSession = useAbandonSession();

  // ── Timer: increments elapsedTime every second when not paused ───────────
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      tickElapsedTime();
    }, 1000);
    return () => {
      clearInterval(interval);
    };
  }, [isPaused, tickElapsedTime]);

  // ── Reset local state when the current card changes ───────────────────────
  useEffect(() => {
    initializedSessionRef.current = null;
    setOrderedQueue([]);
    setCurrentQueueIndex(0);
  }, [sessionId]);

  useEffect(() => {
    if (queueData === undefined || sessionDto === null) {
      return;
    }

    if (initializedSessionRef.current === sessionId) {
      return;
    }

    setOrderedQueue(queueData.data.items);
    setCurrentQueueIndex(sessionDto.currentCardIndex);
    initializedSessionRef.current = sessionId;
  }, [queueData, sessionDto, sessionId]);

  useEffect(() => {
    setIsRevealed(false);
    cardStartRef.current = Date.now();
    revealTimeRef.current = null;
    resetAttempt();
    setConfidenceBefore(0.5);
  }, [currentCardId, resetAttempt, setConfidenceBefore]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clear();
    };
  }, [clear]);

  // ── Pause / Resume ────────────────────────────────────────────────────────
  const handlePause = useCallback((): void => {
    setIsPaused(true);
    setMutationError(null);
    pauseSession.mutate(sessionId, {
      onError: (error) => {
        setIsPaused(false);
        setMutationError(
          formatApiErrorMessage(error, {
            action: 'pause the session',
            fallback: 'We could not pause the session. Please try again.',
          })
        );
      },
    });
  }, [setIsPaused, pauseSession, sessionId]);

  const handleResume = useCallback((): void => {
    setIsPaused(false);
    setMutationError(null);
    resumeSession.mutate(sessionId, {
      onError: (error) => {
        setIsPaused(true);
        setMutationError(
          formatApiErrorMessage(error, {
            action: 'resume the session',
            fallback: 'We could not resume the session. Please try again.',
          })
        );
      },
    });
  }, [setIsPaused, resumeSession, sessionId]);

  // ── Reveal ────────────────────────────────────────────────────────────────
  const handleReveal = useCallback((): void => {
    if (!isRevealed && !isPaused) {
      revealTimeRef.current = Date.now() - cardStartRef.current;
      setIsRevealed(true);
    }
  }, [isPaused, isRevealed]);

  // ── Grade / record attempt ────────────────────────────────────────────────
  const handleGrade = useCallback(
    (grade: Grade): void => {
      if (
        card === undefined ||
        sessionDto === null ||
        isPaused ||
        attemptInFlightRef.current ||
        recordAttempt.isPending ||
        completeSession.isPending
      ) {
        return;
      }

      const confidenceBefore = pendingAttempt?.confidenceBefore ?? null;
      const confidenceAfter = pendingAttempt?.confidenceAfter ?? null;
      const dwellTimeMs = Math.max(
        0,
        Math.round(pendingAttempt?.dwellTimeMs ?? Date.now() - cardStartRef.current)
      );
      const responseTimeMs = Math.max(0, Math.round(revealTimeRef.current ?? dwellTimeMs));
      const attemptInput: IRecordAttemptInput = {
        cardId: card.id,
        outcome: grade === 1 ? AttemptOutcome.INCORRECT : AttemptOutcome.CORRECT,
        rating: gradeToRating(grade),
        ratingValue: grade,
        responseTimeMs,
        dwellTimeMs,
        ...(confidenceBefore !== null ? { confidenceBefore } : {}),
        ...(confidenceAfter !== null ? { confidenceAfter } : {}),
        wasRevisedBeforeCommit: false,
        revisionCount: 0,
        hintRequestCount: 0,
        hintDepthReached: HintDepth.NONE,
        contextSnapshot: {
          learningMode: sessionDto.learningMode,
          studyMode: sessionDto.studyMode,
          teachingApproach: normalizeTeachingApproach(sessionDto.teachingApproach),
          activeInterventionIds: [],
        },
      };
      const checkpointInput = buildCheckpointInput({
        averageResponseTimeMs: sessionDto.stats.averageResponseTimeMs,
        confidenceAfter,
        confidenceBefore,
        responseTimeMs,
      });

      setMutationError(null);
      attemptInFlightRef.current = true;
      recordAttempt.mutate(attemptInput, {
        onSuccess: () => {
          const reviewedCards = completedCardCount + 1;
          const nextQueue =
            grade === 1 && currentItem !== undefined
              ? enqueueRepeatCard(activeQueue, currentItem, currentQueueIndex, initialQueueLength)
              : activeQueue;
          const nextQueueIndex = currentQueueIndex + 1;
          const isQueueExhausted = nextQueueIndex >= nextQueue.length;

          if (isQueueExhausted) {
            completeSession.mutate(sessionId, {
              onSuccess: () => {
                router.push(`/session/${sessionId}/summary`);
              },
              onError: (err) => {
                attemptInFlightRef.current = false;
                setMutationError(
                  formatApiErrorMessage(err, {
                    action: 'finish the session',
                    fallback: 'We could not finish the session. Please try again.',
                  })
                );
              },
            });
          } else {
            setOrderedQueue(nextQueue);
            setCurrentQueueIndex(nextQueueIndex);
            // Check checkpoint every 5 cards
            if (reviewedCards % 5 === 0) {
              evaluateCheckpoint.mutate(checkpointInput, {
                onSuccess: (res) => {
                  const directive = selectCheckpointDirective(res.data.directives);
                  if (directive !== null) {
                    setCheckpoint(directive);
                  }
                },
                onError: () => {
                  // Checkpoint evaluation failure is non-critical — session continues
                },
              });
            }

            attemptInFlightRef.current = false;
          }
        },
        onError: (err) => {
          attemptInFlightRef.current = false;
          setMutationError(
            formatApiErrorMessage(err, {
              action: 'save your answer',
              fallback: 'We could not save your answer. Please try again.',
            })
          );
        },
      });
    },
    [
      card,
      pendingAttempt,
      sessionDto,
      isPaused,
      recordAttempt,
      completedCardCount,
      completeSession,
      evaluateCheckpoint,
      sessionId,
      router,
      currentItem,
      activeQueue,
      currentQueueIndex,
      initialQueueLength,
    ]
  );

  // ── Abandon ───────────────────────────────────────────────────────────────
  const handleAbandon = useCallback((): void => {
    setMutationError(null);
    abandonSession.mutate(sessionId, {
      onSuccess: () => {
        clear();
        router.push('/sessions');
      },
      onError: (err) => {
        setMutationError(
          formatApiErrorMessage(err, {
            action: 'abandon the session',
            fallback: 'We could not abandon the session. Please try again.',
          })
        );
      },
    });
  }, [abandonSession, sessionId, clear, router]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useKeyboardShortcuts([
    {
      key: ' ',
      label: 'Flip card / reveal answer',
      handler: handleReveal,
      when: () => !isPaused,
    },
    {
      key: '1',
      label: 'Grade: Again',
      handler: () => {
        if (!isPaused && isRevealed) handleGrade(1);
      },
    },
    {
      key: '2',
      label: 'Grade: Hard',
      handler: () => {
        if (!isPaused && isRevealed) handleGrade(2);
      },
    },
    {
      key: '3',
      label: 'Grade: Good',
      handler: () => {
        if (!isPaused && isRevealed) handleGrade(3);
      },
    },
    {
      key: '4',
      label: 'Grade: Easy',
      handler: () => {
        if (!isPaused && isRevealed) handleGrade(4);
      },
    },
    {
      key: 'p',
      label: 'Pause / Resume',
      handler: isPaused ? handleResume : handlePause,
    },
    {
      key: 'Escape',
      label: 'Abandon session',
      handler: () => {
        setShowAbandonConfirm(true);
      },
    },
  ]);

  // ── Derived values ────────────────────────────────────────────────────────
  const isLoading = sessionLoading || queueLoading;
  const isCardLoading = cardLoading && currentCardId !== '';
  const queueHasRecoverableGap = activeQueue.length > currentQueueIndex && currentCardId === '';
  const sessionDtoRecord = sessionDto as unknown as Record<string, unknown> | null;
  const sessionConfigRecord =
    sessionDtoRecord !== null &&
    typeof sessionDtoRecord['config'] === 'object' &&
    sessionDtoRecord['config'] !== null
      ? (sessionDtoRecord['config'] as {
          presentation?: ISessionPresentationPreferences;
        })
      : undefined;
  const presentationPreferences = sessionConfigRecord?.presentation;
  const useSessionCardView = card !== undefined && supportsSessionSidePresentation(card);

  // ── Route param validation (after all hooks) ──────────────────────────────
  if (typeof raw !== 'string' || raw === '') {
    return <div>Invalid session ID.</div>;
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (sessionError || queueError) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-destructive">
          Failed to load session.{' '}
          <button
            type="button"
            onClick={() => {
              void refetchSession();
              void refetchQueue();
            }}
          >
            Retry
          </button>
        </p>
      </div>
    );
  }

  // ── Loading state ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] flex-col bg-background">
      {/* ── SessionBar ─────────────────────────────────────────────────────── */}
      <SessionBar
        sessionId={sessionId}
        completed={completedCardCount}
        total={totalCards}
        elapsedMs={elapsedTime}
        lane={lane as 'retention' | 'calibration' | null}
        isPaused={isPaused}
        onPause={handlePause}
        onResume={handleResume}
        onAbandon={() => {
          setShowAbandonConfirm(true);
        }}
      />

      {/* ── AdaptiveCheckpoint banner ──────────────────────────────────────── */}
      {checkpoint !== null && (
        <div className="px-4 pt-3">
          <AdaptiveCheckpoint
            directive={checkpoint}
            onDismiss={() => {
              setCheckpoint(null);
            }}
          />
        </div>
      )}

      {/* ── Mutation error banner ───────────────────────────────────────────── */}
      {mutationError !== null && (
        <div
          role="alert"
          className="mx-4 mt-3 flex items-center justify-between rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          <span>{mutationError}</span>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => {
              setMutationError(null);
            }}
            className="ml-3 shrink-0 text-destructive/70 hover:text-destructive"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Card Area (flex-1, scrollable) ─────────────────────────────────── */}
      <div className="flex flex-1 flex-col items-center justify-start overflow-y-auto px-3 pb-6 pt-4 sm:px-4 sm:pt-6">
        <div className="flex w-full max-w-6xl flex-col gap-6">
          {/* Card content */}
          {isCardLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
            </div>
          ) : card !== undefined ? (
            useSessionCardView ? (
              <SessionCardView
                card={card}
                isRevealed={isRevealed}
                onReveal={handleReveal}
                {...(presentationPreferences !== undefined
                  ? { preferences: presentationPreferences }
                  : {})}
              />
            ) : (
              <CardRenderer
                card={card}
                mode="interactive"
                isRevealed={isRevealed}
                onReveal={handleReveal}
                className="min-h-[22rem] rounded-[2rem] border-border/80 shadow-[0_24px_80px_rgba(2,6,23,0.32)] sm:min-h-[28rem]"
              />
            )
          ) : (
            <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-6 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-300">
                <AlertTriangle className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="space-y-2">
                <p className="text-base font-semibold text-foreground">
                  We couldn't open the first card for this session.
                </p>
                <p className="max-w-lg text-sm leading-6 text-muted-foreground">
                  {cardError
                    ? 'The session queue points to a card, but the card details did not load successfully. This is usually temporary, so try reloading the card first.'
                    : queueHasRecoverableGap
                      ? 'This session was created, but the queue returned an entry without a usable card id. Refreshing the queue usually restores the missing card.'
                      : 'This session does not currently have a usable card payload, even though it was started from a candidate list. Refreshing the session should resync the queue and card data.'}
                </p>
                {currentCardId !== '' && (
                  <p className="text-xs text-muted-foreground">
                    Card ID: <span className="font-mono">{currentCardId}</span>
                  </p>
                )}
                {cardErrorDetails instanceof Error && (
                  <p className="text-xs text-destructive">{cardErrorDetails.message}</p>
                )}
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                <Button
                  variant="default"
                  className="gap-2"
                  onClick={() => {
                    if (currentCardId !== '') {
                      void refetchCard();
                    } else {
                      void refetchQueue();
                      void refetchSession();
                    }
                  }}
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  {currentCardId !== '' ? 'Retry Card Load' : 'Refresh Session Queue'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    router.push('/session/new');
                  }}
                >
                  Start a New Session
                </Button>
              </div>
            </div>
          )}

          {!isRevealed && card !== undefined && (
            <PreAnswerConfidence
              value={pendingAttempt?.confidenceBefore ?? null}
              onChange={setConfidenceBefore}
            />
          )}

          {!isRevealed && card !== undefined && (
            <p className="pt-1 text-center text-xs text-muted-foreground">
              Press{' '}
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono">
                Space
              </kbd>{' '}
              to reveal when you're ready.
            </p>
          )}
        </div>
      </div>

      {/* ── ResponseControls (sticky bottom, after reveal) ─────────────────── */}
      {isRevealed && (
        <div className="border-t border-border bg-background/95 px-3 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-4">
          <div className="mx-auto max-w-4xl">
            <ResponseControls
              confidenceAfter={pendingAttempt?.confidenceAfter ?? null}
              onConfidenceAfter={setConfidenceAfter}
              onGrade={handleGrade}
              isSubmitting={isPaused || recordAttempt.isPending || completeSession.isPending}
            />
          </div>
        </div>
      )}

      {/* ── PauseOverlay (absolute, z-20) ──────────────────────────────────── */}
      {isPaused && <PauseOverlay elapsedMs={elapsedTime} onResume={handleResume} />}

      {/* ── Abandon confirmation dialog (z-30) ────────────────────────────── */}
      {showAbandonConfirm && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-background/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Abandon session confirmation"
        >
          <div className="flex w-full max-w-sm flex-col gap-5 rounded-xl border border-border bg-card px-6 py-6 shadow-lg">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Abandon this session?
              </h2>
              <p className="text-sm text-muted-foreground">
                Your progress so far will be saved, but the session will be marked as abandoned and
                cannot be resumed.
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowAbandonConfirm(false);
                }}
              >
                Keep Going
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={abandonSession.isPending}
                onClick={handleAbandon}
              >
                {abandonSession.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    Abandoning…
                  </>
                ) : (
                  'Abandon'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function gradeToRating(grade: Grade): Rating {
  switch (grade) {
    case 1:
      return Rating.AGAIN;
    case 2:
      return Rating.HARD;
    case 3:
      return Rating.GOOD;
    case 4:
      return Rating.EASY;
  }
}

function buildCheckpointInput(input: {
  averageResponseTimeMs: number;
  confidenceAfter: number | null;
  confidenceBefore: number | null;
  responseTimeMs: number;
}): IEvaluateCheckpointInput {
  const confidenceDrift =
    input.confidenceBefore !== null && input.confidenceAfter !== null
      ? input.confidenceAfter - input.confidenceBefore
      : null;

  if (confidenceDrift !== null && Math.abs(confidenceDrift) >= 0.25) {
    return {
      trigger: 'confidence_drift',
      confidenceDrift,
    };
  }

  if (input.averageResponseTimeMs > 0 && input.responseTimeMs > input.averageResponseTimeMs * 1.6) {
    return {
      trigger: 'latency_spike',
      lastAttemptResponseTimeMs: input.responseTimeMs,
      rollingAverageResponseTimeMs: input.averageResponseTimeMs,
    };
  }

  return {
    trigger: 'manual',
  };
}

function selectCheckpointDirective(
  directives: IAdaptiveCheckpointDirectiveDto[]
): IAdaptiveCheckpointDirectiveDto | null {
  return directives.find((directive) => directive.action !== 'continue') ?? null;
}

function normalizeTeachingApproach(value: string): string {
  return value === 'socratic_questioning' ? 'standard' : value;
}

function enqueueRepeatCard(
  queue: ISessionQueueItem[],
  currentItem: ISessionQueueItem,
  currentIndex: number,
  initialQueueLength: number
): ISessionQueueItem[] {
  const nextRepeatItem: ISessionQueueItem = {
    ...currentItem,
    injected: true,
    position: queue.length,
  };
  const repeatRegionStart = Math.min(initialQueueLength, queue.length);
  const remainingInitialItems =
    currentIndex + 1 < repeatRegionStart ? queue.slice(currentIndex + 1, repeatRegionStart) : [];
  const pendingRepeatItems = queue.slice(Math.max(repeatRegionStart, currentIndex + 1));
  const reshuffledRepeats = shuffleQueueItems([...pendingRepeatItems, nextRepeatItem]);

  return [...queue.slice(0, currentIndex + 1), ...remainingInitialItems, ...reshuffledRepeats].map(
    (item, index) => ({
      ...item,
      position: index,
    })
  );
}

function shuffleQueueItems<T>(items: T[]): T[] {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const currentItem = result[index];
    const swapItem = result[swapIndex];

    if (currentItem === undefined || swapItem === undefined) {
      continue;
    }

    result[index] = swapItem;
    result[swapIndex] = currentItem;
  }

  return result;
}
