import { z } from 'zod';
import { MutationProposalSchema, type IMutationProposal } from './ckg-mutation-dsl.js';
import type { IExecutionContext } from './execution-context.js';

export const ONTOLOGY_SOURCE_IDS = ['yago', 'esco', 'conceptnet'] as const;
export type OntologySourceId = string;

export const ONTOLOGY_SOURCE_ROLES = ['backbone', 'enhancement'] as const;
export type OntologySourceRole = (typeof ONTOLOGY_SOURCE_ROLES)[number];

export const ONTOLOGY_ACCESS_MODES = ['snapshot', 'api', 'linked_data', 'hybrid'] as const;
export type OntologyAccessMode = (typeof ONTOLOGY_ACCESS_MODES)[number];

export const ONTOLOGY_IMPORT_STATUSES = [
  'queued',
  'fetching',
  'fetched',
  'parsing',
  'parsed',
  'staging_validated',
  'ready_for_normalization',
  'failed',
  'cancelled',
] as const;
export type OntologyImportStatus = (typeof ONTOLOGY_IMPORT_STATUSES)[number];

export const ACTIVE_ONTOLOGY_IMPORT_STATUSES = [
  'queued',
  'fetching',
  'fetched',
  'parsing',
  'parsed',
] as const satisfies readonly OntologyImportStatus[];

export const TERMINAL_ONTOLOGY_IMPORT_STATUSES = [
  'staging_validated',
  'ready_for_normalization',
  'failed',
  'cancelled',
] as const satisfies readonly OntologyImportStatus[];

export function isActiveOntologyImportStatus(status: OntologyImportStatus): boolean {
  return ACTIVE_ONTOLOGY_IMPORT_STATUSES.includes(
    status as (typeof ACTIVE_ONTOLOGY_IMPORT_STATUSES)[number]
  );
}

export function isTerminalOntologyImportStatus(status: OntologyImportStatus): boolean {
  return TERMINAL_ONTOLOGY_IMPORT_STATUSES.includes(
    status as (typeof TERMINAL_ONTOLOGY_IMPORT_STATUSES)[number]
  );
}

export const ONTOLOGY_IMPORT_STEP_TYPES = [
  'fetch',
  'checksum',
  'parse',
  'stage',
  'validation',
] as const;
export type OntologyImportStepType = (typeof ONTOLOGY_IMPORT_STEP_TYPES)[number];

export const ONTOLOGY_IMPORT_STEP_STATUSES = [
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
] as const;
export type OntologyImportStepStatus = (typeof ONTOLOGY_IMPORT_STEP_STATUSES)[number];

export const ONTOLOGY_ARTIFACT_KINDS = [
  'raw_payload',
  'manifest',
  'parsed_batch',
  'normalized_batch',
  'mutation_preview',
] as const;
export type OntologyArtifactKind = (typeof ONTOLOGY_ARTIFACT_KINDS)[number];

export const ONTOLOGY_RUN_TRIGGERS = ['manual', 'scheduled', 'retry'] as const;
export type OntologyRunTrigger = (typeof ONTOLOGY_RUN_TRIGGERS)[number];

export const ONTOLOGY_GRAPH_RECORD_KINDS = ['concept', 'relation', 'alias', 'mapping'] as const;
export type OntologyGraphRecordKind = (typeof ONTOLOGY_GRAPH_RECORD_KINDS)[number];

export const ONTOLOGY_GRAPH_NODE_KINDS = ['concept', 'entity', 'literal'] as const;
export type OntologyGraphNodeKind = (typeof ONTOLOGY_GRAPH_NODE_KINDS)[number];

export const ONTOLOGY_GRAPH_EDGE_DIRECTIONS = ['directed', 'undirected'] as const;
export type OntologyGraphEdgeDirection = (typeof ONTOLOGY_GRAPH_EDGE_DIRECTIONS)[number];

export const ONTOLOGY_MAPPING_KINDS = [
  'exact_match',
  'close_match',
  'broad_match',
  'narrow_match',
  'related_match',
] as const;
export type OntologyMappingKind = (typeof ONTOLOGY_MAPPING_KINDS)[number];

