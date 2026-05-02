import type {
  IConceptCandidateDto,
  IDocumentChunkDto,
  IDocumentDetailDto,
  IDocumentDto,
  IDocumentIrDto,
  IDocumentUploadInputDto,
  IIngestionJobDto,
} from '@noema/contracts';
import type {
  ConceptCandidateId,
  ConceptCandidateState,
  CurriculumId,
  DocumentId,
  IngestionJobId,
  IngestionJobStage,
  NodeId,
  UserId,
} from '@noema/types';

export interface IIngestionRepository {
  createDocument(
    input: IDocumentUploadInputDto & {
      id: DocumentId;
      userId: UserId;
      checksum: string;
      byteLength: number;
    }
  ): Promise<IDocumentDto>;
  listDocuments(userId: UserId): Promise<IDocumentDto[]>;
  getDocument(userId: UserId, documentId: DocumentId): Promise<IDocumentDto | undefined>;
  getDocumentContent(userId: UserId, documentId: DocumentId): Promise<string | undefined>;
  getDocumentDetail(
    userId: UserId,
    documentId: DocumentId
  ): Promise<IDocumentDetailDto | undefined>;
  deleteDocument(userId: UserId, documentId: DocumentId): Promise<void>;

  createJob(input: {
    id: IngestionJobId;
    documentId: DocumentId;
    userId: UserId;
    intent: IIngestionJobDto['intent'];
  }): Promise<IIngestionJobDto>;
  getJob(userId: UserId, jobId: IngestionJobId): Promise<IIngestionJobDto | undefined>;
  listJobs(
    userId: UserId,
    documentId?: DocumentId,
    stage?: IngestionJobStage
  ): Promise<IIngestionJobDto[]>;
  updateJob(
    jobId: IngestionJobId,
    patch: {
      stage?: IngestionJobStage | undefined;
      checkpoints?: Record<string, unknown> | undefined;
      errorMessage?: string | undefined;
      finishedAt?: string | undefined;
      curriculumId?: CurriculumId | undefined;
      contentGenerationJobIds?: string[] | undefined;
    }
  ): Promise<IIngestionJobDto>;

  upsertIr(ir: IDocumentIrDto): Promise<IDocumentIrDto>;
  getIr(documentId: DocumentId): Promise<IDocumentIrDto | undefined>;
  replaceChunks(documentId: DocumentId, chunks: IDocumentChunkDto[]): Promise<IDocumentChunkDto[]>;
  listChunks(documentId: DocumentId): Promise<IDocumentChunkDto[]>;
  replaceConceptCandidates(
    documentId: DocumentId,
    candidates: IConceptCandidateDto[]
  ): Promise<IConceptCandidateDto[]>;
  listConceptCandidates(documentId: DocumentId): Promise<IConceptCandidateDto[]>;
  updateConceptCandidate(input: {
    id: ConceptCandidateId;
    state: ConceptCandidateState;
    ckgNodeId?: NodeId | undefined;
    proposedNodeId?: NodeId | undefined;
  }): Promise<IConceptCandidateDto>;
}
