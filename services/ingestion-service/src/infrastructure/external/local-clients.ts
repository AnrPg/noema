import type {
  IConceptCandidateDto,
  IDocumentChunkDto,
  IVectorChunkEmbeddingInputDto,
  IVectorChunkEmbeddingResultDto,
  IVectorSearchResultDto,
} from '@noema/contracts';
import type { CurriculumId, NodeId, UserId } from '@noema/types';
import { ID_PREFIXES } from '@noema/types';
import { nanoid } from 'nanoid';
import type {
  IConceptExtractorPort,
  IContentServicePort,
  ICurriculumServicePort,
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

export class HeuristicConceptExtractorClient implements IConceptExtractorPort {
  extract(input: { chunks: IDocumentChunkDto[] }): Promise<
    {
      label: string;
      definition?: string | undefined;
      evidenceChunkIds: string[];
      salience: number;
    }[]
  > {
    const candidates = new Map<
      string,
      { label: string; evidenceChunkIds: string[]; salience: number }
    >();
    for (const chunk of input.chunks) {
      const titleCase = chunk.text.match(/\b[A-Z][a-zA-Z]{3,}(?:\s+[A-Z][a-zA-Z]{3,})?\b/g) ?? [];
      const repeatedTerms = importantTerms(chunk.text);
      for (const raw of [...titleCase.slice(0, 8), ...repeatedTerms.slice(0, 8)]) {
        const label = raw.trim();
        if (label.length < 4) continue;
        const current = candidates.get(label) ?? { label, evidenceChunkIds: [], salience: 0.45 };
        current.evidenceChunkIds.push(chunk.id);
        current.salience = Math.min(0.98, current.salience + 0.08);
        candidates.set(label, current);
      }
    }
    if (candidates.size === 0 && input.chunks[0] !== undefined) {
      candidates.set('Document concept', {
        label: 'Document concept',
        evidenceChunkIds: [input.chunks[0].id],
        salience: 0.5,
      });
    }
    return Promise.resolve(
      Array.from(candidates.values()).map((candidate) => ({
        ...candidate,
        evidenceChunkIds: Array.from(new Set(candidate.evidenceChunkIds)),
      }))
    );
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
      nodeId: `${ID_PREFIXES.NodeId}${nanoid(21)}` as NodeId,
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

function importantTerms(text: string): string[] {
  const counts = new Map<string, number>();
  for (const word of text.toLowerCase().split(/[^\p{L}\p{N}-]+/gu)) {
    if (word.length < 7) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort((left, right) => right[1] - left[1])
    .map(([word]) => word);
}
