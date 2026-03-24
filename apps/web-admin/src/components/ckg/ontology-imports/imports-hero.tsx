'use client';

import Link from 'next/link';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@noema/ui';
import { ArrowRight, DatabaseBackup, FlaskConical, ScrollText } from 'lucide-react';

export function OntologyImportsHero(): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ontology imports</CardTitle>
        <CardDescription>
          Frontend-first control surface for bulk imports, staging, normalization handoff, and
          canonical review.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-md border border-border bg-muted/30 p-4">
            <DatabaseBackup className="h-5 w-5 text-primary" />
            <p className="mt-3 font-medium">Raw artifacts first</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Every run stores immutable upstream payload metadata before anything is normalized.
            </p>
          </div>
          <div className="rounded-md border border-border bg-muted/30 p-4">
            <FlaskConical className="h-5 w-5 text-primary" />
            <p className="mt-3 font-medium">Normalization is live</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Import runs now progress through fetch, parse, normalization, and mutation-preview
              generation before any canonical review submission happens.
            </p>
          </div>
          <div className="rounded-md border border-border bg-muted/30 p-4">
            <ScrollText className="h-5 w-5 text-primary" />
            <p className="mt-3 font-medium">Mutation review stays central</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Normalized ontology output will become reviewable CKG mutations, not direct writes.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/dashboard/ckg/imports/sources">
              Browse pilot sources <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/ckg/imports/runs/run_yago_seed_001">Open example run</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
