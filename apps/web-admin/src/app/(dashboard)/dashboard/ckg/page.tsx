'use client';

import * as React from 'react';
import Link from 'next/link';
import { useCKGEdges, useCKGMutations, useCKGNodes, useResetCKG } from '@noema/api-client/knowledge-graph';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  MetricTile,
  Separator,
} from '@noema/ui';
import { ArrowRight, Database, GitPullRequest, Network, Upload } from 'lucide-react';

const RESET_CONFIRMATION = 'DELETE_ALL_CKG_CONTENTS';

export default function CKGWorkspacePage(): React.JSX.Element {
  const { data: nodes = [] } = useCKGNodes();
  const { data: edges = [] } = useCKGEdges();
  const { data: pendingMutations = [] } = useCKGMutations({ state: 'pending_review' });
  const [showDangerZone, setShowDangerZone] = React.useState(false);
  const [confirmationInput, setConfirmationInput] = React.useState('');
  const [includeSources, setIncludeSources] = React.useState(false);
  const [resetFeedback, setResetFeedback] = React.useState<{
    tone: 'success' | 'error';
    message: string;
  } | null>(null);

  const resetCkg = useResetCKG({
    onSuccess: (response) => {
      setResetFeedback({
        tone: 'success',
        message: `Reset complete. Deleted ${String(response.data.deletedNeo4jCkgNodes)} Neo4j nodes and truncated ${String(response.data.truncatedTables.length)} PostgreSQL tables.`,
      });
      setConfirmationInput('');
      setShowDangerZone(false);
    },
    onError: (error) => {
      setResetFeedback({
        tone: 'error',
        message: error.message,
      });
    },
  });

  const canReset =
    confirmationInput === RESET_CONFIRMATION && resetCkg.isPending === false;

  const handleReset = (): void => {
    setResetFeedback(null);
    resetCkg.mutate({
      confirmation: RESET_CONFIRMATION,
      includeSources,
    });
  };

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
            <Link href="/dashboard/ckg/imports/runs">Ontology Imports</Link>
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
              <Link href="/dashboard/ckg/imports/runs">
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

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle>Danger Zone</CardTitle>
          <CardDescription>
            Hidden by default because this action permanently deletes the canonical graph contents.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {resetFeedback !== null && (
            <div
              role="alert"
              className={
                resetFeedback.tone === 'error'
                  ? 'rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive'
                  : 'rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300'
              }
            >
              {resetFeedback.message}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-destructive">Delete all graph contents</p>
              <p className="text-xs text-muted-foreground">
                This clears CKG workflow tables, canonical Neo4j nodes, related cache entries, and
                ontology import artifacts.
              </p>
            </div>
            <Button
              variant={showDangerZone ? 'outline' : 'destructive'}
              onClick={() => {
                setShowDangerZone((current) => !current);
                setResetFeedback(null);
                setConfirmationInput('');
              }}
            >
              {showDangerZone ? 'Hide danger zone' : 'Show danger zone'}
            </Button>
          </div>

          {showDangerZone && (
            <>
              <Separator />
              <div className="space-y-4 rounded-md border border-destructive/40 bg-destructive/5 p-4">
                <p className="text-sm text-muted-foreground">
                  Type <span className="font-mono font-semibold">{RESET_CONFIRMATION}</span> to
                  confirm the reset.
                </p>

                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={includeSources}
                    onChange={(event) => {
                      setIncludeSources(event.target.checked);
                    }}
                    className="mt-0.5 h-4 w-4 rounded border-input"
                  />
                  <span className="text-muted-foreground">
                    Also delete registered ontology import sources. Leave this off to keep the
                    source catalog while wiping graph contents.
                  </span>
                </label>

                <Input
                  value={confirmationInput}
                  onChange={(event) => {
                    setConfirmationInput(event.target.value);
                  }}
                  placeholder={RESET_CONFIRMATION}
                  className="max-w-md"
                />

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="destructive"
                    disabled={canReset === false}
                    onClick={handleReset}
                  >
                    {resetCkg.isPending ? 'Deleting...' : 'Delete all CKG contents'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowDangerZone(false);
                      setConfirmationInput('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
