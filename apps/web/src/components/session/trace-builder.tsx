'use client';

import * as React from 'react';
import { CheckCircle2, GitBranch, Sigma } from 'lucide-react';
import type { ISevenFrameTraceDto } from '@noema/contracts';
import type { StepSelfRating } from '@noema/types';

type TraceFrameKey = keyof ISevenFrameTraceDto['frames'];

interface ITraceBuilderProps {
  trace: ISevenFrameTraceDto;
  selfRating: StepSelfRating;
  expectedOutcome: string;
  metExpectedOutcome: boolean;
}

const FRAME_LABELS: Record<TraceFrameKey, string> = {
  f0: 'Prompt',
  f1: 'Outcome',
  f2: 'Mode',
  f3: 'Response',
  f4: 'Transform',
  f5: 'Self-rating',
  f6: 'Outcome check',
};

const FRAME_KEYS: TraceFrameKey[] = ['f0', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6'];

function formatPercent(value: number): string {
  return `${String(Math.round(Math.min(1, Math.max(0, value)) * 100))}%`;
}

function formatSelfRating(value: StepSelfRating): string {
  return value.replace(/_/g, ' ');
}

export function TraceBuilder({
  trace,
  selfRating,
  expectedOutcome,
  metExpectedOutcome,
}: ITraceBuilderProps): React.JSX.Element {
  const averageScore =
    FRAME_KEYS.reduce((sum, key) => sum + trace.frames[key].score, 0) / FRAME_KEYS.length;

  return (
    <section
      aria-label="Trace builder"
      className="grid gap-4 rounded-lg border border-border bg-background/70 p-4 lg:grid-cols-[1.2fr_0.8fr]"
    >
      <div className="space-y-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <GitBranch className="h-4 w-4 text-primary" aria-hidden="true" />
            Trace Builder
          </h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Seven reasoning frames will be sent with this Step.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {FRAME_KEYS.map((key) => {
            const frame = trace.frames[key];

            return (
              <div key={key} className="rounded-lg border border-border/70 bg-muted/25 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-foreground">{FRAME_LABELS[key]}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {formatPercent(frame.score)}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {frame.notes}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col justify-between gap-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Sigma className="h-4 w-4 text-primary" aria-hidden="true" />
            Evaluation Summary
          </h3>
          <div className="mt-3 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Reasoning preview</span>
              <span className="font-medium tabular-nums text-foreground">
                {formatPercent(averageScore)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Self-rating</span>
              <span className="font-medium capitalize text-foreground">
                {formatSelfRating(selfRating)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Expected outcome</span>
              <span className="font-medium text-foreground">
                {metExpectedOutcome ? 'Met' : 'Still open'}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-background/70 p-3">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <p className="text-xs leading-5 text-muted-foreground">{expectedOutcome}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
