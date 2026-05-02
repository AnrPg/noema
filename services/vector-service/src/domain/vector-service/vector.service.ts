import type {
  IVectorChunkEmbeddingInputDto,
  IVectorChunkEmbeddingResultDto,
  IVectorEmbeddingDto,
  IVectorSearchInputDto,
  IVectorSearchResultDto,
} from '@noema/contracts';
import { randomUUID } from 'node:crypto';
import type { IEmbeddingModel } from './embedding.js';
import type { IVectorRepository } from './vector.repository.js';

export class VectorService {
  constructor(
    private readonly embeddingModel: IEmbeddingModel,
    private readonly repository: IVectorRepository
  ) {}

  embedText(text: string): IVectorEmbeddingDto {
    const vector = this.embeddingModel.embed(text);
    return {
      id: `vec_${randomUUID().replace(/-/g, '').slice(0, 21)}`,
      vector,
      dimensions: this.embeddingModel.dimensions,
      model: this.embeddingModel.model,
    };
  }

  async embedChunks(
    chunks: IVectorChunkEmbeddingInputDto[]
  ): Promise<IVectorChunkEmbeddingResultDto[]> {
    await this.repository.ensureCollection(this.embeddingModel.dimensions);
    const embeddings = chunks.map((chunk) => ({
      vectorId: `vec_${chunk.chunkId}`,
      vector: this.embeddingModel.embed(chunk.text),
      model: this.embeddingModel.model,
    }));
    return this.repository.upsertChunks(chunks, embeddings);
  }

  async search(input: IVectorSearchInputDto): Promise<IVectorSearchResultDto[]> {
    await this.repository.ensureCollection(this.embeddingModel.dimensions);
    const queryVector = this.embeddingModel.embed(input.query);
    return this.repository.search({
      queryVector,
      userId: input.userId,
      documentIds: input.documentIds,
      limit: input.limit ?? 8,
    });
  }
}
