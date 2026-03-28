'use client';

import * as React from 'react';
import type {
  IBatchSummaryDto,
  ICardImportExecuteResult,
  ICardImportFieldMapping,
  ICardImportPreviewResult,
} from '@noema/api-client';
import {
  contentKeys,
  useBatch,
  useExecuteCardImport,
  usePreviewCardImport,
  useRecentBatches,
  useRollbackBatch,
} from '@noema/api-client';
import type { JobId } from '@noema/types';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  FileUp,
  Layers,
  Loader2,
  RefreshCcw,
  Trash2,
  Upload,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  BATCH_IMPORT_ACCEPT,
  BATCH_IMPORT_FILE_TYPES,
  getBatchImportFileTypeDefinition,
  type BatchImportFileType,
} from '@/lib/cards/batch-import';
import { formatApiErrorMessage } from '@/lib/api-errors';
import { useActiveStudyMode } from '@/hooks/use-active-study-mode';
import { getStudyModeDescription, getStudyModeLabel } from '@/lib/study-mode';

type WizardStep = 1 | 2 | 3 | 4;
type SharedDifficulty = 'beginner' | 'elementary' | 'intermediate' | 'advanced' | 'expert';
type SharedState = 'draft' | 'active';

const KNOWLEDGE_NODE_ID_PATTERN = /^node_[a-zA-Z0-9]{21}$/;
const TARGET_OPTIONS: { value: ICardImportFieldMapping['targetFieldId']; label: string }[] = [
  { value: 'front', label: 'Front side' },
  { value: 'back', label: 'Back side' },
  { value: 'hint', label: 'Hint' },
  { value: 'explanation', label: 'Explanation' },
  { value: 'tags', label: 'Tags' },
  { value: 'knowledgeNodeIds', label: 'Knowledge node IDs' },
  { value: 'difficulty', label: 'Difficulty' },
  { value: 'state', label: 'State' },
  { value: 'dump', label: 'Dump metadata' },
];

const CARD_IMPORT_ERROR_FIELDS = {
  fileName: 'Uploaded file',
  fileType: 'File type',
  formatId: 'Import format',
  mappings: 'Field mapping',
  payload: 'Uploaded file',
  sharedKnowledgeNodeIds: 'Shared knowledge node IDs',
  sharedTags: 'Shared tags',
  sheetName: 'Workbook sheet',
} satisfies Record<string, string>;

const CARD_IMPORT_ERROR_HINTS = {
  sharedKnowledgeNodeIds: 'Use IDs like node_abcdefghijklmnopqrstu.',
  sheetName: 'Choose one of the sheets detected in the workbook.',
} satisfies Record<string, string>;

