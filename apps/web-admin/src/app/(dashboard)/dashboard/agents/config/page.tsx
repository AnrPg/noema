'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@noema/ui';
import { useAgentConfigList } from '@noema/api-client';
import * as React from 'react';
import { formatTimestamp } from '@/components/agents/helpers';

export default function AgentConfigPage(): React.JSX.Element {
  const configQuery = useAgentConfigList();
  const items = configQuery.data?.data.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Agent Configuration</h1>
        <p className="mt-1 text-muted-foreground">Versioned drafts, active configs, and activation history.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Active Configurations</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {items.map((item) => {
              const wrapper = item.wrapper as { name?: string; provider?: string; model?: string; enabled?: boolean };
              const toolBelt = item.toolBelt as { id?: string };
              return (
                <Link
                  key={item.versionId}
                  href={`/dashboard/agents/config/${item.agentName}`}
                  className="flex items-center justify-between rounded-lg border border-border px-4 py-3 transition-colors hover:border-primary/40"
                >
                  <div>
                    <p className="text-sm font-medium">{item.agentName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      v{item.versionNumber} · {wrapper.provider ?? '—'} / {wrapper.model ?? '—'} · belt {toolBelt.id ?? '—'}
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>{wrapper.enabled === false ? 'disabled' : 'enabled'}</p>
                    <p>{formatTimestamp(item.activatedAt ?? item.updatedAt)}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
