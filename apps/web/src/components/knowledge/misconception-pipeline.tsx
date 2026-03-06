'use client';
/**
 * @noema/web — Knowledge / MisconceptionPipeline
 *
 * Horizontal pipeline showing the lifecycle of a misconception:
 * detected → confirmed → resolved / dismissed
 * Current step is highlighted.
 */
import * as React from 'react';

type MisconceptionStatus = 'detected' | 'confirmed' | 'resolved' | 'dismissed';

const PIPELINE_STEPS: MisconceptionStatus[] = ['detected', 'confirmed', 'resolved'];

const STEP_LABELS: Record<MisconceptionStatus, string> = {
  detected: 'Detected',
  confirmed: 'Confirmed',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

export interface IMisconceptionPipelineProps {
  status: MisconceptionStatus;
}

export function MisconceptionPipeline({ status }: IMisconceptionPipelineProps): React.JSX.Element {
  const isDismissed = status === 'dismissed';
  const currentIdx = isDismissed ? -1 : PIPELINE_STEPS.indexOf(status);

  return (
    <div className="flex items-center gap-0" role="list" aria-label="Misconception status pipeline">
      {isDismissed ? (
        <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
          Dismissed
        </span>
      ) : (
        PIPELINE_STEPS.map((step, i) => {
          const isPast = i < currentIdx;
          const isCurrent = i === currentIdx;
          return (
            <React.Fragment key={step}>
              <div
                role="listitem"
                aria-current={isCurrent ? 'step' : undefined}
                className={[
                  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                  isCurrent
                    ? 'bg-pink-100 text-pink-700 ring-1 ring-pink-400 dark:bg-pink-900/30 dark:text-pink-400'
                    : isPast
                      ? 'text-muted-foreground'
                      : 'text-muted-foreground/40',
                ].join(' ')}
              >
                {STEP_LABELS[step]}
              </div>
              {i < PIPELINE_STEPS.length - 1 && (
                <div
                  className={[
                    'mx-1 h-px w-3 flex-shrink-0',
                    i < currentIdx ? 'bg-muted-foreground' : 'bg-muted-foreground/30',
                  ].join(' ')}
                />
              )}
            </React.Fragment>
          );
        })
      )}
    </div>
  );
}
