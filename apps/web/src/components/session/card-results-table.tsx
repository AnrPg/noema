'use client';

/**
 * @noema/web - Session / CardResultsTable
 *
 * Scrollable table showing every attempt recorded in a session.
 * Columns: Card (link), Grade, Confidence delta, Hints, Dwell time.
 */

import * as React from 'react';
import { contentKeys } from '@noema/api-client/content';
import type { CardId } from '@noema/types';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';

import type { ICardDto } from '@noema/api-client/content';

// ============================================================================
// Types
// ============================================================================

interface IAttemptRow {
  id: string;
  cardId: string;
  grade: number;
  confidenceBefore: number | null;
  confidenceAfter: number | null;
  hintDepthUsed: number;
  dwellTimeMs: number;
  reviewedAt: string;
}

interface ICardResultsTableProps {
  attempts: IAttemptRow[];
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '…';
}

function guessCardLabel(card: ICardDto): string {
  const metadata = card.metadata;
  const content = card.content;
  const candidates: (string | undefined)[] = [
    content['front'] as string | undefined,
    content['question'] as string | undefined,
    content['scenario'] as string | undefined,
    content['prompt'] as string | undefined,
    content['title'] as string | undefined,
    content['description'] as string | undefined,
    metadata['title'] as string | undefined,
    metadata['description'] as string | undefined,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() !== '') {
      return candidate.trim();
    }
  }

  return card.id;
}

function CardQuestionLink({
  cardId,
  fallbackLabel,
}: {
  cardId: CardId;
  fallbackLabel: string;
}): React.JSX.Element {
  const queryClient = useQueryClient();
  const cachedCard = queryClient.getQueryData<ICardDto>(contentKeys.detail(cardId));
  const label = React.useMemo(
    () => (cachedCard !== undefined ? guessCardLabel(cachedCard) : fallbackLabel),
    [cachedCard, fallbackLabel]
  );

  return (
    <Link
      href={`/cards/${cardId}`}
      className="text-synapse-400 underline-offset-2 hover:underline"
      title={label}
    >
      {truncateText(label, 64)}
    </Link>
  );
}

// ============================================================================
// Helpers
// ============================================================================

/** Grade metadata: label text and Tailwind color classes. */
const GRADE_META: Record<number, { label: string; classes: string }> = {
  1: { label: 'Again', classes: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' },
  2: {
    label: 'Hard',
    classes: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  },
  3: {
    label: 'Good',
    classes: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  },
  4: { label: 'Easy', classes: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' },
};

const FALLBACK_GRADE = { label: '—', classes: 'bg-muted text-muted-foreground' };

function GradeLabel({ grade }: { grade: number }): React.JSX.Element {
  const meta = GRADE_META[grade] ?? FALLBACK_GRADE;
  return (
    <span
      className={
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ' + meta.classes
      }
    >
      {meta.label}
    </span>
  );
}

/**
 * Formats a confidence value (0–1 float) as a percentage string.
 * Returns "—" when the value is null.
 */
function formatConfidence(value: number | null): string {
  if (value === null) return '—';
  return `${String(Math.round(value * 100))}%`;
}

function describeConfidenceChange(
  confidenceBefore: number | null,
  confidenceAfter: number | null
): string {
  if (confidenceBefore === null && confidenceAfter === null) {
    return 'Not rated';
  }

  if (confidenceBefore !== null && confidenceAfter !== null) {
    const before = formatConfidence(confidenceBefore);
    const after = formatConfidence(confidenceAfter);
    return before === after ? `Stayed at ${before}` : `${before} -> ${after}`;
  }

  if (confidenceBefore !== null) {
    return `Started at ${formatConfidence(confidenceBefore)}`;
  }

  return `Ended at ${formatConfidence(confidenceAfter)}`;
}

/**
 * Formats dwell time in milliseconds as a human-readable string.
 * e.g. 75_000 → "1m 15s", 45_000 → "45s"
 */
function formatDwell(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${String(totalSeconds)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (seconds === 0) return `${String(minutes)}m`;
  return `${String(minutes)}m ${String(seconds)}s`;
}

function formatReviewedAt(isoString: string): string {
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown time';
  }

  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ============================================================================
// CardResultsTable
// ============================================================================

export function CardResultsTable({ attempts }: ICardResultsTableProps): React.JSX.Element {
  const cardOrderById = React.useMemo(() => {
    const order = new Map<string, number>();

    for (const attempt of attempts) {
      if (!order.has(attempt.cardId)) {
        order.set(attempt.cardId, order.size + 1);
      }
    }

    return order;
  }, [attempts]);

  if (attempts.length === 0) {
    return (
      <div className="flex min-h-[120px] items-center justify-center rounded-lg border border-border bg-muted/30 text-sm text-muted-foreground">
        No attempts recorded.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2">Card</th>
            <th className="px-4 py-2">Grade</th>
            <th className="px-4 py-2">Confidence</th>
            <th className="px-4 py-2">Hints</th>
            <th className="px-4 py-2">Dwell</th>
            <th className="px-4 py-2">Reviewed</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {attempts.map((attempt) => {
            const confidenceDisplay = describeConfidenceChange(
              attempt.confidenceBefore,
              attempt.confidenceAfter
            );
            const fallbackLabel = `Card ${String(cardOrderById.get(attempt.cardId) ?? 1)}`;

            return (
              <tr key={attempt.id} className="bg-background transition-colors hover:bg-muted/30">
                <td className="px-4 py-2 font-medium text-sm">
                  <CardQuestionLink
                    cardId={attempt.cardId as CardId}
                    fallbackLabel={fallbackLabel}
                  />
                </td>
                <td className="px-4 py-2">
                  <GradeLabel grade={attempt.grade} />
                </td>
                <td className="px-4 py-2 tabular-nums text-muted-foreground">
                  {confidenceDisplay}
                </td>
                <td className="px-4 py-2 tabular-nums text-muted-foreground">
                  {String(attempt.hintDepthUsed)}
                </td>
                <td className="px-4 py-2 tabular-nums text-muted-foreground">
                  {formatDwell(attempt.dwellTimeMs)}
                </td>
                <td className="px-4 py-2 tabular-nums text-muted-foreground">
                  {formatReviewedAt(attempt.reviewedAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
