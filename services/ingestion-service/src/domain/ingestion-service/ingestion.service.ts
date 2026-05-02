import { createHash } from 'node:crypto';
import type {
  IConceptCandidateDto,
  IDocumentChunkDto,
  IDocumentDetailDto,
  IDocumentDto,
  IDocumentUploadInputDto,
  IIngestionJobDto,
  IIngestionRunResultDto,
  IIngestionUploadResultDto,
  IRetrievalQueryInputDto,
  IRetrievalResultDto,
} from '@noema/contracts';
import { IngestionEventType } from '@noema/events/ingestion';
import type {
  ConceptCandidateId,
  CorrelationId,
  DocumentId,
  IngestionJobId,
  UserId,
} from '@noema/types';
import {
  ConceptCandidateState,
  ID_PREFIXES,
  IngestionIntent,
  IngestionJobStage,
} from '@noema/types';
import { DocumentUploadInputSchema, RetrievalQueryInputSchema } from '@noema/validation';
import { nanoid } from 'nanoid';
import type { Logger } from 'pino';
import type {
  IConceptExtractorPort,
  IContentServicePort,
  ICurriculumServicePort,
  IDocumentParserPort,
  IKnowledgeGraphPort,
  IVectorServicePort,
} from './external-ports.js';
import type { IIngestionRepository } from './ingestion.repository.js';
import { buildIr, chunkIr } from './pipeline.js';
import type { IEventPublisher } from '../shared/event-publisher.js';

export interface IExecutionContext {
  userId: UserId | null;
  correlationId: CorrelationId;
  roles: string[];
}

export class IngestionService {
  constructor(
    private readonly repository: IIngestionRepository,
    private readonly parser: IDocumentParserPort,
    private readonly vectorService: IVectorServicePort,
    private readonly conceptExtractor: IConceptExtractorPort,
    private readonly knowledgeGraph: IKnowledgeGraphPort,
    private readonly contentService: IContentServicePort,
    private readonly curriculumService: ICurriculumServicePort,
    private readonly eventPublisher: IEventPublisher,
    private readonly logger: Logger
  ) {}

  async uploadDocument(
    input: IDocumentUploadInputDto,
    context: IExecutionContext
  ): Promise<IIngestionUploadResultDto> {
    const userId = this.requireUserId(context);
    const parsed = DocumentUploadInputSchema.parse(input) as IDocumentUploadInputDto & {
      content: string;
      intent: IIngestionJobDto['intent'];
    };
    const documentId = `${ID_PREFIXES.DocumentId}${nanoid(21)}` as DocumentId;
    const jobId = `${ID_PREFIXES.IngestionJobId}${nanoid(21)}` as IngestionJobId;
    const document = await this.repository.createDocument({
      ...parsed,
      id: documentId,
      userId,
      checksum: checksum(parsed.content),
      byteLength: Buffer.byteLength(parsed.content, 'utf8'),
    });
    const job = await this.repository.createJob({
      id: jobId,
      documentId,
      userId,
      intent: parsed.intent,
    });
    await this.eventPublisher.publish({
      eventType: IngestionEventType.DOCUMENT_UPLOADED,
      aggregateType: 'Document',
      aggregateId: documentId,
      payload: {
        documentId,
        ingestionJobId: jobId,
        userId,
        title: document.title,
        intent: job.intent,
      },
      metadata: { correlationId: context.correlationId, userId },
    });
    return { document, job };
  }

  listDocuments(context: IExecutionContext): Promise<IDocumentDto[]> {
    return this.repository.listDocuments(this.requireUserId(context));
  }

  getDocument(
    documentId: DocumentId,
    context: IExecutionContext
  ): Promise<IDocumentDetailDto | undefined> {
    return this.repository.getDocumentDetail(this.requireUserId(context), documentId);
  }

  deleteDocument(documentId: DocumentId, context: IExecutionContext): Promise<void> {
    return this.repository.deleteDocument(this.requireUserId(context), documentId);
  }

  listJobs(
    context: IExecutionContext,
    documentId?: DocumentId,
    stage?: IIngestionJobDto['stage']
  ): Promise<IIngestionJobDto[]> {
    return this.repository.listJobs(this.requireUserId(context), documentId, stage);
  }

