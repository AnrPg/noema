import type { DocumentChunkId, DocumentId, UserId } from '@noema/types';

export interface IVectorChunkEmbeddingInputDto {
  chunkId: DocumentChunkId;
  documentId: DocumentId;
  userId: UserId;
  text: string;
  headingPath?: string[] | undefined;
  pageRef?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface IVectorEmbeddingDto {
  id: string;
  vector: number[];
  dimensions: number;
  model: string;
}

export interface IVectorChunkEmbeddingResultDto {
  chunkId: DocumentChunkId;
  documentId: DocumentId;
  vectorId: string;
  dimensions: number;
  model: string;
}

export interface IVectorSearchInputDto {
  query: string;
  userId?: UserId | undefined;
  documentIds?: DocumentId[] | undefined;
  limit?: number | undefined;
}

export interface IVectorSearchResultDto {
  chunkId: DocumentChunkId;
  documentId: DocumentId;
  userId: UserId;
  score: number;
  text: string;
  headingPath: string[];
  pageRef?: string | undefined;
  metadata: Record<string, unknown>;
}
