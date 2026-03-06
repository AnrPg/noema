'use client';
/**
 * @noema/web-admin - AdminCardBrowser
 *
 * Platform-wide card browser for admin use. Lists cards with type badge,
 * label, session ID, state, difficulty, created date, and inline delete
 * with confirmation.
 */
import * as React from 'react';
import type { ICardSummaryDto } from '@noema/api-client';
import { useCards, useDeleteCard } from '@noema/api-client';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@noema/ui';
import { Trash2 } from 'lucide-react';
import Link from 'next/link';
import { formatDate, truncateId } from '@/lib/format.js';

type CardId = ICardSummaryDto['id'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_BADGE_COLORS: Record<string, string> = {
  CONCEPT_INTRO: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  BASIC_RECALL: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  CLOZE_DELETION: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  ELABORATIVE_INTERROGATION:
    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  PROCEDURAL_STEPS: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  ANALOGY_MAPPING: 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300',
  MISCONCEPTION_REFRAME: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  SPACED_CONTRAST: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300',
  CONFUSABLE_SET_DRILL: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300',
  PARTIAL_KNOWLEDGE_DECOMPOSITION:
    'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
};

const STATE_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  DRAFT: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  SUSPENDED: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  ARCHIVED: 'bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-300',
};

function typeBadgeClass(cardType: string): string {
  return (
    TYPE_BADGE_COLORS[cardType] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
  );
}

function stateBadgeClass(state: string): string {
  return STATE_COLORS[state] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
}

// ---------------------------------------------------------------------------
// Card Row
// ---------------------------------------------------------------------------

function CardRow({
  card,
  onDelete,
  deletingId,
}: {
  card: ICardSummaryDto;
  onDelete: (id: CardId, callbacks: { onSuccess: () => void; onError: () => void }) => void;
  deletingId: string | null;
}): React.JSX.Element {
  const [confirming, setConfirming] = React.useState(false);

  const createdDate = formatDate(card.createdAt);

  return (
    <div className="flex items-center gap-3 py-3">
      {/* ID */}
      <span
        className="font-mono text-xs text-muted-foreground shrink-0 w-28 truncate"
        title={card.id}
      >
        {truncateId(card.id)}
      </span>

      {/* Type badge */}
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${typeBadgeClass(card.cardType)}`}
      >
        {card.cardType}
      </span>

      {/* Label */}
      <span className="flex-1 min-w-0 truncate text-sm" title={card.label}>
        {card.label}
      </span>

      {/* Session ID */}
      <span
        className="font-mono text-xs text-muted-foreground shrink-0 w-28 truncate hidden md:block"
        title={card.sessionId}
      >
        {truncateId(card.sessionId)}
      </span>

      {/* State badge */}
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${stateBadgeClass(card.state)}`}
      >
        {card.state}
      </span>

      {/* Difficulty */}
      <span className="text-xs text-muted-foreground shrink-0 hidden lg:block w-16 text-right">
        diff {card.difficulty.toFixed(1)}
      </span>

      {/* Created date */}
      <span className="text-xs text-muted-foreground shrink-0 hidden sm:block w-20 text-right">
        {createdDate}
      </span>

      {/* Actions */}
      <div className="shrink-0 flex items-center gap-2">
        {/* View session link */}
        <Link
          href={`/dashboard/content/sessions/${card.sessionId}`}
          className="text-xs text-primary hover:underline"
        >
          View
        </Link>

        {confirming ? (
          <>
            <span className="text-xs text-destructive">Delete?</span>
            <Button
              size="sm"
              variant="destructive"
              disabled={deletingId === card.id}
              onClick={() => {
                onDelete(card.id, {
                  onSuccess: () => {
                    setConfirming(false);
                  },
                  onError: () => {
                    setConfirming(false);
                  },
                });
              }}
            >
              Yes
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setConfirming(false);
              }}
            >
              No
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              setConfirming(true);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AdminCardBrowser
// ---------------------------------------------------------------------------

export function AdminCardBrowser(): React.JSX.Element {
  const { data, isLoading, isError } = useCards({
    limit: 50,
    sortBy: 'createdAt',
    sortDir: 'desc',
  });
  const deleteCard = useDeleteCard();
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const cards = data?.data.cards ?? [];
  const total = data?.data.total ?? 0;

  const handleDelete = (
    id: CardId,
    callbacks: { onSuccess: () => void; onError: () => void }
  ): void => {
    setDeletingId(id);
    deleteCard.mutate(id, {
      onSuccess: () => {
        setDeletingId(null);
        callbacks.onSuccess();
      },
      onError: () => {
        setDeletingId(null);
        callbacks.onError();
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Card Browser</CardTitle>
        <CardDescription>
          {isLoading
            ? 'Loading…'
            : `Showing ${String(cards.length)} of ${String(total)} cards (most recent first)`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading cards…</div>
        ) : isError ? (
          <div className="py-8 text-center text-sm text-destructive">
            Failed to load cards. Please try again.
          </div>
        ) : cards.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">No cards found.</div>
        ) : (
          <>
            {/* Column headers */}
            <div className="flex items-center gap-3 pb-2 border-b text-xs font-medium text-muted-foreground">
              <span className="w-28 shrink-0">ID</span>
              <span className="shrink-0">Type</span>
              <span className="flex-1 min-w-0">Label</span>
              <span className="hidden md:block shrink-0 w-28">Session</span>
              <span className="shrink-0">State</span>
              <span className="hidden lg:block shrink-0 w-16 text-right">Diff</span>
              <span className="hidden sm:block shrink-0 w-20 text-right">Created</span>
              <span className="shrink-0">Actions</span>
            </div>
            <div className="divide-y">
              {cards.map((card) => (
                <CardRow
                  key={card.id}
                  card={card}
                  onDelete={handleDelete}
                  deletingId={deletingId}
                />
              ))}
            </div>
            {total > cards.length && (
              <p className="mt-4 text-center text-xs text-muted-foreground">
                {String(total - cards.length)} more cards not shown — limit is 50.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
