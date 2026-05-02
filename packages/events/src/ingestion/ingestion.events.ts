import type {
  ConceptCandidateId,
  CurriculumId,
  DocumentChunkId,
  DocumentId,
  IngestionIntent,
  IngestionJobId,
  IngestionJobStage,
  NodeId,
  UserId,
} from '@noema/types';

export const IngestionEventType = {
  DOCUMENT_UPLOADED: 'ingestion.document.uploaded',
  JOB_STAGE_ADVANCED: 'ingestion.job.stage_advanced',
  DOCUMENT_PARSED: 'ingestion.document.parsed',
  CHUNKS_EMBEDDED: 'ingestion.chunks.embedded',
  CONCEPT_CANDIDATES_EXTRACTED: 'ingestion.concept_candidates.extracted',
  CKG_MAPPING_COMPLETED: 'ingestion.ckg_mapping.completed',
  CURRICULUM_HANDOFF_REQUESTED: 'ingestion.curriculum_handoff.requested',
  CARD_HANDOFF_REQUESTED: 'ingestion.card_handoff.requested',
  JOB_COMPLETED: 'ingestion.job.completed',
  JOB_FAILED: 'ingestion.job.failed',
} as const;

export type IngestionEventType = (typeof IngestionEventType)[keyof typeof IngestionEventType];

export interface IDocumentUploadedPayload {
  documentId: DocumentId;
  userId: UserId;
  title: string;
  ingestionJobId: IngestionJobId;
  intent: IngestionIntent;
}

export interface IIngestionJobStageAdvancedPayload {
  ingestionJobId: IngestionJobId;
  documentId: DocumentId;
  userId: UserId;
  stage: IngestionJobStage;
  previousStage?: IngestionJobStage | undefined;
}

export interface IDocumentParsedPayload {
  ingestionJobId: IngestionJobId;
  documentId: DocumentId;
  userId: UserId;
  blockCount: number;
}

export interface IChunksEmbeddedPayload {
  ingestionJobId: IngestionJobId;
  documentId: DocumentId;
  userId: UserId;
  chunkIds: DocumentChunkId[];
}

export interface IConceptCandidatesExtractedPayload {
  ingestionJobId: IngestionJobId;
  documentId: DocumentId;
  userId: UserId;
  candidateIds: ConceptCandidateId[];
}

export interface ICkgMappingCompletedPayload {
  ingestionJobId: IngestionJobId;
  documentId: DocumentId;
  userId: UserId;
  matchedNodeIds: NodeId[];
  proposedNodeIds: NodeId[];
}

export interface ICurriculumHandoffRequestedPayload {
  ingestionJobId: IngestionJobId;
  documentId: DocumentId;
  userId: UserId;
  candidateIds: ConceptCandidateId[];
  curriculumId?: CurriculumId | undefined;
}

export interface ICardHandoffRequestedPayload {
  ingestionJobId: IngestionJobId;
  documentId: DocumentId;
  userId: UserId;
  candidateIds: ConceptCandidateId[];
  contentGenerationJobIds: string[];
}

export interface IIngestionJobCompletedPayload {
  ingestionJobId: IngestionJobId;
  documentId: DocumentId;
  userId: UserId;
  curriculumId?: CurriculumId | undefined;
  contentGenerationJobIds: string[];
}

export interface IIngestionJobFailedPayload {
  ingestionJobId: IngestionJobId;
  documentId: DocumentId;
  userId: UserId;
  stage: IngestionJobStage;
  errorMessage: string;
}
