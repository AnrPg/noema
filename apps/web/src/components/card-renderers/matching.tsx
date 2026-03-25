'use client';

/**
 * @noema/web - Card Renderers
 * MatchingRenderer — match left items to right items via dropdowns.
 */

import * as React from 'react';
import type { IMatchingContent } from '@noema/api-client';
import { Button, cn } from '@noema/ui';
import { CardShell } from './card-shell';
import type { ICardRendererProps } from './types';

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

  // selections maps left → index into shuffledRight (index-based to handle duplicate right values)
  const [selections, setSelections] = React.useState<Record<string, number>>(() => ({}));
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

  const allSelected = content.pairs.every((p) => selections[p.left] !== undefined);

  function handleSelect(left: string, rightIndex: number): void {
    if (submitted) return;
    setSelections((prev) => ({ ...prev, [left]: rightIndex }));
  }

  function handleCheck(): void {
    setSubmitted(true);
    // Convert index-based selections back to string map for the onAnswer callback
    const stringSelections: Record<string, string> = {};
    for (const [left, idx] of Object.entries(selections)) {
      stringSelections[left] = shuffledRight[idx] ?? '';
    }
    onAnswer?.(stringSelections);
  }

  const actionSlot = (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Match each item on the left with the correct item on the right
      </p>
      <div className="space-y-2">
        {content.pairs.map((pair, i) => {
          const selectedIndex = selections[pair.left];
          const selected = selectedIndex !== undefined ? (shuffledRight[selectedIndex] ?? '') : '';
          // Correctness: compare the selected right value (via index) to the expected right value
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
                name={`matching.${pair.left}`}
                value={selectedIndex !== undefined ? String(selectedIndex) : ''}
                disabled={submitted}
                onChange={(e) => {
                  const idx = e.target.value !== '' ? Number(e.target.value) : undefined;
                  if (idx !== undefined) handleSelect(pair.left, idx);
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
                  <option key={j} value={String(j)}>
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
