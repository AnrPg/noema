'use client';

/**
 * @noema/web - Card Renderers
 * MultipleChoiceRenderer — multiple choice question card.
 */

import * as React from 'react';
import type { IMultipleChoiceContent } from '@noema/api-client';
import { Button } from '@noema/ui';
import { CardShell } from './card-shell.js';
import type { ICardRendererProps } from './types.js';

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

export default function MultipleChoiceRenderer(
  props: ICardRendererProps<number>
): React.JSX.Element {
  const { card, mode, isRevealed, onAnswer } = props;
  const content = card.content as unknown as IMultipleChoiceContent;
  const [selectedIndex, setSelectedIndex] = React.useState<number | null>(null);

  // Cast to base props for CardShell which uses ICardRendererProps<unknown>.
  const baseProps = props as unknown as ICardRendererProps;

  function handleSelect(index: number): void {
    if (selectedIndex !== null) return;
    setSelectedIndex(index);
    onAnswer?.(index);
  }

  if (mode === 'preview') {
    return (
      <CardShell {...baseProps}>
        <span className="line-clamp-2">{content.front}</span>
      </CardShell>
    );
  }

  const choices = content.choices;

  return (
    <CardShell {...baseProps} {...(content.hint !== undefined ? { hint: content.hint } : {})}>
      <p className="text-base font-medium text-foreground">{content.front}</p>
      <div className="space-y-2">
        {choices.map((choice, i) => {
          const label = OPTION_LABELS[i] ?? String(i + 1);
          let colorClass = '';
          if (isRevealed) {
            if (choice.correct) {
              colorClass = 'border-green-500 text-green-700';
            } else if (selectedIndex === i) {
              colorClass = 'border-red-500 text-red-700';
            }
          }
          return (
            <Button
              key={i}
              variant={selectedIndex === i ? 'default' : 'outline'}
              size="sm"
              disabled={selectedIndex !== null}
              onClick={() => {
                handleSelect(i);
              }}
              className={`w-full justify-start ${colorClass}`}
              aria-label={`Option ${label}: ${choice.text}`}
            >
              <span className="font-mono mr-2">{label}.</span>
              {choice.text}
            </Button>
          );
        })}
      </div>
      {isRevealed && content.explanation !== undefined && content.explanation !== '' && (
        <p className="text-sm text-muted-foreground">{content.explanation}</p>
      )}
    </CardShell>
  );
}