export const ONTOLOGY_MERGE_CONFIDENCE_BANDS = ['low', 'medium', 'high'] as const;
export type OntologyMergeConfidenceBand = (typeof ONTOLOGY_MERGE_CONFIDENCE_BANDS)[number];

export const ONTOLOGY_MERGE_CONFLICT_KINDS = [
  'ambiguous_match',
  'domain_mismatch',
  'mapping_conflict',
  'weak_mapping_only',
] as const;
export type OntologyMergeConflictKind = (typeof ONTOLOGY_MERGE_CONFLICT_KINDS)[number];

export const ONTOLOGY_MUTATION_PREVIEW_STATUSES = ['ready', 'blocked'] as const;
export type OntologyMutationPreviewStatus = (typeof ONTOLOGY_MUTATION_PREVIEW_STATUSES)[number];

export const ONTOLOGY_MUTATION_PREVIEW_ENTITY_KINDS = ['concept', 'relation'] as const;
export type OntologyMutationPreviewEntityKind =
  (typeof ONTOLOGY_MUTATION_PREVIEW_ENTITY_KINDS)[number];

export interface IOntologySourceRelease {
  version: string;
  publishedAt: string | null;
  checksum: string | null;
}

export interface IOntologySource {
  id: OntologySourceId;
  name: string;
  role: OntologySourceRole;
  accessMode: OntologyAccessMode;
  description: string;
  homepageUrl: string | null;
  documentationUrl: string | null;
  supportedLanguages: string[];
  supportsIncremental: boolean;
  enabled: boolean;
  latestRelease: IOntologySourceRelease | null;
  createdAt: string;
  updatedAt: string;
}

export interface IOntologyImportArtifact {
  id: string;
  runId: string;
  sourceId: OntologySourceId;
  kind: OntologyArtifactKind;
  storageKey: string;
  contentType: string | null;
  checksum: string | null;
  sizeBytes: number | null;
  createdAt: string;
}

export interface IOntologyImportCheckpoint {
  id: string;
  runId: string;
  step: OntologyImportStepType;
  status: OntologyImportStepStatus;
  startedAt: string | null;
  completedAt: string | null;
  detail: string | null;
}

export interface IOntologyImportRun {
  id: string;
  sourceId: OntologySourceId;
  sourceVersion: string | null;
  configuration: IOntologyImportRunConfiguration;
  submittedMutationIds: string[];
  status: OntologyImportStatus;
  trigger: OntologyRunTrigger;
  initiatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  failureReason: string | null;
}

export interface IOntologyImportRunConfiguration {
  mode: string | null;
  language: string | null;
  seedNodes: string[];
}

export interface IParsedOntologyBatch {
  runId: string;
  sourceId: OntologySourceId;
  sourceVersion: string | null;
  recordCount: number;
  artifactId: string;
}

export interface IOntologyGraphRecordProvenance {
  sourceId: OntologySourceId;
  sourceVersion: string | null;
  runId: string;
  artifactId: string;
  harvestedAt: string;
  license: string | null;
  requestUrl: string | null;
}

export interface IOntologyGraphConceptRecord {
  recordKind: 'concept';
  externalId: string;
  iri: string | null;
  nodeKind: OntologyGraphNodeKind;
  preferredLabel: string;
  altLabels: string[];
  description: string | null;
  languages: string[];
  sourceTypes: string[];
  properties: Record<string, unknown>;
  provenance: IOntologyGraphRecordProvenance;
}

export interface IOntologyGraphRelationRecord {
  recordKind: 'relation';
  externalId: string;
  iri: string | null;
  sourcePredicate: string;
  predicateLabel: string | null;
  subjectExternalId: string;
  objectExternalId: string;
  direction: OntologyGraphEdgeDirection;
  languages: string[];
  properties: Record<string, unknown>;
  provenance: IOntologyGraphRecordProvenance;
}

export interface IOntologyGraphAliasRecord {
  recordKind: 'alias';
  externalId: string;
  conceptExternalId: string;
  alias: string;
  language: string | null;
  aliasType: string | null;
  provenance: IOntologyGraphRecordProvenance;
}

