'use client';

import Link from 'next/link';
import { useOntologyImportRuns, useOntologyImportSources } from '@noema/api-client';
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  MetricTile,
} from '@noema/ui';
import { AlertCircle, DatabaseBackup, GitBranchPlus, Layers3 } from 'lucide-react';
import { OntologyImportCreateRunCard } from '@/components/ckg/ontology-imports/create-run-card';
import { OntologyImportsHero } from '@/components/ckg/ontology-imports/imports-hero';
import {
  ontologyImportRunsPlaceholder,
  ontologyImportSourcesPlaceholder,
} from '@/components/ckg/ontology-imports/placeholder-data';

export default function OntologyImportsPage(): React.JSX.Element {
  const {
    data: liveSources = [],
    isLoading: sourcesLoading,
    isError: sourcesError,
  } = useOntologyImportSources();
  const {
    data: liveRuns = [],
    isLoading: runsLoading,
    isError: runsError,
  } = useOntologyImportRuns();

  const sources = liveSources.length > 0 ? liveSources : ontologyImportSourcesPlaceholder;
  const runs = liveRuns.length > 0 ? liveRuns : ontologyImportRunsPlaceholder;
  const readyForNormalization = runs.filter(
    (run) => run.status === 'ready_for_normalization'
  ).length;
  const isLoading = sourcesLoading || runsLoading;
  const isFallback = liveSources.length === 0 && liveRuns.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Ontology Imports</h1>
          <p className="mt-1 text-muted-foreground">
            Admin workflow for source registration, import runs, provenance, and normalization
            handoff.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/ckg">Back to CKG workspace</Link>
        </Button>
      </div>

      {(sourcesError || runsError) && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            The live ontology-import API is not ready yet, so this page is showing the seeded pilot
            dataset instead of failing closed.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <MetricTile
          label="Pilot Sources"
          value={sources.length}
          icon={<Layers3 className="h-4 w-4" />}
          colorFamily="synapse"
        />
        <MetricTile
          label="Visible Runs"
          value={runs.length}
          icon={<DatabaseBackup className="h-4 w-4" />}
          colorFamily="dendrite"
        />
        <MetricTile
          label="Ready for normalization"
          value={readyForNormalization}
          icon={<GitBranchPlus className="h-4 w-4" />}
          colorFamily={readyForNormalization > 0 ? 'axon' : 'cortex'}
        />
      </div>

      <OntologyImportsHero />
      <OntologyImportCreateRunCard sources={sources} />

      <Card>
        <CardHeader>
          <CardTitle>Operational status</CardTitle>
          <CardDescription>Where the import pipeline stands today.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            - Source registration and import-run persistence are now wired into the knowledge graph
            service.
          </p>
          <p>
            - YAGO, ESCO, and ConceptNet fetch/parse/normalize stages are live, including mutation
            preview generation.
          </p>
          <p>
            - Use the create-run form to pick a source version and mode first, then submit the
            queued run into execution from its detail page.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Recent import runs</CardTitle>
              <CardDescription>
                {isLoading
                  ? 'Loading live import runs…'
                  : isFallback
                    ? 'Showing seeded pilot runs while the API warms up.'
                    : 'Live run data from the knowledge graph service.'}
              </CardDescription>
            </div>
            <Button asChild variant="outline">
              <Link href="/dashboard/ckg/imports/sources">Open source catalog</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {runs.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
              No ontology import runs exist yet. Create the first YAGO, ESCO, or ConceptNet run once
              source-specific fetchers land in Batch 3.
            </div>
          ) : (
            runs.slice(0, 6).map((run) => (
              <div
                key={run.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/20 p-4"
              >
                <div className="space-y-1">
                  <p className="font-medium text-foreground">{run.sourceName}</p>
                  <p className="text-sm text-muted-foreground">
                    {run.id} · {run.status.replaceAll('_', ' ')} ·{' '}
                    {run.sourceVersion ?? 'release pending'}
                  </p>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/dashboard/ckg/imports/runs/${run.id}`}>Inspect run</Link>
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
