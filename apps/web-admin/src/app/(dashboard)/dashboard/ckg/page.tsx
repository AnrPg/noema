'use client';

import Link from 'next/link';
import { useCKGEdges, useCKGMutations, useCKGNodes } from '@noema/api-client';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  MetricTile,
} from '@noema/ui';
import { ArrowRight, Database, GitPullRequest, Network, Upload } from 'lucide-react';

export default function CKGWorkspacePage(): React.JSX.Element {
  const { data: nodes = [] } = useCKGNodes();
  const { data: edges = [] } = useCKGEdges();
  const { data: pendingMutations = [] } = useCKGMutations({ state: 'pending_review' });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">CKG Workspace</h1>
          <p className="mt-1 text-muted-foreground">
            This is the admin home for canonical graph operations, even when some backend workflows
            are still being connected.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/dashboard/ckg/graph">
              Open Graph <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/ckg/mutations">Review Mutations</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/ckg/imports">Ontology Imports</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricTile
          label="Canonical Nodes"
          value={nodes.length}
          icon={<Network className="h-4 w-4" />}
          colorFamily="synapse"
        />
        <MetricTile
          label="Canonical Edges"
          value={edges.length}
          icon={<Database className="h-4 w-4" />}
          colorFamily="dendrite"
        />
        <MetricTile
          label="Pending Review"
          value={pendingMutations.length}
          icon={<GitPullRequest className="h-4 w-4" />}
          colorFamily={pendingMutations.length > 0 ? 'cortex' : 'axon'}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Browse the graph</CardTitle>
            <CardDescription>
              Inspect the canonical graph, overlays, node details, and mutation highlights.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/dashboard/ckg/graph">Go to graph browser</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Moderate mutations</CardTitle>
            <CardDescription>
              Approve, reject, request revisions, or cancel proposed canonical changes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link href="/dashboard/ckg/mutations">Open mutation pipeline</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ontology imports</CardTitle>
            <CardDescription>
              Frontend-first workspace for bulk imports, provenance tracking, and normalization
              handoff.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Pilot pages are now available for source catalog and run inspection.</p>
            <Button asChild variant="outline" className="w-full">
              <Link href="/dashboard/ckg/imports">
                <Upload className="mr-2 h-4 w-4" />
                Open import workspace
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>How the CKG is populated today</CardTitle>
          <CardDescription>Current operational model</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>- The admin graph browser is read-only and visualizes the current canonical graph.</p>
          <p>- Canonical changes flow through the mutation pipeline for human review.</p>
          <p>
            - Ontology imports now have a dedicated frontend shell while the backend pipeline is
            being connected.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