export interface IOntologyGraphMappingRecord {
  recordKind: 'mapping';
  externalId: string;
  sourceExternalId: string;
  targetExternalId: string;
  mappingKind: OntologyMappingKind;
  provenance: IOntologyGraphRecordProvenance;
}

export type IOntologyGraphRecord =
  | IOntologyGraphConceptRecord
  | IOntologyGraphRelationRecord
  | IOntologyGraphAliasRecord
  | IOntologyGraphMappingRecord;

export interface IParsedOntologyGraphBatch {
  runId: string;
  sourceId: OntologySourceId;
  sourceVersion: string | null;
  generatedAt: string;
  records: IOntologyGraphRecord[];
}

export interface INormalizedOntologyConceptCandidate {
  externalId: string;
  iri: string | null;
  nodeKind: OntologyGraphNodeKind;
  preferredLabel: string;
  aliases: string[];
  description: string | null;
  languages: string[];
  sourceTypes: string[];
  properties: Record<string, unknown>;
  provenance: IOntologyGraphRecordProvenance[];
}

export interface INormalizedOntologyRelationCandidate {
  externalId: string;
  iri: string | null;
  normalizedPredicate: string;
  predicateLabel: string | null;
  subjectExternalId: string;
  objectExternalId: string;
  direction: OntologyGraphEdgeDirection;
  sourcePredicates: string[];
  properties: Record<string, unknown>;
  provenance: IOntologyGraphRecordProvenance[];
}

export interface INormalizedOntologyMappingCandidate {
  externalId: string;
  sourceExternalId: string;
  targetExternalId: string;
  mappingKind: OntologyMappingKind;
  confidenceScore: number;
  confidenceBand: OntologyMergeConfidenceBand;
  conflictFlags: OntologyMergeConflictKind[];
  provenance: IOntologyGraphRecordProvenance[];
}

export interface INormalizedOntologyGraphBatch {
  runId: string;
  sourceId: OntologySourceId;
  sourceVersion: string | null;
  generatedAt: string;
  rawRecordCount: number;
  conceptCount: number;
  relationCount: number;
  mappingCount: number;
  concepts: INormalizedOntologyConceptCandidate[];
  relations: INormalizedOntologyRelationCandidate[];
  mappings: INormalizedOntologyMappingCandidate[];
}

export interface INormalizedOntologyBatchSummary {
  runId: string;
  sourceId: OntologySourceId;
  sourceVersion: string | null;
  artifactId: string;
  generatedAt: string;
  rawRecordCount: number;
  conceptCount: number;
  relationCount: number;
  mappingCount: number;
}

export interface IOntologyImportReviewMetadata {
  confidenceScore: number;
  confidenceBand: OntologyMergeConfidenceBand;
  conflictFlags: OntologyMergeConflictKind[];
}

export interface IOntologyMutationPreviewCandidate {
  candidateId: string;
  entityKind: OntologyMutationPreviewEntityKind;
  status: OntologyMutationPreviewStatus;
  title: string;
  summary: string;
  rationale: string;
  review: IOntologyImportReviewMetadata;
  blockedReason: string | null;
  dependencyExternalIds: string[];
  proposal: IMutationProposal | null;
}

export interface IOntologyMutationPreviewBatch {
  runId: string;
  sourceId: OntologySourceId;
  sourceVersion: string | null;
  generatedAt: string;
  artifactId: string | null;
  proposalCount: number;
  readyProposalCount: number;
  blockedCandidateCount: number;
  candidates: IOntologyMutationPreviewCandidate[];
}

export interface IOntologyMutationPreviewSubmission {
  runId: string;
  submittedAt: string;
  submittedCount: number;
  skippedCount: number;
  mutationIds: string[];
}

export interface IOntologyImportCapabilitySummary {
  sourceId: OntologySourceId;
  fetch: boolean;
  parse: boolean;
  normalize: boolean;
}

