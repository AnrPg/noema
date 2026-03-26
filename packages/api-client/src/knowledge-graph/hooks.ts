/**
 * @noema/api-client - Knowledge Graph Service Hooks
 *
 * TanStack Query hooks for Knowledge Graph Service endpoints:
 *   PKG nodes/edges/traversal, CKG nodes/edges/mutations,
 *   structural metrics, health, misconceptions, PKG/CKG comparison.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import type { EdgeId, MutationId, NodeId, UserId } from '@noema/types';
import {
  ckgEdgesApi,
  ckgMutationsApi,
  ckgNodesApi,
  comparisonApi,
  healthApi,
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
  ICkgMutationAuditLogDto,
  ICkgMutationDto,
  ICkgMutationFilters,
  ICommonAncestorsInput,
  IComparisonQueryParams,
  ICreateOntologyImportRunInput,
  IRegisterOntologyImportSourceInput,
  ICreateEdgeInput,
  ICreateNodeInput,
  IGraphEdgeDto,
  IGraphNodeDto,
  IListOntologyImportRunsParams,
  IOntologyImportRunDetailDto,
  IOntologyImportRunDto,
  IOntologyImportSourceDto,
  IOntologyImportsSystemStatusDto,
  IOntologyImportArtifactContentDto,
  IUpdateOntologyImportSourceInput,
  IPkgCkgComparisonDto,
  ISubgraphParams,
  IUpdateMisconceptionStatusInput,
  IUpdateNodeInput,
  BridgeNodesResponse,
  CentralityResponse,
  CkgBulkReviewResponse,
  CkgMutationAuditLogResponse,
  CkgMutationRecoveryCheckResponse,
  CkgMutationResponse,
  CkgMutationsResponse,
  ComparisonResponse,
  EdgeResponse,
  EdgesListResponse,
  FrontierResponse,
  HealthResponse,
  MetricHistoryResponse,
  MetricsResponse,
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
  if (explicitType !== '' && explicitType !== 'concept') {
    return explicitType as IGraphNodeDto['type'];
  }

  const lexicalSignals = collectMetadataSourceTypes(metadata).join(' ').toLowerCase();
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

function normalizeGraphNodeEntry(entry: Record<string, unknown>): IGraphNodeDto {
  const metadata = recordValue(entry['metadata'] ?? entry['properties']);
  const rawLabel = stringValue(
    entry['label'],
    stringValue(entry['nodeId'], stringValue(metadata['uri'], ''))
  );
  const domain = stringValue(entry['domain']);

  return {
    id: stringValue(entry['id'], stringValue(entry['nodeId'])) as NodeId,
    type: inferNormalizedGraphNodeType(entry, metadata),
    label: normalizeGraphLabel(rawLabel, metadata),
    description: normalizeGraphDescription(entry, metadata),
    tags:
      stringArrayValue(entry['tags']).length > 0
        ? stringArrayValue(entry['tags'])
        : domain !== ''
          ? [domain]
          : [],
    metadata,
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
      stringValue(entry['edgeType'], 'related')
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
  const data = response.data as unknown as Record<string, unknown>;
  const entries = Array.isArray(data['entries']) ? data['entries'] : [];
  const mutationId = stringValue(data['mutationId']) as MutationId;

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
  pkgNodes: (userId: UserId) => [...kgKeys.pkg(userId), 'nodes'] as const,
  pkgNode: (userId: UserId, nodeId: NodeId) => [...kgKeys.pkgNodes(userId), nodeId] as const,
  pkgEdges: (userId: UserId) => [...kgKeys.pkg(userId), 'edges'] as const,
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
  ckgNodes: () => [...kgKeys.ckg(), 'nodes'] as const,
  ckgEdges: () => [...kgKeys.ckg(), 'edges'] as const,
  ckgMutations: (filters?: ICkgMutationFilters) => [...kgKeys.ckg(), 'mutations', filters] as const,
  ckgMutation: (id: MutationId) => [...kgKeys.ckg(), 'mutations', id] as const,
  ontologyImports: () => [...kgKeys.ckg(), 'ontology-imports'] as const,
  ontologyImportsSystemStatus: () => [...kgKeys.ontologyImports(), 'system-status'] as const,
  ontologyImportSources: () => [...kgKeys.ontologyImports(), 'sources'] as const,
  ontologyImportRuns: (filters?: IListOntologyImportRunsParams) =>
    [...kgKeys.ontologyImports(), 'runs', filters] as const,
  ontologyImportRun: (runId: string) => [...kgKeys.ontologyImports(), 'runs', runId] as const,
  metrics: (userId: UserId) => [...kgKeys.all, 'metrics', userId] as const,
  metricHistory: (userId: UserId) => [...kgKeys.metrics(userId), 'history'] as const,
  health: (userId: UserId) => [...kgKeys.all, 'health', userId] as const,
  healthStage: (userId: UserId) => [...kgKeys.health(userId), 'stage'] as const,
  misconceptions: (userId: UserId) => [...kgKeys.all, 'misconceptions', userId] as const,
  comparison: (userId: UserId, params?: IComparisonQueryParams) =>
    [...kgKeys.all, 'comparison', userId, params] as const,
};

// ============================================================================
// PKG Node Hooks
// ============================================================================

export function usePKGNodes(
  userId: UserId,
  options?: Omit<UseQueryOptions<NodesListResponse, Error, IGraphNodeDto[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: kgKeys.pkgNodes(userId),
    queryFn: () => pkgNodesApi.list(userId),
    select: (r) => extractListData<Record<string, unknown>>(r).map(normalizeGraphNodeEntry),
    enabled: userId !== '',
    ...options,
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
      void queryClient.invalidateQueries({ queryKey: kgKeys.pkgNodes(userId) });
    },
    ...options,
  });
}

// ============================================================================
// PKG Edge Hooks
// ============================================================================

export function usePKGEdges(
  userId: UserId,
  options?: Omit<UseQueryOptions<EdgesListResponse, Error, IGraphEdgeDto[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: kgKeys.pkgEdges(userId),
    queryFn: () => pkgEdgesApi.list(userId),
    select: (r) => extractListData<Record<string, unknown>>(r).map(normalizeGraphEdgeEntry),
    enabled: userId !== '',
    ...options,
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
  options?: Omit<UseQueryOptions<FrontierResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: [...kgKeys.pkgFrontier(userId), domain] as const,
    queryFn: () => pkgTraversalApi.getFrontier(userId, domain ?? ''),
    enabled: userId !== '' && domain !== undefined && domain !== '',
    staleTime: 2 * 60 * 1000,
    ...options,
  });
}

export function useBridgeNodes(
  userId: UserId,
  domain?: string,
  options?: Omit<UseQueryOptions<BridgeNodesResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: [...kgKeys.pkgBridges(userId), domain] as const,
    queryFn: () => pkgTraversalApi.getBridges(userId, domain ?? ''),
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
  options?: Omit<UseQueryOptions<NodesListResponse, Error, IGraphNodeDto[]>, 'queryKey' | 'queryFn'>
) {
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

  return useQuery({
    queryKey: kgKeys.ckgNodes(),
    queryFn: fetchAllNodes,
    select: (r) => extractListData<Record<string, unknown>>(r).map(normalizeGraphNodeEntry),
    staleTime: 10 * 60 * 1000,
    ...options,
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

export function useApproveMutation(
  options?: UseMutationOptions<CkgMutationResponse, Error, { id: MutationId; note?: string }>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }) => ckgMutationsApi.approve(id, note),
    onSuccess: (response, { id }) => {
      queryClient.setQueryData(kgKeys.ckgMutation(id), normalizeMutationResponse(response));
      void queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutations() });
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
    onSuccess: (response, { id }) => {
      queryClient.setQueryData(kgKeys.ckgMutation(id), normalizeMutationResponse(response));
      void queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutations() });
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
    onSuccess: (response, { id }) => {
      queryClient.setQueryData(kgKeys.ckgMutation(id), normalizeMutationResponse(response));
      void queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutations() });
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
      await queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutations() });
      if (input.importRunId !== undefined) {
        await queryClient.invalidateQueries({
          queryKey: kgKeys.ckgMutations({ importRunId: input.importRunId }),
        });
      }
    },
    ...options,
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
    onSuccess: (response, id) => {
      queryClient.setQueryData(kgKeys.ckgMutation(response.data.id), response);
      queryClient.setQueriesData<CkgMutationsResponse>(
        { queryKey: kgKeys.ckgMutations() },
        (cached) => upsertMutationInMutationsResponse(cached, response.data, id)
      );
      void queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutation(id) });
      void queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutations() });
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
  options?: UseMutationOptions<OntologyMutationPreviewSubmissionResponse, Error, string>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (runId) => ontologyImportsApi.submitRunPreview(runId),
    onSuccess: async (_response, runId) => {
      await queryClient.invalidateQueries({ queryKey: kgKeys.ontologyImportRun(runId) });
      void queryClient.invalidateQueries({ queryKey: kgKeys.ontologyImportRuns() });
      void queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutations() });
    },
    ...options,
  });
}

// ============================================================================
// Metrics + Health Hooks
// ============================================================================

export function useStructuralMetrics(
  userId: UserId,
  options?: Omit<UseQueryOptions<MetricsResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: kgKeys.metrics(userId),
    queryFn: () => metricsApi.get(userId),
    enabled: userId !== '',
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

export function useMetricHistory(
  userId: UserId,
  options?: Omit<UseQueryOptions<MetricHistoryResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: kgKeys.metricHistory(userId),
    queryFn: () => metricsApi.getHistory(userId),
    enabled: userId !== '',
    ...options,
  });
}

export function useStructuralHealth(
  userId: UserId,
  options?: Omit<UseQueryOptions<HealthResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: kgKeys.health(userId),
    queryFn: () => healthApi.get(userId),
    enabled: userId !== '',
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

export function useMetacognitiveStage(
  userId: UserId,
  options?: Omit<UseQueryOptions<StageResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: kgKeys.healthStage(userId),
    queryFn: () => healthApi.getStage(userId),
    enabled: userId !== '',
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

// ============================================================================
// Misconception Hooks
// ============================================================================

export function useMisconceptions(
  userId: UserId,
  options?: Omit<UseQueryOptions<MisconceptionsResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: kgKeys.misconceptions(userId),
    queryFn: () => misconceptionsApi.list(userId),
    select: (response) => ({
      ...response,
      data: extractListData<Record<string, unknown>>(response).map(normalizeMisconceptionEntry),
    }),
    enabled: userId !== '',
    ...options,
  });
}

export function useDetectMisconceptions(
  userId: UserId,
  options?: UseMutationOptions<MisconceptionDetectionResponse>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => misconceptionsApi.detect(userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: kgKeys.misconceptions(userId) });
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
      void queryClient.invalidateQueries({ queryKey: kgKeys.misconceptions(userId) });
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
