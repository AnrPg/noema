'use client';

/**
 * @noema/web - Card Renderers
 * OrderingRenderer — arrange items into the correct sequence using Up/Down controls.
 */

import * as React from 'react';
import type { IOrderingContent } from '@noema/api-client';
import { Button, cn } from '@noema/ui';
import { CardShell } from './card-shell.js';
import type { ICardRendererProps } from './types.js';

/** Deterministic shuffle seeded by card.id. */
function seededShuffle<T>(arr: T[], seed: string): T[] {
  const copy: (T | undefined)[] = [...arr];
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  for (let i = copy.length - 1; i > 0; i--) {
    h = (Math.imul(h, 1664525) + 1013904223) | 0;
    const j = Math.abs(h) % (i + 1);
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy as T[];
}

export default function OrderingRenderer(props: ICardRendererProps<string[]>): React.JSX.Element {
  const { card, mode, onAnswer } = props;
  const content = card.content as unknown as IOrderingContent;

  /** Correct order by `correctPosition` ascending. */
  const correctOrder = React.useMemo(
    () =>
      [...content.items]
        .sort((a, b) => a.correctPosition - b.correctPosition)
        .map((item) => item.text),
    [content.items]
  );

  const [currentOrder, setCurrentOrder] = React.useState<string[]>(() =>
    seededShuffle(correctOrder, card.id)
  );
  const [submitted, setSubmitted] = React.useState(false);

  React.useEffect(() => {
    setCurrentOrder(seededShuffle(correctOrder, card.id));
    setSubmitted(false);
  }, [card.id, correctOrder]);

  if (mode === 'preview') {
    const baseProps = props as unknown as ICardRendererProps;
    return (
      <CardShell {...baseProps}>
        <span className="text-muted-foreground">Order {String(content.items.length)} items</span>
      </CardShell>
    );
  }

  const baseProps = props as unknown as ICardRendererProps;

  function moveUp(index: number): void {
    if (index === 0 || submitted) return;
    setCurrentOrder((prev) => {
      const next = [...prev];
      const above = next[index - 1] ?? '';
      const current = next[index] ?? '';
      next[index - 1] = current;
      next[index] = above;
      return next;
    });
  }

  function moveDown(index: number): void {
    if (index === currentOrder.length - 1 || submitted) return;
    setCurrentOrder((prev) => {
      const next = [...prev];
      const current = next[index] ?? '';
      const below = next[index + 1] ?? '';
      next[index] = below;
      next[index + 1] = current;
      return next;
    });
  }

  function handleSubmit(): void {
    setSubmitted(true);
    onAnswer?.(currentOrder);
  }

  const actionSlot = (
    <div className="space-y-3">
      {content.orderingCriterion !== '' && (
        <p className="text-sm text-muted-foreground italic">
          Order by: {content.orderingCriterion}
        </p>
      )}
      <div className="space-y-2">
        {currentOrder.map((text, i) => {
          const isCorrect = submitted && i < correctOrder.length && text === correctOrder[i];
          const isWrong = submitted && !(i < correctOrder.length && text === correctOrder[i]);
          return (
            <div
              key={text}
              className={cn(
                'flex items-center gap-2 p-2 rounded border text-sm',
                isCorrect && 'border-green-500 bg-green-50',
                isWrong && 'border-red-400 bg-red-50',
                !submitted && 'border-border bg-background'
              )}
            >
              <span className="w-6 text-xs text-muted-foreground text-center font-mono">
                {String(i + 1)}.
              </span>
              <span className="flex-1 text-foreground">{text}</span>
              {!submitted && (
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      moveUp(i);
                    }}
                    disabled={i === 0}
                    aria-label={`Move "${text}" up`}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30 leading-none px-1"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      moveDown(i);
                    }}
                    disabled={i === currentOrder.length - 1}
                    aria-label={`Move "${text}" down`}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30 leading-none px-1"
                  >
                    ▼
                  </button>
                </div>
              )}
              {submitted && isCorrect && (
                <span className="text-green-600 text-xs font-bold">✓</span>
              )}
              {submitted && isWrong && <span className="text-red-500 text-xs font-bold">✗</span>}
            </div>
          );
        })}
      </div>
      {!submitted && (
        <Button size="sm" onClick={handleSubmit} aria-label="Submit order">
          Submit Order
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
      {submitted && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Correct order
          </p>
          <ol className="list-decimal list-inside space-y-1">
            {correctOrder.map((text, i) => (
              <li key={i} className="text-sm text-green-700">
                {text}
              </li>
            ))}
          </ol>
        </div>
      )}
      {content.explanation !== undefined && content.explanation !== '' && (
        <p className="text-sm text-muted-foreground">{content.explanation}</p>
      )}
    </CardShell>
  );
}
