'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@noema/ui';
import { useAgentRuns, useAgentToolStats, useAgentStats } from '@noema/api-client';
import * as React from 'react';
import {
  formatCurrency,
  formatLatency,
  formatNumber,
  formatTimestamp,
} from '@/components/agents/helpers';

export default function SingleAgentPage({
  params,
}: {
  params: { agentName: string };
}): React.JSX.Element {
  const statsQuery = useAgentStats({ agentName: params.agentName });
  const runsQuery = useAgentRuns({ agentName: params.agentName, limit: 20, offset: 0 });
  const toolsQuery = useAgentToolStats({ agentName: params.agentName });
  const totals = statsQuery.data?.data.totals;
  const byUser = statsQuery.data?.data.byUser ?? [];
  const runs = runsQuery.data?.data.items ?? [];
  const tools = toolsQuery.data?.data.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{params.agentName}</h1>
        <p className="mt-1 text-muted-foreground">
          Single-agent observability, user breakdown, and tool usage.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Runs</p>
            <p className="mt-2">{formatNumber(totals?.totalRuns)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Tokens</p>
            <p className="mt-2">{formatNumber(totals?.totalTokens)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Cost</p>
            <p className="mt-2">{formatCurrency(totals?.totalCostUsd)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Avg latency</p>
            <p className="mt-2">{formatLatency(totals?.averageLatencyMs)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>User Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {byUser.map((item) => (
              <div key={item.key} className="rounded-lg border border-border px-4 py-3">
                <p className="font-mono text-sm">{item.key}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatNumber(item.runCount)} runs · {formatCurrency(item.totalCostUsd)} ·{' '}
                  {formatNumber(item.totalTokens)} tokens
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tool Usage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {tools.map((item) => (
              <div
                key={`${item.service}-${item.toolName}`}
                className="rounded-lg border border-border px-4 py-3"
              >
                <p className="text-sm font-medium">
                  {item.service} / {item.toolName}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatNumber(item.callCount)} calls · avg {formatLatency(item.averageLatencyMs)}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Runs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {runs.map((run) => (
            <Link
              key={run.runId}
              href={`/dashboard/agents/runs/${run.runId}`}
              className="flex items-center justify-between rounded-lg border border-border px-4 py-3 transition-colors hover:border-primary/40"
            >
              <div>
                <p className="text-sm font-medium">{run.userId}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {run.status} · {formatNumber(run.totalTokens)} tokens ·{' '}
                  {formatLatency(run.latencyMs)}
                </p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {run.provider ?? '—'} / {run.model ?? '—'}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                {formatTimestamp(run.createdAt)}
              </span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
