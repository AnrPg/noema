'use client';

/**
 * @noema/web - Card Renderers
 * TransferRenderer — apply knowledge from source domain to a novel context.
 */

import * as React from 'react';
import type { ITransferContent } from '@noema/api-client';
import { Button } from '@noema/ui';
import { CardShell } from './card-shell.js';
import type { ICardRendererProps } from './types.js';

export default function TransferRenderer(props: ICardRendererProps<string>): React.JSX.Element {
  const { card, mode, isRevealed, onAnswer } = props;
  const content = card.content as unknown as ITransferContent;

  const baseProps = props as unknown as ICardRendererProps;
  const [answer, setAnswer] = React.useState('');

  React.useEffect(() => {
    setAnswer('');
  }, [card.id]);

  if (mode === 'preview') {
    return (
      <CardShell {...baseProps}>
        <span className="font-medium line-clamp-1">
          {content.originalContext} → {content.novelContext}
        </span>
      </CardShell>
    );
  }

  function handleSubmit(): void {
    if (answer.trim() !== '' && onAnswer !== undefined) {
      onAnswer(answer.trim());
    }
  }

  const actionSlot = (
    <div className="space-y-4">
      {/* Domain comparison header */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded border border-border bg-muted/20 p-3 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Source Domain
          </p>
          <p className="text-sm font-medium text-foreground">{content.originalContext}</p>
        </div>
        <div className="rounded border border-synapse-400/30 bg-synapse-400/5 p-3 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Target Domain
          </p>
          <p className="text-sm font-medium text-foreground">{content.novelContext}</p>
        </div>
      </div>

      {/* Transfer prompt — the core question */}
      <div className="rounded border border-border p-4 bg-background">
        <p className="text-base font-semibold text-foreground">{content.transferPrompt}</p>
      </div>

      {/* Free-text answer input */}
      {!isRevealed && (
        <div className="space-y-2">
          <label
            htmlFor={`transfer-answer-${card.id}`}
            className="text-sm font-medium text-foreground"
          >
            Your answer:
          </label>
          <textarea
            id={`transfer-answer-${card.id}`}
            value={answer}
            onChange={(e) => {
              setAnswer(e.target.value);
            }}
            rows={4}
            placeholder="How would you apply this knowledge to the new domain?"
            className="w-full rounded border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-y focus:outline-none focus:ring-2 focus:ring-synapse-400/50"
            aria-label="Your transfer answer"
          />
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={answer.trim() === ''}
            aria-label="Submit your transfer answer"
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
      {/* Revealed: structural mapping + model answer */}
      <div className="space-y-3">
        {content.structuralMapping !== undefined && content.structuralMapping !== '' && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Structural Mapping
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {content.structuralMapping}
            </p>
          </div>
        )}
        {content.back !== undefined && content.back !== '' && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Model Answer
            </p>
            <p className="text-sm text-foreground leading-relaxed">{content.back}</p>
          </div>
        )}
        {content.explanation !== undefined && content.explanation !== '' && (
          <p className="text-sm text-muted-foreground">{content.explanation}</p>
        )}
        {content.back === undefined &&
          content.explanation === undefined &&
          content.structuralMapping === undefined && (
            <p className="text-sm text-muted-foreground italic">No model answer provided.</p>
          )}
      </div>
    </CardShell>
  );
}