export interface IOntologyImportsSystemStatus {
  status: 'healthy' | 'degraded' | 'unavailable';
  canReadRegistry: boolean;
  canManageRuns: boolean;
  canInspectArtifacts: boolean;
  missingTables: string[];
  issues: string[];
  sourceCapabilities: IOntologyImportCapabilitySummary[];
  checkedAt: string;
}

export interface IRegisterOntologySourceInput {
  id: OntologySourceId;
  name: string;
  role: OntologySourceRole;
  accessMode: OntologyAccessMode;
  description: string;
  homepageUrl?: string;
  documentationUrl?: string;
  supportedLanguages?: string[];
  supportsIncremental?: boolean;
}

export interface IUpdateOntologySourceInput {
  name?: string;
  role?: OntologySourceRole;
  accessMode?: OntologyAccessMode;
  description?: string;
  homepageUrl?: string | null;
  documentationUrl?: string | null;
  supportedLanguages?: string[];
  supportsIncremental?: boolean;
  enabled?: boolean;
  latestRelease?: IOntologySourceRelease | null;
}

export interface ICreateOntologyImportRunInput {
  sourceId: OntologySourceId;
  trigger: OntologyRunTrigger;
  initiatedBy?: string;
  sourceVersion?: string;
  configuration?: Partial<IOntologyImportRunConfiguration>;
}

export interface IRetryOntologyImportRunInput {
  runId: string;
  reason?: string;
}

export interface ICancelOntologyImportRunInput {
  runId: string;
  reason?: string;
}

export interface ISourceCatalogRepository {
  list(): Promise<IOntologySource[]>;
  getById(sourceId: OntologySourceId): Promise<IOntologySource | null>;
  register(source: IRegisterOntologySourceInput): Promise<IOntologySource>;
  update(sourceId: OntologySourceId, input: IUpdateOntologySourceInput): Promise<IOntologySource>;
}

export interface IImportRunRepository {
  list(filters?: {
    sourceId?: OntologySourceId;
    status?: OntologyImportStatus;
  }): Promise<IOntologyImportRun[]>;
  getById(runId: string): Promise<IOntologyImportRun | null>;
  create(input: ICreateOntologyImportRunInput): Promise<IOntologyImportRun>;
  updateStatus(
    runId: string,
    status: OntologyImportStatus,
    options?: {
      failureReason?: string;
      startedAt?: string | null;
      completedAt?: string | null;
    }
  ): Promise<IOntologyImportRun>;
  recordSubmittedMutations(runId: string, mutationIds: string[]): Promise<IOntologyImportRun>;
  cancel(input: ICancelOntologyImportRunInput): Promise<IOntologyImportRun>;
  retry(input: IRetryOntologyImportRunInput): Promise<IOntologyImportRun>;
}

export interface IRawArtifactStore {
  saveArtifact(
    artifact: Omit<IOntologyImportArtifact, 'id' | 'createdAt'>
  ): Promise<IOntologyImportArtifact>;
  savePayloadArtifact(input: {
    runId: string;
    sourceId: OntologySourceId;
    kind: OntologyArtifactKind;
    storageKey: string;
    contentType: string | null;
    payload: Buffer | Uint8Array | string;
  }): Promise<IOntologyImportArtifact>;
  getArtifact(storageKey: string): Promise<IOntologyImportArtifact | null>;
  readPayload(storageKey: string): Promise<Buffer>;
}

export interface IImportArtifactRepository {
  listByRunId(runId: string): Promise<IOntologyImportArtifact[]>;
  create(
    artifact: Omit<IOntologyImportArtifact, 'id' | 'createdAt'>
  ): Promise<IOntologyImportArtifact>;
}

export interface IImportCheckpointRepository {
  listByRunId(runId: string): Promise<IOntologyImportCheckpoint[]>;
  create(checkpoint: Omit<IOntologyImportCheckpoint, 'id'>): Promise<IOntologyImportCheckpoint>;
}

export interface IParsedBatchRepository {
  getByRunId(runId: string): Promise<IParsedOntologyBatch | null>;
  save(batch: IParsedOntologyBatch): Promise<IParsedOntologyBatch>;
}

