'use client';

import Link from 'next/link';
import * as React from 'react';
import { useAuth } from '@noema/auth';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@noema/ui';
import { AgentActionButton } from '@/features/agents';
import { useActiveStudyMode } from '@/hooks/use-active-study-mode';

export default function ContentReviewQueuePage(): React.JSX.Element {
  const { user } = useAuth();
  const activeStudyMode = useActiveStudyMode();
  const [focus, setFocus] = React.useState('');
  const conceptIds = focus
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const context = {
    userId: user?.id ?? '',
    conceptIds,
    studyMode: activeStudyMode,
    payload: {
      surface: 'content-review',
      reviewState: 'pending_review',
    },
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Content review</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Review generated cards and repairs before they become eligible for sessions.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/content/jobs">Generation jobs</Link>
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Repair or extend a draft</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <label className="grid gap-2 text-sm font-medium text-foreground">
            Review focus
            <input
              className="rounded-md border border-border bg-background px-3 py-2 font-normal text-foreground"
              value={focus}
              placeholder="Concepts or draft identifiers"
              onChange={(event) => {
                setFocus(event.target.value);
              }}
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <AgentActionButton
              agentName="patch-planner-remediation-agent"
              context={context}
              label="Suggest repair"
            />
            <AgentActionButton
              agentName="content-creation-orchestrator"
              context={context}
              label="Regenerate safely"
            />
          </div>
        </CardContent>
      </Card>

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="text-sm font-medium text-foreground">Pending review</div>
        <p className="mt-2 text-sm text-muted-foreground">
          Generated content remains out of session selection until accepted. Guardian results,
          repair rationale, and provenance should appear beside each draft once service data is
          connected.
        </p>
      </section>
    </main>
  );
}
