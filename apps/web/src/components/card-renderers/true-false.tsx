'use client';

/**
 * @noema/web - Card Renderers
 * TrueFalseRenderer — binary true/false question card.
 */

import * as React from 'react';
import type { ITrueFalseContent } from '@noema/api-client';
import { Button } from '@noema/ui';
import { CardShell } from './card-shell.js';
import type { ICardRendererProps } from './types.js';

export default function TrueFalseRenderer(props: ICardRendererProps<boolean>): React.JSX.Element {
  const { card, mode, isRevealed, onAnswer } = props;
  const content = card.content as unknown as ITrueFalseContent;
  const [answered, setAnswered] = React.useState<boolean | null>(null);

  // Cast to base props for CardShell which uses ICardRendererProps<unknown>.
  const baseProps = props as unknown as ICardRendererProps;

  function handleAnswer(value: boolean): void {
    if (answered !== null) return;
    setAnswered(value);
    onAnswer?.(value);
  }

  if (mode === 'preview') {
    return (
      <CardShell {...baseProps}>
        <span className="line-clamp-2">{content.statement}</span>
      </CardShell>
    );
  }

  return (
    <CardShell {...baseProps} {...(content.hint !== undefined ? { hint: content.hint } : {})}>
      <p className="text-base font-medium text-foreground">{content.statement}</p>
      <div className="flex gap-3">
        <Button
          variant={answered === true ? 'default' : 'outline'}
          size="sm"
          disabled={answered !== null}
          onClick={() => {
            handleAnswer(true);
          }}
          aria-label="Answer True"
          className={
            isRevealed && content.isTrue
              ? 'border-green-500 text-green-700'
              : isRevealed && answered === true && !content.isTrue
                ? 'border-red-500 text-red-700'
                : ''
          }
        >
          {isRevealed && content.isTrue ? '\u2713 ' : ''}True
        </Button>
        <Button
          variant={answered === false ? 'default' : 'outline'}
          size="sm"
          disabled={answered !== null}
          onClick={() => {
            handleAnswer(false);
          }}
          aria-label="Answer False"
          className={
            isRevealed && !content.isTrue
              ? 'border-green-500 text-green-700'
              : isRevealed && answered === false && content.isTrue
                ? 'border-red-500 text-red-700'
                : ''
          }
        >
          {isRevealed && !content.isTrue ? '\u2713 ' : ''}False
        </Button>
      </div>
      {isRevealed && content.explanation !== undefined && content.explanation !== '' && (
        <p className="text-sm text-muted-foreground">{content.explanation}</p>
      )}
    </CardShell>
  );
}
