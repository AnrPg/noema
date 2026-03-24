'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  type IRegisterOntologyImportSourceInput,
  type OntologyImportSourceResponse,
  useRegisterOntologyImportSource,
  useOntologyImportRuns,
  useOntologyImportsSystemStatus,
  useOntologyImportSources,
  useSyncOntologyImportSource,
  useUpdateOntologyImportSource,
} from '@noema/api-client';
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
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { OntologySourceCard } from '@/components/ckg/ontology-imports/source-card';
import {
  ontologyImportRunsPlaceholder,
  ontologyImportSourcesPlaceholder,
} from '@/components/ckg/ontology-imports/placeholder-data';

const OPENALEX_PRESET: IRegisterOntologyImportSourceInput = {
  id: 'openalex',
  name: 'OpenAlex',
  role: 'enhancement',
  accessMode: 'snapshot',
  description:
    'Research graph source for disciplines, institutions, and linked scholarly entities.',
  homepageUrl: 'https://openalex.org/',
  documentationUrl: 'https://docs.openalex.org/',
  supportedLanguages: ['en'],
  supportsIncremental: true,
};

const GEONAMES_PRESET: IRegisterOntologyImportSourceInput = {
  id: 'geonames',
  name: 'GeoNames',
  role: 'enhancement',
  accessMode: 'snapshot',
  description:
    'Geographic knowledge source for places, alternate names, and geographic identifiers.',
  homepageUrl: 'https://www.geonames.org/',
  documentationUrl: 'https://download.geonames.org/export/dump/',
  supportedLanguages: ['en', 'multilingual'],
  supportsIncremental: true,
};

interface ISourceFormState {
  id: string;
  name: string;
  role: IRegisterOntologyImportSourceInput['role'];
  accessMode: IRegisterOntologyImportSourceInput['accessMode'];
  description: string;
  homepageUrl: string;
  documentationUrl: string;
  supportedLanguages: string;
  supportsIncremental: boolean;
}

const EMPTY_SOURCE_FORM: ISourceFormState = {
  id: '',
  name: '',
  role: 'enhancement',
  accessMode: 'snapshot',
  description: '',
  homepageUrl: '',
  documentationUrl: '',
  supportedLanguages: 'en',
  supportsIncremental: false,
};

