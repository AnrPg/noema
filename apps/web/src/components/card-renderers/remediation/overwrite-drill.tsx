'use client';

/**
 * @noema/web - Card Renderers
 * OverwriteDrillRenderer — repeated retrieval practice to overwrite an incorrect response with the correct one.
 */

import * as React from 'react';
import type { IOverwriteDrillContent } from '@noema/api-client';
import { Button } from '@noema/ui';
import { CardShell } from '../card-shell';
import type { ICardRendererProps } from '../types';

export default function OverwriteDrillRenderer(props: ICardRendererProps): React.JSX.Element {
  const { card, mode } = props;
  const content = card.content as unknown as IOverwriteDrillContent;

  const [promptIndex, setPromptIndex] = React.useState(0);
  const [recall, setRecall] = React.useState('');
  const [submitted, setSubmitted] = React.useState(false);

  React.useEffect(() => {
    setPromptIndex(0);
    setRecall('');
    setSubmitted(false);
  }, [card.id]);

  if (mode === 'preview') {
    return (
      <CardShell {...props}>
        <span className="font-medium line-clamp-1">{content.incorrectResponse}</span>
        <span className="text-muted-foreground text-xs ml-1">
          · overwrite drill ({String(content.drillPrompts.length)} prompt
          {content.drillPrompts.length !== 1 ? 's' : ''})
        </span>
      </CardShell>
    );
  }

  const safePrompts = content.drillPrompts.length > 0 ? content.drillPrompts : [];
  const currentPrompt = safePrompts[promptIndex] ?? null;
  const isLastPrompt = promptIndex >= safePrompts.length - 1;

  function handleSubmit(): void {
    setSubmitted(true);
    props.onAnswer?.(recall);
  }

  function handleNext(): void {
    setPromptIndex((i) => i + 1);
    setRecall('');
    setSubmitted(false);
  }

  const actionSlot = (
    <div className="space-y-4">
      {/* Incorrect response to overwrite */}
      <div className="rounded border border-red-500/30 bg-red-50/5 p-3 space-y-1">
        <p className="text-xs font-semibold text-red-400 uppercase tracking-wide">
          Incorrect Response (to overwrite)
        </p>
        <p className="text-sm text-foreground">{content.incorrectResponse}</p>
      </div>

      {/* Current drill prompt */}
      {currentPrompt !== null && !props.isRevealed && (
        <div className="space-y-2">
          <div className="rounded border border-border bg-muted/30 p-3 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Drill Prompt {String(promptIndex + 1)} of {String(safePrompts.length)}
            </p>
            <p className="text-sm text-foreground">{currentPrompt}</p>
          </div>

          <textarea
            name={`overwriteDrillResponse.${String(promptIndex)}`}
            value={recall}
            onChange={(e) => {
              if (!submitted) setRecall(e.target.value);
            }}
            disabled={submitted}
            placeholder="Type the correct response…"
            aria-label={`Drill response for prompt ${String(promptIndex + 1)}`}
            rows={2}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-synapse-400 disabled:opacity-60 resize-none"
          />

          {!submitted && (
            <Button
              size="sm"
              disabled={recall.trim() === ''}
              onClick={handleSubmit}
              aria-label="Submit drill response"
            >
              Submit
            </Button>
          )}

          {submitted && !isLastPrompt && (
            <Button size="sm" variant="outline" onClick={handleNext} aria-label="Next drill prompt">
              Next Prompt
            </Button>
          )}
        </div>
      )}

      {safePrompts.length === 0 && !props.isRevealed && (
        <p className="text-sm text-muted-foreground italic">No drill prompts defined.</p>
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
        {/* Correct response */}
        <div className="rounded border border-green-500/30 bg-green-50/5 p-3 space-y-1">
          <p className="text-xs font-semibold text-green-400 uppercase tracking-wide">
            Correct Response
          </p>
          <p className="text-base font-medium text-foreground">{content.correctResponse}</p>
        </div>

        {/* All drill prompts summary */}
        {safePrompts.length > 0 && (
          <div className="rounded border border-border bg-muted/20 p-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              All Drill Prompts
            </p>
            <ol className="list-decimal list-inside space-y-1">
              {safePrompts.map((prompt, idx) => (
                <li key={idx} className="text-sm text-foreground">
                  {prompt}
                </li>
              ))}
            </ol>
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