export interface ISourceFetcher {
  readonly sourceId: OntologySourceId;
  fetch(run: IOntologyImportRun): Promise<IOntologyImportArtifact[]>;
}

export interface ISourceParser {
  readonly sourceId: OntologySourceId;
  parse(
    run: IOntologyImportRun,
    artifacts: IOntologyImportArtifact[]
  ): Promise<IParsedOntologyGraphBatch>;
}

export interface ISourceNormalizer {
  readonly sourceId: OntologySourceId;
  normalize(batch: IParsedOntologyGraphBatch): Promise<INormalizedOntologyGraphBatch>;
}

export interface IMutationPreviewGenerator {
  generate(batch: INormalizedOntologyGraphBatch): Promise<IOntologyMutationPreviewBatch>;
}

export interface ICanonicalNodeResolution {
  nodeId: string;
  label: string;
  nodeType: string;
  domain: string;
  strategy: 'external_id' | 'iri' | 'label' | 'alias' | 'normalized_label' | 'mapping';
  confidenceScore: number;
  confidenceBand: OntologyMergeConfidenceBand;
  conflictFlags: OntologyMergeConflictKind[];
}

export interface ICanonicalNodeResolutionResult {
  resolution: ICanonicalNodeResolution | null;
  conflictFlags: OntologyMergeConflictKind[];
}

export interface ICanonicalNodeResolver {
  resolveConcept(
    concept: INormalizedOntologyConceptCandidate,
    batch: INormalizedOntologyGraphBatch
  ): Promise<ICanonicalNodeResolutionResult>;
}

export interface IImportScheduler {
  enqueue(runId: string): Promise<void>;
  cancel(runId: string): Promise<void>;
}

export interface IChecksumVerifier {
  verify(storageKey: string, expectedChecksum: string | null): Promise<boolean>;
}

export interface INormalizationPublisher {
  publish(batch: IParsedOntologyBatch): Promise<void>;
}

export interface IOntologyMutationSubmissionPort {
  submitProposal(
    proposal: IMutationProposal,
    context: IExecutionContext
  ): Promise<{ mutationId: string }>;
}

export const OntologySourceIdSchema = z.string().min(1, 'Source id is required');
export const OntologySourceRoleSchema = z.enum(ONTOLOGY_SOURCE_ROLES);
export const OntologyAccessModeSchema = z.enum(ONTOLOGY_ACCESS_MODES);
export const OntologyImportStatusSchema = z.enum(ONTOLOGY_IMPORT_STATUSES);
export const OntologyImportStepTypeSchema = z.enum(ONTOLOGY_IMPORT_STEP_TYPES);
export const OntologyImportStepStatusSchema = z.enum(ONTOLOGY_IMPORT_STEP_STATUSES);
export const OntologyArtifactKindSchema = z.enum(ONTOLOGY_ARTIFACT_KINDS);
export const OntologyRunTriggerSchema = z.enum(ONTOLOGY_RUN_TRIGGERS);
export const OntologyGraphRecordKindSchema = z.enum(ONTOLOGY_GRAPH_RECORD_KINDS);
export const OntologyGraphNodeKindSchema = z.enum(ONTOLOGY_GRAPH_NODE_KINDS);
export const OntologyGraphEdgeDirectionSchema = z.enum(ONTOLOGY_GRAPH_EDGE_DIRECTIONS);
export const OntologyMappingKindSchema = z.enum(ONTOLOGY_MAPPING_KINDS);
export const OntologyMutationPreviewStatusSchema = z.enum(ONTOLOGY_MUTATION_PREVIEW_STATUSES);
export const OntologyMutationPreviewEntityKindSchema = z.enum(
  ONTOLOGY_MUTATION_PREVIEW_ENTITY_KINDS
);
export const OntologyImportRunConfigurationSchema = z.object({
  mode: z.string().min(1).nullable().default(null),
  language: z.string().min(1).nullable().default(null),
  seedNodes: z.array(z.string().min(1)).default([]),
});
export const OntologySubmittedMutationIdsSchema = z.array(z.string().min(1)).default([]);