export default function OntologyImportSourcesPage(): React.JSX.Element {
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<ISourceFormState>(EMPTY_SOURCE_FORM);
  const [pendingToggleSourceId, setPendingToggleSourceId] = useState<string | null>(null);
  const [pendingSyncSourceId, setPendingSyncSourceId] = useState<string | null>(null);
  const { data: systemStatus } = useOntologyImportsSystemStatus({ retry: false });
  const canReadRegistry = systemStatus?.canReadRegistry === true;
  const { data: liveSources = [], isLoading } = useOntologyImportSources({
    enabled: canReadRegistry,
    retry: false,
  });
  const { data: liveRuns = [] } = useOntologyImportRuns(undefined, {
    enabled: canReadRegistry,
    retry: false,
  });

  const sources = canReadRegistry ? liveSources : ontologyImportSourcesPlaceholder;
  const runs = canReadRegistry ? liveRuns : ontologyImportRunsPlaceholder;
  const pilotRunsBySourceId = new Map(runs.map((run) => [run.sourceId, run.id]));
  const registerSource = useRegisterOntologyImportSource({
    onSuccess: (response: OntologyImportSourceResponse) => {
      setMessage(`Registered source ${response.data.name}.`);
      setForm(EMPTY_SOURCE_FORM);
    },
  });
  const updateSource = useUpdateOntologyImportSource({
    onSuccess: (response: OntologyImportSourceResponse) => {
      setPendingToggleSourceId(null);
      setMessage(`${response.data.name} is now ${response.data.enabled ? 'enabled' : 'disabled'}.`);
    },
    onError: () => {
      setPendingToggleSourceId(null);
    },
  });
  const syncSource = useSyncOntologyImportSource({
    onSuccess: (response: OntologyImportSourceResponse) => {
      setPendingSyncSourceId(null);
      setMessage(`Synced metadata for ${response.data.name}.`);
    },
    onError: () => {
      setPendingSyncSourceId(null);
    },
  });

  function applyPreset(preset: IRegisterOntologyImportSourceInput): void {
    setForm({
      id: preset.id,
      name: preset.name,
      role: preset.role,
      accessMode: preset.accessMode,
      description: preset.description,
      homepageUrl: preset.homepageUrl ?? '',
      documentationUrl: preset.documentationUrl ?? '',
      supportedLanguages: (preset.supportedLanguages ?? []).join(', '),
      supportsIncremental: preset.supportsIncremental ?? false,
    });
    setMessage(`Loaded the ${preset.name} preset into the registration form.`);
  }

  function submitRegistration(): void {
    registerSource.mutate({
      id: form.id.trim(),
      name: form.name.trim(),
      role: form.role,
      accessMode: form.accessMode,
      description: form.description.trim(),
      ...(form.homepageUrl.trim() !== '' ? { homepageUrl: form.homepageUrl.trim() } : {}),
      ...(form.documentationUrl.trim() !== ''
        ? { documentationUrl: form.documentationUrl.trim() }
        : {}),
      supportedLanguages: form.supportedLanguages
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry !== ''),
      supportsIncremental: form.supportsIncremental,
    });
  }

  const canSubmitRegistration =
    canReadRegistry &&
    !registerSource.isPending &&
    form.id.trim() !== '' &&
    form.name.trim() !== '' &&
    form.description.trim() !== '';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Ontology Source Catalog</h1>
          <p className="mt-1 text-muted-foreground">
            Live source registry for the first ontology-import wave: YAGO, ESCO, and ConceptNet.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/ckg/imports/runs">Back to imports</Link>
        </Button>
      </div>

      {systemStatus?.status !== 'healthy' && (
        <Alert variant={systemStatus?.status === 'unavailable' ? 'destructive' : 'default'}>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {systemStatus?.issues[0] ??
              'The source catalog is in degraded mode, so this page is showing demo-only source data.'}
          </AlertDescription>
        </Alert>
      )}

      {message !== null && (
        <Alert variant="success">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Register source</CardTitle>
          <CardDescription>
            Add a source registry entry without waiting for a full connector rollout. Use a preset
            to start fast, then adjust the fields before submitting.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!canReadRegistry || registerSource.isPending}
              onClick={() => {
                applyPreset(OPENALEX_PRESET);
              }}
            >
              Load OpenAlex preset
            </Button>
            <Button
              variant="outline"
              disabled={!canReadRegistry || registerSource.isPending}
              onClick={() => {
                applyPreset(GEONAMES_PRESET);
              }}
            >
              Load GeoNames preset
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="font-medium text-foreground">Source id</span>
              <input
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="openalex"
                value={form.id}
                disabled={!canReadRegistry || registerSource.isPending}
                onChange={(event) => {
                  setForm((current) => ({ ...current, id: event.target.value }));
                }}
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium text-foreground">Display name</span>
              <input
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="OpenAlex"
                value={form.name}
                disabled={!canReadRegistry || registerSource.isPending}
                onChange={(event) => {
                  setForm((current) => ({ ...current, name: event.target.value }));
                }}
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium text-foreground">Role</span>
              <select
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={form.role}
                disabled={!canReadRegistry || registerSource.isPending}
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    role: event.target.value as IRegisterOntologyImportSourceInput['role'],
                  }));
                }}
              >
                <option value="enhancement">Enhancement</option>
                <option value="backbone">Backbone</option>
              </select>
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium text-foreground">Access mode</span>
              <select
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={form.accessMode}
                disabled={!canReadRegistry || registerSource.isPending}
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    accessMode: event.target
                      .value as IRegisterOntologyImportSourceInput['accessMode'],
                  }));
                }}
              >
                <option value="snapshot">Snapshot</option>
                <option value="api">API</option>
                <option value="linked_data">Linked data</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </label>
            <label className="space-y-2 text-sm md:col-span-2">
              <span className="font-medium text-foreground">Description</span>
              <textarea
                className="min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="What this source adds to the ontology-import pipeline."
                value={form.description}
                disabled={!canReadRegistry || registerSource.isPending}
                onChange={(event) => {
                  setForm((current) => ({ ...current, description: event.target.value }));
                }}
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium text-foreground">Homepage URL</span>
              <input
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="https://example.org/"
                value={form.homepageUrl}
                disabled={!canReadRegistry || registerSource.isPending}
                onChange={(event) => {
                  setForm((current) => ({ ...current, homepageUrl: event.target.value }));
                }}
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium text-foreground">Documentation URL</span>
              <input
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="https://docs.example.org/"
                value={form.documentationUrl}
                disabled={!canReadRegistry || registerSource.isPending}
                onChange={(event) => {
                  setForm((current) => ({ ...current, documentationUrl: event.target.value }));
                }}
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium text-foreground">Supported languages</span>
              <input
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="en, de, multilingual"
                value={form.supportedLanguages}
                disabled={!canReadRegistry || registerSource.isPending}
                onChange={(event) => {
                  setForm((current) => ({ ...current, supportedLanguages: event.target.value }));
                }}
              />
            </label>
            <label className="flex items-center gap-3 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border border-input bg-background"
                checked={form.supportsIncremental}
                disabled={!canReadRegistry || registerSource.isPending}
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    supportsIncremental: event.target.checked,
                  }));
                }}
              />
              Supports incremental sync
            </label>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="ghost"
              disabled={!canReadRegistry || registerSource.isPending}
              onClick={() => {
                setForm(EMPTY_SOURCE_FORM);
              }}
            >
              Reset form
            </Button>
            <Button disabled={!canSubmitRegistration} onClick={submitRegistration}>
              {registerSource.isPending ? 'Registering…' : 'Register source'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Source registry</CardTitle>
          <CardDescription>
            {isLoading
              ? 'Loading source metadata…'
              : liveSources.length > 0
                ? 'Live source records from the ontology import registry.'
                : 'Seeded source records shown while the backend is still being populated.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 xl:grid-cols-2">
            {sources.map((source) => {
              const runId = pilotRunsBySourceId.get(source.id);

              return (
                <OntologySourceCard
                  key={source.id}
                  source={source}
                  {...(runId !== undefined ? { runId } : {})}
                  canCreateRun={canReadRegistry}
                  canManage={canReadRegistry}
                  isUpdating={pendingToggleSourceId === source.id && updateSource.isPending}
                  isSyncing={pendingSyncSourceId === source.id && syncSource.isPending}
                  onToggleEnabled={(sourceId, enabled) => {
                    setPendingToggleSourceId(sourceId);
                    updateSource.mutate({ sourceId, input: { enabled } });
                  }}
                  onSyncMetadata={(sourceId) => {
                    setPendingSyncSourceId(sourceId);
                    syncSource.mutate(sourceId);
                  }}
                />
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