function formatCardImportError(error: unknown, action: string, fallback: string): string {
  return formatApiErrorMessage(error, {
    action,
    fallback,
    fieldLabels: CARD_IMPORT_ERROR_FIELDS,
    fieldHints: CARD_IMPORT_ERROR_HINTS,
    fieldFormatters: {
      sharedTags: (messages) => {
        const combined = messages.join(' ').toLowerCase();
        if (combined.includes('lowercase alphanumeric with hyphens')) {
          return 'Shared tags must use lowercase letters, numbers, and hyphens only, with no leading or trailing hyphen. Try values like biology-basics or chapter-3';
        }

        return `Shared tags: ${messages.join(' ')}`;
      },
    },
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function truncateBatchId(id: string): string {
  return id.length > 12 ? id.slice(0, 8) + '…' + id.slice(-4) : id;
}

function parseCommaSeparated(raw: string): string[] {
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value !== '');
}

function normalizeKnowledgeNodeIds(raw: string): string[] {
  const deduped = new Set<string>();
  parseCommaSeparated(raw).forEach((id) => deduped.add(id));
  return Array.from(deduped);
}

function validateKnowledgeNodeIds(ids: string[]): string | null {
  const invalid = ids.find((id) => !KNOWLEDGE_NODE_ID_PATTERN.test(id));
  return invalid === undefined
    ? null
    : `Invalid knowledge node ID: ${invalid}. Expected node_ followed by 21 alphanumeric characters.`;
}

async function fileToPayload(
  file: File,
  fileType: BatchImportFileType
): Promise<{ encoding: 'text' | 'base64'; content: string }> {
  if (fileType === 'xlsx') {
    const buffer = await file.arrayBuffer();
    return { encoding: 'base64', content: arrayBufferToBase64(buffer) };
  }

  return { encoding: 'text', content: await file.text() };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function getStringField(
  content: Record<string, unknown>,
  candidates: readonly string[]
): string | null {
  for (const candidate of candidates) {
    const value = content[candidate];
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }

  return null;
}

function truncatePreview(value: string, maxLength = 20): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

function getBatchCardPreview(card: { content: Record<string, unknown> }): {
  front: string;
  back: string;
} {
  const front =
    getStringField(card.content, ['front', 'term', 'statement', 'question', 'targetConcept']) ??
    'Untitled front';
  const back =
    getStringField(card.content, ['back', 'definition', 'analysis', 'correctAnswer']) ??
    'Untitled back';

  return {
    front: truncatePreview(front),
    back: truncatePreview(back),
  };
}

function BatchDetailsPanel({ batchId }: { batchId: JobId }): React.JSX.Element {
  const { data, isLoading, isError } = useBatch(batchId);
  const cards = data?.data;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading batch cards…
      </div>
    );
  }

  if (isError || cards === undefined) {
    return <div className="px-4 py-3 text-sm text-destructive">Failed to load batch details.</div>;
  }

  return (
    <div className="divide-y divide-border/50">
      {cards.map((card) => {
        const preview = getBatchCardPreview(card);

        return (
          <div key={card.id} className="flex items-center gap-3 px-4 py-2 text-sm">
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
              {card.cardType}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="truncate text-sm text-foreground">{preview.front}</span>
                <span className="shrink-0 text-xs text-muted-foreground">→</span>
                <span className="truncate text-sm text-muted-foreground">{preview.back}</span>
              </div>
            </div>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {card.state}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function BatchRow({
  batch,
  isExpanded,
  onToggleExpand,
  onRollback,
  isRollingBack,
}: {
  batch: IBatchSummaryDto;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onRollback: () => void;
  isRollingBack: boolean;
}): React.JSX.Element {
  const [confirming, setConfirming] = React.useState(false);

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"
        >
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <span title={batch.batchId} className="w-36 shrink-0 font-mono text-sm text-foreground">
          {truncateBatchId(batch.batchId)}
        </span>
        <span className="shrink-0 text-sm text-muted-foreground">
          {String(batch.count)} {batch.count === 1 ? 'card' : 'cards'}
        </span>
        <span className="min-w-0 flex-1 text-sm text-muted-foreground">
          {formatDate(batch.createdAt)}
        </span>
        {confirming ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                onRollback();
              }}
              disabled={isRollingBack}
              className={dangerBtnClass}
            >
              {isRollingBack ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                'Confirm rollback'
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
              }}
              className={secondaryBtnClass}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setConfirming(true);
            }}
            className={secondaryBtnClass}
          >
            <Trash2 className="h-4 w-4" />
            Rollback
          </button>
        )}
      </div>
      {isExpanded && (
        <div className="border-t border-border/50">
          <BatchDetailsPanel batchId={batch.batchId as JobId} />
        </div>
      )}
    </div>
  );
}

