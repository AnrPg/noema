'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@noema/ui';
import * as React from 'react';
import type { IAgentMonitorEvent } from '@noema/api-client';
import {
  formatCurrency,
  formatLatency,
  formatNumber,
  formatTimestamp,
} from '@/components/agents/helpers';

export default function AgentMonitorPage(): React.JSX.Element {
  const [events, setEvents] = React.useState<IAgentMonitorEvent[]>([]);
  const [status, setStatus] = React.useState('connecting');

  React.useEffect(() => {
    const baseUrl = process.env['NEXT_PUBLIC_AGENTS_URL'] ?? 'http://localhost:8011';
    const stream = new EventSource(`${baseUrl}/v1/admin/agents/monitor/stream`);
    stream.onopen = () => {
      setStatus('connected');
    };
    stream.onerror = () => {
      setStatus('reconnecting');
    };
    stream.addEventListener('completed-run', (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as IAgentMonitorEvent;
      setEvents((current) => [payload, ...current].slice(0, 100));
    });
    return () => {
      stream.close();
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Agent Monitor</h1>
        <p className="mt-1 text-muted-foreground">
          Completed-run event stream for the agents runtime.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connection</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">
            Stream status: <span className="font-medium">{status}</span>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Completed Runs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {events.map((event) => (
            <div
              key={`${String(event.eventId)}-${event.runId}`}
              className="rounded-lg border border-border px-4 py-3"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{event.agentName}</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{event.runId}</p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatTimestamp(event.occurredAt)}
                </span>
              </div>
              <div className="mt-3 grid gap-2 text-sm md:grid-cols-5">
                <div>
                  <p className="text-xs text-muted-foreground">User</p>
                  <p className="font-mono">{event.userId}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p>{event.status}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Provider / Model</p>
                  <p className="font-mono text-xs">
                    {event.provider ?? '—'} / {event.model ?? '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Latency</p>
                  <p>{formatLatency(event.latencyMs)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Cost / Tokens</p>
                  <p>
                    {formatCurrency(event.costUsd)} / {formatNumber(event.totalTokens)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