  async createJob(
    input: { documentId: DocumentId; intent?: IIngestionJobDto['intent'] | undefined },
    context: IExecutionContext
  ): Promise<IIngestionJobDto> {
    const userId = this.requireUserId(context);
    const document = await this.repository.getDocument(userId, input.documentId);
    if (document === undefined) throw new Error('Document not found.');
    return this.repository.createJob({
      id: `${ID_PREFIXES.IngestionJobId}${nanoid(21)}` as IngestionJobId,
      documentId: document.id,
      userId,
      intent: input.intent ?? IngestionIntent.BOTH,
    });
  }

  async runJob(jobId: IngestionJobId, context: IExecutionContext): Promise<IIngestionRunResultDto> {
    const userId = this.requireUserId(context);
    const job = await this.repository.getJob(userId, jobId);
    if (job === undefined) throw new Error('Ingestion job not found.');
    const document = await this.repository.getDocument(userId, job.documentId);
    if (document === undefined) throw new Error('Document not found.');
    const content = await this.repository.getDocumentContent(userId, document.id);
    if (content === undefined) throw new Error('Document content not found.');

    try {
      await this.advance(job.id, IngestionJobStage.PARSING, {});
      const parsedDocument = await this.parser.parse(document, content);
      await this.eventPublisher.publish({
        eventType: IngestionEventType.DOCUMENT_PARSED,
        aggregateType: 'Document',
        aggregateId: document.id,
        payload: {
          documentId: document.id,
          ingestionJobId: job.id,
          userId,
          blockCount: parsedDocument.blocks.length,
        },
        metadata: { correlationId: context.correlationId, userId },
      });

      await this.advance(job.id, IngestionJobStage.IR_BUILDING, {});
      const ir = await this.repository.upsertIr(
        buildIr(document.id, document.title, parsedDocument)
      );

      await this.advance(job.id, IngestionJobStage.CHUNKING, { blockCount: ir.blocks.length });
      const chunks = await this.repository.replaceChunks(
        document.id,
        chunkIr(document.id, userId, ir)
      );

      await this.advance(job.id, IngestionJobStage.EMBEDDING, { chunkCount: chunks.length });
      const embeddedChunks = await this.repository.replaceChunks(
        document.id,
        await this.vectorService.embedChunks(chunks)
      );
      await this.eventPublisher.publish({
        eventType: IngestionEventType.CHUNKS_EMBEDDED,
        aggregateType: 'DocumentChunk',
        aggregateId: document.id,
        payload: {
          documentId: document.id,
          ingestionJobId: job.id,
          userId,
          chunkIds: embeddedChunks.map((chunk) => chunk.id),
        },
        metadata: { correlationId: context.correlationId, userId },
      });

      await this.advance(job.id, IngestionJobStage.CONCEPT_EXTRACTION, {});
      const candidates = await this.extractConceptCandidates(document, ir, embeddedChunks);
      await this.eventPublisher.publish({
        eventType: IngestionEventType.CONCEPT_CANDIDATES_EXTRACTED,
        aggregateType: 'ConceptCandidate',
        aggregateId: document.id,
        payload: {
          documentId: document.id,
          ingestionJobId: job.id,
          userId,
          candidateIds: candidates.map((candidate) => candidate.id),
        },
        metadata: { correlationId: context.correlationId, userId },
      });

      const mappedCandidates = await this.mapConcepts(document, job.id, candidates, context);
      const curriculumResult = await this.maybeRequestCurriculum(
        document,
        job,
        mappedCandidates,
        context
      );
      const contentJobIds = await this.maybeRequestCards(
        document,
        job,
        mappedCandidates,
        curriculumResult.curriculumId,
        context
      );

      const completed = await this.repository.updateJob(job.id, {
        stage: IngestionJobStage.COMPLETED,
        finishedAt: new Date().toISOString(),
        curriculumId: curriculumResult.curriculumId,
        contentGenerationJobIds: contentJobIds,
        checkpoints: { completedAt: new Date().toISOString() },
      });
      await this.eventPublisher.publish({
        eventType: IngestionEventType.JOB_COMPLETED,
        aggregateType: 'IngestionJob',
        aggregateId: job.id,
        payload: {
          documentId: document.id,
          ingestionJobId: job.id,
          userId,
          curriculumId: completed.curriculumId,
          contentGenerationJobIds: completed.contentGenerationJobIds,
        },
        metadata: { correlationId: context.correlationId, userId },
      });
      return { job: completed, document, chunks: embeddedChunks, concepts: mappedCandidates };
    } catch (error) {
      const failed = await this.repository.updateJob(job.id, {
        stage: IngestionJobStage.FAILED,
        finishedAt: new Date().toISOString(),
        errorMessage: error instanceof Error ? error.message : 'Unknown ingestion failure',
      });
      await this.eventPublisher.publish({
        eventType: IngestionEventType.JOB_FAILED,
        aggregateType: 'IngestionJob',
        aggregateId: job.id,
        payload: {
          documentId: document.id,
          ingestionJobId: job.id,
          userId,
          stage: failed.stage,
          errorMessage: failed.errorMessage ?? 'Unknown ingestion failure',
        },
        metadata: { correlationId: context.correlationId, userId },
      });
      this.logger.error({ error, jobId }, 'Ingestion job failed');
      throw error;
    }
  }

