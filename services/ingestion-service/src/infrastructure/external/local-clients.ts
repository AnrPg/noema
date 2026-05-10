import type {
  IConceptCandidateDto,
  IDocumentChunkDto,
  IDocumentDto,
  IDocumentIrDto,
  IVectorChunkEmbeddingInputDto,
  IVectorChunkEmbeddingResultDto,
  IVectorSearchResultDto,
} from '@noema/contracts';
import type { CurriculumId, NodeId, UserId } from '@noema/types';
import type {
  IConceptExtractorPort,
  IContentServicePort,
  ICurriculumServicePort,
  IExtractionScanWindow,
  IKnowledgeGraphPort,
  IVectorServicePort,
} from '../../domain/ingestion-service/external-ports.js';

export class HttpVectorServiceClient implements IVectorServicePort {
  constructor(private readonly baseUrl: string) {}

  async embedChunks(chunks: IDocumentChunkDto[]): Promise<IDocumentChunkDto[]> {
    const payload: IVectorChunkEmbeddingInputDto[] = chunks.map((chunk) => ({
      chunkId: chunk.id,
      documentId: chunk.documentId,
      userId: chunk.userId,
      text: chunk.text,
      headingPath: chunk.headingPath,
      ...(chunk.pageRef !== undefined ? { pageRef: chunk.pageRef } : {}),
      metadata: chunk.metadata,
    }));
    const response = await fetch(`${this.baseUrl.replace(/\/+$/, '')}/v1/embeddings/chunks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chunks: payload }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      data?: IVectorChunkEmbeddingResultDto[];
      error?: { message?: string };
    };
    if (!response.ok) throw new Error(body.error?.message ?? 'Vector chunk embedding failed.');
    const byChunk = new Map((body.data ?? []).map((item) => [item.chunkId, item.vectorId]));
    return chunks.map((chunk) => ({
      ...chunk,
      ...(byChunk.get(chunk.id) !== undefined ? { vectorId: byChunk.get(chunk.id) } : {}),
    }));
  }

  async query(input: {
    userId: UserId;
    documentIds?: string[] | undefined;
    query: string;
    limit: number;
  }): Promise<IVectorSearchResultDto[]> {
    const response = await fetch(`${this.baseUrl.replace(/\/+$/, '')}/v1/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    const body = (await response.json().catch(() => ({}))) as {
      data?: IVectorSearchResultDto[];
      error?: { message?: string };
    };
    if (!response.ok) throw new Error(body.error?.message ?? 'Vector retrieval failed.');
    return body.data ?? [];
  }
}

export class HttpIngestionConceptExtractionAgentClient implements IConceptExtractorPort {
  constructor(
    private readonly baseUrl: string,
    private readonly serviceToken: string | undefined
  ) {}

  async extract(input: {
    userId: UserId;
    document: IDocumentDto;
    ir: IDocumentIrDto;
    chunks: IDocumentChunkDto[];
    scanWindows: IExtractionScanWindow[];
    intent: 'parse_only' | 'derive_curriculum' | 'seed_cards' | 'both';
    curriculumId?: CurriculumId | undefined;
    studyMode?: string | undefined;
  }): Promise<{
    documentSummary: Record<string, unknown>;
    sectionSummaries: { sectionPath: string[]; summary: string }[];
    conceptCandidates: {
      label: string;
      definition?: string | undefined;
      evidenceChunkIds: string[];
      salience: number;
      confidence: number;
      state?: string | undefined;
      rationale?: string | undefined;
    }[];
    mappingSuggestions: {
      label: string;
      candidateNodeIds: string[];
      decision: string;
      confidence: number;
      reason: string;
      requiresUserApproval: boolean;
    }[];
    handoffRecommendations: {
      target: string;
      allowed: boolean;
      reason: string;
      payload?: Record<string, unknown> | undefined;
    }[];
    parseWarnings?: { code: string; message: string }[];
    groundingReport?: Record<string, unknown>;
  }> {
    const response = await fetch(
      `${this.baseUrl.replace(/\/+$/, '')}/v1/agents/ingestion-concept-extraction-agent/run`,
      {
        method: 'POST',
        headers: buildHeaders(this.serviceToken, input.userId),
        body: JSON.stringify({
          userId: input.userId,
          curriculumId: input.curriculumId,
          documentIds: [input.document.id],
          studyMode: input.studyMode,
          executionPreference: 'realtime',
          payload: {
            documentId: input.document.id,
            intent: input.intent,
            document: input.document,
            ir: input.ir,
            chunks: input.chunks,
            scanWindows: input.scanWindows,
          },
        }),
      }
    );
    const body = (await response.json().catch(() => ({}))) as {
      data?: { execution?: { result?: Record<string, unknown> } };
      detail?: string;
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(body.detail ?? body.error?.message ?? 'Ingestion concept extraction failed.');
    }
    const result = body.data?.execution?.result;
    if (result === undefined) {
      throw new Error('Ingestion concept extraction agent returned no result payload.');
    }
    return {
      documentSummary: (result['documentSummary'] as Record<string, unknown> | undefined) ?? {},
      sectionSummaries:
        (result['sectionSummaries'] as { sectionPath: string[]; summary: string }[] | undefined) ??
        [],
      conceptCandidates:
        (result['conceptCandidates'] as {
          label: string;
          definition?: string | undefined;
          evidenceChunkIds: string[];
          salience: number;
          confidence: number;
          state?: string | undefined;
          rationale?: string | undefined;
        }[] | undefined) ?? [],
      mappingSuggestions:
        (result['mappingSuggestions'] as {
          label: string;
          candidateNodeIds: string[];
          decision: string;
          confidence: number;
          reason: string;
          requiresUserApproval: boolean;
        }[] | undefined) ?? [],
      handoffRecommendations:
        (result['handoffRecommendations'] as {
          target: string;
          allowed: boolean;
          reason: string;
          payload?: Record<string, unknown> | undefined;
        }[] | undefined) ?? [],
      parseWarnings:
        (result['parseWarnings'] as { code: string; message: string }[] | undefined) ?? [],
      groundingReport:
        (result['groundingReport'] as Record<string, unknown> | undefined) ?? {},
    };
  }
}

export class HttpKnowledgeGraphClient implements IKnowledgeGraphPort {
  constructor(
    private readonly baseUrl: string,
    private readonly serviceToken: string | undefined
  ) {}