export const OntologyGraphRecordProvenanceSchema = z.object({
  sourceId: OntologySourceIdSchema,
  sourceVersion: z.string().min(1).nullable(),
  runId: z.string().min(1, 'Run id is required'),
  artifactId: z.string().min(1, 'Artifact id is required'),
  harvestedAt: z.string().datetime(),
  license: z.string().min(1).nullable(),
  requestUrl: z.string().url().nullable(),
});

export const OntologyGraphConceptRecordSchema = z.object({
  recordKind: z.literal('concept'),
  externalId: z.string().min(1, 'External id is required'),
  iri: z.string().url().nullable(),
  nodeKind: OntologyGraphNodeKindSchema,
  preferredLabel: z.string().min(1, 'Preferred label is required'),
  altLabels: z.array(z.string().min(1)).default([]),
  description: z.string().min(1).nullable(),
  languages: z.array(z.string().min(1)).default([]),
  sourceTypes: z.array(z.string().min(1)).default([]),
  properties: z.record(z.unknown()).default({}),
  provenance: OntologyGraphRecordProvenanceSchema,
});

export const OntologyGraphRelationRecordSchema = z.object({
  recordKind: z.literal('relation'),
  externalId: z.string().min(1, 'External id is required'),
  iri: z.string().url().nullable(),
  sourcePredicate: z.string().min(1, 'Source predicate is required'),
  predicateLabel: z.string().min(1).nullable(),
  subjectExternalId: z.string().min(1, 'Subject external id is required'),
  objectExternalId: z.string().min(1, 'Object external id is required'),
  direction: OntologyGraphEdgeDirectionSchema,
  languages: z.array(z.string().min(1)).default([]),
  properties: z.record(z.unknown()).default({}),
  provenance: OntologyGraphRecordProvenanceSchema,
});

export const OntologyGraphAliasRecordSchema = z.object({
  recordKind: z.literal('alias'),
  externalId: z.string().min(1, 'External id is required'),
  conceptExternalId: z.string().min(1, 'Concept external id is required'),
  alias: z.string().min(1, 'Alias is required'),
  language: z.string().min(1).nullable(),
  aliasType: z.string().min(1).nullable(),
  provenance: OntologyGraphRecordProvenanceSchema,
});

export const OntologyGraphMappingRecordSchema = z.object({
  recordKind: z.literal('mapping'),
  externalId: z.string().min(1, 'External id is required'),
  sourceExternalId: z.string().min(1, 'Source external id is required'),
  targetExternalId: z.string().min(1, 'Target external id is required'),
  mappingKind: OntologyMappingKindSchema,
  provenance: OntologyGraphRecordProvenanceSchema,
});

export const OntologyGraphRecordSchema = z.discriminatedUnion('recordKind', [
  OntologyGraphConceptRecordSchema,
  OntologyGraphRelationRecordSchema,
  OntologyGraphAliasRecordSchema,
  OntologyGraphMappingRecordSchema,
]);

export const ParsedOntologyGraphBatchSchema = z.object({
  runId: z.string().min(1, 'Run id is required'),
  sourceId: OntologySourceIdSchema,
  sourceVersion: z.string().min(1).nullable(),
  generatedAt: z.string().datetime(),
  records: z.array(OntologyGraphRecordSchema),
});

export const NormalizedOntologyConceptCandidateSchema = z.object({
  externalId: z.string().min(1, 'External id is required'),
  iri: z.string().url().nullable(),
  nodeKind: OntologyGraphNodeKindSchema,
  preferredLabel: z.string().min(1, 'Preferred label is required'),
  aliases: z.array(z.string().min(1)).default([]),
  description: z.string().min(1).nullable(),
  languages: z.array(z.string().min(1)).default([]),
  sourceTypes: z.array(z.string().min(1)).default([]),
  properties: z.record(z.unknown()).default({}),
  provenance: z.array(OntologyGraphRecordProvenanceSchema),
});