  async cancelJob(jobId: IngestionJobId, context: IExecutionContext): Promise<IIngestionJobDto> {
    const userId = this.requireUserId(context);
    const job = await this.repository.getJob(userId, jobId);
    if (job === undefined) throw new Error('Ingestion job not found.');
    return this.repository.updateJob(jobId, {
      stage: IngestionJobStage.CANCELLED,
      finishedAt: new Date().toISOString(),
    });
  }

  async retryJob(
    jobId: IngestionJobId,
    context: IExecutionContext
  ): Promise<IIngestionRunResultDto> {
    await this.repository.updateJob(jobId, {
      stage: IngestionJobStage.QUEUED,
      checkpoints: { retriedAt: new Date().toISOString() },
    });
    return this.runJob(jobId, context);
  }

  async retrievalQuery(
    input: IRetrievalQueryInputDto,
    context: IExecutionContext
  ): Promise<IRetrievalResultDto[]> {
    const userId = this.requireUserId(context);
    const parsed = RetrievalQueryInputSchema.parse({ ...input, userId });
    const results = await this.vectorService.query({
      userId,
      documentIds: parsed.documentIds,
      query: parsed.query,
      limit: parsed.limit,
    });
    return Promise.all(
      results.map(async (result) => {
        const candidates = (await this.repository.listConceptCandidates(result.documentId)).filter(
          (candidate) => candidate.evidenceChunkIds.includes(result.chunkId)
        );
        return {
          chunk: {
            id: result.chunkId,
            documentId: result.documentId,
            userId: result.userId,
            ordinal: 0,
            text: result.text,
            tokenEstimate: Math.max(1, Math.ceil(result.text.split(/\s+/).length * 1.3)),
            headingPath: result.headingPath,
            ...(result.pageRef !== undefined ? { pageRef: result.pageRef } : {}),
            metadata: result.metadata,
            createdAt: new Date().toISOString(),
          },
          score: result.score,
          conceptCandidates: candidates,
        };
      })
    );
  }

  private async extractConceptCandidates(
    document: IDocumentDto,
    ir: ReturnType<typeof buildIr>,
    chunks: IDocumentChunkDto[]
  ): Promise<IConceptCandidateDto[]> {
    const extracted = await this.conceptExtractor.extract({ document, ir, chunks });
    return this.repository.replaceConceptCandidates(
      document.id,
      extracted
        .filter((candidate) => candidate.evidenceChunkIds.length > 0)
        .map((candidate) => ({
          id: `${ID_PREFIXES.ConceptCandidateId}${nanoid(21)}` as ConceptCandidateId,
          documentId: document.id,
          userId: document.userId,
          label: candidate.label,
          ...(candidate.definition !== undefined ? { definition: candidate.definition } : {}),
          salience: candidate.salience,
          evidenceChunkIds: candidate.evidenceChunkIds as IConceptCandidateDto['evidenceChunkIds'],
          state: ConceptCandidateState.EXTRACTED,
          metadata: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }))
    );
  }

