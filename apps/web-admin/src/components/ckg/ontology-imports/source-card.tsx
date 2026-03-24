'use client';

import Link from 'next/link';
import type { IOntologyImportSourceDto } from '@noema/api-client';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@noema/ui';

function pillClassName(
  value: 'backbone' | 'enhancement' | 'snapshot' | 'api' | 'linked_data' | 'hybrid'
): string {
  if (value === 'backbone') return 'bg-blue-500/15 text-blue-300 border-blue-400/30';
  if (value === 'enhancement') return 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30';
  if (value === 'snapshot') return 'bg-violet-500/15 text-violet-300 border-violet-400/30';
  if (value === 'api') return 'bg-cyan-500/15 text-cyan-300 border-cyan-400/30';
  if (value === 'linked_data') return 'bg-amber-500/15 text-amber-300 border-amber-400/30';
  return 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-400/30';
}

export function OntologySourceCard({
  source,
  runId,
}: {
  source: IOntologyImportSourceDto;
  runId?: string;
}): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>{source.name}</CardTitle>
            <CardDescription className="mt-1">{source.description}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className={`rounded-full border px-2 py-1 ${pillClassName(source.role)}`}>
              {source.role}
            </span>
            <span className={`rounded-full border px-2 py-1 ${pillClassName(source.accessMode)}`}>
              {source.accessMode.replace('_', ' ')}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <div className="grid gap-2 md:grid-cols-2">
          <p>Supports incremental sync: {source.supportsIncremental ? 'Yes' : 'No'}</p>
          <p>Languages: {source.supportedLanguages.join(', ')}</p>
          <p>Latest release: {source.latestRelease?.version ?? 'Not registered yet'}</p>
          <p>Status: {source.enabled ? 'Enabled for pilot' : 'Disabled'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/dashboard/ckg/imports">Create run</Link>
          </Button>
          {runId !== undefined && (
            <Button asChild size="sm" variant="outline">
              <Link href={`/dashboard/ckg/imports/runs/${runId}`}>View latest run</Link>
            </Button>
          )}
          {source.homepageUrl !== null && (
            <Button asChild size="sm" variant="ghost">
              <a href={source.homepageUrl} target="_blank" rel="noreferrer">
                Source site
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
