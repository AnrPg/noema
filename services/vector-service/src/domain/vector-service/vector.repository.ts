import type {
  IVectorChunkEmbeddingInputDto,
  IVectorChunkEmbeddingResultDto,
  IVectorSearchResultDto,
} from '@noema/contracts';
import type { DocumentId, UserId } from '@noema/types';

export interface IVectorRepository {
  ensureCollection(dimensions: number): Promise<void>;
  upsertChunks(
    chunks: IVectorChunkEmbeddingInputDto[],
    embeddings: { vectorId: string; vector: number[]; model: string }[]
  ): Promise<IVectorChunkEmbeddingResultDto[]>;
  search(input: {
    queryVector: number[];
    userId?: UserId | undefined;
    documentIds?: DocumentId[] | undefined;
    limit: number;
  }): Promise<IVectorSearchResultDto[]>;
}
