import { RetrievalQueryInputSchema } from '@noema/validation';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { IVectorChunkEmbeddingInputDto, IVectorSearchInputDto } from '@noema/contracts';
import type { VectorService } from '../../domain/vector-service/vector.service.js';

const ChunkEmbeddingInputSchema = z.object({
  chunks: z.array(
    z.object({
      chunkId: z.string(),
      documentId: z.string(),
      userId: z.string(),
      text: z.string().min(1),
      headingPath: z.array(z.string()).optional(),
      pageRef: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    })
  ),
});

const EmbedTextInputSchema = z.object({
  text: z.string().min(1),
});

export function registerVectorRoutes(fastify: FastifyInstance, service: VectorService): void {
  fastify.post('/v1/embeddings/text', async (request, reply) => {
    const input = EmbedTextInputSchema.parse(request.body);
    await reply.send({ data: service.embedText(input.text) });
  });

  fastify.post('/v1/embeddings/chunks', async (request, reply) => {
    const input = ChunkEmbeddingInputSchema.parse(request.body);
    await reply.status(202).send({
      data: await service.embedChunks(input.chunks as IVectorChunkEmbeddingInputDto[]),
    });
  });

  fastify.post('/v1/search', async (request, reply) => {
    const input = RetrievalQueryInputSchema.parse(request.body);
    await reply.send({ data: await service.search(input as IVectorSearchInputDto) });
  });
}
