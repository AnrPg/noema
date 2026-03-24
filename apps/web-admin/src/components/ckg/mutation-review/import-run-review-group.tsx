'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@noema/ui';

interface IImportRunReviewGroupProps {
  runId: string;
  sourceId: string | null;
  mutationCount: number;
  selectedCount: number;
  readyCount: number;
  conflictCount: number;
  onToggleAll: () => void;
  children: React.ReactNode;
}

export function ImportRunReviewGroup({
  runId,
  sourceId,
  mutationCount,
  selectedCount,
  readyCount,
  conflictCount,
  onToggleAll,
  children,
}: IImportRunReviewGroupProps): React.JSX.Element {
  return (
    <div className="rounded-md border border-border bg-background/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">
            {sourceId !== null ? `${sourceId.toUpperCase()} import run` : 'Ontology import run'}
          </p>
          <p className="text-xs text-muted-foreground">
            <code className="font-mono">{runId}</code> · {mutationCount} proposal
            {mutationCount === 1 ? '' : 's'} · {selectedCount} selected · {readyCount} ready ·{' '}
            {conflictCount} conflicted
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onToggleAll}>
            {selectedCount === mutationCount ? 'Clear group' : 'Select group'}
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={`/dashboard/ckg/imports/runs/${encodeURIComponent(runId)}`}>Open run</Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href={`/dashboard/ckg/mutations?importRunId=${encodeURIComponent(runId)}`}>
              Focus group
            </Link>
          </Button>
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}