  async mapConcept(
    candidate: IConceptCandidateDto
  ): Promise<{ nodeId?: NodeId | undefined; confidence: number }> {
    const response = await fetch(`${this.baseUrl.replace(/\/+$/, '')}/v1/ckg/concepts/match`, {
      method: 'POST',
      headers: buildHeaders(this.serviceToken, candidate.userId),
      body: JSON.stringify({ label: candidate.label, definition: candidate.definition }),
    }).catch(() => undefined);
    if (response?.ok !== true) return { confidence: 0 };
    const body = (await response.json().catch(() => ({}))) as {
      data?: { nodeId?: string; confidence?: number };
    };
    const nodeId = body.data?.nodeId;
    return {
      ...(nodeId !== undefined ? { nodeId: nodeId as NodeId } : {}),
      confidence: body.data?.confidence ?? 0,
    };
  }

  async proposeConcept(
    candidate: IConceptCandidateDto
  ): Promise<{ nodeId?: NodeId | undefined; proposalId: string }> {
    const response = await fetch(`${this.baseUrl.replace(/\/+$/, '')}/v1/ckg/concepts/proposals`, {
      method: 'POST',
      headers: buildHeaders(this.serviceToken, candidate.userId),
      body: JSON.stringify({
        label: candidate.label,
        definition: candidate.definition,
        evidenceChunkIds: candidate.evidenceChunkIds,
        sourceDocumentId: candidate.documentId,
      }),
    }).catch(() => undefined);
    if (response?.ok === true) {
      const body = (await response.json().catch(() => ({}))) as {
        data?: { id?: string; nodeId?: string };
      };
      return {
        proposalId: body.data?.id ?? `proposal_${candidate.id}`,
        ...(body.data?.nodeId !== undefined ? { nodeId: body.data.nodeId as NodeId } : {}),
      };
    }
    return {
      proposalId: `proposal_${candidate.id}`,
    };
  }
}

export class HttpContentServiceClient implements IContentServicePort {
  constructor(
    private readonly baseUrl: string,
    private readonly serviceToken: string | undefined
  ) {}

  async requestCardSeed(
    input: Parameters<IContentServicePort['requestCardSeed']>[0]
  ): Promise<{ jobIds: string[] }> {
    const response = await fetch(`${this.baseUrl.replace(/\/+$/, '')}/v1/content/generation-jobs`, {
      method: 'POST',
      headers: buildHeaders(this.serviceToken, input.userId),
      body: JSON.stringify({
        mode: 'rag_grounded',
        documentIds: [input.document.id],
        conceptCandidates: input.candidates,
        curriculumId: input.curriculumId,
      }),
    }).catch(() => undefined);
    if (response?.ok === true) {
      const body = (await response.json().catch(() => ({}))) as { data?: { id?: string } };
      return { jobIds: body.data?.id !== undefined ? [body.data.id] : [] };
    }
    return { jobIds: [] };
  }
}

export class HttpCurriculumServiceClient implements ICurriculumServicePort {
  constructor(
    private readonly baseUrl: string,
    private readonly serviceToken: string | undefined
  ) {}

  async requestCurriculumSeed(
    input: Parameters<ICurriculumServicePort['requestCurriculumSeed']>[0]
  ): Promise<{
    curriculumId?: CurriculumId | undefined;
    context?: Record<string, unknown> | undefined;
  }> {
    const rootConceptIds = input.concepts
      .map((candidate) => candidate.ckgNodeId ?? candidate.proposedNodeId)
      .filter((id): id is NodeId => id !== undefined);
    const response = await fetch(`${this.baseUrl.replace(/\/+$/, '')}/v1/curricula/generate`, {
      method: 'POST',
      headers: buildHeaders(this.serviceToken, input.userId),
      body: JSON.stringify({
        title: input.document.title,
        goal: `Learn from ${input.document.title}`,
        domain: 'document',
        rootConceptIds,
        sourceDocumentIds: [input.document.id],
      }),
    }).catch(() => undefined);
    if (response?.ok !== true) return {};
    const body = (await response.json().catch(() => ({}))) as {
      data?: { id?: string; activeVersionId?: string };
    };
    return {
      ...(body.data?.id !== undefined ? { curriculumId: body.data.id as CurriculumId } : {}),
      ...(body.data !== undefined ? { context: body.data as Record<string, unknown> } : {}),
    };
  }
}

function buildHeaders(serviceToken: string | undefined, userId: string): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-user-id': userId,
  };
  if (serviceToken !== undefined && serviceToken.trim().length > 0) {
    headers['authorization'] = `Bearer ${serviceToken}`;
  }
  return headers;
}
