/* eslint-disable @typescript-eslint/require-await */
import { describe, expect, it } from 'vitest';
import type {
  IConceptCandidateDto,
  IDocumentChunkDto,
  IDocumentDetailDto,
  IDocumentDto,
  IDocumentIrDto,
  IIngestionJobDto,
} from '@noema/contracts';
import {
  ConceptCandidateState,
  ID_PREFIXES,
  IngestionIntent,
  IngestionJobStage,
  type NodeId,
} from '@noema/types';
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
import { IngestionService } from './ingestion.service.js';
import type { IEventPublisher } from '../shared/event-publisher.js';

class MemoryRepository implements IIngestionRepository {
  document: IDocumentDto;
  content = '# Bayes Theorem\n\nBayes theorem updates probabilities using evidence.';
  ir: IDocumentIrDto | undefined;
  chunks: IDocumentChunkDto[] = [];
  candidates: IConceptCandidateDto[] = [];
  job: IIngestionJobDto;

  constructor() {
    this.document = {
      id: `${ID_PREFIXES.DocumentId}123456789012345678901` as IDocumentDto['id'],
      userId: 'user_123456789012345678901' as IDocumentDto['userId'],
      title: 'Source One',
      sourceKind: 'upload',
      mimeKind: 'text/plain',
      checksum: 'checksum',
      byteLength: 64,
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.job = {
      id: `${ID_PREFIXES.IngestionJobId}123456789012345678901` as IIngestionJobDto['id'],
      documentId: this.document.id,
      userId: this.document.userId,
      intent: IngestionIntent.BOTH,
      stage: IngestionJobStage.QUEUED,
      checkpoints: {},
      contentGenerationJobIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async createDocument(): Promise<IDocumentDto> {
    return this.document;
  }
  async listDocuments(): Promise<IDocumentDto[]> {
    return [this.document];
  }
  async getDocument(): Promise<IDocumentDto | undefined> {
    return this.document;
  }
  async getDocumentContent(): Promise<string | undefined> {
    return this.content;
  }
  async getDocumentDetail(): Promise<IDocumentDetailDto | undefined> {
    return {
      document: this.document,
      ir: this.ir,
      chunks: this.chunks,
      concepts: this.candidates,
      jobs: [this.job],
    };
  }
  async deleteDocument(): Promise<void> {
    return undefined;
  }
  async createJob(): Promise<IIngestionJobDto> {
    return this.job;
  }
  async getJob(): Promise<IIngestionJobDto | undefined> {
    return this.job;
  }
  async claimJobForRun(): Promise<IIngestionJobDto | undefined> {
    if (this.job.stage !== IngestionJobStage.QUEUED) return undefined;
    this.job = { ...this.job, stage: IngestionJobStage.PARSING };
    return this.job;
  }
  async listJobs(): Promise<IIngestionJobDto[]> {
    return [this.job];
  }
  async updateJob(
    _jobId: IIngestionJobDto['id'],
    patch: {
      stage?: IIngestionJobDto['stage'];
      checkpoints?: Record<string, unknown>;
      errorMessage?: string;
      finishedAt?: string;
      curriculumId?: IIngestionJobDto['curriculumId'];
      contentGenerationJobIds?: string[];
    }
  ): Promise<IIngestionJobDto> {
    this.job = {
      ...this.job,
      ...(patch.stage !== undefined ? { stage: patch.stage } : {}),
      ...(patch.errorMessage !== undefined ? { errorMessage: patch.errorMessage } : {}),
      ...(patch.finishedAt !== undefined ? { finishedAt: patch.finishedAt } : {}),
      ...(patch.curriculumId !== undefined ? { curriculumId: patch.curriculumId } : {}),
      ...(patch.contentGenerationJobIds !== undefined
        ? { contentGenerationJobIds: patch.contentGenerationJobIds }
        : {}),
      checkpoints: { ...this.job.checkpoints, ...(patch.checkpoints ?? {}) },
    };
    return this.job;
  }
  async upsertIr(ir: IDocumentIrDto): Promise<IDocumentIrDto> {
    this.ir = ir;
    return ir;
  }
  async getIr(): Promise<IDocumentIrDto | undefined> {
    return this.ir;
  }
  async replaceChunks(
    _documentId: IDocumentDto['id'],
    chunks: IDocumentChunkDto[]
  ): Promise<IDocumentChunkDto[]> {
    this.chunks = chunks;
    return chunks;
  }
  async listChunks(): Promise<IDocumentChunkDto[]> {
    return this.chunks;
  }
  async replaceConceptCandidates(
    _documentId: IDocumentDto['id'],
    candidates: IConceptCandidateDto[]
  ): Promise<IConceptCandidateDto[]> {
    this.candidates = candidates;
    return candidates;
  }
  async listConceptCandidates(): Promise<IConceptCandidateDto[]> {
    return this.candidates;
  }
  async updateConceptCandidate(input: {
    id: IConceptCandidateDto['id'];
    state: IConceptCandidateDto['state'];
    ckgNodeId?: IConceptCandidateDto['ckgNodeId'];
    proposedNodeId?: IConceptCandidateDto['proposedNodeId'];
  }): Promise<IConceptCandidateDto> {
    const current = this.candidates.find((candidate) => candidate.id === input.id);
    if (current === undefined) throw new Error('Candidate not found');
    const updated = {
      ...current,
      state: input.state,
      ...(input.ckgNodeId !== undefined ? { ckgNodeId: input.ckgNodeId } : {}),
      ...(input.proposedNodeId !== undefined ? { proposedNodeId: input.proposedNodeId } : {}),
    };
    this.candidates = this.candidates.map((candidate) =>
      candidate.id === input.id ? updated : candidate
    );
    return updated;
  }
}

describe('IngestionService', () => {
  it('embeds chunks before agent extraction and performs both downstream handoffs', async () => {
    const repository = new MemoryRepository();
    const callOrder: string[] = [];
    let extractedChunkVectorIds: string[] = [];
    let scanWindowCount = 0;

    const parser: IDocumentParserPort = {
      parse: async () => ({
        rawText: repository.content,
        language: 'en',
        blocks: [
          { id: 'block_h1', kind: 'heading', text: 'Bayes Theorem', level: 1, order: 0, metadata: { headingPath: ['Bayes Theorem'] } },
          { id: 'block_p1', kind: 'paragraph', text: 'Bayes theorem updates probabilities using evidence.', order: 1, metadata: { headingPath: ['Bayes Theorem'] } },
        ],
      }),
    };
    const vectorService: IVectorServicePort = {
      embedChunks: async (chunks) => {
        callOrder.push('embed');
        return chunks.map((chunk) => ({ ...chunk, vectorId: `vec_${chunk.id}` }));
      },
      query: async () => [],
    };
    const conceptExtractor: IConceptExtractorPort = {
      extract: async (input) => {
        callOrder.push('extract');
        extractedChunkVectorIds = input.chunks.map((chunk) => chunk.vectorId ?? '');
        scanWindowCount = input.scanWindows.length;
        return {
          documentSummary: { title: input.document.title },
          sectionSummaries: [{ sectionPath: ['Bayes Theorem'], summary: 'Probability update rule.' }],
          conceptCandidates: [
            {
              label: 'Bayes Theorem',
              definition: 'Probability update rule.',
              evidenceChunkIds: [input.chunks[0]!.id],
              salience: 0.88,
              confidence: 0.91,
              state: 'candidate',
              rationale: 'Found in the heading and body.',
            },
          ],
          mappingSuggestions: [
            {
              label: 'Bayes Theorem',
              candidateNodeIds: ['concept_1'],
              decision: 'matched',
              confidence: 0.9,
              reason: 'Exact concept match.',
              requiresUserApproval: false,
            },
          ],
          handoffRecommendations: [
            { target: 'curriculum-planner', allowed: true, reason: 'Ready', payload: {} },
            { target: 'content-creator-agent', allowed: true, reason: 'Ready', payload: {} },
          ],
          parseWarnings: [],
          groundingReport: {},
        };
      },
    };
    const knowledgeGraph: IKnowledgeGraphPort = {
      mapConcept: async () => ({ confidence: 0 }),
      proposeConcept: async () => ({ proposalId: 'proposal_1' }),
    };
    const contentService: IContentServicePort = {
      requestCardSeed: async () => {
        callOrder.push('content');
        return { jobIds: ['job_content_1'] };
      },
    };
    const curriculumService: ICurriculumServicePort = {
      requestCurriculumSeed: async () => {
        callOrder.push('curriculum');
        return { curriculumId: 'curr_1' as never };
      },
    };
    const eventPublisher: IEventPublisher = {
      publish: async () => undefined,
      publishBatch: async () => undefined,
    };

    const service = new IngestionService(
      repository,
      parser,
      vectorService,
      conceptExtractor,
      knowledgeGraph,
      contentService,
      curriculumService,
      eventPublisher,
      { error: () => undefined } as unknown as Logger
    );

    const result = await service.runJob(repository.job.id, {
      userId: repository.document.userId,
      correlationId: 'cor_123' as never,
      roles: [],
    });

    expect(extractedChunkVectorIds[0]).toContain('vec_');
    expect(callOrder).toEqual(['embed', 'extract', 'curriculum', 'content']);
    expect(scanWindowCount).toBeGreaterThan(0);
    expect(result.concepts[0]?.state).toBe(ConceptCandidateState.MATCHED_CKG);
    expect(result.job.curriculumId).toBe('curr_1');
    expect(result.job.contentGenerationJobIds).toEqual(['job_content_1']);
  });

  it('skips blocked downstream handoffs when the extraction agent disallows them', async () => {
    const repository = new MemoryRepository();
    const parser: IDocumentParserPort = {
      parse: async () => ({
        rawText: repository.content,
        language: 'en',
        blocks: [
          { id: 'block_p1', kind: 'paragraph', text: 'Single weak mention.', order: 0, metadata: { headingPath: [] } },
        ],
      }),
    };
    const vectorService: IVectorServicePort = {
      embedChunks: async (chunks) => chunks.map((chunk) => ({ ...chunk, vectorId: `vec_${chunk.id}` })),
      query: async () => [],
    };
    const conceptExtractor: IConceptExtractorPort = {
      extract: async (input) => ({
        documentSummary: { title: input.document.title },
        sectionSummaries: [],
        conceptCandidates: [
          {
            label: 'Weak mention',
            definition: 'Weak mention',
            evidenceChunkIds: [input.chunks[0]!.id],
            salience: 0.2,
            confidence: 0.2,
            state: 'weak_evidence',
            rationale: 'Only appears once.',
          },
        ],
        mappingSuggestions: [
          {
            label: 'Weak mention',
            candidateNodeIds: [],
            decision: 'proposal_needed',
            confidence: 0.2,
            reason: 'No strong mapping.',
            requiresUserApproval: true,
          },
        ],
        handoffRecommendations: [
          { target: 'curriculum-planner', allowed: false, reason: 'Too weak', payload: {} },
          { target: 'content-creator-agent', allowed: false, reason: 'Too weak', payload: {} },
        ],
        parseWarnings: [{ code: 'OCR_SUGGESTED', message: 'OCR suggested' }],
        groundingReport: {},
      }),
    };
    const knowledgeGraph: IKnowledgeGraphPort = {
      mapConcept: async () => ({ confidence: 0 }),
      proposeConcept: async () => ({ proposalId: 'proposal_1' }),
    };
    let curriculumCalls = 0;
    let contentCalls = 0;
    const contentService: IContentServicePort = {
      requestCardSeed: async () => {
        contentCalls += 1;
        return { jobIds: [] };
      },
    };
    const curriculumService: ICurriculumServicePort = {
      requestCurriculumSeed: async () => {
        curriculumCalls += 1;
        return {};
      },
    };
    const eventPublisher: IEventPublisher = {
      publish: async () => undefined,
      publishBatch: async () => undefined,
    };

    const service = new IngestionService(
      repository,
      parser,
      vectorService,
      conceptExtractor,
      knowledgeGraph,
      contentService,
      curriculumService,
      eventPublisher,
      { error: () => undefined } as unknown as Logger
    );

    const result = await service.runJob(repository.job.id, {
      userId: repository.document.userId,
      correlationId: 'cor_456' as never,
      roles: [],
    });

    expect(curriculumCalls).toBe(0);
    expect(contentCalls).toBe(0);
    expect(result.concepts[0]?.state).toBe(ConceptCandidateState.EXTRACTED);
  });

  it('uses KG-backed mapping/proposal results and only hands off graph-backed candidates', async () => {
    const repository = new MemoryRepository();
    const parser: IDocumentParserPort = {
      parse: async () => ({
        rawText: repository.content,
        language: 'en',
        blocks: [
          {
            id: 'block_p1',
            kind: 'paragraph',
            text: 'Bayes theorem updates probabilities using evidence.',
            order: 0,
            metadata: { headingPath: ['Bayes Theorem'] },
          },
          {
            id: 'block_p2',
            kind: 'paragraph',
            text: 'Weak topic is mentioned without much structure.',
            order: 1,
            metadata: { headingPath: ['Weak Topic'] },
          },
        ],
      }),
    };
    const vectorService: IVectorServicePort = {
      embedChunks: async (chunks) => chunks.map((chunk) => ({ ...chunk, vectorId: `vec_${chunk.id}` })),
      query: async () => [],
    };
    const conceptExtractor: IConceptExtractorPort = {
      extract: async (input) => ({
        documentSummary: { title: input.document.title },
        sectionSummaries: [],
        conceptCandidates: [
          {
            label: 'Bayes Theorem',
            definition: 'Probability update rule.',
            evidenceChunkIds: [input.chunks[0]!.id],
            salience: 0.88,
            confidence: 0.91,
            state: 'candidate',
            rationale: 'Strong heading match.',
          },
          {
            label: 'Weak Topic',
            definition: 'Unclear topic.',
            evidenceChunkIds: [input.chunks[0]!.id],
            salience: 0.3,
            confidence: 0.4,
            state: 'candidate',
            rationale: 'Needs review.',
          },
        ],
        mappingSuggestions: [
          {
            label: 'Bayes Theorem',
            candidateNodeIds: ['concept_strong'],
            decision: 'matched',
            confidence: 0.95,
            reason: 'Exact concept match.',
            requiresUserApproval: false,
          },
          {
            label: 'Weak Topic',
            candidateNodeIds: [],
            decision: 'proposal_needed',
            confidence: 0.4,
            reason: 'No exact mapping.',
            requiresUserApproval: true,
          },
        ],
        handoffRecommendations: [
          { target: 'curriculum-planner', allowed: true, reason: 'Attempt handoff', payload: {} },
          { target: 'content-creator-agent', allowed: true, reason: 'Attempt handoff', payload: {} },
        ],
        parseWarnings: [],
        groundingReport: {},
      }),
    };
    const mapCalls: string[] = [];
    const proposalCalls: string[] = [];
    const knowledgeGraph: IKnowledgeGraphPort = {
      mapConcept: async (candidate) => {
        mapCalls.push(candidate.label);
        return candidate.label === 'Bayes Theorem'
          ? {
              confidence: 0.94,
              nodeId: 'node_123456789012345678901' as NodeId,
            }
          : { confidence: 0.2 };
      },
      proposeConcept: async (candidate) => {
        proposalCalls.push(candidate.label);
        return { proposalId: 'proposal_1' };
      },
    };
    let curriculumCalls = 0;
    let contentCalls = 0;
    const contentService: IContentServicePort = {
      requestCardSeed: async (input) => {
        contentCalls += 1;
        expect(input.candidates).toHaveLength(1);
        return { jobIds: ['job_content_1'] };
      },
    };
    const curriculumService: ICurriculumServicePort = {
      requestCurriculumSeed: async (input) => {
        curriculumCalls += 1;
        expect(input.concepts).toHaveLength(1);
        return { curriculumId: 'curr_1' as never };
      },
    };
    const eventPublisher: IEventPublisher = {
      publish: async () => undefined,
      publishBatch: async () => undefined,
    };

    const service = new IngestionService(
      repository,
      parser,
      vectorService,
      conceptExtractor,
      knowledgeGraph,
      contentService,
      curriculumService,
      eventPublisher,
      { error: () => undefined } as unknown as Logger
    );

    const result = await service.runJob(repository.job.id, {
      userId: repository.document.userId,
      correlationId: 'cor_789' as never,
      roles: [],
    });

    expect(mapCalls).toEqual(['Bayes Theorem']);
    expect(proposalCalls).toEqual(['Weak Topic']);
    expect(curriculumCalls).toBe(1);
    expect(contentCalls).toBe(1);
    expect(result.concepts[0]?.state).toBe(ConceptCandidateState.MATCHED_CKG);
    expect(result.concepts[0]?.ckgNodeId).toBe('node_123456789012345678901');
    expect(result.concepts[1]?.state).toBe(ConceptCandidateState.EXTRACTED);
    expect(result.concepts[1]?.proposedNodeId).toBeUndefined();
  });

  it('completes early when parsing yields no text-bearing chunks', async () => {
    const repository = new MemoryRepository();
    const parser: IDocumentParserPort = {
      parse: async () => ({
        rawText: '',
        language: 'en',
        blocks: [{ id: 'block_0', kind: 'image', text: '', order: 0, metadata: {} }],
        parseWarnings: [{ code: 'NO_TEXT_CONTENT', message: 'No text extracted.' }],
        format: 'pdf',
        metadata: { ocrStatus: 'required' },
      }),
    };
    let embedded = 0;
    let extracted = 0;
    const vectorService: IVectorServicePort = {
      embedChunks: async (chunks) => {
        embedded += 1;
        return chunks;
      },
      query: async () => [],
    };
    const conceptExtractor: IConceptExtractorPort = {
      extract: async () => {
        extracted += 1;
        return {
          documentSummary: {},
          sectionSummaries: [],
          conceptCandidates: [],
          mappingSuggestions: [],
          handoffRecommendations: [],
        };
      },
    };
    const knowledgeGraph: IKnowledgeGraphPort = {
      mapConcept: async () => ({ confidence: 0 }),
      proposeConcept: async () => ({ proposalId: 'proposal_1' }),
    };
    const contentService: IContentServicePort = {
      requestCardSeed: async () => ({ jobIds: [] }),
    };
    const curriculumService: ICurriculumServicePort = {
      requestCurriculumSeed: async () => ({}),
    };
    const eventPublisher: IEventPublisher = {
      publish: async () => undefined,
      publishBatch: async () => undefined,
    };
    const service = new IngestionService(
      repository,
      parser,
      vectorService,
      conceptExtractor,
      knowledgeGraph,
      contentService,
      curriculumService,
      eventPublisher,
      { error: () => undefined } as unknown as Logger
    );

    const result = await service.runJob(repository.job.id, {
      userId: repository.document.userId,
      correlationId: 'cor_999' as never,
      roles: [],
    });
    const context = await service.getDocumentContext(repository.document.id, {
      userId: repository.document.userId,
      correlationId: 'cor_ctx' as never,
      roles: [],
    });

    expect(result.job.stage).toBe(IngestionJobStage.COMPLETED);
    expect(result.chunks).toEqual([]);
    expect(result.concepts).toEqual([]);
    expect(embedded).toBe(0);
    expect(extracted).toBe(0);
    expect(context?.['ocrStatus']).toBe('required');
  });
});
