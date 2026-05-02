'use client';

/**
 * @noema/web - Reviews / SchedulingSimulator
 *
 * Local what-if view based on the concept scheduler read model.
 */
import * as React from 'react';
import { useDueConcepts } from '@noema/api-client';
import type { StudyMode, UserId } from '@noema/types';
import { Button } from '@noema/ui';
import { FlaskConical } from 'lucide-react';

export interface ISchedulingSimulatorProps {
  userId: UserId;
  studyMode: StudyMode;
}

type LaneFilter = 'all' | 'fsrs' | 'hlr';

const DURATION_OPTIONS = [15, 30, 45, 60, 90] as const;

export function SchedulingSimulator({
  userId,
  studyMode,
}: ISchedulingSimulatorProps): React.JSX.Element {
  const [durationMinutes, setDurationMinutes] = React.useState<number>(30);
  const [lane, setLane] = React.useState<LaneFilter>('all');
  const dueConcepts = useDueConcepts({ studyMode, limit: 500 }, { enabled: userId !== '' });

  const concepts = dueConcepts.data?.data.concepts ?? [];
  const filteredConcepts =
    lane === 'all' ? concepts : concepts.filter((concept) => concept.algorithm === lane);
  const simulatedConcepts = filteredConcepts.slice(0, Math.max(1, Math.floor(durationMinutes / 2)));
  const fsrsConcepts = simulatedConcepts.filter((concept) => concept.algorithm === 'fsrs');
  const hlrConcepts = simulatedConcepts.filter((concept) => concept.algorithm === 'hlr');
  const estimatedMinutes = simulatedConcepts.length * 2;
  const projectedCoverageGain =
    concepts.length > 0 ? Math.min(1, simulatedConcepts.length / concepts.length) : 0;

  return (
    <div className="flex flex-col gap-6 rounded-xl border border-border bg-card px-6 py-6">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <h3 className="text-base font-semibold text-foreground">Scheduling Simulator</h3>
        <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
          What-if
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
          <legend className="text-xs font-medium text-muted-foreground">Session Duration</legend>
          <div className="flex gap-1">
            {DURATION_OPTIONS.map((duration) => (
              <button
                key={duration}
                type="button"
                aria-pressed={durationMinutes === duration}
                onClick={() => {
                  setDurationMinutes(duration);
                }}
                className={[
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  'focus:outline-none focus:ring-2 focus:ring-ring',
                  durationMinutes === duration
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border bg-background text-foreground hover:bg-muted',
                ].join(' ')}
              >
                {String(duration)}m
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
          <legend className="text-xs font-medium text-muted-foreground">Algorithm</legend>
          <div className="flex gap-1">
            {(['all', 'fsrs', 'hlr'] as LaneFilter[]).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={lane === option}
                onClick={() => {
                  setLane(option);
                }}
                className={[
                  'rounded-md px-3 py-1.5 text-sm font-medium uppercase transition-colors',
                  'focus:outline-none focus:ring-2 focus:ring-ring',
                  lane === option
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border bg-background text-foreground hover:bg-muted',
                ].join(' ')}
              >
                {option}
              </button>
            ))}
          </div>
        </fieldset>

        <Button disabled={dueConcepts.isLoading || userId === ''} className="gap-1.5">
          <FlaskConical className="h-4 w-4" aria-hidden="true" />
          {dueConcepts.isLoading ? 'Loading...' : 'Preview Plan'}
        </Button>
      </div>

      <div className="flex flex-col gap-4">
        <div className="h-px bg-border" />
        <div className="grid grid-cols-3 gap-3">
          <Metric label="Concepts" value={String(simulatedConcepts.length)} />
          <Metric
            label="Coverage"
            value={`${String(Math.round(projectedCoverageGain * 100))}%`}
            accent="text-synapse-400"
          />
          <Metric label="Est. Duration" value={`${String(estimatedMinutes)}m`} />
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Breakdown label="FSRS" value={fsrsConcepts.length} className="text-synapse-400" />
          <Breakdown label="HLR" value={hlrConcepts.length} className="text-myelin-400" />
        </div>

        {simulatedConcepts.length === 0 && (
          <div className="flex items-center justify-center rounded-lg border border-dashed border-border py-8 text-sm text-muted-foreground">
            No concepts would be reviewed with these parameters.
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  accent = 'text-foreground',
}: {
  label: string;
  value: string;
  accent?: string;
}): React.JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-xl font-bold tabular-nums ${accent}`}>{value}</p>
    </div>
  );
}

function Breakdown({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
      <span className={`text-xs font-medium ${className}`}>{label}</span>
      <span className="text-sm font-bold tabular-nums text-foreground">
        {String(value)} concepts
      </span>
    </div>
  );
}
