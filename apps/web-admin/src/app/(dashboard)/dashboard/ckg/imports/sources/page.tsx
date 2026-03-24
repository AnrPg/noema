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
} from '@noema/ui';
import { AlertCircle } from 'lucide-react';
import { OntologySourceCard } from '@/components/ckg/ontology-imports/source-card';
import { ontologyImportSourcesPlaceholder } from '@/components/ckg/ontology-imports/placeholder-data';

export default function OntologyImportSourcesPage(): React.JSX.Element {
  const { data: liveSources = [], isLoading, isError } = useOntologyImportSources();
  const { data: liveRuns = [] } = useOntologyImportRuns();

  const sources = liveSources.length > 0 ? liveSources : ontologyImportSourcesPlaceholder;
  const pilotRunsBySourceId = new Map(liveRuns.map((run) => [run.sourceId, run.id]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Ontology Source Catalog</h1>
          <p className="mt-1 text-muted-foreground">
            Live source registry for the first ontology-import wave: YAGO, ESCO, and ConceptNet.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/ckg/imports">Back to imports</Link>
        </Button>
      </div>

      {isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            The source catalog API is still warming up, so the admin app is showing the seeded pilot
            source list instead of a dead end.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Source registry</CardTitle>
          <CardDescription>
            {isLoading
              ? 'Loading source metadata…'
              : liveSources.length > 0
                ? 'Live source records from the ontology import registry.'
                : 'Seeded source records shown while the backend is still being populated.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 xl:grid-cols-2">
            {sources.map((source) => {
              const runId = pilotRunsBySourceId.get(source.id);

              return (
                <OntologySourceCard
                  key={source.id}
                  source={source}
                  {...(runId !== undefined ? { runId } : {})}
                />
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
