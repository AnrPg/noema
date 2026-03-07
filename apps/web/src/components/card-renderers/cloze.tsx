/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
'use client';

/**
 * @noema/web - Card Renderers
 * ClozeRenderer — fill-in-the-blank card with {{blank}} template placeholders.
 * Note: eslint-disable directives above suppress no-unsafe-* rules that fire
 * because @noema/ui has not been built yet. Remove once packages are built.
 */

import * as React from 'react';
import type { IClozeContent } from '@noema/api-client';
import { Button, cn } from '@noema/ui';
import { CardShell } from './card-shell.js';
import type { ICardRendererProps } from './types.js';

const BLANK_PATTERN = /\{\{blank\}\}/g;

function getAnswerClass(
  submitted: boolean,
  isRevealed: boolean,
  userAnswer: string,
  correctAnswer: string
): string {
  if (!submitted || !isRevealed) return '';
  return userAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase()
    ? 'border-dendrite-400 bg-dendrite-400/10 text-dendrite-300'
    : 'border-cortex-400 bg-cortex-400/10 text-cortex-300';
}

/** Replace each {{blank}} with a numbered token for splitting. */
function splitTemplate(template: string): string[] {
  return template.split(BLANK_PATTERN);
}

function countBlanks(template: string): number {
  return (template.match(BLANK_PATTERN) ?? []).length;
}

export default function ClozeRenderer(props: ICardRendererProps<string[]>): React.JSX.Element {
  const { card, mode, isRevealed, onAnswer } = props;
  const content = card.content as unknown as IClozeContent;

  const blankCount = countBlanks(content.template);
  const safeClozes = content.clozes ?? [];
  // Only use cloze entries that have a corresponding {{blank}} in the template
  const answers = safeClozes.slice(0, blankCount);

  const [userAnswers, setUserAnswers] = React.useState<string[]>(() =>
    Array.from<string>({ length: blankCount }).fill('')
  );
  const [submitted, setSubmitted] = React.useState(false);

  React.useEffect(() => {
    setUserAnswers(Array.from<string>({ length: blankCount }).fill(''));
    setSubmitted(false);
  }, [card.id, blankCount]);

  if (mode === 'preview') {
    const baseProps = props as unknown as ICardRendererProps;
    const preview = content.template.replace(BLANK_PATTERN, '_____');
    return (
      <CardShell {...baseProps}>
        <span className="line-clamp-3">{preview}</span>
      </CardShell>
    );
  }

  const baseProps = props as unknown as ICardRendererProps;
  const segments = splitTemplate(content.template);

  function handleChange(index: number, value: string): void {
    if (submitted) return;
    setUserAnswers((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function handleCheck(): void {
    setSubmitted(true);
    onAnswer?.(userAnswers);
  }

  const allFilled = userAnswers.every((a) => a.trim() !== '');

  const actionSlot = (
    <div className="space-y-4">
      <p className="text-base font-medium text-foreground leading-relaxed">
        {segments.map((seg, i) => (
          <React.Fragment key={i}>
            {seg}
            {i < segments.length - 1 && (
              <input
                type="text"
                value={userAnswers[i] ?? ''}
                onChange={(e) => {
                  handleChange(i, e.target.value);
                }}
                disabled={submitted}
                aria-label={`Blank ${String(i + 1)}`}
                className={cn(
                  'inline-block mx-1 px-2 py-0.5 w-28 rounded border text-sm',
                  'border-border bg-background focus:outline-none focus:ring-1 focus:ring-synapse-400',
                  getAnswerClass(
                    submitted,
                    isRevealed,
                    userAnswers[i] ?? '',
                    answers[i]?.answer ?? ''
                  )
                )}
              />
            )}
          </React.Fragment>
        ))}
      </p>
      {!submitted && (
        <Button size="sm" disabled={!allFilled} onClick={handleCheck} aria-label="Check answers">
          Check
        </Button>
      )}
    </div>
  );

  return (
    <CardShell
      {...baseProps}
      {...(content.hint !== undefined ? { hint: content.hint } : {})}
      actions={actionSlot}
    >
      {submitted && answers.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Correct answers
          </p>
          <ol className="list-decimal list-inside space-y-1">
            {answers.map((cloze, i) => {
              const userAns = (userAnswers[i] ?? '').trim();
              const correct = cloze.answer.trim();
              const isCorrect = userAns.toLowerCase() === correct.toLowerCase();
              return (
                <li key={i} className="text-sm">
                  <span className={cn(isCorrect ? 'text-green-700' : 'text-red-600')}>
                    {isCorrect ? userAns : `${userAns} → `}
                  </span>
                  {!isCorrect && <span className="text-green-700 font-medium">{correct}</span>}
                </li>
              );
            })}
          </ol>
        </div>
      )}
      {content.explanation !== undefined && content.explanation !== '' && (
        <p className="text-sm text-muted-foreground">{content.explanation}</p>
      )}
    </CardShell>
  );
}
