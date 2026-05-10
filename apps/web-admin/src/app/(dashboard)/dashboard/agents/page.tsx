'use client';

import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  MetricTile,
} from '@noema/ui';
import { useAgentStats, useAgentToolStats } from '@noema/api-client';
import * as React from 'react';
import { Bot, DollarSign, Gauge, Wrench } from 'lucide-react';
import { formatCurrency, formatLatency, formatNumber } from '@/components/agents/helpers';
import { getRequestErrorDetails } from '@/lib/api-error';

export default function AgentOverviewPage(): React.JSX.Element {
  const [agentName, setAgentName] = React.useState('');
  const [userId, setUserId] = React.useState('');
  const filters = {
    ...(agentName !== '' ? { agentName } : {}),
    ...(userId !== '' ? { userId } : {}),
  };

  const statsQuery = useAgentStats(filters);
  const toolStatsQuery = useAgentToolStats(filters);

  const totals = statsQuery.data?.data.totals;
  const byAgent = statsQuery.data?.data.byAgent ?? [];
  const toolItems = toolStatsQuery.data?.data.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Agents</h1>
        <p className="mt-1 text-muted-foreground">
          Observe agent activity, cost, latency, and tool behavior across users and workflows.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Slice telemetry by agent or user.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Input
            placeholder="Filter by agent name"
            value={agentName}
            onChange={(event) => {
              setAgentName(event.target.value);
            }}
          />
          <Input
            placeholder="Filter by user id"
            value={userId}
            onChange={(event) => {
              setUserId(event.target.value);
            }}
          />
        </CardContent>
      </Card>

      {statsQuery.isError && (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            {getRequestErrorDetails(statsQuery.error, 'agent telemetry', 'agents runtime').title}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Total Runs"
          value={formatNumber(totals?.totalRuns)}
          icon={<Bot className="h-4 w-4" />}
          colorFamily="synapse"
        />
        <MetricTile
          label="Total Tokens"
          value={formatNumber(totals?.totalTokens)}
          icon={<Wrench className="h-4 w-4" />}
          colorFamily="dendrite"
        />
        <MetricTile
          label="Total Cost"
          value={formatCurrency(totals?.totalCostUsd)}
          icon={<DollarSign className="h-4 w-4" />}
          colorFamily="axon"
        />
        <MetricTile
          label="Average Latency"
          value={formatLatency(totals?.averageLatencyMs)}
          icon={<Gauge className="h-4 w-4" />}
          colorFamily="cortex"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Per-Agent Breakdown</CardTitle>
          <CardDescription>Click through into one agent’s run history and configuration.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-2">
            {byAgent.map((item) => (
              <Link
                key={item.key}
                href={`/dashboard/agents/${item.key}`}
                className="rounded-lg border border-border p-4 transition-colors hover:border-primary/50"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold">{item.key}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatNumber(item.runCount)} runs · {formatNumber(item.totalTokens)} tokens
                    </p>
                  </div>
                  <span className="text-sm font-medium">{formatCurrency(item.totalCostUsd)}</span>
                </div>
                <div className="mt-4 grid gap-2 text-sm md:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Success</p>
                    <p>{formatNumber(item.successRuns)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Failures</p>
                    <p>{formatNumber(item.failedRuns)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Avg latency</p>
                    <p>{formatLatency(item.averageLatencyMs)}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Most Used Tools</CardTitle>
          <CardDescription>Composite and MCP calls aggregated across the current filter set.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {toolItems.slice(0, 12).map((item) => (
              <div
                key={`${item.agentName}-${item.service}-${item.toolName}`}
                className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    {item.agentName} · {item.service} / {item.toolName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.sourceKind} · avg {formatLatency(item.averageLatencyMs)}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p>{formatNumber(item.callCount)} calls</p>
                  <p className="text-xs text-muted-foreground">
                    {formatNumber(item.successCount)} ok / {formatNumber(item.failureCount)} failed
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
