'use client';

/**
 * @noema/web - Card Renderers
 * ErrorSpottingRenderer — find the mistake in the presented content.
 */

import * as React from 'react';
import type { IErrorSpottingContent } from '@noema/api-client';
import { Button } from '@noema/ui';
import { CardShell } from './card-shell';
import type { ICardRendererProps } from './types';

export default function ErrorSpottingRenderer(
  props: ICardRendererProps<string>
): React.JSX.Element {
  const { card, mode, isRevealed, onAnswer } = props;
  const content = card.content as unknown as IErrorSpottingContent;

  const baseProps = props as unknown as ICardRendererProps;
  const [text, setText] = React.useState('');

  React.useEffect(() => {
    setText('');
  }, [card.id]);

  if (mode === 'preview') {
    const preview =
      content.errorText.length > 80 ? content.errorText.slice(0, 80) + '…' : content.errorText;
    return (
      <CardShell {...baseProps}>
        <span className="line-clamp-2 font-mono text-xs">{preview}</span>
      </CardShell>
    );
  }

  function handleSubmit(): void {
    if (text.trim() !== '' && onAnswer !== undefined) {
      onAnswer(text.trim());
    }
  }

  const actionSlot = (
    <div className="space-y-4">
      {content.front !== undefined && content.front !== '' && (
        <p className="text-base font-medium text-foreground">{content.front}</p>
      )}

      {/* Error type badge */}
      {content.errorType !== undefined && content.errorType !== '' && (
        <p className="text-xs text-muted-foreground">
          Error type: <span className="font-medium text-foreground">{content.errorType}</span>
        </p>
      )}

      {/* The erroneous content block */}
      <div className="rounded border border-destructive/40 bg-destructive/5 p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Find the error
        </p>
        <pre className="text-sm text-foreground whitespace-pre-wrap font-mono leading-relaxed">
          {content.errorText}
        </pre>
      </div>

      {/* Free-text answer input */}
      {!isRevealed && (
        <div className="space-y-2">
          <label htmlFor={`error-input-${card.id}`} className="text-sm font-medium text-foreground">
            Describe the error:
          </label>
          <textarea
            id={`error-input-${card.id}`}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
            }}
            rows={3}
            placeholder="What is wrong and why?"
            className="w-full rounded border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-y focus:outline-none focus:ring-2 focus:ring-synapse-400/50"
            aria-label="Describe the error you spotted"
          />
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={text.trim() === ''}
            aria-label="Submit your error description"
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
      {/* Revealed: correct version + explanation */}
      <div className="space-y-3">
        <div className="rounded border border-green-500/30 bg-green-50/10 p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Corrected version
          </p>
          <pre className="text-sm text-foreground whitespace-pre-wrap font-mono leading-relaxed">
            {content.correctedText}
          </pre>
        </div>
        {content.errorExplanation !== undefined && content.errorExplanation !== '' && (
          <p className="text-sm text-muted-foreground">{content.errorExplanation}</p>
        )}
        {content.explanation !== undefined && content.explanation !== '' && (
          <p className="text-sm text-muted-foreground">{content.explanation}</p>
        )}
      </div>
    </CardShell>
  );
}
