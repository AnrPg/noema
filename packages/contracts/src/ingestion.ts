import type {
  ConceptCandidateId,
  ConceptCandidateState,
  CurriculumId,
  DocumentChunkId,
  DocumentId,
  DocumentMimeKind,
  DocumentSourceKind,
  IngestionIntent,
  IngestionJobId,
  IngestionJobStage,
  NodeId,
  UserId,
} from '@noema/types';

export interface IDocumentUploadInputDto {
  title: string;
  sourceKind?: DocumentSourceKind | undefined;
  mimeKind?: DocumentMimeKind | undefined;
  content: string;
  intent?: IngestionIntent | undefined;
  sourceUri?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface IDocumentDto {
  id: DocumentId;
  userId: UserId;
  title: string;
  sourceKind: DocumentSourceKind;
  mimeKind: DocumentMimeKind;
  sourceUri?: string | undefined;
  checksum: string;
  byteLength: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface IDocumentIrBlockDto {
  id: string;
  kind: 'heading' | 'paragraph' | 'list_item' | 'code' | 'quote' | 'table' | 'image';
  text: string;
  level?: number | undefined;
  order: number;
  pageRef?: string | undefined;
  metadata: Record<string, unknown>;
}

export interface IDocumentIrDto {
  documentId: DocumentId;
  language: string;
  title: string;
  outline: IDocumentIrBlockDto[];
  blocks: IDocumentIrBlockDto[];
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface IDocumentChunkDto {
  id: DocumentChunkId;
  documentId: DocumentId;
  userId: UserId;
  ordinal: number;
  text: string;
  tokenEstimate: number;
  headingPath: string[];
  pageRef?: string | undefined;
  vectorId?: string | undefined;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface IConceptCandidateDto {
  id: ConceptCandidateId;
  documentId: DocumentId;
  userId: UserId;
  label: string;
  definition?: string | undefined;
  salience: number;
  evidenceChunkIds: DocumentChunkId[];
  state: ConceptCandidateState;
  ckgNodeId?: NodeId | undefined;
  proposedNodeId?: NodeId | undefined;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface IIngestionJobDto {
  id: IngestionJobId;
  documentId: DocumentId;
  userId: UserId;
  intent: IngestionIntent;
  stage: IngestionJobStage;
  checkpoints: Record<string, unknown>;
  errorMessage?: string | undefined;
  curriculumId?: CurriculumId | undefined;
  contentGenerationJobIds: string[];
  createdAt: string;
  updatedAt: string;
  finishedAt?: string | undefined;
}

export interface ICreateIngestionJobInputDto {
  documentId: DocumentId;
  intent?: IngestionIntent | undefined;
}

export interface IDocumentDetailDto {
  document: IDocumentDto;
  ir?: IDocumentIrDto | undefined;
  chunks: IDocumentChunkDto[];
  concepts: IConceptCandidateDto[];
  jobs: IIngestionJobDto[];
}

export interface IIngestionUploadResultDto {
  document: IDocumentDto;
  job: IIngestionJobDto;
}

export interface IRetrievalQueryInputDto {
  query: string;
  userId?: UserId | undefined;
  documentIds?: DocumentId[] | undefined;
  limit?: number | undefined;
}

export interface IRetrievalResultDto {
  chunk: IDocumentChunkDto;
  score: number;
  conceptCandidates: IConceptCandidateDto[];
}

export interface IIngestionRunResultDto {
  job: IIngestionJobDto;
  document: IDocumentDto;
  chunks: IDocumentChunkDto[];
  concepts: IConceptCandidateDto[];
}
