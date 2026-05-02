import type {
  IVectorChunkEmbeddingInputDto,
  IVectorChunkEmbeddingResultDto,
  IVectorSearchResultDto,
} from '@noema/contracts';
import type { DocumentId, UserId } from '@noema/types';
import { cosineSimilarity } from '../../domain/vector-service/embedding.js';
import type { IVectorRepository } from '../../domain/vector-service/vector.repository.js';

interface IStoredVector {
  id: string;
  vector: number[];
  payload: {
    chunkId: string;
    documentId: string;
    userId: string;
    text: string;
    headingPath: string[];
    pageRef?: string | undefined;
    metadata: Record<string, unknown>;
  };
}

interface IQdrantSearchPoint {
  id: string;
  score: number;
  payload?: IStoredVector['payload'];
}

export class QdrantVectorRepository implements IVectorRepository {
  private readonly memoryStore = new Map<string, IStoredVector>();
  private collectionReady = false;

  constructor(
    private readonly qdrantUrl: string,
    private readonly collectionName: string
  ) {}

  async ensureCollection(dimensions: number): Promise<void> {
    if (this.collectionReady) return;
    const response = await fetch(`${this.qdrantUrl}/collections/${this.collectionName}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ vectors: { size: dimensions, distance: 'Cosine' } }),
    }).catch(() => undefined);
    this.collectionReady = response === undefined || response.ok;
  }

  async upsertChunks(
    chunks: IVectorChunkEmbeddingInputDto[],
    embeddings: { vectorId: string; vector: number[]; model: string }[]
  ): Promise<IVectorChunkEmbeddingResultDto[]> {
    const stored = chunks.map((chunk, index): IStoredVector => {
      const embedding = embeddings[index];
      if (embedding === undefined) throw new Error(`Missing embedding for chunk ${chunk.chunkId}`);
      return {
        id: embedding.vectorId,
        vector: embedding.vector,
        payload: {
          chunkId: chunk.chunkId,
          documentId: chunk.documentId,
          userId: chunk.userId,
          text: chunk.text,
          headingPath: chunk.headingPath ?? [],
          ...(chunk.pageRef !== undefined ? { pageRef: chunk.pageRef } : {}),
          metadata: chunk.metadata ?? {},
        },
      };
    });

    for (const point of stored) this.memoryStore.set(point.id, point);

    const response = await fetch(
      `${this.qdrantUrl}/collections/${this.collectionName}/points?wait=true`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          points: stored.map((point) => ({
            id: point.id,
            vector: point.vector,
            payload: point.payload,
          })),
        }),
      }
    ).catch(() => undefined);
    if (response !== undefined && !response.ok) {
      throw new Error(`Qdrant upsert failed with status ${String(response.status)}`);
    }

    return chunks.map((chunk, index) => {
      const embedding = embeddings[index];
      if (embedding === undefined) throw new Error(`Missing embedding for chunk ${chunk.chunkId}`);
      return {
        chunkId: chunk.chunkId,
        documentId: chunk.documentId,
        vectorId: embedding.vectorId,
        dimensions: embedding.vector.length,
        model: embedding.model,
      };
    });
  }

  async search(input: {
    queryVector: number[];
    userId?: UserId | undefined;
    documentIds?: DocumentId[] | undefined;
    limit: number;
  }): Promise<IVectorSearchResultDto[]> {
    const response = await fetch(
      `${this.qdrantUrl}/collections/${this.collectionName}/points/search`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          vector: input.queryVector,
          limit: input.limit,
          with_payload: true,
          filter: buildFilter(input.userId, input.documentIds),
        }),
      }
    ).catch(() => undefined);
    if (response?.ok === true) {
      const body = (await response.json()) as { result?: IQdrantSearchPoint[] };
      return (body.result ?? [])
        .map((point) => toSearchResult(point))
        .filter((item): item is IVectorSearchResultDto => item !== undefined);
    }
    return [...this.memoryStore.values()]
      .filter((point) => matches(point, input.userId, input.documentIds))
      .map((point) => ({ point, score: cosineSimilarity(input.queryVector, point.vector) }))
      .sort((left, right) => right.score - left.score)
      .slice(0, input.limit)
      .map(({ point, score }) => toSearchResult({ id: point.id, score, payload: point.payload }))
      .filter((item): item is IVectorSearchResultDto => item !== undefined);
  }
}

function buildFilter(
  userId?: UserId,
  documentIds?: DocumentId[]
): Record<string, unknown> | undefined {
  const must: Record<string, unknown>[] = [];
  if (userId !== undefined) must.push({ key: 'userId', match: { value: userId } });
  if (documentIds !== undefined && documentIds.length > 0) {
    must.push({ key: 'documentId', match: { any: documentIds } });
  }
  return must.length > 0 ? { must } : undefined;
}

function matches(point: IStoredVector, userId?: UserId, documentIds?: DocumentId[]): boolean {
  if (userId !== undefined && point.payload.userId !== userId) return false;
  if (documentIds !== undefined && documentIds.length > 0) {
    return documentIds.includes(point.payload.documentId as DocumentId);
  }
  return true;
}

function toSearchResult(point: IQdrantSearchPoint): IVectorSearchResultDto | undefined {
  if (point.payload === undefined) return undefined;
  return {
    chunkId: point.payload.chunkId as IVectorSearchResultDto['chunkId'],
    documentId: point.payload.documentId as IVectorSearchResultDto['documentId'],
    userId: point.payload.userId as IVectorSearchResultDto['userId'],
    score: point.score,
    text: point.payload.text,
    headingPath: point.payload.headingPath,
    ...(point.payload.pageRef !== undefined ? { pageRef: point.payload.pageRef } : {}),
    metadata: point.payload.metadata,
  };
}
