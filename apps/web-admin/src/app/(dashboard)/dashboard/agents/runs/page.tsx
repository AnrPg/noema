'use client';

import Link from 'next/link';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@noema/ui';
import { useAgentRuns } from '@noema/api-client';
import * as React from 'react';
import {
  formatCurrency,
  formatLatency,
  formatNumber,
  formatTimestamp,
} from '@/components/agents/helpers';

const PAGE_SIZE = 25;

export default function AgentRunsPage(): React.JSX.Element {
  const [agentName, setAgentName] = React.useState('');
  const [userId, setUserId] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [page, setPage] = React.useState(0);

  const filters = {
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    ...(agentName !== '' ? { agentName } : {}),
    ...(userId !== '' ? { userId } : {}),
    ...(status !== '' ? { status } : {}),
  };
  const runsQuery = useAgentRuns(filters);
  const items = runsQuery.data?.data.items ?? [];
  const total = runsQuery.data?.data.total ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Agent Runs</h1>
        <p className="mt-1 text-muted-foreground">
          Search and inspect individual agent executions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Input
            value={agentName}
            placeholder="Agent name"
            onChange={(e) => {
              setAgentName(e.target.value);
            }}
          />
          <Input
            value={userId}
            placeholder="User id"
            onChange={(e) => {
              setUserId(e.target.value);
            }}
          />
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
            }}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All statuses</option>
            <option value="completed">completed</option>
            <option value="failed">failed</option>
            <option value="running">running</option>
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{formatNumber(total)} runs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="pb-3">Agent</th>
                  <th className="pb-3">User</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Provider / Model</th>
                  <th className="pb-3">Tokens</th>
                  <th className="pb-3">Cost</th>
                  <th className="pb-3">Latency</th>
                  <th className="pb-3">Created</th>
                  <th className="pb-3">Detail</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.runId} className="border-b last:border-b-0">
                    <td className="py-3">{item.agentName}</td>
                    <td className="py-3 font-mono text-xs">{item.userId}</td>
                    <td className="py-3">{item.status}</td>
                    <td className="py-3">
                      <span className="font-mono text-xs">
                        {item.provider ?? '—'} / {item.model ?? '—'}
                      </span>
                    </td>
                    <td className="py-3">{formatNumber(item.totalTokens)}</td>
                    <td className="py-3">{formatCurrency(item.costUsd)}</td>
                    <td className="py-3">{formatLatency(item.latencyMs)}</td>
                    <td className="py-3">{formatTimestamp(item.createdAt)}</td>
                    <td className="py-3">
                      <Link
                        className="text-primary underline underline-offset-4"
                        href={`/dashboard/agents/runs/${item.runId}`}
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <Button
              variant="outline"
              disabled={page === 0}
              onClick={() => {
                setPage((value) => Math.max(0, value - 1));
              }}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page + 1} · showing {formatNumber(items.length)} of {formatNumber(total)}
            </span>
            <Button
              variant="outline"
              disabled={(page + 1) * PAGE_SIZE >= total}
              onClick={() => {
                setPage((value) => value + 1);
              }}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
