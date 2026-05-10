'use client';

import { useAgentRunDetail, agentsApi } from '@noema/api-client';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@noema/ui';
import Link from 'next/link';
import * as React from 'react';
import {
  formatCurrency,
  formatLatency,
  formatNumber,
  formatTimestamp,
} from '@/components/agents/helpers';

export default function AgentRunDetailPage({
  params,
}: {
  params: { runId: string };
}): React.JSX.Element {
  const runQuery = useAgentRunDetail(params.runId);
  const detail = runQuery.data?.data;

  if (detail === undefined) {
    return <div className="text-sm text-muted-foreground">Loading run detail…</div>;
  }

  const modelRouting =
    typeof detail.execution?.['modelRouting'] === 'object' &&
    detail.execution['modelRouting'] !== null
      ? (detail.execution['modelRouting'] as Record<string, unknown>)
      : null;
  const fallbackUsed = modelRouting?.['fallbackUsed'] === true;
  const primaryProvider =
    typeof modelRouting?.['primaryProvider'] === 'string'
      ? modelRouting['primaryProvider']
      : detail.provider;
  const primaryModel =
    typeof modelRouting?.['primaryModel'] === 'string'
      ? modelRouting['primaryModel']
      : detail.model;
  const fallbackReason =
    typeof modelRouting?.['fallbackReason'] === 'string' ? modelRouting['fallbackReason'] : 'Used';
  const promptOperationName =
    typeof detail.prompt?.['operationName'] === 'string' ? detail.prompt['operationName'] : '—';
  const promptProfileVersion =
    typeof detail.prompt?.['promptProfileVersion'] === 'string'
      ? detail.prompt['promptProfileVersion']
      : '—';
  const promptBuilderId =
    typeof detail.prompt?.['promptBuilderId'] === 'string' ? detail.prompt['promptBuilderId'] : '—';
  const outputSchemaId =
    typeof detail.prompt?.['outputSchemaId'] === 'string' ? detail.prompt['outputSchemaId'] : '—';
  const scope =
    detail.prompt !== null &&
    typeof detail.prompt === 'object' &&
    'scope' in detail.prompt &&
    detail.prompt['scope'] !== null &&
    detail.prompt['scope'] !== undefined
      ? JSON.stringify(detail.prompt['scope'])
      : '—';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{detail.agentName}</h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{detail.runId}</p>
        </div>
        <div className="flex gap-2">
          <a href={agentsApi.getExportUrl(detail.runId, 'json')} target="_blank" rel="noreferrer">
            <Button variant="outline">Download JSON</Button>
          </a>
          <a href={agentsApi.getExportUrl(detail.runId, 'md')} target="_blank" rel="noreferrer">
            <Button variant="outline">Download Markdown</Button>
          </a>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Status</p>
            <p className="mt-2">{detail.status}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Tokens</p>
            <p className="mt-2">{formatNumber(detail.totalTokens)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Cost</p>
            <p className="mt-2">{formatCurrency(detail.costUsd)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Latency</p>
            <p className="mt-2">{formatLatency(detail.latencyMs)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Run Metadata</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">User</p>
            <p className="font-mono">{detail.userId}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Execution mode</p>
            <p>{detail.executionMode}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Operation</p>
            <p>{promptOperationName}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Prompt profile</p>
            <p>{promptProfileVersion}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Prompt builder</p>
            <p className="break-all font-mono text-xs">{promptBuilderId}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Output schema</p>
            <p className="break-all font-mono text-xs">{outputSchemaId}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Scope</p>
            <p className="break-all font-mono text-xs">{scope}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Created</p>
            <p>{formatTimestamp(detail.createdAt)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Provider / model</p>
            <p>
              {detail.provider ?? '—'} / {detail.model ?? '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Primary provider / model</p>
            <p>
              {primaryProvider ?? '—'} / {primaryModel ?? '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Fallback</p>
            <p>{fallbackUsed ? fallbackReason : 'Not used'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Config version</p>
            <p>{detail.configVersionId ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Completed</p>
            <p>{formatTimestamp(detail.completedAt)}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Transcript</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">
              {JSON.stringify(detail.transcript, null, 2)}
            </pre>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Prompt + Context</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">
              {JSON.stringify({ prompt: detail.prompt, contextPack: detail.contextPack }, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tool Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {detail.toolCalls.map((toolCall) => (
            <div
              key={`${String(toolCall.seq)}-${toolCall.toolName}`}
              className="rounded-lg border border-border px-4 py-3"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">
                    {toolCall.seq}. {toolCall.service} / {toolCall.toolName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {toolCall.sourceKind} · {toolCall.success ? 'success' : 'failed'}
                  </p>
                </div>
                <span className="text-sm">{formatLatency(toolCall.latencyMs)}</span>
              </div>
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">
                {JSON.stringify(toolCall, null, 2)}
              </pre>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {detail.events.map((event) => (
            <div
              key={`${String(event.seq)}-${event.eventType}`}
              className="rounded-lg border border-border px-4 py-3"
            >
              <p className="text-sm font-medium">
                {event.seq}. {event.eventType}
              </p>
              <p className="text-xs text-muted-foreground">{formatTimestamp(event.occurredAt)}</p>
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">
                {JSON.stringify(event.payload, null, 2)}
              </pre>
            </div>
          ))}
        </CardContent>
      </Card>

      <Link
        href={`/dashboard/agents/${detail.agentName}`}
        className="text-sm text-primary underline underline-offset-4"
      >
        View this agent’s aggregate page
      </Link>
    </div>
  );
}
