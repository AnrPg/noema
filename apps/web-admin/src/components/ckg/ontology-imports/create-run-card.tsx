'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type {
  IOntologyImportRunConfigurationDto,
  IOntologyImportSourceDto,
} from '@noema/api-client';
import { useCreateOntologyImportRun } from '@noema/api-client';
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@noema/ui';
import { AlertCircle, CheckCircle2, ExternalLink, PlusCircle } from 'lucide-react';

type MessageState = { type: 'success'; text: string } | { type: 'error'; text: string } | null;

const SOURCE_MODES: Record<string, { value: string; label: string }[]> = {
  yago: [{ value: 'snapshot', label: 'Snapshot' }],
  esco: [
    { value: 'full', label: 'Full catalog' },
    { value: 'skills', label: 'Skills only' },
    { value: 'occupations', label: 'Occupations only' },
    { value: 'qualifications', label: 'Qualifications only' },
  ],
  conceptnet: [
    { value: 'full', label: 'Full snapshot' },
    { value: 'targeted', label: 'Targeted seeds' },
  ],
};

function defaultModeForSource(sourceId: string): string {
  return SOURCE_MODES[sourceId]?.[0]?.value ?? 'full';
}

export function OntologyImportCreateRunCard({
  sources,
  initialSourceId,
  disabled = false,
  disabledReason,
}: {
  sources: IOntologyImportSourceDto[];
  initialSourceId?: string;
  disabled?: boolean;
  disabledReason?: string;
}): React.JSX.Element {
  const router = useRouter();
  const [message, setMessage] = useState<MessageState>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string>(
    initialSourceId ?? sources[0]?.id ?? 'yago'
  );
  const [sourceVersion, setSourceVersion] = useState('');
  const [mode, setMode] = useState<string>(defaultModeForSource(sources[0]?.id ?? 'yago'));
  const [language, setLanguage] = useState<string>('');
  const [seedNodes, setSeedNodes] = useState('/c/en/learning');

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId) ?? null,
    [selectedSourceId, sources]
  );
  const modeOptions = selectedSource === null ? [] : (SOURCE_MODES[selectedSource.id] ?? []);
  const selectedSourceHomepageUrl = selectedSource?.homepageUrl ?? null;
  const selectedSourceDocumentationUrl = selectedSource?.documentationUrl ?? null;

  useEffect(() => {
    if (initialSourceId === undefined) {
      return;
    }

    if (sources.some((source) => source.id === initialSourceId)) {
      setSelectedSourceId(initialSourceId);
    }
  }, [initialSourceId, sources]);

  useEffect(() => {
    if (selectedSource === null) {
      return;
    }

    setMode((current) =>
      modeOptions.some((option) => option.value === current)
        ? current
        : defaultModeForSource(selectedSource.id)
    );
    setLanguage((current) =>
      current !== '' && selectedSource.supportedLanguages.includes(current) ? current : ''
    );
  }, [modeOptions, selectedSource]);

  const createRun = useCreateOntologyImportRun({
    onSuccess: (response) => {
      setMessage({
        type: 'success',
        text: `Created ${response.data.sourceName} run ${response.data.id}. Redirecting to the run detail page…`,
      });
      router.push(`/dashboard/ckg/imports/runs/${response.data.id}`);
    },
    onError: (error) => {
      setMessage({
        type: 'error',
        text: error.message !== '' ? error.message : 'We could not create this import run yet.',
      });
    },
  });

  const canSubmit = selectedSource !== null && !createRun.isPending && !disabled;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create import run</CardTitle>
        <CardDescription>
          Queue a new source-aware import with an explicit source version and fetch mode before we
          start the pipeline.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {message !== null && (
          <Alert variant={message.type === 'error' ? 'destructive' : 'success'}>
            {message.type === 'error' ? (
              <AlertCircle className="h-4 w-4" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}

        {disabled && disabledReason !== undefined && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{disabledReason}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">Source</span>
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={selectedSourceId}
              disabled={disabled}
              onChange={(event) => {
                setSelectedSourceId(event.target.value);
                setMessage(null);
              }}
            >
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">Source version</span>
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder={selectedSource?.latestRelease?.version ?? 'latest available'}
              value={sourceVersion}
              disabled={disabled}
              onChange={(event) => {
                setSourceVersion(event.target.value);
                setMessage(null);
              }}
            />
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">Source mode</span>
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={mode}
              disabled={disabled}
              onChange={(event) => {
                setMode(event.target.value);
                setMessage(null);
              }}
            >
              {modeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {selectedSource?.id === 'esco' && (
            <label className="space-y-2 text-sm">
              <span className="font-medium text-foreground">Language</span>
              <select
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={language}
                disabled={disabled}
                onChange={(event) => {
                  setLanguage(event.target.value);
                  setMessage(null);
                }}
              >
                <option value="">Default</option>
                {selectedSource.supportedLanguages.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {selectedSource?.id === 'conceptnet' && mode === 'targeted' && (
          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">Seed nodes</span>
            <textarea
              className="min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="/c/en/learning&#10;/c/en/algebra"
              value={seedNodes}
              disabled={disabled}
              onChange={(event) => {
                setSeedNodes(event.target.value);
                setMessage(null);
              }}
            />
            <p className="text-xs text-muted-foreground">
              One ConceptNet seed per line. The fetcher will expand these roots through the targeted
              API mode.
            </p>
          </label>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Runs are created as queued records first. You can inspect them, then start fetching from
            the run detail page.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {selectedSourceHomepageUrl !== null && (
              <Button asChild size="sm" variant="outline">
                <a href={selectedSourceHomepageUrl} target="_blank" rel="noreferrer">
                  Source site
                  <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
            )}
            {selectedSourceDocumentationUrl !== null && (
              <Button asChild size="sm" variant="ghost">
                <a href={selectedSourceDocumentationUrl} target="_blank" rel="noreferrer">
                  Documentation
                  <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
            )}
            <Button
              disabled={!canSubmit}
              onClick={() => {
                if (selectedSource === null) {
                  return;
                }

                const configuration: Partial<IOntologyImportRunConfigurationDto> = {
                  mode,
                };
                if (language !== '') {
                  configuration.language = language;
                }
                if (selectedSource.id === 'conceptnet' && mode === 'targeted') {
                  configuration.seedNodes = seedNodes
                    .split(/\r?\n/)
                    .map((entry) => entry.trim())
                    .filter((entry) => entry !== '');
                }

                createRun.mutate({
                  sourceId: selectedSource.id,
                  ...(sourceVersion.trim() !== '' ? { sourceVersion: sourceVersion.trim() } : {}),
                  configuration,
                });
              }}
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              {createRun.isPending ? 'Creating…' : 'Create queued run'}
            </Button>
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          Need a different source first?{' '}
          <Link href="/dashboard/ckg/imports/sources">Open source registry</Link>
        </div>
      </CardContent>
    </Card>
  );
}
