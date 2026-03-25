'use client';

import * as React from 'react';
import { Button, Card, CardContent } from '@noema/ui';
import type { CkgBulkReviewAction } from '@noema/api-client';

interface IBulkReviewToolbarProps {
  selectedCount: number;
  visibleCount: number;
  importRunId: string | null;
  isPending: boolean;
  onSelectAllVisible: () => void;
  onSelectReadyOnly: () => void;
  onSelectConflictedOnly: () => void;
  onClearSelection: () => void;
  onSubmit: (action: CkgBulkReviewAction, note: string) => void;
  onApproveReadyOnly: (note: string) => void;
  onRejectConflictedOnly: (note: string) => void;
}

export function BulkReviewToolbar({
  selectedCount,
  visibleCount,
  importRunId,
  isPending,
  onSelectAllVisible,
  onSelectReadyOnly,
  onSelectConflictedOnly,
  onClearSelection,
  onSubmit,
  onApproveReadyOnly,
  onRejectConflictedOnly,
}: IBulkReviewToolbarProps): React.JSX.Element {
  const [note, setNote] = React.useState(
    importRunId !== null
      ? `Reviewed as part of ontology import run ${importRunId}.`
      : 'Reviewed from the ontology import mutation queue.'
  );

  React.useEffect(() => {
    setNote(
      importRunId !== null
        ? `Reviewed as part of ontology import run ${importRunId}.`
        : 'Reviewed from the ontology import mutation queue.'
    );
  }, [importRunId]);

  return (
    <Card className="border-violet-500/20 bg-violet-500/5">
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">
              Bulk review ontology import proposals
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {selectedCount} selected out of {visibleCount} visible proposal
              {visibleCount === 1 ? '' : 's'}
              {importRunId !== null ? ` in import run ${importRunId}` : ''}.
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onSelectAllVisible}>
              Select visible
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onSelectReadyOnly}>
              Select ready only
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onSelectConflictedOnly}>
              Select conflicted only
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onClearSelection}>
              Clear
            </Button>
          </div>
        </div>

        <textarea
          name="bulkReviewNote"
          className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
          }}
          placeholder="Add a reviewer note for this bulk action..."
        />

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={note.trim() === '' || isPending}
            onClick={() => {
              onApproveReadyOnly(note);
            }}
          >
            {isPending ? 'Applying…' : 'Approve ready only'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={note.trim() === '' || isPending}
            onClick={() => {
              onRejectConflictedOnly(note);
            }}
          >
            {isPending ? 'Applying…' : 'Reject conflicted only'}
          </Button>
          <Button
            type="button"
            disabled={selectedCount === 0 || note.trim() === '' || isPending}
            onClick={() => {
              onSubmit('approve', note);
            }}
          >
            {isPending ? 'Applying…' : 'Bulk approve'}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={selectedCount === 0 || note.trim() === '' || isPending}
            onClick={() => {
              onSubmit('reject', note);
            }}
          >
            {isPending ? 'Applying…' : 'Bulk reject'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={selectedCount === 0 || note.trim() === '' || isPending}
            onClick={() => {
              onSubmit('request_revision', note);
            }}
          >
            {isPending ? 'Applying…' : 'Request revision'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
