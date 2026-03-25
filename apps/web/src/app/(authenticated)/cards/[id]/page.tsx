/**
 * Card Detail Page — /cards/[id]
 *
 * View mode: renders the card using CardRenderer in interactive mode, shows
 * metadata (type, state, difficulty, tags, nodes, dates) and action buttons
 * (Edit, Delete, state transitions).
 *
 * Edit mode: raw JSON content editor plus fields for tags, knowledgeNodeIds,
 * and difficulty. Saves via useUpdateCard with optimistic locking (version).
 * Phase 10 will replace the raw JSON editor with rich type-specific editors.
 *
 * Delete flow: confirmation dialog → useDeleteCard → navigate to /cards.
 *
 * State transitions: Activate / Suspend / Archive via useCardStateTransition.
 */

'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  useCard,
  useUpdateCard,
  useDeleteCard,
  useCardStateTransition,
  contentKeys,
} from '@noema/api-client';
import type { IUpdateCardInput } from '@noema/api-client';
import type { CardId, CardState } from '@noema/types';
import { useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  Skeleton,
} from '@noema/ui';
import { ArrowLeft, Edit2, Trash2, X, Check } from 'lucide-react';
import { CardRenderer } from '@/components/card-renderers';
import { toast } from '@/hooks/use-toast';

// ============================================================================
// Helpers
// ============================================================================

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STATE_COLORS: Record<CardState, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  active: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  suspended: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  archived: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

// ============================================================================
// Page
// ============================================================================

