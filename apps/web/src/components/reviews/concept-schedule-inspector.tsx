'use client';

/**
 * @noema/web - Reviews / ConceptScheduleInspector
 *
 * Compatibility-named slide-out panel showing concept scheduling details.
 * The public scheduler surface is concept-first after realignment.
 */
import * as React from 'react';
import { useConceptSchedule, useTransformationHistory } from '@noema/api-client';
import type { ConceptId } from '@noema/types';
import { NeuralGauge } from '@noema/ui';
import { Loader2, X } from 'lucide-react';

export interface IConceptScheduleInspectorProps {
  conceptId: string;
  onClose: () => void;
}

const ALGO_COLORS: Record<string, string> = {
  fsrs: 'bg-synapse-400/15 text-synapse-400',
  hlr: 'bg-myelin-400/15 text-myelin-400',
  sm2: 'bg-neuron-400/15 text-neuron-400',
  leitner: 'bg-cortex-400/15 text-cortex-400',
};

function formatDate(iso: string | null): string {
  if (iso === null) return '-';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function ConceptScheduleInspector({
  conceptId,
  onClose,
}: IConceptScheduleInspectorProps): React.JSX.Element {
  const typedConceptId = conceptId as ConceptId;
  const { data: scheduleData, isLoading: scheduleLoading } = useConceptSchedule(
    typedConceptId,
    undefined,
    {
      enabled: conceptId !== '',
    }
  );
  const { data: historyData, isLoading: historyLoading } = useTransformationHistory(
    typedConceptId,
    { limit: 10 },
    { enabled: conceptId !== '' }
  );
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;
    closeButtonRef.current?.focus();
    return () => {
      previousFocusRef.current?.focus();
    };
  }, []);

  React.useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [onClose]);

  const schedule = scheduleData?.data ?? null;
  const history = historyData?.data.history ?? [];
  const recallProxy =
    schedule?.stability !== null && schedule?.stability !== undefined
      ? Math.min(
          1,
          schedule.stability / Math.max(1, schedule.intervalDays !== 0 ? schedule.intervalDays : 1)
        )
      : 0;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Concept schedule inspector"
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col overflow-y-auto border-l border-border bg-card shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Concept Schedule</p>
            <p className="font-mono text-xs text-muted-foreground">{conceptId.slice(0, 12)}...</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close inspector"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {scheduleLoading && (
          <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            Loading schedule data...
          </div>
        )}

        {!scheduleLoading && (
          <div className="flex flex-col gap-6 p-4">
            {schedule === null ? (
              <p className="text-sm text-muted-foreground">
                No concept schedule is available for this identifier yet.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <span
                    className={[
                      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide',
                      ALGO_COLORS[schedule.algorithm] ?? 'bg-muted text-muted-foreground',
                    ].join(' ')}
                  >
                    {schedule.algorithm}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {schedule.queue}
                  </span>
                </div>

                <div className="flex items-center gap-6">
                  <NeuralGauge value={recallProxy} size="md" />
                  <div>
                    <p className="text-xs text-muted-foreground">Schedule strength</p>
                    <p className="text-2xl font-bold tabular-nums text-foreground">
                      {String(Math.round(recallProxy * 100))}%
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Next due: <span className="font-medium">{formatDate(schedule.dueAt)}</span>
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Metric label="Stability" value={formatNullableDays(schedule.stability)} />
                  <Metric label="Difficulty" value={formatNullableNumber(schedule.difficulty)} />
                  <Metric label="Interval" value={`${String(schedule.intervalDays)}d`} />
                  <Metric label="Reviews" value={String(schedule.reviewCount)} />
                  <Metric label="Lapses" value={String(schedule.lapseCount)} />
                  <Metric label="Correct Run" value={String(schedule.consecutiveCorrect)} />
                </div>

                <div className="flex flex-col gap-3">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Transformation History
                  </h3>
                  {historyLoading ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      Loading transformations...
                    </div>
                  ) : history.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No transformation history has been recorded yet.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {history.map((entry) => (
                        <div
                          key={`${entry.evaluationId}-${entry.transformation}`}
                          className="rounded-lg border border-border/70 bg-background/40 px-3 py-2"
                        >
                          <p className="text-sm font-medium text-foreground">
                            {entry.transformation.replace(/_/g, ' ')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(entry.usedAt)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </aside>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function formatNullableDays(value: number | null): string {
  return value !== null ? `${value.toFixed(1)}d` : '-';
}

function formatNullableNumber(value: number | null): string {
  return value !== null ? value.toFixed(2) : '-';
}
