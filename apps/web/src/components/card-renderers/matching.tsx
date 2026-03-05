'use client';

/**
 * @noema/web - Card Renderers
 * MatchingRenderer — match left items to right items via dropdowns.
 */

import * as React from 'react';
import type { IMatchingContent } from '@noema/api-client';
import { Button, cn } from '@noema/ui';
import { CardShell } from './card-shell.js';
import type { ICardRendererProps } from './types.js';

/** Deterministic shuffle seeded by card.id — Fisher-Yates with a simple hash. */
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

export default function MatchingRenderer(
  props: ICardRendererProps<Record<string, string>>
): React.JSX.Element {
  const { card, mode, onAnswer } = props;
  const content = card.content as unknown as IMatchingContent;

  const shuffledRight = React.useMemo(
    () =>
      seededShuffle(
        content.pairs.map((p) => p.right),
        card.id
      ),
    [content.pairs, card.id]
  );

  const [selections, setSelections] = React.useState<Record<string, string>>(() => ({}));
  const [submitted, setSubmitted] = React.useState(false);

  React.useEffect(() => {
    setSelections({});
    setSubmitted(false);
  }, [card.id]);

  if (mode === 'preview') {
    const baseProps = props as unknown as ICardRendererProps;
    return (
      <CardShell {...baseProps}>
        <span className="text-muted-foreground">Match {String(content.pairs.length)} pairs</span>
      </CardShell>
    );
  }

  const baseProps = props as unknown as ICardRendererProps;

  const allSelected = content.pairs.every(
    (p) => selections[p.left] !== undefined && selections[p.left] !== ''
  );

  function handleSelect(left: string, right: string): void {
    if (submitted) return;
    setSelections((prev) => ({ ...prev, [left]: right }));
  }

  function handleCheck(): void {
    setSubmitted(true);
    onAnswer?.(selections);
  }

  const actionSlot = (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Match each item on the left with the correct item on the right
      </p>
      <div className="space-y-2">
        {content.pairs.map((pair, i) => {
          const selected = selections[pair.left] ?? '';
          const isCorrect = submitted && selected === pair.right;
          const isWrong = submitted && selected !== '' && selected !== pair.right;

          return (
            <div key={i} className="flex items-center gap-3">
              <span
                className={cn(
                  'flex-1 text-sm font-medium text-foreground p-2 rounded border',
                  isCorrect && 'border-green-500 bg-green-50',
                  isWrong && 'border-red-400 bg-red-50',
                  !submitted && 'border-border'
                )}
              >
                {pair.left}
              </span>
              <span className="text-muted-foreground">→</span>
              <select
                value={selected}
                disabled={submitted}
                onChange={(e) => {
                  handleSelect(pair.left, e.target.value);
                }}
                aria-label={`Match for: ${pair.left}`}
                className={cn(
                  'flex-1 text-sm p-2 rounded border bg-background text-foreground',
                  'focus:outline-none focus:ring-1 focus:ring-synapse-400',
                  isCorrect && 'border-green-500 bg-green-50 text-green-800',
                  isWrong && 'border-red-400 bg-red-50 text-red-700',
                  !submitted && 'border-border'
                )}
              >
                <option value="">— select —</option>
                {shuffledRight.map((right, j) => (
                  <option key={j} value={right}>
                    {right}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
      {!submitted && (
        <Button
          size="sm"
          disabled={!allSelected}
          onClick={handleCheck}
          aria-label="Check matching answers"
        >
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
      {submitted && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Correct pairs
          </p>
          <ul className="space-y-1">
            {content.pairs.map((pair, i) => (
              <li key={i} className="text-sm text-green-700">
                {pair.left} → {pair.right}
              </li>
            ))}
          </ul>
        </div>
      )}
      {content.explanation !== undefined && content.explanation !== '' && (
        <p className="text-sm text-muted-foreground">{content.explanation}</p>
      )}
    </CardShell>
  );
}
