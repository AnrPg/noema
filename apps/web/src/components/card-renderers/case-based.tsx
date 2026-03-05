'use client';

/**
 * @noema/web - Card Renderers
 * CaseBasedRenderer — case study scenario with expert analysis reveal.
 */

import * as React from 'react';
import type { ICaseBasedContent } from '@noema/api-client';
import { Button } from '@noema/ui';
import { CardShell } from './card-shell.js';
import type { ICardRendererProps } from './types.js';

export default function CaseBasedRenderer(props: ICardRendererProps<string>): React.JSX.Element {
  const { card, mode, isRevealed, onAnswer } = props;
  const content = card.content as unknown as ICaseBasedContent;

  const baseProps = props as unknown as ICardRendererProps;
  const [analysis, setAnalysis] = React.useState('');

  React.useEffect(() => {
    setAnalysis('');
  }, [card.id]);

  if (mode === 'preview') {
    const preview =
      content.scenario.length > 80 ? content.scenario.slice(0, 80) + '…' : content.scenario;
    return (
      <CardShell {...baseProps}>
        <span className="line-clamp-2">{preview}</span>
      </CardShell>
    );
  }

  function handleSubmit(): void {
    if (analysis.trim() !== '' && onAnswer !== undefined) {
      onAnswer(analysis.trim());
    }
  }

  const actionSlot = (
    <div className="space-y-4">
      {/* Scenario */}
      <div className="rounded border border-border bg-muted/20 p-4 space-y-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Case Scenario
        </p>
        <p className="text-sm text-foreground leading-relaxed">{content.scenario}</p>
      </div>

      {/* Question */}
      {content.question !== '' && (
        <p className="text-base font-semibold text-foreground">{content.question}</p>
      )}

      {/* Multiple choice options if present */}
      {content.options !== undefined && content.options.length > 0 && !isRevealed && (
        <div className="space-y-2">
          {content.options.map((option, idx) => (
            <div
              key={idx}
              className="rounded border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              {String.fromCharCode(65 + idx)}. {option.text}
            </div>
          ))}
        </div>
      )}

      {/* Free-text analysis */}
      {!isRevealed && (
        <div className="space-y-2">
          <label
            htmlFor={`case-analysis-${card.id}`}
            className="text-sm font-medium text-foreground"
          >
            Your analysis:
          </label>
          <textarea
            id={`case-analysis-${card.id}`}
            value={analysis}
            onChange={(e) => {
              setAnalysis(e.target.value);
            }}
            rows={4}
            placeholder="Write your case analysis here…"
            className="w-full rounded border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-y focus:outline-none focus:ring-2 focus:ring-synapse-400/50"
            aria-label="Your case analysis"
          />
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={analysis.trim() === ''}
            aria-label="Submit your analysis"
          >
            Submit
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <CardShell
      {...baseProps}
      {...(content.hint !== undefined ? { hint: content.hint } : {})}
      actions={actionSlot}
    >
      {/* Revealed: expert analysis + option feedback */}
      <div className="space-y-3">
        {content.options !== undefined && content.options.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Options
            </p>
            {content.options.map((option, idx) => (
              <div
                key={idx}
                className={`rounded border px-3 py-2 text-sm ${
                  option.correct
                    ? 'border-green-500/40 bg-green-50/10 text-foreground'
                    : 'border-border bg-muted/10 text-muted-foreground'
                }`}
              >
                <span className="font-medium">
                  {String.fromCharCode(65 + idx)}. {option.text}
                </span>
                {option.correct && (
                  <span className="ml-2 text-xs text-green-600 font-semibold">✓ Correct</span>
                )}
                {option.feedback !== undefined && option.feedback !== '' && (
                  <p className="mt-1 text-xs text-muted-foreground">{option.feedback}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {content.analysis !== undefined && content.analysis !== '' && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Expert Analysis
            </p>
            <p className="text-sm text-foreground leading-relaxed">{content.analysis}</p>
          </div>
        )}
        {content.explanation !== undefined && content.explanation !== '' && (
          <p className="text-sm text-muted-foreground">{content.explanation}</p>
        )}
      </div>
    </CardShell>
  );
}
