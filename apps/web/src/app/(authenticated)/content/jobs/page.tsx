'use client';

import Link from 'next/link';
import * as React from 'react';
import { useAuth } from '@noema/auth';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@noema/ui';
import { AgentActionButton } from '@/features/agents';
import { useActiveStudyMode } from '@/hooks/use-active-study-mode';

export default function ContentGenerationJobsPage(): React.JSX.Element {
  const { user } = useAuth();
  const activeStudyMode = useActiveStudyMode();
  const [concepts, setConcepts] = React.useState('');
  const conceptIds = concepts
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const context = {
    userId: user?.id ?? '',
    conceptIds,
    studyMode: activeStudyMode,
    payload: {
      surface: 'content-jobs',
      budget: { maxDrafts: 4 },
      reviewState: 'pending_review',
    },
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Generation jobs</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Start and track async content work when a concept needs more practice material.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/content/review">Review drafts</Link>
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Generate from a learning need</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <label className="grid gap-2 text-sm font-medium text-foreground">
            Concepts
            <input
              className="rounded-md border border-border bg-background px-3 py-2 font-normal text-foreground"
              value={concepts}
              placeholder="Bayes theorem, prior probability"
              onChange={(event) => {
                setConcepts(event.target.value);
              }}
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <AgentActionButton
              agentName="content-creation-orchestrator"
              context={context}
              label="Prepare draft"
            />
            <AgentActionButton
              agentName="content-creator-agent"
              context={context}
              label="Queue generation"
              executionPreference="batch"
            />
          </div>
        </CardContent>
      </Card>

      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b border-border bg-muted/30 px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Recent jobs</h2>
        </div>
        <div className="px-4 py-8 text-sm text-muted-foreground">
          Jobs started from this page surface in the agent popup first, then move into the review
          queue when the owning service accepts their drafts.
        </div>
      </section>
    </main>
  );
}