  private async mapConcepts(
    document: IDocumentDto,
    jobId: IngestionJobId,
    candidates: IConceptCandidateDto[],
    context: IExecutionContext
  ): Promise<IConceptCandidateDto[]> {
    const userId = this.requireUserId(context);
    await this.advance(jobId, IngestionJobStage.CKG_MAPPING, { candidateCount: candidates.length });
    const mapped: IConceptCandidateDto[] = [];
    const matchedNodeIds: string[] = [];
    const proposedNodeIds: string[] = [];
    for (const candidate of candidates) {
      const match = await this.knowledgeGraph.mapConcept(candidate);
      if (match.nodeId !== undefined && match.confidence >= 0.85) {
        const updated = await this.repository.updateConceptCandidate({
          id: candidate.id,
          state: ConceptCandidateState.MATCHED_CKG,
          ckgNodeId: match.nodeId,
        });
        mapped.push(updated);
        matchedNodeIds.push(match.nodeId);
        continue;
      }
      const proposal = await this.knowledgeGraph.proposeConcept(candidate);
      const updated = await this.repository.updateConceptCandidate({
        id: candidate.id,
        state: ConceptCandidateState.PROPOSED_CKG,
        ...(proposal.nodeId !== undefined ? { proposedNodeId: proposal.nodeId } : {}),
      });
      mapped.push(updated);
      if (updated.proposedNodeId !== undefined) proposedNodeIds.push(updated.proposedNodeId);
    }
    await this.eventPublisher.publish({
      eventType: IngestionEventType.CKG_MAPPING_COMPLETED,
      aggregateType: 'ConceptCandidate',
      aggregateId: document.id,
      payload: {
        documentId: document.id,
        ingestionJobId: jobId,
        userId,
        matchedNodeIds,
        proposedNodeIds,
      },
      metadata: { correlationId: context.correlationId, userId },
    });
    return mapped;
  }

  private async maybeRequestCurriculum(
    document: IDocumentDto,
    job: IIngestionJobDto,
    candidates: IConceptCandidateDto[],
    context: IExecutionContext
  ): Promise<{ curriculumId?: IIngestionJobDto['curriculumId'] | undefined }> {
    if (job.intent !== IngestionIntent.DERIVE_CURRICULUM && job.intent !== IngestionIntent.BOTH) {
      return {};
    }
    const userId = this.requireUserId(context);
    await this.advance(job.id, IngestionJobStage.CURRICULUM_HANDOFF, {});
    const result = await this.curriculumService.requestCurriculumSeed({
      userId,
      document,
      concepts: candidates,
    });
    await this.eventPublisher.publish({
      eventType: IngestionEventType.CURRICULUM_HANDOFF_REQUESTED,
      aggregateType: 'IngestionJob',
      aggregateId: job.id,
      payload: {
        documentId: document.id,
        ingestionJobId: job.id,
        userId,
        candidateIds: candidates.map((candidate) => candidate.id),
        curriculumId: result.curriculumId,
      },
      metadata: { correlationId: context.correlationId, userId },
    });
    return { curriculumId: result.curriculumId };
  }

  private async maybeRequestCards(
    document: IDocumentDto,
    job: IIngestionJobDto,
    candidates: IConceptCandidateDto[],
    curriculumId: IIngestionJobDto['curriculumId'] | undefined,
    context: IExecutionContext
  ): Promise<string[]> {
    if (job.intent !== IngestionIntent.SEED_CARDS && job.intent !== IngestionIntent.BOTH) return [];
    const userId = this.requireUserId(context);
    await this.advance(job.id, IngestionJobStage.CARD_HANDOFF, {});
    const result = await this.contentService.requestCardSeed({
      userId,
      document,
      candidates,
      curriculumId,
    });
    await this.eventPublisher.publish({
      eventType: IngestionEventType.CARD_HANDOFF_REQUESTED,
      aggregateType: 'IngestionJob',
      aggregateId: job.id,
      payload: {
        documentId: document.id,
        ingestionJobId: job.id,
        userId,
        candidateIds: candidates.map((candidate) => candidate.id),
        contentGenerationJobIds: result.jobIds,
      },
      metadata: { correlationId: context.correlationId, userId },
    });
    return result.jobIds;
  }

  private async advance(
    jobId: IngestionJobId,
    stage: IIngestionJobDto['stage'],
    checkpoint: Record<string, unknown>
  ): Promise<IIngestionJobDto> {
    return this.repository.updateJob(jobId, {
      stage,
      checkpoints: { [stage]: { at: new Date().toISOString(), ...checkpoint } },
    });
  }

  private requireUserId(context: IExecutionContext): UserId {
    if (context.userId === null) throw new Error('Authentication required.');
    return context.userId;
  }
}

function checksum(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}