function StepIndicator({ current }: { current: WizardStep }): React.JSX.Element {
  const labels: Record<WizardStep, string> = {
    1: 'File Type',
    2: 'Format',
    3: 'Mapping',
    4: 'Done',
  };

  return (
    <nav aria-label="Batch import steps" className="flex items-center gap-2">
      {[1, 2, 3, 4].map((step, index) => {
        const stepNumber = step as WizardStep;
        const complete = current > stepNumber;
        const active = current === stepNumber;

        return (
          <React.Fragment key={step}>
            {index > 0 && (
              <div
                className={['h-px flex-1', complete || active ? 'bg-primary/60' : 'bg-border'].join(
                  ' '
                )}
              />
            )}
            <div className="flex flex-col items-center gap-1">
              <div
                className={[
                  'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold',
                  complete
                    ? 'bg-primary text-primary-foreground'
                    : active
                      ? 'border-2 border-primary bg-background text-primary'
                      : 'border border-border bg-background text-muted-foreground',
                ].join(' ')}
              >
                {complete ? <Check className="h-3.5 w-3.5" /> : String(step)}
              </div>
              <span
                className={[
                  'hidden text-xs sm:block',
                  active ? 'font-medium text-foreground' : 'text-muted-foreground',
                ].join(' ')}
              >
                {labels[stepNumber]}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </nav>
  );
}

function PreviewSummary({ preview }: { preview: ICardImportPreviewResult }): React.JSX.Element {
  const samples = preview.records.slice(0, 3);

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Preview ready</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Parsed {String(preview.records.length)} records and inferred a first-pass mapping.
            Review every field before import.
          </p>
        </div>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          Explicit mapping required
        </span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {samples.map((record, index) => (
          <div key={index} className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Record {String(index + 1)}
            </p>
            <pre className="overflow-x-auto text-xs leading-relaxed text-foreground">
              {JSON.stringify(record.values, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BatchOperationsPage(): React.JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const activeStudyMode = useActiveStudyMode();

  const [step, setStep] = React.useState<WizardStep>(1);
  const [selectedFileType, setSelectedFileType] = React.useState<BatchImportFileType | null>(null);
  const [selectedFormatId, setSelectedFormatId] = React.useState<string | null>(null);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [selectedSheetName, setSelectedSheetName] = React.useState('');
  const [preview, setPreview] = React.useState<ICardImportPreviewResult | null>(null);
  const [mappings, setMappings] = React.useState<ICardImportFieldMapping[]>([]);
  const [sharedTags, setSharedTags] = React.useState('');
  const [sharedKnowledgeNodeIds, setSharedKnowledgeNodeIds] = React.useState('');
  const [sharedDifficulty, setSharedDifficulty] = React.useState<SharedDifficulty>('intermediate');
  const [sharedState, setSharedState] = React.useState<SharedState>('draft');
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ICardImportExecuteResult | null>(null);
  const [expandedBatchId, setExpandedBatchId] = React.useState<JobId | null>(null);
  const [rollingBackId, setRollingBackId] = React.useState<JobId | null>(null);
  const [rollbackError, setRollbackError] = React.useState<string | null>(null);
  const [isDragActive, setIsDragActive] = React.useState(false);

  const previewImport = usePreviewCardImport();
  const executeImport = useExecuteCardImport({
    onSuccess: (response) => {
      setResult(response.data);
      void queryClient.invalidateQueries({ queryKey: contentKeys.recentBatches() });
      void queryClient.invalidateQueries({ queryKey: contentKeys.cards() });
      setStep(4);
    },
  });
  const rollbackMutation = useRollbackBatch({
    onSuccess: () => {
      setRollingBackId(null);
      setRollbackError(null);
      void queryClient.invalidateQueries({ queryKey: contentKeys.recentBatches() });
      void queryClient.invalidateQueries({ queryKey: contentKeys.cards() });
    },
    onError: (mutationError) => {
      setRollingBackId(null);
      setRollbackError(
        formatCardImportError(
          mutationError,
          'roll back this batch',
          'We could not roll back this batch. Please try again.'
        )
      );
    },
  });
  const { data, isLoading, isError, error: historyError } = useRecentBatches();
  const batches = data?.data ?? [];

  const selectedFileTypeDefinition =
    selectedFileType !== null ? getBatchImportFileTypeDefinition(selectedFileType) : null;
  const selectedFormat =
    selectedFileTypeDefinition?.formats.find((format) => format.id === selectedFormatId) ?? null;

  async function handlePreview(file: File, overrideSheetName?: string): Promise<void> {
    if (selectedFileType === null || selectedFormatId === null) return;

    setError(null);
    setResult(null);
    const payload = await fileToPayload(file, selectedFileType);
    const response = await previewImport.mutateAsync({
      fileName: file.name,
      fileType: selectedFileType,
      formatId: selectedFormatId,
      payload,
      supportedStudyModes: [activeStudyMode],
      ...(overrideSheetName !== undefined ? { sheetName: overrideSheetName } : {}),
    });

    setSelectedFile(file);
    setPreview(response.data);
    setMappings(response.data.suggestedMappings);
    if (response.data.sheetNames !== undefined && response.data.sheetNames.length > 0) {
      setSelectedSheetName(overrideSheetName ?? response.data.sheetNames[0] ?? '');
    }
  }

  async function handleFileSelection(file: File | null): Promise<void> {
    if (file === null) return;

    try {
      await handlePreview(file);
    } catch (previewError) {
      setPreview(null);
      setMappings([]);
      setError(
        formatCardImportError(
          previewError,
          'preview this import',
          'We could not preview this import. Check the file format and try again.'
        )
      );
    }
  }

  async function handleExecute(): Promise<void> {
    if (
      selectedFileType === null ||
      selectedFormatId === null ||
      selectedFile === null ||
      preview === null
    ) {
      setError('Choose a file and preview it before executing the import.');
      return;
    }

    const nodeIds = normalizeKnowledgeNodeIds(sharedKnowledgeNodeIds);
    const nodeError = validateKnowledgeNodeIds(nodeIds);
    if (nodeError !== null) {
      setError(nodeError);
      return;
    }

    const mappedTargets = new Set(
      mappings
        .filter((mapping) => mapping.targetFieldId !== 'dump')
        .map((mapping) => mapping.targetFieldId)
    );
    if (!mappedTargets.has('front') || !mappedTargets.has('back')) {
      setError(
        'Map one source field to Front side and one source field to Back side before importing.'
      );
      return;
    }

    try {
      const payload = await fileToPayload(selectedFile, selectedFileType);
      await executeImport.mutateAsync({
        fileName: selectedFile.name,
        fileType: selectedFileType,
        formatId: selectedFormatId,
        payload,
        mappings,
        sharedTags: parseCommaSeparated(sharedTags),
        sharedKnowledgeNodeIds: nodeIds,
        sharedDifficulty,
        sharedState,
        supportedStudyModes: [activeStudyMode],
        ...(selectedSheetName !== '' ? { sheetName: selectedSheetName } : {}),
      });
    } catch (executeError) {
      setError(
        formatCardImportError(
          executeError,
          'import these cards',
          'We could not import these cards. Review the mapping and shared defaults, then try again.'
        )
      );
    }
  }

  function resetWizard(): void {
    setStep(1);
    setSelectedFileType(null);
    setSelectedFormatId(null);
    setSelectedFile(null);
    setSelectedSheetName('');
    setPreview(null);
    setMappings([]);
    setSharedTags('');
    setSharedKnowledgeNodeIds('');
    setSharedDifficulty('intermediate');
    setSharedState('draft');
    setError(null);
    setResult(null);
    previewImport.reset();
    executeImport.reset();
    if (fileInputRef.current !== null) {
      fileInputRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              router.push('/cards');
            }}
            className={secondaryBtnClass}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Library
          </button>
          <div>
            <h1 className="text-3xl font-bold">Batch Operations</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Import card-shaped data through an explicit, mapping-first wizard backed by the
              content import API.
            </p>
            <div className="mt-3 inline-flex items-center rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
              Active import mode: {getStudyModeLabel(activeStudyMode)}
            </div>
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Import wizard</p>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Batch import is now a dedicated workflow. First choose the source file family, then
              the exact format closest to your data, then review an exhaustive mapping where every
              source field is promoted to a card field or preserved in dump metadata.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Layers className="h-3.5 w-3.5" />
            API-first import pipeline
          </span>
        </div>

        <div className="mt-6">
          <StepIndicator current={step} />
        </div>

        <div className="mt-6">
          <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
            <p className="text-sm font-medium text-foreground">
              {getStudyModeLabel(activeStudyMode)} defaults are active
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {getStudyModeDescription(activeStudyMode)} Imported cards created from this wizard
              will carry the active mode as their initial membership.
            </p>
          </div>

          {step === 1 && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {BATCH_IMPORT_FILE_TYPES.map((fileType) => (
                <button
                  key={fileType.id}
                  type="button"
                  onClick={() => {
                    setSelectedFileType(fileType.id);
                    setSelectedFormatId(null);
                    setPreview(null);
                    setMappings([]);
                    setError(null);
                    setStep(2);
                  }}
                  className="rounded-xl border border-border bg-background p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-foreground">{fileType.label}</p>
                      <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                        {fileType.extensions}
                      </p>
                    </div>
                    <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{fileType.description}</p>
                  <p className="mt-3 text-xs leading-relaxed text-foreground/80">
                    {fileType.insight}
                  </p>
                </button>
              ))}
            </div>
          )}

          {step === 2 && selectedFileTypeDefinition !== null && (
            <div className="flex flex-col gap-5">
              <div className="rounded-xl border border-border bg-muted/20 p-4">
                <p className="text-sm font-semibold text-foreground">
                  {selectedFileTypeDefinition.label}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedFileTypeDefinition.description}
                </p>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                {selectedFileTypeDefinition.formats.map((format) => (
                  <button
                    key={format.id}
                    type="button"
                    onClick={() => {
                      setSelectedFormatId(format.id);
                      setError(null);
                      setStep(3);
                    }}
                    className="rounded-xl border border-border bg-background p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
                  >
                    <p className="text-base font-semibold text-foreground">{format.label}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{format.description}</p>
                    <p className="mt-3 text-xs leading-relaxed text-foreground/80">
                      {format.insight}
                    </p>
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                  }}
                  className={secondaryBtnClass}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
              </div>
            </div>
          )}

          {step === 3 && selectedFileType !== null && selectedFormat !== null && (
            <div className="flex flex-col gap-6">
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <p className="text-sm font-semibold text-foreground">
                  {getBatchImportFileTypeDefinition(selectedFileType).label} ·{' '}
                  {selectedFormat.label}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{selectedFormat.description}</p>
                <p className="mt-2 text-xs leading-relaxed text-foreground/80">
                  {selectedFormat.insight} The preview engine will infer a starting mapping, but
                  import execution only proceeds once every source field has an explicit
                  destination.
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept={BATCH_IMPORT_ACCEPT}
                className="hidden"
                onChange={(event) => {
                  void handleFileSelection(event.target.files?.[0] ?? null);
                }}
              />

              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragActive(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setIsDragActive(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragActive(false);
                  void handleFileSelection(event.dataTransfer.files[0] ?? null);
                }}
                className={[
                  'rounded-2xl border-2 border-dashed p-6 transition-colors',
                  isDragActive ? 'border-primary bg-primary/5' : 'border-border bg-muted/20',
                ].join(' ')}
              >
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Upload className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Upload a source file for preview
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Supported here:{' '}
                      {getBatchImportFileTypeDefinition(selectedFileType).extensions}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={primaryBtnClass}
                  >
                    <FileUp className="h-4 w-4" />
                    Choose File
                  </button>
                  {selectedFile !== null && (
                    <p className="text-xs text-muted-foreground">
                      Selected file: {selectedFile.name}
                    </p>
                  )}
                </div>
              </div>

              {previewImport.isPending && (
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/10 px-4 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Building import preview…
                </div>
              )}

              {preview !== null && (
                <>
                  {preview.sheetNames !== undefined && preview.sheetNames.length > 1 && (
                    <div className="rounded-xl border border-border bg-muted/10 p-4">
                      <label className="flex flex-col gap-1.5">
                        <span className="text-sm font-medium text-foreground">Workbook sheet</span>
                        <select
                          value={selectedSheetName}
                          onChange={(event) => {
                            const nextSheet = event.target.value;
                            setSelectedSheetName(nextSheet);
                            if (selectedFile !== null) {
                              void handlePreview(selectedFile, nextSheet).catch(
                                (previewError: unknown) => {
                                  setError(
                                    formatCardImportError(
                                      previewError,
                                      'load that workbook sheet',
                                      'We could not load that workbook sheet. Please try again.'
                                    )
                                  );
                                }
                              );
                            }
                          }}
                          className={selectClass}
                        >
                          {preview.sheetNames.map((sheetName) => (
                            <option key={sheetName} value={sheetName}>
                              {sheetName}
                            </option>
                          ))}
                        </select>
                        <span className="text-xs text-muted-foreground">
                          Choose the worksheet whose columns should be mapped into cards.
                        </span>
                      </label>
                    </div>
                  )}

                  <PreviewSummary preview={preview} />

                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr),minmax(320px,0.85fr)]">
                    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            Explicit field mapping
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            Every source field must end up somewhere. Map it into a card field or
                            keep it explicitly in dump metadata.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setMappings(preview.suggestedMappings);
                          }}
                          className={secondaryBtnClass}
                        >
                          <RefreshCcw className="h-4 w-4" />
                          Reset suggestions
                        </button>
                      </div>

                      <div className="mt-4 overflow-x-auto">
                        <table className="w-full min-w-[760px] text-left text-sm">
                          <thead>
                            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                              <th className="pb-2 pr-4 font-medium">Source field</th>
                              <th className="pb-2 pr-4 font-medium">Sample</th>
                              <th className="pb-2 pr-4 font-medium">Destination</th>
                              <th className="pb-2 font-medium">Dump key</th>
                            </tr>
                          </thead>
                          <tbody>
                            {preview.sourceFields.map((field) => {
                              const mapping = mappings.find(
                                (item) => item.sourceKey === field.key
                              ) ?? {
                                sourceKey: field.key,
                                targetFieldId: 'dump' as const,
                                dumpKey: field.key,
                              };

                              return (
                                <tr key={field.key} className="border-b border-border/60 align-top">
                                  <td className="py-3 pr-4">
                                    <p className="font-medium text-foreground">{field.key}</p>
                                  </td>
                                  <td className="max-w-[220px] py-3 pr-4 text-xs text-muted-foreground">
                                    <div className="line-clamp-4 whitespace-pre-wrap break-words">
                                      {field.sample !== '' ? field.sample : '—'}
                                    </div>
                                  </td>
                                  <td className="py-3 pr-4">
                                    <select
                                      value={mapping.targetFieldId}
                                      onChange={(event) => {
                                        const nextTarget = event.target
                                          .value as ICardImportFieldMapping['targetFieldId'];
                                        setMappings((current) =>
                                          current.map((item) =>
                                            item.sourceKey === field.key
                                              ? nextTarget === 'dump'
                                                ? {
                                                    ...item,
                                                    targetFieldId: nextTarget,
                                                    dumpKey: item.dumpKey ?? field.key,
                                                  }
                                                : {
                                                    sourceKey: item.sourceKey,
                                                    targetFieldId: nextTarget,
                                                  }
                                              : item
                                          )
                                        );
                                      }}
                                      className={selectClass}
                                    >
                                      {TARGET_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="py-3">
                                    <input
                                      type="text"
                                      value={mapping.dumpKey ?? ''}
                                      disabled={mapping.targetFieldId !== 'dump'}
                                      onChange={(event) => {
                                        const nextDumpKey = event.target.value;
                                        setMappings((current) =>
                                          current.map((item) =>
                                            item.sourceKey === field.key
                                              ? { ...item, dumpKey: nextDumpKey }
                                              : item
                                          )
                                        );
                                      }}
                                      placeholder={field.key}
                                      className={inputClass}
                                    />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border bg-muted/10 p-4">
                      <div>
                        <p className="text-sm font-semibold text-foreground">Shared defaults</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          These defaults apply when the source does not already map a field
                          explicitly.
                        </p>
                      </div>

                      <div className="mt-4 flex flex-col gap-4">
                        <label className="flex flex-col gap-1.5">
                          <span className="text-sm font-medium">Shared tags</span>
                          <input
                            type="text"
                            value={sharedTags}
                            onChange={(event) => {
                              setSharedTags(event.target.value);
                            }}
                            placeholder="biology, imported, chapter-3"
                            className={inputClass}
                          />
                        </label>
                        <label className="flex flex-col gap-1.5">
                          <span className="text-sm font-medium">Shared knowledge node IDs</span>
                          <input
                            type="text"
                            value={sharedKnowledgeNodeIds}
                            onChange={(event) => {
                              setSharedKnowledgeNodeIds(event.target.value);
                            }}
                            placeholder="node_abcdefghijklmnopqrstu"
                            className={inputClass}
                          />
                        </label>
                        <label className="flex flex-col gap-1.5">
                          <span className="text-sm font-medium">Default difficulty</span>
                          <select
                            value={sharedDifficulty}
                            onChange={(event) => {
                              setSharedDifficulty(event.target.value as SharedDifficulty);
                            }}
                            className={selectClass}
                          >
                            <option value="beginner">Beginner</option>
                            <option value="elementary">Elementary</option>
                            <option value="intermediate">Intermediate</option>
                            <option value="advanced">Advanced</option>
                            <option value="expert">Expert</option>
                          </select>
                        </label>
                        <label className="flex flex-col gap-1.5">
                          <span className="text-sm font-medium">Default state</span>
                          <select
                            value={sharedState}
                            onChange={(event) => {
                              setSharedState(event.target.value as SharedState);
                            }}
                            className={selectClass}
                          >
                            <option value="draft">Draft</option>
                            <option value="active">Active</option>
                          </select>
                        </label>
                      </div>

                      {preview.warnings.length > 0 && (
                        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
                          {preview.warnings.join(' ')}
                        </div>
                      )}

                      {error !== null && (
                        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                          {error}
                        </div>
                      )}

                      <div className="mt-5 flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => void handleExecute()}
                          disabled={executeImport.isPending}
                          className={primaryBtnClass}
                        >
                          {executeImport.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                          Import Cards
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setStep(2);
                          }}
                          className={secondaryBtnClass}
                        >
                          <ArrowLeft className="h-4 w-4" />
                          Back
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {preview === null && (
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setStep(2);
                    }}
                    className={secondaryBtnClass}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </button>
                </div>
              )}
            </div>
          )}

          {step === 4 && result !== null && (
            <div className="flex flex-col gap-5">
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Check className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">Import completed</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Batch {result.batchId} created {String(result.created.length)} of{' '}
                        {String(result.total)} cards.
                      </p>
                    </div>
                  </div>
                  <button type="button" onClick={resetWizard} className={secondaryBtnClass}>
                    Import Another
                  </button>
                </div>
              </div>

              {result.importWarnings.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
                  {result.importWarnings.join(' ')}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {rollbackError !== null && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {rollbackError}
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {formatCardImportError(
            historyError,
            'load batch history',
            'We could not load batch history. Please try again.'
          )}
        </div>
      )}

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-xl font-semibold">Recent batch history</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Expand a batch to inspect imported cards or roll the whole batch back.
          </p>
        </div>

        {isLoading && (
          <div className="flex flex-col gap-3" aria-busy="true">
            {[1, 2, 3].map((placeholder) => (
              <div
                key={placeholder}
                className="h-14 animate-pulse rounded-lg border border-border bg-muted/40"
              />
            ))}
          </div>
        )}

        {!isLoading && batches.length > 0 && (
          <div className="flex flex-col gap-2">
            {batches.map((batch) => (
              <BatchRow
                key={batch.batchId}
                batch={batch}
                isExpanded={expandedBatchId === (batch.batchId as JobId)}
                onToggleExpand={() => {
                  setExpandedBatchId((current) =>
                    current === (batch.batchId as JobId) ? null : (batch.batchId as JobId)
                  );
                }}
                onRollback={() => {
                  setRollingBackId(batch.batchId as JobId);
                  rollbackMutation.mutate({ batchId: batch.batchId as JobId });
                }}
                isRollingBack={rollingBackId === (batch.batchId as JobId)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const inputClass = [
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm',
  'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring',
].join(' ');

const selectClass = [
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm',
  'focus:outline-none focus:ring-2 focus:ring-ring',
].join(' ');

const primaryBtnClass = [
  'inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2',
  'text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90',
  'focus:outline-none focus:ring-2 focus:ring-ring disabled:pointer-events-none disabled:opacity-50',
].join(' ');

const secondaryBtnClass = [
  'inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2',
  'text-sm font-medium text-foreground transition-colors hover:bg-muted',
  'focus:outline-none focus:ring-2 focus:ring-ring disabled:pointer-events-none disabled:opacity-50',
].join(' ');

const dangerBtnClass = [
  'inline-flex items-center gap-1.5 rounded-md bg-destructive px-4 py-2',
  'text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90',
  'focus:outline-none focus:ring-2 focus:ring-ring disabled:pointer-events-none disabled:opacity-50',
].join(' ');
