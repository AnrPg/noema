/**
 * @noema/api-client - Knowledge Graph Service Hooks
 *
 * TanStack Query hooks for Knowledge Graph Service endpoints:
 *   PKG nodes/edges/traversal, CKG nodes/edges/mutations,
 *   structural metrics, health, misconceptions, PKG/CKG comparison.
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import type { EdgeId, MutationId, NodeId, StudyMode, UserId } from '@noema/types';
import {
  ckgMaintenanceApi,
  ckgEdgesApi,
  ckgMutationsApi,
  ckgNodesApi,
  comparisonApi,
  healthApi,
  masteryApi,
  metricsApi,
  misconceptionsApi,
  ontologyImportsApi,
  pkgEdgesApi,
  pkgNodesApi,
  pkgOperationsApi,
  pkgTraversalApi,
} from './api.js';
import type {
  ICentralityDto,
  ICkgBulkReviewInput,
  ICkgEdgeAuthoringPreviewInput,
  ICkgNodeBatchAuthoringPreviewInput,
  ICkgMutationAuditLogDto,
  ICkgMutationDto,
  ICkgMutationFilters,
  ICkgMutationProposalInput,
  ICkgResetInput,
  ICommonAncestorsInput,
  IComparisonQueryParams,
  ICreateOntologyImportRunInput,
  IRegisterOntologyImportSourceInput,
  ISubmitOntologyImportRunPreviewInput,
  ICreateEdgeInput,
  ICreateNodeInput,
  IGraphEdgeDto,
  IGraphNodeDto,
  IMetacognitiveStageAssessmentDto,
  INodeMasterySummaryDto,
  IListOntologyImportRunsParams,
  IOntologyImportRunDetailDto,
  IOntologyImportRunDto,
  IOntologyImportSourceDto,
  IOntologyImportsSystemStatusDto,
  IOntologyImportArtifactContentDto,
  IStructuralMetricsDto,
  IUpdateOntologyImportSourceInput,
  IPkgCkgComparisonDto,
  IGraphNodeQueryParams,
  ISubgraphParams,
  IUpdateMisconceptionStatusInput,
  IUpdateNodeInput,
  BridgeNodesResponse,
  CentralityResponse,
  CkgBulkReviewResponse,
  CkgEdgeAuthoringPreviewResponse,
  CkgNodeBatchAuthoringPreviewResponse,
  CkgMutationAuditLogResponse,
  CkgMutationRecoveryCheckResponse,
  CkgMutationResponse,
  CkgMutationsResponse,
  CkgResetResponse,
  ComparisonResponse,
  EdgeResponse,
  EdgesListResponse,
  FrontierResponse,
  HealthResponse,
  MetricHistoryResponse,
  MetricsResponse,
  NodeMasterySummaryResponse,
  MisconceptionDetectionResponse,
  MisconceptionResponse,
  MisconceptionsResponse,
  NodeResponse,
  NodesListResponse,
  OperationsResponse,
  OntologyImportRunDetailResponse,
  OntologyImportArtifactContentResponse,
  OntologyImportRunResponse,
  OntologyImportSourceResponse,
  OntologyImportRunsResponse,
  OntologyImportSourcesResponse,
  OntologyImportsSystemStatusResponse,
  OntologyMutationPreviewSubmissionResponse,
  PrerequisiteChainResponse,
  StageResponse,
  SubgraphResponse,
} from './types.js';

function extractListData<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (typeof value !== 'object' || value === null) {
    return [];
  }

  const data = (value as { data?: unknown }).data;
  if (Array.isArray(data)) {
    return data as T[];
  }

  if (typeof data === 'object' && data !== null) {
    const items = (data as { items?: unknown }).items;
    if (Array.isArray(items)) {
      return items as T[];
    }
  }

  return [];
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function recordOrNullValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function stringIfPresent(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function parseJsonRecord(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function parseJsonValue(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function parsedValue(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    return parseJsonValue(trimmed);
  }

  return value;
}

function recordArrayValue(value: unknown): Record<string, unknown>[] {
  const parsed = parsedValue(value);
  return Array.isArray(parsed)
    ? parsed.filter(
        (entry): entry is Record<string, unknown> =>
          typeof entry === 'object' && entry !== null && !Array.isArray(entry)
      )
    : [];
}

function decodeEscapedText(value: string): string {
  return value
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16))
    );
}

function isUriLike(value: string): boolean {
  return /^https?:\/\//u.test(value.trim());
}

function isValidIsoDate(value: string | null): value is string {
  return value !== null && Number.isFinite(Date.parse(value));
}

function pickIsoDate(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    const value = stringIfPresent(candidate);
    if (isValidIsoDate(value)) {
      return value;
    }
  }

  return new Date(0).toISOString();
}

function collectMetadataSourceTypes(metadata: Record<string, unknown>): string[] {
  const ontologyImport = recordValue(metadata['ontologyImport']);
  const sourceTypes = stringArrayValue(ontologyImport['sourceTypes']);
  const className = stringIfPresent(metadata['className']);
  const nodeType = stringIfPresent(metadata['nodeType']);

  return [
    ...sourceTypes,
    ...(className !== null ? [className] : []),
    ...(nodeType !== null ? [nodeType] : []),
  ];
}

function inferNormalizedGraphNodeType(
  entry: Record<string, unknown>,
  metadata: Record<string, unknown>
): IGraphNodeDto['type'] {
  const explicitType = stringValue(entry['type'], stringValue(entry['nodeType'], ''));
  if (
    explicitType === 'concept' ||
    explicitType === 'occupation' ||
    explicitType === 'skill' ||
    explicitType === 'fact' ||
    explicitType === 'procedure' ||
    explicitType === 'principle' ||
    explicitType === 'example' ||
    explicitType === 'counterexample' ||
    explicitType === 'misconception'
  ) {
    return explicitType as IGraphNodeDto['type'];
  }

  const lexicalSignals = collectMetadataSourceTypes(metadata).join(' ').toLowerCase();
  if (lexicalSignals.includes('occupation')) {
    return 'occupation';
  }
  if (lexicalSignals.includes('skill')) {
    return 'skill';
  }
  if (lexicalSignals.includes('procedure') || lexicalSignals.includes('method')) {
    return 'procedure';
  }
  if (lexicalSignals.includes('principle') || lexicalSignals.includes('law')) {
    return 'principle';
  }
  if (lexicalSignals.includes('example')) {
    return 'example';
  }
  if (lexicalSignals.includes('counterexample')) {
    return 'counterexample';
  }
  if (lexicalSignals.includes('misconception')) {
    return 'misconception';
  }
  if (lexicalSignals.includes('fact') || lexicalSignals.includes('literal')) {
    return 'fact';
  }

  return 'concept';
}

function extractLocalizedText(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return null;
    }

    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      const parsed = parseJsonRecord(trimmed);
      if (parsed !== null) {
        return extractLocalizedText(parsed);
      }
    }

    return decodeEscapedText(trimmed);
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const text = extractLocalizedText(entry);
      if (text !== null) {
        return text;
      }
    }
    return null;
  }

  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;

  for (const key of ['literal', 'label', 'preferredLabel', 'title', 'name', 'description']) {
    const text = extractLocalizedText(record[key]);
    if (text !== null) {
      return text;
    }
  }

  const localizedEntries = Object.entries(record).filter(([key]) =>
    /^[a-z]{2}(-[A-Z]{2})?$/u.test(key)
  );

  const englishEntry = localizedEntries.find(([key]) => key.toLowerCase() === 'en');
  if (englishEntry !== undefined) {
    const text = extractLocalizedText(englishEntry[1]);
    if (text !== null) {
      return text;
    }
  }

  for (const [, entry] of localizedEntries) {
    const text = extractLocalizedText(entry);
    if (text !== null) {
      return text;
    }
  }

  return null;
}

function normalizeGraphLabel(rawLabel: string, metadata: Record<string, unknown>): string {
  if (!isUriLike(rawLabel)) {
    return rawLabel;
  }

  const metadataLabelCandidates = [
    metadata['preferredLabel'],
    metadata['title'],
    metadata['name'],
    metadata['label'],
  ];

  for (const candidate of metadataLabelCandidates) {
    const text = extractLocalizedText(candidate);
    if (text !== null && text !== '') {
      return text;
    }
  }

  const uriSuffix = rawLabel
    .split('/')
    .filter((segment) => segment !== '')
    .at(-1);
  return uriSuffix ?? rawLabel;
}

function normalizeGraphDescription(
  entry: Record<string, unknown>,
  metadata: Record<string, unknown>
): string | null {
  const directDescription = entry['description'];
  if (typeof directDescription === 'string' && directDescription.trim() !== '') {
    return directDescription;
  }

  if (directDescription !== undefined && directDescription !== null) {
    return JSON.stringify(directDescription);
  }

  const metadataDescription = metadata['description'];
  if (typeof metadataDescription === 'string' && metadataDescription.trim() !== '') {
    return metadataDescription;
  }

  if (metadataDescription !== undefined && metadataDescription !== null) {
    return JSON.stringify(metadataDescription);
  }

  return null;
}

function normalizeCanonicalExternalRefs(
  entry: Record<string, unknown>,
  metadata: Record<string, unknown>
): IGraphNodeDto['canonicalExternalRefs'] {
  const directRefs = recordArrayValue(entry['canonicalExternalRefs']);
  if (directRefs.length > 0) {
    return directRefs as unknown as IGraphNodeDto['canonicalExternalRefs'];
  }

  const ontologyImport = recordValue(metadata['ontologyImport']);
  const externalId = stringIfPresent(ontologyImport['externalId']);
  const sourceId = stringIfPresent(ontologyImport['sourceId']);
  const iri = stringIfPresent(ontologyImport['iri']);
  const sourceVersion = stringIfPresent(ontologyImport['sourceVersion']);

  if (externalId === null || sourceId === null) {
    return [];
  }

  return [
    {
      sourceId,
      externalId,
      ...(iri !== null ? { iri } : {}),
      ...(sourceVersion !== null ? { sourceVersion } : {}),
      isCanonical: true,
    },
  ];
}

function normalizeNodeReviewMetadata(
  entry: Record<string, unknown>
): IGraphNodeDto['reviewMetadata'] {
  const reviewMetadata = recordOrNullValue(parsedValue(entry['reviewMetadata']));
  return reviewMetadata as IGraphNodeDto['reviewMetadata'];
}

function normalizeNodeSourceCoverage(
  entry: Record<string, unknown>,
  metadata: Record<string, unknown>
): IGraphNodeDto['sourceCoverage'] {
  const directCoverage = recordOrNullValue(parsedValue(entry['sourceCoverage']));
  if (directCoverage !== null) {
    return directCoverage as unknown as IGraphNodeDto['sourceCoverage'];
  }

  const ontologyImport = recordValue(metadata['ontologyImport']);
  const sourceId = stringIfPresent(ontologyImport['sourceId']);
  if (sourceId === null) {
    return null;
  }

  return {
    contributingSourceIds: [sourceId],
    sourceCount: 1,
  };
}

function normalizeGraphNodeEntry(entry: Record<string, unknown>): IGraphNodeDto {
  const metadata = recordValue(entry['metadata'] ?? entry['properties']);
  const rawLabel = stringValue(
    entry['label'],
    stringValue(entry['nodeId'], stringValue(metadata['uri'], ''))
  );
  const domain = stringValue(entry['domain']);
  const ontologyImport = recordValue(metadata['ontologyImport']);
  const aliases =
    stringArrayValue(parsedValue(entry['aliases'])).length > 0
      ? stringArrayValue(parsedValue(entry['aliases']))
      : stringArrayValue(parsedValue(ontologyImport['aliases']));
  const languages =
    stringArrayValue(parsedValue(entry['languages'])).length > 0
      ? stringArrayValue(parsedValue(entry['languages']))
      : stringArrayValue(parsedValue(ontologyImport['languages']));
  const semanticHints =
    stringArrayValue(parsedValue(entry['semanticHints'])).length > 0
      ? stringArrayValue(parsedValue(entry['semanticHints']))
      : collectMetadataSourceTypes(metadata);
  const tags =
    stringArrayValue(parsedValue(entry['tags'])).length > 0
      ? stringArrayValue(parsedValue(entry['tags']))
      : domain !== ''
        ? [domain]
        : [];
  const supportedStudyModes = stringArrayValue(parsedValue(entry['supportedStudyModes']));
  const masteryLevelRaw = entry['masteryLevel'];
  const masteryLevel =
    typeof masteryLevelRaw === 'number' && Number.isFinite(masteryLevelRaw)
      ? masteryLevelRaw
      : masteryLevelRaw === null
        ? null
        : undefined;

  return {
    id: stringValue(entry['id'], stringValue(entry['nodeId'])) as NodeId,
    type: inferNormalizedGraphNodeType(entry, metadata),
    label: normalizeGraphLabel(rawLabel, metadata),
    description: normalizeGraphDescription(entry, metadata),
    domain: domain !== '' ? domain : null,
    status:
      stringIfPresent(entry['status']) !== null
        ? (stringIfPresent(entry['status']) as NonNullable<IGraphNodeDto['status']>)
        : null,
    aliases,
    languages,
    tags,
    semanticHints,
    supportedStudyModes: supportedStudyModes as StudyMode[],
    canonicalExternalRefs: normalizeCanonicalExternalRefs(entry, metadata),
    ontologyMappings: recordArrayValue(
      entry['ontologyMappings']
    ) as unknown as IGraphNodeDto['ontologyMappings'],
    provenance:
      recordArrayValue(entry['provenance']).length > 0
        ? (recordArrayValue(entry['provenance']) as unknown as IGraphNodeDto['provenance'])
        : (recordArrayValue(
            ontologyImport['provenance']
          ) as unknown as IGraphNodeDto['provenance']),
    reviewMetadata: normalizeNodeReviewMetadata(entry),
    sourceCoverage: normalizeNodeSourceCoverage(entry, metadata),
    metadata,
    ...(masteryLevel !== undefined ? { masteryLevel } : {}),
    createdAt: pickIsoDate(entry['createdAt'], metadata['createdAt']),
    updatedAt: pickIsoDate(
      entry['updatedAt'],
      entry['createdAt'],
      metadata['updatedAt'],
      metadata['createdAt']
    ),
  };
}

function normalizeGraphEdgeEntry(entry: Record<string, unknown>): IGraphEdgeDto {
  return {
    id: stringValue(entry['id'], stringValue(entry['edgeId'])) as EdgeId,
    sourceId: stringValue(entry['sourceId'], stringValue(entry['sourceNodeId'])) as NodeId,
    targetId: stringValue(entry['targetId'], stringValue(entry['targetNodeId'])) as NodeId,
    type: stringValue(
      entry['type'],
      stringValue(entry['edgeType'], 'related_to')
    ) as IGraphEdgeDto['type'],
    weight: numberValue(entry['weight'], 1),
    metadata: recordValue(entry['metadata'] ?? entry['properties']),
    createdAt: pickIsoDate(entry['createdAt']),
  };
}

function normalizeNodeResponse(response: NodeResponse): NodeResponse {
  return {
    ...response,
    data: normalizeGraphNodeEntry(recordValue(response.data)),
  };
}

function titleCaseWords(input: string): string {
  return input
    .split(/[-_]/)
    .filter((part) => part !== '')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function normalizeMisconceptionStatus(status: string): string {
  return status === 'addressed' || status === 'recurring' ? status : status;
}

function normalizeMisconceptionRecord<T extends { status: string }>(entry: T): T {
  return {
    ...entry,
    status: normalizeMisconceptionStatus(entry.status),
  };
}

function normalizeMisconceptionEntry(entry: Record<string, unknown>): {
  id: string;
  userId: string;
  nodeId: string;
  affectedNodeIds: string[];
  misconceptionType?: string;
  pattern: string;
  family?: string;
  familyLabel?: string;
  description?: string | null;
  status: string;
  confidence?: number;
  severity?: 'low' | 'moderate' | 'high' | 'critical';
  severityScore?: number;
  detectionCount?: number;
  detectedAt: string;
  lastDetectedAt?: string;
  resolvedAt: string | null;
} {
  const affectedNodeIds = Array.isArray(entry['affectedNodeIds'])
    ? (entry['affectedNodeIds'] as string[])
    : [];
  const family = stringValue(entry['family']);
  const familyLabel =
    stringValue(entry['familyLabel']) !== ''
      ? stringValue(entry['familyLabel'])
      : family !== ''
        ? titleCaseWords(family)
        : '';
  const rawStatus = stringValue(entry['status'], 'detected');

  return normalizeMisconceptionRecord({
    id: stringValue(entry['id']),
    userId: stringValue(entry['userId']),
    nodeId: stringValue(entry['nodeId'], affectedNodeIds[0] ?? ''),
    affectedNodeIds,
    ...(stringValue(entry['misconceptionType']) !== ''
      ? { misconceptionType: stringValue(entry['misconceptionType']) }
      : {}),
    pattern:
      stringValue(entry['pattern']) !== ''
        ? stringValue(entry['pattern'])
        : stringValue(entry['description']) !== ''
          ? stringValue(entry['description'])
          : stringValue(entry['misconceptionType']),
    ...(family !== '' ? { family } : {}),
    ...(familyLabel !== '' ? { familyLabel } : {}),
    ...(typeof entry['description'] === 'string' || entry['description'] === null
      ? { description: entry['description'] }
      : {}),
    status: rawStatus,
    ...(typeof entry['confidence'] === 'number' ? { confidence: entry['confidence'] } : {}),
    ...(typeof entry['severity'] === 'string'
      ? {
          severity: entry['severity'].toLowerCase() as 'low' | 'moderate' | 'high' | 'critical',
        }
      : {}),
    ...(typeof entry['severityScore'] === 'number'
      ? { severityScore: entry['severityScore'] }
      : {}),
    ...(typeof entry['detectionCount'] === 'number'
      ? { detectionCount: entry['detectionCount'] }
      : {}),
    detectedAt: stringValue(entry['detectedAt'], new Date(0).toISOString()),
    ...(typeof entry['lastDetectedAt'] === 'string'
      ? { lastDetectedAt: entry['lastDetectedAt'] }
      : {}),
    resolvedAt:
      entry['resolvedAt'] === null || typeof entry['resolvedAt'] === 'string'
        ? entry['resolvedAt']
        : null,
  });
}

function inferMutationType(
  operation: Record<string, unknown> | undefined
): ICkgMutationDto['type'] {
  const opType = stringValue(operation?.['type']).toLowerCase();

  if (opType.includes('edge')) {
    return opType.includes('remove') || opType.includes('delete') ? 'delete_edge' : 'create_edge';
  }

  if (opType.includes('update')) return 'update_node';
  if (opType.includes('remove') || opType.includes('delete')) return 'delete_node';
  return 'create_node';
}

function normalizeMutationStatus(state: string): ICkgMutationDto['status'] {
  switch (state) {
    case 'committed':
      return 'approved';
    case 'rejected':
      return 'rejected';
    case 'revision_requested':
      return 'retrying';
    default:
      return 'pending';
  }
}

function normalizeMutationEntry(entry: Record<string, unknown>): ICkgMutationDto {
  const operations = Array.isArray(entry['operations'])
    ? (entry['operations'] as Record<string, unknown>[])
    : [];
  const firstOperation = operations[0];
  const state = stringValue(entry['state'], 'proposed');
  const proposedAt = pickIsoDate(
    entry['createdAt'],
    entry['proposedAt'],
    entry['submittedAt'],
    entry['timestamp'],
    entry['updatedAt']
  );
  const updatedAt = pickIsoDate(
    entry['updatedAt'],
    entry['reviewedAt'],
    entry['committedAt'],
    entry['submittedAt'],
    entry['createdAt'],
    entry['proposedAt']
  );
  const terminalState = state === 'committed' || state === 'rejected';

  return {
    id: stringValue(entry['mutationId'], stringValue(entry['id'])) as MutationId,
    type: inferMutationType(firstOperation),
    status: normalizeMutationStatus(state),
    ...(state !== '' ? { state: state as NonNullable<ICkgMutationDto['state']> } : {}),
    proposedBy: stringValue(entry['proposedBy']) as ICkgMutationDto['proposedBy'],
    payload: firstOperation ?? {},
    ...(operations.length > 0 ? { operations } : {}),
    ...(typeof entry['rationale'] === 'string' ? { rationale: entry['rationale'] } : {}),
    ...(typeof entry['ontologyImportContext'] === 'object' &&
    entry['ontologyImportContext'] !== null
      ? {
          ontologyImportContext: {
            runId:
              typeof (entry['ontologyImportContext'] as Record<string, unknown>)['runId'] ===
              'string'
                ? ((entry['ontologyImportContext'] as Record<string, unknown>)['runId'] as string)
                : null,
            sourceId:
              typeof (entry['ontologyImportContext'] as Record<string, unknown>)['sourceId'] ===
              'string'
                ? ((entry['ontologyImportContext'] as Record<string, unknown>)[
                    'sourceId'
                  ] as string)
                : null,
            candidateId:
              typeof (entry['ontologyImportContext'] as Record<string, unknown>)['candidateId'] ===
              'string'
                ? ((entry['ontologyImportContext'] as Record<string, unknown>)[
                    'candidateId'
                  ] as string)
                : null,
          },
        }
      : {}),
    ...(typeof entry['reviewHints'] === 'object' && entry['reviewHints'] !== null
      ? {
          reviewHints: {
            confidenceScore:
              typeof (entry['reviewHints'] as Record<string, unknown>)['confidenceScore'] ===
              'number'
                ? ((entry['reviewHints'] as Record<string, unknown>)['confidenceScore'] as number)
                : null,
            confidenceBand:
              (entry['reviewHints'] as Record<string, unknown>)['confidenceBand'] === 'low' ||
              (entry['reviewHints'] as Record<string, unknown>)['confidenceBand'] === 'medium' ||
              (entry['reviewHints'] as Record<string, unknown>)['confidenceBand'] === 'high'
                ? ((entry['reviewHints'] as Record<string, unknown>)['confidenceBand'] as
                    | 'low'
                    | 'medium'
                    | 'high')
                : null,
            conflictFlags: Array.isArray(
              (entry['reviewHints'] as Record<string, unknown>)['conflictFlags']
            )
              ? ((entry['reviewHints'] as Record<string, unknown>)['conflictFlags'] as (
                  | 'ambiguous_match'
                  | 'domain_mismatch'
                  | 'mapping_conflict'
                  | 'weak_mapping_only'
                )[])
              : [],
          },
        }
      : {}),
    reviewedBy: null,
    reviewNote: typeof entry['revisionFeedback'] === 'string' ? entry['revisionFeedback'] : null,
    proposedAt,
    reviewedAt: terminalState ? updatedAt : null,
  };
}

function normalizeMutationResponse(response: CkgMutationResponse): CkgMutationResponse {
  return {
    ...response,
    data: normalizeMutationEntry(response.data as unknown as Record<string, unknown>),
  };
}

function normalizeMutationsResponse(response: CkgMutationsResponse): CkgMutationsResponse {
  return {
    ...response,
    data: extractListData<Record<string, unknown>>(response).map(normalizeMutationEntry),
  };
}

function upsertMutationInMutationsResponse(
  response: CkgMutationsResponse | undefined,
  mutation: ICkgMutationDto,
  replacedMutationId?: MutationId
): CkgMutationsResponse | undefined {
  if (response === undefined) {
    return response;
  }

  const normalized = normalizeMutationsResponse(response);
  const nextData = [
    mutation,
    ...normalized.data.filter(
      (entry) => entry.id !== mutation.id && entry.id !== replacedMutationId
    ),
  ];

  return {
    ...normalized,
    data: nextData,
    ...(normalized.pagination !== undefined
      ? {
          pagination: {
            ...normalized.pagination,
            total: nextData.length,
            hasMore: false,
          },
        }
      : {}),
  };
}

function matchesMutationFilters(mutation: ICkgMutationDto, filters?: ICkgMutationFilters): boolean {
  if (filters?.status !== undefined && mutation.status !== filters.status) {
    return false;
  }

  if (filters?.state !== undefined && mutation.state !== filters.state) {
    return false;
  }

  if (filters?.proposedBy !== undefined && mutation.proposedBy !== filters.proposedBy) {
    return false;
  }

  return true;
}

function normalizeMutationAuditLogResponse(
  response: CkgMutationAuditLogResponse
): CkgMutationAuditLogResponse {
  const rawData = response.data as unknown;
  const data =
    typeof rawData === 'object' && rawData !== null && !Array.isArray(rawData)
      ? (rawData as Record<string, unknown>)
      : {};
  const entries = Array.isArray(rawData)
    ? rawData
    : Array.isArray(data['entries'])
      ? data['entries']
      : [];
  const firstEntry = entries[0] as Record<string, unknown> | undefined;
  const mutationId = stringValue(
    data['mutationId'],
    stringValue(firstEntry?.['mutationId'])
  ) as MutationId;

  return {
    ...response,
    data: {
      mutationId,
      entries: entries.map((entry, index) => {
        const audit = entry as Record<string, unknown>;
        const toState = stringValue(audit['toState']);
        return {
          id: `${mutationId}-${String(index)}-${toState}`,
          mutationId,
          fromStatus: typeof audit['fromState'] === 'string' ? audit['fromState'] : null,
          toStatus: toState,
          actorId: stringValue(audit['performedBy'], 'system'),
          actorType: stringValue(audit['performedBy']).startsWith('system') ? 'system' : 'admin',
          reason:
            typeof audit['context'] === 'object' &&
            audit['context'] !== null &&
            typeof (audit['context'] as Record<string, unknown>)['reason'] === 'string'
              ? ((audit['context'] as Record<string, unknown>)['reason'] as string)
              : null,
          transitionedAt: stringValue(audit['timestamp'], new Date(0).toISOString()),
        };
      }),
    },
  };
}

// ============================================================================
// Query Key Factory
// ============================================================================

export const kgKeys = {
  all: ['kg'] as const,
  pkg: (userId: UserId) => [...kgKeys.all, 'pkg', userId] as const,
  pkgNodes: (userId: UserId, params?: IGraphNodeQueryParams) =>
    [...kgKeys.pkg(userId), 'nodes', ...(params !== undefined ? [params] : [])] as const,
  pkgNode: (userId: UserId, nodeId: NodeId) => [...kgKeys.pkgNodes(userId), nodeId] as const,
  pkgEdges: (userId: UserId, studyMode?: StudyMode) =>
    [...kgKeys.pkg(userId), 'edges', studyMode ?? null] as const,
  pkgEdge: (userId: UserId, edgeId: EdgeId) => [...kgKeys.pkgEdges(userId), edgeId] as const,
  pkgSubgraph: (userId: UserId, params: ISubgraphParams) =>
    [...kgKeys.pkg(userId), 'subgraph', params] as const,
  pkgPrerequisites: (userId: UserId, nodeId: NodeId) =>
    [...kgKeys.pkg(userId), 'prerequisites', nodeId] as const,
  pkgFrontier: (userId: UserId) => [...kgKeys.pkg(userId), 'frontier'] as const,
  pkgBridges: (userId: UserId) => [...kgKeys.pkg(userId), 'bridges'] as const,
  pkgCentrality: (userId: UserId) => [...kgKeys.pkg(userId), 'centrality'] as const,
  pkgTopology: (userId: UserId) => [...kgKeys.pkg(userId), 'topology'] as const,
  pkgOps: (userId: UserId) => [...kgKeys.pkg(userId), 'operations'] as const,
  ckg: () => [...kgKeys.all, 'ckg'] as const,
  ckgNodes: (params?: IGraphNodeQueryParams) =>
    [...kgKeys.ckg(), 'nodes', ...(params !== undefined ? [params] : [])] as const,
  ckgEdges: () => [...kgKeys.ckg(), 'edges'] as const,
  ckgMutations: (filters?: ICkgMutationFilters) => [...kgKeys.ckg(), 'mutations', filters] as const,
  ckgMutation: (id: MutationId) => [...kgKeys.ckg(), 'mutations', id] as const,
  ontologyImports: () => [...kgKeys.ckg(), 'ontology-imports'] as const,
  ontologyImportsSystemStatus: () => [...kgKeys.ontologyImports(), 'system-status'] as const,
  ontologyImportSources: () => [...kgKeys.ontologyImports(), 'sources'] as const,
  ontologyImportRuns: (filters?: IListOntologyImportRunsParams) =>
    [...kgKeys.ontologyImports(), 'runs', filters] as const,
  ontologyImportRun: (runId: string) => [...kgKeys.ontologyImports(), 'runs', runId] as const,
  metrics: (userId: UserId, studyMode?: StudyMode) =>
    [...kgKeys.all, 'metrics', userId, studyMode ?? null] as const,
  masterySummary: (
    userId: UserId,
    params: { studyMode: StudyMode; domain?: string; masteryThreshold?: number }
  ) => [...kgKeys.pkg(userId), 'mastery-summary', params] as const,
  metricHistory: (userId: UserId, studyMode?: StudyMode) =>
    [...kgKeys.metrics(userId, studyMode), 'history'] as const,
  health: (userId: UserId, studyMode?: StudyMode) =>
    [...kgKeys.all, 'health', userId, studyMode ?? null] as const,
  healthStage: (userId: UserId, studyMode?: StudyMode) =>
    [...kgKeys.health(userId, studyMode), 'stage'] as const,
  misconceptions: (userId: UserId, studyMode?: StudyMode) =>
    [...kgKeys.all, 'misconceptions', userId, studyMode ?? null] as const,
  comparison: (userId: UserId, params?: IComparisonQueryParams) =>
    [...kgKeys.all, 'comparison', userId, params] as const,
};

async function invalidateCkgGraphQueries(
  queryClient: ReturnType<typeof useQueryClient>
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: kgKeys.ckgNodes() }),
    queryClient.invalidateQueries({ queryKey: kgKeys.ckgEdges() }),
  ]);
}

// ============================================================================
// PKG Node Hooks
// ============================================================================

export function usePKGNodes(
  userId: UserId,
  options?: Omit<
    UseQueryOptions<NodesListResponse, Error, IGraphNodeDto[]>,
    'queryKey' | 'queryFn'
  > &
    IGraphNodeQueryParams
) {
  const {
    page,
    pageSize,
    nodeType,
    domain,
    search,
    searchMode,
    sortBy,
    sortOrder,
    studyMode,
    ...queryOptions
  } = options ?? {};
  const params =
    page !== undefined ||
    pageSize !== undefined ||
    nodeType !== undefined ||
    domain !== undefined ||
    search !== undefined ||
    searchMode !== undefined ||
    sortBy !== undefined ||
    sortOrder !== undefined ||
    studyMode !== undefined
      ? {
          ...(page !== undefined ? { page } : {}),
          ...(pageSize !== undefined ? { pageSize } : {}),
          ...(nodeType !== undefined ? { nodeType } : {}),
          ...(domain !== undefined ? { domain } : {}),
          ...(search !== undefined ? { search } : {}),
          ...(searchMode !== undefined ? { searchMode } : {}),
          ...(sortBy !== undefined ? { sortBy } : {}),
          ...(sortOrder !== undefined ? { sortOrder } : {}),
          ...(studyMode !== undefined ? { studyMode } : {}),
        }
      : undefined;

  return useQuery({
    queryKey: kgKeys.pkgNodes(userId, params),
    queryFn: () => pkgNodesApi.list(userId, params),
    select: (r) => extractListData<Record<string, unknown>>(r).map(normalizeGraphNodeEntry),
    enabled: userId !== '',
    ...queryOptions,
  });
}

export function usePKGNode(
  userId: UserId,
  nodeId: NodeId,
  options?: Omit<UseQueryOptions<NodeResponse, Error, IGraphNodeDto>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: kgKeys.pkgNode(userId, nodeId),
    queryFn: () => pkgNodesApi.get(userId, nodeId),
    select: (r) => normalizeNodeResponse(r).data,
    enabled: userId !== '' && nodeId !== '',
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

export function useCreatePKGNode(
  userId: UserId,
  options?: UseMutationOptions<NodeResponse, Error, ICreateNodeInput>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => pkgNodesApi.create(userId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: kgKeys.pkgNodes(userId) });
      void queryClient.invalidateQueries({ queryKey: kgKeys.comparison(userId) });
    },
    ...options,
  });
}

export function useUpdatePKGNode(
  userId: UserId,
  nodeId: NodeId,
  options?: UseMutationOptions<NodeResponse, Error, IUpdateNodeInput>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => pkgNodesApi.update(userId, nodeId, data),
    onSuccess: (response) => {
      queryClient.setQueryData(kgKeys.pkgNode(userId, nodeId), normalizeNodeResponse(response));
      void queryClient.invalidateQueries({ queryKey: kgKeys.pkgNodes(userId) });
    },
    ...options,
  });
}

export function useDeletePKGNode(
  userId: UserId,
  nodeId: NodeId,
  options?: UseMutationOptions<void>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => pkgNodesApi.delete(userId, nodeId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: kgKeys.pkgNode(userId, nodeId) });
      void queryClient.invalidateQueries({ queryKey: kgKeys.pkg(userId) });
      void queryClient.invalidateQueries({ queryKey: kgKeys.comparison(userId) });
      void queryClient.invalidateQueries({ queryKey: ['content', 'cards'] });
    },
    ...options,
  });
}

// ============================================================================
// PKG Edge Hooks
// ============================================================================

export function usePKGEdges(
  userId: UserId,
  options?: Omit<
    UseQueryOptions<EdgesListResponse, Error, IGraphEdgeDto[]>,
    'queryKey' | 'queryFn'
  > & {
    studyMode?: StudyMode;
  }
) {
  const { studyMode, ...queryOptions } = options ?? {};

  return useQuery({
    queryKey: kgKeys.pkgEdges(userId, studyMode),
    queryFn: () => pkgEdgesApi.list(userId, studyMode !== undefined ? { studyMode } : undefined),
    select: (r) => extractListData<Record<string, unknown>>(r).map(normalizeGraphEdgeEntry),
    enabled: userId !== '',
    ...queryOptions,
  });
}

export function useCreatePKGEdge(
  userId: UserId,
  options?: UseMutationOptions<EdgeResponse, Error, ICreateEdgeInput>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => pkgEdgesApi.create(userId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: kgKeys.pkgEdges(userId) });
    },
    ...options,
  });
}

export function useDeletePKGEdge(
  userId: UserId,
  edgeId: EdgeId,
  options?: UseMutationOptions<void>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => pkgEdgesApi.delete(userId, edgeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: kgKeys.pkgEdges(userId) });
    },
    ...options,
  });
}

// ============================================================================
// PKG Traversal Hooks
// ============================================================================

export function usePKGSubgraph(
  userId: UserId,
  params: ISubgraphParams,
  options?: Omit<UseQueryOptions<SubgraphResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: kgKeys.pkgSubgraph(userId, params),
    queryFn: () => pkgTraversalApi.getSubgraph(userId, params),
    enabled: userId !== '' && params.rootNodeId !== '',
    ...options,
  });
}

export function usePKGPrerequisites(
  userId: UserId,
  nodeId: NodeId,
  options?: Omit<UseQueryOptions<PrerequisiteChainResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: kgKeys.pkgPrerequisites(userId, nodeId),
    queryFn: () => pkgTraversalApi.getPrerequisites(userId, nodeId),
    enabled: userId !== '' && nodeId !== '',
    ...options,
  });
}

export function useKnowledgeFrontier(
  userId: UserId,
  domain?: string,
  studyMode?: StudyMode,
  options?: Omit<UseQueryOptions<FrontierResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: [...kgKeys.pkgFrontier(userId), domain, studyMode ?? null] as const,
    queryFn: () => pkgTraversalApi.getFrontier(userId, domain ?? '', studyMode),
    enabled: userId !== '' && domain !== undefined && domain !== '',
    staleTime: 2 * 60 * 1000,
    ...options,
  });
}

export function useBridgeNodes(
  userId: UserId,
  domain?: string,
  studyMode?: StudyMode,
  options?: Omit<UseQueryOptions<BridgeNodesResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: [...kgKeys.pkgBridges(userId), domain, studyMode ?? null] as const,
    queryFn: () => pkgTraversalApi.getBridges(userId, domain ?? '', studyMode),
    enabled: userId !== '' && domain !== undefined && domain !== '',
    ...options,
  });
}

export function usePKGCentrality(
  userId: UserId,
  options?: Omit<UseQueryOptions<CentralityResponse, Error, ICentralityDto>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: kgKeys.pkgCentrality(userId),
    queryFn: () => pkgTraversalApi.getCentrality(userId),
    select: (r) => r.data,
    enabled: userId !== '',
    ...options,
  });
}

export function useCommonAncestors(
  userId: UserId,
  options?: UseMutationOptions<NodesListResponse, Error, ICommonAncestorsInput>
) {
  return useMutation({
    mutationFn: (data) => pkgTraversalApi.getCommonAncestors(userId, data),
    ...options,
  });
}

export function usePKGOperations(
  userId: UserId,
  options?: Omit<UseQueryOptions<OperationsResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: kgKeys.pkgOps(userId),
    queryFn: () => pkgOperationsApi.list(userId),
    enabled: userId !== '',
    ...options,
  });
}

// ============================================================================
// CKG Hooks
// ============================================================================

export function useCKGNodes(
  options?: Omit<
    UseQueryOptions<NodesListResponse, Error, IGraphNodeDto[]>,
    'queryKey' | 'queryFn'
  > &
    IGraphNodeQueryParams
) {
  const {
    page,
    pageSize,
    nodeType,
    domain,
    search,
    searchMode,
    sortBy,
    sortOrder,
    studyMode,
    ...queryOptions
  } = options ?? {};
  const params =
    page !== undefined ||
    pageSize !== undefined ||
    nodeType !== undefined ||
    domain !== undefined ||
    search !== undefined ||
    searchMode !== undefined ||
    sortBy !== undefined ||
    sortOrder !== undefined ||
    studyMode !== undefined
      ? {
          ...(page !== undefined ? { page } : {}),
          ...(pageSize !== undefined ? { pageSize } : {}),
          ...(nodeType !== undefined ? { nodeType } : {}),
          ...(domain !== undefined ? { domain } : {}),
          ...(search !== undefined ? { search } : {}),
          ...(searchMode !== undefined ? { searchMode } : {}),
          ...(sortBy !== undefined ? { sortBy } : {}),
          ...(sortOrder !== undefined ? { sortOrder } : {}),
          ...(studyMode !== undefined ? { studyMode } : {}),
        }
      : undefined;

  async function fetchAllNodes(): Promise<NodesListResponse> {
    let response = await ckgNodesApi.list({ page: 1, pageSize: 200 });
    if (response.pagination?.hasMore !== true) {
      return response;
    }

    const collected = [...extractListData<Record<string, unknown>>(response)];
    let nextPage = 2;

    while (response.pagination?.hasMore === true) {
      response = await ckgNodesApi.list({ page: nextPage, pageSize: 200 });
      collected.push(...extractListData<Record<string, unknown>>(response));
      nextPage += 1;
    }

    return {
      ...response,
      data: collected as unknown as IGraphNodeDto[],
      ...(response.pagination !== undefined
        ? {
            pagination: {
              ...response.pagination,
              offset: 0,
              limit: 200,
              total: collected.length,
              hasMore: false,
            },
          }
        : {}),
    };
  }

  async function fetchNodes(): Promise<NodesListResponse> {
    if (params !== undefined) {
      return ckgNodesApi.list(params);
    }

    return fetchAllNodes();
  }

  return useQuery({
    queryKey: kgKeys.ckgNodes(params),
    queryFn: fetchNodes,
    select: (r) => extractListData<Record<string, unknown>>(r).map(normalizeGraphNodeEntry),
    staleTime: 10 * 60 * 1000,
    ...queryOptions,
  });
}

export function useCKGEdges(
  options?: Omit<UseQueryOptions<EdgesListResponse, Error, IGraphEdgeDto[]>, 'queryKey' | 'queryFn'>
) {
  async function fetchAllEdges(): Promise<EdgesListResponse> {
    let response = await ckgEdgesApi.list({ page: 1, pageSize: 200 });
    if (response.pagination?.hasMore !== true) {
      return response;
    }

    const collected = [...extractListData<Record<string, unknown>>(response)];
    let nextPage = 2;

    while (response.pagination?.hasMore === true) {
      response = await ckgEdgesApi.list({ page: nextPage, pageSize: 200 });
      collected.push(...extractListData<Record<string, unknown>>(response));
      nextPage += 1;
    }

    return {
      ...response,
      data: collected as unknown as IGraphEdgeDto[],
      ...(response.pagination !== undefined
        ? {
            pagination: {
              ...response.pagination,
              offset: 0,
              limit: 200,
              total: collected.length,
              hasMore: false,
            },
          }
        : {}),
    };
  }

  return useQuery({
    queryKey: kgKeys.ckgEdges(),
    queryFn: fetchAllEdges,
    select: (r) => extractListData<Record<string, unknown>>(r).map(normalizeGraphEdgeEntry),
    staleTime: 10 * 60 * 1000,
    ...options,
  });
}

export function useCKGMutations(
  filters?: ICkgMutationFilters,
  options?: Omit<
    UseQueryOptions<CkgMutationsResponse, Error, ICkgMutationDto[]>,
    'queryKey' | 'queryFn'
  >
) {
  async function fetchAllMutations(): Promise<CkgMutationsResponse> {
    const pageSize = Math.min(filters?.pageSize ?? filters?.limit ?? 100, 100);
    const requestedPage =
      filters?.page ??
      (filters?.offset !== undefined ? Math.floor(filters.offset / pageSize) + 1 : undefined);
    let response = await ckgMutationsApi.list({
      ...filters,
      ...(requestedPage !== undefined ? { page: requestedPage } : {}),
      pageSize,
    });

    if (requestedPage !== undefined || response.pagination?.hasMore !== true) {
      return response;
    }

    const collected = [...normalizeMutationsResponse(response).data];
    let nextPage = 2;

    while (response.pagination?.hasMore === true) {
      response = await ckgMutationsApi.list({
        ...filters,
        page: nextPage,
        pageSize,
      });
      collected.push(...normalizeMutationsResponse(response).data);
      nextPage += 1;
    }

    return {
      ...response,
      data: collected,
      ...(response.pagination !== undefined
        ? {
            pagination: {
              ...response.pagination,
              offset: 0,
              limit: pageSize,
              total: collected.length,
              hasMore: false,
            },
          }
        : {}),
    };
  }

  return useQuery({
    queryKey: kgKeys.ckgMutations(filters),
    queryFn: fetchAllMutations,
    select: (response) =>
      normalizeMutationsResponse(response).data.filter((mutation) =>
        matchesMutationFilters(mutation, filters)
      ),
    ...options,
  });
}

export function useCKGMutation(
  id: MutationId,
  options?: Omit<
    UseQueryOptions<CkgMutationResponse, Error, ICkgMutationDto>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: kgKeys.ckgMutation(id),
    queryFn: () => ckgMutationsApi.get(id),
    select: (response) => normalizeMutationResponse(response).data,
    enabled: id !== '',
    ...options,
  });
}

export function usePreviewCkgEdgeAuthoring(
  options?: UseMutationOptions<
    CkgEdgeAuthoringPreviewResponse,
    Error,
    ICkgEdgeAuthoringPreviewInput
  >
) {
  return useMutation({
    mutationFn: (input) => ckgEdgesApi.previewAuthoring(input),
    ...options,
  });
}

export function usePreviewCkgNodeBatchAuthoring(
  options?: UseMutationOptions<
    CkgNodeBatchAuthoringPreviewResponse,
    Error,
    ICkgNodeBatchAuthoringPreviewInput
  >
) {
  return useMutation({
    mutationFn: (input) => ckgNodesApi.previewBatchAuthoring(input),
    ...options,
  });
}

export function useProposeCkgMutation(
  options?: UseMutationOptions<CkgMutationResponse, Error, ICkgMutationProposalInput>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => ckgMutationsApi.propose(input),
    onSuccess: async (response) => {
      const normalized = normalizeMutationResponse(response);
      queryClient.setQueryData(kgKeys.ckgMutation(normalized.data.id), normalized);
      await queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutations() });
    },
    ...options,
  });
}

export function useApproveMutation(
  options?: UseMutationOptions<CkgMutationResponse, Error, { id: MutationId; note?: string }>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }) => ckgMutationsApi.approve(id, note),
    onSuccess: async (response, { id }) => {
      queryClient.setQueryData(kgKeys.ckgMutation(id), normalizeMutationResponse(response));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutations() }),
        invalidateCkgGraphQueries(queryClient),
      ]);
    },
    ...options,
  });
}

export function useRejectMutation(
  options?: UseMutationOptions<CkgMutationResponse, Error, { id: MutationId; note?: string }>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }) => ckgMutationsApi.reject(id, note),
    onSuccess: (response, { id }) => {
      queryClient.setQueryData(kgKeys.ckgMutation(id), normalizeMutationResponse(response));
      void queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutations() });
    },
    ...options,
  });
}

export function useReconcileMutation(
  options?: UseMutationOptions<CkgMutationResponse, Error, { id: MutationId; note: string }>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }) => ckgMutationsApi.reconcile(id, note),
    onSuccess: async (response, { id }) => {
      queryClient.setQueryData(kgKeys.ckgMutation(id), normalizeMutationResponse(response));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutations() }),
        invalidateCkgGraphQueries(queryClient),
      ]);
    },
    ...options,
  });
}

export function useRecoverRejectMutation(
  options?: UseMutationOptions<CkgMutationResponse, Error, { id: MutationId; note: string }>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }) => ckgMutationsApi.recoverReject(id, note),
    onSuccess: async (response, { id }) => {
      queryClient.setQueryData(kgKeys.ckgMutation(id), normalizeMutationResponse(response));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutations() }),
        invalidateCkgGraphQueries(queryClient),
      ]);
    },
    ...options,
  });
}

export function useCheckMutationSafeRetry(
  options?: UseMutationOptions<CkgMutationRecoveryCheckResponse, Error, { id: MutationId }>
) {
  return useMutation({
    mutationFn: ({ id }) => ckgMutationsApi.checkSafeRetry(id),
    ...options,
  });
}

export function useCheckMutationReconcile(
  options?: UseMutationOptions<CkgMutationRecoveryCheckResponse, Error, { id: MutationId }>
) {
  return useMutation({
    mutationFn: ({ id }) => ckgMutationsApi.checkReconcile(id),
    ...options,
  });
}

export function useBulkReviewMutations(
  options?: UseMutationOptions<CkgBulkReviewResponse, Error, ICkgBulkReviewInput>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => ckgMutationsApi.bulkReview(input),
    onSuccess: async (response, input) => {
      const result = response.data;
      await Promise.all(
        result.succeededMutationIds.map(async (mutationId) => {
          await queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutation(mutationId) });
        })
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutations() }),
        invalidateCkgGraphQueries(queryClient),
      ]);
      if (input.importRunId !== undefined) {
        await queryClient.invalidateQueries({
          queryKey: kgKeys.ckgMutations({ importRunId: input.importRunId }),
        });
      }
    },
    ...options,
  });
}

export function useResetCKG(
  options?: UseMutationOptions<CkgResetResponse, Error, ICkgResetInput>
) {
  const queryClient = useQueryClient();
  const { onSuccess, ...mutationOptions } = options ?? {};
  return useMutation({
    mutationFn: (input) => ckgMaintenanceApi.reset(input),
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries({ queryKey: kgKeys.ckg() });
      await onSuccess?.(...args);
    },
    ...mutationOptions,
  });
}

export function useCKGMutationAuditLog(
  id: MutationId,
  options?: Omit<
    UseQueryOptions<CkgMutationAuditLogResponse, Error, ICkgMutationAuditLogDto>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: [...kgKeys.ckgMutation(id), 'audit-log'] as const,
    queryFn: () => ckgMutationsApi.getAuditLog(id),
    select: (response) => normalizeMutationAuditLogResponse(response).data,
    enabled: id !== '',
    ...options,
  });
}

export function useRequestRevision(
  options?: UseMutationOptions<CkgMutationResponse, Error, { id: MutationId; feedback: string }>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, feedback }) => ckgMutationsApi.requestRevision(id, feedback),
    onSuccess: (response, { id }) => {
      queryClient.setQueryData(kgKeys.ckgMutation(id), normalizeMutationResponse(response));
      void queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutations() });
    },
    ...options,
  });
}

export function useCancelMutation(
  options?: UseMutationOptions<CkgMutationResponse, Error, MutationId>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => ckgMutationsApi.cancel(id),
    onSuccess: (response, id) => {
      queryClient.setQueryData(kgKeys.ckgMutation(id), normalizeMutationResponse(response));
      void queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutations() });
    },
    ...options,
  });
}

export function useRetryMutation(
  options?: UseMutationOptions<CkgMutationResponse, Error, MutationId>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id) => normalizeMutationResponse(await ckgMutationsApi.retry(id)),
    onSuccess: async (response, id) => {
      queryClient.setQueryData(kgKeys.ckgMutation(response.data.id), response);
      queryClient.setQueriesData<CkgMutationsResponse>(
        { queryKey: kgKeys.ckgMutations() },
        (cached) => upsertMutationInMutationsResponse(cached, response.data, id)
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutation(id) }),
        queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutations() }),
        invalidateCkgGraphQueries(queryClient),
      ]);
    },
    ...options,
  });
}

export function useOntologyImportSources(
  options?: Omit<
    UseQueryOptions<OntologyImportSourcesResponse, Error, IOntologyImportSourceDto[]>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: kgKeys.ontologyImportSources(),
    queryFn: ontologyImportsApi.listSources,
    select: (response) => extractListData<IOntologyImportSourceDto>(response),
    staleTime: 10 * 60 * 1000,
    ...options,
  });
}

export function useRegisterOntologyImportSource(
  options?: UseMutationOptions<
    OntologyImportSourceResponse,
    Error,
    IRegisterOntologyImportSourceInput
  >
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => ontologyImportsApi.registerSource(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: kgKeys.ontologyImportSources() });
      void queryClient.invalidateQueries({ queryKey: kgKeys.ontologyImportsSystemStatus() });
    },
    ...options,
  });
}

export function useUpdateOntologyImportSource(
  options?: UseMutationOptions<
    OntologyImportSourceResponse,
    Error,
    { sourceId: string; input: IUpdateOntologyImportSourceInput }
  >
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sourceId, input }) => ontologyImportsApi.updateSource(sourceId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: kgKeys.ontologyImportSources() });
    },
    ...options,
  });
}

export function useSyncOntologyImportSource(
  options?: UseMutationOptions<OntologyImportSourceResponse, Error, string>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sourceId) => ontologyImportsApi.syncSource(sourceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: kgKeys.ontologyImportSources() });
    },
    ...options,
  });
}

export function useOntologyImportsSystemStatus(
  options?: Omit<
    UseQueryOptions<OntologyImportsSystemStatusResponse, Error, IOntologyImportsSystemStatusDto>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: kgKeys.ontologyImportsSystemStatus(),
    queryFn: ontologyImportsApi.getSystemStatus,
    select: (response) => response.data,
    staleTime: 30 * 1000,
    ...options,
  });
}

export function useOntologyImportRuns(
  filters?: IListOntologyImportRunsParams,
  options?: Omit<
    UseQueryOptions<OntologyImportRunsResponse, Error, IOntologyImportRunDto[]>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: kgKeys.ontologyImportRuns(filters),
    queryFn: () => ontologyImportsApi.listRuns(filters),
    select: (response) => extractListData<IOntologyImportRunDto>(response),
    ...options,
  });
}

export function useOntologyImportRun(
  runId: string,
  options?: Omit<
    UseQueryOptions<OntologyImportRunDetailResponse, Error, IOntologyImportRunDetailDto>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: kgKeys.ontologyImportRun(runId),
    queryFn: () => ontologyImportsApi.getRun(runId),
    select: (response) => response.data,
    enabled: runId !== '',
    ...options,
  });
}

export function useOntologyImportArtifactContent(
  runId: string,
  artifactId: string,
  options?: Omit<
    UseQueryOptions<
      OntologyImportArtifactContentResponse,
      Error,
      IOntologyImportArtifactContentDto
    >,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: [...kgKeys.ontologyImportRun(runId), 'artifact', artifactId] as const,
    queryFn: () => ontologyImportsApi.getArtifactContent(runId, artifactId),
    select: (response) => response.data,
    enabled: runId !== '' && artifactId !== '',
    ...options,
  });
}

export function useCreateOntologyImportRun(
  options?: UseMutationOptions<OntologyImportRunResponse, Error, ICreateOntologyImportRunInput>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => ontologyImportsApi.createRun(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: kgKeys.ontologyImportRuns() });
    },
    ...options,
  });
}

export function useStartOntologyImportRun(
  options?: UseMutationOptions<OntologyImportRunResponse, Error, string>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (runId) => ontologyImportsApi.startRun(runId),
    onSuccess: async (_response, runId) => {
      await queryClient.invalidateQueries({ queryKey: kgKeys.ontologyImportRun(runId) });
      void queryClient.invalidateQueries({ queryKey: kgKeys.ontologyImportRuns() });
    },
    ...options,
  });
}

export function useCancelOntologyImportRun(
  options?: UseMutationOptions<OntologyImportRunResponse, Error, { runId: string; reason?: string }>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, reason }) =>
      ontologyImportsApi.cancelRun(runId, reason !== undefined ? { reason } : undefined),
    onSuccess: async (_response, { runId }) => {
      await queryClient.invalidateQueries({ queryKey: kgKeys.ontologyImportRun(runId) });
      void queryClient.invalidateQueries({ queryKey: kgKeys.ontologyImportRuns() });
    },
    ...options,
  });
}

export function useRetryOntologyImportRun(
  options?: UseMutationOptions<OntologyImportRunResponse, Error, string>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (runId) => ontologyImportsApi.retryRun(runId),
    onSuccess: async (_response, runId) => {
      await queryClient.invalidateQueries({ queryKey: kgKeys.ontologyImportRun(runId) });
      void queryClient.invalidateQueries({ queryKey: kgKeys.ontologyImportRuns() });
    },
    ...options,
  });
}

export function useSubmitOntologyImportRunPreview(
  options?: UseMutationOptions<
    OntologyMutationPreviewSubmissionResponse,
    Error,
    ISubmitOntologyImportRunPreviewInput
  >
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => ontologyImportsApi.submitRunPreview(input),
    onSuccess: async (_response, input) => {
      await queryClient.invalidateQueries({ queryKey: kgKeys.ontologyImportRun(input.runId) });
      void queryClient.invalidateQueries({ queryKey: kgKeys.ontologyImportRuns() });
      void queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutations() });
    },
    ...options,
  });
}

// ============================================================================
// Metrics + Health Hooks
// ============================================================================

export function useRefreshKnowledgeGraphAnalytics(
  userId: UserId,
  options?: UseMutationOptions<
    {
      metrics: IStructuralMetricsDto;
      stage: IMetacognitiveStageAssessmentDto;
    },
    Error,
    { studyMode?: StudyMode }
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ studyMode }) => {
      const [metricsResponse, stageResponse] = await Promise.all([
        metricsApi.compute(userId, studyMode),
        healthApi.getStage(userId, studyMode),
      ]);

      return {
        metrics: metricsResponse.data,
        stage: stageResponse.data,
      };
    },
    onSuccess: async (_result, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: kgKeys.metrics(userId, variables.studyMode) }),
        queryClient.invalidateQueries({ queryKey: kgKeys.health(userId, variables.studyMode) }),
        queryClient.invalidateQueries({
          queryKey: kgKeys.healthStage(userId, variables.studyMode),
        }),
      ]);
    },
    ...options,
  });
}

export function useStructuralMetrics(
  userId: UserId,
  options?: Omit<UseQueryOptions<MetricsResponse>, 'queryKey' | 'queryFn'> & {
    studyMode?: StudyMode;
  }
) {
  const { studyMode, ...queryOptions } = options ?? {};

  return useQuery({
    queryKey: kgKeys.metrics(userId, studyMode),
    queryFn: () => metricsApi.get(userId, studyMode),
    enabled: userId !== '',
    staleTime: 5 * 60 * 1000,
    ...queryOptions,
  });
}

export function useNodeMasterySummary(
  userId: UserId,
  options: Omit<
    UseQueryOptions<NodeMasterySummaryResponse, Error, INodeMasterySummaryDto>,
    'queryKey' | 'queryFn'
  > & {
    studyMode: StudyMode;
    domain?: string;
    masteryThreshold?: number;
  }
) {
  const { studyMode, domain, masteryThreshold, ...queryOptions } = options;
  const params = {
    studyMode,
    ...(domain !== undefined ? { domain } : {}),
    ...(masteryThreshold !== undefined ? { masteryThreshold } : {}),
  };

  return useQuery({
    queryKey: kgKeys.masterySummary(userId, params),
    queryFn: () => masteryApi.getSummary(userId, params),
    select: (response) => response.data,
    enabled: userId !== '',
    staleTime: 5 * 60 * 1000,
    ...queryOptions,
  });
}

export function useMetricHistory(
  userId: UserId,
  options?: Omit<UseQueryOptions<MetricHistoryResponse>, 'queryKey' | 'queryFn'> & {
    studyMode?: StudyMode;
  }
) {
  const { studyMode, ...queryOptions } = options ?? {};

  return useQuery({
    queryKey: kgKeys.metricHistory(userId, studyMode),
    queryFn: () => metricsApi.getHistory(userId, studyMode),
    enabled: userId !== '',
    ...queryOptions,
  });
}

export function useStructuralHealth(
  userId: UserId,
  options?: Omit<UseQueryOptions<HealthResponse>, 'queryKey' | 'queryFn'> & {
    studyMode?: StudyMode;
  }
) {
  const { studyMode, ...queryOptions } = options ?? {};

  return useQuery({
    queryKey: kgKeys.health(userId, studyMode),
    queryFn: () => healthApi.get(userId, studyMode),
    enabled: userId !== '',
    staleTime: 5 * 60 * 1000,
    ...queryOptions,
  });
}

export function useMetacognitiveStage(
  userId: UserId,
  options?: Omit<UseQueryOptions<StageResponse>, 'queryKey' | 'queryFn'> & {
    studyMode?: StudyMode;
  }
) {
  const { studyMode, ...queryOptions } = options ?? {};

  return useQuery({
    queryKey: kgKeys.healthStage(userId, studyMode),
    queryFn: () => healthApi.getStage(userId, studyMode),
    enabled: userId !== '',
    staleTime: 5 * 60 * 1000,
    ...queryOptions,
  });
}

// ============================================================================
// Misconception Hooks
// ============================================================================

export function useMisconceptions(
  userId: UserId,
  options?: Omit<UseQueryOptions<MisconceptionsResponse>, 'queryKey' | 'queryFn'> & {
    studyMode?: StudyMode;
  }
) {
  const { studyMode, ...queryOptions } = options ?? {};

  return useQuery({
    queryKey: kgKeys.misconceptions(userId, studyMode),
    queryFn: () => misconceptionsApi.list(userId, studyMode),
    select: (response) => ({
      ...response,
      data: extractListData<Record<string, unknown>>(response).map(normalizeMisconceptionEntry),
    }),
    enabled: userId !== '',
    ...queryOptions,
  });
}

export function useDetectMisconceptions(
  userId: UserId,
  options?: UseMutationOptions<MisconceptionDetectionResponse, Error, { studyMode?: StudyMode }>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables) => misconceptionsApi.detect(userId, variables.studyMode),
    onSuccess: (_response, variables) => {
      void queryClient.invalidateQueries({
        queryKey: kgKeys.misconceptions(userId, variables.studyMode),
      });
    },
    ...options,
  });
}

export function useUpdateMisconceptionStatus(
  userId: UserId,
  options?: UseMutationOptions<
    MisconceptionResponse,
    Error,
    { id: string; data: IUpdateMisconceptionStatusInput }
  >
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => misconceptionsApi.updateStatus(userId, id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [...kgKeys.all, 'misconceptions', userId],
      });
    },
    ...options,
  });
}

// ============================================================================
// Comparison Hook
// ============================================================================

export function usePKGCKGComparison(
  userId: UserId,
  params?: IComparisonQueryParams,
  options?: Omit<
    UseQueryOptions<ComparisonResponse, Error, IPkgCkgComparisonDto>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: kgKeys.comparison(userId, params),
    queryFn: () => comparisonApi.compare(userId, params),
    select: (r) => r.data,
    enabled: userId !== '',
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}
