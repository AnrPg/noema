'use client';

/**
 * @noema/web - Card Renderers
 * ConfidenceRatedRenderer — self-assessed confidence flip card.
 */

import * as React from 'react';
import type { IConfidenceRatedContent } from '@noema/api-client';
import { Button } from '@noema/ui';
import { CardShell } from './card-shell.js';
import type { ICardRendererProps } from './types.js';

export default function ConfidenceRatedRenderer(
  props: ICardRendererProps<number>
): React.JSX.Element {
  const { card, mode, isRevealed, onAnswer } = props;
  const content = card.content as unknown as IConfidenceRatedContent;
  const [selectedRating, setSelectedRating] = React.useState<number | null>(null);

  // Cast to base props for CardShell which uses ICardRendererProps<unknown>.
  const baseProps = props as unknown as ICardRendererProps;

  function handleRating(rating: number): void {
    if (selectedRating !== null) return;
    setSelectedRating(rating);
    onAnswer?.(rating);
  }

  if (mode === 'preview') {
    return (
      <CardShell {...baseProps}>
        <span className="line-clamp-2">{content.front}</span>
      </CardShell>
    );
  }

  const scale = content.confidenceScale;
  const min = scale?.min ?? 1;
  const max = scale?.max ?? 5;
  const ratings: number[] = [];
  for (let r = min; r <= max; r++) {
    ratings.push(r);
  }

  return (
    <CardShell {...baseProps} {...(content.hint !== undefined ? { hint: content.hint } : {})}>
      <p className="text-base font-medium text-foreground">{content.front}</p>
      {!isRevealed && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Rate your confidence:</p>
          <div className="flex flex-wrap gap-2">
            {ratings.map((rating) => {
              const label = scale?.labels?.[String(rating)];
              return (
                <Button
                  key={rating}
                  variant={selectedRating === rating ? 'default' : 'outline'}
                  size="sm"
                  disabled={selectedRating !== null}
                  onClick={() => {
                    handleRating(rating);
                  }}
                  aria-label={
                    label !== undefined
                      ? `${String(rating)} \u2014 ${label}`
                      : `Confidence ${String(rating)}`
                  }
                >
                  {String(rating)}
                  {label !== undefined && (
                    <span className="ml-1 text-xs text-muted-foreground">{label}</span>
                  )}
                </Button>
              );
            })}
          </div>
        </div>
      )}
      {isRevealed && <p className="text-base text-foreground">{content.correctAnswer}</p>}
      {isRevealed &&
        content.calibrationFeedback !== undefined &&
        content.calibrationFeedback !== '' && (
          <p className="text-sm text-muted-foreground italic">{content.calibrationFeedback}</p>
        )}
    </CardShell>
  );
}
