'use client';

/**
 * @noema/web - Card Renderers
 * CalibrationTrainingRenderer — trains the learner to match confidence to actual accuracy.
 */

import * as React from 'react';
import type { ICalibrationTrainingContent } from '@noema/api-client';
import { CardShell } from '../card-shell.js';
import type { ICardRendererProps } from '../types.js';

export default function CalibrationTrainingRenderer(props: ICardRendererProps): React.JSX.Element {
  const { card, mode } = props;
  const content = card.content as unknown as ICalibrationTrainingContent;

  const [estimate, setEstimate] = React.useState('');
  const [submitted, setSubmitted] = React.useState(false);

  React.useEffect(() => {
    setEstimate('');
    setSubmitted(false);
  }, [card.id]);

  if (mode === 'preview') {
    return (
      <CardShell {...props}>
        <span className="font-medium line-clamp-1">{content.statement}</span>
        <span className="text-muted-foreground text-xs ml-1">· calibration training</span>
      </CardShell>
    );
  }

  function handleSubmit(): void {
    setSubmitted(true);
    props.onAnswer?.(estimate);
  }

  const actionSlot = (
    <div className="space-y-4">
      {/* Statement */}
      <div className="rounded border border-border bg-muted/30 p-3 space-y-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Statement
        </p>
        <p className="text-base font-medium text-foreground">{content.statement}</p>
      </div>

      {/* Calibration prompt */}
      <div className="rounded border border-synapse-400/30 bg-muted/20 p-3 space-y-1">
        <p className="text-xs font-semibold text-synapse-400 uppercase tracking-wide">
          Calibration Prompt
        </p>
        <p className="text-sm text-foreground">{content.calibrationPrompt}</p>
      </div>

      {!props.isRevealed && (
        <div className="space-y-2">
          <textarea
            value={estimate}
            onChange={(e) => {
              if (!submitted) setEstimate(e.target.value);
            }}
            disabled={submitted}
            placeholder="Enter your confidence estimate (e.g. 70%)…"
            aria-label="Confidence estimate"
            rows={2}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-synapse-400 disabled:opacity-60 resize-none"
          />
          {!submitted && (
            <button
              disabled={estimate.trim() === ''}
              onClick={handleSubmit}
              aria-label="Submit confidence estimate"
              className="rounded bg-synapse-400 px-3 py-1.5 text-sm font-medium text-background disabled:opacity-40"
            >
              Submit
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <CardShell
      {...props}
      {...(content.hint !== undefined ? { hint: content.hint } : {})}
      actions={actionSlot}
    >
      <div className="space-y-3">
        {/* True confidence */}
        <div className="rounded border border-green-500/30 bg-green-50/5 p-3 space-y-1">
          <p className="text-xs font-semibold text-green-400 uppercase tracking-wide">
            Expert Confidence
          </p>
          <p className="text-2xl font-bold text-foreground">
            {String(content.trueConfidence)}
            <span className="text-base font-medium text-muted-foreground ml-1">%</span>
          </p>
        </div>

        {estimate !== '' && submitted && (
          <div className="rounded border border-border bg-muted/20 p-3 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Your Estimate
            </p>
            <p className="text-sm text-foreground">{estimate}</p>
          </div>
        )}

        {content.explanation !== undefined && content.explanation !== '' && (
          <p className="text-sm text-muted-foreground border-t border-border pt-3">
            {content.explanation}
          </p>
        )}
      </div>
    </CardShell>
  );
}
