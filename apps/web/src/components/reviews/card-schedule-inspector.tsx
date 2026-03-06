/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */

'use client';
/**
 * @noema/web — Reviews / CardScheduleInspector
 *
 * Slide-out panel showing per-card scheduling details:
 *   - Algorithm + learning state chips
 *   - FSRS: stability, difficulty, interval, recall probability (NeuralGauge)
 *   - HLR: half-life, recall probability (NeuralGauge)
 *   - Review history timeline
 *   - Calibration scatter chart
 */
import * as React from 'react';
import { useAuth } from '@noema/auth';
import { useSchedulerCard, useHLRPredict } from '@noema/api-client';
import type { UserId, CardId } from '@noema/types';
import { NeuralGauge, StateChip, CARD_LEARNING_STATE_MAP } from '@noema/ui';
import { Loader2, X } from 'lucide-react';
import { RecallTimeline } from '@/components/reviews/recall-timeline';
import type { IReviewEvent } from '@/components/reviews/recall-timeline';
import { CalibrationChart } from '@/components/reviews/calibration-chart';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ICardScheduleInspectorProps {
  cardId: string;
  onClose: () => void;
}

// ── Algorithm chip colors ─────────────────────────────────────────────────────

const ALGO_COLORS: Record<string, string> = {
  fsrs: 'bg-synapse-400/15 text-synapse-400',
  hlr: 'bg-myelin-400/15 text-myelin-400',
  sm2: 'bg-neuron-400/15 text-neuron-400',
};

function formatDate(iso: string | null): string {
  if (iso === null) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Component ────────────────────────────────────────────────────────────────

export function CardScheduleInspector({
  cardId,
  onClose,
}: ICardScheduleInspectorProps): React.JSX.Element {
  const { user } = useAuth();
  const userId = (user?.id ?? '') as UserId;

  const { data: cardData, isLoading: cardLoading } = useSchedulerCard(cardId as CardId, {
    enabled: cardId !== '',
  });

  const { data: hlrData, isLoading: hlrLoading } = useHLRPredict(
    { userId, cardId: cardId as CardId },
    { enabled: userId !== '' && cardId !== '' }
  );

  const card: any = (cardData as any)?.card ?? null;
  const hlr: any = hlrData ?? null;

  const algorithm = String(card?.schedulingAlgorithm ?? '—');
  const state: string = String(card?.state ?? '').toLowerCase();
  const stability: number | null = (card?.stability as number | null) ?? null;
  const difficulty: number | null = (card?.difficulty as number | null) ?? null;
  const nextReviewDate: string | null = (card?.nextReviewDate as string | null) ?? null;
  const reviewCount: number = (card?.reviewCount as number | undefined) ?? 0;
  const lapseCount: number = (card?.lapseCount as number | undefined) ?? 0;

  const hlrRecall: number = (hlr?.recallProbability as number | undefined) ?? 0;
  const hlrHalfLife: number = (hlr?.halfLifeDays as number | undefined) ?? 0;

  // Review history — real data would come from a per-card attempts API
  const reviewEvents: IReviewEvent[] = [];

  // Escape key closes
  React.useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col overflow-y-auto border-l border-border bg-card shadow-2xl"
        aria-label="Card schedule inspector"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Card Schedule</p>
            <p className="font-mono text-xs text-muted-foreground">{cardId.slice(0, 12)}…</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close inspector"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Loading */}
        {cardLoading === true && (
          <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            Loading schedule data…
          </div>
        )}

        {/* Content */}
        {cardLoading !== true && (
          <div className="flex flex-col gap-6 p-4">
            {/* Algorithm + State chips */}
            <div className="flex flex-wrap gap-2">
              {algorithm !== '—' && (
                <span
                  className={[
                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide',
                    ALGO_COLORS[algorithm] ?? 'bg-muted text-muted-foreground',
                  ].join(' ')}
                >
                  {algorithm}
                </span>
              )}
              {state !== '' && state !== '—' && (
                <StateChip
                  state={state.toUpperCase()}
                  stateMap={CARD_LEARNING_STATE_MAP}
                  size="sm"
                />
              )}
            </div>

            {/* FSRS Parameters */}
            {(algorithm === 'fsrs' || algorithm === 'sm2') && (
              <div className="flex flex-col gap-3">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  FSRS Parameters
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <p className="text-xs text-muted-foreground">Stability</p>
                    <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
                      {stability !== null ? stability.toFixed(1) : '—'}
                    </p>
                    <p className="text-[10px] text-muted-foreground">days</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <p className="text-xs text-muted-foreground">Difficulty</p>
                    <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
                      {difficulty !== null ? difficulty.toFixed(2) : '—'}
                    </p>
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Next Review</p>
                  <p className="mt-0.5 text-sm font-medium text-foreground">
                    {formatDate(nextReviewDate)}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <p className="mb-1 text-xs text-muted-foreground">Review Count</p>
                    <p className="text-sm font-semibold text-foreground">{String(reviewCount)}</p>
                  </div>
                  <div className="flex-1">
                    <p className="mb-1 text-xs text-muted-foreground">Lapses</p>
                    <p className="text-sm font-semibold text-foreground">{String(lapseCount)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* HLR Parameters */}
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                HLR Prediction
              </h3>
              {hlrLoading === true ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Loading HLR…
                </div>
              ) : (
                <div className="flex items-center gap-6">
                  <NeuralGauge value={hlrRecall} size="md" />
                  <div>
                    <p className="text-xs text-muted-foreground">Recall probability</p>
                    <p className="text-2xl font-bold tabular-nums text-foreground">
                      {String(Math.round(hlrRecall * 100))}%
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Half-life:{' '}
                      <span className="font-medium text-foreground">
                        {hlrHalfLife > 0 ? `${hlrHalfLife.toFixed(1)} days` : '—'}
                      </span>
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Review History */}
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Review History ({String(reviewCount)} reviews)
              </h3>
              <RecallTimeline events={reviewEvents} />
            </div>

            {/* Calibration chart */}
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Calibration
              </h3>
              <p className="text-xs text-muted-foreground">
                Predicted confidence vs actual grade outcome.
              </p>
              <CalibrationChart points={[]} />
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
