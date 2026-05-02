'use client';

import * as React from 'react';
import { CheckCircle2, Sigma } from 'lucide-react';
import type { StepSelfRating } from '@noema/types';

export interface IEvaluationSummaryProps {
  reasoningQuality: number;
  combinedScore?: number | undefined;
  errorType?: string | undefined;
  selfRating?: StepSelfRating | undefined;
  expectedOutcome?: string | undefined;
  metExpectedOutcome?: boolean | undefined;
}

function formatPercent(value: number): string {
  return `${String(Math.round(Math.min(1, Math.max(0, value)) * 100))}%`;
}

function formatLabel(value: string): string {
  return value.replace(/_/g, ' ');
}

export function EvaluationSummary({
  reasoningQuality,
  combinedScore,
  errorType,
  selfRating,
  expectedOutcome,
  metExpectedOutcome,
}: IEvaluationSummaryProps): React.JSX.Element {
  return (
    <div className="flex h-full flex-col justify-between gap-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Sigma className="h-4 w-4 text-primary" aria-hidden="true" />
          Evaluation Summary
        </h3>
        <div className="mt-3 space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Reasoning quality</span>
            <span className="font-medium tabular-nums text-foreground">
              {formatPercent(reasoningQuality)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Combined score</span>
            <span className="font-medium tabular-nums text-foreground">
              {combinedScore === undefined ? 'Pending' : formatPercent(combinedScore)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Error type</span>
            <span className="max-w-[12rem] truncate font-medium capitalize text-foreground">
              {errorType === undefined ? 'None' : formatLabel(errorType)}
            </span>
          </div>
          {selfRating !== undefined && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Self-rating</span>
              <span className="font-medium capitalize text-foreground">
                {formatLabel(selfRating)}
              </span>
            </div>
          )}
          {metExpectedOutcome !== undefined && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Expected outcome</span>
              <span className="font-medium text-foreground">
                {metExpectedOutcome ? 'Met' : 'Still open'}
              </span>
            </div>
          )}
        </div>
      </div>

      {expectedOutcome !== undefined && (
        <div className="rounded-lg border border-border/70 bg-background/70 p-3">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <p className="text-xs leading-5 text-muted-foreground">{expectedOutcome}</p>
          </div>
        </div>
      )}
    </div>
  );
}
