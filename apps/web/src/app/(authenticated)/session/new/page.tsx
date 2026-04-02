'use client';

/**
 * @noema/web - Session Start Page
 *
 * /session/new — configure and launch a new study session.
 * Three sections: mode selection, card source, and session settings.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Loader2, Play } from 'lucide-react';
import { useAuth } from '@noema/auth';
import { useCards, useCard, useReviewQueue, useStartSession } from '@noema/api-client';
import type { IDeckQueryInput, IStartSessionInput } from '@noema/api-client';
import type { CardId } from '@noema/types';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@noema/ui';

import { ModeSelector } from '@/components/session/mode-selector';
import type { PhilosophicalMode } from '@/components/session/mode-selector';
import { LaneMixSlider } from '@/components/session/lane-mix-slider';
import { CardRenderer } from '@/components/card-renderers';
import { DeckQueryFilter } from '@/components/deck-query-filter';
import { formatApiErrorMessage } from '@/lib/api-errors';
import { useActiveStudyMode } from '@/hooks/use-active-study-mode';
import {
  deriveSessionCardSides,
  getDefaultPromptSide,
  type SessionRevealMode,
} from '@/lib/session-card-sides';

const SESSION_CANDIDATE_QUERY_LIMIT = 100;
const SESSION_SIZE_MIN = 5;
const SESSION_SIZE_MAX = 100;

function supportsStudyMode(
  card: { supportedStudyModes?: string[] | undefined },
  activeStudyMode: string
): boolean {
  const supportedStudyModes = card.supportedStudyModes;
  return (
    supportedStudyModes === undefined ||
    supportedStudyModes.length === 0 ||
    supportedStudyModes.includes(activeStudyMode)
  );
}

// ============================================================================
// SessionNewPage
// ============================================================================

export default function SessionNewPage(): React.JSX.Element {
  const router = useRouter();
  const { user, isAuthenticated, isInitialized } = useAuth();
  const activeStudyMode = useActiveStudyMode();
  const isReadyForAuthenticatedQueries = isInitialized && isAuthenticated && user?.id !== undefined;

  // ── Section 1: Mode ──────────────────────────────────────────────────────
  const [mode, setMode] = React.useState<PhilosophicalMode>('exploration');

  // ── Section 2: Card source ───────────────────────────────────────────────
  const [useQuickStart, setUseQuickStart] = React.useState(true);
  const [customQuery, setCustomQuery] = React.useState<IDeckQueryInput>({});
  const [showCandidates, setShowCandidates] = React.useState(false);

  // ── Section 3: Settings ──────────────────────────────────────────────────
  const [retentionPct, setRetentionPct] = React.useState(80);
  const [sessionSize, setSessionSize] = React.useState(20);
  const [sessionSizeInput, setSessionSizeInput] = React.useState('20');
  const [startError, setStartError] = React.useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = React.useState(0);
  const [presentationPromptSide, setPresentationPromptSide] = React.useState('');
  const [presentationRevealMode, setPresentationRevealMode] =
    React.useState<SessionRevealMode>('all_at_once');

  // ── API hooks ────────────────────────────────────────────────────────────
  const reviewQueue = useReviewQueue(
    { limit: sessionSize, studyMode: activeStudyMode },
    { enabled: useQuickStart && isReadyForAuthenticatedQueries }
  );
  const sessionCandidates = useCards(
    { ...customQuery, limit: Math.max(sessionSize, SESSION_CANDIDATE_QUERY_LIMIT) },
    { enabled: !useQuickStart && showCandidates && isReadyForAuthenticatedQueries }
  );

  const startSession = useStartSession();

  // ── Derived values ───────────────────────────────────────────────────────
  const queue = reviewQueue.data?.data;
  const retentionCount = queue?.retentionDue;
  const calibrationCount = queue?.calibrationDue;
  const compatibleCandidateItems = React.useMemo(
    () =>
      (sessionCandidates.data?.data.items ?? []).filter((candidate) =>
        supportsStudyMode(candidate, activeStudyMode)
      ),
    [activeStudyMode, sessionCandidates.data]
  );
  const previewCandidateIds = React.useMemo(
    () => compatibleCandidateItems.map((candidate) => candidate.id),
    [compatibleCandidateItems]
  );
  const previewCandidateId =
    previewCandidateIds.length > 0
      ? previewCandidateIds[Math.min(previewIndex, previewCandidateIds.length - 1)]
      : undefined;
  const quickStartPreviewCardId =
    queue !== undefined && queue.cards.length > 0 ? (queue.cards[0]?.cardId as CardId) : undefined;
  const previewCardId = useQuickStart ? quickStartPreviewCardId : previewCandidateId;
  const { data: previewCard, isLoading: previewCardLoading } = useCard(
    (previewCardId ?? '') as CardId,
    { enabled: isReadyForAuthenticatedQueries && previewCardId !== undefined }
  );
  const presentationSideOptions = React.useMemo(
    () =>
      previewCard !== undefined
        ? deriveSessionCardSides(previewCard).filter((side) => side.key !== 'hint')
        : [],
    [previewCard]
  );
  const derivedAnswerSide = React.useMemo(() => {
    const remaining = presentationSideOptions.filter((side) => side.key !== presentationPromptSide);
    return remaining[0]?.key;
  }, [presentationPromptSide, presentationSideOptions]);

  React.useEffect(() => {
    setPreviewIndex(0);
  }, [showCandidates, customQuery, sessionSize]);

  React.useEffect(() => {
    setSessionSizeInput(String(sessionSize));
  }, [sessionSize]);

  React.useEffect(() => {
    if (presentationSideOptions.length === 0) {
      setPresentationPromptSide('');
      return;
    }

    if (!presentationSideOptions.some((side) => side.key === presentationPromptSide)) {
      setPresentationPromptSide(getDefaultPromptSide(presentationSideOptions) ?? '');
    }
  }, [presentationPromptSide, presentationSideOptions]);

  const commitSessionSizeInput = React.useCallback((): number => {
    const trimmed = sessionSizeInput.trim();
    if (trimmed === '') {
      setSessionSizeInput(String(sessionSize));
      return sessionSize;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      setSessionSizeInput(String(sessionSize));
      return sessionSize;
    }

    const clamped = clampSessionSize(parsed);
    setSessionSize(clamped);
    setSessionSizeInput(String(clamped));
    return clamped;
  }, [sessionSize, sessionSizeInput]);

  const adjustSessionSize = React.useCallback(
    (delta: number): void => {
      const rawValue = sessionSizeInput.trim() === '' ? sessionSize : Number(sessionSizeInput);
      const baseline = Number.isFinite(rawValue) ? rawValue : sessionSize;
      const nextValue = clampSessionSize(baseline + delta);
      setSessionSize(nextValue);
      setSessionSizeInput(String(nextValue));
    },
    [sessionSize, sessionSizeInput]
  );

  // ── Start handler ────────────────────────────────────────────────────────
  async function handleStart(): Promise<void> {
    setStartError(null);
    const resolvedSessionSize = commitSessionSizeInput();
    let cardIds: CardId[] = [];
    let quickStartQueue = queue;

    if (useQuickStart) {
      const queueResponse = queue ?? (await reviewQueue.refetch()).data?.data;
      quickStartQueue = queueResponse;

      if (queueResponse === undefined) {
        setStartError(
          'We could not load your review queue yet, so we do not know which cards are safe to start. Please refresh or wait a moment and try again.'
        );
        return;
      }

      cardIds = queueResponse.cards
        .slice(0, resolvedSessionSize)
        .map((card) => card.cardId as CardId);

      if (cardIds.length === 0) {
        setStartError(
          'Quick Start is empty right now. You are caught up on due reviews, so try Custom Build or come back when more cards are due.'
        );
        return;
      }
    } else {
      const candidateResponse = sessionCandidates.data ?? (await sessionCandidates.refetch()).data;
      const candidateItems = (candidateResponse?.data.items ?? []).filter((candidate) =>
        supportsStudyMode(candidate, activeStudyMode)
      );

      if (candidateItems.length === 0) {
        setStartError(
          'This custom build has no matching cards yet. Adjust the filters or widen the session size, then try again.'
        );
        return;
      }

      cardIds = candidateItems.slice(0, resolvedSessionSize).map((card) => card.id);
    }

    try {
      const initialCardLanes: IStartSessionInput['initialCardLanes'] =
        useQuickStart && quickStartQueue !== undefined
          ? Object.fromEntries(
              quickStartQueue.cards
                .slice(0, resolvedSessionSize)
                .map((card: (typeof quickStartQueue.cards)[number]) => [
                  card.cardId,
                  card.lane === 'calibration' ? 'calibration' : 'retention',
                ])
            )
          : undefined;
      const response = await startSession.mutateAsync({
        learningMode: mode,
        studyMode: activeStudyMode,
        deckQueryId: createClientDeckQueryId(),
        config: {
          maxCards: resolvedSessionSize,
          sessionTimeoutHours: 24,
          ...(customQuery.cardTypes !== undefined ? { cardTypes: customQuery.cardTypes } : {}),
          ...(presentationPromptSide !== ''
            ? {
                presentation: {
                  promptSide: presentationPromptSide,
                  revealMode: presentationRevealMode,
                  ...(derivedAnswerSide !== undefined ? { answerSide: derivedAnswerSide } : {}),
                },
              }
            : {}),
        },
        initialCardIds: cardIds,
        ...(initialCardLanes !== undefined ? { initialCardLanes } : {}),
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
                    (compatibleCandidateItems.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No candidates match the current filters.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              Candidate {String(previewIndex + 1)} of{' '}
                              {String(compatibleCandidateItems.length)}
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
                              disabled={previewIndex >= compatibleCandidateItems.length - 1}
                              onClick={() => {
                                setPreviewIndex((current) =>
                                  Math.min(compatibleCandidateItems.length - 1, current + 1)
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
              <div className="flex items-stretch overflow-hidden rounded-2xl border border-synapse-400/35 bg-background/80 shadow-[0_0_0_1px_rgba(34,211,238,0.14)] transition focus-within:border-synapse-300/60 focus-within:shadow-[0_0_0_2px_rgba(59,130,246,0.28)]">
                <input
                  id="session-size"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={sessionSizeInput}
                  onChange={(e) => {
                    const nextValue = e.target.value.replace(/\D/g, '');
                    setSessionSizeInput(nextValue);
                  }}
                  onBlur={() => {
                    commitSessionSizeInput();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      commitSessionSizeInput();
                    }
                  }}
                  className="w-24 bg-transparent px-4 py-3 text-3xl font-medium tabular-nums text-foreground outline-none"
                  aria-describedby="session-size-hint"
                />
                <div className="flex flex-col border-l border-border/70 bg-card/70">
                  <button
                    type="button"
                    aria-label="Increase session size"
                    className="flex h-1/2 min-h-[1.75rem] items-center justify-center px-3 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                    onClick={() => {
                      adjustSessionSize(1);
                    }}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Decrease session size"
                    className="flex h-1/2 min-h-[1.75rem] items-center justify-center border-t border-border/70 px-3 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                    onClick={() => {
                      adjustSessionSize(-1);
                    }}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <span id="session-size-hint" className="text-sm text-muted-foreground">
                cards ({String(SESSION_SIZE_MIN)} – {String(SESSION_SIZE_MAX)})
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="space-y-1">
              <label htmlFor="prompt-side" className="text-sm font-medium text-foreground">
                Card Sides
              </label>
              <p className="text-sm text-muted-foreground">
                Choose which side appears first. Reveal can show everything at once or unfold one
                side at a time.
              </p>
            </div>

            <select
              id="prompt-side"
              value={presentationPromptSide}
              disabled={presentationSideOptions.length === 0}
              onChange={(e) => {
                setPresentationPromptSide(e.target.value);
              }}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {presentationSideOptions.length === 0 ? (
                <option value="">Load a previewable card first</option>
              ) : (
                presentationSideOptions.map((side) => (
                  <option key={side.key} value={side.key}>
                    {side.label}
                  </option>
                ))
              )}
            </select>

            <div className="grid gap-2 md:grid-cols-2">
              <button
                type="button"
                className={[
                  'rounded-2xl border px-4 py-3 text-left transition-colors',
                  presentationRevealMode === 'all_at_once'
                    ? 'border-cyan-400/50 bg-cyan-400/10'
                    : 'border-border bg-background hover:bg-muted/40',
                ].join(' ')}
                onClick={() => {
                  setPresentationRevealMode('all_at_once');
                }}
              >
                <span className="block text-sm font-medium text-foreground">
                  Reveal all other sides
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Show every remaining side together when you reveal.
                </span>
              </button>
              <button
                type="button"
                className={[
                  'rounded-2xl border px-4 py-3 text-left transition-colors',
                  presentationRevealMode === 'one_then_more'
                    ? 'border-cyan-400/50 bg-cyan-400/10'
                    : 'border-border bg-background hover:bg-muted/40',
                ].join(' ')}
                onClick={() => {
                  setPresentationRevealMode('one_then_more');
                }}
              >
                <span className="block text-sm font-medium text-foreground">
                  Reveal one side first
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Start with the main answer, then open the rest one by one.
                </span>
              </button>
            </div>

            {presentationRevealMode === 'one_then_more' && derivedAnswerSide !== undefined && (
              <p className="text-xs text-muted-foreground">
                Primary revealed side:{' '}
                {presentationSideOptions.find((side) => side.key === derivedAnswerSide)?.label ??
                  'Next available side'}
              </p>
            )}
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

function clampSessionSize(value: number): number {
  return Math.min(SESSION_SIZE_MAX, Math.max(SESSION_SIZE_MIN, Math.round(value)));
}

function formatStartSessionError(error: unknown): string {
  return formatApiErrorMessage(error, {
    action: 'start the session',
    fallback:
      'We could not start the session. Review the selected mode and available cards, then try again.',
    fieldLabels: {
      deckQueryId: 'Session configuration',
      initialCardIds: 'Selected cards',
      learningMode: 'Learning mode',
    },
    fieldHints: {
      initialCardIds: 'Keep at least one card available before starting.',
    },
  });
}
