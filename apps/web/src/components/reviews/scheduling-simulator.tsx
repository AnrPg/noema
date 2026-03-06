/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */
'use client';
/**
 * @noema/web — Reviews / SchedulingSimulator
 *
 * What-if simulation tool.
 * Controls: session duration (min), lane filter.
 * Results: simulated card list, projected retention gain, estimated duration.
 */
import * as React from 'react';
import { useSimulateSession } from '@noema/api-client';
import type { UserId } from '@noema/types';
import { Button } from '@noema/ui';
import { Loader2, FlaskConical } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ISchedulingSimulatorProps {
  userId: UserId;
}

type LaneFilter = 'all' | 'retention' | 'calibration';

const DURATION_OPTIONS = [15, 30, 45, 60, 90] as const;

// ── Component ────────────────────────────────────────────────────────────────

export function SchedulingSimulator({ userId }: ISchedulingSimulatorProps): React.JSX.Element {
  const [durationMinutes, setDurationMinutes] = React.useState<number>(30);
  const [lane, setLane] = React.useState<LaneFilter>('all');
  const [result, setResult] = React.useState<any>(null);

  const simulate = useSimulateSession();

  const handleRun = React.useCallback(async (): Promise<void> => {
    const response: any = await simulate.mutateAsync({
      userId,
      sessionDurationMinutes: durationMinutes,
      ...(lane !== 'all' ? { lane } : {}),
    });
    setResult(response?.data ?? null);
  }, [simulate, userId, durationMinutes, lane]);

  const simulatedCards: any[] = (result?.simulatedCards as any[] | undefined) ?? [];
  const retentionGain: number = (result?.projectedRetentionGain as number | undefined) ?? 0;
  const estimatedMinutes: number = (result?.estimatedDurationMinutes as number | undefined) ?? 0;

  const retentionCards = simulatedCards.filter((c) => String(c.lane) === 'retention');
  const calibrationCards = simulatedCards.filter((c) => String(c.lane) === 'calibration');

  return (
    <div className="flex flex-col gap-6 rounded-xl border border-border bg-card px-6 py-6">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <h3 className="text-base font-semibold text-foreground">Scheduling Simulator</h3>
        <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
          What-if
        </span>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4">
        {/* Duration */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Session Duration</label>
          <div className="flex gap-1">
            {DURATION_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setDurationMinutes(d);
                }}
                className={[
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  'focus:outline-none focus:ring-2 focus:ring-ring',
                  durationMinutes === d
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border bg-background text-foreground hover:bg-muted',
                ].join(' ')}
              >
                {String(d)}m
              </button>
            ))}
          </div>
        </div>

        {/* Lane filter */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Lane</label>
          <div className="flex gap-1">
            {(['all', 'retention', 'calibration'] as LaneFilter[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => {
                  setLane(l);
                }}
                className={[
                  'rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors',
                  'focus:outline-none focus:ring-2 focus:ring-ring',
                  lane === l
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border bg-background text-foreground hover:bg-muted',
                ].join(' ')}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Run button */}
        <Button
          onClick={() => {
            void handleRun();
          }}
          disabled={simulate.isPending === true || userId === ''}
          className="gap-1.5"
        >
          {simulate.isPending === true ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <FlaskConical className="h-4 w-4" aria-hidden="true" />
          )}
          Run Simulation
        </Button>
      </div>

      {/* Results */}
      {result !== null && (
        <div className="flex flex-col gap-4">
          <div className="h-px bg-border" />

          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-center">
              <p className="text-xs text-muted-foreground">Total Cards</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-foreground">
                {String(simulatedCards.length)}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-center">
              <p className="text-xs text-muted-foreground">Retention Gain</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-synapse-400">
                +{String(Math.round(retentionGain * 100))}%
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-center">
              <p className="text-xs text-muted-foreground">Est. Duration</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-foreground">
                {String(estimatedMinutes)}m
              </p>
            </div>
          </div>

          {/* Lane breakdown */}
          {simulatedCards.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Lane Breakdown
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex items-center justify-between rounded-lg border border-synapse-400/20 bg-synapse-400/5 px-3 py-2">
                  <span className="text-xs font-medium text-synapse-400">Retention</span>
                  <span className="text-sm font-bold tabular-nums text-foreground">
                    {String(retentionCards.length)} cards
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-myelin-400/20 bg-myelin-400/5 px-3 py-2">
                  <span className="text-xs font-medium text-myelin-400">Calibration</span>
                  <span className="text-sm font-bold tabular-nums text-foreground">
                    {String(calibrationCards.length)} cards
                  </span>
                </div>
              </div>
            </div>
          )}

          {simulatedCards.length === 0 && (
            <div className="flex items-center justify-center rounded-lg border border-dashed border-border py-8 text-sm text-muted-foreground">
              No cards would be reviewed with these parameters.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
