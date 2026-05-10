'use client';

import {
  useActivateAgentConfigDraft,
  useAgentConfig,
  useCreateAgentConfigDraft,
  useCreateRollbackSourceDraft,
  useUpdateAgentConfigDraft,
} from '@noema/api-client';
import { useAuth } from '@noema/auth';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@noema/ui';
import * as React from 'react';
import { formatTimestamp } from '@/components/agents/helpers';

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function readTimeoutSeconds(wrapper: Record<string, unknown>): string {
  const value = wrapper['maxLatencySeconds'];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? String(value) : '';
}

export default function AgentConfigDetailPage({
  params,
}: {
  params: { agentName: string };
}): React.JSX.Element {
  const { user } = useAuth();
  const configQuery = useAgentConfig(params.agentName);
  const config = configQuery.data?.data;
  const active = config?.active;
  const firstDraft = config?.drafts[0] ?? null;

  const [wrapperText, setWrapperText] = React.useState('');
  const [toolBeltText, setToolBeltText] = React.useState('');
  const [timeoutSeconds, setTimeoutSeconds] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    const source = firstDraft ?? active;
    if (source === undefined || source === null) return;
    setWrapperText(JSON.stringify(source.wrapper, null, 2));
    setToolBeltText(JSON.stringify(source.toolBelt, null, 2));
    setTimeoutSeconds(readTimeoutSeconds(source.wrapper));
    setNotes(source.notes ?? '');
  }, [active, firstDraft]);

  const createDraft = useCreateAgentConfigDraft(params.agentName, {
    onSuccess: () => {
      setMessage('Draft created. Refresh to inspect the new version history.');
    },
  });
  const updateDraft = useUpdateAgentConfigDraft(params.agentName, firstDraft?.versionId ?? '', {
    onSuccess: () => {
      setMessage('Draft updated. Refresh to reload the latest active/draft state.');
    },
  });
  const activateDraft = useActivateAgentConfigDraft(params.agentName, firstDraft?.versionId ?? '', {
    onSuccess: () => {
      setMessage('Draft activated. New runs will use the active version immediately.');
    },
  });
  const rollbackSeed = useCreateRollbackSourceDraft(
    params.agentName,
    firstDraft?.versionId ?? active?.versionId ?? '',
    {
      onSuccess: () => {
        setMessage('Rollback draft seeded from the active version.');
      },
    }
  );

  const actorUserId = user?.id ?? 'admin_devuser';

  function parsedPayload(): { wrapper: Record<string, unknown>; toolBelt: Record<string, unknown> } {
    return {
      wrapper: JSON.parse(wrapperText) as Record<string, unknown>,
      toolBelt: JSON.parse(toolBeltText) as Record<string, unknown>,
    };
  }

  function updateWrapperText(nextText: string): void {
    setWrapperText(nextText);
    const parsed = parseJsonObject(nextText);
    if (parsed !== null) {
      setTimeoutSeconds(readTimeoutSeconds(parsed));
    }
  }

  function updateTimeoutSeconds(nextValue: string): void {
    setTimeoutSeconds(nextValue);
    const parsed = parseJsonObject(wrapperText);
    if (parsed === null) {
      return;
    }

    const numericValue = Number(nextValue);
    const nextWrapper = { ...parsed };
    if (nextValue.trim() === '' || !Number.isFinite(numericValue) || numericValue <= 0) {
      delete nextWrapper['maxLatencySeconds'];
    } else {
      nextWrapper['maxLatencySeconds'] = Math.ceil(numericValue);
    }
    setWrapperText(JSON.stringify(nextWrapper, null, 2));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{params.agentName}</h1>
        <p className="mt-1 text-muted-foreground">
          Edit a draft, inspect version history, and activate changes.
        </p>
      </div>

      {message !== null && (
        <Card>
          <CardContent className="py-4 text-sm">{message}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Run Timeout</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="grid max-w-sm gap-2 text-sm">
            <span className="text-muted-foreground">Realtime run timeout (seconds)</span>
            <input
              type="number"
              min={1}
              step={1}
              value={timeoutSeconds}
              onChange={(event) => {
                updateTimeoutSeconds(event.target.value);
              }}
              className="rounded-md border border-input bg-background px-3 py-2 text-foreground"
            />
          </label>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Wrapper JSON</CardTitle>
          </CardHeader>
          <CardContent>
            <textarea
              value={wrapperText}
              onChange={(event) => {
                updateWrapperText(event.target.value);
              }}
              className="min-h-[420px] w-full rounded-md border border-input bg-background p-3 font-mono text-xs"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tool Belt JSON</CardTitle>
          </CardHeader>
          <CardContent>
            <textarea
              value={toolBeltText}
              onChange={(event) => {
                setToolBeltText(event.target.value);
              }}
              className="min-h-[420px] w-full rounded-md border border-input bg-background p-3 font-mono text-xs"
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <textarea
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value);
            }}
            className="min-h-[120px] w-full rounded-md border border-input bg-background p-3 text-sm"
          />
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => {
                const payload = parsedPayload();
                if (firstDraft !== null) {
                  updateDraft.mutate({
                    actorUserId,
                    notes,
                    wrapper: payload.wrapper,
                    toolBelt: payload.toolBelt,
                  });
                  return;
                }
                createDraft.mutate({
                  actorUserId,
                  notes,
                  wrapper: payload.wrapper,
                  toolBelt: payload.toolBelt,
                });
              }}
            >
              {firstDraft !== null ? 'Update Draft' : 'Create Draft'}
            </Button>
            <Button
              variant="outline"
              disabled={firstDraft === null}
              onClick={() => {
                activateDraft.mutate();
              }}
            >
              Activate Draft
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                rollbackSeed.mutate();
              }}
            >
              Seed Rollback Draft
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Version History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(config?.history ?? []).map((version) => (
            <div key={version.versionId} className="rounded-lg border border-border px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">
                    v{String(version.versionNumber)} · {version.status}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{version.versionId}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>{version.actorUserId ?? '—'}</p>
                  <p>{formatTimestamp(version.updatedAt)}</p>
                </div>
              </div>
              {version.notes !== null && version.notes !== '' && (
                <p className="mt-3 text-sm text-muted-foreground">{version.notes}</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
