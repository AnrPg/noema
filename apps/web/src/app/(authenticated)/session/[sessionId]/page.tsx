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
import { Loader2, Eye } from 'lucide-react';
import { Button } from '@noema/ui';
import type { SessionId } from '@noema/types';
import type { ICheckpointDirectiveDto } from '@noema/api-client';

import {
  useSession,
  useSessionQueue,
  useRecordAttempt,
  useRequestHint,
  useEvaluateCheckpoint,
  usePauseSession,
  useResumeSession,
  useCompleteSession,
  useAbandonSession,
} from '@noema/api-client';
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

// ============================================================================
// ActiveSessionPage
// ============================================================================

export default function ActiveSessionPage(): React.JSX.Element {
  const params = useParams();
  const router = useRouter();

  // ── Route param validation ─────────────────────────────────────────────────
  const raw = params['sessionId'];
  if (raw === undefined || typeof raw !== 'string') {
    return <div>Invalid session ID.</div>;
  }
  const sessionId = raw as SessionId;

  // ── Store ─────────────────────────────────────────────────────────────────
  const {
    pendingAttempt,
    completedCardCount,
    elapsedTime,
    isPaused,
    setConfidenceBefore,
    setConfidenceAfter,
    setIsPaused,
    advanceCard,
    resetAttempt,
    tickElapsedTime,
    clear,
  } = useSessionStore();

  // ── Local state ───────────────────────────────────────────────────────────
  const [isRevealed, setIsRevealed] = useState(false);
  const [hintDepth, setHintDepth] = useState(0);
  const [hintText, setHintText] = useState<string | null>(null);
  const [selfReportedGuess, setSelfReportedGuess] = useState(false);
  const [checkpoint, setCheckpoint] = useState<ICheckpointDirectiveDto | null>(null);
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);

  // Track card start time for dwell time calculation
  const cardStartRef = useRef<number>(Date.now());

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

  // ── Current card ──────────────────────────────────────────────────────────
  const currentItem = queueData?.data.items[completedCardCount];
  const currentCardId = currentItem?.cardId ?? ('' as SessionId);

  // useCard uses select: (r) => r.data — so cardData is already ICardDto | undefined
  const { data: card, isLoading: cardLoading } = useCard(
    currentCardId as Parameters<typeof useCard>[0],
    {
      enabled: currentCardId !== '',
    }
  );

  // ── API — mutations ───────────────────────────────────────────────────────
  const recordAttempt = useRecordAttempt(sessionId);
  const requestHint = useRequestHint(sessionId);
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
    setIsRevealed(false);
    setHintDepth(0);
    setHintText(null);
    setSelfReportedGuess(false);
    cardStartRef.current = Date.now();
    resetAttempt();
  }, [currentCardId, resetAttempt]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clear();
    };
  }, [clear]);

  // ── Pause / Resume ────────────────────────────────────────────────────────
  const handlePause = useCallback((): void => {
    setIsPaused(true);
    pauseSession.mutate(sessionId);
  }, [setIsPaused, pauseSession, sessionId]);

  const handleResume = useCallback((): void => {
    setIsPaused(false);
    resumeSession.mutate(sessionId);
  }, [setIsPaused, resumeSession, sessionId]);

  // ── Reveal ────────────────────────────────────────────────────────────────
  const handleReveal = useCallback((): void => {
    if (!isRevealed) {
      setIsRevealed(true);
    }
  }, [isRevealed]);

  // ── Hint ──────────────────────────────────────────────────────────────────
  const handleHint = useCallback((): void => {
    requestHint.mutate(undefined, {
      onSuccess: (res) => {
        setHintText(res.data.hint);
        setHintDepth(res.data.depth);
      },
    });
  }, [requestHint]);

  // ── Grade / record attempt ────────────────────────────────────────────────
  const handleGrade = useCallback(
    (grade: Grade): void => {
      if (card === undefined) return;

      const confidenceBefore = pendingAttempt?.confidenceBefore ?? null;
      const confidenceAfter = pendingAttempt?.confidenceAfter ?? null;
      const calibrationDelta =
        confidenceBefore !== null && confidenceAfter !== null
          ? confidenceAfter - confidenceBefore
          : undefined;

      recordAttempt.mutate(
        {
          cardId: card.id,
          grade,
          ...(confidenceBefore !== null ? { confidenceBefore } : {}),
          ...(confidenceAfter !== null ? { confidenceAfter } : {}),
          ...(calibrationDelta !== undefined ? { calibrationDelta } : {}),
          hintDepthUsed: hintDepth,
          dwellTimeMs: pendingAttempt?.dwellTimeMs ?? Date.now() - cardStartRef.current,
          selfReportedGuess,
        },
        {
          onSuccess: () => {
            // `remaining` is the count of cards still left in the queue *after*
            // the current attempt has been recorded (i.e. the current card is
            // no longer counted). When it reaches 0 the queue is exhausted.
            const remaining = queueData?.data.remaining ?? 0;
            if (remaining <= 0) {
              completeSession.mutate(sessionId, {
                onSuccess: () => {
                  router.push(`/session/${sessionId}/summary` as never);
                },
              });
            } else {
              advanceCard();
              // Check checkpoint every 5 cards
              if ((completedCardCount + 1) % 5 === 0) {
                evaluateCheckpoint.mutate(undefined, {
                  onSuccess: (res) => {
                    const directive = res.data;
                    if (directive.action !== 'continue') {
                      setCheckpoint(directive);
                    }
                  },
                });
              }
            }
          },
        }
      );
    },
    [
      card,
      pendingAttempt,
      hintDepth,
      selfReportedGuess,
      recordAttempt,
      queueData,
      completedCardCount,
      completeSession,
      advanceCard,
      evaluateCheckpoint,
      sessionId,
      router,
    ]
  );

  // ── Abandon ───────────────────────────────────────────────────────────────
  const handleAbandon = useCallback((): void => {
    abandonSession.mutate(sessionId, {
      onSuccess: () => {
        clear();
        router.push('/sessions' as never);
      },
    });
  }, [abandonSession, sessionId, clear, router]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useKeyboardShortcuts([
    {
      key: ' ',
      label: 'Flip card / reveal answer',
      handler: handleReveal,
    },
    {
      key: '1',
      label: 'Grade: Again',
      handler: () => {
        if (isRevealed) handleGrade(1);
      },
    },
    {
      key: '2',
      label: 'Grade: Hard',
      handler: () => {
        if (isRevealed) handleGrade(2);
      },
    },
    {
      key: '3',
      label: 'Grade: Good',
      handler: () => {
        if (isRevealed) handleGrade(3);
      },
    },
    {
      key: '4',
      label: 'Grade: Easy',
      handler: () => {
        if (isRevealed) handleGrade(4);
      },
    },
    {
      key: 'h',
      label: 'Request hint',
      handler: handleHint,
      when: () => !isRevealed,
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
  const sessionDto = sessionData?.data ?? null;
  const totalCards = sessionDto?.cardIds.length ?? 0;
  const lane = sessionDto?.mode === 'standard' ? 'retention' : null;

  const isLoading = sessionLoading || queueLoading;
  const isCardLoading = cardLoading && currentCardId !== '';

  const maxHints = 3; // configurable; 3 is a reasonable default

  // ── Error state ───────────────────────────────────────────────────────────
  if (sessionError || queueError) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-sm text-destructive">
          Failed to load session.{' '}
          <button
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
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-background">
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

      {/* ── Card Area (flex-1, scrollable) ─────────────────────────────────── */}
      <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 pb-4 pt-6">
        <div className="flex w-full max-w-2xl flex-col gap-4">
          {/* Hint text (if any) */}
          {hintText !== null && (
            <div
              className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
              role="note"
              aria-label="Hint"
            >
              <span className="mr-2 font-semibold">Hint:</span>
              {hintText}
            </div>
          )}

          {/* PreAnswerConfidence (before reveal) */}
          {!isRevealed && (
            <PreAnswerConfidence
              value={pendingAttempt?.confidenceBefore ?? null}
              onChange={setConfidenceBefore}
            />
          )}

          {/* Card content */}
          {isCardLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
            </div>
          ) : card !== undefined ? (
            <CardRenderer
              card={card}
              mode="interactive"
              isRevealed={isRevealed}
              onReveal={handleReveal}
              onHintRequest={handleHint}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <p className="text-sm text-muted-foreground">No card loaded.</p>
            </div>
          )}

          {/* Reveal button (before reveal) */}
          {!isRevealed && card !== undefined && (
            <div className="flex justify-center pt-2">
              <Button
                size="lg"
                onClick={handleReveal}
                aria-label="Reveal answer (Space)"
                className="gap-2"
              >
                <Eye className="h-4 w-4" aria-hidden="true" />
                Show Answer
                <kbd className="ml-1 rounded bg-primary-foreground/20 px-1.5 py-0.5 font-mono text-xs">
                  Space
                </kbd>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── ResponseControls (sticky bottom, after reveal) ─────────────────── */}
      {isRevealed && (
        <div className="border-t border-border bg-background/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="mx-auto max-w-2xl">
            <ResponseControls
              confidenceAfter={pendingAttempt?.confidenceAfter ?? null}
              onConfidenceAfter={setConfidenceAfter}
              hintDepth={hintDepth}
              maxHints={maxHints}
              onHint={handleHint}
              selfReportedGuess={selfReportedGuess}
              onSelfReportedGuess={setSelfReportedGuess}
              onGrade={handleGrade}
              isSubmitting={recordAttempt.isPending || completeSession.isPending}
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