export const NormalizedOntologyRelationCandidateSchema = z.object({
  externalId: z.string().min(1, 'External id is required'),
  iri: z.string().url().nullable(),
  normalizedPredicate: z.string().min(1, 'Normalized predicate is required'),
  predicateLabel: z.string().min(1).nullable(),
  subjectExternalId: z.string().min(1, 'Subject external id is required'),
  objectExternalId: z.string().min(1, 'Object external id is required'),
  direction: OntologyGraphEdgeDirectionSchema,
  sourcePredicates: z.array(z.string().min(1)).default([]),
  properties: z.record(z.unknown()).default({}),
  provenance: z.array(OntologyGraphRecordProvenanceSchema),
});

export const NormalizedOntologyMappingCandidateSchema = z.object({
  externalId: z.string().min(1, 'External id is required'),
  sourceExternalId: z.string().min(1, 'Source external id is required'),
  targetExternalId: z.string().min(1, 'Target external id is required'),
  mappingKind: OntologyMappingKindSchema,
  provenance: z.array(OntologyGraphRecordProvenanceSchema),
});

export const NormalizedOntologyGraphBatchSchema = z.object({
  runId: z.string().min(1, 'Run id is required'),
  sourceId: OntologySourceIdSchema,
  sourceVersion: z.string().min(1).nullable(),
  generatedAt: z.string().datetime(),
  rawRecordCount: z.number().int().nonnegative(),
  conceptCount: z.number().int().nonnegative(),
  relationCount: z.number().int().nonnegative(),
  mappingCount: z.number().int().nonnegative(),
  concepts: z.array(NormalizedOntologyConceptCandidateSchema),
  relations: z.array(NormalizedOntologyRelationCandidateSchema),
  mappings: z.array(NormalizedOntologyMappingCandidateSchema),
});

export const NormalizedOntologyBatchSummarySchema = z.object({
  runId: z.string().min(1, 'Run id is required'),
  sourceId: OntologySourceIdSchema,
  sourceVersion: z.string().min(1).nullable(),
  artifactId: z.string().min(1, 'Artifact id is required'),
  generatedAt: z.string().datetime(),
  rawRecordCount: z.number().int().nonnegative(),
  conceptCount: z.number().int().nonnegative(),
  relationCount: z.number().int().nonnegative(),
  mappingCount: z.number().int().nonnegative(),
});

export const OntologyMutationPreviewCandidateSchema = z.object({
  candidateId: z.string().min(1, 'Candidate id is required'),
  entityKind: OntologyMutationPreviewEntityKindSchema,
  status: OntologyMutationPreviewStatusSchema,
  title: z.string().min(1, 'Title is required'),
  summary: z.string().min(1, 'Summary is required'),
  rationale: z.string().min(1, 'Rationale is required'),
  review: z.object({
    confidenceScore: z.number().min(0).max(1),
    confidenceBand: z.enum(ONTOLOGY_MERGE_CONFIDENCE_BANDS),
    conflictFlags: z.array(z.enum(ONTOLOGY_MERGE_CONFLICT_KINDS)).default([]),
  }),
  blockedReason: z.string().min(1).nullable(),
  dependencyExternalIds: z.array(z.string().min(1)).default([]),
  proposal: MutationProposalSchema.nullable(),
});

export const OntologyMutationPreviewBatchSchema = z.object({
  runId: z.string().min(1, 'Run id is required'),
  sourceId: OntologySourceIdSchema,
  sourceVersion: z.string().min(1).nullable(),
  generatedAt: z.string().datetime(),
  artifactId: z.string().min(1).nullable(),
  proposalCount: z.number().int().nonnegative(),
  readyProposalCount: z.number().int().nonnegative(),
  blockedCandidateCount: z.number().int().nonnegative(),
  candidates: z.array(OntologyMutationPreviewCandidateSchema),
});
export const OntologyMutationPreviewSubmissionSchema = z.object({
  runId: z.string().min(1, 'Run id is required'),
  submittedAt: z.string().datetime(),
  submittedCount: z.number().int().min(0),
  skippedCount: z.number().int().min(0),
  mutationIds: z.array(z.string().min(1)).default([]),
});