export default function CardDetailPage(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const cardId = params.id as CardId;

  // --------------------------------------------------------------------------
  // Data fetching
  // --------------------------------------------------------------------------

  const { data: card, isLoading, isError, error } = useCard(cardId);

  // --------------------------------------------------------------------------
  // UI state
  // --------------------------------------------------------------------------

  const [isEditing, setIsEditing] = React.useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [isRevealed, setIsRevealed] = React.useState(false);

  // Edit form state — populated when entering edit mode
  const [editTags, setEditTags] = React.useState('');
  const [editNodeIds, setEditNodeIds] = React.useState('');
  const [editDifficulty, setEditDifficulty] = React.useState('');
  const [editContentJson, setEditContentJson] = React.useState('');
  const [editJsonError, setEditJsonError] = React.useState<string | null>(null);

  // --------------------------------------------------------------------------
  // Mutations
  // --------------------------------------------------------------------------

  const updateCard = useUpdateCard();
  const deleteCard = useDeleteCard();
  const cardStateTransition = useCardStateTransition();

  const isMutating = updateCard.isPending || deleteCard.isPending || cardStateTransition.isPending;

  // --------------------------------------------------------------------------
  // Enter / exit edit mode
  // --------------------------------------------------------------------------

  function handleEnterEdit(): void {
    if (card === undefined) return;
    setEditTags(card.tags.join(', '));
    setEditNodeIds(card.knowledgeNodeIds.join(', '));
    setEditDifficulty(String(card.difficulty));
    setEditContentJson(JSON.stringify(card.content, null, 2));
    setEditJsonError(null);
    setIsEditing(true);
  }

  function handleCancelEdit(): void {
    setIsEditing(false);
    setEditJsonError(null);
  }

  // --------------------------------------------------------------------------
  // Save (update)
  // --------------------------------------------------------------------------

  async function handleSave(): Promise<void> {
    if (card === undefined || isMutating) return;

    // Validate JSON
    let parsedContent: Record<string, unknown>;
    try {
      parsedContent = JSON.parse(editContentJson) as Record<string, unknown>;
    } catch (e) {
      setEditJsonError(e instanceof Error ? e.message : 'Invalid JSON');
      return;
    }

    const parsedDifficulty = parseFloat(editDifficulty);
    if (isNaN(parsedDifficulty) || parsedDifficulty < 0 || parsedDifficulty > 1) {
      toast.error('Difficulty must be a number between 0 and 1.');
      return;
    }

    const tags = editTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const knowledgeNodeIds = editNodeIds
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);

    const data: IUpdateCardInput = {
      content: parsedContent,
      tags,
      knowledgeNodeIds,
      version: card.version,
    };

    try {
      await updateCard.mutateAsync({ id: cardId, data });
      void queryClient.invalidateQueries({ queryKey: contentKeys.cards() });
      toast.success('Card updated successfully.');
      setIsEditing(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Update failed';
      if (message.toLowerCase().includes('version') || message.toLowerCase().includes('conflict')) {
        toast.error('Card was modified elsewhere. Please refresh and try again.');
      } else {
        toast.error(message);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Delete
  // --------------------------------------------------------------------------

  async function handleConfirmDelete(): Promise<void> {
    if (isMutating) return;
    try {
      await deleteCard.mutateAsync(cardId);
      void queryClient.invalidateQueries({ queryKey: contentKeys.cards() });
      toast.success('Card deleted.');
      router.push('/cards');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Delete failed';
      toast.error(message);
      setShowDeleteConfirm(false);
    }
  }

  // --------------------------------------------------------------------------
  // State transitions
  // --------------------------------------------------------------------------

  function handleStateTransition(state: CardState): void {
    if (isMutating) return;
    cardStateTransition.mutate(
      { id: cardId, data: { state } },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: contentKeys.cards() });
          toast.success(`Card ${state.toLowerCase()}.`);
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : 'State change failed');
        },
      }
    );
  }

  // --------------------------------------------------------------------------
  // Loading state
  // --------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton variant="rect" className="h-9 w-24" />
          <Skeleton variant="text" className="h-8 w-64" />
        </div>
        <Skeleton variant="rect" className="h-64 w-full rounded-xl" />
        <Skeleton variant="rect" className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Error / not found state
  // --------------------------------------------------------------------------

  if (isError || card === undefined) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          onClick={() => {
            router.push('/cards');
          }}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to cards
        </Button>
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-6 text-center text-sm text-destructive"
        >
          {error instanceof Error ? error.message : 'Card not found.'}
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Delete confirmation dialog
  // --------------------------------------------------------------------------

  if (showDeleteConfirm) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          onClick={() => {
            setShowDeleteConfirm(false);
          }}
          disabled={isMutating}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Cancel
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Delete Card</CardTitle>
            <CardDescription>
              This action is permanent and cannot be undone. The card and all its review history
              will be removed.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex gap-2">
            <Button
              variant="destructive"
              disabled={isMutating}
              onClick={() => {
                void handleConfirmDelete();
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {deleteCard.isPending ? 'Deleting…' : 'Confirm Delete'}
            </Button>
            <Button
              variant="outline"
              disabled={isMutating}
              onClick={() => {
                setShowDeleteConfirm(false);
              }}
            >
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Edit mode
  // --------------------------------------------------------------------------

  if (isEditing) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" disabled={isMutating} onClick={handleCancelEdit}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Cancel
          </Button>
          <h1 className="text-2xl font-bold">Edit Card</h1>
        </div>

        {/* Content JSON editor */}
        <Card>
          <CardHeader>
            <CardTitle>Content</CardTitle>
            <CardDescription>
              Raw JSON for card content. Phase 10 will replace this with a rich editor.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <textarea
              name="editContentJson"
              aria-label="Card content JSON"
              value={editContentJson}
              onChange={(e) => {
                setEditContentJson(e.target.value);
                setEditJsonError(null);
              }}
              rows={16}
              className={[
                'font-mono w-full rounded-md border bg-background px-3 py-2 text-sm',
                'ring-offset-background placeholder:text-muted-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50',
                editJsonError !== null ? 'border-destructive' : 'border-input',
              ].join(' ')}
              disabled={isMutating}
              spellCheck={false}
            />
            {editJsonError !== null && (
              <p className="mt-1.5 text-xs text-destructive">{editJsonError}</p>
            )}
          </CardContent>
        </Card>

        {/* Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField label="Tags" description="Comma-separated list of tags">
              <Input
                value={editTags}
                onChange={(e) => {
                  setEditTags(e.target.value);
                }}
                placeholder="e.g. biology, chapter-3, high-yield"
                disabled={isMutating}
              />
            </FormField>

            <FormField
              label="Knowledge Node IDs"
              description="Comma-separated list of knowledge node IDs"
            >
              <Input
                value={editNodeIds}
                onChange={(e) => {
                  setEditNodeIds(e.target.value);
                }}
                placeholder="e.g. node-abc, node-xyz"
                disabled={isMutating}
              />
            </FormField>

            <FormField
              label="Difficulty"
              description="A number between 0 (easiest) and 1 (hardest)"
            >
              <Input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={editDifficulty}
                onChange={(e) => {
                  setEditDifficulty(e.target.value);
                }}
                disabled={isMutating}
              />
            </FormField>
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button
              disabled={isMutating || editJsonError !== null}
              onClick={() => {
                void handleSave();
              }}
            >
              <Check className="mr-2 h-4 w-4" />
              {updateCard.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
            <Button variant="outline" disabled={isMutating} onClick={handleCancelEdit}>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // View mode
  // --------------------------------------------------------------------------

  const stateColor = STATE_COLORS[card.state];

  return (
    <div className="space-y-6">
      {/* Back + header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={() => {
              router.push('/cards');
            }}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Cards
          </Button>
          <div>
            <h1 className="text-2xl font-bold leading-tight">Card Detail</h1>
            <p className="text-xs text-muted-foreground font-mono">{String(card.id)}</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* State transitions */}
          {card.state !== 'active' && (
            <Button
              variant="outline"
              size="sm"
              disabled={isMutating}
              onClick={() => {
                handleStateTransition('active');
              }}
            >
              Activate
            </Button>
          )}
          {card.state !== 'suspended' && (
            <Button
              variant="outline"
              size="sm"
              disabled={isMutating}
              onClick={() => {
                handleStateTransition('suspended');
              }}
            >
              Suspend
            </Button>
          )}
          {card.state !== 'archived' && (
            <Button
              variant="outline"
              size="sm"
              disabled={isMutating}
              onClick={() => {
                handleStateTransition('archived');
              }}
            >
              Archive
            </Button>
          )}

          {/* Edit */}
          <Button variant="outline" size="sm" disabled={isMutating} onClick={handleEnterEdit}>
            <Edit2 className="mr-2 h-4 w-4" />
            Edit
          </Button>

          {/* Delete */}
          <Button
            variant="destructive"
            size="sm"
            disabled={isMutating}
            onClick={() => {
              setShowDeleteConfirm(true);
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Card renderer */}
      <CardRenderer
        card={card}
        mode="interactive"
        isRevealed={isRevealed}
        onReveal={() => {
          setIsRevealed(true);
        }}
        onAnswer={() => {
          setIsRevealed(false);
        }}
      />

      {/* Metadata */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Card info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Card Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {/* Type badge */}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Type</span>
              <span className="rounded-full border px-2 py-0.5 text-xs font-medium font-mono">
                {card.cardType}
              </span>
            </div>

            {/* State badge */}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">State</span>
              <span
                className={['rounded-full px-2 py-0.5 text-xs font-medium', stateColor].join(' ')}
              >
                {card.state}
              </span>
            </div>

            {/* Difficulty */}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Difficulty</span>
              <span className="font-medium">{formatCardDifficulty(card.difficulty)}</span>
            </div>

            {/* Version */}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Version</span>
              <span className="font-medium">{String(card.version)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Dates */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Timestamps</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Created</span>
              <span className="font-medium text-right">{formatDate(card.createdAt)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Updated</span>
              <span className="font-medium text-right">{formatDate(card.updatedAt)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tags */}
      {card.tags.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tags</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {card.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Knowledge nodes */}
      {card.knowledgeNodeIds.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Knowledge Nodes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {card.knowledgeNodeIds.map((nodeId) => (
                // Links to knowledge graph with nodeId query param — the graph page
                // will auto-select this node. A dedicated /knowledge/[nodeId] detail
                // page is planned for a future phase.
                <a
                  key={nodeId}
                  href={`/knowledge?nodeId=${nodeId}`}
                  className="rounded-full border px-3 py-1 text-xs font-mono text-foreground hover:bg-muted transition-colors"
                >
                  {nodeId}
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function formatCardDifficulty(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toFixed(2);
  }

  if (typeof value === 'string' && value.trim() !== '') {
    return value.replace(/_/g, ' ');
  }

  return '—';
}
