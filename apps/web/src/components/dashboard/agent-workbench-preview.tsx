'use client';

import Link from 'next/link';
import { useAgents } from '@noema/api-client/agents';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@noema/ui';
import { ArrowRight, Bot, ShieldCheck } from 'lucide-react';

export function AgentWorkbenchPreview(): React.JSX.Element {
  const agentsQuery = useAgents();
  const agents = agentsQuery.data?.data.agents ?? [];
  const reviewedAgents = agents.filter((agent) => agent.toolBelt.reviewedWriteByDefault).length;
  const readOnlyAgents = agents.filter((agent) => agent.executionMode === 'preview').length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-sm">Agent Workbench</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Wrapper discovery, preflight routing, and review-aware execution.
          </p>
        </div>
        <Bot className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </CardHeader>
      <CardContent className="space-y-4">
        {agentsQuery.isLoading ? (
          <p className="text-xs text-muted-foreground">Loading agent runtime inventory…</p>
        ) : agentsQuery.isError ? (
          <p className="text-xs text-destructive">
            The agent runtime is unavailable right now. The workbench will retry when opened.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Wrappers
                </p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{agents.length}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Read-only
                </p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{readOnlyAgents}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Reviewed
                </p>
                <p className="mt-2 flex items-center gap-2 text-2xl font-semibold text-foreground">
                  <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                  {reviewedAgents}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {agents.slice(0, 3).map((agent) => (
                <div
                  key={agent.name}
                  className="flex items-start justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{agent.name}</p>
                    <p className="text-xs text-muted-foreground">{agent.purpose}</p>
                  </div>
                  <span className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {agent.executionMode.replaceAll('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
        <Button asChild variant="outline" className="w-full justify-between">
          <Link href="/agents">
            Open workbench
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
